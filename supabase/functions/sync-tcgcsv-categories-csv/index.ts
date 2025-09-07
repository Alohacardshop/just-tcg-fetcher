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
      operation_type: 'tcgcsv_categories_csv_sync',
      status,
      message,
      details,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log to sync_logs:', error);
  }
}

const kebab = (s: string) =>
  String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

async function fetchAndParseCategories(operationId: string, supabase: any) {
  const url = 'https://tcgcsv.com/tcgplayer/categories.csv';
  let attempt = 0;
  const maxAttempts = 3;
  
  while (attempt < maxAttempts) {
    try {
      attempt++;
      await logToSyncLogs(supabase, operationId, 'info', `Fetching categories CSV (attempt ${attempt})`, { url });

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

      console.log("TCGCSV categories CSV response", { url, status, contentType, contentLength });
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
      const categoryIdIdx = headers.findIndex(h => h.includes('categoryid') || h.includes('category_id'));
      const nameIdx = headers.findIndex(h => h.includes('categoryname') || h.includes('name'));
      const displayNameIdx = headers.findIndex(h => h.includes('displayname') || h.includes('display_name'));
      const seoNameIdx = headers.findIndex(h => h.includes('seocategoryname') || h.includes('seo_name'));

      if (categoryIdIdx === -1 || nameIdx === -1) {
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
        
        const categoryId = Number(cols[categoryIdIdx]);
        const name = cols[nameIdx];
        
        if (!Number.isFinite(categoryId) || !name) {
          skipped++;
          continue;
        }
        
        normalized.push({
          tcgcsv_category_id: categoryId,
          name: name,
          display_name: displayNameIdx >= 0 ? cols[displayNameIdx] || null : null,
          seo_category_name: seoNameIdx >= 0 ? cols[seoNameIdx] || null : null,
          slug: kebab(name),
          updated_at: new Date().toISOString()
        });
      }

      await logToSyncLogs(supabase, operationId, 'info', `Normalized ${normalized.length} categories, skipped ${skipped}`);

      return {
        success: true,
        categories: normalized,
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
      
      await logToSyncLogs(supabase, operationId, 'error', 'Failed to fetch categories CSV', { 
        error: error.message 
      });
      throw error;
    }
  }
  
  throw new Error('All attempts exhausted');
}

async function syncCategoriesToDB(result: any, operationId: string, supabase: any) {
  if (!result.success || !Array.isArray(result.categories) || result.categories.length === 0) {
    await logToSyncLogs(supabase, operationId, 'info', 'No categories to sync');
    return result;
  }

  try {
    await logToSyncLogs(supabase, operationId, 'info', `Starting DB sync for ${result.categories.length} categories`);

    const chunkSize = 500;
    let totalUpserted = 0;
    
    for (let i = 0; i < result.categories.length; i += chunkSize) {
      const chunk = result.categories.slice(i, i + chunkSize);
      
      const { data, error } = await supabase
        .from('tcgcsv_categories')
        .upsert(chunk, { 
          onConflict: 'tcgcsv_category_id',
          ignoreDuplicates: false 
        });

      if (error) {
        throw new Error(`DB upsert failed for chunk ${Math.floor(i/chunkSize) + 1}: ${error.message}`);
      }
      
      totalUpserted += chunk.length;
      await logToSyncLogs(supabase, operationId, 'info', `Upserted chunk ${Math.floor(i/chunkSize) + 1}: ${chunk.length} categories`);
    }

    result.summary.upserted = totalUpserted;
    await logToSyncLogs(supabase, operationId, 'success', `Successfully synced ${totalUpserted} categories to database`);
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

    await logToSyncLogs(supabase, operationId, 'info', 'Starting TCGCSV categories CSV sync');

    const result = await fetchAndParseCategories(operationId, supabase);
    
    if (!result.success) {
      await logToSyncLogs(supabase, operationId, 'error', 'Categories CSV fetch failed', result);
      return json({
        success: false,
        summary: { fetched: 0, upserted: 0, skipped: 0 },
        error: result.error,
        hint: result.hint,
        operationId
      }, { status: 500 });
    }
    
    const finalResult = await syncCategoriesToDB(result, operationId, supabase);

    await logToSyncLogs(supabase, operationId, 'success', 'Categories CSV sync completed');

    return json({
      success: true,
      summary: finalResult.summary,
      operationId
    });

  } catch (error: any) {
    console.error("sync-tcgcsv-categories-csv error:", error?.message || error);

    if (supabase) {
      await logToSyncLogs(supabase, operationId, 'error', 'Categories CSV sync failed', { error: error?.message || error });
    }

    return json({
      success: false,
      summary: { fetched: 0, upserted: 0, skipped: 0 },
      error: error?.message || "Unknown error",
      operationId
    }, { status: 500 });
  }
});