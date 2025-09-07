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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const operationId = crypto.randomUUID();
  let supabase: any = null;
  
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    await logToSyncLogs(supabase, operationId, 'info', 'Starting TCGCSV categories sync');

    // Timeout in case upstream hangs
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    const r = await fetch(CATEGORIES_URL, { signal: controller.signal });
    clearTimeout(t);

    // Better diagnostics
    console.log("TCGCSV HTTP status", r.status);
    await logToSyncLogs(supabase, operationId, 'info', `TCGCSV HTTP status: ${r.status}`);

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`TCGCSV HTTP ${r.status}: ${body.slice(0, 400)}`);
    }

    // Parse JSON safely
    const raw = await r.json().catch(() => ({} as any));

    // Better diagnostics - log payload shape
    const payloadShape = {
      isArray: Array.isArray(raw),
      hasData: Array.isArray(raw?.data),
      hasCategories: Array.isArray(raw?.categories),
      length: Array.isArray(raw) ? raw.length : Array.isArray(raw?.data) ? raw.data.length : Array.isArray(raw?.categories) ? raw.categories.length : 0
    };
    
    console.log("Payload shape", payloadShape);
    await logToSyncLogs(supabase, operationId, 'info', 'Payload shape analysis', payloadShape);

    // Accept common shapes: [], { data: [] }, { categories: [] }
    let categories: unknown =
      Array.isArray(raw) ? raw :
      Array.isArray(raw?.data) ? raw.data :
      Array.isArray(raw?.categories) ? raw.categories :
      [];

    if (!Array.isArray(categories)) categories = [];

    // Minimal normalization (so your DB has consistent fields)
    const normalized = (categories as any[]).map((c, i) => ({
      tcgcsv_category_id: c?.categoryId ?? c?.id ?? i,
      name: String(c?.name ?? c?.title ?? "Unknown"),
      display_name: String(c?.displayName ?? c?.display_name ?? c?.name ?? "Unknown"),
      modified_on: c?.modifiedOn ? new Date(c.modifiedOn).toISOString() : null,
      category_group_id: c?.categoryGroupId ?? c?.category_group_id ?? null,
      raw: c, // keep raw if you need more fields later
    }));

    await logToSyncLogs(supabase, operationId, 'info', `Normalized ${normalized.length} categories`);

    // OPTIONAL: Upsert to DB here — but only if there's something to write
    if (normalized.length === 0) {
      console.warn("No categories returned from TCGCSV; skipping DB upsert.");
      await logToSyncLogs(supabase, operationId, 'warning', 'No categories returned from TCGCSV; skipping DB upsert');
      return json({ 
        success: true, 
        categories: [], 
        categoriesCount: 0, 
        note: "Upstream returned no categories.",
        operationId 
      });
    }

    // Upsert to Supabase
    try {
      const { data, error } = await supabase
        .from('tcgcsv_categories')
        .upsert(
          normalized.map(cat => ({
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

      if (error) throw new Error(`DB upsert failed: ${error.message}`);
      
      await logToSyncLogs(supabase, operationId, 'success', `Successfully synced ${normalized.length} categories to database`);
      
    } catch (dbError: any) {
      await logToSyncLogs(supabase, operationId, 'error', 'Database upsert failed', { error: dbError.message });
      throw new Error(`DB upsert failed: ${dbError.message}`);
    }

    await logToSyncLogs(supabase, operationId, 'success', 'TCGCSV categories sync completed successfully');

    return json({ 
      success: true, 
      categories: normalized, 
      categoriesCount: normalized.length,
      operationId
    });
    
  } catch (err: any) {
    console.error("sync-tcgcsv-categories error:", err?.message || err);
    
    if (supabase) {
      await logToSyncLogs(supabase, operationId, 'error', 'TCGCSV categories sync failed', { error: err?.message || err });
    }
    
    return json(
      { 
        success: false, 
        error: err?.message || "Unknown error", 
        categories: [], 
        categoriesCount: 0,
        operationId
      },
      { status: 500 },
    );
  }
});