/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  TrendingUp, Loader2, CalendarDays, 
  PackageSearch, Box, AlertTriangle, ShieldCheck, BarChart3, Target, Activity
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

// ---- Holt-Winters Additive Triple Exponential Smoothing ----

/**
 * Determine which "month-week" bucket a date falls into (1-4).
 * Week 1 = days 1-7, Week 2 = 8-14, Week 3 = 15-21, Week 4 = 22+
 */
function getMonthWeek(date: Date): number {
  const day = date.getDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

function isWorkday(dow: number): boolean {
  // dow: 0=Sunday, 1=Monday, ..., 6=Saturday
  return dow >= 1 && dow <= 5;
}

function getValidIndices(ys: number[]): boolean[] {
  const workdayNonZero = ys.filter(y => y > 0);
  if (workdayNonZero.length < 4) return ys.map(y => y > 0);
  
  const sorted = [...workdayNonZero].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = Math.max(0, q1 - 2.0 * iqr);
  const upperBound = q3 + 2.0 * iqr;
  
  return ys.map(y => y > 0 && y >= lowerBound && y <= upperBound);
}

/**
 * Compute day-of-week seasonality factors (multiplicative), filtering outliers.
 * Only uses weekdays (Mon-Fri).
 */
function dayOfWeekFactors(data: HistoryRow[], field: keyof HistoryRow, isValid: boolean[]): Record<number, number> {
  const groups: Record<number, number[]> = {};
  let validSum = 0;
  let validCount = 0;

  data.forEach((d, i) => {
    if (!isValid[i]) return;
    const dow = d.day_of_week;
    if (!isWorkday(dow)) return; // skip weekends
    const val = Number(d[field]) || 0;
    if (!groups[dow]) groups[dow] = [];
    groups[dow].push(val);
    validSum += val;
    validCount++;
  });
  
  const overallMean = validCount > 0 ? validSum / validCount : 0;
  if (overallMean === 0) return { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0 };
  
  const factors: Record<number, number> = {};
  for (let dow = 0; dow <= 6; dow++) {
    if (!isWorkday(dow)) {
      factors[dow] = 0; // weekends predict 0
      continue;
    }
    const vals = groups[dow] || [];
    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : overallMean;
    factors[dow] = mean / overallMean;
  }
  return factors;
}

/**
 * Compute month-week factors (multiplicative) to detect patterns like
 * "last week of month has more orders".
 */
function monthWeekFactors(data: HistoryRow[], field: keyof HistoryRow, isValid: boolean[]): Record<number, number> {
  const groups: Record<number, number[]> = {};
  let validSum = 0;
  let validCount = 0;

  data.forEach((d, i) => {
    if (!isValid[i]) return;
    const dow = d.day_of_week;
    if (!isWorkday(dow)) return;
    const mw = getMonthWeek(new Date(d.day));
    const val = Number(d[field]) || 0;
    if (!groups[mw]) groups[mw] = [];
    groups[mw].push(val);
    validSum += val;
    validCount++;
  });
  
  const overallMean = validCount > 0 ? validSum / validCount : 0;
  if (overallMean === 0) return { 1: 1, 2: 1, 3: 1, 4: 1 };
  
  const factors: Record<number, number> = {};
  for (let mw = 1; mw <= 4; mw++) {
    const vals = groups[mw] || [];
    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : overallMean;
    factors[mw] = mean / overallMean;
  }
  return factors;
}

/**
 * Holt-Winters Additive with dual seasonality (day-of-week + month-week).
 * Produces predictions with confidence intervals.
 */
function predictSeriesV4(
  data: HistoryRow[], 
  field: keyof HistoryRow, 
  futureDays: number
): { predictions: { value: number; date: Date; upper: number; lower: number }[]; r2: number; mape: number; trend: number; monthFactors: Record<number, number> } {
  if (data.length < 14) return { predictions: [], r2: 0, mape: 0, trend: 0, monthFactors: {} };
  
  const ysRaw = data.map(d => Number(d[field]) || 0);
  const isValid = getValidIndices(ysRaw);
  const dowFactors = dayOfWeekFactors(data, field, isValid);
  const mwFactors = monthWeekFactors(data, field, isValid);
  
  // Holt-Winters parameters
  const alpha = 0.3;  // level smoothing
  const beta = 0.05;  // trend smoothing
  const gamma = 0.15; // seasonal smoothing (we update dow factors adaptively)
  
  // Initialize level and trend from first valid workdays
  const validWorkdayValues: number[] = [];
  data.forEach((d, i) => {
    if (isValid[i] && isWorkday(d.day_of_week)) {
      validWorkdayValues.push(ysRaw[i] / ((dowFactors[d.day_of_week] || 1) * (mwFactors[getMonthWeek(new Date(d.day))] || 1)));
    }
  });
  
  let level = validWorkdayValues.length > 0 ? validWorkdayValues[0] : 0;
  let trend = 0;
  
  if (validWorkdayValues.length >= 14) {
    const firstWeek = validWorkdayValues.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
    const lastWeek = validWorkdayValues.slice(-7).reduce((a, b) => a + b, 0) / 7;
    trend = (lastWeek - firstWeek) / (validWorkdayValues.length - 7);
  }
  
  // Adaptively update dow seasonal factors
  const adaptiveDow = { ...dowFactors };
  
  // Run through history to calibrate level and trend
  const residuals: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const dow = data[i].day_of_week;
    const mw = getMonthWeek(new Date(data[i].day));
    
    if (!isValid[i] || !isWorkday(dow)) continue;
    
    const seasonalFactor = (adaptiveDow[dow] || 1) * (mwFactors[mw] || 1);
    const deseasonalized = ysRaw[i] / seasonalFactor;
    
    const prevLevel = level;
    level = alpha * deseasonalized + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    
    // Adaptive seasonal update
    if (level > 0) {
      adaptiveDow[dow] = gamma * (ysRaw[i] / (level * (mwFactors[mw] || 1))) + (1 - gamma) * (adaptiveDow[dow] || 1);
    }
    
    // Compute fitted value and residual for R² and confidence
    const fitted = (level + trend) * seasonalFactor;
    residuals.push(ysRaw[i] - fitted);
  }
  
  // Calculate R²
  const validYs = data.filter((_, i) => isValid[i] && isWorkday(data[i].day_of_week)).map((_, idx) => {
    const originalIdx = data.findIndex((d, i) => {
      let count = 0;
      for (let j = 0; j <= i; j++) {
        if (isValid[j] && isWorkday(data[j].day_of_week)) count++;
      }
      return count === idx + 1;
    });
    return ysRaw[originalIdx] || 0;
  });
  
  const yMean = validYs.length > 0 ? validYs.reduce((a, b) => a + b, 0) / validYs.length : 0;
  const ssTot = validYs.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  const ssRes = residuals.reduce((sum, r) => sum + r ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  
  // Calculate MAPE
  const absPercentErrors: number[] = [];
  data.forEach((d, i) => {
    if (!isValid[i] || !isWorkday(d.day_of_week)) return;
    const actual = ysRaw[i];
    if (actual > 0) {
      const dow = d.day_of_week;
      const mw = getMonthWeek(new Date(d.day));
      const fitted = (level + trend) * (adaptiveDow[dow] || 1) * (mwFactors[mw] || 1);
      absPercentErrors.push(Math.abs((actual - fitted) / actual));
    }
  });
  const mape = absPercentErrors.length > 0 
    ? (absPercentErrors.reduce((a, b) => a + b, 0) / absPercentErrors.length) * 100 
    : 0;
  
  // Standard deviation of residuals for confidence interval
  const residualStd = residuals.length > 1
    ? Math.sqrt(residuals.reduce((sum, r) => sum + r ** 2, 0) / (residuals.length - 1))
    : 0;
  
  // Generate predictions
  const lastDate = new Date(data[data.length - 1].day);
  const predictions = [];
  
  for (let i = 1; i <= futureDays; i++) {
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);
    const dow = futureDate.getDay();
    const mw = getMonthWeek(futureDate);
    
    if (!isWorkday(dow)) {
      predictions.push({ value: 0, date: futureDate, upper: 0, lower: 0 });
      continue;
    }
    
    const seasonalFactor = (adaptiveDow[dow] || 1) * (mwFactors[mw] || 1);
    const baseValue = (level + trend * i) * seasonalFactor;
    const value = Math.max(0, Math.round(baseValue));
    
    // Confidence interval widens with distance
    const ciWidth = 1.96 * residualStd * Math.sqrt(1 + i * 0.02);
    const upper = Math.max(0, Math.round(baseValue + ciWidth));
    const lower = Math.max(0, Math.round(baseValue - ciWidth));
    
    predictions.push({ value, date: futureDate, upper, lower });
  }
  
  return { predictions, r2, mape, trend, monthFactors: mwFactors };
}

// ---- Aggregate to weekly view ----
function aggregateToWeekly(points: ChartPoint[]): ChartPoint[] {
  const weeks = new Map<string, { 
    points: ChartPoint[], 
    startDate: string, 
    label: string 
  }>();
  
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
    const sum = (field: keyof ChartPoint) => 
      week.points.reduce((s, p) => s + (Number(p[field]) || 0), 0);
    
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
    // eslint-disable-next-line
    loadData();
  }, [loadData]);

  const futureDays = forecastMonths * 30;

  const predNormal = useMemo(() => predictSeriesV4(history, 'cat_normal_tos', futureDays), [history, futureDays]);
  const predExpress = useMemo(() => predictSeriesV4(history, 'cat_express_tos', futureDays), [history, futureDays]);
  const predOE = useMemo(() => predictSeriesV4(history, 'cat_oe_tos', futureDays), [history, futureDays]);
  const predPack = useMemo(() => predictSeriesV4(history, 'pack_hus', futureDays), [history, futureDays]);

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

      // Sum upper/lower for total picking confidence
      const totalUpper = (predNormal.predictions[i]?.upper || 0) + (predExpress.predictions[i]?.upper || 0) + (predOE.predictions[i]?.upper || 0);
      const totalLower = (predNormal.predictions[i]?.lower || 0) + (predExpress.predictions[i]?.lower || 0) + (predOE.predictions[i]?.lower || 0);

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

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const workDays = history.filter(d => Number(d.pick_tos) > 0 && isWorkday(d.day_of_week));
    const avgPickTOs = workDays.length > 0 ? Math.round(workDays.reduce((s, d) => s + Number(d.pick_tos), 0) / workDays.length) : 0;
    const avgPackHUs = workDays.length > 0 ? Math.round(workDays.reduce((s, d) => s + Number(d.pack_hus), 0) / workDays.length) : 0;
    
    const workdayPreds = predNormal.predictions.filter((_, i) => {
      const d = predNormal.predictions[i]?.date;
      return d && isWorkday(d.getDay());
    });
    
    const predictedAvgPick = workdayPreds.length > 0 
      ? Math.round(workdayPreds.reduce((s, p, i) => s + p.value + (predExpress.predictions[i]?.value||0) + (predOE.predictions[i]?.value||0), 0) / workdayPreds.length) 
      : 0;
    const workdayPackPreds = predPack.predictions.filter(p => p.date && isWorkday(p.date.getDay()));
    const predictedAvgPack = workdayPackPreds.length > 0 ? Math.round(workdayPackPreds.reduce((s, p) => s + p.value, 0) / workdayPackPreds.length) : 0;
    
    // Overall combined R² and MAPE (weighted average)
    const avgR2 = (predNormal.r2 + predExpress.r2 + predOE.r2 + predPack.r2) / 4;
    const avgMape = (predNormal.mape + predExpress.mape + predOE.mape + predPack.mape) / 4;
    
    return {
      avgPickTOs,
      avgPackHUs,
      predictedAvgPick,
      predictedAvgPack,
      pickTrend: predNormal.trend + predExpress.trend + predOE.trend,
      packTrend: predPack.trend,
      r2: avgR2,
      mape: avgMape,
      monthFactors: predNormal.monthFactors,
    };
  }, [history, predNormal, predExpress, predOE, predPack]);

  const formatTrend = (trend: number) => {
    if (Math.abs(trend) < 0.2) return { label: "Stabilní", color: "text-white/60", icon: "→" };
    if (trend > 0) return { label: "Rostoucí", color: "text-emerald-400", icon: "↗" };
    return { label: "Klesající", color: "text-rose-400", icon: "↘" };
  };

  const getR2Quality = (r2: number) => {
    if (r2 >= 0.8) return { label: "Vynikající", color: "text-emerald-400", bg: "bg-emerald-500/10" };
    if (r2 >= 0.6) return { label: "Dobrá", color: "text-amber-400", bg: "bg-amber-500/10" };
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
            Predikce kapacity <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full border border-amber-500/30 ml-2">Model v4 – Holt-Winters</span>
          </h1>
          <p className="text-white/40 mt-1">
            Triple Exponential Smoothing s detekcí měsíčních vzorů (konec měsíce, začátek měsíce) a sezónností Po-Pá.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
            <button 
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'daily' 
                  ? 'bg-white/10 text-white border border-white/15' 
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              Denní
            </button>
            <button 
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'weekly' 
                  ? 'bg-white/10 text-white border border-white/15' 
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              Týdenní
            </button>
          </div>

          {/* Forecast horizon */}
          <div className="flex items-center gap-3 bg-white/5 rounded-xl p-2 border border-white/10">
            <CalendarDays className="w-4 h-4 text-white/40 ml-2" />
            <span className="text-xs text-white/50">Horizont:</span>
            {[1, 2, 3].map(m => (
              <button 
                key={m}
                onClick={() => setForecastMonths(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  forecastMonths === m 
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                {m} {m === 1 ? 'měsíc' : m < 5 ? 'měsíce' : 'měsíců'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-sm text-white/40">Kalkuluji Holt-Winters model s měsíční sezónností...</p>
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
                <p className={`text-xs mt-1 ${formatTrend(stats.pickTrend).color}`}>
                  {formatTrend(stats.pickTrend).icon} {formatTrend(stats.pickTrend).label}
                </p>
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Box className="w-3 h-3" /> Historický Ø HU/den</p>
                <p className="text-2xl font-bold text-purple-400">{stats.avgPackHUs.toLocaleString()}</p>
                <p className={`text-xs mt-1 ${formatTrend(stats.packTrend).color}`}>
                  {formatTrend(stats.packTrend).icon} {formatTrend(stats.packTrend).label}
                </p>
              </div>
              <div className="glass-panel p-4 bg-gradient-to-br from-amber-500/5 to-transparent">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Predikce Ø TO</p>
                <p className="text-2xl font-bold text-amber-400">{stats.predictedAvgPick.toLocaleString()}</p>
                <p className="text-xs mt-1 text-amber-400/50">Výhled {forecastMonths} měs.</p>
              </div>
              <div className="glass-panel p-4 bg-gradient-to-br from-amber-500/5 to-transparent">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Predikce Ø HU</p>
                <p className="text-2xl font-bold text-amber-400">{stats.predictedAvgPack.toLocaleString()}</p>
                <p className="text-xs mt-1 text-amber-400/50">Výhled {forecastMonths} měs.</p>
              </div>
              <div className={`glass-panel p-4 ${getR2Quality(stats.r2).bg}`}>
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> R² (přesnost)</p>
                <p className={`text-2xl font-bold ${getR2Quality(stats.r2).color}`}>{(stats.r2 * 100).toFixed(1)}%</p>
                <p className={`text-xs mt-1 ${getR2Quality(stats.r2).color}`}>{getR2Quality(stats.r2).label}</p>
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> MAPE (chyba)</p>
                <p className="text-2xl font-bold text-white/80">{stats.mape.toFixed(1)}%</p>
                <p className="text-xs mt-1 text-white/40">Střed. abs. chyba</p>
              </div>
            </div>
          )}

          {/* Model info + Měsíční vzory */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="flex items-start gap-4 bg-[#141420] border border-white/5 rounded-xl px-5 py-4">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white/90">Model v4: Holt-Winters Triple Exponential Smoothing</p>
                <ul className="text-xs text-white/50 space-y-1 list-disc list-inside">
                  <li><span className="text-white/70">Level + Trend + Sezónnost:</span> α=0.30, β=0.05, γ=0.15</li>
                  <li><span className="text-white/70">Pracovní dny:</span> Po–Pá (So/Ne = 0)</li>
                  <li><span className="text-white/70">Měsíční vzory:</span> Detekce zátěže v 1.–4. týdnu měsíce</li>
                  <li><span className="text-white/70">Konfidenční interval:</span> 95% (±1.96σ) s rozšiřováním v čase</li>
                </ul>
              </div>
            </div>

            {stats && stats.monthFactors && Object.keys(stats.monthFactors).length > 0 && (
              <div className="bg-[#141420] border border-white/5 rounded-xl px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                  <p className="text-sm font-semibold text-white/90">Detekované měsíční vzory (TO)</p>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map(w => {
                    const factor = stats.monthFactors[w] || 1;
                    const pct = Math.round((factor - 1) * 100);
                    const isHigher = pct > 5;
                    const isLower = pct < -5;
                    return (
                      <div key={w} className="text-center bg-white/[0.03] rounded-lg p-3 border border-white/5">
                        <p className="text-xs text-white/40 mb-1">{w}. týden</p>
                        <p className={`text-lg font-bold ${isHigher ? 'text-emerald-400' : isLower ? 'text-rose-400' : 'text-white/60'}`}>
                          {pct > 0 ? '+' : ''}{pct}%
                        </p>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          {isHigher ? '↑ Více zakázek' : isLower ? '↓ Méně zakázek' : '= Průměr'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Graf - Picking */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-blue-400" />
              Rozpad Pickingu – TO (Historie vs Predikce s 95% CI)
            </h3>
            <div className="w-full h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ciGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
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

                  {/* Confidence interval area */}
                  <Area type="monotone" dataKey="pred_upper" name="CI horní" stroke="none" fillOpacity={0.12} fill="#fbbf24" dot={false} legendType="none" />
                  <Area type="monotone" dataKey="pred_lower" name="CI dolní" stroke="none" fillOpacity={0} fill="transparent" dot={false} legendType="none" />

                  <Area type="monotone" stackId="hist" dataKey="cat_normal_tos" name="Historie Normal" stroke="#10b981" fillOpacity={0.5} fill="#10b981" dot={false} />
                  <Area type="monotone" stackId="hist" dataKey="cat_express_tos" name="Historie Express" stroke="#f59e0b" fillOpacity={0.5} fill="#f59e0b" dot={false} />
                  <Area type="monotone" stackId="hist" dataKey="cat_oe_tos" name="Historie OE" stroke="#f43f5e" fillOpacity={0.5} fill="#f43f5e" dot={false} />

                  <Area type="monotone" dataKey="pred_normal_tos" name="Predikce Normal" stroke="#10b981" strokeDasharray="4 4" fillOpacity={0.08} fill="#10b981" dot={false} />
                  <Area type="monotone" dataKey="pred_express_tos" name="Predikce Express" stroke="#f59e0b" strokeDasharray="4 4" fillOpacity={0.08} fill="#f59e0b" dot={false} />
                  <Area type="monotone" dataKey="pred_oe_tos" name="Predikce OE" stroke="#f43f5e" strokeDasharray="4 4" fillOpacity={0.08} fill="#f43f5e" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Graf - Packing */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-400" />
              Packing – Handling Units (HU) s 95% CI
            </h3>
            <div className="w-full h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ciPackGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
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
                  {/* Confidence interval */}
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
