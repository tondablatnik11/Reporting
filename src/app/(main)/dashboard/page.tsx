"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, PackageSearch, Box, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: summaryData, error: summaryError } = await supabase.rpc('get_daily_summary');
      if (summaryError) throw summaryError;
      setData(summaryData || []);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError(err.message || "Nepodařilo se načíst data z databáze.");
    } finally {
      setLoading(false);
    }
  };

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return { percent: 0, isPositive: true, text: "Beze změny" };
    if (previous === 0) return { percent: 100, isPositive: true, text: "+100%" };
    const diff = current - previous;
    const percent = Math.round((diff / previous) * 100);
    return {
      percent: Math.abs(percent),
      isPositive: diff >= 0,
      text: `${diff >= 0 ? '+' : '-'}${Math.abs(percent)}%`
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Chyba při načítání dat</h2>
        <p className="text-white/60">{error}</p>
        <p className="text-sm text-amber-400">Ujisti se, že jsi spustil migrační skript `supabase_migration_datacube.sql` v Supabase.</p>
        <button onClick={loadData} className="glass-button-primary mt-4">Zkusit znovu</button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <Box className="w-12 h-12 text-white/20 mx-auto" />
        <h2 className="text-xl font-bold text-white">Žádná data</h2>
        <p className="text-white/60">V databázi zatím nejsou žádná zpracovaná data. Nahraj nejprve Excel reporty v záložce Import.</p>
      </div>
    );
  }

  // Nejdřív nejnovější den (yesterday = poslední den s daty)
  const yesterday = data[0];
  const dayBefore = data.length > 1 ? data[1] : null;

  const pickTrend = dayBefore ? calculateTrend(yesterday.pick_tos, dayBefore.pick_tos) : { percent: 0, isPositive: true, text: "-" };
  const packTrend = dayBefore ? calculateTrend(yesterday.pack_hus, dayBefore.pack_hus) : { percent: 0, isPositive: true, text: "-" };

  const totalOrders = yesterday.normal_tos + yesterday.express_tos + yesterday.oe_tos;
  const expressPct = totalOrders > 0 ? Math.round((yesterday.express_tos / totalOrders) * 100) : 0;
  const normalPct = totalOrders > 0 ? Math.round((yesterday.normal_tos / totalOrders) * 100) : 0;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Ranní Manažerský Report</h1>
          <p className="text-white/40 text-sm mt-1">Shrnutí výsledků za {formatDate(yesterday.report_date)}</p>
        </div>
        <button onClick={loadData} className="glass-button-primary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Aktualizovat data
        </button>
      </div>

      {/* MORNING BRIEF TEXT */}
      <div className="glass-panel p-8 border-l-4 border-l-blue-500 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
          <TrendingUp className="w-32 h-32 text-blue-400" />
        </div>
        <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4">Morning Brief</h2>
        <div className="relative z-10 text-lg text-white/90 leading-relaxed max-w-4xl space-y-3">
          <p>
            Za včerejší den <strong className="text-white">({formatDate(yesterday.report_date)})</strong> jsme úspěšně zpracovali <strong className="text-blue-400">{yesterday.pick_tos.toLocaleString()} TO</strong> (přes {yesterday.pick_qty.toLocaleString()} Ks) na pickingu a zabalili <strong className="text-purple-400">{yesterday.pack_hus.toLocaleString()} HU</strong>.
          </p>
          {dayBefore && (
            <p>
              V porovnání s předchozím dnem je picking <strong className={pickTrend.isPositive ? "text-emerald-400" : "text-red-400"}>{pickTrend.text}</strong> a packing <strong className={packTrend.isPositive ? "text-emerald-400" : "text-red-400"}>{packTrend.text}</strong>.
            </p>
          )}
          <p>
            Struktura zakázek byla z <strong className="text-white">{normalPct}% Normal</strong> a <strong className="text-amber-400">{expressPct}% Express</strong>. Do kategorie OE spadalo celkem {yesterday.oe_tos.toLocaleString()} TO.
          </p>
        </div>
      </div>

      {/* METRIKY */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <PackageSearch className="w-20 h-20 text-blue-400" />
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="text-3xl font-black text-white tracking-tight">{yesterday.pick_tos.toLocaleString()}</div>
              <div className="text-sm font-bold text-blue-400 mt-1">{yesterday.pick_qty.toLocaleString()} Ks</div>
              <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Vypickované TO</div>
            </div>
            {dayBefore && (
              <div className="mt-4 flex items-center gap-1.5">
                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${pickTrend.isPositive ? 'trend-up' : 'trend-down'}`}>
                  {pickTrend.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {pickTrend.text}
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Oproti {formatDate(dayBefore.report_date)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Box className="w-20 h-20 text-purple-400" />
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="text-3xl font-black text-white tracking-tight">{yesterday.pack_hus.toLocaleString()}</div>
              <div className="text-sm font-bold text-purple-400 mt-1">{yesterday.pack_qty.toLocaleString()} Ks</div>
              <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Zabalené HU</div>
            </div>
            {dayBefore && (
              <div className="mt-4 flex items-center gap-1.5">
                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${packTrend.isPositive ? 'trend-up' : 'trend-down'}`}>
                  {packTrend.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {packTrend.text}
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Oproti {formatDate(dayBefore.report_date)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 col-span-1 lg:col-span-2 relative overflow-hidden group">
          <div className="relative z-10">
            <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4">Kategorie zakázek (Picking)</h3>
            <div className="space-y-4">
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">Normal</span>
                  <span className="font-bold text-white">{yesterday.normal_tos.toLocaleString()} TO ({normalPct}%)</span>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${normalPct}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">Express</span>
                  <span className="font-bold text-amber-400">{yesterday.express_tos.toLocaleString()} TO ({expressPct}%)</span>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${expressPct}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">OE</span>
                  <span className="font-bold text-purple-400">{yesterday.oe_tos.toLocaleString()} TO</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
