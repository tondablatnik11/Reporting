"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Truck, Search, Loader2, PackageSearch, Box, Clock, 
  Users, MapPin, Weight, Hash, Layers, ArrowRight, Tag
} from "lucide-react";

type DeliveryDetail = {
  delivery: string;
  shipping_point: string;
  category: string;
  carrier: string; // NOVÝ SLOUPEC
  pick_tos: number;
  pick_qty: number;
  pick_weight: number;
  pick_operators: string[];
  pick_bins: string[];
  pack_hus: number;
  pack_weight: number;
  pack_operators: string[];
  pack_materials: string[];
  first_pick_at: string | null;
  last_pick_at: string | null;
  first_pack_at: string | null;
  last_pack_at: string | null;
};

const categoryColors: Record<string, { bg: string, text: string, label: string }> = {
  Normal: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Normal" },
  Express: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Express" },
  OE: { bg: "bg-rose-500/20", text: "text-rose-400", label: "OE" },
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function calcLeadTime(pickEnd: string | null, packStart: string | null): string {
  if (!pickEnd || !packStart) return "—";
  const diff = new Date(packStart).getTime() - new Date(pickEnd).getTime();
  if (diff < 0) return "—";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

export default function DeliveryAnalyticsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DeliveryDetail[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);

  const handleSearch = useCallback(async (term?: string) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const cleanTerm = (term ?? searchTerm).trim();
      const { data, error } = await supabase.rpc('get_delivery_detail', {
        p_search_term: cleanTerm
      });
      if (error) throw error;
      setResults(data || []);
    } catch (err) {
      console.error("Error fetching delivery detail:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    handleSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpand = (delivery: string) => {
    setExpandedDelivery(prev => prev === delivery ? null : delivery);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Truck className="w-8 h-8 text-cyan-400" />
          Delivery Analytika
        </h1>
        <p className="text-white/40 mt-1">
          Vyhledejte číslo dodávky a uvidíte kompletní přehled – kdo pickoval, kdo balil, z jakých pozic, jaké obaly a časovou osu.
        </p>
      </div>

      {/* Vyhledávání */}
      <div className="glass-panel p-5 flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
          <input 
            type="text" 
            placeholder="Zadejte číslo dodávky (např. 8000012345)..." 
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50 transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <button 
          onClick={() => handleSearch()}
          disabled={loading}
          className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Hledat"}
        </button>
      </div>

      {/* Výsledky */}
      {loading ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-sm text-white/40">Prohledávám databázi...</p>
        </div>
      ) : hasSearched && results.length === 0 ? (
        <div className="glass-panel p-12 text-center text-white/50">
          Pro zadaný dotaz nebyly nalezeny žádné dodávky.
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((del, idx) => {
            const cat = categoryColors[del.category] || categoryColors.Normal;
            const isExpanded = expandedDelivery === del.delivery;
            const leadTime = calcLeadTime(del.last_pick_at, del.first_pack_at);

            return (
              <div key={del.delivery || idx} className="glass-panel overflow-hidden">
                {/* Hlavní řádek */}
                <button 
                  onClick={() => toggleExpand(del.delivery)}
                  className="w-full p-5 flex flex-col md:flex-row gap-4 md:items-center text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start md:items-center gap-3 md:w-[320px] shrink-0">
                    <Truck className="w-5 h-5 text-cyan-400 shrink-0 mt-1 md:mt-0" />
                    <div>
                      <p className="text-lg font-bold text-white font-mono">{del.delivery}</p>
                      <div className="flex items-center flex-wrap gap-2 mt-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cat.bg} ${cat.text}`}>
                          {cat.label}
                        </span>
                        {del.shipping_point && (
                          <span className="text-xs text-white/30">{del.shipping_point}</span>
                        )}
                        {/* NOVÉ: Zobrazení dopravce */}
                        {del.carrier && (
                          <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                            Dopravce: <span className="font-semibold text-white/60">{del.carrier}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-6 flex-wrap flex-1 justify-start md:justify-end pr-4">
                    <div className="text-center min-w-[80px]">
                      <p className="text-xs text-white/40 flex items-center gap-1 justify-center"><PackageSearch className="w-3 h-3" /> Pick TO</p>
                      <p className="text-xl font-bold text-blue-400">{Number(del.pick_tos).toLocaleString()}</p>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <p className="text-xs text-white/40 flex items-center gap-1 justify-center"><Layers className="w-3 h-3" /> Pick Ks</p>
                      <p className="text-xl font-bold text-white/80">{Number(del.pick_qty).toLocaleString()}</p>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <p className="text-xs text-white/40 flex items-center gap-1 justify-center"><Box className="w-3 h-3" /> Pack HU</p>
                      <p className="text-xl font-bold text-purple-400">{Number(del.pack_hus).toLocaleString()}</p>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <p className="text-xs text-white/40 flex items-center gap-1 justify-center"><Clock className="w-3 h-3" /> Lead Time</p>
                      <p className="text-lg font-semibold text-cyan-400">{leadTime}</p>
                    </div>
                  </div>

                  <ArrowRight className={`w-5 h-5 text-white/30 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Rozbalený detail */}
                {isExpanded && (
                  <div className="border-t border-white/5 p-5 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.01]">
                    
                    {/* Picking sekce */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                        <PackageSearch className="w-4 h-4" /> Picking
                      </h4>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                          <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Hash className="w-3 h-3" /> Úkolů (TO)</p>
                          <p className="text-xl font-bold text-blue-400">{Number(del.pick_tos).toLocaleString()}</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                          <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Layers className="w-3 h-3" /> Kusů</p>
                          <p className="text-xl font-bold text-white/80">{Number(del.pick_qty).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                        <p className="text-xs text-white/40 mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Časové okno pickingu</p>
                        <div className="flex items-center gap-2 text-sm text-white/70">
                          <span>{formatDateTime(del.first_pick_at)}</span>
                          <ArrowRight className="w-4 h-4 text-white/30" />
                          <span>{formatDateTime(del.last_pick_at)}</span>
                        </div>
                      </div>

                      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                        <p className="text-xs text-white/40 mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> Pickeři</p>
                        <div className="flex flex-wrap gap-2">
                          {(del.pick_operators || []).filter(Boolean).map((op, i) => (
                            <span key={i} className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full font-medium">{op}</span>
                          ))}
                          {(!del.pick_operators || del.pick_operators.filter(Boolean).length === 0) && (
                            <span className="text-xs text-white/30">Žádní operátoři</span>
                          )}
                        </div>
                      </div>

                      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                        <p className="text-xs text-white/40 mb-2 flex items-center gap-1"><MapPin className="w-3 h-3" /> Zdrojové lokace</p>
                        <div className="flex flex-wrap gap-2">
                          {(del.pick_bins || []).filter(Boolean).slice(0, 10).map((bin, i) => (
                            <span key={i} className="text-xs bg-white/10 text-white/70 px-2 py-1 rounded font-mono">{bin}</span>
                          ))}
                          {(!del.pick_bins || del.pick_bins.filter(Boolean).length === 0) && (
                            <span className="text-xs text-white/30">Žádné lokace</span>
                          )}
                          {del.pick_bins && del.pick_bins.length > 10 && (
                            <span className="text-xs text-white/30">+{del.pick_bins.length - 10} dalších</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Packing sekce */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                        <Box className="w-4 h-4" /> Packing
                      </h4>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                          <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Hash className="w-3 h-3" /> Zabalených HU</p>
                          <p className="text-xl font-bold text-purple-400">{Number(del.pack_hus).toLocaleString()}</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                          <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Weight className="w-3 h-3" /> Váha (kg)</p>
                          <p className="text-xl font-bold text-white/80">{Number(del.pack_weight || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                        </div>
                      </div>

                      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                        <p className="text-xs text-white/40 mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Časové okno balení</p>
                        <div className="flex items-center gap-2 text-sm text-white/70">
                          <span>{formatDateTime(del.first_pack_at)}</span>
                          <ArrowRight className="w-4 h-4 text-white/30" />
                          <span>{formatDateTime(del.last_pack_at)}</span>
                        </div>
                      </div>

                      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                        <p className="text-xs text-white/40 mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> Packeři</p>
                        <div className="flex flex-wrap gap-2">
                          {(del.pack_operators || []).filter(Boolean).map((op, i) => (
                            <span key={i} className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full font-medium">{op}</span>
                          ))}
                          {(!del.pack_operators || del.pack_operators.filter(Boolean).length === 0) && (
                            <span className="text-xs text-white/30">Žádní operátoři</span>
                          )}
                        </div>
                      </div>

                      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                        <p className="text-xs text-white/40 mb-2 flex items-center gap-1"><Tag className="w-3 h-3" /> Použité obaly</p>
                        <div className="flex flex-wrap gap-2">
                          {(del.pack_materials || []).filter(Boolean).map((mat, i) => (
                            <span key={i} className="text-xs bg-purple-500/10 text-purple-300 px-2 py-1 rounded font-medium">{mat}</span>
                          ))}
                          {(!del.pack_materials || del.pack_materials.filter(Boolean).length === 0) && (
                            <span className="text-xs text-white/30">Žádné obaly</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Celkový časový přehled */}
                    {leadTime !== "—" && (
                      <div className="md:col-span-2 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-purple-500/10 rounded-lg p-4 border border-cyan-500/20 flex items-center gap-4">
                        <Clock className="w-6 h-6 text-cyan-400 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-white/80">
                            Lead Time (od posledního picku do prvního balení): <span className="text-cyan-400 text-lg">{leadTime}</span>
                          </p>
                          <p className="text-xs text-white/40 mt-0.5">
                            Picking dokončen: {formatDateTime(del.last_pick_at)} → Balení započato: {formatDateTime(del.first_pack_at)}
                          </p>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
