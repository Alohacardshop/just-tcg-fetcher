import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TcgCsvCategory {
  categoryId: number;
  name: string;
  displayName?: string;
  modifiedOn?: string;
  categoryGroupId?: number;
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

function validateCategory(cat: any): cat is TcgCsvCategory {
  return cat && typeof cat.name === 'string' && cat.name.trim().length > 0;
}

async function fetchTcgCsvCategories(operationId: string, supabase: any): Promise<{ categories: TcgCsvCategory[], skipped: number }> {
  try {
    await logToSyncLogs(supabase, operationId, 'info', 'Fetching TCGCSV categories');
    
    const TCGCSV_CATEGORIES_URL = 'https://tcgcsv.com/tcgplayer/categories';
    const TCGCSV_API_KEY = Deno.env.get('TCGCSV_API_KEY');
    
    const headers: Record<string, string> = {};
    if (TCGCSV_API_KEY) {
      headers['Authorization'] = `Bearer ${TCGCSV_API_KEY}`;
    }
    
    const response = await fetch(TCGCSV_CATEGORIES_URL, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const json = await response.json();
    
    // Log payload shape for debugging
    console.log('TCGCSV categories payload shape', {
      isArray: Array.isArray(json),
      hasData: Array.isArray(json?.data),
      hasCategories: Array.isArray(json?.categories),
      length: (
        Array.isArray(json?.data) ? json.data.length :
        Array.isArray(json?.categories) ? json.categories.length :
        Array.isArray(json) ? json.length : 0
      )
    });
    
    // Defensive parsing - handle different response shapes
    let rawCategories: any[] = [];
    
    if (Array.isArray(json)) {
      rawCategories = json;
    } else if (Array.isArray(json?.data)) {
      rawCategories = json.data;
    } else if (Array.isArray(json?.categories)) {
      rawCategories = json.categories;
    } else {
      // Coerce non-array to empty array
      rawCategories = [];
    }
    
    // Validate categories and filter out invalid ones
    const validCategories: TcgCsvCategory[] = [];
    let skipped = 0;
    
    for (const cat of rawCategories) {
      if (validateCategory(cat)) {
        validCategories.push(cat);
      } else {
        skipped++;
        console.warn('Skipping invalid category:', cat);
      }
    }
    
    await logToSyncLogs(supabase, operationId, 'info', `Fetched ${validCategories.length} valid categories, skipped ${skipped} invalid`);
    
    return { categories: validCategories, skipped };
  } catch (error) {
    await logToSyncLogs(supabase, operationId, 'error', 'Failed to fetch TCGCSV categories', { error: error.message });
    throw error;
  }
}

async function syncCategoriesToDatabase(categories: TcgCsvCategory[], operationId: string, supabase: any) {
  try {
    if (!Array.isArray(categories) || categories.length === 0) {
      await logToSyncLogs(supabase, operationId, 'info', 'No categories to sync');
      return null;
    }
    
    await logToSyncLogs(supabase, operationId, 'info', 'Starting database sync');
    
    const { data, error } = await supabase
      .from('tcgcsv_categories')
      .upsert(
        categories.map(cat => ({
          tcgcsv_category_id: cat.categoryId,
          name: cat.name,
          display_name: cat.displayName || null,
          modified_on: cat.modifiedOn ? new Date(cat.modifiedOn).toISOString() : null,
          category_group_id: cat.categoryGroupId || null
        })),
        { 
          onConflict: 'tcgcsv_category_id',
          ignoreDuplicates: false 
        }
      );

    if (error) {
      throw error;
    }

    await logToSyncLogs(supabase, operationId, 'success', `Successfully synced ${categories.length} categories to database`);
    return data;
  } catch (error) {
    await logToSyncLogs(supabase, operationId, 'error', 'Failed to sync categories to database', { error: error.message });
    throw error;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const operationId = crypto.randomUUID();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body for background mode
    let background = false;
    try {
      const body = await req.json();
      background = body.background || false;
    } catch (e) {
      // If no body or invalid JSON, default to foreground
    }

    const syncOperation = async () => {
      try {
        await logToSyncLogs(supabase, operationId, 'info', 'Starting TCGCSV categories sync');
        
        const { categories, skipped } = await fetchTcgCsvCategories(operationId, supabase);
        await syncCategoriesToDatabase(categories, operationId, supabase);
        
        await logToSyncLogs(supabase, operationId, 'success', 'TCGCSV categories sync completed successfully');
        
        return {
          success: true,
          operationId,
          categories,
          categoriesCount: categories.length,
          skipped,
          message: 'Categories synced successfully'
        };
      } catch (error) {
        await logToSyncLogs(supabase, operationId, 'error', 'TCGCSV categories sync failed', { error: error.message });
        
        return {
          success: false,
          operationId,
          categories: [],
          categoriesCount: 0,
          skipped: 0,
          error: error.message || 'Internal server error'
        };
      }
    };

    if (background) {
      // Start background task
      EdgeRuntime.waitUntil(syncOperation());
      
      return new Response(
        JSON.stringify({
          success: true,
          operationId,
          message: 'Categories sync started in background'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 202 
        }
      );
    } else {
      // Run synchronously
      const result = await syncOperation();
      
      return new Response(
        JSON.stringify(result),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.success ? 200 : 500
        }
      );
    }
  } catch (error) {
    console.error('Edge function error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        operationId,
        categories: [],
        categoriesCount: 0,
        skipped: 0,
        error: error.message || 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});