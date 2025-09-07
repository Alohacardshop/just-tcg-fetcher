import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CATEGORIES_URL = "https://tcgcsv.com/tcgplayer/categories";

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
      operation_type: 'tcgcsv_categories_sync',
      status,
      message,
      details,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log to sync_logs:', error);
  }
}

function generateSlug(name: string, index: number): string {
  if (!name || typeof name !== 'string') return `unknown-${index}`;
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50) || `unknown-${index}`;
}

async function fetchAndNormalizeCategories(operationId: string, supabase: any) {
  let attempt = 0;
  const maxAttempts = 3;
  
  while (attempt < maxAttempts) {
    try {
      attempt++;
      await logToSyncLogs(supabase, operationId, 'info', `Fetching TCGCSV categories from endpoint (attempt ${attempt})`);

      // Fetch with timeout and proper headers
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(CATEGORIES_URL, { 
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)'
        },
        signal: controller.signal 
      });
      clearTimeout(timeout);

      // Log HTTP status and headers
      console.log("TCGCSV HTTP status", response.status);
      const contentType = response.headers.get('content-type') || '';
      await logToSyncLogs(supabase, operationId, 'info', `TCGCSV HTTP status: ${response.status}, content-type: ${contentType}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const errorMsg = `TCGCSV HTTP ${response.status}: ${errorText.slice(0, 400)}`;
        throw new Error(errorMsg);
      }

      // Try to parse JSON
      let json: any;
      try {
        json = await response.json();
      } catch (jsonError) {
        // If JSON parsing fails, read as text and classify
        const text = await response.text().catch(() => "");
        
        if (attempt < maxAttempts) {
          console.warn(`JSON parse failed on attempt ${attempt}, retrying...`);
          const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        
        // Final attempt failed - return diagnostic info
        const hint = {
          code: text.trim().startsWith('<') ? 'HTML_BODY' : 
                text.trim() === '' ? 'EMPTY_BODY' :
                text.includes(',') && !text.includes('{') && !text.includes('[') ? 'CSV_BODY' : 
                'UNKNOWN_NON_JSON',
          sample: text.slice(0, 300)
        };
        
        await logToSyncLogs(supabase, operationId, 'error', 'Non-JSON response after retries', hint);
        return { success: false, categories: [], categoriesCount: 0, error: 'NON_JSON_BODY', hint };
      }

      // Log envelope diagnostics
      console.log("Envelope keys", Object.keys(json || {}));
      console.log("Counts", {
        resultsCount: Array.isArray(json?.results) ? json.results.length : 0,
        rawCount: Array.isArray(json) ? json.length : 0,
        categoriesCount: Array.isArray(json?.categories) ? json.categories.length : 0,
        dataCount: Array.isArray(json?.data) ? json.data.length : 0
      });

      // Primary extraction: TCGplayer-style envelope with results
      let categories: any[] = [];
      let parseSource = '';
      
      if (Array.isArray(json?.results)) {
        categories = json.results;
        parseSource = 'results';
      } else if (Array.isArray(json)) {
        categories = json;
        parseSource = 'bare_array';
      } else if (Array.isArray(json?.categories)) {
        categories = json.categories;
        parseSource = 'categories';
      } else if (Array.isArray(json?.data)) {
        categories = json.data;
        parseSource = 'data';
      }

      await logToSyncLogs(supabase, operationId, 'info', `Parsed categories from ${parseSource}`, {
        parseSource,
        envelopeKeys: Object.keys(json || {}),
        finalCategoriesCount: categories.length
      });

      // Log first item sample if we have categories
      if (categories.length > 0) {
        const firstItem = categories[0];
        console.log("First category keys", Object.keys(firstItem || {}));
        await logToSyncLogs(supabase, operationId, 'info', 'Category sample keys', { 
          firstItemKeys: Object.keys(firstItem || {}),
          totalCount: categories.length 
        });
      }

      // Normalize categories - filter and map only valid items
      const normalized = categories
        .filter(c => c && (c.categoryId ?? c.id) && (c.name ?? c.displayName ?? c.seoCategoryName))
        .map((c, i) => ({
          tcgcsv_category_id: Number(c.categoryId ?? c.id),
          name: String(c.name ?? c.displayName ?? c.seoCategoryName ?? "Unknown"),
          display_name: c.displayName ?? null,
          modified_on: c.modifiedOn ? new Date(c.modifiedOn).toISOString() : null,
          category_group_id: c.categoryGroupId ?? null
        }));

      const skipped = categories.length - normalized.length;

      await logToSyncLogs(supabase, operationId, 'info', `Normalized ${normalized.length} categories, skipped ${skipped}`);

      if (normalized.length === 0) {
        return { 
          success: true, 
          categories: [], 
          categoriesCount: 0, 
          skipped,
          note: "No categories fetched" 
        };
      }

      return { 
        success: true, 
        categories: normalized, 
        categoriesCount: normalized.length, 
        skipped 
      };

    } catch (error: any) {
      if (attempt < maxAttempts) {
        console.warn(`Attempt ${attempt} failed, retrying:`, error.message);
        const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      
      await logToSyncLogs(supabase, operationId, 'error', 'Failed to fetch TCGCSV categories after all retries', { error: error.message });
      throw error;
    }
  }
  
  throw new Error('Max attempts exceeded');
}

async function syncCategoriesToDB(result: any, operationId: string, supabase: any) {
  // DB Sync Guard - Skip if no categories or failed fetch
  if (!result.success || !Array.isArray(result.categories) || result.categories.length === 0) {
    const warningMsg = result.note || "No categories fetched. Skipping DB sync.";
    console.warn(warningMsg);
    await logToSyncLogs(supabase, operationId, 'warning', warningMsg);
    return result;
  }

  try {
    await logToSyncLogs(supabase, operationId, 'info', `Starting DB sync for ${result.categories.length} categories`);

    const { data, error } = await supabase
      .from('tcgcsv_categories')
      .upsert(
        result.categories,
        { 
          onConflict: 'tcgcsv_category_id',
          ignoreDuplicates: false 
        }
      );

    if (error) {
      throw new Error(`DB upsert failed: ${error.message}`);
    }

    await logToSyncLogs(supabase, operationId, 'success', `Successfully synced ${result.categories.length} categories to database`);
    return { ...result, dbData: data };

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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    await logToSyncLogs(supabase, operationId, 'info', 'Starting TCGCSV categories sync operation');

    // Fetch and normalize categories
    const result = await fetchAndNormalizeCategories(operationId, supabase);
    
    // If fetch failed, return the error response
    if (!result.success) {
      await logToSyncLogs(supabase, operationId, 'error', 'TCGCSV categories fetch failed', result);
      return json({
        success: false,
        categories: [],
        categoriesCount: 0,
        error: result.error,
        hint: result.hint,
        operationId
      }, { status: 500 });
    }
    
    // Sync to database
    const finalResult = await syncCategoriesToDB(result, operationId, supabase);

    await logToSyncLogs(supabase, operationId, 'success', 'TCGCSV categories sync completed successfully');

    // Response Shape - Success
    return json({
      success: true,
      categories: finalResult.categories,
      categoriesCount: finalResult.categoriesCount,
      skipped: finalResult.skipped,
      note: finalResult.note,
      operationId
    });

  } catch (error: any) {
    console.error("sync-tcgcsv-categories error:", error?.message || error);

    if (supabase) {
      await logToSyncLogs(supabase, operationId, 'error', 'TCGCSV sync operation failed', { error: error?.message || error });
    }

    // Response Shape - Failure
    return json(
      {
        success: false,
        error: error?.message || "Unknown error",
        categories: [],
        categoriesCount: 0,
        operationId
      },
      { status: 500 }
    );
  }
});