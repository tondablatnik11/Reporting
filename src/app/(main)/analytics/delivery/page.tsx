"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Truck, Search, Loader2, PackageSearch, Box, Clock, 
  Users, MapPin, Weight, Hash, Layers, ArrowRight, Tag, BarChart3, Timer, CheckCircle2
} from "lucide-react";

type DeliveryDetail = {
  delivery: string;
  shipping_point: string;
  category: string;
  carrier: string;
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

const categoryColors: Record<string, { bg: string, text: string, border: string, label: string }> = {
  Normal: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30", label: "Normal" },
  Express: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30", label: "Express" },
  OE: { bg: "bg-rose-500/20", text: "text-rose-400", border: "border-rose-500/30", label: "OE" },
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function calcLeadTimeMinutes(pickEnd: string | null, packStart: string | null): number {
  if (!pickEnd || !packStart) return -1;
  const diff = new Date(packStart).getTime() - new Date(pickEnd).getTime();
  if (diff < 0) return -1;
  return Math.round(diff / 60000);
}

function formatLeadTime(mins: number): string {
  if (mins < 0) return "—";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function getStatusInfo(del: DeliveryDetail): { label: string; color: string; icon: typeof CheckCircle2 } {
  const hasPick = Number(del.pick_tos) > 0;
  const hasPack = Number(del.pack_hus) > 0;
  
  if (hasPick && hasPack) return { label: "Dokončeno", color: "text-emerald-400", icon: CheckCircle2 };
  if (hasPick) return { label: "Pickováno", color: "text-amber-400", icon: Timer };
  return { label: "Žádná data", color: "text-white/30", icon: Clock };
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

  // KPI stats
  const kpi = useMemo(() => {
    const totalDeliveries = results.length;
    const totalPickTOs = results.reduce((s, d) => s + Number(d.pick_tos), 0);
    const totalPackHUs = results.reduce((s, d) => s + Number(d.pack_hus), 0);
    
    const leadTimes = results.map(d => calcLeadTimeMinutes(d.last_pick_at, d.first_pack_at)).filter(t => t >= 0);
    const avgLeadTime = leadTimes.length > 0 ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : -1;
    
    const catDist = { Normal: 0, Express: 0, OE: 0 };
    results.forEach(d => {
      const cat = d.category as keyof typeof catDist;
      if (catDist[cat] !== undefined) catDist[cat]++;
    });

    // Unique carriers
    const carriers = new Set(results.map(d => d.carrier).filter(Boolean));

    return { totalDeliveries, totalPickTOs, totalPackHUs, avgLeadTime, catDist, carriers: carriers.size };
  }, [results]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in-up">
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

      {/* KPI karty */}
      {hasSearched && results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="glass-panel p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-5"><Truck className="w-14 h-14 text-cyan-400" /></div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Dodávek</p>
            <p className="text-2xl font-black text-white">{kpi.totalDeliveries}</p>
          </div>
          <div className="glass-panel p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><PackageSearch className="w-3 h-3" /> TO celkem</p>
            <p className="text-2xl font-black text-blue-400">{kpi.totalPickTOs.toLocaleString()}</p>
          </div>
          <div className="glass-panel p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><Box className="w-3 h-3" /> HU celkem</p>
            <p className="text-2xl font-black text-purple-400">{kpi.totalPackHUs.toLocaleString()}</p>
          </div>
          <div className="glass-panel p-4 bg-gradient-to-br from-cyan-500/5 to-transparent">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Ø Lead Time</p>
            <p className="text-2xl font-black text-cyan-400">{kpi.avgLeadTime >= 0 ? formatLeadTime(kpi.avgLeadTime) : '—'}</p>
          </div>
          <div className="glass-panel p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Kategorie</p>
            <div className="flex gap-1.5 mt-1">
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full">{kpi.catDist.Normal}</span>
              <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded-full">{kpi.catDist.Express}</span>
              <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded-full">{kpi.catDist.OE}</span>
            </div>
          </div>
          <div className="glass-panel p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1"><Truck className="w-3 h-3" /> Dopravců</p>
            <p className="text-2xl font-black text-white/80">{kpi.carriers}</p>
          </div>
        </div>
      )}

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
            const leadTimeMins = calcLeadTimeMinutes(del.last_pick_at, del.first_pack_at);
            const leadTime = formatLeadTime(leadTimeMins);
            const status = getStatusInfo(del);
            const StatusIcon = status.icon;

            // Timeline progress calculation
            const hasPick = Number(del.pick_tos) > 0;
            const hasPack = Number(del.pack_hus) > 0;
            const progress = hasPick && hasPack ? 100 : hasPick ? 50 : 0;

            return (
              <div key={del.delivery || idx} className="glass-panel overflow-hidden hover:bg-white/[0.01] transition-colors">
                {/* Hlavní řádek */}
                <button 
                  onClick={() => toggleExpand(del.delivery)}
                  className="w-full p-5 flex flex-col md:flex-row gap-4 md:items-center text-left transition-colors"
                >
                  <div className="flex items-start md:items-center gap-3 md:w-[340px] shrink-0">
                    <div className={`w-2 h-12 rounded-full shrink-0 ${hasPick && hasPack ? 'bg-emerald-400' : hasPick ? 'bg-amber-400' : 'bg-white/10'}`} />
                    <div>
                      <p className="text-lg font-bold text-white font-mono">{del.delivery}</p>
                      <div className="flex items-center flex-wrap gap-2 mt-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cat.bg} ${cat.text} ${cat.border}`}>
                          {cat.label}
                        </span>
                        {del.shipping_point && (
                          <span className="text-xs text-white/30">{del.shipping_point}</span>
                        )}
                        {del.carrier && (
                          <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                            <Truck className="w-3 h-3" /> <span className="font-semibold text-white/60">{del.carrier}</span>
                          </span>
                        )}
                        <span className={`text-xs ${status.color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" /> {status.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-6 flex-wrap flex-1 justify-start md:justify-end pr-4">
                    <div className="text-center min-w-[70px]">
                      <p className="text-xs text-white/40 flex items-center gap-1 justify-center"><PackageSearch className="w-3 h-3" /> TO</p>
                      <p className="text-xl font-bold text-blue-400">{Number(del.pick_tos).toLocaleString()}</p>
                    </div>
                    <div className="text-center min-w-[70px]">
                      <p className="text-xs text-white/40 flex items-center gap-1 justify-center"><Layers className="w-3 h-3" /> Ks</p>
                      <p className="text-xl font-bold text-white/80">{Number(del.pick_qty).toLocaleString()}</p>
                    </div>
                    <div className="text-center min-w-[70px]">
                      <p className="text-xs text-white/40 flex items-center gap-1 justify-center"><Box className="w-3 h-3" /> HU</p>
                      <p className="text-xl font-bold text-purple-400">{Number(del.pack_hus).toLocaleString()}</p>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <p className="text-xs text-white/40 flex items-center gap-1 justify-center"><Clock className="w-3 h-3" /> Lead</p>
                      <p className={`text-lg font-semibold ${leadTimeMins >= 0 ? 'text-cyan-400' : 'text-white/30'}`}>{leadTime}</p>
                    </div>
                  </div>

                  <ArrowRight className={`w-5 h-5 text-white/30 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Rozbalený detail */}
                {isExpanded && (
                  <div className="border-t border-white/5 p-5 space-y-5 bg-white/[0.01]">
                    
                    {/* Visual timeline */}
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                      <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Průběh zpracování</h4>
                      <div className="flex items-center gap-3">
                        <div className={`flex-1 h-2 rounded-full overflow-hidden bg-white/5`}>
                          <div 
                            className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500' : progress === 50 ? 'bg-gradient-to-r from-blue-500 to-amber-500' : 'bg-white/10'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-white/40">
                        <div className="flex items-center gap-1">
                          <PackageSearch className="w-3 h-3 text-blue-400" />
                          <span>{del.first_pick_at ? formatTime(del.first_pick_at) : '—'}</span>
                          <span className="text-white/20">→</span>
                          <span>{del.last_pick_at ? formatTime(del.last_pick_at) : '—'}</span>
                        </div>
                        {leadTimeMins >= 0 && (
                          <span className="text-cyan-400 font-medium">{leadTime} lead</span>
                        )}
                        <div className="flex items-center gap-1">
                          <Box className="w-3 h-3 text-purple-400" />
                          <span>{del.first_pack_at ? formatTime(del.first_pack_at) : '—'}</span>
                          <span className="text-white/20">→</span>
                          <span>{del.last_pack_at ? formatTime(del.last_pack_at) : '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                      {/* Picking sekce */}
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                          <PackageSearch className="w-4 h-4" /> Picking
                        </h4>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Hash className="w-3 h-3" /> TO</p>
                            <p className="text-xl font-bold text-blue-400">{Number(del.pick_tos).toLocaleString()}</p>
                          </div>
                          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Layers className="w-3 h-3" /> Kusů</p>
                            <p className="text-xl font-bold text-white/80">{Number(del.pick_qty).toLocaleString()}</p>
                          </div>
                        </div>

                        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                          <p className="text-xs text-white/40 mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Časové okno</p>
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
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Hash className="w-3 h-3" /> HU</p>
                            <p className="text-xl font-bold text-purple-400">{Number(del.pack_hus).toLocaleString()}</p>
                          </div>
                          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1"><Weight className="w-3 h-3" /> Váha</p>
                            <p className="text-xl font-bold text-white/80">{Number(del.pack_weight || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</p>
                          </div>
                        </div>

                        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                          <p className="text-xs text-white/40 mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Časové okno</p>
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

                      {/* Lead Time banner */}
                      {leadTimeMins >= 0 && (
                        <div className="md:col-span-2 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-purple-500/10 rounded-lg p-4 border border-cyan-500/20 flex items-center gap-4">
                          <Clock className="w-6 h-6 text-cyan-400 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-white/80">
                              Lead Time (pick → pack): <span className="text-cyan-400 text-lg">{leadTime}</span>
                            </p>
                            <p className="text-xs text-white/40 mt-0.5">
                              Picking dokončen: {formatDateTime(del.last_pick_at)} → Balení započato: {formatDateTime(del.first_pack_at)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
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
