"use client";

import { useMemo, useState } from "react";
import { ComposedChart, AreaChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { PackageSearch, Box, Users } from "lucide-react";
import { useData, getShiftLabel } from "@/lib/data-context";
import { usePeriodData, aggregateToChartData, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";

export default function HourlyTrendPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);
  const { pickingData: localPicking, packingData: localPacking, likpData } = useData();
  const { pickingData, packingData, loading } = usePeriodData(period, localPicking, localPacking, dateValue, false, "", likpData);

  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period, dateValue), [pickingData, packingData, period, dateValue]);

  const totalPickingTOs = new Set(pickingData.map(r => `${r.to_number}-${r.to_item || Math.random()}`)).size;
  const totalPicking = pickingData.reduce((s, r) => s + r.quantity, 0);
  const totalPackingHUs = new Set(packingData.map(r => r.internal_hu)).size;
  const totalPacking = packingData.reduce((s, r) => s + (r.quantity || 0), 0);

  const shiftStats = useMemo(() => {
    const a = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), operators: new Set<string>() };
    const b = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), operators: new Set<string>() };

    pickingData.forEach(p => {
      if (!p.confirmed_at) return;
      const shift = getShiftLabel(new Date(p.confirmed_at));
      const t = shift === "A" ? a : b;
      t.pickingKs += p.quantity;
      t.pickingTOs.add(`${p.to_number}-${p.to_item || Math.random()}`);
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
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white tracking-wide">Vývoj v čase</h1>
          <PeriodSelector 
            period={period} 
            onChangePeriod={setPeriod} 
            loading={loading}
            dateValue={dateValue}
            onChangeDate={setDateValue}
          />
      </div>

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
        <h3 className="text-lg font-bold text-white mb-6">Rozložení celkového výkonu v čase</h3>
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
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                <Bar yAxisId="left" dataKey="picking" name="Picking (Ks)" fill="#6391ff" fillOpacity={0.7} radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="pickingTOs" name="Picking (TO)" stroke="#60d4ff" strokeWidth={3} dot={{ r: 4, fill: "#60d4ff", strokeWidth: 0 }} />
                <Bar yAxisId="left" dataKey="packing" name="Packing (Ks)" fill="#b18cff" fillOpacity={0.7} radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="packingHUs" name="Packing (HU)" stroke="#e4b4ff" strokeWidth={3} dot={{ r: 4, fill: "#e4b4ff", strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Categories Area Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
            <PackageSearch className="w-5 h-5 text-blue-400" /> Struktura Picking zakázek
          </h3>
          <div className="h-[280px] w-full">
            {loading ? <div className="h-full flex items-center justify-center text-white/30">Načítám...</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNorm" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorOe" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" vertical={false} />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="pickingNormal" name="Normální (Ks)" stackId="1" stroke="#10b981" fill="url(#colorNorm)" strokeWidth={2} />
                  <Area type="monotone" dataKey="pickingExpress" name="Express (Ks)" stackId="1" stroke="#f59e0b" fill="url(#colorExp)" strokeWidth={2} />
                  <Area type="monotone" dataKey="pickingOE" name="OE (Ks)" stackId="1" stroke="#ef4444" fill="url(#colorOe)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
            <Box className="w-5 h-5 text-purple-400" /> Struktura Packing zakázek
          </h3>
          <div className="h-[280px] w-full">
            {loading ? <div className="h-full flex items-center justify-center text-white/30">Načítám...</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNormP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorExpP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorOeP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" vertical={false} />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="packingNormal" name="Normální (Ks)" stackId="1" stroke="#10b981" fill="url(#colorNormP)" strokeWidth={2} />
                  <Area type="monotone" dataKey="packingExpress" name="Express (Ks)" stackId="1" stroke="#f59e0b" fill="url(#colorExpP)" strokeWidth={2} />
                  <Area type="monotone" dataKey="packingOE" name="OE (Ks)" stackId="1" stroke="#ef4444" fill="url(#colorOeP)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
