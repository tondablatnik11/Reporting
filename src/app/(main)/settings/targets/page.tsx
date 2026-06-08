"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Target {
  id: string;
  name: string;
  pickingTOTarget: number;
  packingHUTarget: number;
  pickingKsTarget: number;
  packingKsTarget: number;
}

const defaultTargets: Target[] = [
  { id: '1', name: 'Ranní směna', pickingTOTarget: 200, packingHUTarget: 150, pickingKsTarget: 8000, packingKsTarget: 6000 },
  { id: '2', name: 'Odpolední směna', pickingTOTarget: 180, packingHUTarget: 130, pickingKsTarget: 7000, packingKsTarget: 5500 },
  { id: '3', name: 'Operátor (denní)', pickingTOTarget: 25, packingHUTarget: 20, pickingKsTarget: 1000, packingKsTarget: 800 },
];

export default function TargetsPage() {
  const [targets, setTargets] = useState<Target[]>(defaultTargets);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'targets').single().then(({ data }) => {
      if (data?.value) setTargets(data.value as any);
    });
  }, []);

  const updateTarget = (id: string, field: keyof Target, value: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
    setTargets(prev => prev.map(t => t.id === id ? { ...t, [field]: typeof t[field] === 'number' ? Number(value) || 0 : value } : t));
    setSaved(false);
  };

  const addTarget = () => {
    setTargets(prev => [...prev, {
      id: String(Date.now()),
      name: 'Nový cíl',
      pickingTOTarget: 0,
      packingHUTarget: 0,
      pickingKsTarget: 0,
      packingKsTarget: 0,
    }]);
    setSaved(false);
  };

  const removeTarget = (id: string) => {
    setTargets(prev => prev.filter(t => t.id !== id));
    setSaved(false);
  };

  const handleSave = async () => {
    await supabase.from('app_settings').upsert({ key: 'targets', value: targets as any });
    localStorage.setItem('hellmann_targets', JSON.stringify(targets));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <Settings className="w-6 h-6" /> Cíle a Normy
          </h1>
          <p className="text-white/40 text-sm mt-1">Nastavení výkonnostních cílů pro směny a operátory</p>
        </div>
        <div className="flex gap-3">
          <button onClick={addTarget} className="glass-button text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Přidat cíl
          </button>
          <button onClick={handleSave} className={`glass-button-primary text-sm flex items-center gap-2 ${saved ? '!bg-emerald-500/20 !text-emerald-400 !border-emerald-500/30' : ''}`}>
            <Save className="w-4 h-4" /> {saved ? 'Uloženo ✓' : 'Uložit'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {targets.map((target) => (
          <div key={target.id} className="glass-panel p-6">
            <div className="flex items-center justify-between mb-5">
              <input
                type="text"
                value={target.name}
                title="Tato stránka definuje cíle (Targets) pro jednotlivé směny. Tyto cíle se pak porovnávají s reálným výkonem v celém reportingu. Zatím jsou cíle zapsány fixně v kódu, pro úpravu je potřeba je změnit v poli &quot;TARGETS&quot; na začátku souboru."
                onChange={(e) => updateTarget(target.id, 'name', e.target.value)}
                className="text-lg font-bold text-white bg-transparent border-b border-transparent hover:border-white/20 focus:border-blue-400/50 outline-none pb-1 transition-colors"
              />
              <button onClick={() => removeTarget(target.id)} className="text-white/20 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-400/10">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Picking – TO</label>
                <input
                  type="number"
                  value={target.pickingTOTarget}
                  onChange={(e) => updateTarget(target.id, 'pickingTOTarget', e.target.value)}
                  className="glass-input text-blue-400 font-bold text-lg"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Packing – HU</label>
                <input
                  type="number"
                  value={target.packingHUTarget}
                  onChange={(e) => updateTarget(target.id, 'packingHUTarget', e.target.value)}
                  className="glass-input text-purple-400 font-bold text-lg"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Picking – Ks</label>
                <input
                  type="number"
                  value={target.pickingKsTarget}
                  onChange={(e) => updateTarget(target.id, 'pickingKsTarget', e.target.value)}
                  className="glass-input text-white/70 font-medium"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">Packing – Ks</label>
                <input
                  type="number"
                  value={target.packingKsTarget}
                  onChange={(e) => updateTarget(target.id, 'packingKsTarget', e.target.value)}
                  className="glass-input text-white/70 font-medium"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-3">Jak to funguje</h3>
        <ul className="space-y-2 text-sm text-white/40">
          <li>• <strong className="text-white/60">Směnový cíl</strong> – minimální počet TO/HU, který by měla celá směna dosáhnout</li>
          <li>• <strong className="text-white/60">Operátorský cíl</strong> – individuální denní cíl pro každého operátora</li>
          <li>• Cíle se zobrazují na Dashboardu a v TV režimu jako &quot;Plnění norem&quot;</li>
          <li>• Po připojení k Supabase se budou ukládat na server</li>
        </ul>
      </div>
    </div>
  );
}
