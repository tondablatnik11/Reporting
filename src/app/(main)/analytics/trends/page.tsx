"use client";

import { useMemo, useState, useEffect } from "react";
import { 
  ComposedChart, AreaChart, Area, LineChart, Line, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import { 
  TrendingUp, Calendar, Target, Activity, Loader2, AlertCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function DailyTrendsPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Načtení dlouhodobé historie
  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc('get_daily_history');
        if (error) throw error;
        
        // Ujistíme se, že data jsou seřazena chronologicky (od nejstaršího po nejnovější)
        const sorted = [...(data || [])].sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());
        setHistory(sorted);
      } catch (err: any) {
        console.error("Failed to load history", err);
        setError("Nepodařilo se načíst data z databáze.");
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  // 2. Makro Analytika (Výpočty)
  const macroStats = useMemo(() => {
    if (history.length === 0) return null;
    
    // Filtrujeme jen dny, kdy se reálně pracovalo
    const validHistory = history.filter(h => h.pick_tos > 0 || h.pack_hus > 0);
    if (validHistory.length === 0) return null;

    const lastDay = validHistory[validHistory.length - 1];
    const lastDayDate = new Date(lastDay.day);
    
    // KPI: Porovnání včerejška se 7denním průměrem
    const last7Days = validHistory.slice(Math.max(0, validHistory.length - 8), validHistory.length - 1);
    const avg7Days = last7Days.reduce((s, h) => s + Number(h.pick_tos), 0) / (last7Days.length || 1);
    
    // KPI: Porovnání se stejným dnem minulý týden
    const dayLastWeekTarget = new Date(lastDayDate);
    dayLastWeekTarget.setDate(dayLastWeekTarget.getDate() - 7);
    const dayLastWeekStr = dayLastWeekTarget.toISOString().split('T')[0];
    const dayLastWeek = validHistory.find(h => h.day === dayLastWeekStr);
    
    // KPI: MTD (Month-To-Date) plnění
    const currentMonth = lastDayDate.getMonth();
    const currentYear = lastDayDate.getFullYear();
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevYear = prevMonthDate.getFullYear();

    let mtdCurrent = 0;
    let mtdPrev = 0;
    const currentDayOfMonth = lastDayDate.getDate();

    const burnupData: any[] = Array.from({length: 31}, (_, i) => ({ day: i + 1, current: null, prev: null }));
    let curSum = 0; let prevSum = 0;

    validHistory.forEach(h => {
      const d = new Date(h.day);
      const date = d.getDate();
      const val = Number(h.pick_tos);
      
      if (d.getMonth() === prevMonth && d.getFullYear() === prevYear) {
        if (date <= currentDayOfMonth) mtdPrev += val;
        prevSum += val;
        burnupData[date - 1].prev = prevSum;
      } else if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        mtdCurrent += val;
        curSum += val;
        burnupData[date - 1].current = curSum;
      }
    });

    // Doplnění prázdných míst v Burn-upu pro nepřerušenou čáru
    let lastP = 0;
    burnupData.forEach(b => {
      if (b.prev !== null) lastP = b.prev;
      else if (lastP > 0) b.prev = lastP;
    });

    // Trend: Klouzavý průměr za 30 dní a struktura typů
    const trend30Days = validHistory.slice(-30).map((h, i) => {
      const window = validHistory.slice(Math.max(0, validHistory.length - 30 + i - 6), validHistory.length - 30 + i + 1);
      const avg = window.reduce((s, w) => s + Number(w.pick_tos), 0) / (window.length || 1);
      const total = Number(h.cat_normal_tos) + Number(h.cat_express_tos) + Number(h.cat_oe_tos);
      
      return { 
        dateLabel: new Date(h.day).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }), 
        tos: Number(h.pick_tos), 
        ma7: Math.round(avg),
        pctNormal: total > 0 ? (Number(h.cat_normal_tos) / total) * 100 : 0,
        pctExpress: total > 0 ? (Number(h.cat_express_tos) / total) * 100 : 0,
        pctOE: total > 0 ? (Number(h.cat_oe_tos) / total) * 100 : 0,
      };
    });

    // Sezónnost: Průměr na den v týdnu
    const dowSums = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 0:0};
    const dowCounts = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 0:0};
    validHistory.slice(-90).forEach(h => { // Bereme jen posledních 90 dní pro relevanci
      const d = new Date(h.day).getDay();
      dowSums[d as keyof typeof dowSums] += Number(h.pick_tos);
      dowCounts[d as keyof typeof dowCounts]++;
    });
    
    const dowNames = {1:'Pondělí', 2:'Úterý', 3:'Středa', 4:'Čtvrtek', 5:'Pátek', 6:'Sobota', 0:'Neděle'};
    const dowData = [1,2,3,4,5,6,0].map(d => ({
      name: dowNames[d as keyof typeof dowNames],
      avg: dowCounts[d as keyof typeof dowCounts] > 0 ? Math.round(dowSums[d as keyof typeof dowSums] / dowCounts[d as keyof typeof dowCounts]) : 0
    })).filter(d => d.avg > 0);

    return {
      lastDay: { date: lastDayDate, tos: Number(lastDay.pick_tos) },
      avg7Days: Math.round(avg7Days),
      lastWeekTOs: dayLastWeek ? Number(dayLastWeek.pick_tos) : null,
      mtdCurrent,
      mtdPrev,
      trend30Days,
      burnupData,
      dowData
    };
  }, [history]);

  const renderTrendBadge = (current: number, compare: number, text: string) => {
    if (!compare) return null;
    const diff = ((current - compare) / compare) * 100;
    const isPos = diff >= 0;
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isPos ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
          {isPos ? '+' : ''}{diff.toFixed(1)}%
        </span>
        <span className="text-xs text-white/40">{text} ({compare.toLocaleString()})</span>
      </div>
    );
  };

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
      </div>
    );
  }

  if (!macroStats) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <TrendingUp className="w-12 h-12 text-white/20 mx-auto" />
        <h2 className="text-xl font-bold text-white">Žádná data pro analýzu</h2>
        <p className="text-white/60">Importujte nejprve data pro zobrazení dlouhodobých trendů.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in-up pb-10">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-blue-400" /> Denní Trendy & Makro Analytika
          </h1>
          <p className="text-white/40 text-sm mt-1">Dlouhodobé sledování objemů, historické srovnání a plánování kapacit.</p>
        </div>
      </div>

      {/* ZONE 1: EXECUTIVE KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel p-6 border-t-4 border-t-blue-500/50">
          <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" /> Poslední importovaný den
          </h4>
          <p className="text-sm text-white/40 mb-1">{macroStats.lastDay.date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <div className="text-3xl font-black text-white">{macroStats.lastDay.tos.toLocaleString()} <span className="text-lg font-medium text-white/30">TO</span></div>
          {renderTrendBadge(macroStats.lastDay.tos, macroStats.avg7Days, "vs 7-denní průměr")}
        </div>

        <div className="glass-panel p-6 border-t-4 border-t-purple-500/50">
          <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" /> Mezitýdenní srovnání
          </h4>
          <p className="text-sm text-white/40 mb-1">Stejný den minulý týden</p>
          <div className="text-3xl font-black text-white">{macroStats.lastDay.tos.toLocaleString()} <span className="text-lg font-medium text-white/30">TO</span></div>
          {macroStats.lastWeekTOs && renderTrendBadge(macroStats.lastDay.tos, macroStats.lastWeekTOs, "vs minulý týden")}
        </div>

        <div className="glass-panel p-6 border-t-4 border-t-emerald-500/50 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" /> Kumulace MTD (Month-To-Date)
          </h4>
          <p className="text-sm text-emerald-400/60 mb-1">Od 1. do {macroStats.lastDay.date.getDate()}. v měsíci</p>
          <div className="text-3xl font-black text-emerald-400">{macroStats.mtdCurrent.toLocaleString()} <span className="text-lg font-medium text-emerald-400/30">TO</span></div>
          {renderTrendBadge(macroStats.mtdCurrent, macroStats.mtdPrev, "vs stejné období min. měsíc")}
        </div>
      </div>

      {/* ZONE 2: LONG-TERM TRENDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Dlouhodobý trend & Klouzavý průměr</h3>
          <p className="text-xs text-white/40 mb-5">Historie 30 dní. Čára ukazuje 7denní vyhlazený průměr (eliminuje vliv víkendů).</p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={macroStats.trend30Days} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6391ff" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6391ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                <Bar dataKey="tos" name="Denní TO" fill="url(#trendGrad)" stroke="#6391ff" radius={[2,2,0,0]} />
                <Line type="monotone" dataKey="ma7" name="7denní Průměr" stroke="#fbbf24" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Burn-up MTD (Tempo růstu měsíce)</h3>
          <p className="text-xs text-white/40 mb-5">Kumulativní sčítání zakázek v čase. Jak si stojí aktuální měsíc vůči minulému?</p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={macroStats.burnupData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                <Line type="stepAfter" dataKey="prev" name="Minulý měsíc" stroke="#ffffff30" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="current" name="Aktuální měsíc" stroke="#10b981" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ZONE 3: SEASONALITY & STRUCTURE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Průměrná zátěž podle dnů v týdnu</h3>
          <p className="text-xs text-white/40 mb-5">Zprůměrováno z posledních 90 dní. Slouží pro optimální plánování směn operátorů.</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={macroStats.dowData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: '#ffffff05'}} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} />
                <Bar dataKey="avg" name="Průměr TO" fill="#8b5cf6" fillOpacity={0.8} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-1">Vývoj priorit zakázek (Normal / Express / OE)</h3>
          <p className="text-xs text-white/40 mb-5">Relativní 100% podíl prioritních zakázek za posledních 30 dní. Neroste urgentní práce?</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={macroStats.trend30Days} stackOffset="expand" margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(val) => `${val * 100}%`} stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip formatter={(val: any) => typeof val === 'number' ? `${val.toFixed(1)}%` : `${val}%`} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                <Area type="monotone" dataKey="pctNormal" name="Normal" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                <Area type="monotone" dataKey="pctExpress" name="Express" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} />
                <Area type="monotone" dataKey="pctOE" name="OE" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
