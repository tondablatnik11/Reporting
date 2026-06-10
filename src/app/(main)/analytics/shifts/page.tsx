"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Line, ReferenceLine, Cell, ComposedChart, AreaChart, Area 
} from "recharts";
import { Loader2, AlertCircle, Trophy, Swords } from "lucide-react";
import { getISOWeekNumber, getShiftConfig } from "@/lib/data-context";

type TimeRange = '30d' | '90d' | 'ytd' | 'all';
type Grouping = 'day' | 'week' | 'month';

function mapShiftNameToAB(dateStr: string, shiftName: string) {
  const d = new Date(dateStr);
  const weekNum = getISOWeekNumber(d);
  const isEvenWeek = weekNum % 2 === 0;
  const config = getShiftConfig();
  const shiftAIsMorning = config.evenWeekShiftAMorning ? isEvenWeek : !isEvenWeek;
  const isMorning = shiftName === 'Ranní';
  if (shiftAIsMorning) return isMorning ? "A" : "B";
  return isMorning ? "B" : "A";
}

export default function ShiftBenchmarkingPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('90d');
  const [grouping, setGrouping] = useState<Grouping>('week');

  // Načítání dat se spouští při každé změně TimeRange - díky databázi to bude trvat milisekundy
  useEffect(() => {
    loadData(timeRange);
  }, [timeRange]);

  const loadData = async (range: TimeRange) => {
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      let start = new Date();
      if (range === '30d') start.setDate(start.getDate() - 30);
      else if (range === '90d') start.setDate(start.getDate() - 90);
      else if (range === 'ytd') start = new Date(start.getFullYear(), 0, 1);
      else if (range === 'all') start = new Date(2020, 0, 1);

      const { data: shiftData, error: shiftError } = await supabase.rpc('get_shift_benchmarking_data', {
        p_start_date: start.toISOString().split('T')[0],
        p_end_date: end.toISOString().split('T')[0]
      });

      if (shiftError) throw shiftError;
      setData(shiftData || []);
    } catch (err: any) {
      console.error("Shifts fetch error:", err);
      setError(err.message || "Nepodařilo se načíst data z databáze.");
    } finally {
      setLoading(false);
    }
  };

  const { chartData, stats, orderTypeStats } = useMemo(() => {
    const dailyMap = new Map<string, any>();
    
    data.forEach(d => {
      const shiftAB = mapShiftNameToAB(d.report_date, d.shift_name);
      if (!dailyMap.has(d.report_date)) {
        dailyMap.set(d.report_date, {
            date: d.report_date,
            A: { tos: 0, norm_to: 0, exp_to: 0, oe_to: 0, qty: 0, hus: 0, norm_hu: 0, exp_hu: 0, oe_hu: 0, pck_qty: 0, wt: 0, ops: 0 },
            B: { tos: 0, norm_to: 0, exp_to: 0, oe_to: 0, qty: 0, hus: 0, norm_hu: 0, exp_hu: 0, oe_hu: 0, pck_qty: 0, wt: 0, ops: 0 }
        });
      }
      const day = dailyMap.get(d.report_date);
      const t = day[shiftAB];
      t.tos += Number(d.pick_tos);
      t.norm_to += Number(d.pick_normal_tos);
      t.exp_to += Number(d.pick_express_tos);
      t.oe_to += Number(d.pick_oe_tos);
      t.qty += Number(d.pick_qty);
      t.hus += Number(d.pack_hus);
      t.norm_hu += Number(d.pack_normal_hus);
      t.exp_hu += Number(d.pack_express_hus);
      t.oe_hu += Number(d.pack_oe_hus);
      t.pck_qty += Number(d.pack_qty);
      t.wt += Number(d.total_weight);
      t.ops += Number(d.unique_operators);
    });

    const groupedMap = new Map<string, any>();
    let aTotalTo = 0, bTotalTo = 0, aTotalHu = 0, bTotalHu = 0;
    let aKs = 0, bKs = 0, aPckKs = 0, bPckKs = 0, aWeight = 0, bWeight = 0;
    let aOps = 0, bOps = 0, daysCount = 0;

    let a_normal_to = 0, a_express_to = 0, a_oe_to = 0;
    let b_normal_to = 0, b_express_to = 0, b_oe_to = 0;
    let a_normal_hu = 0, a_express_hu = 0, a_oe_hu = 0;
    let b_normal_hu = 0, b_express_hu = 0, b_oe_hu = 0;

    Array.from(dailyMap.values()).forEach(d => {
      const dateObj = new Date(d.date);
      let key = d.date;
      let label = dateObj.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });

      if (grouping === 'week') {
        const w = getISOWeekNumber(dateObj);
        key = `${dateObj.getFullYear()}-W${w}`;
        label = `Týden ${w}`;
      } else if (grouping === 'month') {
        const m = dateObj.getMonth();
        key = `${dateObj.getFullYear()}-${m}`;
        label = dateObj.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
      }

      if (!groupedMap.has(key)) {
        groupedMap.set(key, { key, label, a_tos: 0, b_tos: 0, a_hus: 0, b_hus: 0 });
      }
      const g = groupedMap.get(key)!;
      g.a_tos += d.A.tos; g.b_tos += d.B.tos;
      g.a_hus += d.A.hus; g.b_hus += d.B.hus;

      aTotalTo += d.A.tos; bTotalTo += d.B.tos;
      aTotalHu += d.A.hus; bTotalHu += d.B.hus;
      aKs += d.A.qty; bKs += d.B.qty;
      aPckKs += d.A.pck_qty; bPckKs += d.B.pck_qty;
      aWeight += d.A.wt; bWeight += d.B.wt;
      aOps += d.A.ops; bOps += d.B.ops;
      
      a_normal_to += d.A.norm_to; a_express_to += d.A.exp_to; a_oe_to += d.A.oe_to;
      b_normal_to += d.B.norm_to; b_express_to += d.B.exp_to; b_oe_to += d.B.oe_to;
      a_normal_hu += d.A.norm_hu; a_express_hu += d.A.exp_hu; a_oe_hu += d.A.oe_hu;
      b_normal_hu += d.B.norm_hu; b_express_hu += d.B.exp_hu; b_oe_hu += d.B.oe_hu;
      daysCount++;
    });

    const finalChartData = Array.from(groupedMap.values())
      .sort((a, b) => a.key.localeCompare(b.key));
      
    let cumulativeGap = 0;
    let aWins = 0, bWins = 0, draws = 0;

    finalChartData.forEach(g => {
      cumulativeGap += (g.a_tos - g.b_tos);
      g.cumulativeGap = cumulativeGap;
      
      if (g.a_tos > g.b_tos) aWins++;
      else if (g.b_tos > g.a_tos) bWins++;
      else if (g.a_tos > 0 || g.b_tos > 0) draws++;
    });

    const totalMatches = aWins + bWins + draws;
    const aWinRate = totalMatches > 0 ? (aWins / totalMatches) * 100 : 0;
    const bWinRate = totalMatches > 0 ? (bWins / totalMatches) * 100 : 0;

    return {
      chartData: finalChartData,
      stats: { 
        aWins, bWins, draws, aWinRate, bWinRate, totalMatches,
        aTotalTo, bTotalTo, aTotalHu, bTotalHu,
        aKs, bKs, aPckKs, bPckKs, aWeight, bWeight,
        aOperators: daysCount ? Math.round(aOps / daysCount) : 0, 
        bOperators: daysCount ? Math.round(bOps / daysCount) : 0
      },
      orderTypeStats: {
        a_normal_to, a_express_to, a_oe_to,
        b_normal_to, b_express_to, b_oe_to,
        a_normal_hu, a_express_hu, a_oe_hu,
        b_normal_hu, b_express_hu, b_oe_hu,
      }
    };
  }, [data, grouping]);

  const orderTypeComparisonTO = [
    { name: 'Normal', A: orderTypeStats.a_normal_to, B: orderTypeStats.b_normal_to },
    { name: 'Express', A: orderTypeStats.a_express_to, B: orderTypeStats.b_express_to },
    { name: 'OE', A: orderTypeStats.a_oe_to, B: orderTypeStats.b_oe_to },
  ];

  const orderTypeComparisonHU = [
    { name: 'Normal', A: orderTypeStats.a_normal_hu, B: orderTypeStats.b_normal_hu },
    { name: 'Express', A: orderTypeStats.a_express_hu, B: orderTypeStats.b_express_hu },
    { name: 'OE', A: orderTypeStats.a_oe_hu, B: orderTypeStats.b_oe_hu },
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
    { label: 'Ø Operátorů na směnu', a: stats.aOperators, b: stats.bOperators },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Chyba při načítání dat</h2>
        <p className="text-white/60">{error}</p>
        <button onClick={() => loadData(timeRange)} className="glass-button-primary mt-4">Zkusit znovu</button>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <Swords className="w-12 h-12 text-white/20 mx-auto" />
        <h2 className="text-xl font-bold text-white">Nedostatek dat pro Benchmarking</h2>
        <p className="text-white/60">Zvolte jiné časové období, nebo importujte více dat do historie.</p>
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setTimeRange('ytd')} className="bg-white/10 px-4 py-2 rounded-lg text-sm">Zkusit Letošní rok</button>
          <button onClick={() => setTimeRange('all')} className="bg-white/10 px-4 py-2 rounded-lg text-sm">Zkusit Všechna data</button>
        </div>
      </div>
    );
  }

  const overallWinner = stats.aTotalTo > stats.bTotalTo ? 'A' : stats.bTotalTo > stats.aTotalTo ? 'B' : 'Remíza';

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Vývoj Picking TO</h3>
          <p className="text-xs text-white/40 mb-5">Srovnání objemů TO v jednotlivých úsecích.</p>
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

        <div className="glass-panel p-6 lg:col-span-2">
          <h3 className="text-lg font-bold text-white mb-1">Kumulativní Náskok Pickingu (Tug-of-War)</h3>
          <p className="text-xs text-white/40 mb-5">Čára ukazuje celkový rozdíl TO. Kladné hodnoty = vede A, záporné = vede B.</p>
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
