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

// Helper for parsing week format like "2026-W22"
function getStartOfWeek(year: number, week: number) {
  const d = new Date(year, 0, 4); // 4th of Jan is always in week 1
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + (week - 1) * 7);
  return d;
}

// Returns [from, to] ISO date strings based on period and specific date string
export function getPeriodRange(period: Period, dateValue?: string): { from: string; to: string } {
  let from = new Date();
  let to = new Date();

  if (period === "day") {
    if (dateValue) from = new Date(dateValue);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
  } else if (period === "week") {
    if (dateValue && dateValue.includes("-W")) {
      const [y, w] = dateValue.split("-W");
      from = getStartOfWeek(Number(y), Number(w));
    } else {
      const day = from.getDay() || 7;
      from.setDate(from.getDate() - day + 1);
    }
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else if (period === "month") {
    if (dateValue && dateValue.includes("-")) {
      const [y, m] = dateValue.split("-");
      from = new Date(Number(y), Number(m) - 1, 1, 0, 0, 0, 0);
    } else {
      from = new Date(from.getFullYear(), from.getMonth(), 1, 0, 0, 0, 0);
    }
    to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    from = new Date(2020, 0, 1);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function fetchPickingFromDb(from: string, to: string): Promise<PickingRecord[]> {
  let allData: any[] = [];
  let hasMore = true;
  let page = 0;
  const pageSize = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from("ltap_picking")
      .select("tanum, tapos, picker_sap_id, dest_target_qty, weight, confirmed_at")
      .gte("confirmed_at", from)
      .lte("confirmed_at", to)
      .not("picker_sap_id", "is", null)
      .order("confirmed_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Picking fetch error:", error.message);
      break;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      page++;
      if (data.length < pageSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return allData.map((r: any) => ({
    to_number: r.tanum,
    to_item: r.tapos,
    operator: r.picker_sap_id || "",
    quantity: r.dest_target_qty || 0,
    weight: r.weight || 0,
    confirmed_at: new Date(r.confirmed_at),
  }));
}

async function fetchPackingFromDb(from: string, to: string): Promise<PackingRecord[]> {
  let allData: any[] = [];
  let hasMore = true;
  let page = 0;
  const pageSize = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from("vekp_packing_headers")
      .select("internal_hu_number, handling_unit, packer_sap_id, total_weight, packed_at, packaging_material, vepo_packing_items(packed_quantity, material)")
      .gte("packed_at", from)
      .lte("packed_at", to)
      .not("packer_sap_id", "is", null)
      .order("packed_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Packing fetch error:", error.message);
      break;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      page++;
      if (data.length < pageSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return allData.map((r: any) => {
    const vepoItems = Array.isArray(r.vepo_packing_items) ? r.vepo_packing_items : [];
    const totalQuantity = vepoItems.reduce((sum: number, item: any) => sum + (Number(item.packed_quantity) || 0), 0);
    const material = vepoItems.length > 0 ? vepoItems[0].material : r.packaging_material;

    return {
      internal_hu: r.internal_hu_number,
      hu_number: r.handling_unit,
      operator: r.packer_sap_id || "",
      weight: r.total_weight || 0,
      quantity: totalQuantity,
      created_at: new Date(r.packed_at),
      material: material,
    };
  });
}

// Rozšířený hook podporující porovnávací rozsah
export function usePeriodData(
  period: Period,
  localPicking: PickingRecord[],
  localPacking: PackingRecord[],
  dateValue?: string,
  isComparing?: boolean,
  compareDateValue?: string
) {
  const [dbPicking, setDbPicking] = useState<PickingRecord[]>([]);
  const [dbPacking, setDbPacking] = useState<PackingRecord[]>([]);
  const [compPicking, setCompPicking] = useState<PickingRecord[]>([]);
  const [compPacking, setCompPacking] = useState<PackingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { from, to } = getPeriodRange(period, dateValue);
    setLoading(true);

    const fetches = [
      fetchPickingFromDb(from, to),
      fetchPackingFromDb(from, to),
    ];

    if (isComparing && compareDateValue && period !== 'all') {
      const compRange = getPeriodRange(period, compareDateValue);
      fetches.push(fetchPickingFromDb(compRange.from, compRange.to));
      fetches.push(fetchPackingFromDb(compRange.from, compRange.to));
    }

    Promise.all(fetches).then((results) => {
      if (!active) return;
      // Přetypování na explicitní typy polí kvůli TypeScriptu, jelikož Promise.all vrací unii typů
      setDbPicking((results[0] as PickingRecord[]) || []);
      setDbPacking((results[1] as PackingRecord[]) || []);
      if (results.length > 2) {
        setCompPicking((results[2] as PickingRecord[]) || []);
        setCompPacking((results[3] as PackingRecord[]) || []);
      } else {
        setCompPicking([]);
        setCompPacking([]);
      }
      setLoading(false);
    }).catch((err) => {
      if (!active) return;
      console.error("DB fetch error:", err);
      setLoading(false);
    });
    return () => { active = false; };
  }, [period, dateValue, isComparing, compareDateValue]);

  // Sloučení hlavních dat s lokálními nepouloženými
  const pickingData = useMemo(() => {
    const { from, to } = getPeriodRange(period, dateValue);
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();

    const dbKeys = new Set(dbPicking.map(r => `${r.to_number}-${r.to_item || '1'}`));
    const localOnly = localPicking.filter(r => {
      const key = `${r.to_number}-${r.to_item || '1'}`;
      if (dbKeys.has(key)) return false;
      if (!r.confirmed_at) return false;
      const time = new Date(r.confirmed_at).getTime();
      return time >= fromTime && time <= toTime;
    });
    return [...dbPicking, ...localOnly];
  }, [dbPicking, localPicking, period, dateValue]);

  const packingData = useMemo(() => {
    const { from, to } = getPeriodRange(period, dateValue);
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();

    const dbKeys = new Set(dbPacking.map(r => r.internal_hu));
    const localOnly = localPacking.filter(r => {
      if (dbKeys.has(r.internal_hu)) return false;
      if (!r.created_at) return false;
      const time = new Date(r.created_at).getTime();
      return time >= fromTime && time <= toTime;
    });
    return [...dbPacking, ...localOnly];
  }, [dbPacking, localPacking, period, dateValue]);

  return { pickingData, packingData, compPicking, compPacking, loading };
}

export function aggregateToChartData(pickingData: PickingRecord[], packingData: PackingRecord[], period: Period, dateValue?: string) {
  if (period === "day") {
    const chartDataMap = new Map<string, any>();
    hourlySlots.forEach(slot => {
      chartDataMap.set(`${slot.start} - ${slot.end}`, {
        time: slot.start, fullTime: `${slot.start} - ${slot.end}`, picking: 0, packing: 0, pickingTOsSet: new Set<string>(), packingHUsSet: new Set<string>(),
      });
    });

    pickingData.forEach(p => {
      const slot = getSlot(p.confirmed_at);
      if (chartDataMap.has(slot)) {
        chartDataMap.get(slot).picking += p.quantity;
        chartDataMap.get(slot).pickingTOsSet.add(`${p.to_number}-${p.to_item || Math.random()}`);
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
      time: d.time, fullTime: d.fullTime, picking: d.picking, packing: d.packing, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size,
    }));
  }

  if (period === "week") {
    const days = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    const map = new Map<number, any>();
    for (let i = 1; i <= 7; i++) {
      map.set(i, { time: days[i-1], fullTime: days[i-1], picking: 0, packing: 0, pickingTOsSet: new Set<string>(), packingHUsSet: new Set<string>() });
    }
    pickingData.forEach(p => {
      let d = new Date(p.confirmed_at).getDay();
      d = d === 0 ? 7 : d; // 1 = Monday, 7 = Sunday
      if (map.has(d)) {
        map.get(d).picking += p.quantity;
        map.get(d).pickingTOsSet.add(`${p.to_number}-${p.to_item || Math.random()}`);
      }
    });
    packingData.forEach(p => {
      if (!p.created_at) return;
      let d = new Date(p.created_at).getDay();
      d = d === 0 ? 7 : d;
      if (map.has(d)) {
        map.get(d).packing += (p.quantity || 0);
        map.get(d).packingHUsSet.add(p.internal_hu);
      }
    });
    return Array.from(map.values()).map(d => ({ ...d, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size }));
  }

  if (period === "month") {
    const { from } = getPeriodRange("month", dateValue);
    const d = new Date(from);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const map = new Map<number, any>();
    for (let i = 1; i <= daysInMonth; i++) {
      map.set(i, { time: String(i), fullTime: `${i}.`, picking: 0, packing: 0, pickingTOsSet: new Set<string>(), packingHUsSet: new Set<string>() });
    }
    pickingData.forEach(p => {
      const d = new Date(p.confirmed_at).getDate();
      if (map.has(d)) {
        map.get(d).picking += p.quantity;
        map.get(d).pickingTOsSet.add(`${p.to_number}-${p.to_item || Math.random()}`);
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
    map.get(key).pickingTOsSet.add(`${p.to_number}-${p.to_item || Math.random()}`);
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

// Chybějící funkce, kterou využívá stránka "shift-comparison" (nyní včetně váhy u pickingu)
export function aggregateShiftStats(pickingData: PickingRecord[], packingData: PackingRecord[]) {
  const a = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), weight: 0, operators: new Set<string>() };
  const b = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), weight: 0, operators: new Set<string>() };

  pickingData.forEach(p => {
    if (!p.confirmed_at) return;
    const shift = getShiftLabel(new Date(p.confirmed_at));
    const t = shift === "A" ? a : b;
    t.pickingKs += p.quantity;
    t.weight += (p.weight || 0); // Vylepšení: počítáme váhu i u pickingu
    t.pickingTOs.add(`${p.to_number}-${p.to_item || Math.random()}`);
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
