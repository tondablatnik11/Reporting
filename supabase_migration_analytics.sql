-- ==========================================
-- ANALYTICS & OPTIMIZATIONS (PICK & PACK)
-- ==========================================

-- 0. LIKP Deliveries table (pro ukládání typu zakázky)
CREATE TABLE IF NOT EXISTS likp_deliveries (
    delivery TEXT PRIMARY KEY,
    shipping_point TEXT,
    category TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN shipping_point IN ('FM21', 'FM22') THEN 'Express'
            WHEN shipping_point = 'FM24' THEN 'OE'
            ELSE 'Normal'
        END
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_likp_shipping_point ON likp_deliveries(shipping_point);
CREATE INDEX IF NOT EXISTS idx_likp_category ON likp_deliveries(category);

-- 1. Indexy pro rychlé vyhledávání
CREATE INDEX IF NOT EXISTS idx_ltap_material ON ltap_picking(material);
CREATE INDEX IF NOT EXISTS idx_ltap_source_bin ON ltap_picking(source_storage_bin);
CREATE INDEX IF NOT EXISTS idx_ltap_confirmed_at ON ltap_picking(confirmed_at);
CREATE INDEX IF NOT EXISTS idx_vekp_packaging_material ON vekp_packing_headers(packaging_material);
CREATE INDEX IF NOT EXISTS idx_vekp_packed_at ON vekp_packing_headers(packed_at);

-- 2. Funkce pro Pick Analytiku (Agregace podle materiálu)
-- Vrací Top materiály (pokud search_term je prázdný) nebo konkrétní materiál
-- BUG 4 FIX: Používá separator '-' v concatenation pro správné počítání unikátních TO
CREATE OR REPLACE FUNCTION get_pick_material_stats(p_search_term TEXT DEFAULT '')
RETURNS TABLE (
    material TEXT,
    total_tos BIGINT,
    total_qty NUMERIC,
    top_bins JSONB
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH filtered_picks AS (
        SELECT 
            lp.material,
            lp.tanum,
            lp.tapos,
            lp.dest_target_qty,
            lp.source_storage_bin
        FROM ltap_picking lp
        WHERE lp.material IS NOT NULL
          AND (p_search_term = '' OR lp.material ILIKE '%' || p_search_term || '%')
    ),
    material_totals AS (
        SELECT 
            fp.material,
            COUNT(DISTINCT fp.tanum || '-' || fp.tapos) as total_tos,
            COALESCE(SUM(fp.dest_target_qty), 0) as total_qty
        FROM filtered_picks fp
        GROUP BY fp.material
        ORDER BY total_tos DESC
        LIMIT 50
    ),
    bin_stats AS (
        SELECT 
            fp.material,
            fp.source_storage_bin,
            COUNT(DISTINCT fp.tanum || '-' || fp.tapos) as bin_tos
        FROM filtered_picks fp
        JOIN material_totals mt ON fp.material = mt.material
        WHERE fp.source_storage_bin IS NOT NULL AND fp.source_storage_bin != ''
        GROUP BY fp.material, fp.source_storage_bin
    ),
    top_bins_ranked AS (
        SELECT 
            bs.material,
            bs.source_storage_bin,
            bs.bin_tos,
            ROW_NUMBER() OVER (PARTITION BY bs.material ORDER BY bs.bin_tos DESC) as rn
        FROM bin_stats bs
    ),
    top_bins_json AS (
        SELECT 
            tbr.material,
            jsonb_agg(
                jsonb_build_object(
                    'bin', tbr.source_storage_bin,
                    'tos', tbr.bin_tos
                ) ORDER BY tbr.bin_tos DESC
            ) as bins
        FROM top_bins_ranked tbr
        WHERE tbr.rn <= 10
        GROUP BY tbr.material
    )
    SELECT 
        mt.material,
        mt.total_tos,
        mt.total_qty,
        COALESCE(tbj.bins, '[]'::jsonb) as top_bins
    FROM material_totals mt
    LEFT JOIN top_bins_json tbj ON mt.material = tbj.material
    ORDER BY mt.total_tos DESC;
END;
$$;

-- 3. Funkce pro Pack Analytiku (Agregace obalů v čase)
-- Nyní s volitelným datumovým filtrem
CREATE OR REPLACE FUNCTION get_pack_material_stats(
    p_search_term TEXT DEFAULT '',
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
    packaging_material TEXT,
    packed_date DATE,
    total_hus BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.packaging_material,
        DATE(v.packed_at) as packed_date,
        COUNT(DISTINCT v.internal_hu_number) as total_hus
    FROM vekp_packing_headers v
    WHERE v.packaging_material IS NOT NULL
      AND v.packaging_material != ''
      AND (p_search_term = '' OR v.packaging_material ILIKE '%' || p_search_term || '%')
      AND (p_date_from IS NULL OR DATE(v.packed_at) >= p_date_from)
      AND (p_date_to IS NULL OR DATE(v.packed_at) <= p_date_to)
    GROUP BY v.packaging_material, DATE(v.packed_at)
    ORDER BY DATE(v.packed_at) ASC, total_hus DESC;
END;
$$;

-- 4. Funkce pro Delivery Analytiku (kompletní přehled jedné dodávky)
CREATE OR REPLACE FUNCTION get_delivery_detail(p_search_term TEXT DEFAULT '')
RETURNS TABLE (
    delivery TEXT,
    shipping_point TEXT,
    category TEXT,
    carrier TEXT,
    pick_tos BIGINT,
    pick_qty NUMERIC,
    pick_weight NUMERIC,
    pick_operators JSONB,
    pick_bins JSONB,
    pack_hus BIGINT,
    pack_weight NUMERIC,
    pack_operators JSONB,
    pack_materials JSONB,
    first_pick_at TIMESTAMPTZ,
    last_pick_at TIMESTAMPTZ,
    first_pack_at TIMESTAMPTZ,
    last_pack_at TIMESTAMPTZ
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH deliveries AS (
        -- Najít dodávky podle hledaného výrazu
        SELECT DISTINCT d.delivery as del
        FROM (
            SELECT lp.delivery FROM ltap_picking lp 
            WHERE lp.delivery IS NOT NULL AND lp.delivery != ''
              AND (p_search_term = '' OR lp.delivery ILIKE '%' || p_search_term || '%')
            UNION
            SELECT vh.delivery FROM vekp_packing_headers vh
            WHERE vh.delivery IS NOT NULL AND vh.delivery != ''
              AND (p_search_term = '' OR vh.delivery ILIKE '%' || p_search_term || '%')
        ) d
        LIMIT 50
    ),
    pick_stats AS (
        SELECT 
            lp.delivery,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) as tos,
            COALESCE(SUM(lp.dest_target_qty), 0) as qty,
            COALESCE(SUM(lp.weight), 0) as wt,
            jsonb_agg(DISTINCT lp.picker_sap_id) FILTER (WHERE lp.picker_sap_id IS NOT NULL AND lp.picker_sap_id != '') as operators,
            jsonb_agg(DISTINCT lp.source_storage_bin) FILTER (WHERE lp.source_storage_bin IS NOT NULL AND lp.source_storage_bin != '') as bins,
            MIN(lp.confirmed_at) as first_at,
            MAX(lp.confirmed_at) as last_at
        FROM ltap_picking lp
        JOIN deliveries d ON lp.delivery = d.del
        GROUP BY lp.delivery
    ),
    pack_stats AS (
        SELECT 
            vh.delivery,
            COUNT(DISTINCT vh.internal_hu_number) as hus,
            COALESCE(SUM(vh.total_weight), 0) as wt,
            jsonb_agg(DISTINCT vh.packer_sap_id) FILTER (WHERE vh.packer_sap_id IS NOT NULL AND vh.packer_sap_id != '') as operators,
            jsonb_agg(DISTINCT vh.packaging_material) FILTER (WHERE vh.packaging_material IS NOT NULL AND vh.packaging_material != '') as materials,
            MIN(vh.packed_at) as first_at,
            MAX(vh.packed_at) as last_at
        FROM vekp_packing_headers vh
        JOIN deliveries d ON vh.delivery = d.del
        GROUP BY vh.delivery
    )
    SELECT 
        d.del as delivery,
        COALESCE(ld.shipping_point, '') as shipping_point,
        COALESCE(ld.category, 'Normal') as category,
        COALESCE(ld.carrier, '') as carrier,
        COALESCE(ps.tos, 0) as pick_tos,
        COALESCE(ps.qty, 0) as pick_qty,
        COALESCE(ps.wt, 0) as pick_weight,
        COALESCE(ps.operators, '[]'::jsonb) as pick_operators,
        COALESCE(ps.bins, '[]'::jsonb) as pick_bins,
        COALESCE(pks.hus, 0) as pack_hus,
        COALESCE(pks.wt, 0) as pack_weight,
        COALESCE(pks.operators, '[]'::jsonb) as pack_operators,
        COALESCE(pks.materials, '[]'::jsonb) as pack_materials,
        ps.first_at as first_pick_at,
        ps.last_at as last_pick_at,
        pks.first_at as first_pack_at,
        pks.last_at as last_pack_at
    FROM deliveries d
    LEFT JOIN likp_deliveries ld ON d.del = ld.delivery
    LEFT JOIN pick_stats ps ON d.del = ps.delivery
    LEFT JOIN pack_stats pks ON d.del = pks.delivery
    ORDER BY COALESCE(ps.tos, 0) + COALESCE(pks.hus, 0) DESC;
END;
$$;

-- 5. Funkce pro Predikce (denní historická data pro trend analýzu)
CREATE OR REPLACE FUNCTION get_daily_history()
RETURNS TABLE (
    day DATE,
    day_of_week INT,
    pick_tos BIGINT,
    pick_qty NUMERIC,
    pack_hus BIGINT,
    cat_normal_tos BIGINT,
    cat_express_tos BIGINT,
    cat_oe_tos BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH pick_daily AS (
        SELECT 
            DATE(lp.confirmed_at) as d,
            EXTRACT(DOW FROM lp.confirmed_at)::INT as dow,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) as tos,
            COALESCE(SUM(lp.dest_target_qty), 0) as qty
        FROM ltap_picking lp
        WHERE lp.confirmed_at IS NOT NULL
        GROUP BY DATE(lp.confirmed_at), EXTRACT(DOW FROM lp.confirmed_at)::INT
    ),
    pack_daily AS (
        SELECT 
            DATE(vh.packed_at) as d,
            COUNT(DISTINCT vh.internal_hu_number) as hus
        FROM vekp_packing_headers vh
        WHERE vh.packed_at IS NOT NULL
        GROUP BY DATE(vh.packed_at)
    ),
    category_daily AS (
        SELECT 
            DATE(lp.confirmed_at) as d,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) FILTER (
                WHERE COALESCE(ld.category, 'Normal') = 'Normal'
            ) as normal_tos,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) FILTER (
                WHERE ld.category = 'Express'
            ) as express_tos,
            COUNT(DISTINCT lp.tanum || '-' || lp.tapos) FILTER (
                WHERE ld.category = 'OE'
            ) as oe_tos
        FROM ltap_picking lp
        LEFT JOIN likp_deliveries ld ON lp.delivery = ld.delivery
        WHERE lp.confirmed_at IS NOT NULL
        GROUP BY DATE(lp.confirmed_at)
    )
    SELECT 
        pd.d as day,
        pd.dow as day_of_week,
        pd.tos as pick_tos,
        pd.qty as pick_qty,
        COALESCE(pkd.hus, 0) as pack_hus,
        COALESCE(cd.normal_tos, 0) as cat_normal_tos,
        COALESCE(cd.express_tos, 0) as cat_express_tos,
        COALESCE(cd.oe_tos, 0) as cat_oe_tos
    FROM pick_daily pd
    LEFT JOIN pack_daily pkd ON pd.d = pkd.d
    LEFT JOIN category_daily cd ON pd.d = cd.d
    ORDER BY pd.d ASC;
END;
$$;
