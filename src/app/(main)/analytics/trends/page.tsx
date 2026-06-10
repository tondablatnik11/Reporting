"use client";

import { useMemo, useState, useEffect } from "react";
import { 
  ComposedChart, AreaChart, Area, LineChart, Line, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import { 
  TrendingUp, Calendar, Target, Activity, Loader2, AlertCircle, PackageSearch, Box, Layers, Trophy
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type TimeRange = '7d' | '30d' | 'month' | 'prevMonth' | 'ytd';

const RANGES: { id: TimeRange; label: string }[] = [
  { id: '7d', label: '7 Dní' },
  { id: '30d', label: '30 Dní' },
  { id: 'month', label: 'Tento měsíc' },
  { id: 'prevMonth', label: 'Minulý měsíc' },
  { id: 'ytd', label: 'Letos' },
];

export default function DailyTrendsPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  // Načtení dlouhodobé historie
  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc('get_daily_history');
        if (error) throw error;
        
        // Seřadit chronologicky (od nejstaršího po nejnovější)
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

  // Makro Analytika (Výpočty na základě vybraného období)
  const stats = useMemo(() => {
    if (history.length === 0) return null;

    const now = new Date();
    let currentData: any[] = [];
    let prevData: any[] = [];

    // 1. Filtrace dat podle vybraného období
    if (timeRange === '7d') {
      currentData = history.slice(-7);
      prevData = history.slice(-14, -7);
    } else if (timeRange === '30d') {
      currentData = history.slice(-30);
      prevData = history.slice(-60, -30);
    } else if (timeRange === 'month') {
      const m = now.getMonth();
      const y = now.getFullYear();
      currentData = history.filter(h => new Date(h.day).getMonth() === m && new Date(h.day).getFullYear() === y);
      
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      prevData = history.filter(h => new Date(h.day).getMonth() === prevM && new Date(h.day).getFullYear() === prevY);
    } else if (timeRange === 'prevMonth') {
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      currentData = history.filter(h => new Date(h.day).getMonth() === m && new Date(h.day).getFullYear() === y);
      
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      prevData = history.filter(h => new Date(h.day).getMonth() === prevM && new Date(h.day).getFullYear() === prevY);
    } else if (timeRange === 'ytd') {
      const y = now.getFullYear();
      currentData = history.filter(h => new Date(h.day).getFullYear() === y);
      prevData = history.filter(h => new Date(h.day).getFullYear() === y - 1);
    }

    if (currentData.length === 0) return null;

    // 2. Agregace Sum a Průměrů
    const sum = (arr: any[], key: string) => arr.reduce((acc, val) => acc + (Number(val[key]) || 0), 0);
    const tos = sum(currentData, 'pick_tos');
    const prevTos = sum(prevData, 'pick_tos');
    const hus = sum(currentData, 'pack_hus');
    const prevHus = sum(prevData, 'pack_hus');
    const ks = sum(currentData, 'pick_qty');

    // 3. Nejsilnější den
    let bestDay = currentData[0];
    let maxTo = -1;
    currentData.forEach(d => {
       if (Number(d.pick_tos) > maxTo) {
           maxTo = Number(d.pick_tos);
           bestDay = d;
       }
    });

    // 4. Data pro hlavní graf vč. klouzavých průměrů
    const chartData = currentData.map((d) => {
       const globalIdx = history.findIndex(x => x.day === d.day);
       let ma7to = null;
       let ma7hu = null;
       if (globalIdx >= 6) {
           const slice = history.slice(globalIdx - 6, globalIdx + 1);
           ma7to = slice.reduce((acc, val) => acc + Number(val.pick_tos), 0) / 7;
           ma7hu = slice.reduce((acc, val) => acc + Number(val.pack_hus), 0) / 7;
       }
       const totalMix = Number(d.cat_normal_tos) + Number(d.cat_express_tos) + Number(d.cat_oe_tos);
       return {
           day: d.day,
           label: new Date(d.day).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }),
           tos: Number(d.pick_tos),
           hus: Number(d.pack_hus),
           ma7to: ma7to ? Math.round(ma7to) : null,
           ma7hu: ma7hu ? Math.round(ma7hu) : null,
           pctNormal: totalMix > 0 ? (Number(d.cat_normal_tos) / totalMix) * 100 : 0,
           pctExpress: totalMix > 0 ? (Number(d.cat_express_tos) / totalMix) * 100 : 0,
           pctOE: totalMix > 0 ? (Number(d.cat_oe_tos) / totalMix) * 100 : 0,
       };
    });

    // 5. Kumulativní (Burn-up) Data
    const burnupData = [];
    let maxLen = Math.max(currentData.length, prevData.length);
    if (timeRange === 'month' || timeRange === 'prevMonth') maxLen = 31; 
    
    let curAcc = 0; let prevAcc = 0;
    for (let i = 0; i < maxLen; i++) {
        let label = String(i + 1);
        let curVal = null; let prevVal = null;

        if (timeRange === 'month' || timeRange === 'prevMonth') {
            const cDay = currentData.find(d => new Date(d.day).getDate() === i + 1);
            const pDay = prevData.find(d => new Date(d.day).getDate() === i + 1);
            
            if (cDay) { curAcc += Number(cDay.pick_tos); curVal = curAcc; }
            else if (curAcc > 0 && i < now.getDate() && timeRange === 'month') { curVal = curAcc; } 
            else if (timeRange === 'prevMonth' && curAcc > 0) { curVal = curAcc; }

            if (pDay) { prevAcc += Number(pDay.pick_tos); prevVal = prevAcc; }
            else if (prevAcc > 0) { prevVal = prevAcc; }
        } else {
            if (currentData[i]) { curAcc += Number(currentData[i].pick_tos); curVal = curAcc; }
            if (prevData[i]) { prevAcc += Number(prevData[i].pick_tos); prevVal = prevAcc; }
            label = `D ${i+1}`;
        }
        burnupData.push({ label, current: curVal, prev: prevVal });
    }

    // 6. Průměry podle Dnů v týdnu
    const dowSums = {1:{to:0, hu:0, count:0}, 2:{to:0, hu:0, count:0}, 3:{to:0, hu:0, count:0}, 4:{to:0, hu:0, count:0}, 5:{to:0, hu:0, count:0}, 6:{to:0, hu:0, count:0}, 0:{to:0, hu:0, count:0}};
    currentData.forEach(d => {
        const dow = new Date(d.day).getDay();
        dowSums[dow as keyof typeof dowSums].to += Number(d.pick_tos);
        dowSums[dow as keyof typeof dowSums].hu += Number(d.pack_hus);
        dowSums[dow as keyof typeof dowSums].count++;
    });
    const dowNames = {1:'Pondělí', 2:'Úterý', 3:'Středa', 4:'Čtvrtek', 5:'Pátek', 6:'Sobota', 0:'Neděle'};
    const dowData = [1,2,3,4,5,6,0].map(d => ({
        name: dowNames[d as keyof typeof dowNames],
        to: dowSums[d as keyof typeof dowSums].count > 0 ? Math.round(dowSums[d as keyof typeof dowSums].to / dowSums[d as keyof typeof dowSums].count) : 0,
        hu: dowSums[d as keyof typeof dowSums].count > 0 ? Math.round(dowSums[d as keyof typeof dowSums].hu / dowSums[d as keyof typeof dowSums].count) : 0,
    })).filter(d => d.to > 0 || d.hu > 0);

    return {
      tos, prevTos, hus, prevHus, ks,
      daysCount: currentData.length,
      avgTo: currentData.length ? Math.round(tos / currentData.length) : 0,
      avgHu: currentData.length ? Math.round(hus / currentData.length) : 0,
      bestDay: {
        date: new Date(bestDay.day),
        tos: Number(bestDay.pick_tos),
        hus: Number(bestDay.pack_hus)
      },
      chartData,
      burnupData,
      dowData
    };
  }, [history, timeRange]);

  const renderTrendBadge = (current: number, compare: number) => {
    if (!compare) return null;
    const diff = ((current - compare) / compare) * 100;
    const isPos = diff >= 0;
    return (
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ml-2 ${isPos ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
        {isPos ? '+' : ''}{diff.toFixed(1)}% vs minule
      </span>
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

  return (
    <div className="space-y-8 animate-fade-in-up pb-10">
      {/* HEADER & OVLÁDÁNÍ */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-blue-400" /> Dlouhodobé Trendy
          </h1>
          <p className="text-white/40 text-sm mt-1">Manažerský pohled na objemy a plánování kapacit.</p>
        </div>
        
        {/* Přepínač Období */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setTimeRange(r.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRange === r.id 
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' 
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <div className="glass-panel p-8 text-center space-y-4">
          <Calendar className="w-12 h-12 text-white/20 mx-auto" />
          <h2 className="text-xl font-bold text-white">Pro vybrané období nejsou data</h2>
          <p className="text-white/60">Zkuste vybrat jiné období nebo importujte nová data.</p>
        </div>
      ) : (
        <>
          {/* ZONE 1: EXECUTIVE KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="glass-panel p-5 border-t-4 border-t-blue-500/50">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                <PackageSearch className="w-4 h-4 text-blue-400" /> Celkem Picking
              </h4>
              <div className="text-3xl font-black text-white flex items-center">
                {stats.tos.toLocaleString()} 
                {renderTrendBadge(stats.tos, stats.prevTos)}
              </div>
              <p className="text-sm text-blue-400/80 font-medium mt-1">Ø {stats.avgTo.toLocaleString()} TO / den</p>
            </div>

            <div className="glass-panel p-5 border-t-4 border-t-purple-500/50">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Box className="w-4 h-4 text-purple-400" /> Celkem Packing
              </h4>
              <div className="text-3xl font-black text-white flex items-center">
                {stats.hus.toLocaleString()} 
                {renderTrendBadge(stats.hus, stats.prevHus)}
              </div>
              <p className="text-sm text-purple-400/80 font-medium mt-1">Ø {stats.avgHu.toLocaleString()} HU / den</p>
            </div>

            <div className="glass-panel p-5 border-t-4 border-t-emerald-500/50">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" /> Celkový Objem
              </h4>
              <div className="text-3xl font-black text-white">{stats.ks.toLocaleString()} <span className="text-lg font-medium text-white/30">Ks</span></div>
              <p className="text-sm text-white/50 mt-1">Průměrně <span className="text-emerald-400 font-bold">{stats.tos > 0 ? Math.round(stats.ks / stats.tos) : 0} Ks</span> na jeden TO</p>
            </div>

            <div className="glass-panel p-5 border-t-4 border-t-amber-500/50 bg-gradient-to-br from-amber-500/5 to-transparent">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" /> Nejsilnější den
              </h4>
              <p className="text-sm text-amber-400/80 mb-1">{stats.bestDay.date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <div className="text-2xl font-black text-white">{stats.bestDay.tos.toLocaleString()} <span className="text-sm font-medium text-white/30">TO</span></div>
              <div className="text-sm font-bold text-white/60 mt-0.5">{stats.bestDay.hus.toLocaleString()} <span className="text-xs font-medium text-white/30">HU</span></div>
            </div>
          </div>

          {/* ZONE 2: LONG-TERM TRENDS */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-bold text-white mb-1">Vývoj kapacit (Picking vs Packing) & 7denní klouzavý průměr</h3>
            <p className="text-xs text-white/40 mb-6">Porovnání reálné denní zátěže (sloupce) s vyhlazeným trendem (čáry). Výborné pro identifikaci zpoždění na balení.</p>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={stats.chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} itemStyle={{ color: '#fff' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                  <Bar dataKey="tos" name="Picking (TO)" fill="#3b82f6" fillOpacity={0.8} radius={[2,2,0,0]} />
                  <Bar dataKey="hus" name="Packing (HU)" fill="#a855f7" fillOpacity={0.8} radius={[2,2,0,0]} />
                  <Line type="monotone" dataKey="ma7to" name="Průměr TO (7d)" stroke="#60d4ff" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="ma7hu" name="Průměr HU (7d)" stroke="#e4b4ff" strokeWidth={3} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel p-6">
              <h3 className="text-lg font-bold text-white mb-1">Kumulativní plnění (Tempo objemů TO)</h3>
              <p className="text-xs text-white/40 mb-5">Sčítání zakázek v čase vs. předchozí srovnatelné období.</p>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.burnupData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                    <Line type="stepAfter" dataKey="prev" name="Předchozí období" stroke="#ffffff30" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="current" name="Aktuální období" stroke="#10b981" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-bold text-white mb-1">Vývoj priorit zakázek (Normal / Express / OE)</h3>
              <p className="text-xs text-white/40 mb-5">Procentuální podíl urgentních zakázek ve sledovaném období.</p>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.chartData} stackOffset="expand" margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(val) => `${val * 100}%`} stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(val: any) => typeof val === 'number' ? `${val.toFixed(1)}%` : val} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                    <Area type="monotone" dataKey="pctNormal" name="Normal" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                    <Area type="monotone" dataKey="pctExpress" name="Express" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.4} />
                    <Area type="monotone" dataKey="pctOE" name="OE" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ZONE 3: SEASONALITY */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-bold text-white mb-1">Průměrná zátěž podle dnů v týdnu</h3>
            <p className="text-xs text-white/40 mb-6">Zprůměrováno z vybraného období. Ideální podklad pro optimalizaci kapacit na jednotlivých směnách.</p>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dowData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.8)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                  <Bar dataKey="to" name="Průměr Picking (TO)" fill="#3b82f6" fillOpacity={0.8} radius={[4,4,0,0]} />
                  <Bar dataKey="hu" name="Průměr Packing (HU)" fill="#a855f7" fillOpacity={0.8} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
