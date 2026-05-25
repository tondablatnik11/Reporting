-- ==========================================
-- LABOR MANAGEMENT & REPORTING SCHEMAS
-- ==========================================

-- 1. IMPORT AUDIT & ERRORS
CREATE TABLE IF NOT EXISTS import_batches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('LTAP', 'VEKP', 'VEPO')),
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    uploaded_by TEXT,
    report_date DATE,
    total_rows INTEGER DEFAULT 0,
    accepted_rows INTEGER DEFAULT 0,
    rejected_rows INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    error_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint to prevent duplicate file uploads based on hash
ALTER TABLE import_batches ADD CONSTRAINT unique_file_hash UNIQUE (file_hash);

CREATE TABLE IF NOT EXISTS import_errors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    row_number INTEGER,
    raw_payload JSONB,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. OPERATOR WHITELIST
CREATE TABLE IF NOT EXISTS operator_whitelist (
    sap_id TEXT PRIMARY KEY,
    shift_group TEXT,
    active BOOLEAN DEFAULT true,
    process_area TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. SHIFT DEFINITIONS
CREATE TABLE IF NOT EXISTS shift_definitions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true
);

-- Default Shifts
INSERT INTO shift_definitions (name, start_time, end_time, sort_order)
VALUES 
('Ranní', '05:45:00', '13:45:00', 1),
('Odpolední', '13:45:00', '21:45:00', 2)
ON CONFLICT DO NOTHING;

-- 4. CLEAN DATA: LTAP (Picking)
CREATE TABLE IF NOT EXISTS ltap_picking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
    warehouse_number TEXT,
    tanum TEXT NOT NULL,
    tapos TEXT NOT NULL,
    material TEXT,
    plant TEXT,
    base_uom TEXT,
    storage_unit_type TEXT,
    confirmation_date DATE,
    confirmation_time TIME,
    picker_sap_id TEXT, -- Note: Can be NULL or outside whitelist, UI filters it
    weight NUMERIC,
    weight_unit TEXT,
    source_storage_type TEXT,
    source_storage_section TEXT,
    source_storage_bin TEXT,
    source_target_qty NUMERIC,
    source_actual_qty NUMERIC,
    source_bin_difference NUMERIC,
    quant TEXT,
    dest_storage_type TEXT,
    dest_storage_bin TEXT,
    dest_target_qty NUMERIC,
    dest_actual_qty NUMERIC,
    dest_difference_qty NUMERIC,
    source_storage_unit TEXT,
    removal_of_total_su TEXT,
    volume NUMERIC,
    volume_unit TEXT,
    secondary_confirmation_date DATE,
    secondary_confirmation_time TIME,
    secondary_user TEXT,
    handling_unit TEXT,
    delivery TEXT,
    confirmed_at TIMESTAMPTZ,
    secondary_confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for LTAP
CREATE INDEX IF NOT EXISTS idx_ltap_confirmed_at ON ltap_picking(confirmed_at);
CREATE INDEX IF NOT EXISTS idx_ltap_picker ON ltap_picking(picker_sap_id);
CREATE INDEX IF NOT EXISTS idx_ltap_tanum_tapos ON ltap_picking(tanum, tapos);
CREATE INDEX IF NOT EXISTS idx_ltap_delivery ON ltap_picking(delivery);
CREATE INDEX IF NOT EXISTS idx_ltap_source_type ON ltap_picking(source_storage_type);
CREATE INDEX IF NOT EXISTS idx_ltap_dest_type ON ltap_picking(dest_storage_type);

-- Unique constraint for LTAP
ALTER TABLE ltap_picking ADD CONSTRAINT unique_tanum_tapos UNIQUE (tanum, tapos);


-- 5. CLEAN DATA: VEKP (Packing Headers)
CREATE TABLE IF NOT EXISTS vekp_packing_headers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
    internal_hu_number TEXT UNIQUE NOT NULL,
    handling_unit TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ,
    packer_sap_id TEXT,
    packed_at TIMESTAMPTZ,
    packaging_material TEXT,
    packaging_material_type TEXT,
    total_weight NUMERIC,
    weight_unit TEXT,
    total_volume NUMERIC,
    volume_unit TEXT,
    delivery TEXT,
    generated_item TEXT,
    plant TEXT,
    higher_level_hu TEXT,
    external_tracking_id TEXT,
    container_status TEXT,
    movement_status TEXT,
    row_created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for VEKP
CREATE INDEX IF NOT EXISTS idx_vekp_internal_hu ON vekp_packing_headers(internal_hu_number);
CREATE INDEX IF NOT EXISTS idx_vekp_packer ON vekp_packing_headers(packer_sap_id);
CREATE INDEX IF NOT EXISTS idx_vekp_packed_at ON vekp_packing_headers(packed_at);
CREATE INDEX IF NOT EXISTS idx_vekp_delivery ON vekp_packing_headers(delivery);
CREATE INDEX IF NOT EXISTS idx_vekp_pkg_mat ON vekp_packing_headers(packaging_material);

-- 6. CLEAN DATA: VEPO (Packing Items)
CREATE TABLE IF NOT EXISTS vepo_packing_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
    internal_hu_number TEXT REFERENCES vekp_packing_headers(internal_hu_number) ON DELETE CASCADE,
    handling_unit_item TEXT,
    item_type TEXT,
    delivery TEXT,
    item TEXT,
    packed_quantity NUMERIC,
    handling_unit_uom TEXT,
    unit_of_measure TEXT,
    material TEXT,
    plant TEXT,
    storage_location TEXT,
    lower_level_hu TEXT,
    generated_item TEXT,
    sled_bbd DATE,
    batch TEXT,
    stock_category TEXT,
    special_stock TEXT,
    special_stock_number TEXT,
    partner_material TEXT,
    gr_date DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for VEPO
CREATE INDEX IF NOT EXISTS idx_vepo_internal_hu ON vepo_packing_items(internal_hu_number);
CREATE INDEX IF NOT EXISTS idx_vepo_delivery ON vepo_packing_items(delivery);
CREATE INDEX IF NOT EXISTS idx_vepo_material ON vepo_packing_items(material);

-- 7. PERFORMANCE TARGETS
CREATE TABLE IF NOT EXISTS performance_targets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    process_type TEXT NOT NULL CHECK (process_type IN ('picking', 'packing')),
    metric TEXT NOT NULL,
    shift_id UUID REFERENCES shift_definitions(id) ON DELETE CASCADE,
    target_value NUMERIC NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
