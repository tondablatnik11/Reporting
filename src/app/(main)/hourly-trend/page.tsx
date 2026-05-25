"use client";

import { useMemo, useState } from "react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { PackageSearch, Box, Users } from "lucide-react";
import { useData, getShiftLabel } from "@/lib/data-context";
import { usePeriodData, aggregateToChartData, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";

export default function HourlyTrendPage() {
  const [period, setPeriod] = useState<Period>("day");
  const { pickingData: localPicking, packingData: localPacking } = useData();
  const { pickingData, packingData, loading } = usePeriodData(period, localPicking, localPacking);

  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period), [pickingData, packingData, period]);

  const totalPickingTOs = new Set(pickingData.map(r => r.to_number)).size;
  const totalPicking = pickingData.reduce((s, r) => s + r.quantity, 0);
  const totalPackingHUs = new Set(packingData.map(r => r.internal_hu)).size;
  const totalPacking = packingData.reduce((s, r) => s + (r.quantity || 0), 0);

  // Shift A/B stats
  const shiftStats = useMemo(() => {
    const a = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), operators: new Set<string>() };
    const b = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), operators: new Set<string>() };

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
      t.packingHUs.add(p.internal_hu);
      if (p.operator) t.operators.add(p.operator);
    });

    return {
      a: { pickingKs: a.pickingKs, packingKs: a.packingKs, pickingTOs: a.pickingTOs.size, packingHUs: a.packingHUs.size, operators: a.operators.size },
      b: { pickingKs: b.pickingKs, packingKs: b.packingKs, pickingTOs: b.pickingTOs.size, packingHUs: b.packingHUs.size, operators: b.operators.size },
    };
  }, [pickingData, packingData]);

  const xLabel = period === "day" ? "fullTime" : "time";

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white tracking-wide">Vývoj v čase</h1>
        <PeriodSelector value={period} onChange={setPeriod} loading={loading} />
      </div>

      {/* 4 KPI Cards: Celkem Pick, Celkem Pack, Směna A, Směna B */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <PackageSearch className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Celkem Picking</div>
            <div className="text-2xl font-black text-white">{totalPickingTOs} <span className="text-sm font-medium text-white/40">TO</span></div>
            <div className="text-sm text-blue-400/70">{totalPicking.toLocaleString()} Ks</div>
          </div>
        </div>

        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
            <Box className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Celkem Packing</div>
            <div className="text-2xl font-black text-white">{totalPackingHUs} <span className="text-sm font-medium text-white/40">HU</span></div>
            <div className="text-sm text-purple-400/70">{totalPacking.toLocaleString()} Ks</div>
          </div>
        </div>

        <div className="glass-panel p-5 border-l-4 border-l-emerald-500/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            <div className="text-xs font-bold text-white/50 uppercase tracking-wider">Směna A</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-lg font-black text-blue-400">{shiftStats.a.pickingTOs} <span className="text-xs text-white/30">TO</span></div>
              <div className="text-xs text-white/40">{shiftStats.a.pickingKs.toLocaleString()} Ks</div>
            </div>
            <div>
              <div className="text-lg font-black text-purple-400">{shiftStats.a.packingHUs} <span className="text-xs text-white/30">HU</span></div>
              <div className="text-xs text-white/40">{shiftStats.a.packingKs.toLocaleString()} Ks</div>
            </div>
          </div>
          <div className="text-xs text-white/30 mt-2 flex items-center gap-1"><Users className="w-3 h-3" /> {shiftStats.a.operators} operátorů</div>
        </div>

        <div className="glass-panel p-5 border-l-4 border-l-amber-500/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="text-xs font-bold text-white/50 uppercase tracking-wider">Směna B</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-lg font-black text-blue-400">{shiftStats.b.pickingTOs} <span className="text-xs text-white/30">TO</span></div>
              <div className="text-xs text-white/40">{shiftStats.b.pickingKs.toLocaleString()} Ks</div>
            </div>
            <div>
              <div className="text-lg font-black text-purple-400">{shiftStats.b.packingHUs} <span className="text-xs text-white/30">HU</span></div>
              <div className="text-xs text-white/40">{shiftStats.b.packingKs.toLocaleString()} Ks</div>
            </div>
          </div>
          <div className="text-xs text-white/30 mt-2 flex items-center gap-1"><Users className="w-3 h-3" /> {shiftStats.b.operators} operátorů</div>
        </div>
      </div>

      {/* Main chart */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-6">Rozložení výkonu v čase</h3>
        <div className="h-[460px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-white/30">Načítám data ze Supabase...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey={xLabel} stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} label={{ value: "Ks", angle: -90, position: "insideLeft", style: { fill: "rgba(255,255,255,0.3)", fontSize: 10 } }} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} label={{ value: "TO / HU", angle: 90, position: "insideRight", style: { fill: "rgba(255,255,255,0.3)", fontSize: 10 } }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                <Bar yAxisId="left" dataKey="picking" name="Picking (Ks)" fill="#6391ff" fillOpacity={0.7} radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="pickingTOs" name="Picking (TO)" stroke="#60d4ff" strokeWidth={2.5} dot={{ r: 4, fill: "#60d4ff", strokeWidth: 0 }} />
                <Bar yAxisId="left" dataKey="packing" name="Packing (Ks)" fill="#b18cff" fillOpacity={0.7} radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="packingHUs" name="Packing (HU)" stroke="#e4b4ff" strokeWidth={2.5} dot={{ r: 4, fill: "#e4b4ff", strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Data table */}
      <div className="glass-panel overflow-hidden">
        <div className="p-5 border-b border-white/5 bg-white/[0.02]">
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Přesná data</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Čas / Datum</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Picking (Ks)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Picking (TO)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Packing (Ks)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Packing (HU)</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row, i) => (
                <tr key={i} className={`hover:bg-white/[0.03] transition-colors ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-5 py-3 text-sm font-medium text-white/80">{row.fullTime || row.time}</td>
                  <td className="px-5 py-3 text-sm font-bold text-blue-400 text-right">{row.picking.toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-blue-400/70 text-right">{row.pickingTOs}</td>
                  <td className="px-5 py-3 text-sm font-bold text-purple-400 text-right">{row.packing.toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-purple-400/70 text-right">{row.packingHUs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
