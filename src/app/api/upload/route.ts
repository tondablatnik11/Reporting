import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60; // Max execution time for Vercel Hobby/Pro (Next.js config)
export const dynamic = 'force-dynamic';

function parseExcelDateTime(excelDate: any, excelTime: any) {
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
}

async function hashFileBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const saveToDbStr = formData.get('saveToDb') as string | null;
    const saveToDb = saveToDbStr === 'true';

    if (!file) {
      return NextResponse.json({ status: "error", message: "Nebyl poskytnut žádný soubor" }, { status: 400 });
    }

    const filename = file.name.toUpperCase();
    const buffer = await file.arrayBuffer();
    
    // Čtení XLSX (na serveru)
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json: any[] = XLSX.utils.sheet_to_json(sheet);

    if (json.length === 0) {
      return NextResponse.json({ status: "error", message: "Soubor je prázdný" }, { status: 400 });
    }

    let importType = "UNKNOWN";
    let dbRows = 0;
    let batchId: string | null = null;
    const isLikp = filename.includes("LIKP");
    
    // QA Kontroly dat
    let missingOperatorCount = 0;
    let missingDeliveryCount = 0;
    let reportDate: string | null = null;

    if (saveToDb && !isLikp) {
      try {
        const fileHash = await hashFileBuffer(buffer);
        const sourceType = filename.includes("LTAP") ? "LTAP" : filename.includes("VEKP") ? "VEKP" : "VEPO";
        const { data: batch, error: batchError } = await supabase.from('import_batches').insert([{
          source_type: sourceType,
          file_name: file.name,
          file_hash: fileHash,
          status: 'processing',
          report_date: new Date().toISOString().split('T')[0],
        }]).select().single();
        
        if (batchError) {
          if (batchError.code === '23505') {
            return NextResponse.json({ 
              status: "warning", 
              message: "Tento soubor byl již dříve importován (duplicitní hash)." 
            });
          }
          throw batchError;
        }
        if (batch) {
          batchId = batch.id;
        }
      } catch (err: any) {
        console.error("Batch creation error:", err);
      }
    }

    let parsedData: any[] = [];

    if (filename.includes("LTAP")) {
      importType = "PICKING";
      
      const rowsToInsert = [];
      
      for (const row of json) {
        const confirmedAt = parseExcelDateTime(
          row['Confirmation date_1'] || row['Confirmation date'],
          row['Confirmation time_1'] || row['Confirmation time']
        );
        
        // Zjištění data reportu z prvního řádku
        if (!reportDate) {
          reportDate = confirmedAt.toISOString().split('T')[0];
        }

        const operator = String(row['User_1'] || row['User'] || '');
        const deliveryRaw = String(row['Delivery'] || row['Requirement Tracking Number'] || '');
        const delivery = deliveryRaw.replace(/^0+/, '');
        const tanum = String(row['Transfer Order Number'] || '');
        
        if (!operator) missingOperatorCount++;
        if (!delivery) missingDeliveryCount++;

        if (tanum && tanum !== 'undefined') {
          // Pro UI (parsedData)
          parsedData.push({
            to_number: tanum,
            to_item: String(row['Transfer order item'] || row['Transfer Order Item'] || row['TO Item'] || '1'),
            operator: operator,
            quantity: Number(row['Dest.target quantity']) || 0,
            weight: Number(row['Weight']) || 0,
            confirmed_at: confirmedAt,
            queue: String(row['Queue'] || row['Source Storage Type'] || ''),
            delivery: delivery,
            material: String(row['Material'] || ''),
            source_storage_bin: String(row['Source Storage Bin'] || ''),
          });

          // Pro DB
          if (saveToDb && batchId) {
            rowsToInsert.push({
              batch_id: batchId,
              tanum: tanum,
              tapos: String(row['Transfer order item'] || row['Transfer Order Item'] || row['TO Item'] || '1'),
              material: String(row['Material'] || ''),
              picker_sap_id: operator,
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
              delivery: delivery || null,
            });
          }
        }
      }

      if (saveToDb && rowsToInsert.length > 0) {
        for (let i = 0; i < rowsToInsert.length; i += 500) {
          const batch = rowsToInsert.slice(i, i + 500);
          const { error } = await supabase.from('ltap_picking').upsert(batch, { onConflict: 'tanum,tapos', ignoreDuplicates: true });
          if (error) console.error('LTAP insert error:', error.message);
        }
        dbRows = rowsToInsert.length;
      }

    } else if (filename.includes("VEKP")) {
      importType = "PACKING_HEADERS";
      
      const rowsToInsert = [];

      for (const row of json) {
        const dt = parseExcelDateTime(row['Created On'], row['Time']);
        dt.setHours(dt.getHours() + 2); // VEKP +2h
        
        if (!reportDate) {
          reportDate = dt.toISOString().split('T')[0];
        }

        const internal_hu = String(row['Internal HU number'] || '');
        const operator = String(row['Created By'] || '');
        const deliveryRaw = String(row['Delivery'] || '');
        const delivery = deliveryRaw.replace(/^0+/, '');

        if (!operator) missingOperatorCount++;
        if (!delivery) missingDeliveryCount++;

        if (internal_hu && internal_hu !== 'undefined') {
          parsedData.push({
            internal_hu: internal_hu,
            hu_number: String(row['Handling Unit'] || ''),
            packaging_material: String(row['Packaging Material'] || ''),
            delivery: delivery,
            operator: operator,
            quantity: 0,
            weight: Number(row['Allowed Weight']) || Number(row['Total Weight']) || 0,
            created_at: dt,
          });

          if (saveToDb && batchId) {
            rowsToInsert.push({
              batch_id: batchId,
              internal_hu_number: internal_hu,
              handling_unit: row['Handling Unit'] ? String(row['Handling Unit']) : null,
              created_by: operator || null,
              packer_sap_id: operator,
              created_at: dt.toISOString(),
              packed_at: dt.toISOString(),
              total_weight: Number(row['Allowed Weight']) || Number(row['Total Weight']) || null,
              weight_unit: row['Unit of Weight'] ? String(row['Unit of Weight']) : null,
              delivery: delivery || null,
              packaging_material: row['Packaging Material'] ? String(row['Packaging Material']) : null,
            });
          }
        }
      }

      if (saveToDb && rowsToInsert.length > 0) {
        for (let i = 0; i < rowsToInsert.length; i += 500) {
          const batch = rowsToInsert.slice(i, i + 500);
          const { error } = await supabase.from('vekp_packing_headers').upsert(batch, { onConflict: 'internal_hu_number', ignoreDuplicates: true });
          if (error) console.error('VEKP insert error:', error.message);
        }
        dbRows = rowsToInsert.length;
      }

    } else if (filename.includes("VEPO")) {
      importType = "PACKING_ITEMS";
      
      const rowsToInsert = [];

      for (const row of json) {
        const internal_hu = String(row['Internal HU number'] || '');
        const deliveryRaw = String(row['Delivery'] || '');
        const delivery = deliveryRaw.replace(/^0+/, '');
        
        if (!delivery) missingDeliveryCount++;

        if (internal_hu && internal_hu !== 'undefined') {
          parsedData.push({
            internal_hu: internal_hu,
            material: String(row['Material']),
            quantity: Number(row['Packed quantity']) || 0,
          });

          if (saveToDb && batchId) {
            rowsToInsert.push({
              batch_id: batchId,
              internal_hu_number: internal_hu,
              material: row['Material'] ? String(row['Material']) : null,
              packed_quantity: Number(row['Packed quantity']) || 0,
              delivery: delivery || null,
              unit_of_measure: row['Unit of Measure'] ? String(row['Unit of Measure']) : null,
              batch: row['Batch'] ? String(row['Batch']) : null,
            });
          }
        }
      }

      if (saveToDb && rowsToInsert.length > 0) {
        for (let i = 0; i < rowsToInsert.length; i += 500) {
          const batch = rowsToInsert.slice(i, i + 500);
          const { error } = await supabase.from('vepo_packing_items').insert(batch);
          if (error) console.error('VEPO insert error:', error.message);
        }
        dbRows = rowsToInsert.length;
      }

    } else if (isLikp) {
      importType = "DELIVERIES";
      
      const rowsToInsert = [];

      for (const row of json) {
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

        const carrierKey = keys.find(k => {
          const kl = k.toLowerCase().trim();
          return kl.includes('special proc') || 
                 kl.includes('indicator') || 
                 kl.includes('dopravce');
        });

        const deliveryRaw = String((delKey ? row[delKey] : row['Delivery']) || '');
        const delivery = deliveryRaw.replace(/^0+/, '');
        if (delivery && delivery !== "undefined") {
          const shipping_point = String((shipKey ? row[shipKey] : row['Shipping Point']) || '');
          const carrier = String((carrierKey ? row[carrierKey] : row['Special proc. indicator']) || '');
          
          parsedData.push({ delivery, shipping_point, carrier });

          if (saveToDb) {
            rowsToInsert.push({ delivery, shipping_point, carrier });
          }
        }
      }

      if (saveToDb && rowsToInsert.length > 0) {
        for (let i = 0; i < rowsToInsert.length; i += 500) {
          const batch = rowsToInsert.slice(i, i + 500);
          const { error } = await supabase.from('likp_deliveries').upsert(batch, { onConflict: 'delivery', ignoreDuplicates: false });
          if (error) console.error('LIKP insert error:', error.message);
        }
        dbRows = rowsToInsert.length;
      }
    } else {
      return NextResponse.json({ 
        status: "error", 
        message: "Neznámý typ reportu. Název musí obsahovat LTAP, VEKP, VEPO nebo LIKP." 
      }, { status: 400 });
    }

    if (saveToDb && batchId) {
      await supabase.from('import_batches').update({
        status: 'completed',
        total_rows: json.length,
        accepted_rows: dbRows,
        report_date: reportDate || new Date().toISOString().split('T')[0],
      }).eq('id', batchId);
    }

    return NextResponse.json({
      status: "success",
      message: `Zpracováno ${json.length} řádků (${importType}).`,
      data: parsedData,
      qa: {
        reportDate,
        missingOperatorCount,
        missingDeliveryCount,
        totalParsed: parsedData.length,
        dbRowsSaved: dbRows
      },
      importType
    });

  } catch (error: any) {
    console.error("Upload API Error:", error);
    return NextResponse.json({ status: "error", message: error.message || "Interní chyba serveru" }, { status: 500 });
  }
}
