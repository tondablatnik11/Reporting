"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PackageSearch, Search, Loader2, MapPin, Hash, Layers } from "lucide-react";

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
        p_search_term: term ?? searchTerm
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

  // Načíst nejčastější materiály při prvním načtení (prázdné vyhledávání)
  useEffect(() => {
    handleSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce vyhledávání – automaticky hledá 500ms po posledním psaní
  useEffect(() => {
    if (!hasSearched) return; // Nehledat při prvním renderování
    const timer = setTimeout(() => {
      handleSearch();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, handleSearch, hasSearched]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <PackageSearch className="w-8 h-8 text-blue-400" />
            Pick Analytika (Materiály)
          </h1>
          <p className="text-white/40 mt-1">
            Vyhledejte materiál a podívejte se, kolikrát se pickoval a z jakých lokací.
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
          <p className="text-sm text-white/40">Prohledávám databázi...</p>
        </div>
      ) : hasSearched && stats.length === 0 ? (
        <div className="glass-panel p-12 text-center text-white/50">
          Pro zadaný dotaz nebyly nalezeny žádné materiály.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {stats.map((stat, idx) => (
            <div key={stat.material || idx} className="glass-panel p-6 flex flex-col md:flex-row gap-8 items-start md:items-center">
              
              {/* Levé info o materiálu */}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-white mb-4 truncate" title={stat.material}>{stat.material}</h3>
                <div className="flex gap-4 flex-wrap">
                  <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/5">
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Hash className="w-3 h-3" /> Celkem úkolů (TO)
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

              {/* Pravé info o lokacích */}
              <div className="flex-1 w-full bg-white/[0.02] rounded-xl p-4 border border-white/5">
                <h4 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  Top Lokace (Odkud se pickovalo)
                </h4>
                {stat.top_bins && stat.top_bins.length > 0 ? (
                  <div className="space-y-2">
                    {stat.top_bins.slice(0, 5).map((bin, i) => {
                      const maxTos = stat.top_bins[0]?.tos || 1;
                      const pct = Math.round((bin.tos / maxTos) * 100);
                      return (
                        <div key={bin.bin || i} className="relative flex justify-between items-center bg-black/20 rounded p-2 px-3 overflow-hidden">
                          <div className="absolute inset-0 bg-blue-500/10 rounded" style={{ width: `${pct}%` }} />
                          <span className="text-sm text-white/80 font-mono relative z-10">{bin.bin || 'Neznámá lokace'}</span>
                          <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded-full relative z-10">{bin.tos} TO</span>
                        </div>
                      );
                    })}
                    {stat.top_bins.length > 5 && (
                      <p className="text-xs text-white/30 text-center mt-2">a dalších {stat.top_bins.length - 5} lokací...</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-white/40">Zatím nejsou k dispozici žádná data o lokacích.</p>
                )}
              </div>
              
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
