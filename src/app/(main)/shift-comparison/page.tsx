'use client';

import { useMemo, useState } from "react";
import { BarChart3, PackageSearch, Box, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useData, getShiftLabel, getISOWeekNumber, hourlySlots, getSlot } from "@/lib/data-context";
import { usePeriodData, aggregateShiftStats, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";

export default function ShiftComparisonPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);
  const { pickingData: localPicking, packingData: localPacking, likpData } = useData();
  const { pickingData, packingData, loading } = usePeriodData(period, localPicking, localPacking, dateValue, false, "", likpData);

  const currentWeek = getISOWeekNumber(new Date());
  const isEvenWeek = currentWeek % 2 === 0;

  const shiftStats = useMemo(() => aggregateShiftStats(pickingData, packingData), [pickingData, packingData]);

  const hourlyShiftData = useMemo(() => {
    const map = new Map<string, { time: string; shiftATOs: number; shiftBTOs: number; shiftAHUs: number; shiftBHUs: number }>();
    hourlySlots.forEach(slot => {
      map.set(`${slot.start} - ${slot.end}`, { time: slot.start, shiftATOs: 0, shiftBTOs: 0, shiftAHUs: 0, shiftBHUs: 0 });
    });
    const sAP = new Map<string, Set<string>>();
    const sBP = new Map<string, Set<string>>();
    const sAPk = new Map<string, Set<string>>();
    const sBPk = new Map<string, Set<string>>();

    pickingData.forEach(p => {
      if (!p.confirmed_at) return;
      const slot = getSlot(p.confirmed_at);
      if (!map.has(slot)) return;
      const shift = getShiftLabel(new Date(p.confirmed_at));
      const t = shift === "A" ? sAP : sBP;
      if (!t.has(slot)) t.set(slot, new Set());
      t.get(slot)!.add(`${p.to_number}-${p.to_item || Math.random()}`);
    });
    packingData.forEach(p => {
      if (!p.created_at) return;
      const slot = getSlot(p.created_at);
      if (!map.has(slot)) return;
      const shift = getShiftLabel(new Date(p.created_at));
      const t = shift === "A" ? sAPk : sBPk;
      if (!t.has(slot)) t.set(slot, new Set());
      t.get(slot)!.add(p.internal_hu);
    });

    return Array.from(map.entries()).map(([key, val]) => ({
      ...val,
      shiftATOs: sAP.get(key)?.size || 0,
      shiftBTOs: sBP.get(key)?.size || 0,
      shiftAHUs: sAPk.get(key)?.size || 0,
      shiftBHUs: sBPk.get(key)?.size || 0,
    }));
  }, [pickingData, packingData]);

  const totalA = shiftStats.a.pickingTOs + shiftStats.a.packingHUs;
  const totalB = shiftStats.b.pickingTOs + shiftStats.b.packingHUs;
  const winner = totalA > totalB ? 'A' : totalB > totalA ? 'B' : null;

  const barData = [
    { name: 'Směna A', pickingTOs: shiftStats.a.pickingTOs, packingHUs: shiftStats.a.packingHUs },
    { name: 'Směna B', pickingTOs: shiftStats.b.pickingTOs, packingHUs: shiftStats.b.packingHUs },
  ];

  // OPRAVA: Zde byly špatně pojmenované vlastnosti. Nyní odpovídají tomu, co vrací use-period-data.ts
  const categoryBarData = [
    { name: 'Směna A (Pick)', Normal: shiftStats.a.pickingNormal, Express: shiftStats.a.pickingExpress, OE: shiftStats.a.pickingOE },
    { name: 'Směna B (Pick)', Normal: shiftStats.b.pickingNormal, Express: shiftStats.b.pickingExpress, OE: shiftStats.b.pickingOE },
    { name: 'Směna A (Pack)', Normal: shiftStats.a.packingNormal, Express: shiftStats.a.packingExpress, OE: shiftStats.a.packingOE },
    { name: 'Směna B (Pack)', Normal: shiftStats.b.packingNormal, Express: shiftStats.b.packingExpress, OE: shiftStats.b.packingOE },
  ];

  const rows = [
    { label: 'Picking (TO)', a: shiftStats.a.pickingTOs, b: shiftStats.b.pickingTOs },
    { label: 'Packing (HU)', a: shiftStats.a.packingHUs, b: shiftStats.b.packingHUs },
    { label: 'Picking (Ks) - Celkem', a: shiftStats.a.pickingKs, b: shiftStats.b.pickingKs, fmt: true },
    { label: '  ↳ z toho Normal (Ks)', a: shiftStats.a.pickingNormal, b: shiftStats.b.pickingNormal, fmt: true, sub: true },
    { label: '  ↳ z toho Express (Ks)', a: shiftStats.a.pickingExpress, b: shiftStats.b.pickingExpress, fmt: true, sub: true },
    { label: '  ↳ z toho OE (Ks)', a: shiftStats.a.pickingOE, b: shiftStats.b.pickingOE, fmt: true, sub: true },
    { label: 'Packing (Ks) - Celkem', a: shiftStats.a.packingKs, b: shiftStats.b.packingKs, fmt: true },
    { label: '  ↳ z toho Normal (Ks)', a: shiftStats.a.packingNormal, b: shiftStats.b.packingNormal, fmt: true, sub: true },
    { label: '  ↳ z toho Express (Ks)', a: shiftStats.a.packingExpress, b: shiftStats.b.packingExpress, fmt: true, sub: true },
    { label: '  ↳ z toho OE (Ks)', a: shiftStats.a.packingOE, b: shiftStats.b.packingOE, fmt: true, sub: true },
    { label: 'Váha (kg)', a: shiftStats.a.weight, b: shiftStats.b.weight, fmt: true },
    { label: 'Operátoři', a: shiftStats.a.operators, b: shiftStats.b.operators },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Porovnání Směn
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Týden {currentWeek} · Směna A = {isEvenWeek ? 'Ranní' : 'Odpolední'}, Směna B = {isEvenWeek ? 'Odpolední' : 'Ranní'}
          </p>
        </div>
        <PeriodSelector 
            period={period} 
            onChangePeriod={setPeriod} 
            loading={loading}
            dateValue={dateValue}
            onChangeDate={setDateValue}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <div><div className="text-2xl font-black text-blue-400">{shiftStats.a.pickingTOs}</div><div className="text-xs text-white/40">TO</div></div>
              <div><div className="text-2xl font-black text-purple-400">{shiftStats.a.packingHUs}</div><div className="text-xs text-white/40">HU</div></div>
              <div><div className="text-lg font-bold text-white/60">{shiftStats.a.pickingKs.toLocaleString()}</div><div className="text-xs text-white/40">Pick Ks</div></div>
              <div><div className="text-lg font-bold text-white/60">{shiftStats.a.packingKs.toLocaleString()}</div><div className="text-xs text-white/40">Pack Ks</div></div>
            </div>
            {shiftStats.a.weight > 0 && <div className="mt-2 text-sm text-white/30">Váha: {shiftStats.a.weight.toLocaleString()} kg</div>}
          </div>
        </div>

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
              <div><div className="text-2xl font-black text-blue-400">{shiftStats.b.pickingTOs}</div><div className="text-xs text-white/40">TO</div></div>
              <div><div className="text-2xl font-black text-purple-400">{shiftStats.b.packingHUs}</div><div className="text-xs text-white/40">HU</div></div>
              <div><div className="text-lg font-bold text-white/60">{shiftStats.b.pickingKs.toLocaleString()}</div><div className="text-xs text-white/40">Pick Ks</div></div>
              <div><div className="text-lg font-bold text-white/60">{shiftStats.b.packingKs.toLocaleString()}</div><div className="text-xs text-white/40">Pack Ks</div></div>
            </div>
            {shiftStats.b.weight > 0 && <div className="mt-2 text-sm text-white/30">Váha: {shiftStats.b.weight.toLocaleString()} kg</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5">Hodinový rozklad – TO po směnách</h3>
          <div className="h-[280px]">
            {loading ? <div className="h-full flex items-center justify-center text-white/30">Načítám...</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyShiftData} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                  <Bar dataKey="shiftATOs" name="Směna A (TO)" fill="#34d399" radius={[3,3,0,0]} />
                  <Bar dataKey="shiftBTOs" name="Směna B (TO)" fill="#fbbf24" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5">Struktura zakázek podle směn (Ks)</h3>
          <div className="h-[280px]">
            {loading ? <div className="h-full flex items-center justify-center text-white/30">Načítám...</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBarData} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                  <Bar dataKey="Normal" name="Normální" stackId="cat" fill="#10b981" radius={[0,0,0,0]} />
                  <Bar dataKey="Express" name="Express" stackId="cat" fill="#f59e0b" radius={[0,0,0,0]} />
                  <Bar dataKey="OE" name="OE" stackId="cat" fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="p-5 border-b border-white/5 bg-white/[0.02]">
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Detailní srovnání vč. struktury</h3>
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
                  <tr key={i} className={`hover:bg-white/[0.03] transition-colors ${row.sub ? 'bg-black/20' : (i % 2 === 1 ? 'bg-white/[0.015]' : '')}`}>
                    <td className={`px-5 py-3 text-sm ${row.sub ? 'text-white/50 pl-8' : 'font-medium text-white/80 py-3.5'}`}>{row.label}</td>
                    <td className={`px-5 py-3 text-sm text-right ${row.sub ? 'text-white/60' : 'font-bold text-white/90'}`}>{row.fmt ? row.a.toLocaleString() : row.a}</td>
                    <td className={`px-5 py-3 text-sm text-right ${row.sub ? 'text-white/60' : 'font-bold text-white/90'}`}>{row.fmt ? row.b.toLocaleString() : row.b}</td>
                    <td className={`px-5 py-3 text-sm font-bold text-right ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-white/30'}`}>
                      {diff > 0 ? '+' : ''}{row.fmt ? diff.toLocaleString() : diff}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {!row.sub && better === 'A' && <span className="inline-block w-6 h-6 rounded-full bg-emerald-400/20 text-emerald-400 text-xs font-bold leading-6">A</span>}
                      {!row.sub && better === 'B' && <span className="inline-block w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold leading-6">B</span>}
                      {!row.sub && !better && <span className="text-white/20 text-xs">=</span>}
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
