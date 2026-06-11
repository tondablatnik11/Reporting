"use client";

import { useMemo, useState, useEffect } from "react";
import { Box, Users, Activity, AlertOctagon, Zap, Loader2, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ComposedChart, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from "recharts";
import { getISOWeekNumber, getShiftConfig } from "@/lib/data-context";

type TimeRange = '7d' | '30d' | '90d' | 'ytd' | 'all';
type Grouping = 'day' | 'week' | 'month';

const PRIORITIES_COLORS = { Normal: "#10b981", Express: "#f59e0b", OE: "#ef4444" };
const SHIFT_COLORS = { A: "#10b981", B: "#fbbf24" };

function mapShiftNameToAB(dateStr: string, shiftCode: string) {
  if (shiftCode === 'C') return 'Mimo';
  const d = new Date(dateStr);
  const isEvenWeek = getISOWeekNumber(d) % 2 === 0;
  const shiftAIsMorning = getShiftConfig().evenWeekShiftAMorning ? isEvenWeek : !isEvenWeek;
  const isMorning = shiftCode === 'A';
  return shiftAIsMorning ? (isMorning ? "A" : "B") : (isMorning ? "B" : "A");
}

export default function PackingPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [grouping, setGrouping] = useState<Grouping>('day');
  
  // Nový stav pro hodinový detail u balení
  const [hourlyDetails, setHourlyDetails] = useState<any[]>([]);
  const [loadingHourly, setLoadingHourly] = useState(false);

  useEffect(() => {
    loadData(timeRange);
  }, [timeRange]);

  useEffect(() => {
    if (grouping === 'day' && data.length > 0) {
      loadHourlyDetail(dateValue);
    }
  }, [grouping, dateValue, data]);

  const loadData = async (range: TimeRange) => {
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      let start = new Date();
      if (range === '7d') start.setDate(start.getDate() - 7);
      else if (range === '30d') start.setDate(start.getDate() - 30);
      else if (range === '90d') start.setDate(start.getDate() - 90);
      else if (range === 'ytd') start = new Date(start.getFullYear(), 0, 1);
      else if (range === 'all') start = new Date(2020, 0, 1);

      const { data: dbData, error: dbError } = await supabase.rpc('get_packing_analytics_data', {
        p_start_date: start.toISOString().split('T')[0],
        p_end_date: end.toISOString().split('T')[0]
      });

      if (dbError) throw dbError;
      setData(dbData || []);
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError(err.message || "Nepodařilo se načíst data z databáze.");
    } finally {
      setLoading(false);
    }
  };

  const loadHourlyDetail = async (targetDate: string) => {
    setLoadingHourly(true);
    try {
      const { data: hData, error: hError } = await supabase.rpc('get_packing_hourly_detail', {
        p_date: targetDate
      });
      if (!hError) setHourlyDetails(hData || []);
    } catch (err) {
      console.error("Hourly detail fetch error:", err);
    } finally {
      setLoadingHourly(false);
    }
  };

  const { chartData, stats, priorityStats, shiftStats, operatorLeaderboard } = useMemo(() => {
    let totalHUs = 0, totalKs = 0, nHu = 0, eHu = 0, oHu = 0, aHu = 0, bHu = 0;
    const opsSet = new Set<string>();
    const opsLeaderMap = new Map<string, { name: string, hus: number, ks: number }>();
    const groupedMap = new Map<string, any>();

    data.forEach(d => {
      const dateObj = new Date(d.report_date);
      let key = d.report_date;
      let label = dateObj.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });

      if (grouping === 'week') {
        const w = getISOWeekNumber(dateObj);
        key = `${dateObj.getFullYear()}-W${w}`;
        label = `Týden ${w}`;
      } else if (grouping === 'month') {
        const m = dateObj.getMonth();
        key = `${dateObj.getFullYear()}-${m}`;
        label = dateObj.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
      }

      if (!groupedMap.has(key)) {
        groupedMap.set(key, { 
            key, label, packingHUs: 0, packingKs: 0, 
            packingNormal: 0, packingExpress: 0, packingOE: 0 
        });
      }

      const g = groupedMap.get(key)!;
      const hus = Number(d.pack_hus);
      const ks = Number(d.pack_qty);
      const norm = Number(d.pack_normal_hus);
      const exp = Number(d.pack_express_hus);
      const oe = Number(d.pack_oe_hus);

      g.packingHUs += hus;
      g.packingKs += ks;
      g.packingNormal += norm;
      g.packingExpress += exp;
      g.packingOE += oe;

      totalHUs += hus;
      totalKs += ks;
      nHu += norm;
      eHu += exp;
      oHu += oe;

      opsSet.add(d.operator);
      if (!opsLeaderMap.has(d.operator)) opsLeaderMap.set(d.operator, { name: d.operator, hus: 0, ks: 0 });
      const le = opsLeaderMap.get(d.operator)!;
      le.hus += hus;
      le.ks += ks;

      const shiftAB = mapShiftNameToAB(d.report_date, d.shift_name);
      if (shiftAB === 'A') aHu += hus;
      else if (shiftAB === 'B') bHu += hus;
    });

    const fChartData = Array.from(groupedMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const pStats = [
      { name: 'Normal', value: nHu, pct: totalHUs ? (nHu/totalHUs)*100 : 0, color: PRIORITIES_COLORS.Normal },
      { name: 'Express', value: eHu, pct: totalHUs ? (eHu/totalHUs)*100 : 0, color: PRIORITIES_COLORS.Express },
      { name: 'OE', value: oHu, pct: totalHUs ? (oHu/totalHUs)*100 : 0, color: PRIORITIES_COLORS.OE },
    ].filter(x => x.value > 0);

    const sStats = [
      { name: 'Směna A', value: aHu, pct: (aHu+bHu) ? (aHu/(aHu+bHu))*100 : 0, color: SHIFT_COLORS.A },
      { name: 'Směna B', value: bHu, pct: (aHu+bHu) ? (bHu/(aHu+bHu))*100 : 0, color: SHIFT_COLORS.B },
    ].filter(x => x.value > 0);

    const opLead = Array.from(opsLeaderMap.values()).sort((a, b) => b.hus - a.hus).slice(0, 15);

    return { 
        chartData: fChartData, 
        stats: { totalHUs, totalKs, uniqueOperators: opsSet.size }, 
        priorityStats: pStats, 
        shiftStats: sStats, 
        operatorLeaderboard: opLead 
    };
  }, [data, grouping]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 text-purple-400 animate-spin" /></div>;
  }

  if (error) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Chyba při načítání dat</h2>
        <p className="text-white/60">{error}</p>
        <button onClick={() => loadData(timeRange)} className="glass-button-primary mt-4">Zkusit znovu</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Box className="w-7 h-7 text-purple-400" /> Detailní Přehled – Packing
          </h1>
          <p className="text-white/40 text-sm mt-1">Sledování výkonnosti balení a kompletace</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
            {[ {id: 'day', label: 'Dny'}, {id: 'week', label: 'Týdny'}, {id: 'month', label: 'Měsíce'} ].map(g => (
              <button key={g.id} onClick={() => setGrouping(g.id as Grouping)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${grouping === g.id ? 'bg-purple-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
            {[ {id: '7d', label: '7 Dní'}, {id: '30d', label: '30 Dní'}, {id: '90d', label: '90 Dní'}, {id: 'ytd', label: 'Letos'}, {id: 'all', label: 'Vše'} ].map(r => (
              <button key={r.id} onClick={() => setTimeRange(r.id as TimeRange)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${timeRange === r.id ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="glass-panel p-8 text-center space-y-4">
            <Box className="w-12 h-12 text-white/20 mx-auto" />
            <h2 className="text-xl font-bold text-white">Nedostatek dat pro vybrané období</h2>
        </div>
      ) : (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="glass-panel p-6 border-l-4 border-l-purple-500/80">
                <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Zabaleno (HU)</p>
                <div className="text-3xl font-black text-white">{stats.totalHUs.toLocaleString()}</div>
                <p className="text-sm font-medium text-white/40 mt-1">Handling Units</p>
                </div>
                <div className="glass-panel p-6 border-l-4 border-l-purple-400/50">
                <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Objem (Ks)</p>
                <div className="text-3xl font-black text-white">{stats.totalKs.toLocaleString()}</div>
                <p className="text-sm font-medium text-white/40 mt-1">Fyzické kusy</p>
                </div>
                <div className="glass-panel p-6 border-l-4 border-l-emerald-500/80">
                <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Hustota (Ks/HU)</p>
                <div className="text-3xl font-black text-white">{stats.totalHUs > 0 ? (stats.totalKs / stats.totalHUs).toFixed(1) : "0"}</div>
                <p className="text-sm font-medium text-white/40 mt-1">Průměr Ks na jednu HU</p>
                </div>
                <div className="glass-panel p-6 border-l-4 border-l-amber-500/80">
                <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Lidské zdroje</p>
                <div className="text-3xl font-black text-white">{stats.uniqueOperators}</div>
                <p className="text-sm font-medium text-white/40 mt-1">Aktivních Packerů</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-panel p-6 flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-1 w-full text-center sm:text-left">
                    <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2 mb-2">
                    <AlertOctagon className="w-5 h-5 text-rose-400" /> Mix Priorit
                    </h3>
                    <div className="space-y-2">
                    {priorityStats.map(s => (
                        <div key={s.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} /><span className="text-sm text-white/80">{s.name}</span></div>
                        <div className="text-sm font-bold text-white">{s.pct.toFixed(1)}% <span className="text-xs text-white/40 font-normal ml-1">({s.value})</span></div>
                        </div>
                    ))}
                    </div>
                </div>
                <div className="w-40 h-40 shrink-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={priorityStats} innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value" stroke="none">
                        {priorityStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value: any, name: any) => [`${value} HU`, name]} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                    </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-xl font-black text-white">{stats.totalHUs}</span></div>
                </div>
                </div>

                <div className="glass-panel p-6 flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-1 w-full text-center sm:text-left">
                    <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2 mb-2">
                    <Zap className="w-5 h-5 text-amber-400" /> Podíl Směn
                    </h3>
                    <div className="space-y-2">
                    {shiftStats.map(s => (
                        <div key={s.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} /><span className="text-sm text-white/80">{s.name}</span></div>
                        <div className="text-sm font-bold text-white">{s.pct.toFixed(1)}% <span className="text-xs text-white/40 font-normal ml-1">({s.value})</span></div>
                        </div>
                    ))}
                    </div>
                </div>
                <div className="w-40 h-40 shrink-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={shiftStats} innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value" stroke="none">
                        {shiftStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value: any, name: any) => [`${value} HU`, name]} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                    </PieChart>
                    </ResponsiveContainer>
                </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel p-6">
                <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2"><Activity className="w-5 h-5 text-purple-400" /> Vývoj Packingu (Kusy vs HU)</h3>
                <div className="h-[280px] w-full mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorKsPack" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.5}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0.0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                        <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                        <Area yAxisId="left" type="monotone" dataKey="packingKs" name="Objem (Ks)" fill="url(#colorKsPack)" stroke="#a855f7" strokeWidth={2} />
                        <Bar yAxisId="right" dataKey="packingHUs" name="Handling Unity (HU)" fill="#e4b4ff" radius={[2,2,0,0]} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                </div>

                <div className="glass-panel p-6">
                <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2"><AlertOctagon className="w-5 h-5 text-purple-400" /> Rozpad zakázek podle typu (HU)</h3>
                <div className="h-[280px] w-full mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                        <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                        <Bar dataKey="packingNormal" name="Normální" stackId="cat" fill="#10b981" />
                        <Bar dataKey="packingExpress" name="Express" stackId="cat" fill="#f59e0b" />
                        <Bar dataKey="packingOE" name="OE" stackId="cat" fill="#ef4444" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                </div>
            </div>

            {/* NOVÁ SEKCE: HODINOVÝ DENÍK PRO NEJNIŽŠÍ DETAIL (DNY) */}
            {grouping === 'day' && (
              <div className="glass-panel overflow-hidden border-t-4 border-t-purple-500">
                <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-400" />
                  <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Hodinový Provozní Log Operátorů (Audit dne)</h3>
                </div>
                {loadingHourly ? (
                  <div className="p-8 text-center text-white/30 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> Načítám podrobný hodinový log...
                  </div>
                ) : hourlyDetails.length === 0 ? (
                  <div className="p-8 text-center text-white/30">Pro tento den nejsou k dispozici hodinové záznamy.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#121625] z-10 shadow-md">
                        <tr className="border-b border-white/5">
                          <th className="px-5 py-3 text-xs font-semibold text-white/40 uppercase">Časové Okno</th>
                          <th className="px-5 py-3 text-xs font-semibold text-white/40 uppercase">Operátor</th>
                          <th className="px-5 py-3 text-xs font-semibold text-white/40 uppercase">Priorita</th>
                          <th className="px-5 py-3 text-xs font-semibold text-white/40 uppercase text-right">Zabaleno HU</th>
                          <th className="px-5 py-3 text-xs font-semibold text-white/40 uppercase text-right">Celkem Ks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hourlyDetails.map((row, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="px-5 py-2.5 text-sm font-bold text-purple-400">{row.hour_slot} - {String(Number(row.hour_slot.split(':')[0])+1).padStart(2,'0')}:00</td>
                            <td className="px-5 py-2.5 text-sm text-white/80 font-medium">{row.operator}</td>
                            <td className="px-5 py-2.5 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.category === 'Express' ? 'bg-amber-500/20 text-amber-400' : row.category === 'OE' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                {row.category}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-sm text-right font-bold text-white">{row.pack_hus}</td>
                            <td className="px-5 py-2.5 text-sm text-right font-bold text-white/60">{Number(row.pack_qty).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="glass-panel p-6">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Users className="w-5 h-5 text-purple-400" /> Produktivita Packerů (Top 15)</h3>
                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={operatorLeaderboard} margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={true} vertical={false} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} stroke="#ffffff80" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} formatter={(value: any) => [value, 'Handling Unity (HU)']} />
                        <Bar dataKey="hus" fill="#a855f7" radius={[0,4,4,0]} barSize={16}>
                        <LabelList dataKey="hus" position="right" fill="#ffffff" fontSize={11} fontWeight="bold" />
                        </Bar>
                    </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </>
      )}
    </div>
  );
}
