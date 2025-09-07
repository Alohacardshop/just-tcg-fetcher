import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { headers: CORS, ...init });
}

async function logToSyncLogs(supabase: any, operationId: string, status: string, message: string, details?: any) {
  try {
    console.log(`[${operationId}] ${status}: ${message}`, details);
    await supabase.from('sync_logs').insert({
      operation_id: operationId,
      operation_type: 'tcgcsv_groups_csv_sync',
      status,
      message,
      details,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log to sync_logs:', error);
  }
}

const toBool = (v: any) =>
  typeof v === 'boolean' ? v :
  v == null ? null :
  ['true', '1', 'yes', 'y'].includes(String(v).trim().toLowerCase()) ? true :
  ['false', '0', 'no', 'n'].includes(String(v).trim().toLowerCase()) ? false : null;

const kebab = (s: string) =>
  String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

async function fetchAndParseGroups(categoryId: number, operationId: string, supabase: any) {
  const url = `https://tcgcsv.com/tcgplayer/${categoryId}/groups.csv`;
  let attempt = 0;
  const maxAttempts = 3;
  
  while (attempt < maxAttempts) {
    try {
      attempt++;
      await logToSyncLogs(supabase, operationId, 'info', `Fetching groups CSV (attempt ${attempt})`, { url, categoryId });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/csv, */*',
          'Cache-Control': 'no-cache',
          'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      const status = response.status;
      const contentType = response.headers.get('content-type') || '';
      const contentLength = response.headers.get('content-length') || '';

      console.log("TCGCSV groups CSV response", { url, status, contentType, contentLength });
      await logToSyncLogs(supabase, operationId, 'info', `HTTP response: ${status}`, { 
        url, status, contentType, contentLength 
      });

      if (!response.ok) {
        if (attempt < maxAttempts) {
          const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      
      if (!text || text.trim().length === 0) {
        if (attempt < maxAttempts) {
          const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        
        return {
          success: false,
          summary: { fetched: 0, upserted: 0, skipped: 0 },
          error: 'NON_CSV_BODY',
          hint: {
            code: 'EMPTY_BODY',
            sample: text.slice(0, 300),
            headers: { contentType, contentLength }
          }
        };
      }

      // Parse CSV
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return {
          success: false,
          summary: { fetched: 0, upserted: 0, skipped: 0 },
          error: 'NON_CSV_BODY',
          hint: {
            code: 'INSUFFICIENT_LINES',
            sample: text.slice(0, 300),
            headers: { contentType, contentLength }
          }
        };
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const rows = lines.slice(1);

      console.log("CSV headers", headers);
      await logToSyncLogs(supabase, operationId, 'info', `CSV parsed: ${rows.length} rows`, { headers });

      // Find required columns
      const groupIdIdx = headers.findIndex(h => h.includes('groupid') || h.includes('group_id'));
      const nameIdx = headers.findIndex(h => h.includes('groupname') || h.includes('name'));
      const abbreviationIdx = headers.findIndex(h => h.includes('abbreviation'));
      const releaseDateIdx = headers.findIndex(h => h.includes('releasedate') || h.includes('release_date'));
      const isSupplementalIdx = headers.findIndex(h => h.includes('issupplemental') || h.includes('is_supplemental'));
      const sealedProductIdx = headers.findIndex(h => h.includes('sealedproduct') || h.includes('sealed_product'));
      const popularityIdx = headers.findIndex(h => h.includes('popularity'));
      const slugIdx = headers.findIndex(h => h.includes('slug'));

      if (groupIdIdx === -1 || nameIdx === -1) {
        return {
          success: false,
          summary: { fetched: 0, upserted: 0, skipped: 0 },
          error: 'MISSING_REQUIRED_COLUMNS',
          hint: {
            code: 'REQUIRED_COLUMNS',
            sample: `Headers: ${headers.join(', ')}`,
            headers: { contentType, contentLength }
          }
        };
      }

      const normalized: any[] = [];
      let skipped = 0;

      for (const row of rows) {
        const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
        
        const groupId = Number(cols[groupIdIdx]);
        const name = cols[nameIdx];
        
        if (!Number.isFinite(groupId) || !name) {
          skipped++;
          continue;
        }
        
        normalized.push({
          group_id: groupId,
          category_id: categoryId,
          name: name,
          abbreviation: abbreviationIdx >= 0 ? cols[abbreviationIdx] || null : null,
          release_date: releaseDateIdx >= 0 ? cols[releaseDateIdx] || null : null,
          is_supplemental: isSupplementalIdx >= 0 ? toBool(cols[isSupplementalIdx]) : null,
          sealed_product: sealedProductIdx >= 0 ? toBool(cols[sealedProductIdx]) : null,
          popularity: popularityIdx >= 0 ? Number(cols[popularityIdx]) || null : null,
          url_slug: slugIdx >= 0 ? cols[slugIdx] || kebab(name) : kebab(name),
          updated_at: new Date().toISOString()
        });
      }

      await logToSyncLogs(supabase, operationId, 'info', `Normalized ${normalized.length} groups, skipped ${skipped}`);

      return {
        success: true,
        groups: normalized,
        summary: {
          fetched: rows.length,
          upserted: 0, // Will be set after DB operation
          skipped
        }
      };

    } catch (error: any) {
      if (attempt < maxAttempts) {
        const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      
      await logToSyncLogs(supabase, operationId, 'error', 'Failed to fetch groups CSV', { 
        error: error.message 
      });
      throw error;
    }
  }
  
  throw new Error('All attempts exhausted');
}

async function syncGroupsToDB(result: any, operationId: string, supabase: any) {
  if (!result.success || !Array.isArray(result.groups) || result.groups.length === 0) {
    await logToSyncLogs(supabase, operationId, 'info', 'No groups to sync');
    return result;
  }

  try {
    await logToSyncLogs(supabase, operationId, 'info', `Starting DB sync for ${result.groups.length} groups`);

    const chunkSize = 500;
    let totalUpserted = 0;
    
    for (let i = 0; i < result.groups.length; i += chunkSize) {
      const chunk = result.groups.slice(i, i + chunkSize);
      
      const { data, error } = await supabase
        .from('tcgcsv_groups')
        .upsert(chunk, { 
          onConflict: 'group_id',
          ignoreDuplicates: false 
        });

      if (error) {
        throw new Error(`DB upsert failed for chunk ${Math.floor(i/chunkSize) + 1}: ${error.message}`);
      }
      
      totalUpserted += chunk.length;
      await logToSyncLogs(supabase, operationId, 'info', `Upserted chunk ${Math.floor(i/chunkSize) + 1}: ${chunk.length} groups`);
    }

    result.summary.upserted = totalUpserted;
    await logToSyncLogs(supabase, operationId, 'success', `Successfully synced ${totalUpserted} groups to database`);
    return result;

  } catch (error: any) {
    await logToSyncLogs(supabase, operationId, 'error', 'DB sync failed', { error: error.message });
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const operationId = crypto.randomUUID();
  let supabase: any = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { categoryId } = await req.json();
    
    if (!categoryId || !Number.isInteger(categoryId)) {
      return json({
        success: false,
        error: "categoryId is required and must be an integer",
        summary: { fetched: 0, upserted: 0, skipped: 0 }
      }, { status: 400 });
    }

    await logToSyncLogs(supabase, operationId, 'info', `Starting TCGCSV groups CSV sync for category ${categoryId}`);

    const result = await fetchAndParseGroups(categoryId, operationId, supabase);
    
    if (!result.success) {
      await logToSyncLogs(supabase, operationId, 'error', 'Groups CSV fetch failed', result);
      return json({
        success: false,
        categoryId,
        summary: { fetched: 0, upserted: 0, skipped: 0 },
        error: result.error,
        hint: result.hint,
        operationId
      }, { status: 500 });
    }
    
    const finalResult = await syncGroupsToDB(result, operationId, supabase);

    await logToSyncLogs(supabase, operationId, 'success', 'Groups CSV sync completed');

    return json({
      success: true,
      categoryId,
      summary: finalResult.summary,
      operationId
    });

  } catch (error: any) {
    console.error("sync-tcgcsv-groups-csv error:", error?.message || error);

    if (supabase) {
      await logToSyncLogs(supabase, operationId, 'error', 'Groups CSV sync failed', { error: error?.message || error });
    }

    return json({
      success: false,
      categoryId: null,
      summary: { fetched: 0, upserted: 0, skipped: 0 },
      error: error?.message || "Unknown error",
      operationId
    }, { status: 500 });
  }
});