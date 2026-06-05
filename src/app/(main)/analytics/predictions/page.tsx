"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  TrendingUp, Loader2, CalendarDays, BarChart3, 
  PackageSearch, Box, AlertTriangle, Info
} from "lucide-react";
import { 
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';

// ---- Predikční engine ----

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
  pick_tos?: number;
  pack_hus?: number;
  pred_pick_tos?: number;
  pred_pack_hus?: number;
  isPrediction: boolean;
};

/**
 * Jednoduchá lineární regrese: y = a + b*x
 * Vrací koeficienty a, b
 */
function linearRegression(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  if (n === 0) return { a: 0, b: 0, r2: 0 };
  
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { a: sumY / n, b: 0, r2: 0 };
  
  const b = (n * sumXY - sumX * sumY) / denom;
  const a = (sumY - b * sumX) / n;
  
  // R² (koeficient determinace)
  const meanY = sumY / n;
  const ssRes = ys.reduce((s, y, i) => s + Math.pow(y - (a + b * xs[i]), 2), 0);
  const ssTot = ys.reduce((s, y) => s + Math.pow(y - meanY, 2), 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  
  return { a, b, r2 };
}

/**
 * Výpočet sezónního faktoru pro každý den v týdnu (0=neděle, 1=pondělí, ..., 6=sobota)
 * Poměr průměru daného dne k celkovému průměru
 */
function dayOfWeekFactors(data: HistoryRow[], field: keyof HistoryRow): Record<number, number> {
  const groups: Record<number, number[]> = {};
  data.forEach(d => {
    const dow = d.day_of_week;
    if (!groups[dow]) groups[dow] = [];
    groups[dow].push(Number(d[field]) || 0);
  });
  
  const overallMean = data.reduce((s, d) => s + (Number(d[field]) || 0), 0) / (data.length || 1);
  if (overallMean === 0) return { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
  
  const factors: Record<number, number> = {};
  for (let dow = 0; dow <= 6; dow++) {
    const vals = groups[dow] || [];
    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : overallMean;
    factors[dow] = mean / overallMean;
  }
  return factors;
}

/**
 * Predikce na N dní dopředu:
 * 1. Lineární regrese pro trend
 * 2. Korekce na den v týdnu (sezónnost)
 */
function predict(
  data: HistoryRow[], 
  field: keyof HistoryRow, 
  futureDays: number
): { value: number; date: Date }[] {
  if (data.length < 7) return []; // Potřebujeme alespoň týden dat
  
  // Filtrovat jen pracovní data (ne nulové)
  const workingData = data.filter(d => Number(d[field]) > 0);
  if (workingData.length < 5) return [];
  
  const xs = workingData.map((_, i) => i);
  const ys = workingData.map(d => Number(d[field]) || 0);
  
  const { a, b } = linearRegression(xs, ys);
  const dowFactors = dayOfWeekFactors(data, field);
  
  const lastDate = new Date(data[data.length - 1].day);
  const result: { value: number; date: Date }[] = [];
  
  for (let i = 1; i <= futureDays; i++) {
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);
    const dow = futureDate.getDay();
    
    // Sobota a neděle – typicky nula nebo výrazně méně
    const trendValue = a + b * (workingData.length + i);
    const seasonalValue = trendValue * (dowFactors[dow] || 1);
    
    result.push({
      value: Math.max(0, Math.round(seasonalValue)),
      date: futureDate
    });
  }
  
  return result;
}

// ---- Komponenta ----

export default function PredictionPage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [forecastMonths, setForecastMonths] = useState(2);

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

  // Predikce
  const pickPredictions = useMemo(() => predict(history, 'pick_tos', futureDays), [history, futureDays]);
  const packPredictions = useMemo(() => predict(history, 'pack_hus', futureDays), [history, futureDays]);

  // Lineární regrese stats pro info karty
  const pickRegression = useMemo(() => {
    const workingData = history.filter(d => Number(d.pick_tos) > 0);
    const xs = workingData.map((_, i) => i);
    const ys = workingData.map(d => Number(d.pick_tos));
    return linearRegression(xs, ys);
  }, [history]);

  const packRegression = useMemo(() => {
    const workingData = history.filter(d => Number(d.pack_hus) > 0);
    const xs = workingData.map((_, i) => i);
    const ys = workingData.map(d => Number(d.pack_hus));
    return linearRegression(xs, ys);
  }, [history]);

  // Sestavit chart data: historie + predikce
  const chartData: ChartPoint[] = useMemo(() => {
    const points: ChartPoint[] = [];
    
    // Historická data (posledních 90 dní pro čitelnost)
    const recentHistory = history.slice(-90);
    recentHistory.forEach(h => {
      const d = new Date(h.day);
      points.push({
        date: h.day,
        label: d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" }),
        pick_tos: Number(h.pick_tos),
        pack_hus: Number(h.pack_hus),
        isPrediction: false,
      });
    });
    
    // Predikční data
    pickPredictions.forEach((pp, i) => {
      const d = pp.date;
      const dateStr = d.toISOString().split('T')[0];
      const existing = points.find(p => p.date === dateStr);
      if (existing) {
        existing.pred_pick_tos = pp.value;
        existing.pred_pack_hus = packPredictions[i]?.value;
      } else {
        points.push({
          date: dateStr,
          label: d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" }),
          pred_pick_tos: pp.value,
          pred_pack_hus: packPredictions[i]?.value,
          isPrediction: true,
        });
      }
    });
    
    return points;
  }, [history, pickPredictions, packPredictions]);

  // Souhrnné statistiky
  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const workDays = history.filter(d => Number(d.pick_tos) > 0);
    const avgPickTOs = workDays.length > 0 ? Math.round(workDays.reduce((s, d) => s + Number(d.pick_tos), 0) / workDays.length) : 0;
    const avgPackHUs = workDays.length > 0 ? Math.round(workDays.reduce((s, d) => s + Number(d.pack_hus), 0) / workDays.length) : 0;
    
    const predictedAvgPick = pickPredictions.length > 0 
      ? Math.round(pickPredictions.filter(p => p.value > 0).reduce((s, p) => s + p.value, 0) / (pickPredictions.filter(p => p.value > 0).length || 1)) 
      : 0;
    const predictedAvgPack = packPredictions.length > 0 
      ? Math.round(packPredictions.filter(p => p.value > 0).reduce((s, p) => s + p.value, 0) / (packPredictions.filter(p => p.value > 0).length || 1)) 
      : 0;
    
    const pickTrend = pickRegression.b;
    const packTrend = packRegression.b;
    
    return {
      totalDays: history.length,
      workDays: workDays.length,
      avgPickTOs,
      avgPackHUs,
      predictedAvgPick,
      predictedAvgPack,
      pickTrend,
      packTrend,
      pickR2: pickRegression.r2,
      packR2: packRegression.r2,
    };
  }, [history, pickPredictions, packPredictions, pickRegression, packRegression]);

  const formatTrend = (trend: number) => {
    if (Math.abs(trend) < 0.1) return { label: "Stabilní", color: "text-white/60", icon: "→" };
    if (trend > 0) return { label: `+${trend.toFixed(1)} TO/den`, color: "text-emerald-400", icon: "↗" };
    return { label: `${trend.toFixed(1)} TO/den`, color: "text-rose-400", icon: "↘" };
  };

  // Kde končí historie a začíná predikce (pro ReferenceLine)
  const lastHistoryDate = history.length > 0 ? history[history.length - 1].day : "";

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-amber-400" />
            Predikce
          </h1>
          <p className="text-white/40 mt-1">
            Odhad budoucích objemů pickingu a balení na základě historických trendů a sezónnosti.
          </p>
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

      {loading ? (
        <div className="glass-panel p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-sm text-white/40">Načítám historická data pro analýzu...</p>
        </div>
      ) : history.length < 7 ? (
        <div className="glass-panel p-12 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-yellow-500/60 mx-auto" />
          <p className="text-white/60 font-medium">Nedostatek dat pro predikci</p>
          <p className="text-sm text-white/40 max-w-md mx-auto">
            Pro vytvoření spolehlivé predikce je potřeba alespoň 7 dní historických dat. 
            Aktuálně máte {history.length} {history.length === 1 ? 'den' : history.length < 5 ? 'dny' : 'dní'}.
          </p>
        </div>
      ) : (
        <>
          {/* Info karty */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><PackageSearch className="w-3 h-3" /> Průměr TO / den</p>
                <p className="text-2xl font-bold text-blue-400">{stats.avgPickTOs.toLocaleString()}</p>
                <p className={`text-xs mt-1 ${formatTrend(stats.pickTrend).color}`}>
                  {formatTrend(stats.pickTrend).icon} {formatTrend(stats.pickTrend).label}
                </p>
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Box className="w-3 h-3" /> Průměr HU / den</p>
                <p className="text-2xl font-bold text-purple-400">{stats.avgPackHUs.toLocaleString()}</p>
                <p className={`text-xs mt-1 ${formatTrend(stats.packTrend).color}`}>
                  {formatTrend(stats.packTrend).icon} {formatTrend(stats.packTrend).label}
                </p>
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Predikce Ø TO</p>
                <p className="text-2xl font-bold text-amber-400">{stats.predictedAvgPick.toLocaleString()}</p>
                <p className="text-xs mt-1 text-white/30">
                  příštích {forecastMonths} {forecastMonths === 1 ? 'měsíc' : forecastMonths < 5 ? 'měsíce' : 'měsíců'}
                </p>
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Predikce Ø HU</p>
                <p className="text-2xl font-bold text-amber-400">{stats.predictedAvgPack.toLocaleString()}</p>
                <p className="text-xs mt-1 text-white/30">
                  příštích {forecastMonths} {forecastMonths === 1 ? 'měsíc' : forecastMonths < 5 ? 'měsíce' : 'měsíců'}
                </p>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-white/50">
              Predikce vychází z lineární regrese + korekce na den v týdnu (sezónnost). 
              Přesnost roste s objemem historických dat ({stats?.workDays || 0} pracovních dní).
              {stats && stats.pickR2 > 0 && (
                <span className="text-white/30"> R² picking: {(stats.pickR2 * 100).toFixed(0)}%, packing: {(stats.packR2 * 100).toFixed(0)}%.</span>
              )}
            </p>
          </div>

          {/* Hlavní graf – Pick TO */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-blue-400" />
              Picking – Transfer Orders (TO) · Historie + Predikce
            </h3>
            <div className="w-full h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPickHist" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradPickPred" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="label" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#ffffff80' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#ffffff60' }} />
                  {lastHistoryDate && (
                    <ReferenceLine 
                      x={new Date(lastHistoryDate).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })} 
                      stroke="#fbbf2460" 
                      strokeDasharray="5 5" 
                      label={{ value: "Dnes", fill: "#fbbf24", fontSize: 10 }} 
                    />
                  )}
                  <Area type="monotone" dataKey="pick_tos" name="Skutečné TO" stroke="#60a5fa" strokeWidth={1.5} fillOpacity={1} fill="url(#gradPickHist)" dot={false} />
                  <Area type="monotone" dataKey="pred_pick_tos" name="Predikce TO" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" fillOpacity={1} fill="url(#gradPickPred)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Graf – Pack HU */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-400" />
              Packing – Handling Units (HU) · Historie + Predikce
            </h3>
            <div className="w-full h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPackHist" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c084fc" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradPackPred" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="label" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#ffffff80' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#ffffff60' }} />
                  {lastHistoryDate && (
                    <ReferenceLine 
                      x={new Date(lastHistoryDate).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })} 
                      stroke="#fbbf2460" 
                      strokeDasharray="5 5" 
                    />
                  )}
                  <Area type="monotone" dataKey="pack_hus" name="Skutečné HU" stroke="#c084fc" strokeWidth={1.5} fillOpacity={1} fill="url(#gradPackHist)" dot={false} />
                  <Area type="monotone" dataKey="pred_pack_hus" name="Predikce HU" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" fillOpacity={1} fill="url(#gradPackPred)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Statistiky spolehlivosti */}
          {stats && (
            <div className="glass-panel p-5">
              <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-white/50" />
                Model & Spolehlivost
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-white/40">Historických dní</p>
                  <p className="text-lg font-bold text-white/80">{stats.totalDays}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">Pracovních dní</p>
                  <p className="text-lg font-bold text-white/80">{stats.workDays}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">R² Picking</p>
                  <p className={`text-lg font-bold ${stats.pickR2 > 0.5 ? 'text-emerald-400' : stats.pickR2 > 0.2 ? 'text-yellow-400' : 'text-rose-400'}`}>
                    {(stats.pickR2 * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/40">R² Packing</p>
                  <p className={`text-lg font-bold ${stats.packR2 > 0.5 ? 'text-emerald-400' : stats.packR2 > 0.2 ? 'text-yellow-400' : 'text-rose-400'}`}>
                    {(stats.packR2 * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
