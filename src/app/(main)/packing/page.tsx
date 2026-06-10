"use client";

import { useMemo, useState } from "react";
import { Box, Users, Activity, AlertOctagon, Zap } from "lucide-react";
import {
  ComposedChart, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from "recharts";
import { useData, getShiftLabel } from "@/lib/data-context";
import { usePeriodData, aggregateToChartData, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";
import EmployeePerformance from "@/components/analytics/EmployeePerformance";

const PRIORITIES_COLORS = { Normal: "#10b981", Express: "#f59e0b", OE: "#ef4444" };
const SHIFT_COLORS = { A: "#10b981", B: "#fbbf24" };

export default function PackingPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);

  const { pickingData: localPicking, packingData: localPacking, likpData } = useData();
  const { pickingData, packingData, previousPackingData, loading } = usePeriodData(
    period, localPicking, localPacking, dateValue, false, "", likpData
  );

  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period, dateValue), [pickingData, packingData, period, dateValue]);

  // Aktuální KPI
  const totalKs = packingData.reduce((s, r) => s + (r.quantity || 0), 0);
  const totalHUs = new Set(packingData.map(r => r.internal_hu)).size;
  const uniqueOperators = new Set(packingData.filter(r => r.operator).map(r => r.operator)).size;

  // Předchozí KPI (pro výpočet trendu)
  const prevTotalKs = previousPackingData.reduce((s, r) => s + (r.quantity || 0), 0);
  const prevTotalHUs = new Set(previousPackingData.map(r => r.internal_hu)).size;

  const renderTrendBadge = (current: number, previous: number) => {
    if (!previous || period === 'all') return null;
    const diff = ((current - previous) / previous) * 100;
    const isPos = diff >= 0;
    return (
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ml-2 ${isPos ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
        {isPos ? '+' : ''}{diff.toFixed(1)}% vs minule
      </span>
    );
  };

  // Rozpad priorit
  const priorityStats = useMemo(() => {
    let nHu = 0, eHu = 0, oHu = 0;
    const seenHUs = new Set<string>();

    packingData.forEach(p => {
      const key = p.internal_hu;
      if (!seenHUs.has(key)) {
        seenHUs.add(key);
        const cat = p.category || 'Normal';
        if (cat === 'Express') eHu++;
        else if (cat === 'OE') oHu++;
        else nHu++;
      }
    });

    const total = nHu + eHu + oHu;
    return [
      { name: 'Normal', value: nHu, pct: total > 0 ? (nHu/total)*100 : 0, color: PRIORITIES_COLORS.Normal },
      { name: 'Express', value: eHu, pct: total > 0 ? (eHu/total)*100 : 0, color: PRIORITIES_COLORS.Express },
      { name: 'OE', value: oHu, pct: total > 0 ? (oHu/total)*100 : 0, color: PRIORITIES_COLORS.OE },
    ].filter(x => x.value > 0);
  }, [packingData]);

  // Rozpad směn
  const shiftStats = useMemo(() => {
    let aHu = 0, bHu = 0;
    const seenHUs = new Set<string>();

    packingData.forEach(p => {
      if (!p.created_at) return;
      const key = p.internal_hu;
      if (!seenHUs.has(key)) {
        seenHUs.add(key);
        const shift = getShiftLabel(new Date(p.created_at));
        if (shift === 'A') aHu++;
        else if (shift === 'B') bHu++;
      }
    });

    const total = aHu + bHu;
    return [
      { name: 'Směna A', value: aHu, pct: total > 0 ? (aHu/total)*100 : 0, color: SHIFT_COLORS.A },
      { name: 'Směna B', value: bHu, pct: total > 0 ? (bHu/total)*100 : 0, color: SHIFT_COLORS.B },
    ].filter(x => x.value > 0);
  }, [packingData]);

  // Leaderboard operátorů
  const operatorLeaderboard = useMemo(() => {
    const map = new Map<string, { name: string, hus: Set<string>, ks: number }>();
    packingData.forEach(p => {
      if (!p.operator) return;
      if (!map.has(p.operator)) map.set(p.operator, { name: p.operator, hus: new Set(), ks: 0 });
      const entry = map.get(p.operator)!;
      entry.hus.add(p.internal_hu);
      entry.ks += (p.quantity || 0);
    });
    return Array.from(map.values())
      .map(x => ({ name: x.name, HUs: x.hus.size, Ks: x.ks }))
      .sort((a, b) => b.HUs - a.HUs)
      .slice(0, 15); 
  }, [packingData]);

  const xKey = period === "day" ? "fullTime" : "time";

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Box className="w-7 h-7 text-purple-400" /> Detailní Přehled – Packing
          </h1>
          <p className="text-white/40 text-sm mt-1">Sledování výkonnosti balení a kompletace</p>
        </div>
        <PeriodSelector 
          period={period} 
          onChangePeriod={setPeriod} 
          dateValue={dateValue}
          onChangeDate={setDateValue}
          loading={loading}
        />
      </div>

      {/* KPI KARTY */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-6 border-l-4 border-l-purple-500/80 hover:bg-white/[0.03] transition-colors">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Zabaleno (HU)</p>
          <div className="text-3xl font-black text-white flex items-center">
            {totalHUs.toLocaleString()} {renderTrendBadge(totalHUs, prevTotalHUs)}
          </div>
          <p className="text-sm font-medium text-white/40 mt-1">Handling Units</p>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-purple-400/50 hover:bg-white/[0.03] transition-colors">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Objem (Ks)</p>
          <div className="text-3xl font-black text-white flex items-center">
            {totalKs.toLocaleString()} {renderTrendBadge(totalKs, prevTotalKs)}
          </div>
          <p className="text-sm font-medium text-white/40 mt-1">Fyzické kusy</p>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-emerald-500/80 hover:bg-white/[0.03] transition-colors">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Hustota (Ks/HU)</p>
          <div className="text-3xl font-black text-white flex items-center">
            {totalHUs > 0 ? (totalKs / totalHUs).toFixed(1) : "0"}
            {renderTrendBadge(totalHUs > 0 ? (totalKs / totalHUs) : 0, prevTotalHUs > 0 ? (prevTotalKs / prevTotalHUs) : 0)}
          </div>
          <p className="text-sm font-medium text-white/40 mt-1">Průměr Ks na jednu HU</p>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-amber-500/80 hover:bg-white/[0.03] transition-colors">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Lidské zdroje</p>
          <div className="text-3xl font-black text-white flex items-center">
            {uniqueOperators}
          </div>
          <p className="text-sm font-medium text-white/40 mt-1">Aktivních Packerů (Ø {uniqueOperators > 0 ? Math.round(totalHUs / uniqueOperators) : 0} HU/os)</p>
        </div>
      </div>

      {/* DONUT GRAFY (MIX) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 w-full text-center sm:text-left">
            <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2 mb-2">
              <AlertOctagon className="w-5 h-5 text-rose-400" /> Mix Priorit
            </h3>
            <p className="text-xs text-white/40 mb-4">Podíl urgentních zakázek (Normal vs Express vs OE).</p>
            <div className="space-y-2">
              {priorityStats.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-sm text-white/80">{s.name}</span>
                  </div>
                  <div className="text-sm font-bold text-white">{s.pct.toFixed(1)}% <span className="text-xs text-white/40 font-normal ml-1">({s.value})</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="w-40 h-40 shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={priorityStats} innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value" stroke="none">
                  {priorityStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value: any, name: any) => [`${value} HU`, name]} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-white">{totalHUs}</span>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 w-full text-center sm:text-left">
            <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2 mb-2">
              <Zap className="w-5 h-5 text-amber-400" /> Podíl Směn
            </h3>
            <p className="text-xs text-white/40 mb-4">Která směna (A vs B) zabalila v tomto období více HU.</p>
            <div className="space-y-2">
              {shiftStats.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-sm text-white/80">{s.name}</span>
                  </div>
                  <div className="text-sm font-bold text-white">{s.pct.toFixed(1)}% <span className="text-xs text-white/40 font-normal ml-1">({s.value})</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="w-40 h-40 shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={shiftStats} innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value" stroke="none">
                  {shiftStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value: any, name: any) => [`${value} HU`, name]} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* DVOJGRAF TRENDŮ (ÚPRAVA: Grafy vedle sebe) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Celkový objem */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" /> Vývoj Packingu (Kusy vs HU)
          </h3>
          <p className="text-xs text-white/40 mb-6">Porovnání trendu Handling Units s fyzickým objemem (Ks).</p>
          <div className="h-[280px] w-full">
            {loading ? <div className="h-full flex items-center justify-center text-white/30">Načítám data...</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorKsPack" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="xKey" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                  
                  <Area yAxisId="left" type="monotone" dataKey="packing" name="Objem (Ks)" fill="url(#colorKsPack)" stroke="#a855f7" strokeWidth={2} />
                  <Bar yAxisId="right" dataKey="packingHUs" name="Handling Unity (HU)" fill="#e4b4ff" radius={[2,2,0,0]} barSize={20} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* NOVÉ: Hodinový/Časový rozpad priorit */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-purple-400" /> Rozpad zakázek podle typu (HU)
          </h3>
          <p className="text-xs text-white/40 mb-6">Struktura typů zakázek (Normal / Express / OE) v průběhu času.</p>
          <div className="h-[280px] w-full">
            {loading ? <div className="h-full flex items-center justify-center text-white/30">Načítám data...</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey={xKey} stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                  <Bar dataKey="packingNormal" name="Normální" stackId="cat" fill="#10b981" />
                  <Bar dataKey="packingExpress" name="Express" stackId="cat" fill="#f59e0b" />
                  <Bar dataKey="packingOE" name="OE" stackId="cat" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* LEADERBOARD OPERÁTORŮ */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" /> Produktivita Packerů (Top 15)
        </h3>
        <p className="text-xs text-white/40 mb-6">Žebříček operátorů podle celkového počtu zabalených HU za vybrané období.</p>
        <div className="h-[400px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-white/30">Načítám data...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={operatorLeaderboard} margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} stroke="#ffffff80" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                  contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} 
                  formatter={(value: any, name: any) => [value, name === 'HUs' ? 'Handling Unity (HU)' : 'Kusy (Ks)']}
                />
                <Bar dataKey="HUs" fill="#a855f7" radius={[0,4,4,0]} barSize={16}>
                  <LabelList dataKey="HUs" position="right" fill="#ffffff" fontSize={11} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <EmployeePerformance filterType="packing" pickingData={pickingData} packingData={packingData} loading={loading} />
    </div>
  );
}
