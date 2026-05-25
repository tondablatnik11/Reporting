"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  PickingRecord,
  PackingRecord,
  hourlySlots,
  getSlot,
  getShiftLabel,
} from "@/lib/data-context";

export type Period = "day" | "week" | "month" | "all";

// Returns [from, to] ISO date strings based on period
export function getPeriodRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  let from = new Date(now);

  if (period === "day") {
    from.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    const day = now.getDay() || 7;
    from.setDate(now.getDate() - day + 1);
    from.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  } else {
    from = new Date(2020, 0, 1); // all time
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function getPeriodLabel(period: Period): string {
  if (period === "day") return "Dnes";
  if (period === "week") return "Tento týden";
  if (period === "month") return "Tento měsíc";
  return "Celé období";
}

// Loads picking + packing from Supabase for given period
async function fetchPickingFromDb(from: string, to: string): Promise<PickingRecord[]> {
  const { data, error } = await supabase
    .from("ltap_picking")
    .select("tanum, picker_sap_id, dest_target_qty, confirmed_at")
    .gte("confirmed_at", from)
    .lte("confirmed_at", to)
    .not("picker_sap_id", "is", null)
    .order("confirmed_at", { ascending: true });

  if (error) {
    console.error("Picking fetch error:", error.message);
    return [];
  }

  return (data || []).map((r: any) => ({
    to_number: r.tanum,
    operator: r.picker_sap_id || "",
    quantity: r.dest_target_qty || 0,
    confirmed_at: new Date(r.confirmed_at),
  }));
}

async function fetchPackingFromDb(from: string, to: string): Promise<PackingRecord[]> {
  const { data, error } = await supabase
    .from("vekp_packing_headers")
    .select("internal_hu_number, handling_unit, packer_sap_id, total_weight, packed_at, packaging_material")
    .gte("packed_at", from)
    .lte("packed_at", to)
    .not("packer_sap_id", "is", null)
    .order("packed_at", { ascending: true });

  if (error) {
    console.error("Packing fetch error:", error.message);
    return [];
  }

  return (data || []).map((r: any) => ({
    internal_hu: r.internal_hu_number,
    hu_number: r.handling_unit,
    operator: r.packer_sap_id || "",
    weight: r.total_weight || 0,
    quantity: 0, // joined from VEPO if needed
    created_at: new Date(r.packed_at),
    material: r.packaging_material,
  }));
}

// Main hook - returns period-filtered data either from local state or Supabase
export function usePeriodData(
  period: Period,
  localPicking: PickingRecord[],
  localPacking: PackingRecord[]
) {
  const [dbPicking, setDbPicking] = useState<PickingRecord[]>([]);
  const [dbPacking, setDbPacking] = useState<PackingRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (period === "day") {
      // Use local data only for "day"
      setDbPicking([]);
      setDbPacking([]);
      return;
    }

    // For other periods fetch from Supabase
    const { from, to } = getPeriodRange(period);
    setLoading(true);

    Promise.all([
      fetchPickingFromDb(from, to),
      fetchPackingFromDb(from, to),
    ]).then(([picking, packing]) => {
      setDbPicking(picking);
      setDbPacking(packing);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [period]);

  const pickingData = period === "day" ? localPicking : dbPicking;
  const packingData = period === "day" ? localPacking : dbPacking;

  return { pickingData, packingData, loading };
}

// Aggregation for charts - works on any picking/packing arrays
export function aggregateToChartData(
  pickingData: PickingRecord[],
  packingData: PackingRecord[],
  period: Period
) {
  if (period === "day") {
    // Hourly slots - same as before
    const chartDataMap = new Map<string, any>();
    hourlySlots.forEach(slot => {
      chartDataMap.set(`${slot.start} - ${slot.end}`, {
        time: slot.start,
        fullTime: `${slot.start} - ${slot.end}`,
        picking: 0, packing: 0,
        pickingTOsSet: new Set<string>(),
        packingHUsSet: new Set<string>(),
      });
    });

    pickingData.forEach(p => {
      const slot = getSlot(p.confirmed_at);
      if (chartDataMap.has(slot)) {
        chartDataMap.get(slot).picking += p.quantity;
        chartDataMap.get(slot).pickingTOsSet.add(p.to_number);
      }
    });
    packingData.forEach(p => {
      if (p.created_at) {
        const slot = getSlot(p.created_at);
        if (chartDataMap.has(slot)) {
          chartDataMap.get(slot).packing += (p.quantity || 0);
          chartDataMap.get(slot).packingHUsSet.add(p.internal_hu);
        }
      }
    });

    return Array.from(chartDataMap.values()).map(d => ({
      time: d.time,
      fullTime: d.fullTime,
      picking: d.picking,
      packing: d.packing,
      pickingTOs: d.pickingTOsSet.size,
      packingHUs: d.packingHUsSet.size,
    }));
  }

  if (period === "week") {
    // Group by day of week
    const days = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    const map = new Map<number, any>();
    for (let i = 1; i <= 7; i++) {
      map.set(i, { time: days[i-1], fullTime: days[i-1], picking: 0, packing: 0, pickingTOsSet: new Set<string>(), packingHUsSet: new Set<string>() });
    }
    pickingData.forEach(p => {
      const d = new Date(p.confirmed_at).getDay() || 7;
      if (map.has(d)) {
        map.get(d).picking += p.quantity;
        map.get(d).pickingTOsSet.add(p.to_number);
      }
    });
    packingData.forEach(p => {
      if (!p.created_at) return;
      const d = new Date(p.created_at).getDay() || 7;
      if (map.has(d)) {
        map.get(d).packing += (p.quantity || 0);
        map.get(d).packingHUsSet.add(p.internal_hu);
      }
    });
    return Array.from(map.values()).map(d => ({ ...d, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size }));
  }

  if (period === "month") {
    // Group by day number in month
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const map = new Map<number, any>();
    for (let i = 1; i <= daysInMonth; i++) {
      map.set(i, { time: String(i), fullTime: `${i}.`, picking: 0, packing: 0, pickingTOsSet: new Set<string>(), packingHUsSet: new Set<string>() });
    }
    pickingData.forEach(p => {
      const d = new Date(p.confirmed_at).getDate();
      if (map.has(d)) {
        map.get(d).picking += p.quantity;
        map.get(d).pickingTOsSet.add(p.to_number);
      }
    });
    packingData.forEach(p => {
      if (!p.created_at) return;
      const d = new Date(p.created_at).getDate();
      if (map.has(d)) {
        map.get(d).packing += (p.quantity || 0);
        map.get(d).packingHUsSet.add(p.internal_hu);
      }
    });
    return Array.from(map.values()).map(d => ({ ...d, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size }));
  }

  // "all" - group by month (YYYY-MM)
  const map = new Map<string, any>();
  pickingData.forEach(p => {
    const key = new Date(p.confirmed_at).toISOString().substring(0, 7);
    if (!map.has(key)) map.set(key, { time: key.substring(5), fullTime: key, picking: 0, packing: 0, pickingTOsSet: new Set<string>(), packingHUsSet: new Set<string>() });
    map.get(key).picking += p.quantity;
    map.get(key).pickingTOsSet.add(p.to_number);
  });
  packingData.forEach(p => {
    if (!p.created_at) return;
    const key = new Date(p.created_at).toISOString().substring(0, 7);
    if (!map.has(key)) map.set(key, { time: key.substring(5), fullTime: key, picking: 0, packing: 0, pickingTOsSet: new Set<string>(), packingHUsSet: new Set<string>() });
    map.get(key).packing += (p.quantity || 0);
    map.get(key).packingHUsSet.add(p.internal_hu);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, d]) => ({ ...d, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size }));
}

// Aggregate shift A/B stats for any picking/packing arrays
export function aggregateShiftStats(pickingData: PickingRecord[], packingData: PackingRecord[]) {
  const a = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), weight: 0, operators: new Set<string>() };
  const b = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), weight: 0, operators: new Set<string>() };

  pickingData.forEach(p => {
    if (!p.confirmed_at) return;
    const shift = getShiftLabel(new Date(p.confirmed_at));
    const t = shift === "A" ? a : b;
    t.pickingKs += p.quantity;
    t.pickingTOs.add(p.to_number);
    if (p.operator) t.operators.add(p.operator);
  });
  packingData.forEach(p => {
    if (!p.created_at) return;
    const shift = getShiftLabel(new Date(p.created_at));
    const t = shift === "A" ? a : b;
    t.packingKs += (p.quantity || 0);
    t.weight += (p.weight || 0);
    t.packingHUs.add(p.internal_hu);
    if (p.operator) t.operators.add(p.operator);
  });

  return {
    a: { pickingKs: a.pickingKs, packingKs: a.packingKs, pickingTOs: a.pickingTOs.size, packingHUs: a.packingHUs.size, weight: a.weight, operators: a.operators.size },
    b: { pickingKs: b.pickingKs, packingKs: b.packingKs, pickingTOs: b.pickingTOs.size, packingHUs: b.packingHUs.size, weight: b.weight, operators: b.operators.size },
  };
}
