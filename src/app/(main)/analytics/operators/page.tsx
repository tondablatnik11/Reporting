"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { Loader2, AlertCircle, Users2, Search, Trophy, UserCircle } from "lucide-react";

export default function OperatorAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  const { topPickers, topPackers, uniqueOperatorsCount } = useMemo(() => {
    const pickMap = new Map<string, { total: number, days: number }>();
    const packMap = new Map<string, { total: number, days: number }>();
    const allOps = new Set<string>();

    data.forEach(row => {
      if (!row.operator) return;
      allOps.add(row.operator);

      if (row.role === 'Picker') {
        const prev = pickMap.get(row.operator) || { total: 0, days: 0 };
        pickMap.set(row.operator, { total: prev.total + row.pick_tos, days: prev.days + 1 });
      } else if (row.role === 'Packer') {
        const prev = packMap.get(row.operator) || { total: 0, days: 0 };
        packMap.set(row.operator, { total: prev.total + row.pack_hus, days: prev.days + 1 });
      }
    });

    const sortedPickers = Array.from(pickMap.entries())
      .map(([name, stats]) => ({ name, total: stats.total, avg: Math.round(stats.total / stats.days) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const sortedPackers = Array.from(packMap.entries())
      .map(([name, stats]) => ({ name, total: stats.total, avg: Math.round(stats.total / stats.days) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return { topPickers: sortedPickers, topPackers: sortedPackers, uniqueOperatorsCount: allOps.size };
  }, [data]);

  const selectedOperatorData = useMemo(() => {
    if (!searchQuery) return [];
    const lowerQuery = searchQuery.toLowerCase();
    
    // Najdeme záznamy pro daného operátora (fuzzy match)
    const filtered = data.filter(d => d.operator && d.operator.toLowerCase().includes(lowerQuery));
    
    // Seskupit podle dne (pro případ že by dělal víc rolí v jeden den)
    const byDate = new Map<string, any>();
    
    filtered.forEach(d => {
      const existing = byDate.get(d.report_date) || { 
        dateObj: new Date(d.report_date),
        dateLabel: new Date(d.report_date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }),
        pick_tos: 0,
        pack_hus: 0,
        operatorName: d.operator
      };
      
      existing.pick_tos += d.pick_tos;
      existing.pack_hus += d.pack_hus;
      
      byDate.set(d.report_date, existing);
    });

    return Array.from(byDate.values()).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  }, [data, searchQuery]);


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
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Analytika Operátorů</h1>
          <p className="text-white/40 text-sm mt-1">Dlouhodobý výkon jednotlivých lidí ({uniqueOperatorsCount} aktivních operátorů)</p>
        </div>
        
        <div className="relative w-full lg:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-white/40" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-white/10 rounded-xl bg-white/5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="Hledat jméno nebo SAP ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {searchQuery ? (
        // OSOBNÍ KARTA OPERÁTORA (Při vyhledávání)
        <div className="glass-panel p-6 border-l-4 border-l-amber-400">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-amber-400/20 flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Osobní Výsledky</h2>
              <p className="text-white/50 text-sm">Hledaný výraz: "{searchQuery}"</p>
            </div>
          </div>
          
          {selectedOperatorData.length > 0 ? (
             <div className="w-full h-[350px]">
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={selectedOperatorData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                 <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                 <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                 <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} />
                 <Legend wrapperStyle={{ paddingTop: '12px' }} />
                 
                 <Line type="monotone" dataKey="pick_tos" name="Picking (TO)" stroke="#60a5fa" strokeWidth={3} dot={{ r: 4, fill: "#0a0e1e", strokeWidth: 2 }} />
                 <Line type="monotone" dataKey="pack_hus" name="Packing (HU)" stroke="#c084fc" strokeWidth={3} dot={{ r: 4, fill: "#0a0e1e", strokeWidth: 2 }} />
               </LineChart>
             </ResponsiveContainer>
           </div>
          ) : (
            <div className="py-8 text-center text-white/40">Zadanému hledání nevyhovuje žádný operátor.</div>
          )}
        </div>
      ) : (
        // LEADERBOARD (Když se nehledá)
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-panel p-6">
            <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-blue-400" /> Sín slávy: Pickeři
            </h3>
            <div className="space-y-3">
              {topPickers.map((p, idx) => (
                <div key={p.name} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-amber-400/20 text-amber-400' : idx === 1 ? 'bg-slate-300/20 text-slate-300' : idx === 2 ? 'bg-orange-400/20 text-orange-400' : 'bg-white/5 text-white/50'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-medium text-white">{p.name}</div>
                      <div className="text-xs text-white/40">Průměrně {p.avg} TO / den</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-blue-400">{p.total.toLocaleString()} TO</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-6">
            <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-purple-400" /> Sín slávy: Packeři
            </h3>
            <div className="space-y-3">
              {topPackers.map((p, idx) => (
                <div key={p.name} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-amber-400/20 text-amber-400' : idx === 1 ? 'bg-slate-300/20 text-slate-300' : idx === 2 ? 'bg-orange-400/20 text-orange-400' : 'bg-white/5 text-white/50'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-medium text-white">{p.name}</div>
                      <div className="text-xs text-white/40">Průměrně {p.avg} HU / den</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-purple-400">{p.total.toLocaleString()} HU</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
