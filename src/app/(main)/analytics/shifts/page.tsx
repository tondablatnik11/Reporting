"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, ReferenceLine, Cell, ComposedChart 
} from "recharts";
import { Loader2, AlertCircle, Trophy, Swords, CalendarDays, TrendingUp, Layers } from "lucide-react";
import { getISOWeekNumber, getShiftConfig } from "@/lib/data-context";

type TimeRange = '30d' | '90d' | 'ytd' | 'all';
type Grouping = 'day' | 'week' | 'month';

// Pomocná funkce pro převod historického "Ranní/Odpolední" na "Směnu A/B" v daný den
function mapShiftNameToAB(dateStr: string, shiftName: string) {
  const d = new Date(dateStr);
  const weekNum = getISOWeekNumber(d);
  const isEvenWeek = weekNum % 2 === 0;
  const config = getShiftConfig();
  
  // Zjistíme, jestli v daný týden měla Směna A ranní
  const shiftAIsMorning = config.evenWeekShiftAMorning ? isEvenWeek : !isEvenWeek;
  const isMorning = shiftName === 'Ranní';
  
  if (shiftAIsMorning) {
    return isMorning ? "A" : "B";
  } else {
    return isMorning ? "B" : "A";
  }
}

export default function ShiftBenchmarkingPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('90d');
  const [grouping, setGrouping] = useState<Grouping>('week');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: shiftData, error: shiftError } = await supabase.rpc('get_shift_summary');
      if (shiftError) throw shiftError;
      setData(shiftData || []);
    } catch (err: any) {
      console.error("Shifts fetch error:", err);
      setError(err.message || "Nepodařilo se načíst data z databáze.");
    } finally {
      setLoading(false);
    }
  };

  // 1. Zpracování dat a převod na A/B
  const processedData = useMemo(() => {
    const dailyMap = new Map<string, { date: string; a_tos: number; b_tos: number; a_hus: number; b_hus: number }>();
    
    data.forEach(d => {
      if (!d.report_date) return;
      const shiftAB = mapShiftNameToAB(d.report_date, d.shift_name);
      
      if (!dailyMap.has(d.report_date)) {
        dailyMap.set(d.report_date, { date: d.report_date, a_tos: 0, b_tos: 0, a_hus: 0, b_hus: 0 });
      }
      
      const day = dailyMap.get(d.report_date)!;
      if (shiftAB === 'A') {
        day.a_tos += Number(d.pick_tos) || 0;
        day.a_hus += Number(d.pack_hus) || 0;
      } else {
        day.b_tos += Number(d.pick_tos) || 0;
        day.b_hus += Number(d.pack_hus) || 0;
      }
    });

    return Array.from(dailyMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  // 2. Filtrace podle času a Seskupování
  const { chartData, stats } = useMemo(() => {
    const now = new Date();
    let filtered = processedData;

    // Filtrování časového okna
    if (timeRange === '30d') {
      const limit = new Date(now); limit.setDate(now.getDate() - 30);
      filtered = filtered.filter(d => new Date(d.date) >= limit);
    } else if (timeRange === '90d') {
      const limit = new Date(now); limit.setDate(now.getDate() - 90);
      filtered = filtered.filter(d => new Date(d.date) >= limit);
    } else if (timeRange === 'ytd') {
      const y = now.getFullYear();
      filtered = filtered.filter(d => new Date(d.date).getFullYear() === y);
    }

    // Seskupování (Day, Week, Month)
    const groupedMap = new Map<string, any>();
    filtered.forEach(d => {
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
        groupedMap.set(key, { key, label, a_tos: 0, b_tos: 0, a_hus: 0, b_hus: 0, daysCount: 0 });
      }
      const g = groupedMap.get(key)!;
      g.a_tos += d.a_tos; g.b_tos += d.b_tos;
      g.a_hus += d.a_hus; g.b_hus += d.b_hus;
      g.daysCount += 1;
    });

    const finalChartData = Array.from(groupedMap.values());

    // Výpočet "Přetahované" (Kumulativní náskok TO)
    let cumulativeGap = 0;
    finalChartData.forEach(g => {
      cumulativeGap += (g.a_tos - g.b_tos);
      g.cumulativeGap = cumulativeGap;
    });

    // Výpočet Win-Ratu (Kdo vyhrál více úseků)
    let aWins = 0; let bWins = 0; let draws = 0;
    let aTotalTo = 0; let bTotalTo = 0;
    let aTotalHu = 0; let bTotalHu = 0;

    finalChartData.forEach(g => {
      if (g.a_tos > g.b_tos) aWins++;
      else if (g.b_tos > g.a_tos) bWins++;
      else draws++;

      aTotalTo += g.a_tos; bTotalTo += g.b_tos;
      aTotalHu += g.a_hus; bTotalHu += g.b_hus;
    });

    const totalMatches = aWins + bWins + draws;
    const aWinRate = totalMatches > 0 ? (aWins / totalMatches) * 100 : 0;
    const bWinRate = totalMatches > 0 ? (bWins / totalMatches) * 100 : 0;

    return {
      chartData: finalChartData,
      stats: { aWins, bWins, draws, aWinRate, bWinRate, aTotalTo, bTotalTo, aTotalHu, bTotalHu, totalMatches }
    };
  }, [processedData, timeRange, grouping]);

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
        <button onClick={loadData} className="glass-button-primary mt-4">Zkusit znovu</button>
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
          <p className="text-white/40 text-sm mt-1">Dlouhodobé férové porovnání týmů na základě reálného střídání směn.</p>
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
          <p className="text-xs text-white/40 mb-5">Srovnání objemů TO v jednotlivých úsecích.</p>
          <div className="w-full h-[300px]">
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

        {/* KUMULATIVNÍ GAP (PŘETAHOVANÁ) */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Kumulativní Náskok (Tug-of-War)</h3>
          <p className="text-xs text-white/40 mb-5">
            Čára ukazuje celkový rozdíl TO. Kladné hodnoty = vyhrává A, záporné = vyhrává B.
          </p>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.6}/>
                    <stop offset="50%" stopColor="#10b981" stopOpacity={0}/>
                    <stop offset="50%" stopColor="#fbbf24" stopOpacity={0}/>
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.6}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
                
                {/* OPRAVA: Přesun radiusu na Bar */}
                <Bar dataKey="cumulativeGap" name="Náskok Směny A (v TO)" radius={[3,3,3,3]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.cumulativeGap >= 0 ? '#10b981' : '#fbbf24'} />
                  ))}
                </Bar>
                <Line type="step" dataKey="cumulativeGap" stroke="rgba(255,255,255,0.3)" strokeWidth={2} dot={false} legendType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PACKING AREA CHART */}
        <div className="glass-panel p-6 lg:col-span-2">
          <h3 className="text-lg font-bold text-white mb-1">Vývoj Packing HU v čase</h3>
          <p className="text-xs text-white/40 mb-5">Plošné srovnání objemů balení.</p>
          <div className="w-full h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                  <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4}/><stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '11px' }} />
                
                <Area type="monotone" dataKey="a_hus" name="Směna A (HU)" stroke="#10b981" fill="url(#colorA)" strokeWidth={3} />
                <Area type="monotone" dataKey="b_hus" name="Směna B (HU)" stroke="#fbbf24" fill="url(#colorB)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
