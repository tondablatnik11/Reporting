"use client";

import { Users, PackageSearch, Box, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { useAggregatedData, useData } from "@/lib/data-context";

interface EmployeeStats {
  name: string;
  pickingCount: number;
  pickingTOs: number;
  packingCount: number;
  packingHUs: number;
  active: boolean;
}

interface EmployeePerformanceProps {
  timeRange?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  showOnlyActiveOperators?: boolean;
  filterType?: 'all' | 'picking' | 'packing';
}

export default function EmployeePerformance({ timeRange = 'daily', showOnlyActiveOperators = false, filterType = 'all' }: EmployeePerformanceProps) {
  const { pickingData, packingData } = useData();
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([]);

  useEffect(() => {
    if (!pickingData.length && !packingData.length) {
      setEmployeeStats([]);
      return;
    }

    const statsMap = new Map<string, EmployeeStats>();

    // Process picking data
    pickingData.forEach(record => {
      if (!record.operator) return;
      const name = record.operator;
      if (record.quantity > 0) {
        if (!statsMap.has(name)) {
          statsMap.set(name, { name, pickingCount: 0, pickingTOs: 0, packingCount: 0, packingHUs: 0, active: true });
        }
        const stats = statsMap.get(name)!;
        stats.pickingCount += record.quantity;
        stats.pickingTOs += 1;
      }
    });

    // Process packing data
    packingData.forEach(record => {
      if (!record.operator || !record.hu_number) return;
      const name = record.operator;
      if ((record.quantity || 0) > 0) {
        if (!statsMap.has(name)) {
          statsMap.set(name, { name, pickingCount: 0, pickingTOs: 0, packingCount: 0, packingHUs: 0, active: true });
        }
        const stats = statsMap.get(name)!;
        stats.packingCount += record.quantity || 0;
        stats.packingHUs += 1;
      }
    });

    let statsArray = Array.from(statsMap.values());

    // Filter based on type
    if (filterType === 'picking') {
      statsArray = statsArray.filter(e => e.pickingTOs > 0);
      statsArray.sort((a, b) => b.pickingTOs - a.pickingTOs);
    } else if (filterType === 'packing') {
      statsArray = statsArray.filter(e => e.packingHUs > 0);
      statsArray.sort((a, b) => b.packingHUs - a.packingHUs);
    } else {
      statsArray.sort((a, b) => (b.pickingCount + b.packingCount) - (a.pickingCount + a.packingCount));
    }

    setEmployeeStats(statsArray);
  }, [pickingData, packingData, filterType]);

  if (employeeStats.length === 0) {
    return (
      <div className="glass-panel p-8 text-center">
        <Users className="w-12 h-12 text-blue-400 mx-auto mb-4 opacity-50" />
        <p className="text-white/50">Zatím nejsou k dispozici žádná data o výkonu zaměstnanců. Proveďte import dat ze SAPu.</p>
      </div>
    );
  }

  const getMedal = (index: number) => {
    if (index === 0) return <span className="text-lg">🥇</span>;
    if (index === 1) return <span className="text-lg">🥈</span>;
    if (index === 2) return <span className="text-lg">🥉</span>;
    return <span className="text-sm text-white/30 font-bold w-6 text-center inline-block">{index + 1}.</span>;
  };

  // Determine max values for progress bars
  const maxPicking = Math.max(...employeeStats.map(e => e.pickingTOs), 1);
  const maxPacking = Math.max(...employeeStats.map(e => e.packingHUs), 1);
  const maxTotal = Math.max(...employeeStats.map(e => e.pickingTOs + e.packingHUs), 1);

  const title = filterType === 'picking' ? 'Výkon Pickerů' : filterType === 'packing' ? 'Výkon Packerů' : 'Výkon Zaměstnanců';
  const accentColor = filterType === 'picking' ? 'blue' : filterType === 'packing' ? 'purple' : 'blue';

  return (
    <div className="glass-panel">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-3">
          <Trophy className={`w-5 h-5 text-${accentColor}-400`} />
          {title} ({employeeStats.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-white/[0.03]">
            <tr>
              <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider w-16">#</th>
              <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Operátor</th>
              {(filterType === 'all' || filterType === 'picking') && (
                <>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                    <span className="flex items-center gap-1 justify-end"><PackageSearch className="w-3 h-3" /> TO</span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                    <span className="flex items-center gap-1 justify-end"><PackageSearch className="w-3 h-3" /> Ks</span>
                  </th>
                </>
              )}
              {(filterType === 'all' || filterType === 'packing') && (
                <>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                    <span className="flex items-center gap-1 justify-end"><Box className="w-3 h-3" /> HU</span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                    <span className="flex items-center gap-1 justify-end"><Box className="w-3 h-3" /> Ks</span>
                  </th>
                </>
              )}
              <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider w-48">Výkon</th>
            </tr>
          </thead>
          <tbody>
            {employeeStats.map((emp, index) => {
              const barValue = filterType === 'picking' ? emp.pickingTOs / maxPicking
                : filterType === 'packing' ? emp.packingHUs / maxPacking
                : (emp.pickingTOs + emp.packingHUs) / maxTotal;
              const barColor = filterType === 'packing' ? '#b18cff' : '#6391ff';

              return (
                <tr key={emp.name} className={`transition-colors hover:bg-white/[0.03] ${index % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-5 py-3.5 text-sm">{getMedal(index)}</td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-white/90">{emp.name}</td>
                  {(filterType === 'all' || filterType === 'picking') && (
                    <>
                      <td className="px-5 py-3.5 text-sm font-bold text-blue-400 text-right">{emp.pickingTOs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-blue-400/70 text-right">{emp.pickingCount.toLocaleString()}</td>
                    </>
                  )}
                  {(filterType === 'all' || filterType === 'packing') && (
                    <>
                      <td className="px-5 py-3.5 text-sm font-bold text-purple-400 text-right">{emp.packingHUs.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-purple-400/70 text-right">{emp.packingCount.toLocaleString()}</td>
                    </>
                  )}
                  <td className="px-5 py-3.5">
                    <div className="w-full h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${Math.max(barValue * 100, 2)}%`, background: `linear-gradient(90deg, ${barColor}cc, ${barColor}66)` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}