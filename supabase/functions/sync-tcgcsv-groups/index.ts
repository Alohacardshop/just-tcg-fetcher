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
      operation_type: 'tcgcsv_groups_sync',
      status,
      message,
      details,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log to sync_logs:', error);
  }
}

function generateSlug(name: string): string {
  if (!name || typeof name !== 'string') return 'unknown';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50) || 'unknown';
}

async function fetchAndNormalizeGroups(categoryId: number, operationId: string, supabase: any) {
  let attempt = 0;
  const maxAttempts = 3;
  
  while (attempt < maxAttempts) {
    try {
      attempt++;
      const groupsUrl = `https://tcgcsv.com/tcgplayer/groups?categoryId=${categoryId}`;
      await logToSyncLogs(supabase, operationId, 'info', `Fetching groups for category ${categoryId} (attempt ${attempt})`);

      // Fetch with timeout and proper headers
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(groupsUrl, { 
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)'
        },
        signal: controller.signal 
      });
      clearTimeout(timeout);

      console.log("TCGCSV groups HTTP status", response.status);
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
        const text = await response.text().catch(() => "");
        
        if (attempt < maxAttempts) {
          console.warn(`JSON parse failed on attempt ${attempt}, retrying...`);
          const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        
        const hint = {
          code: text.trim().startsWith('<') ? 'HTML_BODY' : 
                text.trim() === '' ? 'EMPTY_BODY' :
                text.includes(',') && !text.includes('{') && !text.includes('[') ? 'CSV_BODY' : 
                'UNKNOWN_NON_JSON',
          sample: text.slice(0, 300)
        };
        
        await logToSyncLogs(supabase, operationId, 'error', 'Non-JSON response after retries', hint);
        return { success: false, groups: [], groupsCount: 0, error: 'NON_JSON_BODY', hint };
      }

      // Log envelope diagnostics
      console.log("Groups envelope keys", Object.keys(json || {}));
      console.log("Groups counts", {
        resultsCount: Array.isArray(json?.results) ? json.results.length : 0,
        rawCount: Array.isArray(json) ? json.length : 0,
        groupsCount: Array.isArray(json?.groups) ? json.groups.length : 0,
        dataCount: Array.isArray(json?.data) ? json.data.length : 0
      });

      // Primary extraction: TCGplayer-style envelope with results
      let groups: any[] = [];
      let parseSource = '';
      
      if (Array.isArray(json?.results)) {
        groups = json.results;
        parseSource = 'results';
      } else if (Array.isArray(json)) {
        groups = json;
        parseSource = 'bare_array';
      } else if (Array.isArray(json?.groups)) {
        groups = json.groups;
        parseSource = 'groups';
      } else if (Array.isArray(json?.data)) {
        groups = json.data;
        parseSource = 'data';
      }

      await logToSyncLogs(supabase, operationId, 'info', `Parsed groups from ${parseSource}`, {
        parseSource,
        envelopeKeys: Object.keys(json || {}),
        finalGroupsCount: groups.length
      });

      // Log first item sample if we have groups
      if (groups.length > 0) {
        const firstItem = groups[0];
        console.log("First group keys", Object.keys(firstItem || {}));
        await logToSyncLogs(supabase, operationId, 'info', 'Group sample keys', { 
          firstItemKeys: Object.keys(firstItem || {}),
          totalCount: groups.length 
        });
      }

      // Normalize groups - filter and map only valid items
      const normalized = groups
        .filter(g => g && (g.groupId ?? g.id) && (g.name ?? g.displayName))
        .map((g) => ({
          group_id: Number(g.groupId ?? g.id),
          category_id: categoryId,
          name: String(g.name ?? g.displayName ?? "Unknown"),
          abbreviation: g.abbreviation ?? null,
          release_date: g.releaseDate ? new Date(g.releaseDate).toISOString() : null,
          is_supplemental: g.isSupplemental ?? null,
          sealed_product: g.sealedProduct ?? null,
          url_slug: g.urlSlug ?? generateSlug(g.name ?? g.displayName),
          updated_at: new Date().toISOString()
        }));

      const skipped = groups.length - normalized.length;

      await logToSyncLogs(supabase, operationId, 'info', `Normalized ${normalized.length} groups, skipped ${skipped}`);

      if (normalized.length === 0) {
        return { 
          success: true, 
          groups: [], 
          groupsCount: 0, 
          skipped,
          note: "No groups fetched" 
        };
      }

      return { 
        success: true, 
        groups: normalized, 
        groupsCount: normalized.length, 
        skipped 
      };

    } catch (error: any) {
      if (attempt < maxAttempts) {
        console.warn(`Attempt ${attempt} failed, retrying:`, error.message);
        const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      
      await logToSyncLogs(supabase, operationId, 'error', 'Failed to fetch TCGCSV groups after all retries', { error: error.message });
      throw error;
    }
  }
  
  throw new Error('Max attempts exceeded');
}

async function syncGroupsToDB(result: any, operationId: string, supabase: any, dryRun: boolean = false) {
  if (!result.success || !Array.isArray(result.groups) || result.groups.length === 0) {
    const warningMsg = result.note || "No groups fetched. Skipping DB sync.";
    console.warn(warningMsg);
    await logToSyncLogs(supabase, operationId, 'warning', warningMsg);
    return result;
  }

  if (dryRun) {
    await logToSyncLogs(supabase, operationId, 'info', `Dry run: would sync ${result.groups.length} groups`);
    return { ...result, dryRun: true };
  }

  try {
    await logToSyncLogs(supabase, operationId, 'info', `Starting DB sync for ${result.groups.length} groups`);

    // Chunk writes for large datasets
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

    await logToSyncLogs(supabase, operationId, 'success', `Successfully synced ${totalUpserted} groups to database`);
    return { ...result, dbUpserted: totalUpserted };

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

    // Parse request body
    const { categoryId, dryRun = false } = await req.json();
    
    if (!categoryId || !Number.isInteger(categoryId)) {
      return json({
        success: false,
        error: "categoryId is required and must be an integer",
        groups: [],
        groupsCount: 0
      }, { status: 400 });
    }

    await logToSyncLogs(supabase, operationId, 'info', `Starting TCGCSV groups sync for category ${categoryId}`);

    // Fetch and normalize groups
    const result = await fetchAndNormalizeGroups(categoryId, operationId, supabase);
    
    // If fetch failed, return the error response
    if (!result.success) {
      await logToSyncLogs(supabase, operationId, 'error', 'TCGCSV groups fetch failed', result);
      return json({
        success: false,
        categoryId,
        groups: [],
        groupsCount: 0,
        error: result.error,
        hint: result.hint,
        operationId
      }, { status: 500 });
    }
    
    // Sync to database
    const finalResult = await syncGroupsToDB(result, operationId, supabase, dryRun);

    await logToSyncLogs(supabase, operationId, 'success', 'TCGCSV groups sync completed successfully');

    // Response Shape - Success
    return json({
      success: true,
      categoryId,
      groups: finalResult.groups,
      groupsCount: finalResult.groupsCount,
      skipped: finalResult.skipped,
      note: finalResult.note,
      dryRun: finalResult.dryRun,
      operationId
    });

  } catch (error: any) {
    console.error("sync-tcgcsv-groups error:", error?.message || error);

    if (supabase) {
      await logToSyncLogs(supabase, operationId, 'error', 'TCGCSV groups sync operation failed', { error: error?.message || error });
    }

    // Response Shape - Failure
    return json({
      success: false,
      categoryId: null,
      groups: [],
      groupsCount: 0,
      error: error?.message || "Unknown error",
      operationId
    }, { status: 500 });
  }
});