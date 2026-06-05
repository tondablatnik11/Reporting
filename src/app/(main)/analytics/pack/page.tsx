"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Box, Search, Loader2, Calendar, Filter } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type PackStat = {
  packaging_material: string;
  packed_date: string;
  total_hus: number;
};

export default function PackAnalyticsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PackStat[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Datumový filtr
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleSearch = useCallback(async (term?: string) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params: Record<string, any> = {
        p_search_term: term ?? searchTerm
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

  // Seskupit výsledky podle obalu pro lepší zobrazení (protože RPC vrací řádky pro obal+den)
  const groupedByMaterial = stats.reduce((acc, row) => {
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

  const materials = Object.values(groupedByMaterial).sort((a, b) => b.total_hus - a.total_hus);

  // BUG 5 FIX: Sanitizovat ID gradientu
  const sanitizeId = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_');

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
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

      {/* Vyhledávání + datumový filtr */}
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

        {/* Datumový filtr */}
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
        <div className="grid grid-cols-1 gap-6">
          {materials.map((mat, idx) => {
            const gradientId = `grad-${sanitizeId(mat.material)}-${idx}`;
            return (
              <div key={mat.material || idx} className="glass-panel p-6 flex flex-col gap-6">
                
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <h3 className="text-xl font-bold text-white">{mat.material}</h3>
                  <div className="bg-white/5 rounded-lg px-6 py-2 border border-white/5 text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Zabalených HU celkem</p>
                    <p className="text-2xl font-bold text-purple-400">{mat.total_hus.toLocaleString()}</p>
                  </div>
                </div>

                {/* Graf vývoje */}
                <div className="w-full h-[250px] bg-white/[0.02] rounded-xl p-4 pt-6 border border-white/5 relative">
                  <h4 className="absolute top-4 left-4 text-xs font-semibold text-white/50 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Vývoj spotřeby (počet HU v čase)
                  </h4>
                  {mat.timeline.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={mat.timeline} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#c084fc" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis dataKey="date" stroke="#ffffff40" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#ffffff40" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e1e2d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          labelStyle={{ color: '#ffffff80' }}
                          itemStyle={{ color: '#c084fc' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="hus" 
                          name="Počet HU"
                          stroke="#c084fc" 
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
