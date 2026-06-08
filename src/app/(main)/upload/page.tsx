/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { UploadCloud, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Trash2, Database } from "lucide-react";
import * as XLSX from "xlsx";
import { useData } from "@/lib/data-context";
import { supabase } from "@/lib/supabase";
import EmployeePerformance from "@/components/analytics/EmployeePerformance";

async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

  const parseExcelDateTime = (excelDate: any /* eslint-disable-line @typescript-eslint/no-explicit-any */, excelTime: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
    if (!excelDate) return new Date();

    let year = new Date().getFullYear();
    let month = new Date().getMonth();
    let day = new Date().getDate();

    if (typeof excelDate === 'number') {
      const utcDate = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
      year = utcDate.getUTCFullYear();
      month = utcDate.getUTCMonth();
      day = utcDate.getUTCDate();
    } else if (typeof excelDate === 'string') {
      if (excelDate.includes('/')) {
        const parts = excelDate.split('/');
        if (parts.length >= 3) {
          month = parseInt(parts[0], 10) - 1;
          day = parseInt(parts[1], 10);
          year = parseInt(parts[2].substring(0, 4), 10);
        }
      } else if (excelDate.includes('.')) {
        const parts = excelDate.split('.');
        if (parts.length >= 3) {
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
          year = parseInt(parts[2].substring(0, 4), 10);
        }
      } else if (excelDate.includes('-')) {
        const parts = excelDate.split('-');
        if (parts.length >= 3) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
          day = parseInt(parts[2], 10);
        }
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

  const saveLtapToSupabase = async (json: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[], batchId: string) => {
    const rows = json.map(row => {
      const confirmedAt = parseExcelDateTime(
        row['Confirmation date_1'] || row['Confirmation date'],
        row['Confirmation time_1'] || row['Confirmation time']
      );
      return {
        batch_id: batchId,
        tanum: String(row['Transfer Order Number'] || ''),
        tapos: String(row['Transfer order item'] || row['Transfer Order Item'] || row['TO Item'] || '1'),
        material: String(row['Material'] || ''),
        picker_sap_id: String(row['User_1'] || row['User'] || ''),
        dest_target_qty: Number(row['Dest.target quantity']) || 0,
        weight: Number(row['Weight']) || null,
        weight_unit: row['Weight Unit'] ? String(row['Weight Unit']) : null,
        confirmed_at: confirmedAt.toISOString(),
        warehouse_number: row['Warehouse Number'] ? String(row['Warehouse Number']) : null,
        source_storage_type: row['Source Storage Type'] ? String(row['Source Storage Type']) : null,
        source_storage_bin: row['Source Storage Bin'] ? String(row['Source Storage Bin']) : null,
        source_storage_section: row['Source Storage Section'] ? String(row['Source Storage Section']) : null,
        dest_storage_type: row['Dest.Storage Type'] ? String(row['Dest.Storage Type']) : null,
        dest_storage_bin: row['Dest.Storage Bin'] ? String(row['Dest.Storage Bin']) : null,
        delivery: row['Delivery'] ? String(row['Delivery']) : null,
      };
    }).filter(r => r.tanum && r.tanum !== 'undefined');

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from('ltap_picking').upsert(batch, { onConflict: 'tanum,tapos', ignoreDuplicates: true });
      if (error) console.error('LTAP insert error:', error.message);
    }
    return rows.length;
  };

  const saveVekpToSupabase = async (json: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[], batchId: string) => {
    const rows = json.map(row => {
      const createdAt = parseExcelDateTime(row['Created On'], row['Time']);
      createdAt.setHours(createdAt.getHours() + 2); // VEKP +2h
      return {
        batch_id: batchId,
        internal_hu_number: String(row['Internal HU number'] || ''),
        handling_unit: row['Handling Unit'] ? String(row['Handling Unit']) : null,
        created_by: row['Created By'] ? String(row['Created By']) : null,
        packer_sap_id: String(row['Created By'] || ''),
        created_at: createdAt.toISOString(),
        packed_at: createdAt.toISOString(),
        total_weight: Number(row['Allowed Weight']) || Number(row['Total Weight']) || null,
        weight_unit: row['Unit of Weight'] ? String(row['Unit of Weight']) : null,
        delivery: row['Delivery'] ? String(row['Delivery']) : null,
        packaging_material: row['Packaging Material'] ? String(row['Packaging Material']) : null,
      };
    }).filter(r => r.internal_hu_number && r.internal_hu_number !== 'undefined');

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from('vekp_packing_headers').upsert(batch, { onConflict: 'internal_hu_number', ignoreDuplicates: true });
      if (error) console.error('VEKP insert error:', error.message);
    }
    return rows.length;
  };

  const saveVepoToSupabase = async (json: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[], batchId: string) => {
    const rows = json.map(row => ({
      batch_id: batchId,
      internal_hu_number: String(row['Internal HU number'] || ''),
      material: row['Material'] ? String(row['Material']) : null,
      packed_quantity: Number(row['Packed quantity']) || 0,
      delivery: row['Delivery'] ? String(row['Delivery']) : null,
      unit_of_measure: row['Unit of Measure'] ? String(row['Unit of Measure']) : null,
      batch: row['Batch'] ? String(row['Batch']) : null,
    })).filter(r => r.internal_hu_number && r.internal_hu_number !== 'undefined');

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from('vepo_packing_items').insert(batch);
      if (error) console.error('VEPO insert error:', error.message);
    }
    return rows.length;
  };

  const createBatch = async (file: File, sourceType: string, fileHash: string) => {
    const { data, error } = await supabase.from('import_batches').insert([{
      source_type: sourceType,
      file_name: file.name,
      file_hash: fileHash,
      status: 'processing',
      report_date: new Date().toISOString().split('T')[0],
    }]).select().single();
    if (error) {
      if (error.code === '23505') return null; // Duplicate file
      throw error;
    }
    return data;
  };

  const processFile = async (file: File) => {
    return new Promise(async (resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[] = XLSX.utils.sheet_to_json(sheet);

          let importType = "UNKNOWN";
          let parsedData: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[] = [];
          let dbRows = 0;

          const filename = file.name.toUpperCase();

          let batchId: string | null = null;
          const isLikp = filename.includes("LIKP");
          
          if (saveToDb && !isLikp) {
            try {
              const fileHash = await hashFile(file);
              const sourceType = filename.includes("LTAP") ? "LTAP" : filename.includes("VEKP") ? "VEKP" : "VEPO";
              const batch = await createBatch(file, sourceType, fileHash);
              if (batch) {
                batchId = batch.id;
              } else {
                return resolve({ name: file.name, status: "warning", message: "Tento soubor byl již dříve importován (duplicitní hash)." });
              }
            } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
              console.error("Batch creation error:", err);
            }
          }

          if (filename.includes("LTAP")) {
            importType = "PICKING";
            parsedData = json.map(row => ({
              to_number: String(row['Transfer Order Number']),
              to_item: String(row['Transfer order item'] || row['Transfer Order Item'] || row['TO Item'] || '1'),
              operator: String(row['User_1'] || row['User']),
              quantity: Number(row['Dest.target quantity']) || 0,
              weight: Number(row['Weight']) || 0,
              confirmed_at: parseExcelDateTime(
                row['Confirmation date_1'] || row['Confirmation date'],
                row['Confirmation time_1'] || row['Confirmation time']
              ),
              queue: String(row['Queue'] || row['Source Storage Type'] || ''),
              delivery: String(row['Delivery'] || row['Requirement Tracking Number'] || ''),
              material: String(row['Material'] || ''),
              source_storage_bin: String(row['Source Storage Bin'] || ''),
            })).filter(r => r.to_number && r.to_number !== "undefined");

            addPickingData(parsedData);

            if (saveToDb && batchId) {
              dbRows = await saveLtapToSupabase(json, batchId);
            }

          } else if (filename.includes("VEKP")) {
            importType = "PACKING_HEADERS";
            parsedData = json.map(row => {
              const dt = parseExcelDateTime(row['Created On'], row['Time']);
              dt.setHours(dt.getHours() + 2); // VEKP +2h
              return {
                internal_hu: String(row['Internal HU number']),
                hu_number: String(row['Handling Unit']),
                packaging_material: String(row['Packaging Material'] || ''),
                delivery: String(row['Delivery'] || ''),
                operator: String(row['Created By'] || ''),
                quantity: 0,
                weight: Number(row['Allowed Weight']) || Number(row['Total Weight']) || 0,
                created_at: dt,
              };
            }).filter(r => r.internal_hu && r.internal_hu !== "undefined");

            addPackingData(parsedData);

            if (saveToDb && batchId) {
              dbRows = await saveVekpToSupabase(json, batchId);
            }

          } else if (filename.includes("VEPO")) {
            importType = "PACKING_ITEMS";
            parsedData = json.map(row => ({
              internal_hu: String(row['Internal HU number']),
              material: String(row['Material']),
              quantity: Number(row['Packed quantity']) || 0,
            })).filter(r => r.internal_hu && r.internal_hu !== "undefined");

            addPackingData(parsedData);

            if (saveToDb && batchId) {
              dbRows = await saveVepoToSupabase(json, batchId);
            }
          } else if (filename.includes("LIKP")) {
            importType = "DELIVERIES";
            
            parsedData = json.map(row => {
              const keys = Object.keys(row);
              
              const delKey = keys.find(k => {
                const kl = k.toLowerCase().trim();
                return kl === 'delivery' || kl === 'lieferung' || kl === 'dodávka' || kl === 'zakázka';
              });
              
              const shipKey = keys.find(k => {
                const kl = k.toLowerCase().trim();
                return kl.includes('shipping point') || 
                       kl.includes('ship.pt') || 
                       kl.includes('versandstelle') || 
                       kl.includes('místo přijetí');
              });

              // Dynamické vyhledání sloupce Dopravce (Special proc. indicator)
              const carrierKey = keys.find(k => {
                const kl = k.toLowerCase().trim();
                return kl.includes('special proc') || 
                       kl.includes('indicator') || 
                       kl.includes('dopravce');
              });

              return {
                delivery: String((delKey ? row[delKey] : row['Delivery']) || ''),
                shipping_point: String((shipKey ? row[shipKey] : row['Shipping Point']) || ''),
                carrier: String((carrierKey ? row[carrierKey] : row['Special proc. indicator']) || ''),
              };
            }).filter(r => r.delivery && r.delivery !== "undefined" && r.delivery !== "");

            addLikpData(parsedData);

            if (saveToDb) {
              const likpRows = parsedData.map(r => ({
                delivery: r.delivery,
                shipping_point: r.shipping_point,
                carrier: r.carrier, // Vložení do DB
              }));
              for (let i = 0; i < likpRows.length; i += 500) {
                const batch = likpRows.slice(i, i + 500);
                const { error } = await supabase.from('likp_deliveries').upsert(batch, { onConflict: 'delivery', ignoreDuplicates: false });
                if (error) console.error('LIKP insert error:', error.message);
              }
            }
            dbRows = parsedData.length;
          } else {
            return resolve({ name: file.name, status: "error", message: "Neznámý typ reportu. Název musí obsahovat LTAP, VEKP, VEPO nebo LIKP." });
          }

          if (saveToDb && batchId) {
            await supabase.from('import_batches').update({
              status: 'completed',
              total_rows: json.length,
              accepted_rows: dbRows,
            }).eq('id', batchId);
          }

          const dbMsg = saveToDb && (batchId || isLikp) ? ` · ${dbRows} uloženo do DB` : '';
          resolve({ name: file.name, status: "success", message: `Zpracováno ${parsedData.length} řádků (${importType})${dbMsg}` });
        } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
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
                <Database className="w-3 h-3" /> Data se automaticky uloží do Supabase
              </p>
            )}
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
                    ) : res.status === "warning" ? (
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
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
          <EmployeePerformance />
        </div>
      </div>
    </div>
  );
}
