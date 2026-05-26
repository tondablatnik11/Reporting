"use client";

import { useMemo } from "react";
import { useData } from "@/lib/data-context";
import { PickingRecord, PackingRecord } from "@/lib/data-context";
import { PackageSearch, Box, Users, AlertCircle } from "lucide-react";

interface EmployeePerformanceProps {
  timeRange?: string;
  filterType?: "all" | "picking" | "packing";
  pickingData?: PickingRecord[];
  packingData?: PackingRecord[];
  loading?: boolean;
}

export default function EmployeePerformance({
  timeRange,
  filterType = "all",
  pickingData: propPickingData,
  packingData: propPackingData,
  loading = false,
}: EmployeePerformanceProps) {
  const context = useData();
  const localPicking = context?.pickingData || [];
  const localPacking = context?.packingData || [];

  const finalPicking = propPickingData !== undefined ? propPickingData : localPicking;
  const finalPacking = propPackingData !== undefined ? propPackingData : localPacking;

  const employeeStats = useMemo(() => {
    const statsMap = new Map<string, {
      operator: string;
      pickingTOs: Set<string>;
      pickingKs: number;
      packingHUs: Set<string>;
      packingKs: number;
      weight: number;
    }>();

    finalPicking.forEach(p => {
      if (!p.operator) return;
      if (!statsMap.has(p.operator)) {
        statsMap.set(p.operator, {
          operator: p.operator,
          pickingTOs: new Set(),
          pickingKs: 0,
          packingHUs: new Set(),
          packingKs: 0,
          weight: 0
        });
      }
      const stat = statsMap.get(p.operator)!;
      stat.pickingKs += p.quantity;
      stat.pickingTOs.add(`${p.to_number}-${p.to_item || '1'}`);
    });

    finalPacking.forEach(p => {
      if (!p.operator) return;
      if (!statsMap.has(p.operator)) {
        statsMap.set(p.operator, {
          operator: p.operator,
          pickingTOs: new Set(),
          pickingKs: 0,
          packingHUs: new Set(),
          packingKs: 0,
          weight: 0
        });
      }
      const stat = statsMap.get(p.operator)!;
      stat.packingKs += (p.quantity || 0);
      stat.weight += (p.weight || 0);
      if (p.internal_hu) {
        stat.packingHUs.add(p.internal_hu);
      }
    });

    return Array.from(statsMap.values())
      .map(s => ({
        operator: s.operator,
        pickingTOs: s.pickingTOs.size,
        pickingKs: s.pickingKs,
        packingHUs: s.packingHUs.size,
        packingKs: s.packingKs,
        weight: s.weight,
        totalKs: s.pickingKs + s.packingKs
      }))
      .filter(s => {
        if (filterType === "picking") return s.pickingTOs > 0;
        if (filterType === "packing") return s.packingHUs > 0;
        return s.pickingTOs > 0 || s.packingHUs > 0;
      })
      .sort((a, b) => b.totalKs - a.totalKs);
  }, [finalPicking, finalPacking, filterType]);

  if (loading) {
    return (
      <div className="glass-panel p-8 text-center text-white/40 flex items-center justify-center gap-2">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Načítám data o výkonu zaměstnanců...
      </div>
    );
  }

  if (employeeStats.length === 0) {
    return (
      <div className="glass-panel p-8 text-center text-white/40 flex flex-col items-center justify-center gap-2">
        <AlertCircle className="w-8 h-8 text-white/20 mb-1" />
        <p className="font-medium">Zatím nejsou k dispozici žádná data o výkonu zaměstnanců.</p>
        <p className="text-xs text-white/30">Proveďte import dat ze SAPu nebo zvolte jiné časové období.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
        <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" /> 
          Výkon zaměstnanců ({filterType === "picking" ? "Picking" : filterType === "packing" ? "Packing" : "Celkově"})
        </h3>
        <span className="text-xs text-white/40 font-medium">Počet operátorů: {employeeStats.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Operátor</th>
              
              {filterType === "all" && (
                <>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Picking (TO)</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Picking (Ks)</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Packing (HU)</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Packing (Ks)</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Celkem (Ks)</th>
                </>
              )}

              {filterType === "picking" && (
                <>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Vypickované TO</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Celkem Kusů (Ks)</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Průměr Ks / TO</th>
                </>
              )}

              {filterType === "packing" && (
                <>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Zabalené HU</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Celkem Kusů (Ks)</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Celková Váha (kg)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {employeeStats.map((row, i) => {
              const avgKsPerTo = row.pickingTOs > 0 ? Math.round(row.pickingKs / row.pickingTOs) : 0;
              return (
                <tr key={row.operator} className={`hover:bg-white/[0.03] transition-colors ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-5 py-3.5 text-sm font-medium text-white/80">{row.operator}</td>
                  
                  {filterType === "all" && (
                    <>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.pickingTOs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-blue-400 text-right">{row.pickingKs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.packingHUs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-purple-400 text-right">{row.packingKs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-bold text-emerald-400 text-right">{row.totalKs.toLocaleString()}</td>
                    </>
                  )}

                  {filterType === "picking" && (
                    <>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.pickingTOs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-bold text-blue-400 text-right">{row.pickingKs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{avgKsPerTo.toLocaleString()}</td>
                    </>
                  )}

                  {filterType === "packing" && (
                    <>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.packingHUs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-bold text-purple-400 text-right">{row.packingKs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{Number(row.weight.toFixed(2)).toLocaleString()}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
