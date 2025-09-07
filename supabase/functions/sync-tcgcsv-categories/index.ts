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
  try {
    await logToSyncLogs(supabase, operationId, 'info', 'Fetching TCGCSV categories from endpoint');

    // Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(CATEGORIES_URL, { 
      method: 'GET',
      signal: controller.signal 
    });
    clearTimeout(timeout);

    // Log HTTP status
    console.log("TCGCSV HTTP status", response.status);
    await logToSyncLogs(supabase, operationId, 'info', `TCGCSV HTTP status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const errorMsg = `TCGCSV HTTP ${response.status}: ${errorText.slice(0, 400)}`;
      throw new Error(errorMsg);
    }

    // Parse JSON safely
    const raw = await response.json().catch(() => {
      console.warn("Failed to parse JSON response, defaulting to empty object");
      return {};
    });

    // Log payload shape diagnostics
    const diagnostics = {
      isArray: Array.isArray(raw),
      hasCategories: Array.isArray(raw?.categories),
      hasData: Array.isArray(raw?.data),
      categoriesCount: Array.isArray(raw?.categories) ? raw.categories.length : 0,
      dataCount: Array.isArray(raw?.data) ? raw.data.length : 0,
      rawCount: Array.isArray(raw) ? raw.length : 0
    };

    console.log("Payload shape diagnostics", diagnostics);
    await logToSyncLogs(supabase, operationId, 'info', 'Payload shape analysis', diagnostics);

    // Normalize Categories - Accept valid arrays from different shapes
    let categories: any[] = [];
    
    if (Array.isArray(raw)) {
      categories = raw;
    } else if (Array.isArray(raw?.categories)) {
      categories = raw.categories;
    } else if (Array.isArray(raw?.data)) {
      categories = raw.data;
    } else {
      console.warn("No valid categories array found in response, defaulting to empty array");
      categories = [];
    }

    // Log first 2 category samples for debugging
    if (categories.length > 0) {
      const samples = categories.slice(0, 2);
      console.log("First 2 category samples", samples);
      await logToSyncLogs(supabase, operationId, 'info', 'Category samples', { samples, totalCount: categories.length });
    }

    // Safe Mapping - Never call .map() unless Array.isArray is true
    const normalized: any[] = [];
    
    if (Array.isArray(categories)) {
      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        
        const normalizedCategory = {
          id: cat?.categoryId || cat?.id || i,
          name: cat?.name || cat?.title || "Unknown",
          slug: cat?.slug || generateSlug(cat?.name || cat?.title, i),
          tcgcsv_category_id: cat?.categoryId || cat?.id || i,
          display_name: cat?.displayName || cat?.display_name || cat?.name || cat?.title || "Unknown",
          modified_on: cat?.modifiedOn ? new Date(cat.modifiedOn).toISOString() : null,
          category_group_id: cat?.categoryGroupId || cat?.category_group_id || null,
          raw: cat
        };
        
        normalized.push(normalizedCategory);
      }
    }

    await logToSyncLogs(supabase, operationId, 'info', `Normalized ${normalized.length} categories`);

    return normalized;

  } catch (error: any) {
    await logToSyncLogs(supabase, operationId, 'error', 'Failed to fetch TCGCSV categories', { error: error.message });
    throw error;
  }
}

async function syncCategoriesToDB(categories: any[], operationId: string, supabase: any) {
  // DB Sync Guard - Skip if no categories
  if (!Array.isArray(categories) || categories.length === 0) {
    const warningMsg = "No categories fetched. Skipping DB sync.";
    console.warn(warningMsg);
    await logToSyncLogs(supabase, operationId, 'warning', warningMsg);
    return null;
  }

  try {
    await logToSyncLogs(supabase, operationId, 'info', `Starting DB sync for ${categories.length} categories`);

    const { data, error } = await supabase
      .from('tcgcsv_categories')
      .upsert(
        categories.map(cat => ({
          tcgcsv_category_id: cat.tcgcsv_category_id,
          name: cat.name,
          display_name: cat.display_name,
          modified_on: cat.modified_on,
          category_group_id: cat.category_group_id
        })),
        { 
          onConflict: 'tcgcsv_category_id',
          ignoreDuplicates: false 
        }
      );

    if (error) {
      throw new Error(`DB upsert failed: ${error.message}`);
    }

    await logToSyncLogs(supabase, operationId, 'success', `Successfully synced ${categories.length} categories to database`);
    return data;

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
    const categories = await fetchAndNormalizeCategories(operationId, supabase);
    
    // Sync to database
    await syncCategoriesToDB(categories, operationId, supabase);

    await logToSyncLogs(supabase, operationId, 'success', 'TCGCSV categories sync completed successfully');

    // Response Shape - Success
    return json({
      success: true,
      categories,
      categoriesCount: categories.length,
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