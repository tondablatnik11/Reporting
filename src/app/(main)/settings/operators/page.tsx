"use client";

import { useState, useMemo } from "react";
import { Users2, Plus, Trash2, Save, PackageSearch, Box } from "lucide-react";
import { useData, getShiftLabel } from "@/lib/data-context";

interface Operator {
  id: string;
  name: string;
  team: "A" | "B";
  role: "picker" | "packer" | "both";
  active: boolean;
}

export default function OperatorsPage() {
  const { pickingData, packingData } = useData();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [saved, setSaved] = useState(false);

  // Auto-detect operators from imported data
  const detectedOperators = useMemo(() => {
    const pickerMap = new Map<string, { tos: number; ks: number; shiftA: number; shiftB: number }>();
    const packerMap = new Map<string, { hus: number; ks: number; shiftA: number; shiftB: number }>();

    pickingData.forEach(r => {
      if (!r.operator || r.quantity <= 0) return;
      const e = pickerMap.get(r.operator) || { tos: 0, ks: 0, shiftA: 0, shiftB: 0 };
      e.tos += 1;
      e.ks += r.quantity;
      if (r.confirmed_at) {
        const shift = getShiftLabel(new Date(r.confirmed_at));
        if (shift === "A") e.shiftA += 1; else e.shiftB += 1;
      }
      pickerMap.set(r.operator, e);
    });

    packingData.forEach(r => {
      if (!r.operator || !r.hu_number) return;
      const e = packerMap.get(r.operator) || { hus: 0, ks: 0, shiftA: 0, shiftB: 0 };
      e.hus += 1;
      e.ks += r.quantity || 0;
      if (r.created_at) {
        const shift = getShiftLabel(new Date(r.created_at));
        if (shift === "A") e.shiftA += 1; else e.shiftB += 1;
      }
      packerMap.set(r.operator, e);
    });

    const allNames = new Set([...pickerMap.keys(), ...packerMap.keys()]);
    return Array.from(allNames).map(name => {
      const p = pickerMap.get(name) || { tos: 0, ks: 0, shiftA: 0, shiftB: 0 };
      const pack = packerMap.get(name) || { hus: 0, ks: 0, shiftA: 0, shiftB: 0 };
      const totalA = p.shiftA + pack.shiftA;
      const totalB = p.shiftB + pack.shiftB;
      const dominantShift = totalA > totalB ? "A" : totalB > totalA ? "B" : "Neznámo";

      return {
        name,
        picking: p,
        packing: pack,
        dominantShift,
        role: (pickerMap.has(name) && packerMap.has(name)) ? 'both' : pickerMap.has(name) ? 'picker' : 'packer' as 'picker' | 'packer' | 'both',
      };
    }).sort((a, b) => (b.picking.tos + b.packing.hus) - (a.picking.tos + a.packing.hus));
  }, [pickingData, packingData]);

  const addOperator = () => {
    setOperators(prev => [...prev, {
      id: String(Date.now()),
      name: '',
      team: 'A',
      role: 'both',
      active: true,
    }]);
  };

  const updateOperator = (id: string, field: keyof Operator, value: any) => {
    setOperators(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
    setSaved(false);
  };

  const removeOperator = (id: string) => {
    setOperators(prev => prev.filter(o => o.id !== id));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem('hellmann_operators', JSON.stringify(operators));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <Users2 className="w-6 h-6" /> Správa Operátorů
          </h1>
          <p className="text-white/40 text-sm mt-1">Přiřazení operátorů ke směnám a rolím</p>
        </div>
        <div className="flex gap-3">
          <button onClick={addOperator} className="glass-button text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Přidat operátora
          </button>
          <button onClick={handleSave} className={`glass-button-primary text-sm flex items-center gap-2 ${saved ? '!bg-emerald-500/20 !text-emerald-400 !border-emerald-500/30' : ''}`}>
            <Save className="w-4 h-4" /> {saved ? 'Uloženo ✓' : 'Uložit'}
          </button>
        </div>
      </div>

      {/* Detected from data */}
      {detectedOperators.length > 0 && (
        <div className="glass-panel overflow-hidden">
          <div className="p-5 border-b border-white/5 bg-white/[0.02]">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">
              Detekovaní operátoři z importovaných dat ({detectedOperators.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Jméno</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-center">Role</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-center">Převládající směna</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                    <span className="flex items-center gap-1 justify-end"><PackageSearch className="w-3 h-3" /> TO</span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                    <span className="flex items-center gap-1 justify-end"><PackageSearch className="w-3 h-3" /> Ks</span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                    <span className="flex items-center gap-1 justify-end"><Box className="w-3 h-3" /> HU</span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider text-right">
                    <span className="flex items-center gap-1 justify-end"><Box className="w-3 h-3" /> Ks</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {detectedOperators.map((op, i) => (
                  <tr key={op.name} className={`hover:bg-white/[0.03] transition-colors ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="px-5 py-3 text-sm font-semibold text-white/90">{op.name}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        op.role === 'picker' ? 'bg-blue-500/15 text-blue-400' :
                        op.role === 'packer' ? 'bg-purple-500/15 text-purple-400' :
                        'bg-white/10 text-white/60'
                      }`}>
                        {op.role === 'picker' ? 'Picker' : op.role === 'packer' ? 'Packer' : 'Obojí'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {op.dominantShift !== "Neznámo" ? (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          op.dominantShift === 'A' ? 'bg-amber-500/15 text-amber-400' : 'bg-indigo-500/15 text-indigo-400'
                        }`}>
                          Směna {op.dominantShift}
                        </span>
                      ) : (
                        <span className="text-xs text-white/30">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm font-bold text-blue-400 text-right">{op.picking.tos}</td>
                    <td className="px-5 py-3 text-sm text-blue-400/70 text-right">{op.picking.ks.toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm font-bold text-purple-400 text-right">{op.packing.hus}</td>
                    <td className="px-5 py-3 text-sm text-purple-400/70 text-right">{op.packing.ks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual operator management */}
      {operators.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-5">Manuálně přidaní operátoři</h3>
          <div className="space-y-3">
            {operators.map((op) => (
              <div key={op.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <input
                  type="text"
                  placeholder="Jméno operátora"
                  value={op.name}
                  onChange={(e) => updateOperator(op.id, 'name', e.target.value)}
                  className="glass-input flex-1"
                />
                <select value={op.team} onChange={(e) => updateOperator(op.id, 'team', e.target.value)} className="glass-input w-32">
                  <option value="A">Směna A</option>
                  <option value="B">Směna B</option>
                </select>
                <select value={op.role} onChange={(e) => updateOperator(op.id, 'role', e.target.value)} className="glass-input w-32">
                  <option value="picker">Picker</option>
                  <option value="packer">Packer</option>
                  <option value="both">Obojí</option>
                </select>
                <button onClick={() => removeOperator(op.id)} className="text-white/20 hover:text-red-400 transition-colors p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {detectedOperators.length === 0 && operators.length === 0 && (
        <div className="glass-panel p-12 text-center">
          <Users2 className="w-16 h-16 text-white/10 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white/50 mb-2">Žádní operátoři</h3>
          <p className="text-sm text-white/30 max-w-md mx-auto">
            Importujte data ze SAPu (LTAP, VEKP, VEPO) pro automatickou detekci operátorů, nebo je přidejte manuálně.
          </p>
        </div>
      )}
    </div>
  );
}
