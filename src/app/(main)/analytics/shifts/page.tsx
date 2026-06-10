"use client";

import { useMemo, useState } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Line, ReferenceLine, Cell, ComposedChart 
} from "recharts";
import { Loader2, AlertCircle, Trophy, Swords, BarChart3, Users } from "lucide-react";
import { getISOWeekNumber, getShiftLabel, useData } from "@/lib/data-context";
import { usePeriodData } from "@/lib/use-period-data";

type TimeRange = '30d' | '90d' | 'ytd' | 'all';
type Grouping = 'day' | 'week' | 'month';

export default function ShiftBenchmarkingPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [timeRange, setTimeRange] = useState<TimeRange>('90d');
  const [grouping, setGrouping] = useState<Grouping>('week');

  // Stáhneme VŠECHNA dostupná data (period="all"), filtrovat budeme lokálně v useMemo, ať je to bleskově rychlé
  const { pickingData: localPicking, packingData: localPacking, likpData } = useData();
  const { pickingData, packingData, loading } = usePeriodData('all', localPicking, localPacking, todayStr, false, "", likpData);

  const currentWeek = getISOWeekNumber(new Date());
  const isEvenWeek = currentWeek % 2 === 0;

  const { chartData, stats, orderTypeStats } = useMemo(() => {
    // 1. FILTRACE PODLE ZVOLENÉHO ČASU
    let pData = pickingData;
    let pckData = packingData;

    if (timeRange === '30d') {
      const limit = new Date(); limit.setDate(limit.getDate() - 30);
      pData = pData.filter(d => d.confirmed_at && new Date(d.confirmed_at) >= limit);
      pckData = pckData.filter(d => d.created_at && new Date(d.created_at) >= limit);
    } else if (timeRange === '90d') {
      const limit = new Date(); limit.setDate(limit.getDate() - 90);
      pData = pData.filter(d => d.confirmed_at && new Date(d.confirmed_at) >= limit);
      pckData = pckData.filter(d => d.created_at && new Date(d.created_at) >= limit);
    } else if (timeRange === 'ytd') {
      const y = new Date().getFullYear();
      pData = pData.filter(d => d.confirmed_at && new Date(d.confirmed_at).getFullYear() === y);
      pckData = pckData.filter(d => d.created_at && new Date(d.created_at).getFullYear() === y);
    }

    // 2. INICIALIZACE STATISTIK PRO CELÉ OBDOBÍ
    let aWins = 0; let bWins = 0; let draws = 0;
    const oStats = {
      a_tos: new Set<string>(), b_tos: new Set<string>(),
      a_hus: new Set<string>(), b_hus: new Set<string>(),
      a_normal_tos: new Set<string>(), a_express_tos: new Set<string>(), a_oe_tos: new Set<string>(),
      b_normal_tos: new Set<string>(), b_express_tos: new Set<string>(), b_oe_tos: new Set<string>(),
      a_normal_hus: new Set<string>(), a_express_hus: new Set<string>(), a_oe_hus: new Set<string>(),
      b_normal_hus: new Set<string>(), b_express_hus: new Set<string>(), b_oe_hus: new Set<string>(),
      a_operators: new Set<string>(), b_operators: new Set<string>(),
      a_ks: 0, b_ks: 0, a_pck_ks: 0, b_pck_ks: 0,
      a_weight: 0, b_weight: 0
    };

    const groupedMap = new Map<string, any>();

    // 3. POMOCNÉ FUNKCE PRO SESKUPOVÁNÍ
    const getGroupKey = (dateObj: Date) => {
      if (grouping === 'week') {
        const w = getISOWeekNumber(dateObj);
        return { key: `${dateObj.getFullYear()}-W${w}`, label: `Týden ${w}` };
      } else if (grouping === 'month') {
        const m = dateObj.getMonth();
        return { key: `${dateObj.getFullYear()}-${m}`, label: dateObj.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' }) };
      }
      return { key: dateObj.toISOString().split('T')[0], label: dateObj.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }) };
    };

    const ensureGroup = (dateObj: Date) => {
      const { key, label } = getGroupKey(dateObj);
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { 
          key, label, date: dateObj, 
          a_to_set: new Set<string>(), b_to_set: new Set<string>(), 
          a_hu_set: new Set<string>(), b_hu_set: new Set<string>() 
        });
      }
      return groupedMap.get(key);
    };

    // 4. ZPRACOVÁNÍ PICKINGU (Určení Směny A/B sekundu po sekundě)
    pData.forEach(p => {
      if (!p.confirmed_at) return;
      const dateObj = new Date(p.confirmed_at);
      const shift = getShiftLabel(dateObj);
      const toKey = `${p.to_number}-${p.to_item || Math.random()}`;
      const cat = p.category || 'Normal';
      
      const g = ensureGroup(dateObj);

      if (shift === 'A') {
        g.a_to_set.add(toKey);
        oStats.a_tos.add(toKey);
        oStats.a_ks += p.quantity;
        oStats.a_weight += (p.weight || 0);
        if (p.operator) oStats.a_operators.add(p.operator);
        if (cat === 'Express') oStats.a_express_tos.add(toKey);
        else if (cat === 'OE') oStats.a_oe_tos.add(toKey);
        else oStats.a_normal_tos.add(toKey);
      } else {
        g.b_to_set.add(toKey);
        oStats.b_tos.add(toKey);
        oStats.b_ks += p.quantity;
        oStats.b_weight += (p.weight || 0);
        if (p.operator) oStats.b_operators.add(p.operator);
        if (cat === 'Express') oStats.b_express_tos.add(toKey);
        else if (cat === 'OE') oStats.b_oe_tos.add(toKey);
        else oStats.b_normal_tos.add(toKey);
      }
    });

    // 5. ZPRACOVÁNÍ PACKINGU
    pckData.forEach(p => {
      if (!p.created_at) return;
      const dateObj = new Date(p.created_at);
      const shift = getShiftLabel(dateObj);
      const huKey = p.internal_hu;
      const cat = p.category || 'Normal';
      
      const g = ensureGroup(dateObj);

      if (shift === 'A') {
        g.a_hu_set.add(huKey);
        oStats.a_hus.add(huKey);
        oStats.a_pck_ks += (p.quantity || 0);
        if (p.operator) oStats.a_operators.add(p.operator);
        if (cat === 'Express') oStats.a_express_hus.add(huKey);
        else if (cat === 'OE') oStats.a_oe_hus.add(huKey);
        else oStats.a_normal_hus.add(huKey);
      } else {
        g.b_hu_set.add(huKey);
        oStats.b_hus.add(huKey);
        oStats.b_pck_ks += (p.quantity || 0);
        if (p.operator) oStats.b_operators.add(p.operator);
        if (cat === 'Express') oStats.b_express_hus.add(huKey);
        else if (cat === 'OE') oStats.b_oe_hus.add(huKey);
        else oStats.b_normal_hus.add(huKey);
      }
    });

    // 6. FINÁLNÍ TVORBA CHART DAT A "TUG OF WAR"
    const finalChartData = Array.from(groupedMap.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(g => ({
        label: g.label,
        a_tos: g.a_to_set.size,
        b_tos: g.b_to_set.size,
        a_hus: g.a_hu_set.size,
        b_hus: g.b_hu_set.size,
        cumulativeGap: 0 
      }));

    let cumulativeGap = 0;
    finalChartData.forEach(g => {
      // Náskok počítáme primárně přes Picking TO
      cumulativeGap += (g.a_tos - g.b_tos);
      g.cumulativeGap = cumulativeGap;
      
      if (g.a_tos > g.b_tos) aWins++;
      else if (g.b_tos > g.a_tos) bWins++;
      else if (g.a_tos > 0 || g.b_tos > 0) draws++; // Remíza jen když se reálně pracovalo
    });

    const totalMatches = aWins + bWins + draws;
    const aWinRate = totalMatches > 0 ? (aWins / totalMatches) * 100 : 0;
    const bWinRate = totalMatches > 0 ? (bWins / totalMatches) * 100 : 0;

    return {
      chartData: finalChartData,
      stats: { 
        aWins, bWins, draws, aWinRate, bWinRate, totalMatches,
        aTotalTo: oStats.a_tos.size, bTotalTo: oStats.b_tos.size,
        aTotalHu: oStats.a_hus.size, bTotalHu: oStats.b_hus.size,
        aKs: oStats.a_ks, bKs: oStats.b_ks,
        aPckKs: oStats.a_pck_ks, bPckKs: oStats.b_pck_ks,
        aWeight: oStats.a_weight, bWeight: oStats.b_weight,
        aOperators: oStats.a_operators.size, bOperators: oStats.b_operators.size
      },
      orderTypeStats: {
        a_normal_to: oStats.a_normal_tos.size, a_express_to: oStats.a_express_tos.size, a_oe_to: oStats.a_oe_tos.size,
        b_normal_to: oStats.b_normal_tos.size, b_express_to: oStats.b_express_tos.size, b_oe_to: oStats.b_oe_tos.size,
        a_normal_hu: oStats.a_normal_hus.size, a_express_hu: oStats.a_express_hus.size, a_oe_hu: oStats.a_oe_hus.size,
        b_normal_hu: oStats.b_normal_hus.size, b_express_hu: oStats.b_express_hus.size, b_oe_hu: oStats.b_oe_hus.size,
      }
    };
  }, [pickingData, packingData, timeRange, grouping]);

  const orderTypeComparisonTO = [
    { name: 'Normal (TO)', A: orderTypeStats.a_normal_to, B: orderTypeStats.b_normal_to },
    { name: 'Express (TO)', A: orderTypeStats.a_express_to, B: orderTypeStats.b_express_to },
    { name: 'OE (TO)', A: orderTypeStats.a_oe_to, B: orderTypeStats.b_oe_to },
  ];

  const orderTypeComparisonHU = [
    { name: 'Normal (HU)', A: orderTypeStats.a_normal_hu, B: orderTypeStats.b_normal_hu },
    { name: 'Express (HU)', A: orderTypeStats.a_express_hu, B: orderTypeStats.b_express_hu },
    { name: 'OE (HU)', A: orderTypeStats.a_oe_hu, B: orderTypeStats.b_oe_hu },
  ];

  const rows = [
    { label: 'Picking (TO) - Celkem', a: stats.aTotalTo, b: stats.bTotalTo },
    { label: '  ↳ z toho Normal (TO)', a: orderTypeStats.a_normal_to, b: orderTypeStats.b_normal_to, fmt: true, sub: true },
    { label: '  ↳ z toho Express (TO)', a: orderTypeStats.a_express_to, b: orderTypeStats.b_express_to, fmt: true, sub: true },
    { label: '  ↳ z toho OE (TO)', a: orderTypeStats.a_oe_to, b: orderTypeStats.b_oe_to, fmt: true, sub: true },
    { label: 'Picking (Ks) - Celkem', a: stats.aKs, b: stats.bKs, fmt: true },
    { label: 'Packing (HU) - Celkem', a: stats.aTotalHu, b: stats.bTotalHu },
    { label: '  ↳ z toho Normal (HU)', a: orderTypeStats.a_normal_hu, b: orderTypeStats.b_normal_hu, fmt: true, sub: true },
    { label: '  ↳ z toho Express (HU)', a: orderTypeStats.a_express_hu, b: orderTypeStats.b_express_hu, fmt: true, sub: true },
    { label: '  ↳ z toho OE (HU)', a: orderTypeStats.a_oe_hu, b: orderTypeStats.b_oe_hu, fmt: true, sub: true },
    { label: 'Packing (Ks) - Celkem', a: stats.aPckKs, b: stats.bPckKs, fmt: true },
    { label: 'Váha (kg)', a: stats.aWeight, b: stats.bWeight, fmt: true },
    { label: 'Operátoři (Unikátní)', a: stats.aOperators, b: stats.bOperators },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <Swords className="w-12 h-12 text-white/20 mx-auto" />
        <h2 className="text-xl font-bold text-white">Nedostatek dat pro Benchmarking</h2>
        <p className="text-white/60">Zvolte jiné časové období, nebo importujte více dat do historie.</p>
      </div>
    );
  }

  const overallWinner = stats.aTotalTo > stats.bTotalTo ? 'A' : stats.bTotalTo > stats.aTotalTo ? 'B' : 'Remíza';

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      
      {/* HEADER & OVLÁDÁNÍ */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Swords className="w-7 h-7 text-indigo-400" /> Benchmarking Směn (A vs B)
          </h1>
          <p className="text-white/40 text-sm mt-1">Dlouhodobé spravedlivé porovnání týmů rotujících na směnách.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
            {[ {id: 'day', label: 'Dny'}, {id: 'week', label: 'Týdny'}, {id: 'month', label: 'Měsíce'} ].map(g => (
              <button key={g.id} onClick={() => setGrouping(g.id as Grouping)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${grouping === g.id ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
            {[ {id: '30d', label: '30 Dní'}, {id: '90d', label: '90 Dní'}, {id: 'ytd', label: 'Letos'}, {id: 'all', label: 'Vše'} ].map(r => (
              <button key={r.id} onClick={() => setTimeRange(r.id as TimeRange)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${timeRange === r.id ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SOUHRNNÉ METRIKY & WIN RATE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Směna A */}
        <div className={`glass-panel p-6 relative overflow-hidden group border-t-4 ${overallWinner === 'A' ? 'border-t-emerald-400' : 'border-t-emerald-500/20'}`}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-emerald-400">
            <span className="text-9xl font-black">A</span>
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                <div className="text-xs font-semibold text-white/50 tracking-wider uppercase">Tým Směny A</div>
                {overallWinner === 'A' && <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-bold ml-auto flex items-center gap-1"><Trophy className="w-3 h-3"/> Vítěz</span>}
              </div>
              <div className="text-3xl font-black text-white tracking-tight">{stats.aTotalTo.toLocaleString()} <span className="text-lg text-white/40">TO</span></div>
              <div className="text-sm font-bold text-white/40 mt-1">{stats.aTotalHu.toLocaleString()} HU</div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="text-xs text-emerald-400/80 font-semibold">Win Rate: {stats.aWinRate.toFixed(1)}%</div>
              <div className="w-full h-1.5 bg-white/5 rounded-full mt-1 overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{ width: `${stats.aWinRate}%`}} /></div>
            </div>
          </div>
        </div>

        {/* Přetahovaná */}
        <div className="glass-panel p-6 flex flex-col justify-center items-center text-center">
          <Swords className="w-10 h-10 text-white/20 mb-3" />
          <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Přímá konfrontace</h3>
          <div className="flex w-full items-center justify-center gap-6">
            <div className="text-right">
              <div className="text-3xl font-black text-emerald-400">{stats.aWins}</div>
              <div className="text-xs text-white/40">Výher</div>
            </div>
            <div className="text-lg font-black text-white/20">vs</div>
            <div className="text-left">
              <div className="text-3xl font-black text-amber-400">{stats.bWins}</div>
              <div className="text-xs text-white/40">Výher</div>
            </div>
          </div>
          {stats.draws > 0 && <div className="text-xs text-white/30 mt-3">{stats.draws} remíz</div>}
        </div>

        {/* Směna B */}
        <div className={`glass-panel p-6 relative overflow-hidden group border-t-4 ${overallWinner === 'B' ? 'border-t-amber-400' : 'border-t-amber-500/20'}`}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-amber-400">
            <span className="text-9xl font-black">B</span>
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="text-xs font-semibold text-white/50 tracking-wider uppercase">Tým Směny B</div>
                {overallWinner === 'B' && <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-bold ml-auto flex items-center gap-1"><Trophy className="w-3 h-3"/> Vítěz</span>}
              </div>
              <div className="text-3xl font-black text-white tracking-tight">{stats.bTotalTo.toLocaleString()} <span className="text-lg text-white/40">TO</span></div>
              <div className="text-sm font-bold text-white/40 mt-1">{stats.bTotalHu.toLocaleString()} HU</div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="text-xs text-amber-400/80 font-semibold">Win Rate: {stats.bWinRate.toFixed(1)}%</div>
              <div className="w-full h-1.5 bg-white/5 rounded-full mt-1 overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${stats.bWinRate}%`}} /></div>
            </div>
          </div>
        </div>

      </div>

      {/* HLAVNÍ GRAFY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* PICKING BAR CHART */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Vývoj Picking TO</h3>
          <p className="text-xs text-white/40 mb-5">Porovnání vychystaných Transfer Orderů.</p>
          <div className="w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{color: '#fff'}} cursor={{fill: '#ffffff05'}} />
                <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '11px' }} />
                
                <Bar dataKey="a_tos" name="Směna A (TO)" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="b_tos" name="Směna B (TO)" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PACKING BAR CHART */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Vývoj Packing HU</h3>
          <p className="text-xs text-white/40 mb-5">Porovnání zabalených Handling Unitů.</p>
          <div className="w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{color: '#fff'}} cursor={{fill: '#ffffff05'}} />
                <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '11px' }} />
                
                <Bar dataKey="a_hus" name="Směna A (HU)" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="b_hus" name="Směna B (HU)" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KUMULATIVNÍ GAP (PŘETAHOVANÁ) */}
        <div className="glass-panel p-6 lg:col-span-2">
          <h3 className="text-lg font-bold text-white mb-1">Kumulativní Náskok Pickingu (Tug-of-War)</h3>
          <p className="text-xs text-white/40 mb-5">
            Čára ukazuje celkový rozdíl TO. Kladné hodnoty = vede A, záporné = vede B.
          </p>
          <div className="w-full h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
                
                <Bar dataKey="cumulativeGap" name="Náskok Směny A (v TO)">
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.cumulativeGap >= 0 ? '#10b981' : '#fbbf24'} />
                  ))}
                </Bar>
                <Line type="step" dataKey="cumulativeGap" stroke="rgba(255,255,255,0.3)" strokeWidth={2} dot={false} legendType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* POROVNÁNÍ TYPŮ ZAKÁZEK (NOVE) */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Priority Zakázek: Picking (TO)</h3>
          <p className="text-xs text-white/40 mb-5">Která směna odbavila více Normal / Express / OE.</p>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderTypeComparisonTO} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                <Bar dataKey="A" name="Směna A" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="B" name="Směna B" fill="#fbbf24" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Priority Zakázek: Packing (HU)</h3>
          <p className="text-xs text-white/40 mb-5">Která směna zabalila více Normal / Express / OE.</p>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderTypeComparisonHU} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                <Bar dataKey="A" name="Směna A" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="B" name="Směna B" fill="#fbbf24" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      <div className="glass-panel overflow-hidden">
        <div className="p-5 border-b border-white/5 bg-white/[0.02]">
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Detailní Srovnávací Výkaz (Za zvolené období)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Metrika</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                  <span className="flex items-center gap-1.5 justify-end"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Směna A</span>
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                  <span className="flex items-center gap-1.5 justify-end"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Směna B</span>
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Rozdíl</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-center">Lepší</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const diff = row.a - row.b;
                const better = diff > 0 ? 'A' : diff < 0 ? 'B' : null;
                return (
                  <tr key={i} className={`hover:bg-white/[0.03] transition-colors ${row.sub ? 'bg-black/20' : (i % 2 === 1 ? 'bg-white/[0.015]' : '')}`}>
                    <td className={`px-5 py-3 text-sm ${row.sub ? 'text-white/50 pl-8' : 'font-medium text-white/80 py-3.5'}`}>{row.label}</td>
                    <td className={`px-5 py-3 text-sm text-right ${row.sub ? 'text-white/60' : 'font-bold text-white/90'}`}>{row.fmt ? row.a.toLocaleString() : row.a}</td>
                    <td className={`px-5 py-3 text-sm text-right ${row.sub ? 'text-white/60' : 'font-bold text-white/90'}`}>{row.fmt ? row.b.toLocaleString() : row.b}</td>
                    <td className={`px-5 py-3 text-sm font-bold text-right ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-white/30'}`}>
                      {diff > 0 ? '+' : ''}{row.fmt ? diff.toLocaleString() : diff}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {!row.sub && better === 'A' && <span className="inline-block w-6 h-6 rounded-full bg-emerald-400/20 text-emerald-400 text-xs font-bold leading-6">A</span>}
                      {!row.sub && better === 'B' && <span className="inline-block w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold leading-6">B</span>}
                      {!row.sub && !better && <span className="text-white/20 text-xs">=</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
