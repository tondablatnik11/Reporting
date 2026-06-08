/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from "react";
import { ComposedChart, Area, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { PickingRecord, PackingRecord, getShiftLabel, hourlySlots, getSlot } from "@/lib/data-context";
import { Period } from "@/lib/use-period-data";

interface PdfReportTemplateProps {
  pickingData: PickingRecord[];
  packingData: PackingRecord[];
  chartData: any[];
  period: Period;
  dateValue: string;
}

const OPERATOR_COLORS = [
  "#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6",
  "#ec4899","#14b8a6","#f97316","#06b6d4","#a855f7",
];

export default function PdfReportTemplate({ pickingData, packingData, chartData, period, dateValue }: PdfReportTemplateProps) {
  // 1. KPIs
  let totalPicking = 0;
  let totalPacking = 0;
  const globalPickingTOs = new Set();
  const globalPackingHUs = new Set();

  pickingData.forEach(p => {
    totalPicking += p.quantity;
    globalPickingTOs.add(`${p.to_number}-${p.to_item || '0'}`);
  });
  packingData.forEach(p => {
    if (p.created_at) {
      totalPacking += (p.quantity || 0);
      if (p.hu_number) globalPackingHUs.add(p.internal_hu);
    }
  });

  const totalPickingTOs = globalPickingTOs.size;
  const totalPackingHUs = globalPackingHUs.size;
  const avgKsPerTO = totalPickingTOs > 0 ? Math.round(totalPicking / totalPickingTOs) : 0;

  // 2. Shift Comparison
  const shiftStats = useMemo(() => {
    const stats = {
      A: { pickKs: 0, pickTOs: new Set<string>(), packKs: 0, packHUs: new Set<string>() },
      B: { pickKs: 0, pickTOs: new Set<string>(), packKs: 0, packHUs: new Set<string>() }
    };
    pickingData.forEach(r => {
      if (!r.confirmed_at) return;
      const shift = getShiftLabel(r.confirmed_at);
      stats[shift].pickKs += r.quantity;
      stats[shift].pickTOs.add(`${r.to_number}-${r.to_item || '0'}`);
    });
    packingData.forEach(r => {
      if (!r.created_at) return;
      const shift = getShiftLabel(r.created_at);
      stats[shift].packKs += (r.quantity || 0);
      if (r.hu_number) stats[shift].packHUs.add(r.internal_hu);
    });
    return stats;
  }, [pickingData, packingData]);

  // 3. Picking Operator Chart Data
  const { pickOpChartData, pickOperators } = useMemo(() => {
    const timeKeys = period === "day" ? hourlySlots.map(s => s.start) : [...new Set(chartData.map(d => d.time))];
    const map = new Map<string, any>();
    timeKeys.forEach(t => map.set(t, { time: t }));
    const opTOs = new Map<string, Map<string, Set<string>>>();
    pickingData.forEach(p => {
      if (!p.confirmed_at || !p.operator) return;
      let timeKey = "";
      if (period === "day") {
        const slotObj = hourlySlots.find(s => `${s.start} - ${s.end}` === getSlot(p.confirmed_at));
        timeKey = slotObj ? slotObj.start : "";
      } else timeKey = period === "week" ? ['Po','Út','St','Čt','Pá','So','Ne'][(new Date(p.confirmed_at).getDay() || 7) - 1] : String(new Date(p.confirmed_at).getDate());
      if (!timeKey || !map.has(timeKey)) return;
      if (!opTOs.has(timeKey)) opTOs.set(timeKey, new Map());
      const slotMap = opTOs.get(timeKey)!;
      if (!slotMap.has(p.operator)) slotMap.set(p.operator, new Set());
      slotMap.get(p.operator)!.add(`${p.to_number}-${p.to_item || '0'}`);
    });
    const ops = new Set<string>();
    opTOs.forEach((slotMap, timeKey) => {
      const entry = map.get(timeKey);
      if (!entry) return;
      slotMap.forEach((toSet, op) => { ops.add(op); entry[op] = toSet.size; });
    });
    return { pickOpChartData: Array.from(map.values()), pickOperators: Array.from(ops) };
  }, [pickingData, period, chartData]);

  // 4. Packing Operator Chart Data
  const { packOpChartData, packOperators } = useMemo(() => {
    const timeKeys = period === "day" ? hourlySlots.map(s => s.start) : [...new Set(chartData.map(d => d.time))];
    const map = new Map<string, any>();
    timeKeys.forEach(t => map.set(t, { time: t }));
    const opHUs = new Map<string, Map<string, Set<string>>>();
    packingData.forEach(p => {
      if (!p.created_at || !p.operator) return;
      let timeKey = "";
      if (period === "day") {
        const slotObj = hourlySlots.find(s => `${s.start} - ${s.end}` === getSlot(p.created_at));
        timeKey = slotObj ? slotObj.start : "";
      } else timeKey = period === "week" ? ['Po','Út','St','Čt','Pá','So','Ne'][(new Date(p.created_at).getDay() || 7) - 1] : String(new Date(p.created_at).getDate());
      if (!timeKey || !map.has(timeKey)) return;
      if (!opHUs.has(timeKey)) opHUs.set(timeKey, new Map());
      const slotMap = opHUs.get(timeKey)!;
      if (!slotMap.has(p.operator)) slotMap.set(p.operator, new Set());
      if (p.hu_number) slotMap.get(p.operator)!.add(p.internal_hu);
    });
    const ops = new Set<string>();
    opHUs.forEach((slotMap, timeKey) => {
      const entry = map.get(timeKey);
      if (!entry) return;
      slotMap.forEach((huSet, op) => { ops.add(op); entry[op] = huSet.size; });
    });
    return { packOpChartData: Array.from(map.values()), packOperators: Array.from(ops) };
  }, [packingData, period, chartData]);

  return (
    <div id="pdf-export-template" className="bg-[#030507] p-8 w-[1200px]" style={{ fontFamily: 'sans-serif' }}>
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-wide">Hellmann Report</h1>
          <p className="text-white/50 text-sm mt-1">Datum: {dateValue || new Date().toLocaleDateString()} | Období: {period}</p>
        </div>
        <div className="text-right">
          <p className="text-blue-400 font-bold text-xl">{totalPickingTOs.toLocaleString()} TO / {totalPackingHUs.toLocaleString()} HU</p>
        </div>
      </div>

      <div className="space-y-10">
        {/* 1. KPIs */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">1. Souhrnné KPIs</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5">
              <div className="text-2xl font-black text-white">{totalPickingTOs.toLocaleString()}</div>
              <div className="text-sm font-bold text-blue-400">{totalPicking.toLocaleString()} Ks</div>
              <div className="text-xs text-white/50 mt-1 uppercase">Vypickované TO</div>
            </div>
            <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5">
              <div className="text-2xl font-black text-white">{totalPackingHUs.toLocaleString()}</div>
              <div className="text-sm font-bold text-purple-400">{totalPacking.toLocaleString()} Ks</div>
              <div className="text-xs text-white/50 mt-1 uppercase">Zabalené HU</div>
            </div>
            <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5">
              <div className="text-2xl font-black text-white">{avgKsPerTO}</div>
              <div className="text-xs text-white/50 mt-1 uppercase">Průměr Ks / TO</div>
            </div>
            <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5">
              <div className="text-2xl font-black text-white">{new Set([...pickOperators, ...packOperators]).size}</div>
              <div className="text-xs text-white/50 mt-1 uppercase">Aktivní Operátoři</div>
            </div>
          </div>
        </section>

        {/* 2. Porovnání směn */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">2. Porovnání směn (A vs B)</h2>
          <div className="grid grid-cols-2 gap-4">
            {['A', 'B'].map((shift) => (
              <div key={shift} className="bg-[#0c1028] p-5 rounded-xl border border-white/5">
                <div className="text-xl font-bold text-white mb-3">Směna {shift}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-lg font-bold text-blue-400">{shiftStats[shift as 'A'|'B'].pickTOs.size} TO</div>
                    <div className="text-xs text-white/40">{shiftStats[shift as 'A'|'B'].pickKs} Kusů Pick</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-purple-400">{shiftStats[shift as 'A'|'B'].packHUs.size} HU</div>
                    <div className="text-xs text-white/40">{shiftStats[shift as 'A'|'B'].packKs} Kusů Pack</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Rozložení výkonu v čase */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">3. Rozložení výkonu v čase (Productivity)</h2>
          <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={10} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0e1225', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Legend />
                <Area type="monotone" dataKey="picking" name="Picking (TO)" fill="rgba(96,165,250,0.1)" stroke="#60a5fa" strokeWidth={2} />
                <Area type="monotone" dataKey="packing" name="Packing (HU)" fill="rgba(192,132,252,0.1)" stroke="#c084fc" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 4. Picking – TO a Kusy v čase */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">4. Picking – TO a Kusy v čase</h2>
          <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={10} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0e1225', border: '1px solid rgba(255,255,255,0.1)' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="picking" name="Vypickované TO" fill="#3b82f6" radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="pickingKs" name="Kusy" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 5. Produktivita Operátorů – TO */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">5. Produktivita Operátorů – TO</h2>
          <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pickOpChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={10} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0e1225', border: '1px solid rgba(255,255,255,0.1)' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                {pickOperators.map((op, i) => (
                  <Bar key={op} dataKey={op} stackId="a" fill={OPERATOR_COLORS[i % OPERATOR_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 6. Packing – HU a Kusy v čase */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">6. Packing – HU a Kusy v čase</h2>
          <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={10} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0e1225', border: '1px solid rgba(255,255,255,0.1)' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="packing" name="Zabalené HU" fill="#a855f7" radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="packingKs" name="Kusy" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 7. Produktivita Operátorů – HU */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">7. Produktivita Operátorů – HU</h2>
          <div className="bg-[#0c1028] p-5 rounded-xl border border-white/5 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={packOpChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={10} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0e1225', border: '1px solid rgba(255,255,255,0.1)' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                {packOperators.map((op, i) => (
                  <Bar key={op} dataKey={op} stackId="a" fill={OPERATOR_COLORS[(i + 5) % OPERATOR_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

      </div>
    </div>
  );
}
