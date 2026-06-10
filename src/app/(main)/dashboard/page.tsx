"use client";

import { useMemo, useState } from "react";
import { 
  LayoutDashboard, PackageSearch, Box, Users, 
  TrendingUp, AlertOctagon, Trophy, Zap, Layers
} from "lucide-react";
import { 
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from "recharts";
import { useData } from "@/lib/data-context";
import { usePeriodData, aggregateToChartData, aggregateShiftStats, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";

const PRIORITIES_COLORS = { Normal: "#10b981", Express: "#f59e0b", OE: "#ef4444" };
const SHIFT_COLORS = { A: "#10b981", B: "#fbbf24" };

export default function DashboardPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);

  const { pickingData: localPicking, packingData: localPacking, likpData } = useData();
  const { pickingData, packingData, loading } = usePeriodData(period, localPicking, localPacking, dateValue, false, "", likpData);

  // 1. Agregace pro hlavní graf
  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period, dateValue), [pickingData, packingData, period, dateValue]);

  // 2. Základní KPI
  const totalPickKs = pickingData.reduce((s, r) => s + r.quantity, 0);
  const totalPackKs = packingData.reduce((s, r) => s + (r.quantity || 0), 0);
  const totalTOs = new Set(pickingData.map(r => `${r.to_number}-${r.to_item || Math.random()}`)).size;
  const totalHUs = new Set(packingData.map(r => r.internal_hu)).size;
  const uniqueOperators = new Set([
    ...pickingData.filter(r => r.operator).map(r => r.operator),
    ...packingData.filter(r => r.operator).map(r => r.operator)
  ]).size;

  // 3. Agregace pro Priority (Normal/Express/OE)
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
    ];
  }, [pickingData]);

  // 4. Srovnání Směn (Mini)
  const shiftStats = useMemo(() => aggregateShiftStats(pickingData, packingData), [pickingData, packingData]);
  const shiftChartData = [
    { name: 'Směna A', Picking: shiftStats.a.pickingTOs, Packing: shiftStats.a.packingHUs },
    { name: 'Směna B', Picking: shiftStats.b.pickingTOs, Packing: shiftStats.b.packingHUs },
  ];

  // 5. Leaderboard Operátorů
  const topOperators = useMemo(() => {
    const pickers = new Map<string, number>();
    const packers = new Map<string, number>();

    pickingData.forEach(p => {
      if (!p.operator) return;
      pickers.set(p.operator, (pickers.get(p.operator) || 0) + 1); // Počítáme řádky/TO
    });
    
    packingData.forEach(p => {
      if (!p.operator) return;
      packers.set(p.operator, (packers.get(p.operator) || 0) + 1); // Počítáme HU
    });

    return {
      pickers: Array.from(pickers.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      packers: Array.from(packers.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [pickingData, packingData]);

  const xLabel = period === "day" ? "fullTime" : "time";

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <LayoutDashboard className="w-7 h-7 text-emerald-400" /> Manažerský Přehled
          </h1>
          <p className="text-white/40 text-sm mt-1">Shrnutí výkonu, priorit a kapacit za vybrané období.</p>
        </div>
        <PeriodSelector 
          period={period} 
          onChangePeriod={setPeriod} 
          loading={loading}
          dateValue={dateValue}
          onChangeDate={setDateValue}
        />
      </div>

      {/* KPI KARTY */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-6 border-l-4 border-l-blue-500/80 hover:bg-white/[0.03] transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Vychystáno (Picking)</p>
              <h3 className="text-3xl font-black text-white">{totalTOs.toLocaleString()} <span className="text-sm font-medium text-white/30">TO</span></h3>
              <p className="text-sm font-bold text-blue-400 mt-1">{totalPickKs.toLocaleString()} Ks</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-xl"><PackageSearch className="w-6 h-6 text-blue-400" /></div>
          </div>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-purple-500/80 hover:bg-white/[0.03] transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Zabaleno (Packing)</p>
              <h3 className="text-3xl font-black text-white">{totalHUs.toLocaleString()} <span className="text-sm font-medium text-white/30">HU</span></h3>
              <p className="text-sm font-bold text-purple-400 mt-1">{totalPackKs.toLocaleString()} Ks</p>
            </div>
            <div className="p-3 bg-purple-500/10 rounded-xl"><Box className="w-6 h-6 text-purple-400" /></div>
          </div>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-emerald-500/80 hover:bg-white/[0.03] transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Produktivita</p>
              <h3 className="text-3xl font-black text-white">
                {totalTOs > 0 ? (totalPickKs / totalTOs).toFixed(1) : "0"} <span className="text-sm font-medium text-white/30">Ks / TO</span>
              </h3>
              <p className="text-sm font-bold text-emerald-400 mt-1">Hustota zakázek</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl"><Layers className="w-6 h-6 text-emerald-400" /></div>
          </div>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-amber-500/80 hover:bg-white/[0.03] transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Lidské zdroje</p>
              <h3 className="text-3xl font-black text-white">{uniqueOperators}</h3>
              <p className="text-sm font-bold text-amber-400 mt-1">Aktivních pracovníků</p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-xl"><Users className="w-6 h-6 text-amber-400" /></div>
          </div>
        </div>
      </div>

      {/* HLAVNÍ GRAF VÝKONU */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" /> Vývoj celkového objemu (TO vs HU)
        </h3>
        <p className="text-xs text-white/40 mb-6">Porovnání dynamiky mezi vychystáváním a balením. Linky ukazují trend, sloupce reálný objem.</p>
        <div className="h-[350px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-white/30">Načítám data...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey={xLabel} stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '11px' }} />
                <Bar dataKey="pickingTOs" name="Picking (TO)" fill="#3b82f6" fillOpacity={0.8} radius={[3,3,0,0]} />
                <Bar dataKey="packingHUs" name="Packing (HU)" fill="#a855f7" fillOpacity={0.8} radius={[3,3,0,0]} />
                <Line type="monotone" dataKey="pickingTOs" name="Trend Picking" stroke="#60d4ff" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="packingHUs" name="Trend Packing" stroke="#e4b4ff" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* STRUKTURA A SROVNÁNÍ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* KOLÁČOVÝ GRAF PRIORIT */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-rose-400" /> Mix Priorit (Picking TO)
          </h3>
          <p className="text-xs text-white/40 mb-2">Jak velkou část kapacity tvořily urgentní zakázky?</p>
          <div className="h-[220px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={priorityStats} innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                  {priorityStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip 
                  formatter={(value: any, name: any, props: any) => [`${value} TO (${props.payload.pct.toFixed(1)}%)`, name]}
                  contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} 
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Popisek uprostřed grafu */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
              <span className="text-2xl font-black text-white">{totalTOs}</span>
              <span className="text-xs font-semibold text-white/40 uppercase">TO Celkem</span>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {priorityStats.map(s => (
              <div key={s.name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-white/60">{s.name} ({s.pct.toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* MINI SROVNÁNÍ SMĚN */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Výkon Směn (A vs B)
          </h3>
          <p className="text-xs text-white/40 mb-2">Rychlé srovnání hrubého výkonu na objemy.</p>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shiftChartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.6)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                <Bar dataKey="Picking" name="Picking (TO)" fill="#10b981" radius={[0,3,3,0]} barSize={20} />
                <Bar dataKey="Packing" name="Packing (HU)" fill="#fbbf24" radius={[0,3,3,0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LEADERBOARD OPERÁTORŮ */}
        <div className="glass-panel p-6 flex flex-col">
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" /> Top Operátoři
          </h3>
          <p className="text-xs text-white/40 mb-4">Pět nejaktivnějších operátorů podle objemu.</p>
          
          <div className="flex-1 grid grid-cols-2 gap-4">
            {/* Pickeři */}
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-white/5 pb-2">
                <PackageSearch className="w-3.5 h-3.5" /> Best Pickeři
              </h4>
              <div className="space-y-2.5">
                {topOperators.pickers.length > 0 ? topOperators.pickers.map(([name, count], i) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-white/80 truncate pr-2"><span className="text-white/30 mr-1">{i+1}.</span> {name}</span>
                    <span className="font-bold text-white">{count}</span>
                  </div>
                )) : <div className="text-xs text-white/30">Žádná data</div>}
              </div>
            </div>

            {/* Packeři */}
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-white/5 pb-2">
                <Box className="w-3.5 h-3.5" /> Best Packeři
              </h4>
              <div className="space-y-2.5">
                {topOperators.packers.length > 0 ? topOperators.packers.map(([name, count], i) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-white/80 truncate pr-2"><span className="text-white/30 mr-1">{i+1}.</span> {name}</span>
                    <span className="font-bold text-white">{count}</span>
                  </div>
                )) : <div className="text-xs text-white/30">Žádná data</div>}
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
