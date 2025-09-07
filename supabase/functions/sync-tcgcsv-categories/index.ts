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
      const contentLength = response.headers.get('content-length') || '';
      await logToSyncLogs(supabase, operationId, 'info', `TCGCSV HTTP status: ${response.status}, content-type: ${contentType}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const errorMsg = `TCGCSV HTTP ${response.status}: ${errorText.slice(0, 400)}`;
        throw new Error(errorMsg);
      }

      // Try to parse JSON
      let raw: any;
      try {
        raw = await response.json();
      } catch (jsonError) {
        // If JSON parsing fails, read as text and check if we should retry
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
          sample: text.slice(0, 300),
          headers: { 'content-type': contentType, 'content-length': contentLength }
        };
        
        await logToSyncLogs(supabase, operationId, 'error', 'Non-JSON response after retries', hint);
        return { success: false, categories: [], categoriesCount: 0, error: 'NON_JSON_BODY', hint };
      }

      // Parse categories from TCGplayer-style envelope
      let categories: any[] = [];
      let parseSource = '';
      
      if (Array.isArray(raw?.results)) {
        categories = raw.results;
        parseSource = 'results';
      } else if (Array.isArray(raw)) {
        categories = raw;
        parseSource = 'bare_array';
      } else if (Array.isArray(raw?.categories)) {
        categories = raw.categories;
        parseSource = 'categories';
      } else if (Array.isArray(raw?.data)) {
        categories = raw.data;
        parseSource = 'data';
      }

      // Log parsing diagnostics
      const diagnostics = {
        parseSource,
        hasResults: Array.isArray(raw?.results),
        resultsCount: Array.isArray(raw?.results) ? raw.results.length : 0,
        isArray: Array.isArray(raw),
        hasCategories: Array.isArray(raw?.categories),
        hasData: Array.isArray(raw?.data),
        finalCategoriesCount: categories.length
      };

      console.log("Payload parsing diagnostics", diagnostics);
      await logToSyncLogs(supabase, operationId, 'info', `Parsed categories from ${parseSource}`, diagnostics);

      // Log first 2 category samples for debugging
      if (categories.length > 0) {
        const samples = categories.slice(0, 2);
        console.log("First 2 category samples", samples);
        await logToSyncLogs(supabase, operationId, 'info', 'Category samples', { samples, totalCount: categories.length });
      }

      // Normalize categories - only if we have an array
      const normalized: any[] = [];
      let skipped = 0;
      
      if (Array.isArray(categories)) {
        for (let i = 0; i < categories.length; i++) {
          const cat = categories[i];
          
          // Skip items missing required fields
          if (!cat?.categoryId && !cat?.id) {
            skipped++;
            continue;
          }
          if (!cat?.name && !cat?.title) {
            skipped++;
            continue;
          }
          
          const normalizedCategory = {
            tcgcsv_category_id: cat.categoryId || cat.id,
            name: cat.name || cat.title,
            display_name: cat.displayName || null,
            modified_on: cat.modifiedOn ? new Date(cat.modifiedOn).toISOString() : null,
            category_group_id: cat.categoryGroupId || null
          };
          
          normalized.push(normalizedCategory);
        }
      }

      await logToSyncLogs(supabase, operationId, 'info', `Normalized ${normalized.length} categories, skipped ${skipped}`);

      return { success: true, categories: normalized, categoriesCount: normalized.length, skipped };

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
    const warningMsg = "No categories fetched. Skipping DB sync.";
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