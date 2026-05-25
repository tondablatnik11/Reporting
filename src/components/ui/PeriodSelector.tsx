"use client";

import { Loader2 } from "lucide-react";
import type { Period } from "@/lib/use-period-data";

interface PeriodSelectorProps {
  value: Period;
  onChange: (p: Period) => void;
  loading?: boolean;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Dnes" },
  { value: "week", label: "Týden" },
  { value: "month", label: "Měsíc" },
  { value: "all", label: "Vše" },
];

export default function PeriodSelector({ value, onChange, loading }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {loading && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
      <div className="flex bg-white/5 border border-white/8 rounded-lg p-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              value === p.value
                ? "bg-white/15 text-white shadow-sm"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
