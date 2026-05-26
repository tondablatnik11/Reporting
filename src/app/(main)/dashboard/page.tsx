"use client";

import { useMemo, useState } from "react";
import { PackageSearch, Box, Users, BarChart3, ArrowUpRight, ArrowDownRight, Download, Loader2 } from "lucide-react";
import { ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useData } from "@/lib/data-context";
import { usePeriodData, aggregateToChartData, type Period } from "@/lib/use-period-data";
import PeriodSelector from "@/components/ui/PeriodSelector";
import EmployeePerformance from "@/components/analytics/EmployeePerformance";

export default function DashboardPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState<string>(todayStr);

  const { pickingData: localPicking, packingData: localPacking } = useData();
  const { pickingData, packingData, previousPickingData, previousPackingData, loading } = usePeriodData(period, localPicking, localPacking, dateValue);

  const chartData = useMemo(() => aggregateToChartData(pickingData, packingData, period, dateValue), [pickingData, packingData, period, dateValue]);
  
  let totalPicking = 0;
  let totalPacking = 0;
  const globalPickingTOs = new Set();
  const globalPackingHUs = new Set();

  pickingData.forEach(p => {
    totalPicking += p.quantity;
    globalPickingTOs.add(`${p.to_number}-${p.to_item || Math.random()}`);
  });
  packingData.forEach(p => {
    if (p.created_at) {
      totalPacking += (p.quantity || 0);
      if (p.hu_number) globalPackingHUs.add(p.internal_hu);
    }
  });

  const totalPickingTOs = globalPickingTOs.size;
  const totalPackingHUs = globalPackingHUs.size;

  // Previous period calculations
  let prevTotalPicking = 0;
  let prevTotalPacking = 0;
  const prevGlobalPickingTOs = new Set();
  const prevGlobalPackingHUs = new Set();

  previousPickingData.forEach(p => {
    prevTotalPicking += p.quantity;
    prevGlobalPickingTOs.add(`${p.to_number}-${p.to_item || Math.random()}`);
  });
  previousPackingData.forEach(p => {
    if (p.created_at) {
      prevTotalPacking += (p.quantity || 0);
      if (p.hu_number) prevGlobalPackingHUs.add(p.internal_hu);
    }
  });

  const prevTotalPickingTOs = prevGlobalPickingTOs.size;
  const prevTotalPackingHUs = prevGlobalPackingHUs.size;

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return { percent: 0, isPositive: true, text: "Beze změny" };
    if (previous === 0) return { percent: 100, isPositive: true, text: "+100%" };
    const diff = current - previous;
    const percent = Math.round((diff / previous) * 100);
    return {
      percent: Math.abs(percent),
      isPositive: diff >= 0,
      text: `${diff >= 0 ? '+' : '-'}${Math.abs(percent)}%`
    };
  };

  const trendText = period === "day" ? "oproti včerejšku" : period === "week" ? "oproti minulému týdnu" : period === "month" ? "oproti minulému měsíci" : "";

  const pickTrend = calculateTrend(totalPickingTOs, prevTotalPickingTOs);
  const packTrend = calculateTrend(totalPackingHUs, prevTotalPackingHUs);
  const avgKsPerTO = totalPickingTOs > 0 ? Math.round(totalPicking / totalPickingTOs) : 0;
  const avgTrend = calculateTrend(avgKsPerTO, prevTotalPickingTOs > 0 ? Math.round(prevTotalPicking / prevTotalPickingTOs) : 0);

  const [isExporting, setIsExporting] = useState(false);

  const exportPDF = async () => {
    setIsExporting(true);
    try {
      const { toJpeg } = await import('html-to-image');
      const { jsPDF } = await import('jspdf');
      
      const element = document.getElementById('report-container');
      if (!element) return;
      
      const dataUrl = await toJpeg(element, { 
        quality: 1.0, 
        backgroundColor: '#030507',
        pixelRatio: 2,
        style: {
          background: '#030507'
        }
      });
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (element.offsetHeight * pdfWidth) / element.offsetWidth;
      
      pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Hellmann_Report_${dateValue || todayStr}.pdf`);
    } catch (error) {
      console.error("PDF Export failed", error);
      alert("Došlo k chybě při generování PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const { uniquePickerCount, uniquePackerCount, topPickers, topPackers } = useMemo(() => {
    const pickerSet = new Set<string>();
    const packerSet = new Set<string>();
    const pickerTOs = new Map<string, number>();
    const packerHUs = new Map<string, number>();

    pickingData.forEach(r => {
      if (r.operator && r.quantity > 0) {
        pickerSet.add(r.operator);
        pickerTOs.set(r.operator, (pickerTOs.get(r.operator) || 0) + 1);
      }
    });

    packingData.forEach(r => {
      if (r.operator && r.hu_number) {
        packerSet.add(r.operator);
        packerHUs.set(r.operator, (packerHUs.get(r.operator) || 0) + 1);
      }
    });

    const sortedPickers = Array.from(pickerTOs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedPackers = Array.from(packerHUs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      uniquePickerCount: pickerSet.size,
      uniquePackerCount: packerSet.size,
      topPickers: sortedPickers,
      topPackers: sortedPackers,
    };
  }, [pickingData, packingData]);

  const totalOperators = new Set([
    ...pickingData.filter(r => r.operator).map(r => r.operator),
    ...packingData.filter(r => r.operator).map(r => r.operator!)
  ]).size;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Celkový Přehled Výkonu</h1>
          <p className="text-white/40 text-sm mt-1">Souhrn operací na skladu pro zvolené období</p>
        </div>
        <div className="flex items-center gap-4">
          {period !== "all" && (
            <button 
              onClick={exportPDF} 
              disabled={isExporting || loading}
              className="glass-button-primary text-sm flex items-center gap-2"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? "Generuji PDF..." : "Exportovat PDF"}
            </button>
          )}
          <PeriodSelector 
            period={period} 
            onChangePeriod={setPeriod} 
            dateValue={dateValue}
            onChangeDate={setDateValue}
            loading={loading}
          />
        </div>
      </div>

      <div id="report-container" className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <PackageSearch className="w-20 h-20 text-blue-400" />
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="text-3xl font-black text-white tracking-tight">{totalPickingTOs.toLocaleString()}</div>
              <div className="text-sm font-bold text-blue-400 mt-1">{totalPicking.toLocaleString()} Ks</div>
              <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Vypickované TO</div>
            </div>
            {period !== "all" && (
              <div className="mt-4 flex items-center gap-1.5">
                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${pickTrend.isPositive ? 'trend-up' : 'trend-down'}`}>
                  {pickTrend.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {pickTrend.text}
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider">{trendText}</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Box className="w-20 h-20 text-purple-400" />
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="text-3xl font-black text-white tracking-tight">{totalPackingHUs.toLocaleString()}</div>
              <div className="text-sm font-bold text-purple-400 mt-1">{totalPacking.toLocaleString()} Ks</div>
              <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Zabalené HU</div>
            </div>
            {period !== "all" && (
              <div className="mt-4 flex items-center gap-1.5">
                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${packTrend.isPositive ? 'trend-up' : 'trend-down'}`}>
                  {packTrend.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {packTrend.text}
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider">{trendText}</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <BarChart3 className="w-20 h-20 text-emerald-400" />
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="text-3xl font-black text-white tracking-tight">{avgKsPerTO}</div>
              <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Průměr Ks / TO</div>
            </div>
            {period !== "all" && (
              <div className="mt-4 flex items-center gap-1.5">
                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${avgTrend.isPositive ? 'trend-up' : 'trend-down'}`}>
                  {avgTrend.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {avgTrend.text}
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider">{trendText}</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Users className="w-20 h-20 text-amber-400" />
          </div>
          <div className="relative z-10">
            <div className="text-3xl font-black text-white tracking-tight">{totalOperators}</div>
            <div className="text-sm text-white/40 mt-1">{uniquePickerCount} pickerů · {uniquePackerCount} packerů</div>
            <div className="text-xs font-semibold text-white/50 tracking-wider uppercase mt-3">Aktivní Operátoři</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-6 col-span-2 flex flex-col">
          <h3 className="text-lg font-bold text-white mb-5">Vývoj produktivity</h3>
          <div className="flex-1 w-full min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashColorPick" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6391ff" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#6391ff" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="dashColorPack" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#b18cff" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#b18cff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} label={{ value: "TO / HU", angle: -90, position: "insideLeft", style: { fill: "rgba(255,255,255,0.3)", fontSize: 10 } }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10,14,30,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '13px' }} itemStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                <Area yAxisId="left" type="monotone" dataKey="pickingTOs" name="Picking (TO)" stroke="#6391ff" strokeWidth={2.5} fillOpacity={1} fill="url(#dashColorPick)" />
                <Area yAxisId="left" type="monotone" dataKey="packingHUs" name="Packing (HU)" stroke="#b18cff" strokeWidth={2.5} fillOpacity={1} fill="url(#dashColorPack)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-5">
          <div className="glass-panel p-5">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-4 flex items-center gap-2">
              <PackageSearch className="w-3.5 h-3.5 text-blue-400" /> Top Pickeři (TO)
            </h4>
            <div className="space-y-2.5">
              {topPickers.length === 0 ? (
                <p className="text-sm text-white/30 text-center py-2">Žádná data</p>
              ) : topPickers.map(([name, tos], idx) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm shrink-0">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`}</span>
                    <span className="text-sm font-medium text-white/80 truncate">{name}</span>
                  </div>
                  <span className="text-sm font-bold text-blue-400 shrink-0">{tos}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-5">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Box className="w-3.5 h-3.5 text-purple-400" /> Top Packeři (HU)
            </h4>
            <div className="space-y-2.5">
              {topPackers.length === 0 ? (
                <p className="text-sm text-white/30 text-center py-2">Žádná data</p>
              ) : topPackers.map(([name, hus], idx) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm shrink-0">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`}</span>
                    <span className="text-sm font-medium text-white/80 truncate">{name}</span>
                  </div>
                  <span className="text-sm font-bold text-purple-400 shrink-0">{hus}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      </div>

      <EmployeePerformance 
        filterType="all" 
        pickingData={pickingData} 
        packingData={packingData} 
        loading={loading} 
      />
    </div>
  );
}
