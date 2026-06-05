"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  TrendingUp, Loader2, CalendarDays, BarChart3, 
  PackageSearch, Box, AlertTriangle, Info, ShieldCheck
} from "lucide-react";
import { 
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';

// ---- Vylepšený Predikční engine (v2) ----

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
  // Historie
  cat_normal_tos?: number;
  cat_express_tos?: number;
  cat_oe_tos?: number;
  pack_hus?: number;
  // Predikce
  pred_normal_tos?: number;
  pred_express_tos?: number;
  pred_oe_tos?: number;
  pred_pack_hus?: number;
  
  isPrediction: boolean;
};

/**
 * Odstranění extrémů (Outliers) pomocí IQR metody
 * Ignoruje dny s 0 hodnotou (např. svátky/víkendy) a extrémní špičky.
 */
function getValidIndices(ys: number[]): boolean[] {
  const nonZero = ys.filter(y => y > 0).sort((a, b) => a - b);
  if (nonZero.length < 4) return ys.map(y => y > 0);
  
  const q1 = nonZero[Math.floor(nonZero.length * 0.25)];
  const q3 = nonZero[Math.floor(nonZero.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = Math.max(0, q1 - 1.5 * iqr);
  const upperBound = q3 + 1.5 * iqr;
  
  return ys.map(y => y > 0 && y >= lowerBound && y <= upperBound);
}

/**
 * Vážená lineární regrese: y = a + b*x
 * Větší váha (w) pro novější data, aby model rychleji reagoval na nové trendy.
 */
function weightedLinearRegression(xs: number[], ys: number[], ws: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  if (n === 0) return { a: 0, b: 0, r2: 0 };
  
  let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
  for(let i=0; i<n; i++) {
    const w = ws[i];
    sumW += w;
    sumWX += w * xs[i];
    sumWY += w * ys[i];
    sumWXX += w * xs[i] * xs[i];
    sumWXY += w * xs[i] * ys[i];
  }
  
  const denom = sumW * sumWXX - sumWX * sumWX;
  if (denom === 0) return { a: sumWY / sumW, b: 0, r2: 0 };
  
  const b = (sumW * sumWXY - sumWX * sumWY) / denom;
  const a = (sumWY - b * sumWX) / sumW;
  
  const meanY = sumWY / sumW;
  let ssRes = 0, ssTot = 0;
  for(let i=0; i<n; i++) {
    const w = ws[i];
    const pred = a + b * xs[i];
    ssRes += w * Math.pow(ys[i] - pred, 2);
    ssTot += w * Math.pow(ys[i] - meanY, 2);
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  
  return { a, b, r2 };
}

/**
 * Výpočet sezónnosti očištěný o extrémy.
 */
function dayOfWeekFactorsFiltered(data: HistoryRow[], field: keyof HistoryRow, isValid: boolean[]): Record<number, number> {
  const groups: Record<number, number[]> = {};
  let validSum = 0;
  let validCount = 0;

  data.forEach((d, i) => {
    if (!isValid[i]) return;
    const dow = d.day_of_week;
    const val = Number(d[field]) || 0;
    if (!groups[dow]) groups[dow] = [];
    groups[dow].push(val);
    validSum += val;
    validCount++;
  });
  
  const overallMean = validCount > 0 ? validSum / validCount : 0;
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
 * Hlavní prediční funkce série s čištěním a vážením
 */
function predictSeries(
  data: HistoryRow[], 
  field: keyof HistoryRow, 
  futureDays: number
): { value: number; date: Date; r2: number; trend: number }[] {
  if (data.length < 7) return [];
  
  const ysRaw = data.map(d => Number(d[field]) || 0);
  const isValid = getValidIndices(ysRaw);
  
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  
  let validCount = 0;
  for (let i = 0; i < data.length; i++) {
    if (isValid[i]) {
      xs.push(i);
      ys.push(ysRaw[i]);
      // Váha roste od 1.0 (nejstarší data) do 2.0 (nejnovější data)
      ws.push(1 + (i / data.length)); 
      validCount++;
    }
  }
  
  if (validCount < 5) return [];
  
  const { a, b, r2 } = weightedLinearRegression(xs, ys, ws);
  const dowFactors = dayOfWeekFactorsFiltered(data, field, isValid);
  
  const lastDate = new Date(data[data.length - 1].day);
  const result = [];
  
  for (let i = 1; i <= futureDays; i++) {
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);
    const dow = futureDate.getDay();
    
    // Predikovaný index navazuje na konec pole
    const trendValue = a + b * (data.length - 1 + i);
    const seasonalValue = trendValue * (dowFactors[dow] || 1);
    
    result.push({
      value: Math.max(0, Math.round(seasonalValue)),
      date: futureDate,
      r2,
      trend: b
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

  // Predikce jednotlivých nezávislých složek
  const predNormal = useMemo(() => predictSeries(history, 'cat_normal_tos', futureDays), [history, futureDays]);
  const predExpress = useMemo(() => predictSeries(history, 'cat_express_tos', futureDays), [history, futureDays]);
  const predOE = useMemo(() => predictSeries(history, 'cat_oe_tos', futureDays), [history, futureDays]);
  const predPack = useMemo(() => predictSeries(history, 'pack_hus', futureDays), [history, futureDays]);

  // Sestavit chart data: historie + predikce
  const chartData: ChartPoint[] = useMemo(() => {
    const points: ChartPoint[] = [];
    
    // Historická data (posledních 90 dní)
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
    
    // Predikční data
    predNormal.forEach((pn, i) => {
      const d = pn.date;
      const dateStr = d.toISOString().split('T')[0];
      const existing = points.find(p => p.date === dateStr);
      
      const pExp = predExpress[i]?.value || 0;
      const pOe = predOE[i]?.value || 0;
      const pPack = predPack[i]?.value || 0;

      if (existing) {
        existing.pred_normal_tos = pn.value;
        existing.pred_express_tos = pExp;
        existing.pred_oe_tos = pOe;
        existing.pred_pack_hus = pPack;
      } else {
        points.push({
          date: dateStr,
          label: d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" }),
          pred_normal_tos: pn.value,
          pred_express_tos: pExp,
          pred_oe_tos: pOe,
          pred_pack_hus: pPack,
          isPrediction: true,
        });
      }
    });
    
    return points;
  }, [history, predNormal, predExpress, predOE, predPack]);

  // Souhrnné statistiky
  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const workDays = history.filter(d => Number(d.pick_tos) > 0);
    const avgPickTOs = workDays.length > 0 ? Math.round(workDays.reduce((s, d) => s + Number(d.pick_tos), 0) / workDays.length) : 0;
    const avgPackHUs = workDays.length > 0 ? Math.round(workDays.reduce((s, d) => s + Number(d.pack_hus), 0) / workDays.length) : 0;
    
    // Predikované průměry (sčítáme kategorie pro Pick)
    const predictedAvgPick = predNormal.length > 0 
      ? Math.round(
          predNormal.reduce((s, p, i) => s + p.value + (predExpress[i]?.value||0) + (predOE[i]?.value||0), 0) / predNormal.length
        ) 
      : 0;
    const predictedAvgPack = predPack.length > 0 
      ? Math.round(predPack.reduce((s, p) => s + p.value, 0) / predPack.length) 
      : 0;
    
    // Agregovaný trend = součet trendů jednotlivých kategorií
    const pickTrend = (predNormal[0]?.trend || 0) + (predExpress[0]?.trend || 0) + (predOE[0]?.trend || 0);
    const packTrend = predPack[0]?.trend || 0;
    
    // Průměrné R² přes modely pickingu
    const r2s = [predNormal[0]?.r2||0, predExpress[0]?.r2||0, predOE[0]?.r2||0].filter(r => r > 0);
    const avgPickR2 = r2s.length > 0 ? r2s.reduce((a,b)=>a+b,0)/r2s.length : 0;
    
    return {
      totalDays: history.length,
      workDays: workDays.length,
      avgPickTOs,
      avgPackHUs,
      predictedAvgPick,
      predictedAvgPack,
      pickTrend,
      packTrend,
      pickR2: avgPickR2,
      packR2: predPack[0]?.r2 || 0,
    };
  }, [history, predNormal, predExpress, predOE, predPack]);

  const formatTrend = (trend: number) => {
    if (Math.abs(trend) < 0.1) return { label: "Stabilní", color: "text-white/60", icon: "→" };
    if (trend > 0) return { label: `+${trend.toFixed(1)} TO/den`, color: "text-emerald-400", icon: "↗" };
    return { label: `${trend.toFixed(1)} TO/den`, color: "text-rose-400", icon: "↘" };
  };

  const lastHistoryDate = history.length > 0 ? history[history.length - 1].day : "";

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-amber-400" />
            Predikce <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/30 ml-2">Model v2</span>
          </h1>
          <p className="text-white/40 mt-1">
            Chytrý odhad s odstraněním anomálií a nezávislou predikcí kategorií (Normal/Express/OE).
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
          <p className="text-sm text-white/40">Zpracovávám data a trénuji model...</p>
        </div>
      ) : history.length < 7 ? (
        <div className="glass-panel p-12 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-yellow-500/60 mx-auto" />
          <p className="text-white/60 font-medium">Nedostatek dat pro predikci</p>
          <p className="text-sm text-white/40 max-w-md mx-auto">
            Pro spuštění v2 modelu je potřeba alespoň 7 dní historických dat.
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
                  {formatTrend(stats.pickTrend).icon} Součet trendů: {formatTrend(stats.pickTrend).label}
                </p>
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Box className="w-3 h-3" /> Průměr HU / den</p>
                <p className="text-2xl font-bold text-purple-400">{stats.avgPackHUs.toLocaleString()}</p>
                <p className={`text-xs mt-1 ${formatTrend(stats.packTrend).color}`}>
                  {formatTrend(stats.packTrend).icon} {formatTrend(stats.packTrend).label}
                </p>
              </div>
              <div className="glass-panel p-4 bg-gradient-to-br from-amber-500/5 to-transparent">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Predikce Ø TO</p>
                <p className="text-2xl font-bold text-amber-400">{stats.predictedAvgPick.toLocaleString()}</p>
                <p className="text-xs mt-1 text-amber-400/50">
                  Dalších {forecastMonths} {forecastMonths === 1 ? 'měsíc' : forecastMonths < 5 ? 'měsíce' : 'měsíců'}
                </p>
              </div>
              <div className="glass-panel p-4 bg-gradient-to-br from-amber-500/5 to-transparent">
                <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Predikce Ø HU</p>
                <p className="text-2xl font-bold text-amber-400">{stats.predictedAvgPack.toLocaleString()}</p>
                <p className="text-xs mt-1 text-amber-400/50">
                  Dalších {forecastMonths} {forecastMonths === 1 ? 'měsíc' : forecastMonths < 5 ? 'měsíce' : 'měsíců'}
                </p>
              </div>
            </div>
          )}

          {/* Vlastnosti modelu */}
          <div className="flex items-start gap-4 bg-[#141420] border border-white/5 rounded-xl px-5 py-4">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white/90">Aktivní AI Model: v2 (Robustní složená regrese)</p>
              <ul className="text-xs text-white/50 flex flex-wrap gap-x-6 gap-y-1 list-disc list-inside">
                <li><span className="text-white/70">IQR Filtering:</span> Extrémní výkyvy a svátky byly automaticky vyřazeny.</li>
                <li><span className="text-white/70">Vážená regrese:</span> Novější data mají až 2× větší vliv na výsledek než stará.</li>
                <li><span className="text-white/70">Trojitá separace:</span> Normal, Express a OE jsou predikovány zcela odděleně.</li>
              </ul>
            </div>
          </div>

          {/* Hlavní graf – Pick TO (STACKED) */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-blue-400" />
              Rozpad Pickingu (Normal / Express / OE) · Historie + Predikce
            </h3>
            <div className="w-full h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                      label={{ value: "Predikce ↓", fill: "#fbbf24", fontSize: 10, position: 'insideTopLeft' }} 
                    />
                  )}

                  {/* Historie - Stacked */}
                  <Area type="monotone" stackId="hist" dataKey="cat_normal_tos" name="Historie Normal" stroke="#10b981" strokeWidth={1} fillOpacity={0.6} fill="#10b981" dot={false} />
                  <Area type="monotone" stackId="hist" dataKey="cat_express_tos" name="Historie Express" stroke="#f59e0b" strokeWidth={1} fillOpacity={0.6} fill="#f59e0b" dot={false} />
                  <Area type="monotone" stackId="hist" dataKey="cat_oe_tos" name="Historie OE" stroke="#f43f5e" strokeWidth={1} fillOpacity={0.6} fill="#f43f5e" dot={false} />

                  {/* Predikce - Stacked (přerušované s průhledností) */}
                  <Area type="monotone" stackId="pred" dataKey="pred_normal_tos" name="Predikce Normal" stroke="#10b981" strokeDasharray="4 4" strokeWidth={2} fillOpacity={0.2} fill="#10b981" dot={false} />
                  <Area type="monotone" stackId="pred" dataKey="pred_express_tos" name="Predikce Express" stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={2} fillOpacity={0.2} fill="#f59e0b" dot={false} />
                  <Area type="monotone" stackId="pred" dataKey="pred_oe_tos" name="Predikce OE" stroke="#f43f5e" strokeDasharray="4 4" strokeWidth={2} fillOpacity={0.2} fill="#f43f5e" dot={false} />
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
            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  <Area type="monotone" dataKey="pack_hus" name="Skutečné HU" stroke="#c084fc" strokeWidth={2} fillOpacity={0.4} fill="#c084fc" dot={false} />
                  <Area type="monotone" dataKey="pred_pack_hus" name="Predikce HU" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" fillOpacity={0.15} fill="#fbbf24" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
