"use client";

export default function Topbar() {
  return (
    <header className="h-14 bg-[#060810]/80 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Labor Management & Reporting</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
          {new Date().toLocaleDateString("cs-CZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>
    </header>
  );
}
