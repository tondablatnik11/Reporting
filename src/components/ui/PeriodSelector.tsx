"use client";

import { Loader2, ArrowRightLeft } from "lucide-react";
import type { Period } from "@/lib/use-period-data";

interface PeriodSelectorProps {
  period: Period;
  onChangePeriod: (p: Period) => void;
  dateValue: string;
  onChangeDate: (d: string) => void;
  isComparing?: boolean;
  onToggleCompare?: (cmp: boolean) => void;
  compareDateValue?: string;
  onChangeCompareDate?: (d: string) => void;
  loading?: boolean;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Den" },
  { value: "week", label: "Týden" },
  { value: "month", label: "Měsíc" },
  { value: "all", label: "Vše" },
];

function getISOWeekValue(d: Date) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

export default function PeriodSelector({
  period, onChangePeriod, dateValue, onChangeDate,
  isComparing, onToggleCompare, compareDateValue, onChangeCompareDate, loading
}: PeriodSelectorProps) {
  
  const todayDate = new Date();
  const defaultDay = todayDate.toISOString().split('T')[0];
  const defaultWeek = getISOWeekValue(todayDate);
  const defaultMonth = todayDate.toISOString().substring(0, 7);

  const handlePeriodClick = (p: Period) => {
    onChangePeriod(p);
    if (p === "day" && !dateValue.includes("-") && dateValue.length !== 10) onChangeDate(defaultDay);
    if (p === "week" && !dateValue.includes("-W")) onChangeDate(defaultWeek);
    if (p === "month" && dateValue.length !== 7) onChangeDate(defaultMonth);
    if (p === "all" && onToggleCompare) onToggleCompare(false);
  };

  const inputType = period === "day" ? "date" : period === "week" ? "week" : period === "month" ? "month" : "text";

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 bg-white/5 p-1.5 rounded-xl border border-white/10">
      {loading && <Loader2 className="w-4 h-4 animate-spin text-white/40 shrink-0 mx-2" />}
      
      <div className="flex bg-black/20 rounded-lg p-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => handlePeriodClick(p.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              period === p.value
                ? "bg-white/15 text-white shadow-sm"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      
      {period !== "all" && (
        <div className="flex items-center gap-2">
          <input 
            type={inputType}
            value={dateValue}
            onChange={(e) => onChangeDate(e.target.value)}
            className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]"
          />
          
          {onToggleCompare && onChangeCompareDate && (
            <>
              <button
                onClick={() => onToggleCompare(!isComparing)}
                className={`p-1.5 rounded-lg transition-colors border ${isComparing ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/20 border-white/10 text-white/40 hover:text-white/80'}`}
                title="Porovnat s jiným obdobím"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>
              
              {isComparing && (
                <div className="flex items-center gap-2 animate-fade-in">
                  <span className="text-white/30 text-sm">vs</span>
                  <input 
                    type={inputType}
                    value={compareDateValue || ''}
                    onChange={(e) => onChangeCompareDate(e.target.value)}
                    className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-1.5 text-sm text-blue-300 focus:outline-none focus:border-blue-500 transition-all [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
