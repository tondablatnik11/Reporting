"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, Users, Box, PackageSearch, Activity, TrendingUp, AlertTriangle, CheckCircle2, Loader2, Target
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { getISOWeekNumber, getShiftConfig } from "@/lib/data-context";

type TimeRange = 'day' | '7d' | '30d' | '90d' | 'ytd' | 'all';

function mapShiftNameToAB(dateStr: string, shiftCode: string) {
  if (shiftCode === 'C' || shiftCode === 'Mimo') return 'Mimo';
  const d = new Date(dateStr);
  const isEvenWeek = getISOWeekNumber(d) % 2 === 0;
  const shiftAIsMorning = getShiftConfig().evenWeekShiftAMorning ? isEvenWeek : !isEvenWeek;
  const isMorning = shiftCode === 'A' || shiftCode === 'Ranní';
  return shiftAIsMorning ? (isMorning ? "A" : "B") : (isMorning ? "B" : "A");
}

export default function DashboardOverviewPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [dateValue, setDateValue] = useState<string>(todayStr);

  const [pickData, setPickData] = useState<any[]>([]);
  const [packData, setPackData] = useState<any[]>([]);
  const [hourlyPickData, setHourlyPickData] = useState<any[]>([]);
  const [hourlyPackData, setHourlyPackData] = useState<any[]>([]);

  useEffect(() => {
    loadData(timeRange, dateValue);
  }, [timeRange, dateValue]);

  // Pomocná funkce pro prolomení limitu 1000 záznamů v Supabase
  const fetchAllRows = async (rpcName: any, params: any) => {
    let allData: any[] = [];
    let hasMore = true;
    let page = 0;
    const pageSize = 1000;
    while (hasMore) {
      // Zde je oprava pro TypeScript (as any)
      const { data, error } = await supabase.rpc(rpcName as any, params).range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (data && data.length > 0) {
        allData = [...allData, ...data];
        page++;
        if (data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }
    return allData;
  };

  const loadData = async (range: TimeRange, targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      let end = new Date();
      let start = new Date();

      if (range === 'day') {
        start = new Date(targetDate);
        end = new Date(targetDate);
      } else if (range === '7d') { 
        start.setDate(end.getDate() - 7); 
      } else if (range === '30d') { 
        start.setDate(end.getDate() - 30); 
      } else if (range === '90d') { 
        start.setDate(end.getDate() - 90); 
      } else if (range === 'ytd') { 
        start = new Date(start.getFullYear(), 0, 1); 
      } else if (range === 'all') { 
        start = new Date(2020, 0, 1); 
      }

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      // Paralelní stažení denních dat (stránkováno přes všechny záznamy)
      const [pickRes, packRes] = await Promise.all([
        fetchAllRows('get_picking_analytics_data', { p_start_date: startStr, p_end_date: endStr }),
        fetchAllRows('get_packing_analytics_data', { p_start_date: startStr, p_end_date: endStr })
      ]);

      let hpData: any[] = [];
      let hpkData: any[] = [];

      // Pokud sledujeme pouze jeden den, stáhneme i detailní hodinová data pro graf
      if (range === 'day') {
        const [hPickRes, hPackRes] = await Promise.all([
          supabase.rpc('get_picking_hourly_detail', { p_date: targetDate }),
          supabase.rpc('get_packing_hourly_detail', { p_date: targetDate })
        ]);
        if (hPickRes.data) hpData = hPickRes.data;
        if (hPackRes.data) hpkData = hPackRes.data;
      }

      setPickData(pickRes || []);
      setPackData(packRes || []);
      setHourlyPickData(hpData);
      setHourlyPackData(hpkData);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError(err.message || "Nepodařilo se načíst data pro Přehled.");
    } finally {
      setLoading(false);
    }
  };

  const dashboardMetrics = useMemo(() => {
    let pickTOs = 0, pickKs = 0, pickOpsSet = new Set<string>();
    let packHUs = 0, packKs = 0, packOpsSet = new Set<string>();

    let shiftA = { pickTOs: 0, packHUs: 0, pickOps: new Set<string>(), packOps: new Set<string>() };
    let shiftB = { pickTOs: 0, packHUs: 0, pickOps: new Set<string>(), packOps: new Set<string>() };

    const pickersMap = new Map<string, { name: string, tos: number, ks: number }>();
    const packersMap = new Map<string, { name: string, hus: number, ks: number }>();

    const pickAverages = { shiftsSet: new Set<string>(), opShifts: 0, tos: 0, norm: 0, exp: 0, oe: 0 };
    const packAverages = { shiftsSet: new Set<string>(), opShifts: 0, hus: 0, norm: 0, exp: 0, oe: 0 };

    // Zpracování Pickingu pro tabulky a KPI
    pickData.forEach(d => {
      const tos = Number(d.pick_tos);
      const ks = Number(d.pick_qty);
      const shiftAB = mapShiftNameToAB(d.report_date, d.shift_name);
      
      pickTOs += tos;
      pickKs += ks;
      pickOpsSet.add(d.operator);

      if (!pickersMap.has(d.operator)) pickersMap.set(d.operator, { name: d.operator, tos: 0, ks: 0 });
      pickersMap.get(d.operator)!.tos += tos;
      pickersMap.get(d.operator)!.ks += ks;

      if (shiftAB === 'A') { shiftA.pickTOs += tos; shiftA.pickOps.add(d.operator); }
      if (shiftAB === 'B') { shiftB.pickTOs += tos; shiftB.pickOps.add(d.operator); }

      if (shiftAB !== 'Mimo') {
        pickAverages.shiftsSet.add(`${d.report_date}_${shiftAB}`);
        pickAverages.opShifts += 1;
        pickAverages.tos += tos;
        pickAverages.norm += Number(d.pick_normal_tos);
        pickAverages.exp += Number(d.pick_express_tos);
        pickAverages.oe += Number(d.pick_oe_tos);
      }
    });

    // Zpracování Packingu pro tabulky a KPI
    packData.forEach(d => {
      const hus = Number(d.pack_hus);
      const ks = Number(d.pack_qty);
      const shiftAB = mapShiftNameToAB(d.report_date, d.shift_name);
      
      packHUs += hus;
      packKs += ks;
      packOpsSet.add(d.operator);

      if (!packersMap.has(d.operator)) packersMap.set(d.operator, { name: d.operator, hus: 0, ks: 0 });
      packersMap.get(d.operator)!.hus += hus;
      packersMap.get(d.operator)!.ks += ks;

      if (shiftAB === 'A') { shiftA.packHUs += hus; shiftA.packOps.add(d.operator); }
      if (shiftAB === 'B') { shiftB.packHUs += hus; shiftB.packOps.add(d.operator); }

      if (shiftAB !== 'Mimo') {
        packAverages.shiftsSet.add(`${d.report_date}_${shiftAB}`);
        packAverages.opShifts += 1;
        packAverages.hus += hus;
        packAverages.norm += Number(d.pack_normal_hus);
        packAverages.exp += Number(d.pack_express_hus);
        packAverages.oe += Number(d.pack_oe_hus);
      }
    });

    // GENERATOR DAT PRO GRAF (Zohledňuje, zda je vybrán 1 den = hodiny, nebo více = dny)
    const chartMap = new Map<string, any>();

    if (timeRange === 'day') {
      // Hodinový režim
      hourlyPickData.forEach(d => {
        const h = d.hour_slot;
        if (!chartMap.has(h)) chartMap.set(h, { date: h, sortDate: h, Pick_TO: 0, Pack_HU: 0, pOpsSet: new Set(), paOpsSet: new Set() });
        const cRow = chartMap.get(h)!;
        cRow.Pick_TO += Number(d.pick_tos);
        cRow.pOpsSet.add(d.operator);
      });
      hourlyPackData.forEach(d => {
        const h = d.hour_slot;
        if (!chartMap.has(h)) chartMap.set(h, { date: h, sortDate: h, Pick_TO: 0, Pack_HU: 0, pOpsSet: new Set(), paOpsSet: new Set() });
        const cRow = chartMap.get(h)!;
        cRow.Pack_HU += Number(d.pack_hus);
        cRow.paOpsSet.add(d.operator);
      });
    } else {
      // Denní režim
      pickData.forEach(d => {
        const dKey = new Date(d.report_date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
        if (!chartMap.has(dKey)) chartMap.set(dKey, { date: dKey, sortDate: d.report_date, Pick_TO: 0, Pack_HU: 0, pOpsSet: new Set(), paOpsSet: new Set() });
        chartMap.get(dKey)!.Pick_TO += Number(d.pick_tos);
        chartMap.get(dKey)!.pOpsSet.add(d.operator);
      });
      packData.forEach(d => {
        const dKey = new Date(d.report_date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
        if (!chartMap.has(dKey)) chartMap.set(dKey, { date: dKey, sortDate: d.report_date, Pick_TO: 0, Pack_HU: 0, pOpsSet: new Set(), paOpsSet: new Set() });
        chartMap.get(dKey)!.Pack_HU += Number(d.pack_hus);
        chartMap.get(dKey)!.paOpsSet.add(d.operator);
      });
    }

    const finalChart = Array.from(chartMap.values())
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
      .map(r => ({
        date: r.date,
        Pick_TO: r.Pick_TO,
        Pack_HU: r.Pack_HU,
        Pickerů: r.pOpsSet.size,
        Packerů: r.paOpsSet.size
      }));

    // Výpočty průměrů Pick
    const pickShifts = Math.max(1, pickAverages.shiftsSet.size);
    const pickHours = pickShifts * 8; 
    const pickTotalOps = Math.max(1, pickAverages.opShifts);

    const calcPickAvgs = (total: number) => ({
      shift: Math.round(total / pickShifts),
      hour: Math.round(total / pickHours),
      operator: Math.round(total / pickTotalOps)
    });

    // Výpočty průměrů Pack
    const packShifts = Math.max(1, packAverages.shiftsSet.size);
    const packHours = packShifts * 8;
    const packTotalOps = Math.max(1, packAverages.opShifts);

    const calcPackAvgs = (total: number) => ({
      shift: Math.round(total / packShifts),
      hour: Math.round(total / packHours),
      operator: Math.round(total / packTotalOps)
    });

    return {
      totals: { pickTOs, pickKs, pickOps: pickOpsSet.size, packHUs, packKs, packOps: packOpsSet.size },
      shifts: { 
        a: { ...shiftA, pickOps: shiftA.pickOps.size, packOps: shiftA.packOps.size }, 
        b: { ...shiftB, pickOps: shiftB.pickOps.size, packOps: shiftB.packOps.size } 
      },
      pickAverages: {
        total: calcPickAvgs(pickAverages.tos),
        norm: calcPickAvgs(pickAverages.norm),
        exp: calcPickAvgs(pickAverages.exp),
        oe: calcPickAvgs(pickAverages.oe)
      },
      packAverages: {
        total: calcPackAvgs(packAverages.hus),
        norm: calcPackAvgs(packAverages.norm),
        exp: calcPackAvgs(packAverages.exp),
        oe: calcPackAvgs(packAverages.oe)
      },
      chartData: finalChart,
      pickers: Array.from(pickersMap.values()).sort((a,b) => b.tos - a.tos),
      packers: Array.from(packersMap.values()).sort((a,b) => b.hus - a.hus)
    };
  }, [pickData, packData, hourlyPickData, hourlyPackData, timeRange]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /></div>;
  }

  if (error) {
    return (
      <div className="glass-panel p-8 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Chyba při načítání dat</h2>
        <p className="text-white/60">{error}</p>
        <button onClick={() => loadData(timeRange, dateValue)} className="glass-button-primary mt-4">Zkusit znovu</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      
      {/* HLAVIČKA A OVLÁDÁNÍ */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <LayoutDashboard className="w-7 h-7 text-indigo-400" /> Operační Přehled
          </h1>
          <p className="text-white/40 text-sm mt-1">Celkové zhodnocení výkonu skladu, kapacit a úzkých hrdel.</p>
        </div>
        
        <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10 flex-wrap gap-1">
          <input
             type="date"
             value={dateValue}
             onChange={(e) => {
               setDateValue(e.target.value);
               setTimeRange('day');
             }}
             onClick={(e) => {
               if ('showPicker' in e.target) (e.target as any).showPicker();
             }}
             className={`px-3 py-1.5 rounded-lg text-sm font-bold focus:outline-none cursor-pointer transition-all ${timeRange === 'day' ? 'bg-indigo-500 text-white shadow-lg' : 'bg-transparent text-indigo-300 hover:text-indigo-200 hover:bg-white/5'}`}
             title="Zvolte konkrétní den"
          />
          {[ 
            {id: '7d', label: '7 Dní'}, 
            {id: '30d', label: '30 Dní'}, {id: '90d', label: '90 Dní'}, 
            {id: 'ytd', label: 'Letos'}, {id: 'all', label: 'Vše'} 
          ].map(r => (
            <button key={r.id} onClick={() => setTimeRange(r.id as TimeRange)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${timeRange === r.id ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* TOP KPI KARTY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* PICKING */}
        <div className="glass-panel p-6 border-l-4 border-l-blue-500 hover:bg-white/[0.03] transition-colors relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity"><PackageSearch className="w-16 h-16 text-blue-400"/></div>
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Výkon Pickingu (TO)</p>
          <div className="text-3xl font-black text-white">{dashboardMetrics.totals.pickTOs.toLocaleString()}</div>
          <p className="text-sm font-medium text-white/40 mt-1 flex items-center gap-2">
             <Users className="w-4 h-4"/> {dashboardMetrics.totals.pickOps} zapojených pickerů
          </p>
        </div>

        {/* PACKING */}
        <div className="glass-panel p-6 border-l-4 border-l-purple-500 hover:bg-white/[0.03] transition-colors relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity"><Box className="w-16 h-16 text-purple-400"/></div>
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-1">Výkon Packingu (HU)</p>
          <div className="text-3xl font-black text-white">{dashboardMetrics.totals.packHUs.toLocaleString()}</div>
          <p className="text-sm font-medium text-white/40 mt-1 flex items-center gap-2">
             <Users className="w-4 h-4"/> {dashboardMetrics.totals.packOps} zapojených packerů
          </p>
        </div>

        {/* BOTTLENECK ANALYSIS */}
        <div className="glass-panel p-6 bg-gradient-to-br from-indigo-500/10 to-transparent">
          <p className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-2 flex items-center gap-1.5"><Activity className="w-4 h-4 text-indigo-400"/> Zdraví provozu</p>
          {dashboardMetrics.totals.pickTOs === 0 && dashboardMetrics.totals.packHUs === 0 ? (
            <div className="text-white/40 text-sm">Zatím žádná aktivita.</div>
          ) : dashboardMetrics.totals.pickTOs > (dashboardMetrics.totals.packHUs * 1.5) ? (
             <div className="text-amber-400">
               <div className="text-lg font-bold flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Převis Pickingu</div>
               <p className="text-xs text-amber-400/70 mt-1">Pickeři jsou mnohem rychlejší. Může docházet k hromadění materiálu před balením.</p>
             </div>
          ) : dashboardMetrics.totals.packHUs > (dashboardMetrics.totals.pickTOs * 1.2) ? (
             <div className="text-rose-400">
               <div className="text-lg font-bold flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Nedostatek práce pro balení</div>
               <p className="text-xs text-rose-400/70 mt-1">Packeři zabalili více HU než bylo vychystáno TO. Zřejmě pálí prostoje.</p>
             </div>
          ) : (
             <div className="text-emerald-400">
               <div className="text-lg font-bold flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> Vyvážený tok</div>
               <p className="text-xs text-emerald-400/70 mt-1">Práce mezi vychystáváním a balením plynule a zdravě odtéká.</p>
             </div>
          )}
        </div>
      </div>

      {/* VÝKON SMĚN (A vs B) S OPERÁTORY */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 relative overflow-hidden group border-t-4 border-t-emerald-500/50">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 text-emerald-400"><span className="text-8xl font-black">A</span></div>
          <h3 className="text-sm font-bold text-white/50 tracking-wider uppercase mb-4 flex items-center gap-2">Tým Směny A</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-blue-400">{dashboardMetrics.shifts.a.pickTOs.toLocaleString()} <span className="text-xs text-blue-400/50">TO</span></div>
              <div className="text-xs text-white/40 mt-1 flex items-center gap-1.5"><Users className="w-3 h-3"/> {dashboardMetrics.shifts.a.pickOps} pickerů</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">{dashboardMetrics.shifts.a.packHUs.toLocaleString()} <span className="text-xs text-purple-400/50">HU</span></div>
              <div className="text-xs text-white/40 mt-1 flex items-center gap-1.5"><Users className="w-3 h-3"/> {dashboardMetrics.shifts.a.packOps} packerů</div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 relative overflow-hidden group border-t-4 border-t-amber-500/50">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 text-amber-400"><span className="text-8xl font-black">B</span></div>
          <h3 className="text-sm font-bold text-white/50 tracking-wider uppercase mb-4 flex items-center gap-2">Tým Směny B</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-blue-400">{dashboardMetrics.shifts.b.pickTOs.toLocaleString()} <span className="text-xs text-blue-400/50">TO</span></div>
              <div className="text-xs text-white/40 mt-1 flex items-center gap-1.5"><Users className="w-3 h-3"/> {dashboardMetrics.shifts.b.pickOps} pickerů</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">{dashboardMetrics.shifts.b.packHUs.toLocaleString()} <span className="text-xs text-purple-400/50">HU</span></div>
              <div className="text-xs text-white/40 mt-1 flex items-center gap-1.5"><Users className="w-3 h-3"/> {dashboardMetrics.shifts.b.packOps} packerů</div>
            </div>
          </div>
        </div>
      </div>

      {/* DETAILNÍ PRŮMĚRY (Tabulky Norem) */}
      <div className="glass-panel overflow-hidden">
         <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Detailní Průměry a Výkonnostní Normy</h3>
         </div>
         <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
            {/* PRŮMĚRY PICKING */}
            <div className="p-6">
               <h4 className="text-base font-bold text-blue-400 mb-4 flex items-center gap-2"><PackageSearch className="w-4 h-4"/> Picking (TO)</h4>
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="border-b border-white/10 text-xs font-semibold text-white/40">
                     <th className="pb-2 font-medium">Kategorie</th>
                     <th className="pb-2 text-right">Ø za Hodinu</th>
                     <th className="pb-2 text-right">Ø za Směnu</th>
                     <th className="pb-2 text-right text-blue-300">Ø na Operátora</th>
                   </tr>
                 </thead>
                 <tbody className="text-sm">
                   <tr className="border-b border-white/5 bg-blue-500/5">
                     <td className="py-2.5 font-bold text-white">Celkem</td>
                     <td className="py-2.5 text-right font-bold text-white">{dashboardMetrics.pickAverages.total.hour}</td>
                     <td className="py-2.5 text-right font-bold text-white">{dashboardMetrics.pickAverages.total.shift}</td>
                     <td className="py-2.5 text-right font-black text-blue-400">{dashboardMetrics.pickAverages.total.operator}</td>
                   </tr>
                   <tr className="border-b border-white/5">
                     <td className="py-2 text-emerald-400">Normal</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.pickAverages.norm.hour}</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.pickAverages.norm.shift}</td>
                     <td className="py-2 text-right text-emerald-400/80 font-bold">{dashboardMetrics.pickAverages.norm.operator}</td>
                   </tr>
                   <tr className="border-b border-white/5">
                     <td className="py-2 text-amber-400">Express</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.pickAverages.exp.hour}</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.pickAverages.exp.shift}</td>
                     <td className="py-2 text-right text-amber-400/80 font-bold">{dashboardMetrics.pickAverages.exp.operator}</td>
                   </tr>
                   <tr>
                     <td className="py-2 text-red-400">OE</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.pickAverages.oe.hour}</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.pickAverages.oe.shift}</td>
                     <td className="py-2 text-right text-red-400/80 font-bold">{dashboardMetrics.pickAverages.oe.operator}</td>
                   </tr>
                 </tbody>
               </table>
            </div>

            {/* PRŮMĚRY PACKING */}
            <div className="p-6">
               <h4 className="text-base font-bold text-purple-400 mb-4 flex items-center gap-2"><Box className="w-4 h-4"/> Packing (HU)</h4>
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="border-b border-white/10 text-xs font-semibold text-white/40">
                     <th className="pb-2 font-medium">Kategorie</th>
                     <th className="pb-2 text-right">Ø za Hodinu</th>
                     <th className="pb-2 text-right">Ø za Směnu</th>
                     <th className="pb-2 text-right text-purple-300">Ø na Operátora</th>
                   </tr>
                 </thead>
                 <tbody className="text-sm">
                   <tr className="border-b border-white/5 bg-purple-500/5">
                     <td className="py-2.5 font-bold text-white">Celkem</td>
                     <td className="py-2.5 text-right font-bold text-white">{dashboardMetrics.packAverages.total.hour}</td>
                     <td className="py-2.5 text-right font-bold text-white">{dashboardMetrics.packAverages.total.shift}</td>
                     <td className="py-2.5 text-right font-black text-purple-400">{dashboardMetrics.packAverages.total.operator}</td>
                   </tr>
                   <tr className="border-b border-white/5">
                     <td className="py-2 text-emerald-400">Normal</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.packAverages.norm.hour}</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.packAverages.norm.shift}</td>
                     <td className="py-2 text-right text-emerald-400/80 font-bold">{dashboardMetrics.packAverages.norm.operator}</td>
                   </tr>
                   <tr className="border-b border-white/5">
                     <td className="py-2 text-amber-400">Express</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.packAverages.exp.hour}</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.packAverages.exp.shift}</td>
                     <td className="py-2 text-right text-amber-400/80 font-bold">{dashboardMetrics.packAverages.exp.operator}</td>
                   </tr>
                   <tr>
                     <td className="py-2 text-red-400">OE</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.packAverages.oe.hour}</td>
                     <td className="py-2 text-right text-white/70">{dashboardMetrics.packAverages.oe.shift}</td>
                     <td className="py-2 text-right text-red-400/80 font-bold">{dashboardMetrics.packAverages.oe.operator}</td>
                   </tr>
                 </tbody>
               </table>
            </div>
         </div>
      </div>

      {/* VÝVOJ CELKOVÉHO OBJEMU S OPERÁTORY */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-400" /> 
          Vývoj celkového objemu a zapojení operátorů {timeRange === 'day' ? '(Hodinový rozpad)' : ''}
        </h3>
        <p className="text-xs text-white/40 mb-6">Porovnání zátěže (TO/HU - sloupce) vůči počtu pracujících lidí (čáry).</p>
        <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dashboardMetrics.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#ffffff10', borderRadius: '10px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                
                <Bar yAxisId="left" dataKey="Pick_TO" name="Objem Picking (TO)" fill="#3b82f6" radius={[4,4,0,0]} barSize={timeRange === 'day' ? 24 : 12} />
                <Bar yAxisId="left" dataKey="Pack_HU" name="Objem Packing (HU)" fill="#a855f7" radius={[4,4,0,0]} barSize={timeRange === 'day' ? 24 : 12} />
                
                <Line yAxisId="right" type="monotone" dataKey="Pickerů" name="Počet Pickerů" stroke="#93c5fd" strokeWidth={3} dot={{r:3}} />
                <Line yAxisId="right" type="monotone" dataKey="Packerů" name="Počet Packerů" stroke="#d8b4fe" strokeWidth={3} dot={{r:3}} />
              </ComposedChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* KOMPLETNÍ SEZNAMY OPERÁTORŮ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PICKERS */}
        <div className="glass-panel overflow-hidden flex flex-col max-h-[500px]">
          <div className="p-5 border-b border-white/5 bg-white/[0.02]">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2"><Users className="w-4 h-4 text-blue-400"/> Žebříček Pickerů (Kompletní)</h3>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#121625] z-10 shadow-sm">
                <tr className="text-xs font-semibold text-white/40 uppercase">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Jméno</th>
                  <th className="px-4 py-2 text-right">Odbaveno (TO)</th>
                  <th className="px-4 py-2 text-right">Kusy (Ks)</th>
                </tr>
              </thead>
              <tbody>
                {dashboardMetrics.pickers.map((p, i) => (
                  <tr key={p.name} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs text-white/30">{i+1}.</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-white/80">{p.name}</td>
                    <td className="px-4 py-2.5 text-sm font-black text-blue-400 text-right">{p.tos.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs text-white/50 text-right">{p.ks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PACKERS */}
        <div className="glass-panel overflow-hidden flex flex-col max-h-[500px]">
          <div className="p-5 border-b border-white/5 bg-white/[0.02]">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider flex items-center gap-2"><Users className="w-4 h-4 text-purple-400"/> Žebříček Packerů (Kompletní)</h3>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#121625] z-10 shadow-sm">
                <tr className="text-xs font-semibold text-white/40 uppercase">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Jméno</th>
                  <th className="px-4 py-2 text-right">Zabaleno (HU)</th>
                  <th className="px-4 py-2 text-right">Kusy (Ks)</th>
                </tr>
              </thead>
              <tbody>
                {dashboardMetrics.packers.map((p, i) => (
                  <tr key={p.name} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs text-white/30">{i+1}.</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-white/80">{p.name}</td>
                    <td className="px-4 py-2.5 text-sm font-black text-purple-400 text-right">{p.hus.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs text-white/50 text-right">{p.ks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
