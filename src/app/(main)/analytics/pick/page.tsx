"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PackageSearch, Search, Loader2, MapPin, Hash, Layers, LayoutGrid, Filter, TrendingUp, BarChart3 } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

type TopBin = {
  bin: string;
  tos: number;
};

type MaterialStat = {
  material: string;
  total_tos: number;
  total_qty: number;
  top_bins: TopBin[];
};

const HEATMAP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
const ABC_CLASSES = [
  { key: 'all', label: 'Všechny', color: 'text-white/60' },
  { key: 'A', label: 'A (Vysoká)', color: 'text-rose-400' },
  { key: 'B', label: 'B (Střední)', color: 'text-amber-400' },
  { key: 'C', label: 'C (Nízká)', color: 'text-emerald-400' },
];

function getAbcClass(tos: number): string {
  if (tos > 100) return 'A';
  if (tos > 20) return 'B';
  return 'C';
}

export default function PickAnalyticsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<MaterialStat[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [abcFilter, setAbcFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleSearch = useCallback(async (term?: string) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const { data, error } = await supabase.rpc('get_pick_material_stats', {
        p_search_term: (term ?? searchTerm).trim()
      });
      
      if (error) throw error;
      setStats(data || []);
    } catch (err) {
      console.error("Error fetching pick stats:", err);
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    // eslint-disable-next-line
    handleSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasSearched) return;
    const timer = setTimeout(() => {
      handleSearch();
    }, 600);
    return () => clearTimeout(timer);
  }, [searchTerm, handleSearch, hasSearched]);

  const filteredStats = useMemo(() => {
    if (abcFilter === 'all') return stats;
    return stats.filter(s => getAbcClass(s.total_tos) === abcFilter);
  }, [stats, abcFilter]);

  // KPI summary
  const kpi = useMemo(() => {
    const totalMaterials = stats.length;
    const totalTOs = stats.reduce((s, m) => s + m.total_tos, 0);
    const totalQty = stats.reduce((s, m) => s + Number(m.total_qty || 0), 0);
    
    // Top aisle across all materials
    const aisleMap: Record<string, number> = {};
    stats.forEach(m => {
      (m.top_bins || []).forEach(b => {
        const aisle = b.bin.split('-')[0]?.replace(/[^a-zA-Z0-9]/g, '') || '?';
        aisleMap[aisle] = (aisleMap[aisle] || 0) + b.tos;
      });
    });
    const topAisle = Object.entries(aisleMap).sort((a, b) => b[1] - a[1])[0];
    
    // ABC distribution
    const abcDist = { A: 0, B: 0, C: 0 };
    stats.forEach(s => { abcDist[getAbcClass(s.total_tos) as keyof typeof abcDist]++; });

    return { totalMaterials, totalTOs, totalQty, topAisle, abcDist };
  }, [stats]);

  const abcChartData = useMemo(() => [
    { name: 'A (Vysoká)', value: kpi.abcDist.A, fill: '#ef4444' },
    { name: 'B (Střední)', value: kpi.abcDist.B, fill: '#f59e0b' },
    { name: 'C (Nízká)', value: kpi.abcDist.C, fill: '#22c55e' },
  ], [kpi.abcDist]);

  const parseAisleData = (bins: TopBin[]) => {
    const counts: Record<string, number> = {};
    bins.forEach(b => {
      const segment = b.bin.split('-')[0] || b.bin.substring(0, 2);
      const cleanAisle = segment.replace(/[^a-zA-Z0-9]/g, '');
      counts[cleanAisle] = (counts[cleanAisle] || 0) + b.tos;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: `Ulička ${name}`, value }))
      .sort((a, b) => b.value - a.value);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <PackageSearch className="w-8 h-8 text-blue-400" />
            Pick Analytika & Heatmapa pozic
          </h1>
          <p className="text-white/40 mt-1">
            Sledujte frekvenci vychystávání materiálů a zátěžové zóny uliček přímo na skladě.
          </p>
        </div>
      </div>

      {/* KPI karty */}
      {hasSearched && stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-5"><Layers className="w-16 h-16 text-blue-400" /></div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><Hash className="w-3 h-3" /> Materiálů</p>
            <p className="text-3xl font-black text-white">{kpi.totalMaterials}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded-full">A:{kpi.abcDist.A}</span>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full">B:{kpi.abcDist.B}</span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full">C:{kpi.abcDist.C}</span>
            </div>
          </div>
          <div className="glass-panel p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-5"><PackageSearch className="w-16 h-16 text-blue-400" /></div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Celkem TO</p>
            <p className="text-3xl font-black text-blue-400">{kpi.totalTOs.toLocaleString()}</p>
          </div>
          <div className="glass-panel p-5 relative overflow-hidden">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><Layers className="w-3 h-3" /> Celkem Kusů</p>
            <p className="text-3xl font-black text-white/80">{kpi.totalQty.toLocaleString()}</p>
          </div>
          <div className="glass-panel p-5 relative overflow-hidden bg-gradient-to-br from-rose-500/5 to-transparent">
            <div className="absolute top-0 right-0 p-3 opacity-5"><MapPin className="w-16 h-16 text-rose-400" /></div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Nejvíce zatížená</p>
            <p className="text-2xl font-black text-rose-400">{kpi.topAisle ? `Ulička ${kpi.topAisle[0]}` : '—'}</p>
            {kpi.topAisle && <p className="text-xs text-white/30 mt-1">{kpi.topAisle[1].toLocaleString()} TO</p>}
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
              placeholder="Zadejte název nebo kód materiálu (např. MAT-01)..." 
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button 
            onClick={() => handleSearch()}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Hledat"}
          </button>
        </div>

        <div className="flex gap-4 items-center flex-wrap">
          <Filter className="w-4 h-4 text-white/40" />
          <span className="text-xs text-white/50">Obrátkovost:</span>
          {ABC_CLASSES.map(cls => (
            <button
              key={cls.key}
              onClick={() => setAbcFilter(cls.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                abcFilter === cls.key 
                  ? `${cls.color} bg-white/10 border-white/20` 
                  : 'text-white/40 border-white/5 hover:bg-white/5'
              }`}
            >
              {cls.label}
            </button>
          ))}
          {abcFilter !== 'all' && (
            <span className="text-xs text-white/30 ml-2">
              Zobrazeno {filteredStats.length} z {stats.length}
            </span>
          )}
        </div>
      </div>

      {/* ABC overview mini chart */}
      {hasSearched && stats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-panel p-5 flex flex-col items-center justify-center">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> ABC distribuce
            </h4>
            <div className="h-[140px] w-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={abcChartData} innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value" stroke="none">
                    {abcChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: '6px', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Top 10 materials bar chart */}
          <div className="lg:col-span-2 glass-panel p-5">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Top 10 materiálů dle TO
            </h4>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.slice(0, 10).map(s => ({ name: s.material.length > 12 ? s.material.substring(0, 12) + '…' : s.material, tos: s.total_tos }))} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.25)" fontSize={9} tickLine={false} axisLine={false} width={100} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: '6px', fontSize: '11px' }} />
                  <Bar dataKey="tos" name="TO" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Výsledky */}
      {loading ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-white/40">Sestavuji prostorové mapy...</p>
        </div>
      ) : hasSearched && filteredStats.length === 0 ? (
        <div className="glass-panel p-12 text-center text-white/50">
          {abcFilter !== 'all' ? `Žádné materiály v třídě ${abcFilter} pro zadaný dotaz.` : 'Pro zadaný dotaz nebyly nalezeny žádné záznamy o pickování.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filteredStats.map((stat, idx) => {
            const heatmapData = parseAisleData(stat.top_bins || []);
            const abc = getAbcClass(stat.total_tos);
            const abcColor = abc === 'A' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : abc === 'B' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

            return (
              <div key={stat.material || idx} className="glass-panel p-6 flex flex-col lg:flex-row gap-6 items-start lg:items-center hover:bg-white/[0.01] transition-colors">
                
                {/* Levé info */}
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-xl font-bold text-white truncate font-mono" title={stat.material}>{stat.material}</h3>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium shrink-0 ${abcColor}`}>
                      {abc}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/5">
                      <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Hash className="w-3 h-3" /> Potvrzených TO
                      </p>
                      <p className="text-2xl font-semibold text-blue-400">{stat.total_tos.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/5">
                      <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Layers className="w-3 h-3" /> Celkem Kusů
                      </p>
                      <p className="text-2xl font-semibold text-white/90">{Number(stat.total_qty || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Střední info: Top biny */}
                <div className="flex-1 w-full bg-white/[0.01] rounded-xl p-4 border border-white/5">
                  <h4 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-400" />
                    Top Skladové biny
                  </h4>
                  {stat.top_bins && stat.top_bins.length > 0 ? (
                    <div className="space-y-2">
                      {stat.top_bins.slice(0, 4).map((bin, i) => {
                        const maxTos = stat.top_bins[0]?.tos || 1;
                        const pct = Math.min(100, Math.round((bin.tos / maxTos) * 100));
                        return (
                          <div key={i} className="relative flex justify-between items-center bg-black/30 rounded p-2 px-3 overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500/10 to-transparent" style={{ width: `${pct}%` }} />
                            <span className="text-sm text-white/80 font-mono relative z-10">{bin.bin || 'Neznámý bin'}</span>
                            <span className="text-xs font-bold text-white/50 bg-white/5 px-2 py-0.5 rounded-full relative z-10">{bin.tos} TO</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-white/40">Žádná prostorová data k dispozici.</p>
                  )}
                </div>

                {/* Pravé info: Heatmapa */}
                {heatmapData.length > 0 ? (
                  <div className="w-full lg:w-[180px] shrink-0 flex flex-col items-center justify-center bg-white/[0.01] border border-white/5 rounded-xl p-3">
                    <h4 className="text-xs font-semibold text-white/40 mb-1 flex items-center gap-1 uppercase tracking-wider">
                      <LayoutGrid className="w-3 h-3" /> Zátěž uliček
                    </h4>
                    <div className="h-[110px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={heatmapData}
                            innerRadius={28}
                            outerRadius={45}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {heatmapData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={HEATMAP_COLORS[index % HEATMAP_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: '6px', fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-white/50 text-center font-medium truncate w-full">
                      Max: <span className="text-rose-400 font-bold">{heatmapData[0]?.name.replace('Ulička ', 'Ul. ')}</span>
                    </p>
                  </div>
                ) : (
                  <div className="w-full lg:w-[180px] h-[154px] flex items-center justify-center text-xs text-white/30">Bez uliček</div>
                )}
                
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
