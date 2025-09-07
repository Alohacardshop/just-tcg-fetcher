import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TcgCsvCategory {
  categoryId: number;
  name: string;
  displayName: string;
  modifiedOn: string;
  categoryGroupId: number;
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

async function fetchTcgCsvCategories(operationId: string, supabase: any): Promise<TcgCsvCategory[]> {
  try {
    await logToSyncLogs(supabase, operationId, 'info', 'Fetching TCGCSV categories');
    
    const response = await fetch('https://tcgcsv.com/tcgplayer/categories');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const categories: TcgCsvCategory[] = await response.json();
    await logToSyncLogs(supabase, operationId, 'info', `Fetched ${categories.length} categories`);
    
    return categories;
  } catch (error) {
    await logToSyncLogs(supabase, operationId, 'error', 'Failed to fetch TCGCSV categories', { error: error.message });
    throw error;
  }
}

async function syncCategoriesToDatabase(categories: TcgCsvCategory[], operationId: string, supabase: any) {
  try {
    await logToSyncLogs(supabase, operationId, 'info', 'Starting database sync');
    
    // Upsert categories
    const { data, error } = await supabase
      .from('tcgcsv_categories')
      .upsert(
        categories.map(cat => ({
          tcgcsv_category_id: cat.categoryId,
          name: cat.name,
          display_name: cat.displayName,
          modified_on: cat.modifiedOn,
          category_group_id: cat.categoryGroupId
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const operationId = crypto.randomUUID();
    
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
        
        const categories = await fetchTcgCsvCategories(operationId, supabase);
        await syncCategoriesToDatabase(categories, operationId, supabase);
        
        await logToSyncLogs(supabase, operationId, 'success', 'TCGCSV categories sync completed successfully');
        
        return {
          success: true,
          operationId,
          categoriesCount: categories.length,
          message: 'Categories synced successfully'
        };
      } catch (error) {
        await logToSyncLogs(supabase, operationId, 'error', 'TCGCSV categories sync failed', { error: error.message });
        throw error;
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
          status: 200 
        }
      );
    }
  } catch (error) {
    console.error('Edge function error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});