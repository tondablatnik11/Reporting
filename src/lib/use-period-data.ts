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

function getStartOfWeek(year: number, week: number) {
  const d = new Date(year, 0, 4); 
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + (week - 1) * 7);
  return d;
}

export function getPeriodRange(period: Period, dateValue?: string): { from: string; to: string } {
  let from = new Date();
  let to = new Date();

  if (period === "day") {
    if (dateValue) {
      from = new Date(dateValue);
      if (isNaN(from.getTime())) from = new Date(); 
    }
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
  } else if (period === "week") {
    if (dateValue && dateValue.includes("-W")) {
      const [y, w] = dateValue.split("-W");
      from = getStartOfWeek(Number(y), Number(w));
      if (isNaN(from.getTime())) {
        from = new Date();
        const day = from.getDay() || 7;
        from.setDate(from.getDate() - day + 1);
      }
    } else {
      const day = from.getDay() || 7;
      from.setDate(from.getDate() - day + 1);
    }
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else if (period === "month") {
    if (dateValue && dateValue.includes("-") && !dateValue.includes("W")) {
      const [y, m] = dateValue.split("-");
      from = new Date(Number(y), Number(m) - 1, 1, 0, 0, 0, 0);
      if (isNaN(from.getTime())) {
        from = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0, 0);
      }
    } else {
      from = new Date(from.getFullYear(), from.getMonth(), 1, 0, 0, 0, 0);
    }
    to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    from = new Date(2020, 0, 1);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

export function getPreviousPeriodRange(period: Period, dateValue?: string): { from: string; to: string } {
  let from = new Date();
  let to = new Date();

  if (period === "day") {
    if (dateValue) {
      from = new Date(dateValue);
      if (isNaN(from.getTime())) from = new Date();
    }
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
  } else if (period === "week") {
    if (dateValue && dateValue.includes("-W")) {
      const [y, w] = dateValue.split("-W");
      from = getStartOfWeek(Number(y), Number(w) - 1);
      if (isNaN(from.getTime())) {
        from = new Date();
        const day = from.getDay() || 7;
        from.setDate(from.getDate() - day + 1 - 7);
      }
    } else {
      const day = from.getDay() || 7;
      from.setDate(from.getDate() - day + 1 - 7);
    }
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else if (period === "month") {
    if (dateValue && dateValue.includes("-") && !dateValue.includes("W")) {
      const [y, m] = dateValue.split("-");
      from = new Date(Number(y), Number(m) - 2, 1, 0, 0, 0, 0);
      if (isNaN(from.getTime())) {
         from = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1, 0, 0, 0, 0);
      }
    } else {
      from = new Date(from.getFullYear(), from.getMonth() - 1, 1, 0, 0, 0, 0);
    }
    to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    from = new Date(2020, 0, 1);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

async function fetchCategoriesMap(deliveries: string[]): Promise<Record<string, string>> {
  const uniqueDels = Array.from(new Set(deliveries.filter(d => !!d && d !== 'undefined')));
  if (uniqueDels.length === 0) return {};
  
  const catMap: Record<string, string> = {};
  const chunkSize = 200;
  
  for (let i = 0; i < uniqueDels.length; i += chunkSize) {
    const chunk = uniqueDels.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("likp_deliveries")
      .select("delivery, shipping_point")
      .in("delivery", chunk);
      
    if (!error && data) {
      data.forEach(d => {
        let cat = "Normal";
        if (d.shipping_point === "FM21" || d.shipping_point === "FM22") cat = "Express";
        else if (d.shipping_point === "FM24") cat = "OE";
        catMap[d.delivery] = cat;
      });
    }
  }
  return catMap;
}

async function fetchPickingFromDb(from: string, to: string): Promise<PickingRecord[]> {
  let allData: any[] = [];
  let hasMore = true;
  let page = 0;
  const pageSize = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from("ltap_picking")
      .select("tanum, tapos, picker_sap_id, dest_target_qty, weight, confirmed_at, delivery")
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

  const mapped = allData.map((r: any) => ({
    to_number: r.tanum,
    to_item: r.tapos,
    operator: r.picker_sap_id || "",
    quantity: Number(r.dest_target_qty) || 0,
    weight: Number(r.weight) || 0,
    confirmed_at: new Date(r.confirmed_at),
    delivery: r.delivery,
    category: 'Normal' // Přidáno pro Type Safety
  }));

  const catMap = await fetchCategoriesMap(mapped.map(m => m.delivery));
  mapped.forEach(m => { m.category = m.delivery ? (catMap[m.delivery] || 'Normal') : 'Normal'; });

  return mapped;
}

async function fetchPackingFromDb(from: string, to: string): Promise<PackingRecord[]> {
  let allData: any[] = [];
  let hasMore = true;
  let page = 0;
  const pageSize = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from("vekp_packing_headers")
      .select("internal_hu_number, handling_unit, packer_sap_id, total_weight, packed_at, packaging_material, delivery, vepo_packing_items(packed_quantity, material)")
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

  const mapped = allData.map((r: any) => {
    const vepoItems = Array.isArray(r.vepo_packing_items) ? r.vepo_packing_items : [];
    const totalQuantity = vepoItems.reduce((sum: number, item: any) => sum + (Number(item.packed_quantity) || 0), 0);
    const material = vepoItems.length > 0 ? vepoItems[0].material : r.packaging_material;

    return {
      internal_hu: r.internal_hu_number,
      hu_number: r.handling_unit,
      operator: r.packer_sap_id || "",
      weight: Number(r.total_weight) || 0,
      quantity: totalQuantity,
      created_at: new Date(r.packed_at),
      material: material,
      delivery: r.delivery,
      category: 'Normal' // Přidáno pro Type Safety
    };
  });

  const catMap = await fetchCategoriesMap(mapped.map(m => m.delivery));
  mapped.forEach(m => { m.category = m.delivery ? (catMap[m.delivery] || 'Normal') : 'Normal'; });

  return mapped;
}

export function usePeriodData(
  period: Period,
  localPicking: PickingRecord[],
  localPacking: PackingRecord[],
  dateValue?: string,
  isComparing?: boolean,
  compareDateValue?: string,
  likpData: Record<string, string> = {}
) {
  const [dbPicking, setDbPicking] = useState<PickingRecord[]>([]);
  const [dbPacking, setDbPacking] = useState<PackingRecord[]>([]);
  const [dbPrevPicking, setDbPrevPicking] = useState<PickingRecord[]>([]);
  const [dbPrevPacking, setDbPrevPacking] = useState<PackingRecord[]>([]);
  const [compPicking, setCompPicking] = useState<PickingRecord[]>([]);
  const [compPacking, setCompPacking] = useState<PackingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { from, to } = getPeriodRange(period, dateValue);
    const { from: prevFrom, to: prevTo } = getPreviousPeriodRange(period, dateValue);
    
    setLoading(true);

    const fetches = [
      fetchPickingFromDb(from, to),
      fetchPackingFromDb(from, to),
      period !== "all" ? fetchPickingFromDb(prevFrom, prevTo) : Promise.resolve([]),
      period !== "all" ? fetchPackingFromDb(prevFrom, prevTo) : Promise.resolve([]),
    ];

    if (isComparing && compareDateValue && period !== 'all') {
      const compRange = getPeriodRange(period, compareDateValue);
      fetches.push(fetchPickingFromDb(compRange.from, compRange.to));
      fetches.push(fetchPackingFromDb(compRange.from, compRange.to));
    }

    Promise.all(fetches).then((results) => {
      if (!active) return;
      setDbPicking((results[0] as PickingRecord[]) || []);
      setDbPacking((results[1] as PackingRecord[]) || []);
      setDbPrevPicking((results[2] as PickingRecord[]) || []);
      setDbPrevPacking((results[3] as PackingRecord[]) || []);
      if (results.length > 4) {
        setCompPicking((results[4] as PickingRecord[]) || []);
        setCompPacking((results[5] as PackingRecord[]) || []);
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

  const mergeLocalData = (dbData: any[], localData: any[], timeField: string, idField: string, dateValueStr?: string) => {
    const { from, to } = getPeriodRange(period, dateValueStr || dateValue);
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    const dbKeys = new Set(dbData.map(r => idField === 'tanum' ? `${r.to_number}-${r.to_item || '1'}` : r.internal_hu));
    
    const localOnly = localData.filter(r => {
      const key = idField === 'tanum' ? `${r.to_number}-${r.to_item || '1'}` : r.internal_hu;
      if (dbKeys.has(key)) return false;
      const tVal = r[timeField];
      if (!tVal) return false;
      const time = new Date(tVal).getTime();
      return time >= fromTime && time <= toTime;
    }).map(r => ({
      ...r,
      category: r.delivery && likpData[r.delivery] ? likpData[r.delivery] : (r.category || 'Normal')
    }));
    return [...dbData, ...localOnly];
  };

  const pickingData = useMemo(() => mergeLocalData(dbPicking, localPicking, 'confirmed_at', 'tanum'), [dbPicking, localPicking, period, dateValue, likpData]);
  const packingData = useMemo(() => mergeLocalData(dbPacking, localPacking, 'created_at', 'internal_hu'), [dbPacking, localPacking, period, dateValue, likpData]);
  
  const previousPickingData = useMemo(() => period === "all" ? [] : mergeLocalData(dbPrevPicking, localPicking, 'confirmed_at', 'tanum', getPreviousPeriodRange(period, dateValue).from), [dbPrevPicking, localPicking, period, dateValue, likpData]);
  const previousPackingData = useMemo(() => period === "all" ? [] : mergeLocalData(dbPrevPacking, localPacking, 'created_at', 'internal_hu', getPreviousPeriodRange(period, dateValue).from), [dbPrevPacking, localPacking, period, dateValue, likpData]);

  return { pickingData, packingData, previousPickingData, previousPackingData, compPicking, compPacking, loading };
}

export function aggregateToChartData(pickingData: PickingRecord[], packingData: PackingRecord[], period: Period, dateValue?: string) {
  const initCounters = () => ({
    picking: 0, packing: 0,
    pickingNormal: 0, pickingExpress: 0, pickingOE: 0,
    packingNormal: 0, packingExpress: 0, packingOE: 0,
    pickingTOsSet: new Set<string>(), packingHUsSet: new Set<string>(),
    pickingNormalTOsSet: new Set<string>(), pickingExpressTOsSet: new Set<string>(), pickingOETOsSet: new Set<string>(),
    packingNormalHUsSet: new Set<string>(), packingExpressHUsSet: new Set<string>(), packingOEHUsSet: new Set<string>(),
  });

  const processData = (map: Map<any, any>, extractKey: (d: any) => any) => {
    pickingData.forEach(p => {
      const key = extractKey(p.confirmed_at);
      if (map.has(key)) {
        const row = map.get(key);
        row.picking += p.quantity;
        const cat = p.category || 'Normal';
        const toKey = `${p.to_number}-${p.to_item || Math.random()}`;
        if (cat === 'Express') { row.pickingExpress += p.quantity; row.pickingExpressTOsSet.add(toKey); }
        else if (cat === 'OE') { row.pickingOE += p.quantity; row.pickingOETOsSet.add(toKey); }
        else { row.pickingNormal += p.quantity; row.pickingNormalTOsSet.add(toKey); }
        row.pickingTOsSet.add(toKey);
      }
    });
    packingData.forEach(p => {
      if (!p.created_at) return;
      const key = extractKey(p.created_at);
      if (map.has(key)) {
        const row = map.get(key);
        row.packing += (p.quantity || 0);
        const cat = p.category || 'Normal';
        if (cat === 'Express') { row.packingExpress += (p.quantity || 0); row.packingExpressHUsSet.add(p.internal_hu); }
        else if (cat === 'OE') { row.packingOE += (p.quantity || 0); row.packingOEHUsSet.add(p.internal_hu); }
        else { row.packingNormal += (p.quantity || 0); row.packingNormalHUsSet.add(p.internal_hu); }
        row.packingHUsSet.add(p.internal_hu);
      }
    });
  };

  if (period === "day") {
    const map = new Map<string, any>();
    hourlySlots.forEach(slot => map.set(`${slot.start} - ${slot.end}`, { time: slot.start, fullTime: `${slot.start} - ${slot.end}`, ...initCounters() }));
    processData(map, (d) => getSlot(d));
    return Array.from(map.values()).map(d => ({ ...d, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size, pickingNormalTOs: d.pickingNormalTOsSet.size, pickingExpressTOs: d.pickingExpressTOsSet.size, pickingOETOs: d.pickingOETOsSet.size, packingNormalHUs: d.packingNormalHUsSet.size, packingExpressHUs: d.packingExpressHUsSet.size, packingOEHUs: d.packingOEHUsSet.size }));
  }

  if (period === "week") {
    const days = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    const map = new Map<number, any>();
    for (let i = 1; i <= 7; i++) map.set(i, { time: days[i-1], fullTime: days[i-1], ...initCounters() });
    processData(map, (d) => { let day = new Date(d).getDay(); return day === 0 ? 7 : day; });
    return Array.from(map.values()).map(d => ({ ...d, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size, pickingNormalTOs: d.pickingNormalTOsSet.size, pickingExpressTOs: d.pickingExpressTOsSet.size, pickingOETOs: d.pickingOETOsSet.size, packingNormalHUs: d.packingNormalHUsSet.size, packingExpressHUs: d.packingExpressHUsSet.size, packingOEHUs: d.packingOEHUsSet.size }));
  }

  if (period === "month") {
    const { from } = getPeriodRange("month", dateValue);
    const d = new Date(from);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const map = new Map<number, any>();
    for (let i = 1; i <= daysInMonth; i++) map.set(i, { time: String(i), fullTime: `${i}.`, ...initCounters() });
    processData(map, (d) => new Date(d).getDate());
    return Array.from(map.values()).map(d => ({ ...d, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size, pickingNormalTOs: d.pickingNormalTOsSet.size, pickingExpressTOs: d.pickingExpressTOsSet.size, pickingOETOs: d.pickingOETOsSet.size, packingNormalHUs: d.packingNormalHUsSet.size, packingExpressHUs: d.packingExpressHUsSet.size, packingOEHUs: d.packingOEHUsSet.size }));
  }

  const map = new Map<string, any>();
  processData(map, (d) => {
    const key = new Date(d).toISOString().substring(0, 7);
    if (!map.has(key)) map.set(key, { time: key.substring(5), fullTime: key, ...initCounters() });
    return key;
  });
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => ({ ...d, pickingTOs: d.pickingTOsSet.size, packingHUs: d.packingHUsSet.size, pickingNormalTOs: d.pickingNormalTOsSet.size, pickingExpressTOs: d.pickingExpressTOsSet.size, pickingOETOs: d.pickingOETOsSet.size, packingNormalHUs: d.packingNormalHUsSet.size, packingExpressHUs: d.packingExpressHUsSet.size, packingOEHUs: d.packingOEHUsSet.size }));
}

export function aggregateShiftStats(pickingData: PickingRecord[], packingData: PackingRecord[]) {
  const initT = () => ({ pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), weight: 0, operators: new Set<string>(), pickingNormal: 0, pickingExpress: 0, pickingOE: 0, packingNormal: 0, packingExpress: 0, packingOE: 0, pickingNormalTOs: new Set<string>(), pickingExpressTOs: new Set<string>(), pickingOETOs: new Set<string>(), packingNormalHUs: new Set<string>(), packingExpressHUs: new Set<string>(), packingOEHUs: new Set<string>() });
  const a = initT();
  const b = initT();

  pickingData.forEach(p => {
    if (!p.confirmed_at) return;
    const t = getShiftLabel(new Date(p.confirmed_at)) === "A" ? a : b;
    t.pickingKs += p.quantity;
    t.weight += (p.weight || 0);
    const toKey = `${p.to_number}-${p.to_item || Math.random()}`;
    t.pickingTOs.add(toKey);
    if (p.operator) t.operators.add(p.operator);
    
    const cat = p.category || 'Normal';
    if (cat === 'Express') { t.pickingExpress += p.quantity; t.pickingExpressTOs.add(toKey); }
    else if (cat === 'OE') { t.pickingOE += p.quantity; t.pickingOETOs.add(toKey); }
    else { t.pickingNormal += p.quantity; t.pickingNormalTOs.add(toKey); }
  });
  
  packingData.forEach(p => {
    if (!p.created_at) return;
    const t = getShiftLabel(new Date(p.created_at)) === "A" ? a : b;
    t.packingKs += (p.quantity || 0);
    t.weight += (p.weight || 0);
    t.packingHUs.add(p.internal_hu);
    if (p.operator) t.operators.add(p.operator);

    const cat = p.category || 'Normal';
    if (cat === 'Express') { t.packingExpress += (p.quantity || 0); t.packingExpressHUs.add(p.internal_hu); }
    else if (cat === 'OE') { t.packingOE += (p.quantity || 0); t.packingOEHUs.add(p.internal_hu); }
    else { t.packingNormal += (p.quantity || 0); t.packingNormalHUs.add(p.internal_hu); }
  });

  return {
    a: { ...a, pickingTOs: a.pickingTOs.size, packingHUs: a.packingHUs.size, operators: a.operators.size, pickingNormalTOs: a.pickingNormalTOs.size, pickingExpressTOs: a.pickingExpressTOs.size, pickingOETOs: a.pickingOETOs.size, packingNormalHUs: a.packingNormalHUs.size, packingExpressHUs: a.packingExpressHUs.size, packingOEHUs: a.packingOEHUs.size },
    b: { ...b, pickingTOs: b.pickingTOs.size, packingHUs: b.packingHUs.size, operators: b.operators.size, pickingNormalTOs: b.pickingNormalTOs.size, pickingExpressTOs: b.pickingExpressTOs.size, pickingOETOs: b.pickingOETOs.size, packingNormalHUs: b.packingNormalHUs.size, packingExpressHUs: b.packingExpressHUs.size, packingOEHUs: b.packingOEHUs.size },
  };
}
