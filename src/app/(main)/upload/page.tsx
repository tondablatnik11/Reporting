/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { UploadCloud, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Trash2, Database, Info } from "lucide-react";
import { useData } from "@/lib/data-context";
import EmployeePerformance from "@/components/analytics/EmployeePerformance";

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [saveToDb, setSaveToDb] = useState(true);

  const { addPickingData, addPackingData, addLikpData, clearData } = useData();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.csv'));
    setFiles(prev => [...prev, ...droppedFiles]);
  };

  const processFile = async (file: File) => {
    return new Promise(async (resolve) => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("saveToDb", saveToDb.toString());

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          return resolve({ name: file.name, status: result.status || "error", message: result.message || "Chyba na serveru" });
        }

        // Reakce na úspěšný import - aktualizace lokálního stavu pro dashboardy
        if (result.importType === "PICKING" && result.data) {
          addPickingData(result.data);
        } else if (result.importType === "PACKING_HEADERS" || result.importType === "PACKING_ITEMS") {
          addPackingData(result.data || []);
        } else if (result.importType === "DELIVERIES" && result.data) {
          addLikpData(result.data);
        }

        resolve({ 
          name: file.name, 
          status: result.status || "success", 
          message: result.message,
          qa: result.qa
        });
      } catch (err: any) {
        resolve({ name: file.name, status: "error", message: err.message || "Síťová chyba při odesílání souboru" });
      }
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setIsUploading(true);

    const newResults = [];
    for (const file of files) {
      const res = await processFile(file);
      newResults.push(res);
    }

    setResults(newResults);
    setIsUploading(false);
    setFiles([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-wide">Import Dat ze SAPu</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSaveToDb(!saveToDb)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-bold ${
              saveToDb
                ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/20'
                : 'text-white/40 bg-white/5 hover:bg-white/10 border border-white/10'
            }`}
          >
            <Database className="w-4 h-4" /> {saveToDb ? 'Ukládání do DB: ON' : 'Ukládání do DB: OFF'}
          </button>
          <button
            onClick={clearData}
            className="flex items-center gap-2 text-red-400 bg-red-400/10 hover:bg-red-400/20 px-4 py-2 rounded-lg transition-colors text-sm font-bold"
          >
            <Trash2 className="w-4 h-4" /> Vymazat lokální data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div
            className="glass-panel p-8 flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-white/10 hover:border-blue-500/50 transition-colors cursor-pointer group"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-upload")?.click()}
          >
            <input
              id="file-upload"
              type="file"
              multiple
              accept=".xlsx,.csv"
              className="hidden"
              onChange={e => {
                if (e.target.files) {
                  setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                }
              }}
            />
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
              <UploadCloud className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Přetáhněte reporty sem</h3>
            <p className="text-sm text-white/40 text-center max-w-sm">
              Podporované soubory: LTAP (Picking), VEKP (Packing hlavičky), VEPO (Packing položky), LIKP (Dodávky) ve formátu .xlsx nebo .csv
            </p>
            {saveToDb && (
              <p className="text-xs text-emerald-400/60 mt-3 flex items-center gap-1">
                <Database className="w-3 h-3" /> Data se pošlou k automatickému zpracování na server
              </p>
            )}
          </div>

          {files.length > 0 && (
            <div className="glass-panel p-4">
              <h4 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4">Vybrané soubory ({files.length})</h4>
              <div className="space-y-2 mb-4">
                {files.map((file, i) => (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5" key={i}>
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                      <div>
                        <p className="text-sm font-medium text-white/80">{file.name}</p>
                        <p className="text-xs text-white/40">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                      className="text-white/40 hover:text-red-400 p-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="glass-button-primary w-full justify-center"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Zpracovávám import (čekám na server)...
                  </>
                ) : (
                  "Spustit Import"
                )}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6">
            <h3 className="text-lg font-bold text-white mb-4">Výsledky posledního importu</h3>
            {results.length === 0 ? (
              <div className="text-sm text-white/40 text-center py-8">
                Zatím neproběhl žádný import.
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((res, i) => (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-start gap-4" key={i}>
                    {res.status === "success" ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : res.status === "warning" ? (
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <h4 className="font-medium text-white text-sm">{res.name}</h4>
                      <p className="text-xs text-white/50 mt-1">{res.message}</p>
                      
                      {res.qa && (
                        <div className="mt-3 p-3 bg-white/5 rounded-lg border border-white/10 text-xs">
                          <h5 className="font-bold text-white/70 mb-2 flex items-center gap-1">
                            <Info className="w-3 h-3" /> Datový Audit (QA)
                          </h5>
                          <ul className="space-y-1 text-white/60">
                            {res.qa.reportDate && <li>Datum reportu (z dat): <span className="text-white/90">{res.qa.reportDate}</span></li>}
                            {res.qa.totalParsed !== undefined && <li>Načteno unikátních řádků: <span className="text-white/90">{res.qa.totalParsed}</span></li>}
                            {res.qa.dbRowsSaved !== undefined && <li>Uloženo do DB: <span className="text-emerald-400/90">{res.qa.dbRowsSaved}</span></li>}
                            {res.qa.missingOperatorCount > 0 && <li className="text-amber-400">Chybí operátor u: {res.qa.missingOperatorCount} záznamů</li>}
                            {res.qa.missingDeliveryCount > 0 && <li className="text-amber-400">Chybí číslo zakázky u: {res.qa.missingDeliveryCount} záznamů</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <EmployeePerformance />
        </div>
      </div>
    </div>
  );
}
