"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { ComposedChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line } from "recharts";
import { Loader2, AlertCircle, TrendingUp } from "lucide-react";

export default function DailyTrendsPage() {
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
      
      // Data chodí z DB sestupně (nejnovější první), pro grafy je chceme vzestupně (nejstarší první)
      const sortedData = (summaryData || []).reverse();
      setData(sortedData);
    } catch (err: any) {
      console.error("Trends fetch error:", err);
      setError(err.message || "Nepodařilo se načíst data z databáze.");
    } finally {
      setLoading(false);
    }
  };

  // Výpočet klouzavých průměrů
  const chartData = useMemo(() => {
    return data.map((day, index, array) => {
      // 7-day Moving Average (TOs)
      let ma7 = null;
      if (index >= 6) {
        const slice = array.slice(index - 6, index + 1);
        ma7 = Math.round(slice.reduce((acc, val) => acc + val.pick_tos, 0) / 7);
      }
      
      const dateObj = new Date(day.report_date);
      const formattedDate = dateObj.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });

      return {
        ...day,
        dateLabel: formattedDate,
        ma7_tos: ma7
      };
    });
  }, [data]);

  const weekdayData = useMemo(() => {
    const days = [
      { name: 'Po', dow: 1, total_tos: 0, count: 0 },
      { name: 'Út', dow: 2, total_tos: 0, count: 0 },
      { name: 'St', dow: 3, total_tos: 0, count: 0 },
      { name: 'Čt', dow: 4, total_tos: 0, count: 0 },
      { name: 'Pá', dow: 5, total_tos: 0, count: 0 },
      { name: 'So', dow: 6, total_tos: 0, count: 0 },
      { name: 'Ne', dow: 0, total_tos: 0, count: 0 }
    ];

    data.forEach(day => {
      const target = days.find(d => d.dow === day.day_of_week);
      if (target) {
        target.total_tos += day.pick_tos;
        target.count += 1;
      }
    });

    return days.map(d => ({
      name: d.name,
      avg_tos: d.count > 0 ? Math.round(d.total_tos / d.count) : 0
    })).filter(d => d.avg_tos > 0);
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

  if (data.length === 0) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <TrendingUp className="w-12 h-12 text-white/20 mx-auto" />
        <h2 className="text-xl font-bold text-white">Žádná data pro analýzu</h2>
        <p className="text-white/60">Importujte nejprve data pro zobrazení dlouhodobých trendů.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Denní Analytika a Trendy</h1>
          <p className="text-white/40 text-sm mt-1">Dlouhodobý manažerský přehled výkonnosti</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* HLAVNÍ TRENDOVÝ GRAF */}
        <div className="glass-panel p-6 col-span-1 lg:col-span-2">
          <h3 className="text-lg font-bold text-white mb-5">Vývoj Picking TO a 7denní průměr</h3>
          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashColorPick" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6391ff" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#6391ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} />
                <Legend wrapperStyle={{ paddingTop: '12px' }} />
                
                <Bar yAxisId="left" dataKey="pick_tos" name="Denní TO" fill="url(#dashColorPick)" stroke="#6391ff" radius={[4, 4, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="ma7_tos" name="7-denní průměr" stroke="#f59e0b" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PRŮMĚR PODLE DNE V TÝDNU */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5">Průměrný výkon podle dne</h3>
          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={true} vertical={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} hide />
                <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.8)" fontSize={12} tickLine={false} axisLine={false} width={30} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                  contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} 
                />
                <Bar dataKey="avg_tos" name="Průměr TO" fill="#8b5cf6" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* MIX ZAKÁZEK */}
        <div className="glass-panel p-6 col-span-1 lg:col-span-3">
          <h3 className="text-lg font-bold text-white mb-5">Mix typů zakázek (Normal / Express / OE) v čase</h3>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} />
                <Legend wrapperStyle={{ paddingTop: '12px' }} />
                <Bar dataKey="normal_tos" stackId="a" name="Normal" fill="#3b82f6" />
                <Bar dataKey="express_tos" stackId="a" name="Express" fill="#fbbf24" />
                <Bar dataKey="oe_tos" stackId="a" name="OE" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
