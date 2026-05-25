"use client";

import { useEffect, useState, useMemo } from "react";
import { PackageSearch, Box, Users, BarChart3 } from "lucide-react";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Link from "next/link";
import { useAggregatedData, useData } from "@/lib/data-context";

export default function TvModePage() {
  const [time, setTime] = useState("");
  const { chartData, totalPicking, totalPacking, totalPickingTOs, totalPackingHUs } = useAggregatedData();
  const { pickingData, packingData } = useData();

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { topPickers, topPackers, totalOperators } = useMemo(() => {
    const pickerTOs = new Map<string, number>();
    const packerHUs = new Map<string, number>();
    const allOps = new Set<string>();

    pickingData.forEach(r => {
      if (r.operator && r.quantity > 0) {
        allOps.add(r.operator);
        pickerTOs.set(r.operator, (pickerTOs.get(r.operator) || 0) + 1);
      }
    });
    packingData.forEach(r => {
      if (r.operator && r.hu_number) {
        allOps.add(r.operator);
        packerHUs.set(r.operator, (packerHUs.get(r.operator) || 0) + 1);
      }
    });

    return {
      topPickers: Array.from(pickerTOs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      topPackers: Array.from(packerHUs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      totalOperators: allOps.size,
    };
  }, [pickingData, packingData]);

  return (
    <div className="min-h-screen bg-[#030507] p-8 flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black text-white tracking-wide mb-2">Výkon Skladu (Živě)</h1>
          <div className="text-xl font-medium text-white/50">
            Směna: Ranní & Odpolední (05:45 - 21:45)
          </div>
        </div>
        <div className="text-right">
          <div className="text-5xl font-black text-emerald-400 font-mono tracking-wider">{time || "00:00:00"}</div>
          <Link href="/dashboard" className="text-sm text-white/40 hover:text-white mt-2 inline-block transition-colors">
            Zpět na Dashboard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-8 mb-8">
        <div className="glass-panel p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10"><PackageSearch className="w-32 h-32 text-blue-400" /></div>
          <div className="relative z-10">
            <div className="text-6xl font-black text-white tracking-tight">{totalPickingTOs.toLocaleString()}</div>
            <div className="text-xl font-bold text-blue-400 mt-2">{totalPicking.toLocaleString()} Ks</div>
            <div className="text-sm font-semibold text-white/60 tracking-wider uppercase mt-6">Vypickované TO</div>
          </div>
        </div>

        <div className="glass-panel p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10"><Box className="w-32 h-32 text-purple-400" /></div>
          <div className="relative z-10">
            <div className="text-6xl font-black text-white tracking-tight">{totalPackingHUs.toLocaleString()}</div>
            <div className="text-xl font-bold text-purple-400 mt-2">{totalPacking.toLocaleString()} Ks</div>
            <div className="text-sm font-semibold text-white/60 tracking-wider uppercase mt-6">Zabalené HU</div>
          </div>
        </div>

        <div className="glass-panel p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10"><BarChart3 className="w-32 h-32 text-emerald-400" /></div>
          <div className="relative z-10">
            <div className="text-6xl font-black text-white tracking-tight">{totalPickingTOs + totalPackingHUs}</div>
            <div className="text-sm font-semibold text-white/60 tracking-wider uppercase mt-6">Celkem Operací</div>
          </div>
        </div>

        <div className="glass-panel p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10"><Users className="w-32 h-32 text-amber-400" /></div>
          <div className="relative z-10">
            <div className="text-6xl font-black text-white tracking-tight">{totalOperators}</div>
            <div className="text-sm font-semibold text-white/60 tracking-wider uppercase mt-6">Aktivní Operátoři</div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-8 min-h-[400px]">
        <div className="glass-panel p-8 col-span-2 flex flex-col">
          <h3 className="text-2xl font-bold text-white mb-8">Hodinový vývoj (TO / HU)</h3>
          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tvColorPick" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6391ff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6391ff" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="tvColorPack" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#b18cff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#b18cff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={14} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={14} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                <Area type="monotone" dataKey="pickingTOs" name="Picking (TO)" stroke="#6391ff" strokeWidth={4} fillOpacity={1} fill="url(#tvColorPick)" />
                <Area type="monotone" dataKey="packingHUs" name="Packing (HU)" stroke="#b18cff" strokeWidth={4} fillOpacity={1} fill="url(#tvColorPack)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="glass-panel p-8 flex flex-col gap-6">
          <div>
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <PackageSearch className="w-5 h-5 text-blue-400" /> Top Pickeři
            </h3>
            <div className="space-y-3">
              {topPickers.length === 0 ? (
                <p className="text-sm text-white/30">Žádná data</p>
              ) : topPickers.map(([name, tos], idx) => (
                <div key={name} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="text-base">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`}</span>
                    <span className="font-semibold text-white/90 text-base">{name}</span>
                  </div>
                  <div className="font-bold text-blue-400 text-lg">{tos} TO</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Box className="w-5 h-5 text-purple-400" /> Top Packeři
            </h3>
            <div className="space-y-3">
              {topPackers.length === 0 ? (
                <p className="text-sm text-white/30">Žádná data</p>
              ) : topPackers.map(([name, hus], idx) => (
                <div key={name} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="text-base">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`}</span>
                    <span className="font-semibold text-white/90 text-base">{name}</span>
                  </div>
                  <div className="font-bold text-purple-400 text-lg">{hus} HU</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
