"use client";

import { useMemo, useState, useEffect } from "react";
import { 
  ComposedChart, AreaChart, Area, LineChart, Line, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import { 
  PackageSearch, Box, Users, TrendingUp, Calendar, 
  Target, Activity
} from "lucide-react";
import { useData, getShiftLabel } from "@/lib/data-context";
import { usePeriodData, aggregateToChartData, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";
import { supabase } from "@/lib/supabase";

export default function DailyTrendsPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const { pickingData: localPicking, packingData: localPacking, likpData } = useData();
  const { pickingData, packingData, loading: loadingPeriod } = usePeriodData(period, localPicking, localPacking, dateValue, false, "", likpData);

  // 1. Načtení dlouhodobé historie pro Makro Analytiku
  useEffect(() => {
    async function fetchHistory() {
      setLoadingHistory(true);
      try {
        const { data, error } = await supabase.rpc('get_daily_history');
        if (!error && data) {
          setHistory(data);
        }
      } catch (err) {
        console.error("Failed to load history", err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, []);

  // 2. Makro Analytika (Výpočty)
  const macroStats = useMemo(() => {
    if (history.length === 0) return null;
    
    const validHistory = history.filter(h => h.pick_tos > 0 || h.pack_hus > 0);
    if (validHistory.length === 0) return null;

    const lastDay = validHistory[validHistory.length - 1];
    const lastDayDate = new Date(lastDay.day);
    
    // KPI: Porovnání včerejška se 7denním průměrem a stejným dnem minulý týden
    const last7Days = validHistory.slice(Math.max(0, validHistory.length - 8), validHistory.length - 1);
    const avg7Days = last7Days.reduce((s, h) => s + Number(h.pick_tos), 0) / (last7Days.length || 1);
    
    const dayLastWeekTarget = new Date(lastDayDate);
    dayLastWeekTarget.setDate(dayLastWeekTarget.getDate() - 7);
    const dayLastWeekStr = dayLastWeekTarget.toISOString().split('T')[0];
    const dayLastWeek = validHistory.find(h => h.day === dayLastWeekStr);
    
    // KPI: MTD (Month-To-Date)
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

    // Doplnění nul v Burn-upu pro lepší graf
    let lastP = 0;
    burnupData.forEach(b => {
      if (b.prev !== null) lastP = b.prev;
      else if (lastP > 0) b.prev = lastP;
    });

    // Trend: Klouzavý průměr za 30 dní
    const trend30Days = validHistory.slice(-30).map((h, i) => {
      const window = validHistory.slice(Math.max(0, validHistory.length - 30 + i - 6), validHistory.length - 30 + i + 1);
      const avg = window.reduce((s, w) => s + Number(w.pick_tos), 0) / window.length;
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
    validHistory.slice(-90).forEach(h => { // Posledních 90 dní pro relevanci
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

  // 3. Mikro Analytika (Detailní přehled)
  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period, dateValue), [pickingData, packingData, period, dateValue]);
  const totalPickingTOs = new Set(pickingData.map(r => `${r.to_number}-${r.to_item || Math.random()}`)).size;
  const totalPackingHUs = new Set(packingData.map(r => r.internal_hu)).size;

  const shiftStats = useMemo(() => {
    const a = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), operators: new Set<string>() };
    const b = { pickingKs: 0, packingKs: 0, pickingTOs: new Set<string>(), packingHUs: new Set<string>(), operators: new Set<string>() };

    pickingData.forEach(p => {
      if (!p.confirmed_at) return;
      const shift = getShiftLabel(new Date(p.confirmed_at));
      const t = shift === "A" ? a : b;
      t.pickingTOs.add(`${p.to_number}-${p.to_item || Math.random()}`);
      if (p.operator) t.operators.add(p.operator);
    });
    packingData.forEach(p => {
      if (!p.created_at) return;
      const shift = getShiftLabel(new Date(p.created_at));
      const t = shift === "A" ? a : b;
      t.packingHUs.add(p.internal_hu);
      if (p.operator) t.operators.add(p.operator);
    });

    return {
      a: { pickingTOs: a.pickingTOs.size, packingHUs: a.packingHUs.size, operators: a.operators.size },
      b: { pickingTOs: b.pickingTOs.size, packingHUs: b.packingHUs.size, operators: b.operators.size },
    };
  }, [pickingData, packingData]);

  const xLabel = period === "day" ? "fullTime" : "time";

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
      {loadingHistory ? (
        <div className="glass-panel p-10 flex justify-center text-white/30">Načítám historická data...</div>
      ) : macroStats ? (
        <div className="space-y-6">
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                    <Bar dataKey="tos" name="Denní TO" fill="#6391ff" fillOpacity={0.6} radius={[2,2,0,0]} />
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
                    {/* OPRAVENÁ TYPOVÁ KONTROLA (val: any) */}
                    <Tooltip formatter={(val: any) => typeof val === 'number' ? `${val.toFixed(1)}%` : `${val}%`} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                    <Area type="monotone" dataKey="pctNormal" name="Normal" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.5} />
                    <Area type="monotone" dataKey="pctExpress" name="Express" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} />
                    <Area type="monotone" dataKey="pctOE" name="OE" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pt-6 pb-2">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* ZONE 4: MICRO ANALYTICS (Původní detail) */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Hodinový a Detailní Přehled
          </h2>
          <p className="text-white/40 text-sm mt-1">Podrobný rozklad vybraného dne nebo periody vč. výkonu jednotlivých směn.</p>
        </div>
        <PeriodSelector 
          period={period} 
          onChangePeriod={setPeriod} 
          loading={loadingPeriod}
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
            <div className="text-2xl font-black text-white">{totalPickingTOs.toLocaleString()} <span className="text-sm font-medium text-white/40">TO</span></div>
          </div>
        </div>

        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
            <Box className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Celkem Packing</div>
            <div className="text-2xl font-black text-white">{totalPackingHUs.toLocaleString()} <span className="text-sm font-medium text-white/40">HU</span></div>
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
            </div>
            <div>
              <div className="text-lg font-black text-purple-400">{shiftStats.a.packingHUs} <span className="text-xs text-white/30">HU</span></div>
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
            </div>
            <div>
              <div className="text-lg font-black text-purple-400">{shiftStats.b.packingHUs} <span className="text-xs text-white/30">HU</span></div>
            </div>
          </div>
          <div className="text-xs text-white/30 mt-2 flex items-center gap-1"><Users className="w-3 h-3" /> {shiftStats.b.operators} operátorů</div>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-6">Rozložení detailního výkonu ({period === 'day' ? 'Hodinové' : period === 'week' ? 'Dny v týdnu' : 'Dny v měsíci'})</h3>
        <div className="h-[460px] w-full">
          {loadingPeriod ? (
            <div className="h-full flex items-center justify-center text-white/30">Načítám detailní data...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey={xLabel} stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                <Bar dataKey="pickingTOs" name="Picking (TO)" fill="#60d4ff" fillOpacity={0.8} radius={[4,4,0,0]} />
                <Bar dataKey="packingHUs" name="Packing (HU)" fill="#e4b4ff" fillOpacity={0.8} radius={[4,4,0,0]} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
