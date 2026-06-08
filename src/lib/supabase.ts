import { createClient } from "@supabase/supabase-js";

import { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// ==========================================
// ── VALID POSITIONS
// ==========================================
export const VALID_POSITIONS = [
  // Dům 37
  "13-37-01-01","13-37-01-02","13-37-01-03","13-37-01-04","13-37-01-05","13-37-01-06",
  "13-37-02-01","13-37-02-02","13-37-02-03","13-37-02-04","13-37-02-05","13-37-02-06",
  "13-37-03-01","13-37-03-02","13-37-03-03","13-37-03-04","13-37-03-05","13-37-03-06",
  "13-37-04-01","13-37-04-02","13-37-04-03","13-37-04-04","13-37-04-05","13-37-04-06",
  "13-37-05-01","13-37-05-02","13-37-05-03","13-37-05-04","13-37-05-05","13-37-05-06",
  "13-37-06-01","13-37-06-02","13-37-06-03","13-37-06-04","13-37-06-05","13-37-06-06",
  "13-37-10-01","13-37-10-02","13-37-10-03",
  "13-37-20-01","13-37-20-02","13-37-20-03",
  "13-37-30-01","13-37-30-02","13-37-30-03",
  "13-37-40-01","13-37-40-02","13-37-40-03",
  // Dům 36
  "13-36-01-01","13-36-01-02","13-36-01-03","13-36-01-04","13-36-01-05","13-36-01-06",
  "13-36-02-01","13-36-02-02","13-36-02-03","13-36-02-04","13-36-02-05","13-36-02-06",
  "13-36-03-01","13-36-03-02","13-36-03-03","13-36-03-04","13-36-03-05","13-36-03-06",
  "13-36-04-01","13-36-04-02","13-36-04-03","13-36-04-04","13-36-04-05","13-36-04-06",
  "13-36-05-01","13-36-05-02","13-36-05-03","13-36-05-04","13-36-05-05","13-36-05-06",
  "13-36-06-01","13-36-06-02","13-36-06-03","13-36-06-04","13-36-06-05","13-36-06-06",
] as const;

export type ValidPosition = typeof VALID_POSITIONS[number];

export const TOTAL_POSITIONS = VALID_POSITIONS.length; // 84

// Position groups for visual grid
export const POSITION_GROUPS = [
  // Dům 37
  { label: "Dům 37 řada 01", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-01")) },
  { label: "Dům 37 řada 02", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-02")) },
  { label: "Dům 37 řada 03", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-03")) },
  { label: "Dům 37 řada 04", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-04")) },
  { label: "Dům 37 řada 05", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-05")) },
  { label: "Dům 37 řada 06", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-06")) },
  { label: "Dům 37 řada 10", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-10")) },
  { label: "Dům 37 řada 20", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-20")) },
  { label: "Dům 37 řada 30", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-30")) },
  { label: "Dům 37 řada 40", house: "37", positions: VALID_POSITIONS.filter(p => p.startsWith("13-37-40")) },
  // Dům 36
  { label: "Dům 36 řada 01", house: "36", positions: VALID_POSITIONS.filter(p => p.startsWith("13-36-01")) },
  { label: "Dům 36 řada 02", house: "36", positions: VALID_POSITIONS.filter(p => p.startsWith("13-36-02")) },
  { label: "Dům 36 řada 03", house: "36", positions: VALID_POSITIONS.filter(p => p.startsWith("13-36-03")) },
  { label: "Dům 36 řada 04", house: "36", positions: VALID_POSITIONS.filter(p => p.startsWith("13-36-04")) },
  { label: "Dům 36 řada 05", house: "36", positions: VALID_POSITIONS.filter(p => p.startsWith("13-36-05")) },
  { label: "Dům 36 řada 06", house: "36", positions: VALID_POSITIONS.filter(p => p.startsWith("13-36-06")) },
];

// ==========================================
// ── DIFERENCE
// ==========================================
export type DifferenceRecord = {
  id?: string;
  record_number?: number;
  diff_type: 'CHYBI' | 'PREBYVA';
  detect_date: string;
  detect_time: string;
  shift: string;
  teamleader: string;
  material: string;
  bin_location: string;
  sap_qty: number;
  actual_qty: number;
  source_bin?: string;
  taken_qty?: number;
  checked_others?: boolean;
  checked_other_bins?: boolean;
  other_bin_location?: string;
  other_bin_qty?: number;
  other_bin_matches?: boolean;
  note?: string;
  status?: 'NOVÝ' | 'PROVĚŘOVÁNO' | 'VYŘEŠENO';
  status_changed_by?: string;
  status_changed_at?: string;
  created_at?: string;
  // New fields for storage integration
  storage_bin_used?: string;
  storage_qty_taken?: number;
  storage_bin_stored?: string;
  storage_qty_stored?: number;
};

export async function submitDifference(record: DifferenceRecord) {
  const { data, error } = await supabase.from("differences").insert([record]).select();
  if (error) throw error;
  return data;
}

export async function fetchDifferences() {
  const { data, error } = await supabase
    .from("differences")
    .select("*")
    .order("detect_date", { ascending: false })
    .order("detect_time", { ascending: false });
  if (error) throw error;
  return data as DifferenceRecord[];
}

export async function updateDifferenceStatus(id: string, newStatus: string, changedBy: string) {
  const { error } = await supabase
    .from("differences")
    .update({ 
      status: newStatus, 
      status_changed_by: changedBy,
      status_changed_at: new Date().toISOString()
    })
    .eq('id', id);
  if (error) throw error;
}

export async function updateDifferenceRecord(id: string, updates: Partial<DifferenceRecord>) {
  const { error } = await supabase
    .from("differences")
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

// ==========================================
// ── STORAGE INVENTORY
// ==========================================
export type StorageRecord = {
  id?: string;
  bin_location: string;
  material: string;
  material_name?: string;
  quantity: number;
  created_at?: string;
  updated_at?: string;
};

export type StorageHistoryRecord = {
  id?: string;
  storage_inventory_id?: string;
  bin_location: string;
  material: string;
  material_name?: string;
  action: 'add' | 'remove' | 'import' | 'diff_take' | 'diff_store';
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  difference_id?: string;
  note?: string;
  performed_by?: string;
  created_at?: string;
};

/**
 * Fetch entire storage inventory in a single query.
 * ~48 positions × ~5 materials = max ~240 rows → safe for single load.
 */
export async function fetchStorageInventory(): Promise<StorageRecord[]> {
  const { data, error } = await supabase
    .from("storage_inventory")
    .select("*")
    .order("bin_location", { ascending: true })
    .order("material", { ascending: true });
  if (error) throw error;
  return (data || []) as StorageRecord[];
}

/**
 * Fetch storage history (last 200 records)
 */
export async function fetchStorageHistory(): Promise<StorageHistoryRecord[]> {
  const { data, error } = await supabase
    .from("storage_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as StorageHistoryRecord[];
}

/**
 * Search for a material in storage (client-side filter on cached data).
 * This function works on already-fetched data to avoid extra DB queries.
 */
export function searchStorageMaterial(
  storageData: StorageRecord[],
  partNumber: string
): StorageRecord[] {
  if (!partNumber || partNumber.length < 2) return [];
  const search = partNumber.toUpperCase().trim();
  return storageData.filter(
    (r) => r.material.toUpperCase().includes(search) && r.quantity > 0
  );
}

/**
 * Add material to a storage position (upsert).
 * If the material already exists on that position, quantity is increased.
 */
export async function addToStorage(
  binLocation: string,
  material: string,
  materialName: string | undefined,
  qty: number,
  performedBy?: string,
  note?: string,
  differenceId?: string,
  action: 'add' | 'import' | 'diff_store' = 'add'
): Promise<StorageRecord> {
  // First check if record exists
  const { data: existing } = await supabase
    .from("storage_inventory")
    .select("*")
    .eq("bin_location", binLocation)
    .eq("material", material)
    .maybeSingle();

  const quantityBefore = existing?.quantity || 0;
  const quantityAfter = quantityBefore + qty;

  let result: StorageRecord;

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from("storage_inventory")
      .update({
        quantity: quantityAfter,
        material_name: materialName || existing.material_name,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    result = data as StorageRecord;
  } else {
    // Insert new
    const { data, error } = await supabase
      .from("storage_inventory")
      .insert([{
        bin_location: binLocation,
        material: material.toUpperCase(),
        material_name: materialName || null,
        quantity: qty,
      }])
      .select()
      .single();
    if (error) throw error;
    result = data as StorageRecord;
  }

  // Log history
  await logStorageAction({
    storage_inventory_id: result.id,
    bin_location: binLocation,
    material: material.toUpperCase(),
    material_name: materialName,
    action,
    quantity_change: qty,
    quantity_before: quantityBefore,
    quantity_after: quantityAfter,
    difference_id: differenceId,
    note,
    performed_by: performedBy,
  });

  return result;
}

/**
 * Remove material from a storage position.
 * If qty equals the full amount, the record is deleted.
 */
export async function removeFromStorage(
  binLocation: string,
  material: string,
  qty: number,
  performedBy?: string,
  note?: string,
  differenceId?: string,
  action: 'remove' | 'diff_take' = 'remove'
): Promise<void> {
  // Get current record
  const { data: existing, error: fetchErr } = await supabase
    .from("storage_inventory")
    .select("*")
    .eq("bin_location", binLocation)
    .eq("material", material)
    .single();

  if (fetchErr || !existing) throw new Error("Materiál na této pozici nebyl nalezen.");

  const quantityBefore = existing.quantity;
  if (qty > quantityBefore) throw new Error(`Nelze odebrat ${qty} ks, na pozici je pouze ${quantityBefore} ks.`);

  const quantityAfter = quantityBefore - qty;

  if (quantityAfter === 0) {
    // Delete the record
    const { error } = await supabase
      .from("storage_inventory")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    // Update quantity
    const { error } = await supabase
      .from("storage_inventory")
      .update({ quantity: quantityAfter })
      .eq("id", existing.id);
    if (error) throw error;
  }

  // Log history
  await logStorageAction({
    storage_inventory_id: existing.id,
    bin_location: binLocation,
    material: material.toUpperCase(),
    material_name: existing.material_name,
    action,
    quantity_change: -qty,
    quantity_before: quantityBefore,
    quantity_after: quantityAfter,
    difference_id: differenceId,
    note,
    performed_by: performedBy,
  });
}

/**
 * Bulk import storage records from XLSX.
 * Uses upsert for efficiency (single batch query).
 */
export async function bulkImportStorage(
  records: { bin_location: string; material: string; material_name?: string; quantity: number }[],
  strategy: 'add' | 'overwrite' = 'add',
  performedBy?: string
): Promise<{ success: number; errors: { row: number; reason: string }[] }> {
  const errors: { row: number; reason: string }[] = [];
  const validRecords: typeof records = [];

  // Validate all records first
  records.forEach((r, i) => {
    if (!VALID_POSITIONS.includes(r.bin_location as ValidPosition)) {
      errors.push({ row: i + 1, reason: `Neplatná pozice: ${r.bin_location}` });
      return;
    }
    if (!r.material || r.material.trim() === "") {
      errors.push({ row: i + 1, reason: "Chybí číslo materiálu" });
      return;
    }
    if (!r.quantity || r.quantity <= 0 || !Number.isInteger(r.quantity)) {
      errors.push({ row: i + 1, reason: `Neplatné množství: ${r.quantity}` });
      return;
    }
    validRecords.push({
      ...r,
      material: r.material.toUpperCase().trim(),
      material_name: r.material_name?.trim() || undefined,
    });
  });

  if (validRecords.length === 0) {
    return { success: 0, errors };
  }

  if (strategy === 'overwrite') {
    // Upsert: replace quantity
    const { error } = await supabase
      .from("storage_inventory")
      .upsert(
        validRecords.map(r => ({
          bin_location: r.bin_location,
          material: r.material,
          material_name: r.material_name || null,
          quantity: r.quantity,
        })),
        { onConflict: 'bin_location,material' }
      );
    if (error) throw error;
  } else {
    // Add strategy: fetch existing, compute new quantities, upsert
    const { data: existingData } = await supabase
      .from("storage_inventory")
      .select("bin_location, material, quantity");

    const existingMap = new Map<string, number>();
    (existingData || []).forEach((e: any) => {
      existingMap.set(`${e.bin_location}|${e.material}`, e.quantity);
    });

    const upsertData = validRecords.map(r => {
      const key = `${r.bin_location}|${r.material}`;
      const existingQty = existingMap.get(key) || 0;
      return {
        bin_location: r.bin_location,
        material: r.material,
        material_name: r.material_name || null,
        quantity: existingQty + r.quantity,
      };
    });

    const { error } = await supabase
      .from("storage_inventory")
      .upsert(upsertData, { onConflict: 'bin_location,material' });
    if (error) throw error;
  }

  // Log bulk import history
  for (const r of validRecords) {
    await logStorageAction({
      bin_location: r.bin_location,
      material: r.material,
      material_name: r.material_name,
      action: 'import',
      quantity_change: r.quantity,
      quantity_before: 0,
      quantity_after: r.quantity,
      note: `Import XLSX (${strategy})`,
      performed_by: performedBy,
    });
  }

  return { success: validRecords.length, errors };
}

/**
 * Log a storage action to history table.
 */
async function logStorageAction(record: Omit<StorageHistoryRecord, 'id' | 'created_at'>) {
  try {
    await supabase.from("storage_history").insert([record]);
  } catch (e) {
    console.error("Failed to log storage action:", e);
  }
}

// ==========================================
// ── MATERIAL CATALOG (Katalog materiálů)
// ==========================================
export type MaterialCatalogEntry = {
  id?: string;
  material_number: string;
  description: string;
  created_at?: string;
};

/**
 * Fetch entire material catalog.
 * Returns a Map<materialNumber, description> for fast lookups.
 */
export async function fetchMaterialCatalog(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = 1000;
  let hasMore = true;
  let start = 0;

  while (hasMore) {
    const { data, error } = await supabase
      .from("material_catalog")
      .select("material_number, description")
      .order("material_number", { ascending: true })
      .range(start, start + pageSize - 1);

    if (error) {
      console.error("Failed to fetch material catalog:", error);
      break;
    }

    if (data && data.length > 0) {
      data.forEach((entry: any) => {
        // Strip all spaces to prevent lookup failures due to random spaces
        const normKey = entry.material_number.toUpperCase().replace(/\s+/g, "");
        map.set(normKey, entry.description || "");
      });
      start += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return map;
}

/**
 * Bulk import material catalog from XLSX data.
 * Uses upsert on material_number to handle re-imports.
 */
export async function bulkImportMaterialCatalog(
  entries: { material_number: string; description: string }[]
): Promise<{ success: number; errors: { row: number; reason: string }[] }> {
  const errors: { row: number; reason: string }[] = [];
  const validEntries: { material_number: string; description: string }[] = [];

  entries.forEach((entry, i) => {
    if (!entry.material_number || entry.material_number.trim() === "") {
      errors.push({ row: i + 1, reason: "Chybí číslo materiálu" });
      return;
    }
    if (!entry.description || entry.description.trim() === "") {
      errors.push({ row: i + 1, reason: "Chybí popis materiálu" });
      return;
    }
    validEntries.push({
      material_number: entry.material_number.toUpperCase().replace(/\s+/g, ""),
      description: entry.description.trim(),
    });
  });

  if (validEntries.length === 0) {
    return { success: 0, errors };
  }

  // Upsert in batches of 500 to avoid payload limits
  const batchSize = 500;
  for (let i = 0; i < validEntries.length; i += batchSize) {
    const batch = validEntries.slice(i, i + batchSize);
    const { error } = await supabase
      .from("material_catalog")
      .upsert(batch, { onConflict: "material_number" });
    if (error) throw error;
  }

  return { success: validEntries.length, errors };
}

