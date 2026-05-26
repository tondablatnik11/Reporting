"use client";

import { useMemo, useState } from "react";
import { PackageSearch, Users, Filter } from "lucide-react";
import {
  ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useData, hourlySlots, getSlot } from "@/lib/data-context";
import { usePeriodData, aggregateToChartData, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";
import EmployeePerformance from "@/components/analytics/EmployeePerformance";

const OPERATOR_COLORS = [
  "#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6",
  "#ec4899","#14b8a6","#f97316","#06b6d4","#a855f7",
  "#10b981","#e11d48","#0ea5e9","#d946ef","#84cc16",
];

export default function PickingPage() {
  const [period, setPeriod] = useState<Period>("day");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedOperators, setSelectedOperators] = useState<Set<string>>(new Set());

  const { pickingData: localPicking, packingData: localPacking } = useData();
  const { pickingData, packingData, loading } = usePeriodData(period, localPicking, localPacking, selectedDate);

  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period, selectedDate), [pickingData, packingData, period, selectedDate]);

  const totalKs = pickingData.reduce((s, r) => s + r.quantity, 0);
  const totalTOs = new Set(pickingData.map(r => `${r.to_number}-${r.to_item || Math.random()}`)).size;
  const uniqueOperators = new Set(pickingData.filter(r => r.operator && r.quantity > 0).map(r => r.operator)).size;

  // Operator grouped chart data (TO per operator per time slot)
  const { operatorChartData, operators } = useMemo(() => {
    const timeKeys: string[] = period === "day"
      ? hourlySlots.map(s => s.start)
      : [...new Set(chartData.map(d => d.time))];

    const map = new Map<string, any>();
    timeKeys.forEach(t => map.set(t, { time: t }));

    const opTOs = new Map<string, Map<string, Set<string>>>();
    pickingData.forEach(p => {
      if (!p.confirmed_at || !p.operator) return;
      let timeKey: string;
      if (period === "day") {
        const slot = getSlot(p.confirmed_at);
        const slotObj = hourlySlots.find(s => `${s.start} - ${s.end}` === slot);
        timeKey = slotObj ? slotObj.start : "";
      } else if (period === "week") {
        const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
        timeKey = ['Ne','Po','Út','St','Čt','Pá','So'][new Date(p.confirmed_at).getDay()];
      } else if (period === "month") {
        timeKey = String(new Date(p.confirmed_at).getDate());
      } else {
        timeKey = new Date(p.confirmed_at).toISOString().substring(5, 7);
      }
      if (!timeKey || !map.has(timeKey)) return;
      if (!opTOs.has(timeKey)) opTOs.set(timeKey, new Map());
      const slotMap = opTOs.get(timeKey)!;
      if (!slotMap.has(p.operator)) slotMap.set(p.operator, new Set());
      slotMap.get(p.operator)!.add(`${p.to_number}-${p.to_item || Math.random()}`);
    });

    const ops = new Set<string>();
    opTOs.forEach((slotMap, timeKey) => {
      const entry = map.get(timeKey);
      if (!entry) return;
      slotMap.forEach((toSet, op) => {
        ops.add(op);
        entry[op] = toSet.size;
      });
    });

    return { operatorChartData: Array.from(map.values()), operators: Array.from(ops) };
  }, [pickingData, period, chartData]);

  const recentPicking = useMemo(() =>
    [...pickingData].sort((a, b) => new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime()).slice(0, 8),
    [pickingData]
  );

  const toggleOp = (op: string) => setSelectedOperators(prev => {
    const next = new Set(prev);
    next.has(op) ? next.delete(op) : next.add(op);
    return next;
  });
  const visibleOps = selectedOperators.size > 0 ? operators.filter(o => selectedOperators.has(o)) : operators;

  const xKey = period === "day" ? "time" : "time";

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Detailní Přehled – Picking</h1>
          <p className="text-white/40 text-sm mt-1">Sledování výkonnosti vychystávání materiálu ze skladu</p>
        </div>
        <PeriodSelector 
            value={period} 
            onChange={(p) => { setPeriod(p); setSelectedOperators(new Set()); }} 
            loading={loading}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><PackageSearch className="w-20 h-20 text-blue-400" /></div>
          <div className="relative z-10">
            <div className="text-3xl font-black text-white">{totalTOs.toLocaleString()}</div>
            <div className="text-sm font-bold text-blue-400 mt-1">{totalKs.toLocaleString()} Ks</div>
            <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Vypickované TO</div>
          </div>
        </div>
        <div className="glass-panel p-6">
          <div className="text-3xl font-black text-white">{totalTOs > 0 ? Math.round(totalKs / totalTOs) : 0}</div>
          <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Průměr Ks / TO</div>
        </div>
        <div className="glass-panel p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Users className="w-20 h-20 text-amber-400" /></div>
          <div className="relative z-10">
            <div className="text-3xl font-black text-white">{uniqueOperators}</div>
            <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Aktivní Pickeři</div>
          </div>
        </div>
      </div>

      {/* Graf 1: TO + Ks */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-5">Picking – TO a Kusy v čase</h3>
        <div className="h-[300px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-white/30">Načítám data...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey={xKey} stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} label={{ value: "Ks", angle: -90, position: "insideLeft", style: { fill: "rgba(255,255,255,0.3)", fontSize: 10 } }} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} label={{ value: "TO", angle: 90, position: "insideRight", style: { fill: "rgba(255,255,255,0.3)", fontSize: 10 } }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '13px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                <Bar yAxisId="left" dataKey="picking" name="Kusy (Ks)" fill="#6391ff" fillOpacity={0.7} radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="pickingTOs" name="Transfer Ordery (TO)" stroke="#60d4ff" strokeWidth={3} dot={{ r: 4, fill: "#60d4ff", strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Graf 2: Skupinový – TO per operátor */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold text-white">Produktivita Operátorů – TO za hodinu</h3>
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
        timeRange="daily" 
        filterType="picking" 
        pickingData={pickingData} 
        packingData={packingData} 
        loading={loading} 
      />

      {/* Recent Activity */}
      <div className="glass-panel overflow-hidden">
        <div className="p-5 border-b border-white/5 bg-white/[0.02]">
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Poslední Picking aktivity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">TO</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Operátor</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Ks</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">Čas</th>
              </tr>
            </thead>
            <tbody>
              {recentPicking.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-white/30">Žádná data pro zvolené období.</td></tr>
              ) : recentPicking.map((row, i) => (
                <tr key={i} className={`hover:bg-white/[0.03] transition-colors ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-5 py-3 text-sm font-medium text-white/80">{row.to_number}</td>
                  <td className="px-5 py-3 text-sm text-white/60">{row.operator}</td>
                  <td className="px-5 py-3 text-sm font-bold text-blue-400 text-right">{row.quantity}</td>
                  <td className="px-5 py-3 text-sm text-white/40 text-right">{new Date(row.confirmed_at).toLocaleString('cs-CZ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
