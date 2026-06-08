"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PackageSearch, Search, Loader2, MapPin, Hash, Layers, LayoutGrid } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";

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

export default function PickAnalyticsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<MaterialStat[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

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

  // Pomocná metoda pro parsování uliček ze SAP formátu binů (např. 01-A-02 -> Ulička 01)
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
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
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

      {/* Vyhledávání */}
      <div className="glass-panel p-5 flex gap-4 items-center">
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

      {/* Výsledky */}
      {loading ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-white/40">Sestavuji prostorové mapy...</p>
        </div>
      ) : hasSearched && stats.length === 0 ? (
        <div className="glass-panel p-12 text-center text-white/50">
          Pro zadaný dotaz nebyly nalezeny žádné záznamy o pickování.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {stats.map((stat, idx) => {
            const heatmapData = parseAisleData(stat.top_bins || []);
            // Stanovení ABC třídy obrátkovosti na základě TO
            const abcClass = stat.total_tos > 100 ? 'A (Vysoká)' : stat.total_tos > 20 ? 'B (Střední)' : 'C (Nízká)';
            const abcColor = stat.total_tos > 100 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : stat.total_tos > 20 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

            return (
              <div key={stat.material || idx} className="glass-panel p-6 flex flex-col lg:flex-row gap-6 items-start lg:items-center">
                
                {/* Levé info: Charakteristika materiálu */}
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-xl font-bold text-white truncate font-mono" title={stat.material}>{stat.material}</h3>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${abcColor}`}>
                      Obrátkovost: {abcClass}
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

                {/* Střední info: Seznam nejvytíženějších pozic */}
                <div className="flex-1 w-full bg-white/[0.01] rounded-xl p-4 border border-white/5">
                  <h4 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-400" />
                    Top Skladové biny (Frekvence)
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

                {/* Pravé info: Heatmapa koncentrace v uličkách */}
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
