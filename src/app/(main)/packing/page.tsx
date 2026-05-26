"use client";

import { useMemo, useState } from "react";
import { Box, Users, Filter } from "lucide-react";
import {
  ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useData, hourlySlots, getSlot } from "@/lib/data-context";
import { usePeriodData, aggregateToChartData, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";
import EmployeePerformance from "@/components/analytics/EmployeePerformance";

const OPERATOR_COLORS = [
  "#a855f7","#ec4899","#f59e0b","#22c55e","#3b82f6",
  "#14b8a6","#ef4444","#f97316","#06b6d4","#8b5cf6",
  "#10b981","#e11d48","#0ea5e9","#d946ef","#84cc16",
];

export default function PackingPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [compareDateValue, setCompareDateValue] = useState<string>("");
  const [selectedOperators, setSelectedOperators] = useState<Set<string>>(new Set());

  const { pickingData: localPicking, packingData: localPacking } = useData();
  const { pickingData, packingData, compPacking, loading } = usePeriodData(
    period, localPicking, localPacking, dateValue, isComparing, compareDateValue
  );

  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period, dateValue), [pickingData, packingData, period, dateValue]);

  const totalKs = packingData.reduce((s, r) => s + (r.quantity || 0), 0);
  const totalHUs = new Set(packingData.map(r => r.internal_hu)).size;
  const uniqueOperators = new Set(packingData.filter(r => r.operator && r.hu_number).map(r => r.operator!)).size;

  const compTotalKs = compPacking.reduce((s, r) => s + (r.quantity || 0), 0);
  const compTotalHUs = new Set(compPacking.map(r => r.internal_hu)).size;

  const getDiffLabel = (current: number, compare: number) => {
    if (!isComparing || compare === 0) return null;
    const diff = ((current - compare) / compare) * 100;
    const isPos = diff >= 0;
    return (
      <span className={`text-xs ml-2 font-bold px-1.5 py-0.5 rounded-full ${isPos ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
        {isPos ? '+' : ''}{diff.toFixed(1)}%
      </span>
    );
  };

  const { operatorChartData, operators } = useMemo(() => {
    const timeKeys = [...new Set(chartData.map(d => d.time))];
    const map = new Map<string, any>();
    timeKeys.forEach(t => map.set(t, { time: t }));

    const opHUs = new Map<string, Map<string, Set<string>>>();
    packingData.forEach(p => {
      if (!p.created_at || !p.operator) return;
      let timeKey: string = "";
      if (period === "day") {
        const slotObj = hourlySlots.find(s => `${s.start} - ${s.end}` === getSlot(p.created_at));
        timeKey = slotObj ? slotObj.start : "";
      } else if (period === "week") {
        let d = new Date(p.created_at).getDay(); d = d === 0 ? 7 : d;
        timeKey = ['Po','Út','St','Čt','Pá','So','Ne'][d - 1];
      } else if (period === "month") {
        timeKey = String(new Date(p.created_at).getDate());
      } else {
        timeKey = new Date(p.created_at).toISOString().substring(5, 7);
      }
      if (!timeKey || !map.has(timeKey)) return;
      if (!opHUs.has(timeKey)) opHUs.set(timeKey, new Map());
      const slotMap = opHUs.get(timeKey)!;
      if (!slotMap.has(p.operator)) slotMap.set(p.operator, new Set());
      slotMap.get(p.operator)!.add(p.internal_hu);
    });

    const ops = new Set<string>();
    opHUs.forEach((slotMap, timeKey) => {
      const entry = map.get(timeKey);
      if (!entry) return;
      slotMap.forEach((huSet, op) => {
        ops.add(op);
        entry[op] = huSet.size;
      });
    });

    return { operatorChartData: Array.from(map.values()), operators: Array.from(ops) };
  }, [packingData, period, chartData]);

  const recentPacking = useMemo(() =>
    packingData.filter(a => a.created_at)
      .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
      .slice(0, 8),
    [packingData]
  );

  const toggleOp = (op: string) => setSelectedOperators(prev => {
    const next = new Set(prev);
    next.has(op) ? next.delete(op) : next.add(op);
    return next;
  });
  const visibleOps = selectedOperators.size > 0 ? operators.filter(o => selectedOperators.has(o)) : operators;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Detailní Přehled – Packing</h1>
          <p className="text-white/40 text-sm mt-1">Sledování výkonnosti balení a kompletace</p>
        </div>
        <PeriodSelector 
          period={period} 
          onChangePeriod={(p) => { setPeriod(p); setSelectedOperators(new Set()); }} 
          dateValue={dateValue}
          onChangeDate={setDateValue}
          isComparing={isComparing}
          onToggleCompare={setIsComparing}
          compareDateValue={compareDateValue}
          onChangeCompareDate={setCompareDateValue}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Box className="w-20 h-20 text-purple-400" /></div>
          <div className="relative z-10">
            <div className="text-3xl font-black text-white flex items-center">
              {totalHUs.toLocaleString()} {getDiffLabel(totalHUs, compTotalHUs)}
            </div>
            <div className="text-sm font-bold text-purple-400 mt-1">
              {totalKs.toLocaleString()} Ks {getDiffLabel(totalKs, compTotalKs)}
            </div>
            <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Zabalené HU</div>
          </div>
        </div>
        <div className="glass-panel p-6">
          <div className="text-3xl font-black text-white flex items-center">
            {totalHUs > 0 ? Math.round(totalKs / totalHUs) : 0}
            {getDiffLabel(totalHUs > 0 ? (totalKs / totalHUs) : 0, compTotalHUs > 0 ? (compTotalKs / compTotalHUs) : 0)}
          </div>
          <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Průměr Ks / HU</div>
        </div>
        <div className="glass-panel p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Users className="w-20 h-20 text-amber-400" /></div>
          <div className="relative z-10">
            <div className="text-3xl font-black text-white">{uniqueOperators}</div>
            <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Aktivní Packeři</div>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-5">Packing – HU a Kusy v čase</h3>
        <div className="h-[300px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-white/30">Načítám data...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '13px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                <Bar yAxisId="left" dataKey="packing" name="Kusy (Ks)" fill="#b18cff" fillOpacity={0.7} radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="packingHUs" name="Handling Unity (HU)" stroke="#e4b4ff" strokeWidth={3} dot={{ r: 4, fill: "#e4b4ff", strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-bold text-white">Produktivita Operátorů – HU</h3>
          </div>
          {operators.length > 0 && (
            <button onClick={() => setSelectedOperators(new Set())} className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1">
              <Filter className="w-3 h-3" /> {selectedOperators.size > 0 ? `Filtr: ${selectedOperators.size}/${operators.length}` : "Všichni"}
            </button>
          )}
        </div>
        {operators.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {operators.map((op, i) => (
              <button key={op} onClick={() => toggleOp(op)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedOperators.size === 0 || selectedOperators.has(op) ? 'text-white bg-white/10' : 'text-white/25 bg-transparent border-white/5'}`}
                style={{ borderColor: selectedOperators.has(op) ? OPERATOR_COLORS[i % OPERATOR_COLORS.length] : undefined }}
              >
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: OPERATOR_COLORS[i % OPERATOR_COLORS.length] }} />{op}
              </button>
            ))}
          </div>
        )}
        <div className="h-[380px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-white/30">Načítám data...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={operatorChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '13px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '11px' }} />
                {visibleOps.map((op) => {
                  const idx = operators.indexOf(op);
                  return <Bar key={op} dataKey={op} name={op} fill={OPERATOR_COLORS[idx % OPERATOR_COLORS.length]} radius={[3,3,0,0]} />;
                })}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <EmployeePerformance 
        filterType="packing" 
        pickingData={pickingData} 
        packingData={packingData} 
        loading={loading} 
      />

      <div className="glass-panel overflow-hidden">
        <div className="p-5 border-b border-white/5 bg-white/[0.02]">
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Poslední Packing aktivity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">HU</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Operátor</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Materiál</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Ks</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Váha</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Čas</th>
              </tr>
            </thead>
            <tbody>
              {recentPacking.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-white/30">Žádná data pro zvolené období.</td></tr>
              ) : recentPacking.map((row, i) => (
                <tr key={i} className={`hover:bg-white/[0.03] transition-colors ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-5 py-3 text-sm font-medium text-white/80">{row.hu_number || row.internal_hu}</td>
                  <td className="px-5 py-3 text-sm text-white/60">{row.operator}</td>
                  <td className="px-5 py-3 text-sm text-white/40">{row.material}</td>
                  <td className="px-5 py-3 text-sm font-bold text-purple-400 text-right">{row.quantity}</td>
                  <td className="px-5 py-3 text-sm text-white/50 text-right">{row.weight || '-'}</td>
                  <td className="px-5 py-3 text-sm text-white/40 text-right">{row.created_at ? new Date(row.created_at).toLocaleString('cs-CZ') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
