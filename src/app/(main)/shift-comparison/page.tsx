'use client';

import { useMemo, useState } from "react";
import { BarChart3, PackageSearch, Box, Users, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useAggregatedData, useData, getShiftLabel, getISOWeekNumber, hourlySlots, getSlot } from "@/lib/data-context";

export default function ShiftComparisonPage() {
  const { chartData, totalPickingTOs, totalPackingHUs } = useAggregatedData();
  const { pickingData, packingData } = useData();
  const [timePeriod, setTimePeriod] = useState<'day' | 'week' | 'month' | 'all'>('day');

  const currentWeek = getISOWeekNumber(new Date());
  const isEvenWeek = currentWeek % 2 === 0;

  // Shift A/B stats
  const shiftStats = useMemo(() => {
    const a = {
      pickingKs: 0, packingKs: 0,
      pickingTOs: new Set<string>(), packingHUs: new Set<string>(),
      weight: 0, operators: new Set<string>()
    };
    const b = {
      pickingKs: 0, packingKs: 0,
      pickingTOs: new Set<string>(), packingHUs: new Set<string>(),
      weight: 0, operators: new Set<string>()
    };

    pickingData.forEach(p => {
      if (!p.confirmed_at) return;
      const shift = getShiftLabel(new Date(p.confirmed_at));
      const target = shift === "A" ? a : b;
      target.pickingKs += p.quantity;
      target.pickingTOs.add(p.to_number);
      if (p.operator) target.operators.add(p.operator);
    });

    packingData.forEach(p => {
      if (!p.created_at) return;
      const shift = getShiftLabel(new Date(p.created_at));
      const target = shift === "A" ? a : b;
      target.packingKs += (p.quantity || 0);
      target.weight += (p.weight || 0);
      target.packingHUs.add(p.internal_hu);
      if (p.operator) target.operators.add(p.operator);
    });

    return {
      a: { pickingKs: a.pickingKs, packingKs: a.packingKs, pickingTOs: a.pickingTOs.size, packingHUs: a.packingHUs.size, weight: a.weight, operators: a.operators.size },
      b: { pickingKs: b.pickingKs, packingKs: b.packingKs, pickingTOs: b.pickingTOs.size, packingHUs: b.packingHUs.size, weight: b.weight, operators: b.operators.size },
    };
  }, [pickingData, packingData]);

  // Hourly data per shift
  const hourlyShiftData = useMemo(() => {
    const map = new Map<string, { time: string; shiftATOs: number; shiftBTOs: number; shiftAHUs: number; shiftBHUs: number }>();
    hourlySlots.forEach(slot => {
      map.set(`${slot.start} - ${slot.end}`, { time: slot.start, shiftATOs: 0, shiftBTOs: 0, shiftAHUs: 0, shiftBHUs: 0 });
    });

    const slotAPickTOs = new Map<string, Set<string>>();
    const slotBPickTOs = new Map<string, Set<string>>();
    const slotAPackHUs = new Map<string, Set<string>>();
    const slotBPackHUs = new Map<string, Set<string>>();

    pickingData.forEach(p => {
      if (!p.confirmed_at) return;
      const slot = getSlot(p.confirmed_at);
      if (!map.has(slot)) return;
      const shift = getShiftLabel(new Date(p.confirmed_at));
      const target = shift === "A" ? slotAPickTOs : slotBPickTOs;
      if (!target.has(slot)) target.set(slot, new Set());
      target.get(slot)!.add(p.to_number);
    });

    packingData.forEach(p => {
      if (!p.created_at) return;
      const slot = getSlot(p.created_at);
      if (!map.has(slot)) return;
      const shift = getShiftLabel(new Date(p.created_at));
      const target = shift === "A" ? slotAPackHUs : slotBPackHUs;
      if (!target.has(slot)) target.set(slot, new Set());
      target.get(slot)!.add(p.internal_hu);
    });

    return Array.from(map.entries()).map(([key, val]) => ({
      ...val,
      shiftATOs: slotAPickTOs.get(key)?.size || 0,
      shiftBTOs: slotBPickTOs.get(key)?.size || 0,
      shiftAHUs: slotAPackHUs.get(key)?.size || 0,
      shiftBHUs: slotBPackHUs.get(key)?.size || 0,
    }));
  }, [pickingData, packingData]);

  const totalA = shiftStats.a.pickingTOs + shiftStats.a.packingHUs;
  const totalB = shiftStats.b.pickingTOs + shiftStats.b.packingHUs;
  const winner = totalA > totalB ? 'A' : totalB > totalA ? 'B' : null;

  const barData = [
    { name: 'Směna A', pickingTOs: shiftStats.a.pickingTOs, packingHUs: shiftStats.a.packingHUs },
    { name: 'Směna B', pickingTOs: shiftStats.b.pickingTOs, packingHUs: shiftStats.b.packingHUs },
  ];

  const rows = [
    { label: 'Picking (TO)', a: shiftStats.a.pickingTOs, b: shiftStats.b.pickingTOs, icon: <PackageSearch className="w-4 h-4 text-blue-400" /> },
    { label: 'Packing (HU)', a: shiftStats.a.packingHUs, b: shiftStats.b.packingHUs, icon: <Box className="w-4 h-4 text-purple-400" /> },
    { label: 'Picking (Ks)', a: shiftStats.a.pickingKs, b: shiftStats.b.pickingKs, fmt: true },
    { label: 'Packing (Ks)', a: shiftStats.a.packingKs, b: shiftStats.b.packingKs, fmt: true },
    { label: 'Váha (kg)', a: shiftStats.a.weight, b: shiftStats.b.weight, fmt: true },
    { label: 'Operátoři', a: shiftStats.a.operators, b: shiftStats.b.operators, icon: <Users className="w-4 h-4 text-amber-400" /> },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Porovnání Směn
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Týden {currentWeek} · Směna A = {isEvenWeek ? 'Ranní' : 'Odpolední'}, Směna B = {isEvenWeek ? 'Odpolední' : 'Ranní'}
          </p>
        </div>
        <div className="flex bg-white/5 rounded-lg p-1">
          {(['day', 'week', 'month', 'all'] as const).map(period => (
            <button key={period}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${timePeriod === period ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
              onClick={() => setTimePeriod(period)}
            >
              {period === 'day' ? 'Den' : period === 'week' ? 'Týden' : period === 'month' ? 'Měsíc' : 'Celé období'}
            </button>
          ))}
        </div>
      </div>

      {/* Shift A vs B - Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Směna A */}
        <div className={`glass-panel p-6 border-l-4 relative overflow-hidden ${winner === 'A' ? 'border-l-emerald-400' : 'border-l-emerald-500/30'}`}>
          <div className="absolute top-2 right-4 opacity-[0.04]"><span className="text-9xl font-black text-emerald-400">A</span></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-4 rounded-full bg-emerald-400" />
              <h3 className="text-lg font-bold text-white">Směna A</h3>
              <span className="text-xs text-white/30 ml-1">({isEvenWeek ? 'Ranní' : 'Odpolední'})</span>
              {winner === 'A' && <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full font-bold ml-2">🏆 Lepší</span>}
              <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full ml-auto flex items-center gap-1">
                <Users className="w-3 h-3" /> {shiftStats.a.operators}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-black text-blue-400">{shiftStats.a.pickingTOs}</div>
                <div className="text-xs text-white/40">Picking TO</div>
              </div>
              <div>
                <div className="text-2xl font-black text-purple-400">{shiftStats.a.packingHUs}</div>
                <div className="text-xs text-white/40">Packing HU</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white/60">{shiftStats.a.pickingKs.toLocaleString()}</div>
                <div className="text-xs text-white/40">Pick Ks</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white/60">{shiftStats.a.packingKs.toLocaleString()}</div>
                <div className="text-xs text-white/40">Pack Ks</div>
              </div>
            </div>
            {shiftStats.a.weight > 0 && <div className="mt-3 text-sm text-white/30">Váha: {shiftStats.a.weight.toLocaleString()} kg</div>}
          </div>
        </div>

        {/* Směna B */}
        <div className={`glass-panel p-6 border-l-4 relative overflow-hidden ${winner === 'B' ? 'border-l-amber-400' : 'border-l-amber-500/30'}`}>
          <div className="absolute top-2 right-4 opacity-[0.04]"><span className="text-9xl font-black text-amber-400">B</span></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-4 rounded-full bg-amber-400" />
              <h3 className="text-lg font-bold text-white">Směna B</h3>
              <span className="text-xs text-white/30 ml-1">({isEvenWeek ? 'Odpolední' : 'Ranní'})</span>
              {winner === 'B' && <span className="text-xs bg-amber-500/15 text-amber-400 px-2.5 py-0.5 rounded-full font-bold ml-2">🏆 Lepší</span>}
              <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full ml-auto flex items-center gap-1">
                <Users className="w-3 h-3" /> {shiftStats.b.operators}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-black text-blue-400">{shiftStats.b.pickingTOs}</div>
                <div className="text-xs text-white/40">Picking TO</div>
              </div>
              <div>
                <div className="text-2xl font-black text-purple-400">{shiftStats.b.packingHUs}</div>
                <div className="text-xs text-white/40">Packing HU</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white/60">{shiftStats.b.pickingKs.toLocaleString()}</div>
                <div className="text-xs text-white/40">Pick Ks</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white/60">{shiftStats.b.packingKs.toLocaleString()}</div>
                <div className="text-xs text-white/40">Pack Ks</div>
              </div>
            </div>
            {shiftStats.b.weight > 0 && <div className="mt-3 text-sm text-white/30">Váha: {shiftStats.b.weight.toLocaleString()} kg</div>}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comparison bar chart */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5">TO + HU – Směna A vs B</h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.25)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} itemStyle={{ color: '#fff' }} />
                <Legend />
                <Bar dataKey="pickingTOs" name="TO (Picking)" fill="#6391ff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="packingHUs" name="HU (Packing)" fill="#b18cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly breakdown */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5">Hodinový rozklad – TO po směnách</h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyShiftData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px' }} itemStyle={{ color: '#fff' }} />
                <Legend />
                <Bar dataKey="shiftATOs" name="Směna A (TO)" fill="#34d399" radius={[3, 3, 0, 0]} />
                <Bar dataKey="shiftBTOs" name="Směna B (TO)" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Visual comparison bars */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" /> Vizuální srovnání
        </h3>
        <div className="space-y-5">
          {[
            { label: 'Picking (TO)', a: shiftStats.a.pickingTOs, b: shiftStats.b.pickingTOs, colorA: '#34d399', colorB: '#fbbf24' },
            { label: 'Packing (HU)', a: shiftStats.a.packingHUs, b: shiftStats.b.packingHUs, colorA: '#34d399', colorB: '#fbbf24' },
          ].map(item => {
            const max = Math.max(item.a, item.b, 1);
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white/70">{item.label}</span>
                  <span className="text-xs text-white/30">
                    {item.a === item.b ? 'Vyrovnáno' : `${item.a > item.b ? 'Směna A' : 'Směna B'} +${Math.abs(item.a - item.b)}`}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-emerald-400 w-8 text-right font-bold">{item.a}</span>
                  <div className="flex-1 flex gap-1">
                    <div className="h-6 rounded-l-full transition-all duration-700" style={{ width: `${(item.a / max) * 100}%`, background: `linear-gradient(90deg, ${item.colorA}40, ${item.colorA})` }} />
                    <div className="h-6 rounded-r-full transition-all duration-700" style={{ width: `${(item.b / max) * 100}%`, background: `linear-gradient(90deg, ${item.colorB}, ${item.colorB}40)` }} />
                  </div>
                  <span className="text-xs text-amber-400 w-8 font-bold">{item.b}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-emerald-400/50">Směna A</span>
                  <span className="text-[10px] text-amber-400/50">Směna B</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed table */}
      <div className="glass-panel overflow-hidden">
        <div className="p-5 border-b border-white/5 bg-white/[0.02]">
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Detailní srovnání všech metrik</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Metrika</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                  <span className="flex items-center gap-1.5 justify-end"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Směna A</span>
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                  <span className="flex items-center gap-1.5 justify-end"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Směna B</span>
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Rozdíl</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-center">Lepší</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const diff = row.a - row.b;
                const better = diff > 0 ? 'A' : diff < 0 ? 'B' : null;
                return (
                  <tr key={i} className={`hover:bg-white/[0.03] transition-colors ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="px-5 py-3.5 text-sm font-medium text-white/80 flex items-center gap-2">
                      {row.icon || null}{row.label}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-bold text-white/90 text-right">{row.fmt ? row.a.toLocaleString() : row.a}</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-white/90 text-right">{row.fmt ? row.b.toLocaleString() : row.b}</td>
                    <td className={`px-5 py-3.5 text-sm font-bold text-right ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-white/30'}`}>
                      {diff > 0 ? '+' : ''}{row.fmt ? diff.toLocaleString() : diff}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {better === 'A' && <span className="inline-block w-6 h-6 rounded-full bg-emerald-400/20 text-emerald-400 text-xs font-bold leading-6">A</span>}
                      {better === 'B' && <span className="inline-block w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold leading-6">B</span>}
                      {!better && <span className="text-white/20 text-xs">=</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}