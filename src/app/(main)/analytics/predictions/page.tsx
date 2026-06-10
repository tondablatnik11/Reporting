"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  TrendingUp, Loader2, CalendarDays, 
  PackageSearch, Box, AlertTriangle, ShieldCheck, Target, Activity, Users, Settings
} from "lucide-react";
import { 
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';

type HistoryRow = {
  day: string;
  day_of_week: number;
  pick_tos: number;
  pick_qty: number;
  pack_hus: number;
  cat_normal_tos: number;
  cat_express_tos: number;
  cat_oe_tos: number;
};

type ChartPoint = {
  date: string;
  label: string;
  cat_normal_tos?: number;
  cat_express_tos?: number;
  cat_oe_tos?: number;
  pack_hus?: number;
  pred_normal_tos?: number;
  pred_express_tos?: number;
  pred_oe_tos?: number;
  pred_pack_hus?: number;
  pred_upper?: number;
  pred_lower?: number;
  pred_pack_upper?: number;
  pred_pack_lower?: number;
  isPrediction: boolean;
};

function isWorkday(dow: number): boolean {
  return dow >= 1 && dow <= 5;
}

/**
 * ROBUSTNÍ SEZÓNNÍ MODEL (Weighted Moving Average + Trend)
 * Mnohem stabilnější pro logistiku než Holt-Winters.
 * 1. Analyzuje posledních 8 týdnů pro přesné určení profilu Dnů v týdnu (Pondělí = 120%, Pátek = 80%).
 * 2. Analyzuje posledních 14 dní vs 14 dní předtím pro určení trendu.
 */
function predictRobust(data: HistoryRow[], field: keyof HistoryRow, futureDays: number) {
  if (data.length < 14) return { predictions: [], r2: 0, mape: 0, trend: 0 };

  const ysRaw = data.map(d => Number(d[field]) || 0);

  // 1. SEZÓNNOST (Profil dnů v týdnu) - z posledních 60 dní pro nejvyšší aktuálnost
  const recentSeasonality = data.slice(-60);
  const dowSums: Record<number, number> = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 0:0};
  const dowCounts: Record<number, number> = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 0:0};
  let totalWorkdaySum = 0;
  let totalWorkdayCount = 0;

  recentSeasonality.forEach(d => {
    const dow = d.day_of_week;
    if (isWorkday(dow)) {
      const val = Number(d[field]) || 0;
      // Vyhodíme extrémní anomálie (0 o pracovním dnu)
      if (val > 0) {
        dowSums[dow] += val;
        dowCounts[dow]++;
        totalWorkdaySum += val;
        totalWorkdayCount++;
      }
    }
  });

  const overallWorkdayAvg = totalWorkdayCount > 0 ? totalWorkdaySum / totalWorkdayCount : 1;
  const dowFactors: Record<number, number> = {};
  for (let i = 1; i <= 5; i++) {
    const dowAvg = dowCounts[i] > 0 ? dowSums[i] / dowCounts[i] : overallWorkdayAvg;
    dowFactors[i] = dowAvg / (overallWorkdayAvg || 1);
  }
  dowFactors[0] = 0; // Víkendy nepredikujeme
  dowFactors[6] = 0;

  // 2. TREND & BASE LEVEL (Posledních 14 dní)
  const last14 = data.slice(-14).filter(d => isWorkday(d.day_of_week) && Number(d[field]) > 0);
  const prev14 = data.slice(-28, -14).filter(d => isWorkday(d.day_of_week) && Number(d[field]) > 0);

  const avgLast = last14.length > 0 ? last14.reduce((s, d) => s + Number(d[field]), 0) / last14.length : overallWorkdayAvg;
  const avgPrev = prev14.length > 0 ? prev14.reduce((s, d) => s + Number(d[field]), 0) / prev14.length : avgLast;

  // Tlumený trend (Dampened trend), aby to neuteklo do nesmyslů po 3 měsících
  let rawTrend = (avgLast - avgPrev) / 14;
  const maxTrend = avgLast * 0.02; // max 2% růst/pokles denně
  let trend = Math.max(-maxTrend, Math.min(maxTrend, rawTrend));

  const baseLevel = avgLast;

  // 3. VÝPOČET CHYBY (Pro Interval Spolehlivosti a MAPE)
  const residuals: number[] = [];
  const absPercentErrors: number[] = [];
  
  data.forEach((d, i) => {
    if (!isWorkday(d.day_of_week)) return;
    const actual = ysRaw[i];
    if (actual > 0) {
      const fitted = baseLevel * (dowFactors[d.day_of_week] || 1);
      residuals.push(actual - fitted);
      absPercentErrors.push(Math.abs((actual - fitted) / actual));
    }
  });

  const mape = absPercentErrors.length > 0 ? (absPercentErrors.reduce((a, b) => a + b, 0) / absPercentErrors.length) * 100 : 0;
  const residualStd = residuals.length > 1 ? Math.sqrt(residuals.reduce((sum, r) => sum + r ** 2, 0) / (residuals.length - 1)) : baseLevel * 0.1;
  const r2 = Math.max(0, 100 - mape); // Pro business logistiku je MAPE užitečnější, R2 zjednodušíme

  // 4. GENERKOVÁNÍ PREDIKCE
  const lastDate = new Date(data[data.length - 1].day);
  const predictions = [];

  for (let i = 1; i <= futureDays; i++) {
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);
    const dow = futureDate.getDay();

    if (!isWorkday(dow)) {
      predictions.push({ value: 0, date: futureDate, upper: 0, lower: 0 });
      continue;
    }

    // Aplikace trendu s tlumením (čím dál do budoucnosti, tím plošší trend)
    const dampenedTrend = trend * Math.pow(0.95, i);
    let projectedLevel = baseLevel + (dampenedTrend * i);
    projectedLevel = Math.max(0, projectedLevel); // Nemůže být pod nulou

    const seasonalFactor = dowFactors[dow] || 1;
    const value = Math.max(0, Math.round(projectedLevel * seasonalFactor));

    // Šířka intervalu spolehlivosti se v čase mírně zvětšuje
    const ciWidth = 1.64 * residualStd * Math.sqrt(1 + i * 0.05); 
    const upper = Math.round(value + ciWidth);
    const lower = Math.max(0, Math.round(value - ciWidth));

    predictions.push({ value, date: futureDate, upper, lower });
  }

  return { predictions, r2, mape, trend: rawTrend };
}

function aggregateToWeekly(points: ChartPoint[]): ChartPoint[] {
  const weeks = new Map<string, { points: ChartPoint[], startDate: string, label: string }>();
  
  points.forEach(p => {
    const d = new Date(p.date);
    const day = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    const weekKey = monday.toISOString().split('T')[0];
    
    if (!weeks.has(weekKey)) {
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      weeks.set(weekKey, { 
        points: [], 
        startDate: weekKey,
        label: `${monday.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })} - ${friday.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })}`
      });
    }
    weeks.get(weekKey)!.points.push(p);
  });
  
  return Array.from(weeks.values()).map(week => {
    const sum = (field: keyof ChartPoint) => week.points.reduce((s, p) => s + (Number(p[field]) || 0), 0);
    const hasHistory = week.points.some(p => !p.isPrediction);
    const hasPrediction = week.points.some(p => p.isPrediction);
    
    return {
      date: week.startDate,
      label: week.label,
      cat_normal_tos: hasHistory ? sum('cat_normal_tos') : undefined,
      cat_express_tos: hasHistory ? sum('cat_express_tos') : undefined,
      cat_oe_tos: hasHistory ? sum('cat_oe_tos') : undefined,
      pack_hus: hasHistory ? sum('pack_hus') : undefined,
      pred_normal_tos: hasPrediction ? sum('pred_normal_tos') : undefined,
      pred_express_tos: hasPrediction ? sum('pred_express_tos') : undefined,
      pred_oe_tos: hasPrediction ? sum('pred_oe_tos') : undefined,
      pred_pack_hus: hasPrediction ? sum('pred_pack_hus') : undefined,
      pred_upper: hasPrediction ? sum('pred_upper') : undefined,
      pred_lower: hasPrediction ? sum('pred_lower') : undefined,
      pred_pack_upper: hasPrediction ? sum('pred_pack_upper') : undefined,
      pred_pack_lower: hasPrediction ? sum('pred_pack_lower') : undefined,
      isPrediction: !hasHistory && hasPrediction,
    };
  });
}

export default function PredictionPage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [forecastMonths, setForecastMonths] = useState(2);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');

  // Kapacitní plánování cíle
  const [targetPickerTOs, setTargetPickerTOs] = useState(120);
  const [targetPackerHUs, setTargetPackerHUs] = useState(150);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_daily_history');
      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error("Error loading history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const futureDays = forecastMonths * 30;

  const predNormal = useMemo(() => predictRobust(history, 'cat_normal_tos', futureDays), [history, futureDays]);
  const predExpress = useMemo(() => predictRobust(history, 'cat_express_tos', futureDays), [history, futureDays]);
  const predOE = useMemo(() => predictRobust(history, 'cat_oe_tos', futureDays), [history, futureDays]);
  const predPack = useMemo(() => predictRobust(history, 'pack_hus', futureDays), [history, futureDays]);

  const chartData: ChartPoint[] = useMemo(() => {
    const points: ChartPoint[] = [];
    const recentHistory = history.slice(-90);
    
    recentHistory.forEach(h => {
      const d = new Date(h.day);
      points.push({
        date: h.day,
        label: d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" }),
        cat_normal_tos: Number(h.cat_normal_tos),
        cat_express_tos: Number(h.cat_express_tos),
        cat_oe_tos: Number(h.cat_oe_tos),
        pack_hus: Number(h.pack_hus),
        isPrediction: false,
      });
    });
    
    predNormal.predictions.forEach((pn, i) => {
      const d = pn.date;
      const dateStr = d.toISOString().split('T')[0];
      
      const pExp = predExpress.predictions[i]?.value || 0;
      const pOe = predOE.predictions[i]?.value || 0;
      const pPack = predPack.predictions[i]?.value || 0;

      const totalUpper = (pn.upper || 0) + (predExpress.predictions[i]?.upper || 0) + (predOE.predictions[i]?.upper || 0);
      const totalLower = (pn.lower || 0) + (predExpress.predictions[i]?.lower || 0) + (predOE.predictions[i]?.lower || 0);

      points.push({
        date: dateStr,
        label: d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" }),
        pred_normal_tos: pn.value,
        pred_express_tos: pExp,
        pred_oe_tos: pOe,
        pred_pack_hus: pPack,
        pred_upper: totalUpper,
        pred_lower: totalLower,
        pred_pack_upper: predPack.predictions[i]?.upper || 0,
        pred_pack_lower: predPack.predictions[i]?.lower || 0,
        isPrediction: true,
      });
    });
    
    return points;
  }, [history, predNormal, predExpress, predOE, predPack]);

  const displayData = useMemo(() => {
    if (viewMode === 'weekly') return aggregateToWeekly(chartData);
    return chartData;
  }, [chartData, viewMode]);

  // Data pro kapacitní plán příštích 7 dní
  const next7DaysPlan = useMemo(() => {
    const plan = [];
    for(let i = 0; i < 7; i++) {
        const d = predNormal.predictions[i];
        if(!d) break;
        const totalPick = d.value + (predExpress.predictions[i]?.value || 0) + (predOE.predictions[i]?.value || 0);
        const totalPack = predPack.predictions[i]?.value || 0;
        
        if (totalPick > 0 || totalPack > 0) {
            plan.push({
                date: d.date,
                label: d.date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' }),
                pick: totalPick,
                reqPickers: Math.ceil(totalPick / targetPickerTOs),
                pack: totalPack,
                reqPackers: Math.ceil(totalPack / targetPackerHUs)
            });
        }
    }
    return plan;
  }, [predNormal, predExpress, predOE, predPack, targetPickerTOs, targetPackerHUs]);

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const workDays = history.filter(d => Number(d.pick_tos) > 0 && isWorkday(d.day_of_week));
    const avgPickTOs = workDays.length > 0 ? Math.round(workDays.reduce((s, d) => s + Number(d.pick_tos), 0) / workDays.length) : 0;
    const avgPackHUs = workDays.length > 0 ? Math.round(workDays.reduce((s, d) => s + Number(d.pack_hus), 0) / workDays.length) : 0;
    
    const workdayPreds = predNormal.predictions.filter(p => isWorkday(p.date.getDay()));
    const predictedAvgPick = workdayPreds.length > 0 
      ? Math.round(workdayPreds.reduce((s, p, i) => s + p.value + (predExpress.predictions[i]?.value||0) + (predOE.predictions[i]?.value||0), 0) / workdayPreds.length) 
      : 0;
    const workdayPackPreds = predPack.predictions.filter(p => isWorkday(p.date.getDay()));
    const predictedAvgPack = workdayPackPreds.length > 0 ? Math.round(workdayPackPreds.reduce((s, p) => s + p.value, 0) / workdayPackPreds.length) : 0;
    
    const avgR2 = (predNormal.r2 + predExpress.r2 + predOE.r2 + predPack.r2) / 4;
    const avgMape = (predNormal.mape + predExpress.mape + predOE.mape + predPack.mape) / 4;
    
    return {
      avgPickTOs, avgPackHUs, predictedAvgPick, predictedAvgPack,
      pickTrend: predNormal.trend + predExpress.trend + predOE.trend,
      packTrend: predPack.trend,
      r2: avgR2, mape: avgMape,
    };
  }, [history, predNormal, predExpress, predOE, predPack]);

  const formatTrend = (trend: number) => {
    if (Math.abs(trend) < 0.2) return { label: "Stabilní", color: "text-white/60", icon: "→" };
    if (trend > 0) return { label: "Rostoucí", color: "text-emerald-400", icon: "↗" };
    return { label: "Klesající", color: "text-rose-400", icon: "↘" };
  };

  const getR2Quality = (r2: number) => {
    if (r2 >= 80) return { label: "Vysoká", color: "text-emerald-400", bg: "bg-emerald-500/10" };
    if (r2 >= 60) return { label: "Střední", color: "text-amber-400", bg: "bg-amber-500/10" };
    return { label: "Nízká", color: "text-rose-400", bg: "bg-rose-500/10" };
  };

  const lastHistoryDate = history.length > 0 ? history[history.length - 1].day : "";

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-amber-400" />
            Predikce a Plánování Kapacit
          </h1>
          <p className="text-white/40 mt-1">
            Robustní klouzavý model zohledňující dny v týdnu a dlouhodobý trend pro stabilní výhled zátěže.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
            <button onClick={() => setViewMode('daily')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'daily' ? 'bg-white/10 text-white' : 'text-white/50'}`}>Denní</button>
            <button onClick={() => setViewMode('weekly')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'weekly' ? 'bg-white/10 text-white' : 'text-white/50'}`}>Týdenní</button>
          </div>
          <div className="flex items-center gap-3 bg-white/5 rounded-xl p-2 border border-white/10">
            <CalendarDays className="w-4 h-4 text-white/40 ml-2" />
            <span className="text-xs text-white/50">Horizont:</span>
            {[1, 2, 3].map(m => (
              <button key={m} onClick={() => setForecastMonths(m)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${forecastMonths === m ? 'bg-amber-500/20 text-amber-400' : 'text-white/50 hover:bg-white/5'}`}>
                {m} {m === 1 ? 'měsíc' : m < 5 ? 'měsíce' : 'měsíců'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-sm text-white/40">Kalkuluji model pro predikci a plánování...</p>
        </div>
      ) : history.length < 14 ? (
        <div className="glass-panel p-12 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-yellow-500/60 mx-auto" />
          <p className="text-white/60 font-medium">Nedostatek dat pro predikci (potřeba min. 14 dnů)</p>
        </div>
      ) : (
        <>
          {/* KPI karty */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><PackageSearch className="w-3 h-3" /> Historický Ø TO/den</p>
                <p className="text-2xl font-bold text-blue-400">{stats.avgPickTOs.toLocaleString()}</p>
                <p className={`text-xs mt-1 ${formatTrend(stats.pickTrend).color}`}>{formatTrend(stats.pickTrend).icon} {formatTrend(stats.pickTrend).label}</p>
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Box className="w-3 h-3" /> Historický Ø HU/den</p>
                <p className="text-2xl font-bold text-purple-400">{stats.avgPackHUs.toLocaleString()}</p>
                <p className={`text-xs mt-1 ${formatTrend(stats.packTrend).color}`}>{formatTrend(stats.packTrend).icon} {formatTrend(stats.packTrend).label}</p>
              </div>
              <div className="glass-panel p-4 bg-gradient-to-br from-amber-500/5 to-transparent">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Očekávaný Ø TO</p>
                <p className="text-2xl font-bold text-amber-400">{stats.predictedAvgPick.toLocaleString()}</p>
                <p className="text-xs mt-1 text-amber-400/50">Příští měsíc</p>
              </div>
              <div className="glass-panel p-4 bg-gradient-to-br from-amber-500/5 to-transparent">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Očekávaný Ø HU</p>
                <p className="text-2xl font-bold text-amber-400">{stats.predictedAvgPack.toLocaleString()}</p>
                <p className="text-xs mt-1 text-amber-400/50">Příští měsíc</p>
              </div>
              <div className={`glass-panel p-4 ${getR2Quality(stats.r2).bg}`}>
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> Přesnost trendu (Score)</p>
                <p className={`text-2xl font-bold ${getR2Quality(stats.r2).color}`}>{stats.r2.toFixed(1)}</p>
                <p className={`text-xs mt-1 ${getR2Quality(stats.r2).color}`}>{getR2Quality(stats.r2).label} spolehlivost</p>
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> Standardní odchylka</p>
                <p className="text-2xl font-bold text-white/80">±{stats.mape.toFixed(0)}%</p>
                <p className="text-xs mt-1 text-white/40">Průměrná chybovost</p>
              </div>
            </div>
          )}

          {/* NOVÉ: Kapacitní Plánování */}
          <div className="glass-panel overflow-hidden border-t-4 border-t-amber-400">
            <div className="p-6 bg-white/[0.02] border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2"><Users className="w-6 h-6 text-amber-400"/> Kapacitní plán na příštích 7 pracovních dní</h2>
                <p className="text-sm text-white/40 mt-1">Aplikace automaticky odhadne potřebný počet operátorů na směně na základě predikovaného objemu.</p>
              </div>
              <div className="flex items-center gap-6 bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-white/50 uppercase mb-1 flex items-center gap-1"><Settings className="w-3 h-3"/> Cíl Pickera (TO/den)</label>
                  <input type="number" value={targetPickerTOs} onChange={e => setTargetPickerTOs(Number(e.target.value))} className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white font-bold w-24 focus:outline-none focus:border-amber-400" />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-white/50 uppercase mb-1 flex items-center gap-1"><Settings className="w-3 h-3"/> Cíl Packera (HU/den)</label>
                  <input type="number" value={targetPackerHUs} onChange={e => setTargetPackerHUs(Number(e.target.value))} className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white font-bold w-24 focus:outline-none focus:border-amber-400" />
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/20">
                    <th className="px-6 py-4 text-sm font-semibold text-white/50">Datum</th>
                    <th className="px-6 py-4 text-sm font-semibold text-blue-400/80 border-l border-white/5">Očekáváno TO</th>
                    <th className="px-6 py-4 text-sm font-bold text-blue-400 bg-blue-500/5">Potřeba Pickerů</th>
                    <th className="px-6 py-4 text-sm font-semibold text-purple-400/80 border-l border-white/5">Očekáváno HU</th>
                    <th className="px-6 py-4 text-sm font-bold text-purple-400 bg-purple-500/5">Potřeba Packerů</th>
                  </tr>
                </thead>
                <tbody>
                  {next7DaysPlan.map((d, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-6 py-4 text-sm font-medium text-white capitalize">{d.label}</td>
                      <td className="px-6 py-4 text-sm font-bold text-white/80 border-l border-white/5">{d.pick.toLocaleString()}</td>
                      <td className="px-6 py-4 text-lg font-black text-amber-400 bg-blue-500/5">{d.reqPickers} <span className="text-xs font-medium text-amber-400/50">lidí</span></td>
                      <td className="px-6 py-4 text-sm font-bold text-white/80 border-l border-white/5">{d.pack.toLocaleString()}</td>
                      <td className="px-6 py-4 text-lg font-black text-amber-400 bg-purple-500/5">{d.reqPackers} <span className="text-xs font-medium text-amber-400/50">lidí</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Graf - Picking */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-blue-400" />
              Rozpad Pickingu – TO (Historie vs Predikce)
            </h3>
            <div className="w-full h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="label" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} interval={viewMode === 'daily' ? 'preserveStartEnd' : 0} />
                  <YAxis stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  
                  {lastHistoryDate && (
                    <ReferenceLine 
                      x={new Date(lastHistoryDate).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })} 
                      stroke="#fbbf2460" 
                      strokeDasharray="5 5" 
                      label={{ value: "Hranice predikce", fill: "#fbbf24", fontSize: 10, position: 'insideTopLeft' }} 
                    />
                  )}

                  <Area type="monotone" dataKey="pred_upper" name="CI horní" stroke="none" fillOpacity={0.12} fill="#fbbf24" dot={false} legendType="none" />
                  <Area type="monotone" dataKey="pred_lower" name="CI dolní" stroke="none" fillOpacity={0} fill="transparent" dot={false} legendType="none" />

                  <Area type="monotone" stackId="hist" dataKey="cat_normal_tos" name="Historie Normal" stroke="#10b981" fillOpacity={0.5} fill="#10b981" dot={false} />
                  <Area type="monotone" stackId="hist" dataKey="cat_express_tos" name="Historie Express" stroke="#f59e0b" fillOpacity={0.5} fill="#f59e0b" dot={false} />
                  <Area type="monotone" stackId="hist" dataKey="cat_oe_tos" name="Historie OE" stroke="#f43f5e" fillOpacity={0.5} fill="#f43f5e" dot={false} />

                  <Area type="monotone" stackId="pred" dataKey="pred_normal_tos" name="Predikce Normal" stroke="#10b981" strokeDasharray="4 4" fillOpacity={0.15} fill="#10b981" dot={false} />
                  <Area type="monotone" stackId="pred" dataKey="pred_express_tos" name="Predikce Express" stroke="#f59e0b" strokeDasharray="4 4" fillOpacity={0.15} fill="#f59e0b" dot={false} />
                  <Area type="monotone" stackId="pred" dataKey="pred_oe_tos" name="Predikce OE" stroke="#f43f5e" strokeDasharray="4 4" fillOpacity={0.15} fill="#f43f5e" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Graf - Packing */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-400" />
              Packing – Handling Units (HU)
            </h3>
            <div className="w-full h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="label" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} interval={viewMode === 'daily' ? 'preserveStartEnd' : 0} />
                  <YAxis stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  {lastHistoryDate && (
                    <ReferenceLine 
                      x={new Date(lastHistoryDate).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })} 
                      stroke="#fbbf2460" 
                      strokeDasharray="5 5" 
                    />
                  )}
                  <Area type="monotone" dataKey="pred_pack_upper" name="CI horní" stroke="none" fillOpacity={0.12} fill="#fbbf24" dot={false} legendType="none" />
                  <Area type="monotone" dataKey="pred_pack_lower" name="CI dolní" stroke="none" fillOpacity={0} fill="transparent" dot={false} legendType="none" />

                  <Area type="monotone" dataKey="pack_hus" name="Skutečné HU" stroke="#c084fc" fillOpacity={0.4} fill="#c084fc" dot={false} />
                  <Area type="monotone" dataKey="pred_pack_hus" name="Predikce HU" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" fillOpacity={0.1} fill="#fbbf24" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
