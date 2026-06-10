"use client";

import { useMemo, useState } from "react";
import { PackageSearch, Users, Layers, Activity, AlertOctagon, Zap } from "lucide-react";
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

export default function PickingPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);

  const { pickingData: localPicking, packingData: localPacking, likpData } = useData();
  const { pickingData, packingData, previousPickingData, loading } = usePeriodData(
    period, localPicking, localPacking, dateValue, false, "", likpData
  );

  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period, dateValue), [pickingData, packingData, period, dateValue]);

  // Aktuální KPI
  const totalKs = pickingData.reduce((s, r) => s + r.quantity, 0);
  const totalTOs = new Set(pickingData.map(r => `${r.to_number}-${r.to_item || Math.random()}`)).size;
  const uniqueOperators = new Set(pickingData.filter(r => r.operator).map(r => r.operator)).size;

  // Předchozí KPI (pro výpočet trendu)
  const prevTotalKs = previousPickingData.reduce((s, r) => s + r.quantity, 0);
  const prevTotalTOs = new Set(previousPickingData.map(r => `${r.to_number}-${r.to_item || Math.random()}`)).size;

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
    let nTo = 0, eTo = 0, oTo = 0;
    const seenTOs = new Set<string>();

    pickingData.forEach(p => {
      const key = `${p.to_number}-${p.to_item || Math.random()}`;
      if (!seenTOs.has(key)) {
        seenTOs.add(key);
        const cat = p.category || 'Normal';
        if (cat === 'Express') eTo++;
        else if (cat === 'OE') oTo++;
        else nTo++;
      }
    });

    const total = nTo + eTo + oTo;
    return [
      { name: 'Normal', value: nTo, pct: total > 0 ? (nTo/total)*100 : 0, color: PRIORITIES_COLORS.Normal },
      { name: 'Express', value: eTo, pct: total > 0 ? (eTo/total)*100 : 0, color: PRIORITIES_COLORS.Express },
      { name: 'OE', value: oTo, pct: total > 0 ? (oTo/total)*100 : 0, color: PRIORITIES_COLORS.OE },
    ].filter(x => x.value > 0);
  }, [pickingData]);

  // Rozpad směn
  const shiftStats = useMemo(() => {
    let aTo = 0, bTo = 0;
    const seenTOs = new Set<string>();

    pickingData.forEach(p => {
      if (!p.confirmed_at) return;
      const key = `${p.to_number}-${p.to_item || Math.random()}`;
      if (!seenTOs.has(key)) {
        seenTOs.add(key);
        const shift = getShiftLabel(new Date(p.confirmed_at));
        if (shift === 'A') aTo++;
        else if (shift === 'B') bTo++;
      }
    });

    const total = aTo + bTo;
    return [
      { name: 'Směna A', value: aTo, pct: total > 0 ? (aTo/total)*100 : 0, color: SHIFT_COLORS.A },
      { name: 'Směna B', value: bTo, pct: total > 0 ? (bTo/total)*100 : 0, color: SHIFT_COLORS.B },
    ].filter(x => x.value > 0);
  }, [pickingData]);

  // Leaderboard operátorů
  const operatorLeaderboard = useMemo(() => {
    const map = new Map<string, { name: string, tos: Set<string>, ks: number }>();
    pickingData.forEach(p => {
      if (!p.operator) return;
      if (!map.has(p.operator)) map.set(p.operator, { name: p.operator, tos: new Set(), ks: 0 });
      const entry = map.get(p.operator)!;
      entry.tos.add(`${p.to_number}-${p.to_item || Math.random()}`);
      entry.ks += p.quantity;
    });
    return Array.from(map.values())
      .map(x => ({ name: x.name, TOs: x.tos.size, Ks: x.ks }))
      .sort((a, b) => b.TOs - a.TOs)
      .slice(0, 15); // Top 15
  }, [pickingData]);

  const xKey = period === "day" ? "fullTime" : "time";

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <PackageSearch className="w-7 h-7 text-blue-400" /> Detailní Přehled – Picking
          </h1>
          <p className="text-white/40 text-sm mt-1">Sledování výkonnosti vychystávání materiálu ze skladu</p>
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
        <div className="glass-panel p-6 border-l-4 border-l-blue-500/80 hover:bg-white/[0.03] transition-colors">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Vychystáno (TO)</p>
          <div className="text-3xl font-black text-white flex items-center">
            {totalTOs.toLocaleString()} {renderTrendBadge(totalTOs, prevTotalTOs)}
          </div>
          <p className="text-sm font-medium text-white/40 mt-1">Transfer Ordery</p>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-blue-400/50 hover:bg-white/[0.03] transition-colors">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Objem (Ks)</p>
          <div className="text-3xl font-black text-white flex items-center">
            {totalKs.toLocaleString()} {renderTrendBadge(totalKs, prevTotalKs)}
          </div>
          <p className="text-sm font-medium text-white/40 mt-1">Fyzické kusy</p>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-emerald-500/80 hover:bg-white/[0.03] transition-colors">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Hustota (Ks/TO)</p>
          <div className="text-3xl font-black text-white flex items-center">
            {totalTOs > 0 ? (totalKs / totalTOs).toFixed(1) : "0"}
            {renderTrendBadge(totalTOs > 0 ? (totalKs / totalTOs) : 0, prevTotalTOs > 0 ? (prevTotalKs / prevTotalTOs) : 0)}
          </div>
          <p className="text-sm font-medium text-white/40 mt-1">Průměr Ks na jeden TO</p>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-amber-500/80 hover:bg-white/[0.03] transition-colors">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Lidské zdroje</p>
          <div className="text-3xl font-black text-white flex items-center">
            {uniqueOperators}
          </div>
          <p className="text-sm font-medium text-white/40 mt-1">Aktivních Pickerů (Ø {uniqueOperators > 0 ? Math.round(totalTOs / uniqueOperators) : 0} TO/os)</p>
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
                <Tooltip formatter={(value: any, name: any) => [`${value} TO`, name]} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-white">{totalTOs}</span>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 w-full text-center sm:text-left">
            <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2 mb-2">
              <Zap className="w-5 h-5 text-amber-400" /> Podíl Směn
            </h3>
            <p className="text-xs text-white/40 mb-4">Která směna (A vs B) odbavila v tomto období více TO.</p>
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
                <Tooltip formatter={(value: any, name: any) => [`${value} TO`, name]} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* HLAVNÍ GRAF TRENDU */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" /> Vývoj Pickingu v čase
        </h3>
        <p className="text-xs text-white/40 mb-6">Porovnání trendu Transfer Orderů s fyzickým objemem (Ks).</p>
        <div className="h-[320px] w-full">
          {loading ? <div className="h-full flex items-center justify-center text-white/30">Načítám data...</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorKs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey={xKey} stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                
                <Area yAxisId="left" type="monotone" dataKey="picking" name="Objem (Ks)" fill="url(#colorKs)" stroke="#3b82f6" strokeWidth={2} />
                <Bar yAxisId="right" dataKey="pickingTOs" name="Transfer Ordery (TO)" fill="#60d4ff" radius={[2,2,0,0]} barSize={20} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* LEADERBOARD OPERÁTORŮ */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" /> Produktivita Pickerů (Top 15)
        </h3>
        <p className="text-xs text-white/40 mb-6">Žebříček operátorů podle celkového počtu odbavených TO za vybrané období.</p>
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
                  formatter={(value: any, name: string) => [value, name === 'TOs' ? 'Transfer Ordery (TO)' : 'Kusy (Ks)']}
                />
                <Bar dataKey="TOs" fill="#3b82f6" radius={[0,4,4,0]} barSize={16}>
                  <LabelList dataKey="TOs" position="right" fill="#ffffff" fontSize={11} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <EmployeePerformance filterType="picking" pickingData={pickingData} packingData={packingData} loading={loading} />
    </div>
  );
}
