"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Box, Search, Loader2, Calendar, Filter, TrendingUp, Package, BarChart3 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';

type PackStat = {
  packaging_material: string;
  packed_date: string;
  total_hus: number;
};

const MATERIAL_COLORS = ['#c084fc', '#a855f7', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#3b82f6', '#0ea5e9', '#14b8a6', '#10b981'];

export default function PackAnalyticsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PackStat[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleSearch = useCallback(async (term?: string) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params: Record<string, any> = {
        p_search_term: (term ?? searchTerm).trim()
      };
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;

      const { data, error } = await supabase.rpc('get_pack_material_stats', params);
      
      if (error) throw error;
      setStats(data || []);
    } catch (err) {
      console.error("Error fetching pack stats:", err);
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, dateFrom, dateTo]);

  useEffect(() => {
    handleSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedByMaterial = useMemo(() => {
    const grouped = stats.reduce((acc, row) => {
      if (!acc[row.packaging_material]) {
        acc[row.packaging_material] = {
          material: row.packaging_material,
          total_hus: 0,
          timeline: [] as { date: string, hus: number }[]
        };
      }
      acc[row.packaging_material].total_hus += Number(row.total_hus);
      acc[row.packaging_material].timeline.push({
        date: row.packed_date,
        hus: Number(row.total_hus)
      });
      return acc;
    }, {} as Record<string, { material: string, total_hus: number, timeline: { date: string, hus: number }[] }>);
    return grouped;
  }, [stats]);

  const materials = useMemo(() => Object.values(groupedByMaterial).sort((a, b) => b.total_hus - a.total_hus), [groupedByMaterial]);

  // KPI
  const kpi = useMemo(() => {
    const totalMaterials = materials.length;
    const totalHUs = materials.reduce((s, m) => s + m.total_hus, 0);
    const topMaterial = materials[0];
    
    // Average HU per material
    const avgHU = totalMaterials > 0 ? Math.round(totalHUs / totalMaterials) : 0;
    
    // Trend: compare last 7 days sum vs previous 7 days
    const allDates = stats.map(s => s.packed_date).sort();
    const uniqueDates = [...new Set(allDates)].sort();
    let trendPct = 0;
    if (uniqueDates.length >= 14) {
      const recentDates = new Set(uniqueDates.slice(-7));
      const prevDates = new Set(uniqueDates.slice(-14, -7));
      const recentHUs = stats.filter(s => recentDates.has(s.packed_date)).reduce((s, r) => s + Number(r.total_hus), 0);
      const prevHUs = stats.filter(s => prevDates.has(s.packed_date)).reduce((s, r) => s + Number(r.total_hus), 0);
      trendPct = prevHUs > 0 ? Math.round(((recentHUs - prevHUs) / prevHUs) * 100) : 0;
    }

    return { totalMaterials, totalHUs, topMaterial, avgHU, trendPct };
  }, [materials, stats]);

  // Donut chart data
  const donutData = useMemo(() => {
    const top5 = materials.slice(0, 5);
    const rest = materials.slice(5);
    const restTotal = rest.reduce((s, m) => s + m.total_hus, 0);
    const data = top5.map((m, i) => ({
      name: m.material.length > 15 ? m.material.substring(0, 15) + '…' : m.material,
      value: m.total_hus,
      fill: MATERIAL_COLORS[i % MATERIAL_COLORS.length]
    }));
    if (restTotal > 0) {
      data.push({ name: 'Ostatní', value: restTotal, fill: '#ffffff15' });
    }
    return data;
  }, [materials]);

  const sanitizeId = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_');

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Box className="w-8 h-8 text-purple-400" />
            Pack Analytika (Obaly)
          </h1>
          <p className="text-white/40 mt-1">
            Vyhledejte obalový materiál a sledujte jeho využití (počet zabalených HU) v čase.
          </p>
        </div>
      </div>

      {/* KPI karty */}
      {hasSearched && materials.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-5"><Package className="w-16 h-16 text-purple-400" /></div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Obalových materiálů</p>
            <p className="text-3xl font-black text-white">{kpi.totalMaterials}</p>
          </div>
          <div className="glass-panel p-5 relative overflow-hidden">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><Box className="w-3 h-3" /> Celkem HU</p>
            <p className="text-3xl font-black text-purple-400">{kpi.totalHUs.toLocaleString()}</p>
          </div>
          <div className="glass-panel p-5 relative overflow-hidden">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Ø HU / materiál</p>
            <p className="text-3xl font-black text-white/80">{kpi.avgHU.toLocaleString()}</p>
          </div>
          <div className={`glass-panel p-5 relative overflow-hidden ${kpi.trendPct > 0 ? 'bg-gradient-to-br from-emerald-500/5 to-transparent' : kpi.trendPct < 0 ? 'bg-gradient-to-br from-rose-500/5 to-transparent' : ''}`}>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Trend (7d)</p>
            <p className={`text-3xl font-black ${kpi.trendPct > 0 ? 'text-emerald-400' : kpi.trendPct < 0 ? 'text-rose-400' : 'text-white/60'}`}>
              {kpi.trendPct > 0 ? '+' : ''}{kpi.trendPct}%
            </p>
            <p className="text-xs text-white/30 mt-1">vs předchozích 7 dnů</p>
          </div>
        </div>
      )}

      {/* Overview: Donut + Top material */}
      {hasSearched && materials.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-panel p-5 flex flex-col items-center justify-center">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Podíl obalů
            </h4>
            <div className="h-[160px] w-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value" stroke="none">
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: '6px', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {donutData.slice(0, 4).map((d, i) => (
                <span key={i} className="text-[10px] text-white/50 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.fill }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 glass-panel p-5">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
              🏆 Nejvíce používaný obal
            </h4>
            {kpi.topMaterial && (
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-2xl font-bold text-white font-mono">{kpi.topMaterial.material}</p>
                  <p className="text-sm text-purple-400 mt-1">{kpi.topMaterial.total_hus.toLocaleString()} HU celkem</p>
                </div>
                {kpi.topMaterial.timeline.length > 1 && (
                  <div className="flex-1 h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={kpi.topMaterial.timeline} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                        <defs>
                          <linearGradient id="topMatGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#c084fc" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="hus" stroke="#c084fc" strokeWidth={2} fillOpacity={1} fill="url(#topMatGrad)" dot={false} />
                        <XAxis dataKey="date" hide />
                        <YAxis hide />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vyhledávání + filtry */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input 
              type="text" 
              placeholder="Zadejte název obalu (např. CARTON-05, Pallet)..." 
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button 
            onClick={() => handleSearch()}
            disabled={loading}
            className="bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Hledat"}
          </button>
        </div>

        <div className="flex gap-4 items-center flex-wrap">
          <Filter className="w-4 h-4 text-white/40" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/50">Od:</label>
            <input 
              type="date" 
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/50">Do:</label>
            <input 
              type="date" 
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button 
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-white/40 hover:text-white/70 underline transition-colors"
            >
              Resetovat datum
            </button>
          )}
        </div>
      </div>

      {/* Výsledky */}
      {loading ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-sm text-white/40">Prohledávám databázi...</p>
        </div>
      ) : hasSearched && materials.length === 0 ? (
        <div className="glass-panel p-12 text-center text-white/50">
          Pro zadaný dotaz nebyly nalezeny žádné obalové materiály.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {materials.map((mat, idx) => {
            const gradientId = `grad-${sanitizeId(mat.material)}-${idx}`;
            const totalHUs = materials.reduce((s, m) => s + m.total_hus, 0);
            const pctOfTotal = totalHUs > 0 ? ((mat.total_hus / totalHUs) * 100).toFixed(1) : '0';
            
            return (
              <div key={mat.material || idx} className="glass-panel p-6 flex flex-col gap-5 hover:bg-white/[0.01] transition-colors">
                
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MATERIAL_COLORS[idx % MATERIAL_COLORS.length] }} />
                    <h3 className="text-xl font-bold text-white font-mono">{mat.material}</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-white/30 bg-white/5 px-2.5 py-1 rounded-full">{pctOfTotal}% celku</span>
                    <div className="bg-white/5 rounded-lg px-5 py-2 border border-white/5 text-center">
                      <p className="text-xs text-white/40 uppercase tracking-wider">HU celkem</p>
                      <p className="text-2xl font-bold text-purple-400">{mat.total_hus.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="w-full h-[220px] bg-white/[0.02] rounded-xl p-4 pt-6 border border-white/5 relative">
                  <h4 className="absolute top-4 left-4 text-xs font-semibold text-white/50 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Vývoj spotřeby (počet HU v čase)
                  </h4>
                  {mat.timeline.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={mat.timeline} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={MATERIAL_COLORS[idx % MATERIAL_COLORS.length]} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={MATERIAL_COLORS[idx % MATERIAL_COLORS.length]} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="#ffffff40" 
                          fontSize={11} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(val) => {
                            if (!val) return "";
                            const d = new Date(val);
                            return isNaN(d.getTime()) ? val : d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" });
                          }}
                        />
                        <YAxis stroke="#ffffff40" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e1e2d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          labelStyle={{ color: '#ffffff80' }}
                          itemStyle={{ color: MATERIAL_COLORS[idx % MATERIAL_COLORS.length] }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="hus" 
                          name="Počet HU"
                          stroke={MATERIAL_COLORS[idx % MATERIAL_COLORS.length]}
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill={`url(#${gradientId})`} 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : mat.timeline.length === 1 ? (
                    <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-purple-400">{mat.timeline[0].hus}</p>
                        <p className="text-xs text-white/40 mt-1">HU dne {mat.timeline[0].date}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">Nedostatek dat pro graf</div>
                  )}
                </div>
                
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
