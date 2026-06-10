"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area 
} from "recharts";
import { 
  Loader2, AlertCircle, Users2, Search, Trophy, UserCircle, 
  X, Calendar, TrendingUp, PackageSearch, Box, Award
} from "lucide-react";

export default function OperatorAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: opData, error: opError } = await supabase.rpc('get_operator_daily_summary');
      if (opError) throw opError;
      
      setData(opData || []);
    } catch (err: any) {
      console.error("Operators fetch error:", err);
      setError(err.message || "Nepodařilo se načíst data z databáze.");
    } finally {
      setLoading(false);
    }
  };

  // 1. Zpracování dat pro Leaderboardy a Seznam
  const { topPickers, topPackers, allOperators } = useMemo(() => {
    const pickMap = new Map<string, { total: number, days: number }>();
    const packMap = new Map<string, { total: number, days: number }>();
    const allOpsMap = new Map<string, { name: string, pick: number, pack: number, days: number }>();

    data.forEach(row => {
      if (!row.operator) return;
      const opName = row.operator;

      if (!allOpsMap.has(opName)) {
        allOpsMap.set(opName, { name: opName, pick: 0, pack: 0, days: 0 });
      }

      if (row.role === 'Picker') {
        const prev = pickMap.get(opName) || { total: 0, days: 0 };
        pickMap.set(opName, { total: prev.total + row.pick_tos, days: prev.days + 1 });
        allOpsMap.get(opName)!.pick += row.pick_tos;
      } else if (row.role === 'Packer') {
        const prev = packMap.get(opName) || { total: 0, days: 0 };
        packMap.set(opName, { total: prev.total + row.pack_hus, days: prev.days + 1 });
        allOpsMap.get(opName)!.pack += row.pack_hus;
      }
      
      // Započítáme unikátní dny bez ohledu na roli (aby se dny nesčítaly 2x, pokud dělal obojí)
      // To by vyžadovalo složitější logiku, pro zjednodušení bereme max. z rolí
    });

    const sortedPickers = Array.from(pickMap.entries())
      .map(([name, stats]) => ({ name, total: stats.total, avg: Math.round(stats.total / stats.days), days: stats.days }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const sortedPackers = Array.from(packMap.entries())
      .map(([name, stats]) => ({ name, total: stats.total, avg: Math.round(stats.total / stats.days), days: stats.days }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const operatorsList = Array.from(allOpsMap.values()).sort((a, b) => (b.pick + b.pack) - (a.pick + a.pack));

    return { topPickers: sortedPickers, topPackers: sortedPackers, allOperators: operatorsList };
  }, [data]);

  // 2. Vyhledávání
  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    return allOperators.filter(op => op.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, allOperators]);

  // 3. Detail vybraného operátora (Modal)
  const selectedOpDetails = useMemo(() => {
    if (!selectedOperator) return null;

    const opData = data.filter(d => d.operator === selectedOperator);
    const byDate = new Map<string, any>();

    let totalPick = 0;
    let totalPack = 0;
    let bestPickDay = { date: '', val: 0 };
    let bestPackDay = { date: '', val: 0 };

    opData.forEach(d => {
      const existing = byDate.get(d.report_date) || { 
        dateObj: new Date(d.report_date),
        label: new Date(d.report_date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }),
        fullDate: new Date(d.report_date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }),
        pick_tos: 0,
        pack_hus: 0,
      };
      
      if (d.role === 'Picker') {
        existing.pick_tos += d.pick_tos;
        totalPick += d.pick_tos;
        if (d.pick_tos > bestPickDay.val) bestPickDay = { date: existing.fullDate, val: d.pick_tos };
      }
      
      if (d.role === 'Packer') {
        existing.pack_hus += d.pack_hus;
        totalPack += d.pack_hus;
        if (d.pack_hus > bestPackDay.val) bestPackDay = { date: existing.fullDate, val: d.pack_hus };
      }
      
      byDate.set(d.report_date, existing);
    });

    const chartData = Array.from(byDate.values()).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    const daysActive = chartData.length;

    return {
      name: selectedOperator,
      chartData,
      totalPick,
      totalPack,
      daysActive,
      avgPick: daysActive ? Math.round(totalPick / daysActive) : 0,
      avgPack: daysActive ? Math.round(totalPack / daysActive) : 0,
      bestPickDay,
      bestPackDay
    };
  }, [selectedOperator, data]);


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
        <Users2 className="w-12 h-12 text-white/20 mx-auto" />
        <h2 className="text-xl font-bold text-white">Žádná data pro analýzu</h2>
        <p className="text-white/60">Importujte nejprve data pro zobrazení analytiky zaměstnanců.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      {/* HEADER & VYHLEDÁVÁNÍ */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Users2 className="w-7 h-7 text-blue-400" /> Analytika Operátorů
          </h1>
          <p className="text-white/40 text-sm mt-1">Dlouhodobý výkon jednotlivých lidí ({allOperators.length} aktivních operátorů)</p>
        </div>
        
        <div className="relative w-full lg:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-white/40" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2.5 border border-white/10 rounded-xl bg-white/5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white/10 transition-all"
            placeholder="Hledat operátora..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {searchQuery ? (
        // VÝSLEDKY VYHLEDÁVÁNÍ
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider">Výsledky vyhledávání ({searchResults.length})</h2>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {searchResults.map(op => (
                <div 
                  key={op.name} 
                  onClick={() => setSelectedOperator(op.name)}
                  className="glass-panel p-4 cursor-pointer hover:bg-white/10 hover:border-blue-500/30 hover:-translate-y-1 transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                      <UserCircle className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="font-bold text-white truncate">{op.name}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-white/40 text-xs">Picking</div>
                      <div className="text-blue-400 font-semibold">{op.pick.toLocaleString()} TO</div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Packing</div>
                      <div className="text-purple-400 font-semibold">{op.pack.toLocaleString()} HU</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-panel p-8 text-center text-white/40">
              Zadanému jménu nevyhovuje žádný záznam.
            </div>
          )}
        </div>
      ) : (
        // LEADERBOARD (Výchozí zobrazení)
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-panel p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Trophy className="w-6 h-6 text-blue-400" /> Síň slávy: Pickeři
            </h3>
            <div className="space-y-3">
              {topPickers.map((p, idx) => (
                <div 
                  key={p.name} 
                  onClick={() => setSelectedOperator(p.name)}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-blue-500/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shadow-lg ${idx === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-600 text-black' : idx === 1 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-black' : idx === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-600 text-black' : 'bg-white/5 text-white/50 border border-white/10'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</div>
                      <div className="text-xs text-white/40 flex items-center gap-2">
                        <span><Calendar className="inline w-3 h-3 mr-0.5" /> {p.days} směn</span>
                        <span>•</span>
                        <span>Ø {p.avg} TO/den</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-xl text-blue-400">{p.total.toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wider text-blue-400/50">Total TO</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Trophy className="w-6 h-6 text-purple-400" /> Síň slávy: Packeři
            </h3>
            <div className="space-y-3">
              {topPackers.map((p, idx) => (
                <div 
                  key={p.name} 
                  onClick={() => setSelectedOperator(p.name)}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-purple-500/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shadow-lg ${idx === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-600 text-black' : idx === 1 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-black' : idx === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-600 text-black' : 'bg-white/5 text-white/50 border border-white/10'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-purple-400 transition-colors">{p.name}</div>
                      <div className="text-xs text-white/40 flex items-center gap-2">
                        <span><Calendar className="inline w-3 h-3 mr-0.5" /> {p.days} směn</span>
                        <span>•</span>
                        <span>Ø {p.avg} HU/den</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-xl text-purple-400">{p.total.toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wider text-purple-400/50">Total HU</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DETAIL OPERÁTORA (MODAL okno) */}
      {selectedOperator && selectedOpDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Tmavé pozadí (Kliknutím mimo okno se zavře) */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedOperator(null)}
          ></div>
          
          {/* Samotné Modal okno */}
          <div className="relative bg-[#0a0e1e] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in-up">
            
            {/* Modal Header */}
            <div className="sticky top-0 z-20 bg-[#0a0e1e]/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                  <UserCircle className="w-7 h-7 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedOpDetails.name}</h2>
                  <p className="text-sm text-white/50">Detailní karta operátora</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedOperator(null)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 hover:text-red-400 transition-colors text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Osobní KPI Karty */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> Odpracováno</p>
                  <p className="text-2xl font-bold text-white">{selectedOpDetails.daysActive} <span className="text-sm text-white/40">směn</span></p>
                </div>
                <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/20">
                  <p className="text-xs text-blue-400/70 uppercase tracking-wider mb-1 flex items-center gap-1.5"><PackageSearch className="w-3.5 h-3.5"/> Total Picking</p>
                  <p className="text-2xl font-black text-blue-400">{selectedOpDetails.totalPick.toLocaleString()} <span className="text-sm font-medium text-blue-400/50">TO</span></p>
                  <p className="text-xs text-blue-400/60 mt-1">Průměr: {selectedOpDetails.avgPick} TO/den</p>
                </div>
                <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/20">
                  <p className="text-xs text-purple-400/70 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Box className="w-3.5 h-3.5"/> Total Packing</p>
                  <p className="text-2xl font-black text-purple-400">{selectedOpDetails.totalPack.toLocaleString()} <span className="text-sm font-medium text-purple-400/50">HU</span></p>
                  <p className="text-xs text-purple-400/60 mt-1">Průměr: {selectedOpDetails.avgPack} HU/den</p>
                </div>
                <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                  <p className="text-xs text-amber-400/70 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Award className="w-3.5 h-3.5"/> Osobní Rekord</p>
                  <p className="text-2xl font-black text-amber-400">
                    {Math.max(selectedOpDetails.bestPickDay.val, selectedOpDetails.bestPackDay.val).toLocaleString()}
                  </p>
                  <p className="text-[10px] leading-tight text-amber-400/70 mt-1">
                    TO ({selectedOpDetails.bestPickDay.date})<br/>
                    HU ({selectedOpDetails.bestPackDay.date})
                  </p>
                </div>
              </div>

              {/* Osobní Graf Výkonu */}
              <div className="bg-white/5 rounded-xl p-5 border border-white/5">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-400" /> 
                  Historie osobního výkonu (Po dnech)
                </h3>
                <div className="w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedOpDetails.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pickColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.5}/>
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="packColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#c084fc" stopOpacity={0.5}/>
                          <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '10px' }} 
                        labelStyle={{ color: '#ffffff80', marginBottom: '4px' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '10px' }} />
                      
                      <Area type="monotone" dataKey="pick_tos" name="Picking (TO)" stroke="#60a5fa" strokeWidth={3} fill="url(#pickColor)" />
                      <Area type="monotone" dataKey="pack_hus" name="Packing (HU)" stroke="#c084fc" strokeWidth={3} fill="url(#packColor)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
