"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type PickingRecord = {
  to_number: string;
  to_item?: string;
  operator: string;
  quantity: number;
  weight?: number;
  confirmed_at: Date;
  queue?: string;
  delivery?: string;
  category?: string;
  material?: string;
  source_storage_bin?: string;
};

export type PackingRecord = {
  internal_hu: string;
  hu_number?: string;
  material?: string; 
  materials?: string[]; 
  packaging_material?: string; 
  operator?: string;
  quantity?: number;
  weight?: number;
  created_at?: Date;
  category?: string; 
  delivery?: string;
};

export const hourlySlots = [
  { start: "05:45", end: "06:45", startHour: 5, startMin: 45 },
  { start: "06:45", end: "07:45", startHour: 6, startMin: 45 },
  { start: "07:45", end: "08:45", startHour: 7, startMin: 45 },
  { start: "08:45", end: "09:45", startHour: 8, startMin: 45 },
  { start: "09:45", end: "10:45", startHour: 9, startMin: 45 },
  { start: "10:45", end: "11:45", startHour: 10, startMin: 45 },
  { start: "11:45", end: "12:45", startHour: 11, startMin: 45 },
  { start: "12:45", end: "13:45", startHour: 12, startMin: 45 },
  { start: "13:45", end: "14:45", startHour: 13, startMin: 45 },
  { start: "14:45", end: "15:45", startHour: 14, startMin: 45 },
  { start: "15:45", end: "16:45", startHour: 15, startMin: 45 },
  { start: "16:45", end: "17:45", startHour: 16, startMin: 45 },
  { start: "17:45", end: "18:45", startHour: 17, startMin: 45 },
  { start: "18:45", end: "19:45", startHour: 18, startMin: 45 },
  { start: "19:45", end: "20:45", startHour: 19, startMin: 45 },
  { start: "20:45", end: "21:45", startHour: 20, startMin: 45 },
];

export const getSlot = (date: Date | undefined) => {
  if (!date) return "Mimo směnu";
  const d = new Date(date);
  const m = d.getHours() * 60 + d.getMinutes();
  for (const slot of hourlySlots) {
    const startM = slot.startHour * 60 + slot.startMin;
    const endM = startM + 60;
    if (m >= startM && m < endM) {
      return `${slot.start} - ${slot.end}`;
    }
  }
  return "Mimo směnu";
};

export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getShiftConfig() {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('hellmann_shifts');
      if (stored) return JSON.parse(stored);
    } catch(e) {}
  }
  return {
    morningStart: "05:45",
    morningEnd: "13:45",
    afternoonStart: "13:45",
    afternoonEnd: "21:45",
    breakMinutes: 30,
    evenWeekShiftAMorning: true,
  };
}

export function isMorningShift(date: Date): boolean {
  const config = getShiftConfig();
  const h = date.getHours();
  const m = date.getMinutes();
  const [endH, endM] = config.morningEnd.split(':').map(Number);
  return (h * 60 + m) < (endH * 60 + endM);
}

export function getShiftLabel(date: Date): "A" | "B" {
  const config = getShiftConfig();
  const weekNum = getISOWeekNumber(date);
  const isEvenWeek = weekNum % 2 === 0;
  const morning = isMorningShift(date);
  
  const shiftAIsMorning = config.evenWeekShiftAMorning ? isEvenWeek : !isEvenWeek;
  
  if (shiftAIsMorning) {
    return morning ? "A" : "B";
  } else {
    return morning ? "B" : "A";
  }
}

type DataContextType = {
  pickingData: PickingRecord[];
  packingData: PackingRecord[];
  likpData: Record<string, string>;
  addPickingData: (data: PickingRecord[]) => void;
  addPackingData: (data: PackingRecord[]) => void;
  addLikpData: (data: {delivery: string, shipping_point: string, carrier?: string}[]) => void;
  clearData: () => void;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [pickingData, setPickingData] = useState<PickingRecord[]>([]);
  const [packingData, setPackingData] = useState<PackingRecord[]>([]);
  const [likpData, setLikpData] = useState<Record<string, string>>({});

  useEffect(() => {
    import("@/lib/supabase").then(({ supabase }) => {
      supabase.from('app_settings').select('*').in('key', ['shifts', 'targets', 'operators']).then(({ data }) => {
        data?.forEach(row => {
          localStorage.setItem(`hellmann_${row.key}`, JSON.stringify(row.value));
        });
      });
    });
  }, []);

  const addLikpData = (data: {delivery: string, shipping_point: string, carrier?: string}[]) => {
    setLikpData(prev => {
      const next = { ...prev };
      data.forEach(item => {
         let cat = "Normal";
         if (item.shipping_point === "FM21" || item.shipping_point === "FM22") cat = "Express";
         else if (item.shipping_point === "FM24") cat = "OE";
         next[item.delivery] = cat;
      });
      return next;
    });
  };

  const addPickingData = (data: PickingRecord[]) => {
    setPickingData(prev => [...prev, ...data]);
  };

  const addPackingData = (data: PackingRecord[]) => {
    setPackingData(prev => {
      const map = new Map<string, PackingRecord>();
      
      [...prev, ...data].forEach(item => {
        if (!map.has(item.internal_hu)) {
          map.set(item.internal_hu, { 
            ...item, 
            materials: item.material ? [item.material] : (item.materials || []) 
          });
        } else {
          const existing = map.get(item.internal_hu)!;
          
          const combinedMaterials = new Set(existing.materials || []);
          if (existing.material) combinedMaterials.add(existing.material);
          if (item.material) combinedMaterials.add(item.material);
          if (item.materials) item.materials.forEach(m => combinedMaterials.add(m));

          map.set(item.internal_hu, {
            ...existing,
            ...item,
            operator: item.operator || existing.operator,
            created_at: item.created_at || existing.created_at,
            material: item.material || existing.material,
            materials: Array.from(combinedMaterials),
            quantity: item.quantity || existing.quantity,
            packaging_material: item.packaging_material || existing.packaging_material,
            category: item.category || existing.category,
            delivery: item.delivery || existing.delivery,
          });
        }
      });
      return Array.from(map.values());
    });
  };

  const clearData = () => {
    setPickingData([]);
    setPackingData([]);
    setLikpData({});
  };

  return (
    <DataContext.Provider value={{ pickingData, packingData, likpData, addPickingData, addPackingData, addLikpData, clearData }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}

// Interface for shift performance data
interface ShiftPerformance {
  picking: {
    quantity: number;
    tos: number;
  };
  packing: {
    quantity: number;
    hus: number;
  };
}

// Interface for daily performance comparison
export interface DailyComparison {
  date: string;
  morning: ShiftPerformance;
  evening: ShiftPerformance;
  total: {
    picking: number;
    packing: number;
  };
}

import { loadDailyPerformance, loadMonthlyPerformance, loadWeeklyPerformance, DailyPerformance } from '@/lib/history';

export function useAggregatedData() {
  const today = new Date().toISOString().split('T')[0];
  const { pickingData, packingData, likpData } = useData();

  const enrichedPickingData = pickingData.map(p => ({
    ...p,
    category: p.delivery && likpData[p.delivery] ? likpData[p.delivery] : "Normal"
  }));

  const enrichedPackingData = packingData.map(p => ({
    ...p,
    category: p.category || (p.delivery && likpData[p.delivery] ? likpData[p.delivery] : "Normal")
  }));

  const chartDataMap = new Map();
  hourlySlots.forEach(slot => {
    chartDataMap.set(`${slot.start} - ${slot.end}`, {
      time: slot.start,
      fullTime: `${slot.start} - ${slot.end}`,
      picking: 0,
      packing: 0,
      pickingTOsSet: new Set(),
      packingHUsSet: new Set(),
      morningPicking: 0,
      morningPacking: 0,
      eveningPicking: 0,
      eveningPacking: 0,
    });
  });
  chartDataMap.set("Mimo směnu", { time: "Mimo", fullTime: "Mimo směnu", picking: 0, packing: 0, pickingTOsSet: new Set(), packingHUsSet: new Set() });

  let totalPicking = 0;
  let totalPacking = 0;
  const globalPickingTOs = new Set();
  const globalPackingHUs = new Set();

  enrichedPickingData.forEach(p => {
    const slot = getSlot(p.confirmed_at);
    if (chartDataMap.has(slot)) {
      chartDataMap.get(slot).picking += p.quantity;
      chartDataMap.get(slot).pickingTOsSet.add(p.to_number);
      totalPicking += p.quantity;
      globalPickingTOs.add(p.to_number);

      const hour = p.confirmed_at.getHours();
      if (hour >= 5 && hour < 14) {
        chartDataMap.get(slot).morningPicking += p.quantity;
      } else {
        chartDataMap.get(slot).eveningPicking += p.quantity;
      }
    }
  });

  enrichedPackingData.forEach(p => {
    if (p.created_at) {
      const slot = getSlot(p.created_at);
      if (chartDataMap.has(slot)) {
        chartDataMap.get(slot).packing += (p.quantity || 0);
        chartDataMap.get(slot).packingHUsSet.add(p.internal_hu);
        totalPacking += (p.quantity || 0);
        globalPackingHUs.add(p.internal_hu);

        const hour = p.created_at.getHours();
        if (hour >= 5 && hour < 14) {
          chartDataMap.get(slot).morningPacking += p.quantity || 0;
        } else {
          chartDataMap.get(slot).eveningPacking += p.quantity || 0;
        }
      }
    }
  });

  const chartData = Array.from(chartDataMap.values()).map(d => ({
    time: d.time,
    fullTime: d.fullTime,
    picking: d.picking,
    packing: d.packing,
    pickingTOs: d.pickingTOsSet.size,
    packingHUs: d.packingHUsSet.size,
    morningPicking: d.morningPicking,
    morningPacking: d.morningPacking,
    eveningPicking: d.eveningPicking,
    eveningPacking: d.eveningPacking
  })).filter(d => d.time !== "Mimo");

  return {
    chartData,
    totalPicking,
    totalPacking,
    totalPickingTOs: globalPickingTOs.size,
    totalPackingHUs: globalPackingHUs.size,
    pickingData: enrichedPickingData,
    packingData: enrichedPackingData,
    
    getPreviousDayData: async (daysAgo: number) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const dateStr = date.toISOString().split('T')[0];
      return {
        date: dateStr,
        morning: { picking: { quantity: 0, tos: 0 }, packing: { quantity: 0, hus: 0 } },
        evening: { picking: { quantity: 0, tos: 0 }, packing: { quantity: 0, hus: 0 } },
        total: { picking: 0, packing: 0 }
      };
    },

    getWeeklyData: async (weeksAgo: number) => {
      const result = [];
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) - (weeksAgo * 7);
      const monday = new Date(today.setDate(diff));

      for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        const dateStr = day.toISOString().split('T')[0];
        result.push({
          date: dateStr,
          dayOfWeek: day.toLocaleDateString('cs-CZ', { weekday: 'short' }),
          morning: { picking: { quantity: 0, tos: 0 }, packing: { quantity: 0, hus: 0 } },
          evening: { picking: { quantity: 0, tos: 0 }, packing: { quantity: 0, hus: 0 } },
          total: { picking: 0, packing: 0 }
        });
      }
      return result;
    },

    getMonthlyData: async (monthsAgo: number) => {
      const result = [];
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() - monthsAgo;
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      for (let day = firstDay.getDate(); day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        const dateStr = date.toISOString().split('T')[0];
        result.push({
          date: dateStr,
          dayOfWeek: date.toLocaleDateString('cs-CZ', { weekday: 'short' }),
          morning: { picking: { quantity: 0, tos: 0 }, packing: { quantity: 0, hus: 0 } },
          evening: { picking: { quantity: 0, tos: 0 }, packing: { quantity: 0, hus: 0 } },
          total: { picking: 0, packing: 0 }
        });
      }
      return result;
    },

    compareWithPreviousPeriod: async (period: 'day' | 'week' | 'month') => {
      const currentData = { totalPicking, totalPacking, totalPickingTOs: globalPickingTOs.size, totalPackingHUs: globalPackingHUs.size };
      const previousData = { totalPicking: 0, totalPacking: 0, totalPickingTOs: 0, totalPackingHUs: 0 };

      return {
        current: currentData,
        previous: previousData,
        difference: {
          picking: currentData.totalPicking - previousData.totalPicking,
          packing: currentData.totalPacking - previousData.totalPacking,
          pickingTOs: currentData.totalPickingTOs - previousData.totalPickingTOs,
          packingHUs: currentData.totalPackingHUs - previousData.totalPackingHUs
        },
        period
      };
    },

    getPredictiveAnalytics: () => {
      const now = new Date();
      const hoursWorked = (now.getHours() - 5) + (now.getMinutes() / 60); 
      const pickingRate = hoursWorked > 0 ? totalPicking / hoursWorked : 0;
      const packingRate = hoursWorked > 0 ? totalPacking / hoursWorked : 0;
      const predictedPicking = pickingRate * 16;
      const predictedPacking = packingRate * 16;

      return {
        predictedPicking: Math.round(predictedPicking),
        predictedPacking: Math.round(predictedPacking),
        pickingRate: Number(pickingRate.toFixed(2)),
        packingRate: Number(packingRate.toFixed(2)),
        hoursWorked: Number(hoursWorked.toFixed(2)),
        predictionConfidence: 'low' 
      };
    }
  };
}
