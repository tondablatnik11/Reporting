"use client";

import { useState } from "react";
import { UploadCloud, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { useData } from "@/lib/data-context";
import EmployeePerformance from "@/components/analytics/EmployeePerformance";

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const { addPickingData, addPackingData, clearData } = useData();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.csv'));
    setFiles(prev => [...prev, ...droppedFiles]);
  };

  const parseExcelDateTime = (excelDate: any, excelTime: any) => {
    if (!excelDate) return new Date();

    let year = new Date().getFullYear();
    let month = new Date().getMonth();
    let day = new Date().getDate();

    if (typeof excelDate === 'number') {
      const utcDate = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
      year = utcDate.getUTCFullYear();
      month = utcDate.getUTCMonth();
      day = utcDate.getUTCDate();
    } else if (typeof excelDate === 'string' && excelDate.includes('.')) {
      const parts = excelDate.split('.');
      if (parts.length >= 3) {
        year = parseInt(parts[2].substring(0,4), 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[0], 10);
      }
    }

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (excelTime !== undefined && excelTime !== null) {
      if (typeof excelTime === 'number') {
        const totalSeconds = Math.round(excelTime * 86400);
        hours = Math.floor(totalSeconds / 3600);
        minutes = Math.floor((totalSeconds % 3600) / 60);
        seconds = totalSeconds % 60;
      } else if (typeof excelTime === 'string') {
        const parts = excelTime.split(':');
        if (parts.length >= 2) {
          hours = parseInt(parts[0], 10);
          minutes = parseInt(parts[1], 10);
          seconds = parts[2] ? parseInt(parts[2], 10) : 0;
        }
      }
    }

    return new Date(year, month, day, hours, minutes, seconds);
  };

  const processFile = async (file: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json: any[] = XLSX.utils.sheet_to_json(sheet);

          let importType = "UNKNOWN";
          let parsedData: any[] = [];

          const filename = file.name.toUpperCase();
          if (filename.includes("LTAP")) {
            importType = "PICKING";
            parsedData = json.map(row => ({
              to_number: String(row['Transfer Order Number']),
              operator: String(row['User_1'] || row['User']),
              quantity: Number(row['Dest.target quantity']) || 0,
              confirmed_at: parseExcelDateTime(row['Confirmation date_1'] || row['Confirmation date'], row['Confirmation time_1'] || row['Confirmation time']),
            })).filter(r => r.to_number && r.to_number !== "undefined");

            addPickingData(parsedData);

          } else if (filename.includes("VEKP")) {
            importType = "PACKING_HEADERS";
            parsedData = json.map(row => {
              const dt = parseExcelDateTime(row['Created On'], row['Time']);
              // Přičtení 2 hodin pro VEKP
              dt.setHours(dt.getHours() + 2);
              return {
                internal_hu: String(row['Internal HU number']),
                hu_number: String(row['Handling Unit']),
                operator: String(row['Created By']),
                quantity: 0,
                created_at: dt,
              };
            }).filter(r => r.internal_hu && r.internal_hu !== "undefined");

            addPackingData(parsedData);

          } else if (filename.includes("VEPO")) {
            importType = "PACKING_ITEMS";
            parsedData = json.map(row => ({
              internal_hu: String(row['Internal HU number']),
              material: String(row['Material']),
              quantity: Number(row['Packed quantity']) || 0,
            })).filter(r => r.internal_hu && r.internal_hu !== "undefined");

            addPackingData(parsedData);
          } else {
            return resolve({ name: file.name, status: "error", message: "Neznámý typ reportu. Název musí obsahovat LTAP, VEKP nebo VEPO." });
          }

          resolve({ name: file.name, status: "success", message: `Zpracováno ${parsedData.length} řádků (${importType})` });
        } catch (err: any) {
          resolve({ name: file.name, status: "error", message: err.message || "Chyba při parsování" });
        }
      };
      reader.onerror = () => resolve({ name: file.name, status: "error", message: "Chyba při čtení souboru" });
      reader.readAsArrayBuffer(file);
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
        <button
          onClick={clearData}
          className="flex items-center gap-2 text-red-400 bg-red-400/10 hover:bg-red-400/20 px-4 py-2 rounded-lg transition-colors text-sm font-bold"
        >
          <Trash2 className="w-4 h-4" /> Vymazat lokální data
        </button>
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
              Podporované soubory: LTAP (Picking), VEKP (Packing hlavičky), VEPO (Packing položky) ve formátu .xlsx nebo .csv
            </p>
          </div>

          {files.length > 0 && (
            <div className="glass-panel p-4">
              <h4 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4">Vybrané soubory ({files.length})</h4>
              <div className="space-y-2 mb-4">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Zpracovávám import...
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
                  <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-start gap-4">
                    {res.status === "success" ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="font-medium text-white text-sm">{res.name}</h4>
                      <p className="text-xs text-white/50 mt-1">{res.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <EmployeePerformance timeRange="daily" />
        </div>
      </div>
    </div>
  );
}