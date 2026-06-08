"use client";

import { useState, useEffect } from "react";
import { Clock, Save } from "lucide-react";
import { getISOWeekNumber, getShiftConfig } from "@/lib/data-context";
import { supabase } from "@/lib/supabase";

export default function ShiftsPage() {
  const currentWeek = getISOWeekNumber(new Date());
  const isEvenWeek = currentWeek % 2 === 0;

  const [shiftConfig, setShiftConfig] = useState({
    morningStart: "05:45",
    morningEnd: "13:45",
    afternoonStart: "13:45",
    afternoonEnd: "21:45",
    breakMinutes: 30,
    evenWeekShiftAMorning: true,
  });

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'shifts').single().then(({ data }) => {
      if (data?.value) {
        setShiftConfig(data.value as any);
        localStorage.setItem('hellmann_shifts', JSON.stringify(data.value));
      } else {
        // eslint-disable-next-line
        setShiftConfig(getShiftConfig());
      }
    });
  }, []);

  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await supabase.from('app_settings').upsert({ key: 'shifts', value: shiftConfig as any });
    localStorage.setItem('hellmann_shifts', JSON.stringify(shiftConfig));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Generate schedule for next 4 weeks
  const weekSchedule = Array.from({ length: 4 }, (_, i) => {
    const weekNum = currentWeek + i;
    const isEven = weekNum % 2 === 0;
    const shiftAIsMorning = shiftConfig.evenWeekShiftAMorning ? isEven : !isEven;
    return {
      week: weekNum,
      isCurrent: i === 0,
      shiftA: shiftAIsMorning ? 'Ranní' : 'Odpolední',
      shiftB: shiftAIsMorning ? 'Odpolední' : 'Ranní',
      shiftATime: shiftAIsMorning ? `${shiftConfig.morningStart} – ${shiftConfig.morningEnd}` : `${shiftConfig.afternoonStart} – ${shiftConfig.afternoonEnd}`,
      shiftBTime: shiftAIsMorning ? `${shiftConfig.afternoonStart} – ${shiftConfig.afternoonEnd}` : `${shiftConfig.morningStart} – ${shiftConfig.morningEnd}`,
    };
  });

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <Clock className="w-6 h-6" /> Nastavení Směn
          </h1>
          <p className="text-white/40 text-sm mt-1">Konfigurace pracovních směn A a B</p>
        </div>
        <button onClick={handleSave} className={`glass-button-primary text-sm flex items-center gap-2 ${saved ? '!bg-emerald-500/20 !text-emerald-400 !border-emerald-500/30' : ''}`}>
          <Save className="w-4 h-4" /> {saved ? 'Uloženo ✓' : 'Uložit'}
        </button>
      </div>

      {/* Shift Time Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> Ranní směna
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Začátek</label>
              <input
                type="time"
                value={shiftConfig.morningStart}
                onChange={(e) => setShiftConfig(prev => ({ ...prev, morningStart: e.target.value }))}
                className="glass-input text-lg font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Konec</label>
              <input
                type="time"
                value={shiftConfig.morningEnd}
                onChange={(e) => setShiftConfig(prev => ({ ...prev, morningEnd: e.target.value }))}
                className="glass-input text-lg font-bold"
              />
            </div>
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-400 inline-block" /> Odpolední směna
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Začátek</label>
              <input
                type="time"
                value={shiftConfig.afternoonStart}
                onChange={(e) => setShiftConfig(prev => ({ ...prev, afternoonStart: e.target.value }))}
                className="glass-input text-lg font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Konec</label>
              <input
                type="time"
                value={shiftConfig.afternoonEnd}
                onChange={(e) => setShiftConfig(prev => ({ ...prev, afternoonEnd: e.target.value }))}
                className="glass-input text-lg font-bold"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Shift Rotation Config */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-5">Rotace směn</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Přestávka (min)</label>
            <input
              type="number"
              value={shiftConfig.breakMinutes}
              onChange={(e) => setShiftConfig(prev => ({ ...prev, breakMinutes: Number(e.target.value) || 0 }))}
              className="glass-input w-32"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-3">Sudé týdny</label>
            <div className="flex gap-3">
              <button
                onClick={() => setShiftConfig(prev => ({ ...prev, evenWeekShiftAMorning: true }))}
                className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-all ${shiftConfig.evenWeekShiftAMorning ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-white/10 text-white/40'}`}
              >
                Směna A = Ranní
              </button>
              <button
                onClick={() => setShiftConfig(prev => ({ ...prev, evenWeekShiftAMorning: false }))}
                className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-all ${!shiftConfig.evenWeekShiftAMorning ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'border-white/10 text-white/40'}`}
              >
                Směna A = Odpolední
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Schedule Preview */}
      <div className="glass-panel overflow-hidden">
        <div className="p-5 border-b border-white/5 bg-white/[0.02]">
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Rozvrh směn – následující 4 týdny</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Týden</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Směna A</span>
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Čas A</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Směna B</span>
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Čas B</th>
              </tr>
            </thead>
            <tbody>
              {weekSchedule.map((week, i) => (
                <tr key={week.week} className={`hover:bg-white/[0.03] transition-colors ${week.isCurrent ? 'bg-blue-500/5 border-l-2 border-l-blue-400' : i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-5 py-3.5 text-sm font-bold text-white/80">
                    Týden {week.week}
                    {week.isCurrent && <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Aktuální</span>}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{week.shiftA}</td>
                  <td className="px-5 py-3.5 text-sm text-white/50">{week.shiftATime}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-amber-400">{week.shiftB}</td>
                  <td className="px-5 py-3.5 text-sm text-white/50">{week.shiftBTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
