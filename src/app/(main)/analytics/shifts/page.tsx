"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { Loader2, AlertCircle, BarChart3, Sun, Moon } from "lucide-react";

export default function ShiftBenchmarkingPage() {
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
      const { data: shiftData, error: shiftError } = await supabase.rpc('get_shift_summary');
      if (shiftError) throw shiftError;
      
      // Data chodí z DB sestupně
      setData(shiftData || []);
    } catch (err: any) {
      console.error("Shifts fetch error:", err);
      setError(err.message || "Nepodařilo se načíst data z databáze.");
    } finally {
      setLoading(false);
    }
  };

  // Transformace dat pro grafy
  const chartData = useMemo(() => {
    // 1. Zjistíme unikátní dny (seřazené vzestupně pro osu X)
    const uniqueDates = Array.from(new Set(data.map(d => d.report_date))).sort();
    
    return uniqueDates.map(date => {
      const dayData = data.filter(d => d.report_date === date);
      const ranni = dayData.find(d => d.shift_name === 'Ranní');
      const odpoledni = dayData.find(d => d.shift_name === 'Odpolední');
      
      const dateObj = new Date(date as string);
      const formattedDate = dateObj.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });

      return {
        dateLabel: formattedDate,
        ranni_pick_tos: ranni ? ranni.pick_tos : 0,
        ranni_pack_hus: ranni ? ranni.pack_hus : 0,
        odpoledni_pick_tos: odpoledni ? odpoledni.pick_tos : 0,
        odpoledni_pack_hus: odpoledni ? odpoledni.pack_hus : 0,
      };
    });
  }, [data]);

  const totalAverages = useMemo(() => {
    const ranni = data.filter(d => d.shift_name === 'Ranní');
    const odpoledni = data.filter(d => d.shift_name === 'Odpolední');

    const sumRanniPick = ranni.reduce((acc, val) => acc + val.pick_tos, 0);
    const sumOdpoPick = odpoledni.reduce((acc, val) => acc + val.pick_tos, 0);
    
    return {
      ranniAvgPick: ranni.length > 0 ? Math.round(sumRanniPick / ranni.length) : 0,
      odpoledniAvgPick: odpoledni.length > 0 ? Math.round(sumOdpoPick / odpoledni.length) : 0,
      ranniDays: ranni.length,
      odpoDays: odpoledni.length
    };
  }, [data]);

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
        <BarChart3 className="w-12 h-12 text-white/20 mx-auto" />
        <h2 className="text-xl font-bold text-white">Žádná data pro analýzu</h2>
        <p className="text-white/60">Importujte nejprve data pro zobrazení porovnání směn.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Benchmarking Směn</h1>
          <p className="text-white/40 text-sm mt-1">Dlouhodobé férové porovnání ranní vs odpolední směny</p>
        </div>
      </div>

      {/* SOUHRNNÉ METRIKY */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass-panel p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Sun className="w-20 h-20 text-blue-400" />
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-3">Ranní Směna (Dlouhodobý Průměr)</div>
              <div className="text-3xl font-black text-blue-400 tracking-tight">{totalAverages.ranniAvgPick.toLocaleString()} TO</div>
              <div className="text-sm font-bold text-white/40 mt-1">průměrně za 1 den (vzorek {totalAverages.ranniDays} dnů)</div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Moon className="w-20 h-20 text-purple-400" />
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-3">Odpolední Směna (Dlouhodobý Průměr)</div>
              <div className="text-3xl font-black text-purple-400 tracking-tight">{totalAverages.odpoledniAvgPick.toLocaleString()} TO</div>
              <div className="text-sm font-bold text-white/40 mt-1">průměrně za 1 den (vzorek {totalAverages.odpoDays} dnů)</div>
            </div>
          </div>
        </div>
      </div>

      {/* HLAVNÍ GRAFY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* PICKING */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5">Vývoj Picking TO v čase</h3>
          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} />
                <Legend wrapperStyle={{ paddingTop: '12px' }} />
                
                <Bar dataKey="ranni_pick_tos" name="Ranní" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                <Bar dataKey="odpoledni_pick_tos" name="Odpolední" fill="#c084fc" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PACKING */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5">Vývoj Packing HU v čase</h3>
          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} />
                <Legend wrapperStyle={{ paddingTop: '12px' }} />
                
                <Line type="monotone" dataKey="ranni_pack_hus" name="Ranní" stroke="#60a5fa" strokeWidth={3} dot={{ r: 4, fill: "#0a0e1e", strokeWidth: 2 }} />
                <Line type="monotone" dataKey="odpoledni_pack_hus" name="Odpolední" stroke="#c084fc" strokeWidth={3} dot={{ r: 4, fill: "#0a0e1e", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
