"use client";

export type Tab = "TERMINAL" | "SEZNAM" | "REPORTY";

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export default function Header({ activeTab, setActiveTab }: HeaderProps) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "TERMINAL", label: "Nový zápis", icon: "✍️" },
    { id: "SEZNAM", label: "Seznam", icon: "🖥️" },
    { id: "REPORTY", label: "Reporty", icon: "📊" },
  ];

  return (
    <header className="relative z-40 bg-[#040509]/60 backdrop-blur-3xl border-b border-white/[0.08] px-4 sm:px-8 py-4 sm:py-6 sticky top-0 shadow-sm">
      <div className="max-w-[1500px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="h-8 sm:h-10 flex items-center justify-center shrink-0">
            <img src="/image_45bc26.png" alt="Continental Logo" className="h-full w-auto object-contain drop-shadow-md" />
          </div>
          <h1 className="text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 tracking-tight">
            Skladové Diference
          </h1>
        </div>

        <div className="flex bg-black/40 rounded-2xl p-1 sm:p-1.5 border border-white/10 backdrop-blur-md">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-white/10 text-white shadow-md"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>{tab.icon}</span>{" "}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
