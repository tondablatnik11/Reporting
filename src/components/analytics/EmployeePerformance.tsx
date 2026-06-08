"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/data-context";
import { PickingRecord, PackingRecord } from "@/lib/data-context";
import { PackageSearch, Box, Users, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface SortIconProps {
  col: string;
  sortCol: string;
  sortDir: "asc" | "desc";
}

const SortIcon = ({ col, sortCol, sortDir }: SortIconProps) => {
  if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 opacity-20 group-hover:opacity-100 transition-opacity" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-white" /> : <ArrowDown className="w-3 h-3 text-white" />;
};

interface ThProps {
  id: string;
  label: string;
  align?: "left" | "right";
  sortCol: string;
  sortDir: "asc" | "desc";
  onSort: (col: string) => void;
}

const Th = ({ id, label, align = "left", sortCol, sortDir, onSort }: ThProps) => (
  <th 
    onClick={() => onSort(id)} 
    className={`px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider cursor-pointer group hover:bg-white/5 transition-colors ${align === "right" ? "text-right" : "text-left"}`}
  >
    <div className={`flex items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
      {label} <SortIcon col={id} sortCol={sortCol} sortDir={sortDir} />
    </div>
  </th>
);


interface EmployeePerformanceProps {
  filterType?: "all" | "picking" | "packing";
  pickingData?: PickingRecord[];
  packingData?: PackingRecord[];
  loading?: boolean;
}

export default function EmployeePerformance({
  filterType = "all",
  pickingData: propPickingData,
  packingData: propPackingData,
  loading = false,
}: EmployeePerformanceProps) {
  const context = useData();
  const finalPicking = propPickingData !== undefined ? propPickingData : (context?.pickingData || []);
  const finalPacking = propPackingData !== undefined ? propPackingData : (context?.packingData || []);

  const [sortCol, setSortCol] = useState<string>(filterType === "picking" ? "pickingTOs" : filterType === "packing" ? "packingHUs" : "totalKs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const employeeStats = useMemo(() => {
    const statsMap = new Map<string, {
      operator: string;
      pickingTOs: Set<string>;
      pickingKs: number;
      packingHUs: Set<string>;
      packingKs: number;
      weight: number;
      shifts: Set<string>;
      pickingCategories: Record<string, Set<string>>;
      packingCategories: Record<string, Set<string>>;
      pickingQueues: Record<string, Set<string>>;
    }>();

    const addStat = (op: string) => {
      if (!statsMap.has(op)) {
        statsMap.set(op, { 
          operator: op, 
          pickingTOs: new Set(), 
          pickingKs: 0, 
          packingHUs: new Set(), 
          packingKs: 0, 
          weight: 0, 
          shifts: new Set(),
          pickingCategories: { Normal: new Set(), Express: new Set(), OE: new Set() },
          packingCategories: { Normal: new Set(), Express: new Set(), OE: new Set() },
          pickingQueues: {}
        });
      }
      return statsMap.get(op)!;
    };

    finalPicking.forEach(p => {
      if (!p.operator) return;
      const stat = addStat(p.operator);
      stat.pickingKs += p.quantity;
      const toKey = `${p.to_number}-${p.to_item || '1'}`;
      stat.pickingTOs.add(toKey);
      stat.weight += (p.weight || 0);
      
      const cat = p.category || 'Normal';
      if (!stat.pickingCategories[cat]) stat.pickingCategories[cat] = new Set();
      stat.pickingCategories[cat].add(toKey);

      const queue = p.queue || 'Ostatní';
      if (!stat.pickingQueues[queue]) stat.pickingQueues[queue] = new Set();
      stat.pickingQueues[queue].add(toKey);

      if (p.confirmed_at) {
        const hour = new Date(p.confirmed_at).getHours();
        stat.shifts.add(hour >= 5 && hour < 14 ? "Ranní" : "Odpolední");
      }
    });

    finalPacking.forEach(p => {
      if (!p.operator) return;
      const stat = addStat(p.operator);
      stat.packingKs += (p.quantity || 0);
      stat.weight += (p.weight || 0);
      
      if (p.internal_hu) {
        stat.packingHUs.add(p.internal_hu);
        const cat = p.category || 'Normal';
        if (!stat.packingCategories[cat]) stat.packingCategories[cat] = new Set();
        stat.packingCategories[cat].add(p.internal_hu);
      }
      
      if (p.created_at) {
        const hour = new Date(p.created_at).getHours();
        stat.shifts.add(hour >= 5 && hour < 14 ? "Ranní" : "Odpolední");
      }
    });

    const rawStats = Array.from(statsMap.values()).map(s => {
      const pickCatStats = {
        Normal: s.pickingCategories['Normal']?.size || 0,
        Express: s.pickingCategories['Express']?.size || 0,
        OE: s.pickingCategories['OE']?.size || 0,
      };
      
      const packCatStats = {
        Normal: s.packingCategories['Normal']?.size || 0,
        Express: s.packingCategories['Express']?.size || 0,
        OE: s.packingCategories['OE']?.size || 0,
      };

      const queueStats = {
        PI_PA: (s.pickingQueues['PI_PA']?.size || 0) + (s.pickingQueues['PI_PA_OE']?.size || 0),
        PI_PL: (s.pickingQueues['PI_PL']?.size || 0) + (s.pickingQueues['PI_PL_OE']?.size || 0),
        PI_PL_FU: (s.pickingQueues['PI_PL_FU']?.size || 0) + (s.pickingQueues['PI_PL_FUOE']?.size || 0),
      };

      return {
        operator: s.operator,
        pickingTOs: s.pickingTOs.size,
        pickingKs: s.pickingKs,
        packingHUs: s.packingHUs.size,
        packingKs: s.packingKs,
        weight: s.weight,
        totalKs: s.pickingKs + s.packingKs,
        shiftLabel: Array.from(s.shifts).sort().join(" / ") || "-",
        pickCatStats,
        packCatStats,
        queueStats,
      };
    });

    const filtered = rawStats.filter(s => {
      if (filterType === "picking") return s.pickingTOs > 0;
      if (filterType === "packing") return s.packingHUs > 0;
      return s.pickingTOs > 0 || s.packingHUs > 0;
    });

    return filtered.sort((a: any, b: any) /* eslint-disable-line @typescript-eslint/no-explicit-any */ => {
      let valA = a[sortCol];
      let valB = b[sortCol];

      if (sortCol.includes('.')) {
        const parts = sortCol.split('.');
        valA = a[parts[0]]?.[parts[1]];
        valB = b[parts[0]]?.[parts[1]];
      }

      if (sortCol === "avgKs") {
        valA = a.pickingTOs > 0 ? a.pickingKs / a.pickingTOs : 0;
        valB = b.pickingTOs > 0 ? b.pickingKs / b.pickingTOs : 0;
      }

      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
    });
  }, [finalPicking, finalPacking, filterType, sortCol, sortDir]);

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
              <Th id="operator" label="Operátor"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <Th id="shiftLabel" label="Směna"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              
              {filterType === "all" && (
                <>
                  <Th id="pickingTOs" label="Picking (TO)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="pickingKs" label="Picking (Ks)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="packingHUs" label="Packing (HU)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="packingKs" label="Packing (Ks)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="weight" label="Váha (kg)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="totalKs" label="Celkem (Ks)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                </>
              )}

              {filterType === "picking" && (
                <>
                  <Th id="pickingTOs" label="Vypickované TO" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="pickCatStats.Normal" label="Normal TO" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="pickCatStats.Express" label="Express TO" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="pickCatStats.OE" label="OE TO" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="queueStats.PI_PA" label="Z toho Balíky (PI_PA)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="queueStats.PI_PL" label="Z toho Palety (PI_PL)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="avgKs" label="Průměr Ks / TO" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                </>
              )}

              {filterType === "packing" && (
                <>
                  <Th id="packingHUs" label="Zabalené HU" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="packCatStats.Normal" label="Normal HU" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="packCatStats.Express" label="Express HU" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="packCatStats.OE" label="OE HU" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="packingKs" label="Celkem Kusů (Ks)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th id="weight" label="Váha (kg)" align="right"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
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
                  <td className="px-5 py-3.5 text-xs font-semibold text-white/50">{row.shiftLabel}</td>
                  
                  {filterType === "all" && (
                    <>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.pickingTOs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-blue-400 text-right">{row.pickingKs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.packingHUs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-purple-400 text-right">{row.packingKs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.weight.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="px-5 py-3.5 text-sm font-bold text-emerald-400 text-right">{row.totalKs.toLocaleString()}</td>
                    </>
                  )}

                  {filterType === "picking" && (
                    <>
                      <td className="px-5 py-3.5 text-sm font-bold text-white/90 text-right">{row.pickingTOs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.pickCatStats.Normal.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-yellow-400/80 text-right">{row.pickCatStats.Express.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-rose-400 text-right">{row.pickCatStats.OE.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/50 text-right">{row.queueStats.PI_PA.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/50 text-right">{row.queueStats.PI_PL.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{avgKsPerTo.toLocaleString()}</td>
                    </>
                  )}

                  {filterType === "packing" && (
                    <>
                      <td className="px-5 py-3.5 text-sm font-bold text-white/90 text-right">{row.packingHUs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.packCatStats.Normal.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-yellow-400/80 text-right">{row.packCatStats.Express.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-rose-400 text-right">{row.packCatStats.OE.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-purple-400 text-right">{row.packingKs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 text-right">{row.weight.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
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
