-- ==========================================
-- DATA CUBE (Phase 3.2)
-- ==========================================

-- 1. Helper Function: Zjištění směny podle času (Ranní / Odpolední)
CREATE OR REPLACE FUNCTION get_shift_from_time(p_time TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE 
        WHEN p_time::time >= '05:45:00'::time AND p_time::time < '13:45:00'::time THEN 'Ranní'
        WHEN p_time::time >= '13:45:00'::time AND p_time::time < '21:45:00'::time THEN 'Odpolední'
        ELSE 'Mimo směnu'
    END;
$$;

-- 2. Daily Summary (Základní denní výkon a mix)
DROP FUNCTION IF EXISTS get_daily_summary();
CREATE OR REPLACE FUNCTION get_daily_summary()
RETURNS TABLE (
    report_date DATE,
    day_of_week INT,
    pick_tos BIGINT,
    pick_qty NUMERIC,
    pack_hus BIGINT,
    pack_qty NUMERIC,
    normal_tos BIGINT,
    express_tos BIGINT,
    oe_tos BIGINT,
    normal_hus BIGINT,
    express_hus BIGINT,
    oe_hus BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH pick_daily AS (
        SELECT 
            DATE(lp.confirmed_at) as d,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) as tos,
            COALESCE(SUM(lp.dest_target_qty), 0) as qty,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) FILTER (WHERE COALESCE(ld.category, 'Normal') = 'Normal') as norm_tos,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) FILTER (WHERE ld.category = 'Express') as exp_tos,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) FILTER (WHERE ld.category = 'OE') as o_tos
        FROM ltap_picking lp
        LEFT JOIN likp_deliveries ld ON lp.delivery = ld.delivery
        WHERE lp.confirmed_at IS NOT NULL
        GROUP BY DATE(lp.confirmed_at)
    ),
    pack_daily AS (
        SELECT 
            DATE(vh.packed_at) as d,
            COUNT(DISTINCT vh.internal_hu_number) as hus,
            COALESCE(SUM(vi.packed_quantity), 0) as qty,
            COUNT(DISTINCT vh.internal_hu_number) FILTER (WHERE COALESCE(ld.category, 'Normal') = 'Normal') as norm_hus,
            COUNT(DISTINCT vh.internal_hu_number) FILTER (WHERE ld.category = 'Express') as exp_hus,
            COUNT(DISTINCT vh.internal_hu_number) FILTER (WHERE ld.category = 'OE') as o_hus
        FROM vekp_packing_headers vh
        LEFT JOIN vepo_packing_items vi ON vh.internal_hu_number = vi.internal_hu_number
        LEFT JOIN likp_deliveries ld ON vh.delivery = ld.delivery
        WHERE vh.packed_at IS NOT NULL
        GROUP BY DATE(vh.packed_at)
    )
    SELECT 
        COALESCE(pd.d, pkd.d) as report_date,
        EXTRACT(DOW FROM COALESCE(pd.d, pkd.d))::INT as day_of_week,
        COALESCE(pd.tos, 0) as pick_tos,
        COALESCE(pd.qty, 0) as pick_qty,
        COALESCE(pkd.hus, 0) as pack_hus,
        COALESCE(pkd.qty, 0) as pack_qty,
        COALESCE(pd.norm_tos, 0) as normal_tos,
        COALESCE(pd.exp_tos, 0) as express_tos,
        COALESCE(pd.o_tos, 0) as oe_tos,
        COALESCE(pkd.norm_hus, 0) as normal_hus,
        COALESCE(pkd.exp_hus, 0) as express_hus,
        COALESCE(pkd.o_hus, 0) as oe_hus
    FROM pick_daily pd
    FULL OUTER JOIN pack_daily pkd ON pd.d = pkd.d
    ORDER BY report_date DESC;
END;
$$;

-- 3. Shift Summary (Výkon po směnách)
CREATE OR REPLACE FUNCTION get_shift_summary()
RETURNS TABLE (
    report_date DATE,
    shift_name TEXT,
    pick_tos BIGINT,
    pick_qty NUMERIC,
    pack_hus BIGINT,
    pack_qty NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH pick_shift AS (
        SELECT 
            DATE(lp.confirmed_at) as d,
            get_shift_from_time(lp.confirmed_at) as sft,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) as tos,
            COALESCE(SUM(lp.dest_target_qty), 0) as qty
        FROM ltap_picking lp
        WHERE lp.confirmed_at IS NOT NULL
        GROUP BY DATE(lp.confirmed_at), get_shift_from_time(lp.confirmed_at)
    ),
    pack_shift AS (
        SELECT 
            DATE(vh.packed_at) as d,
            get_shift_from_time(vh.packed_at) as sft,
            COUNT(DISTINCT vh.internal_hu_number) as hus,
            COALESCE(SUM(vi.packed_quantity), 0) as qty
        FROM vekp_packing_headers vh
        LEFT JOIN vepo_packing_items vi ON vh.internal_hu_number = vi.internal_hu_number
        WHERE vh.packed_at IS NOT NULL
        GROUP BY DATE(vh.packed_at), get_shift_from_time(vh.packed_at)
    )
    SELECT 
        COALESCE(ps.d, pks.d) as report_date,
        COALESCE(ps.sft, pks.sft) as shift_name,
        COALESCE(ps.tos, 0) as pick_tos,
        COALESCE(ps.qty, 0) as pick_qty,
        COALESCE(pks.hus, 0) as pack_hus,
        COALESCE(pks.qty, 0) as pack_qty
    FROM pick_shift ps
    FULL OUTER JOIN pack_shift pks ON ps.d = pks.d AND ps.sft = pks.sft
    ORDER BY report_date DESC, shift_name DESC;
END;
$$;

-- 4. Operator Daily Summary (Výkon konkrétních lidí)
CREATE OR REPLACE FUNCTION get_operator_daily_summary()
RETURNS TABLE (
    report_date DATE,
    operator TEXT,
    role TEXT,
    pick_tos BIGINT,
    pick_qty NUMERIC,
    pack_hus BIGINT,
    pack_qty NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH pick_op AS (
        SELECT 
            DATE(lp.confirmed_at) as d,
            lp.picker_sap_id as op,
            'Picker' as op_role,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) as tos,
            COALESCE(SUM(lp.dest_target_qty), 0) as qty
        FROM ltap_picking lp
        WHERE lp.confirmed_at IS NOT NULL AND lp.picker_sap_id IS NOT NULL AND lp.picker_sap_id != ''
        GROUP BY DATE(lp.confirmed_at), lp.picker_sap_id
    ),
    pack_op AS (
        SELECT 
            DATE(vh.packed_at) as d,
            vh.packer_sap_id as op,
            'Packer' as op_role,
            COUNT(DISTINCT vh.internal_hu_number) as hus,
            COALESCE(SUM(vi.packed_quantity), 0) as qty
        FROM vekp_packing_headers vh
        LEFT JOIN vepo_packing_items vi ON vh.internal_hu_number = vi.internal_hu_number
        WHERE vh.packed_at IS NOT NULL AND vh.packer_sap_id IS NOT NULL AND vh.packer_sap_id != ''
        GROUP BY DATE(vh.packed_at), vh.packer_sap_id
    )
    SELECT 
        po.d as report_date,
        po.op as operator,
        po.op_role as role,
        po.tos as pick_tos,
        po.qty as pick_qty,
        0::BIGINT as pack_hus,
        0::NUMERIC as pack_qty
    FROM pick_op po
    UNION ALL
    SELECT 
        pko.d as report_date,
        pko.op as operator,
        pko.op_role as role,
        0::BIGINT as pick_tos,
        0::NUMERIC as pick_qty,
        pko.hus as pack_hus,
        pko.qty as pack_qty
    FROM pack_op pko
    ORDER BY report_date DESC, operator ASC;
END;
$$;
