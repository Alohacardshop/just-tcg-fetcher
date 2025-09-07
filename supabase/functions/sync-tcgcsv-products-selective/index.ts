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
      operation_type: 'tcgcsv_products_selective_sync',
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

async function fetchGroups(categoryId: number, operationId: string, supabase: any) {
  const groupsUrl = `https://tcgcsv.com/tcgplayer/groups?categoryId=${categoryId}`;
  
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

  if (!response.ok) {
    throw new Error(`Failed to fetch groups: ${response.status}`);
  }

  const json = await response.json();
  
  // Extract groups using the same logic as sync-tcgcsv-groups
  let groups: any[] = [];
  
  if (Array.isArray(json?.results)) {
    groups = json.results;
  } else if (Array.isArray(json)) {
    groups = json;
  } else if (Array.isArray(json?.groups)) {
    groups = json.groups;
  } else if (Array.isArray(json?.data)) {
    groups = json.data;
  }

  return groups.filter(g => g && (g.groupId ?? g.id) && (g.name ?? g.displayName))
    .map(g => ({
      groupId: Number(g.groupId ?? g.id),
      name: String(g.name ?? g.displayName ?? "Unknown")
    }));
}

async function fetchProductsForGroup(groupId: number, operationId: string, supabase: any) {
  let attempt = 0;
  const maxAttempts = 3;
  
  while (attempt < maxAttempts) {
    try {
      attempt++;
      const productsUrl = `https://tcgcsv.com/tcgplayer/products?groupId=${groupId}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(productsUrl, { 
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)'
        },
        signal: controller.signal 
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let json: any;
      try {
        json = await response.json();
      } catch (jsonError) {
        const text = await response.text().catch(() => "");
        
        if (attempt < maxAttempts) {
          const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        
        throw new Error('NON_JSON_BODY');
      }

      // Primary extraction: TCGplayer-style envelope with results
      let products: any[] = [];
      
      if (Array.isArray(json?.results)) {
        products = json.results;
      } else if (Array.isArray(json)) {
        products = json;
      } else if (Array.isArray(json?.products)) {
        products = json.products;
      } else if (Array.isArray(json?.data)) {
        products = json.data;
      }

      return products;

    } catch (error: any) {
      if (attempt < maxAttempts) {
        const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('Max attempts exceeded');
}

async function processProductsForGroups(
  targetGroups: Array<{groupId: number, name: string}>, 
  categoryId: number,
  operationId: string, 
  supabase: any,
  dryRun: boolean = false
) {
  const summary = {
    totalProductsFetched: 0,
    totalUpserted: 0,
    totalSkipped: 0,
    perGroup: [] as Array<{ groupId: number, groupName: string, fetched: number, upserted: number, skipped: number }>
  };
  
  const emptyGroups: Array<{ groupId: number, groupName: string }> = [];
  const concurrencyLimit = 3;
  let processedCount = 0;

  // Process groups in batches with concurrency limit
  for (let i = 0; i < targetGroups.length; i += concurrencyLimit) {
    const batch = targetGroups.slice(i, i + concurrencyLimit);
    
    const batchPromises = batch.map(async (group) => {
      try {
        await logToSyncLogs(supabase, operationId, 'info', `Fetching products for group ${group.groupId}: ${group.name}`);
        
        const products = await fetchProductsForGroup(group.groupId, operationId, supabase);
        
        if (products.length === 0) {
          emptyGroups.push({ groupId: group.groupId, groupName: group.name });
          summary.perGroup.push({
            groupId: group.groupId,
            groupName: group.name,
            fetched: 0,
            upserted: 0,
            skipped: 0
          });
          return;
        }

        // Normalize products (no pricing)
        const normalized = products
          .filter(p => p && (p.productId ?? p.id) && (p.name ?? p.displayName))
          .map((p) => ({
            product_id: Number(p.productId ?? p.id),
            group_id: group.groupId,
            category_id: categoryId,
            name: String(p.name ?? p.displayName ?? "Unknown"),
            clean_name: String(p.name ?? p.displayName ?? "Unknown").toLowerCase().trim(),
            number: p.number ?? null,
            rarity: p.rarity ?? null,
            product_type: p.productType ?? null,
            url_slug: p.urlSlug ?? generateSlug(p.name ?? p.displayName),
            extended_data: p.extendedData ?? null,
            updated_at: new Date().toISOString()
          }));

        const skipped = products.length - normalized.length;
        let upserted = 0;

        if (!dryRun && normalized.length > 0) {
          // Chunk upserts for large datasets
          const chunkSize = 500;
          
          for (let j = 0; j < normalized.length; j += chunkSize) {
            const chunk = normalized.slice(j, j + chunkSize);
            
            const { error } = await supabase
              .from('tcgcsv_products')
              .upsert(chunk, { 
                onConflict: 'product_id',
                ignoreDuplicates: false 
              });

            if (error) {
              throw new Error(`DB upsert failed for group ${group.groupId}: ${error.message}`);
            }
            
            upserted += chunk.length;
          }
        } else if (!dryRun) {
          upserted = 0;
        } else {
          upserted = normalized.length; // For dry run reporting
        }

        summary.totalProductsFetched += products.length;
        summary.totalUpserted += upserted;
        summary.totalSkipped += skipped;
        summary.perGroup.push({
          groupId: group.groupId,
          groupName: group.name,
          fetched: products.length,
          upserted,
          skipped
        });

        await logToSyncLogs(supabase, operationId, 'info', 
          `Processed group ${group.groupId}: ${products.length} fetched, ${upserted} upserted, ${skipped} skipped`);

      } catch (error: any) {
        await logToSyncLogs(supabase, operationId, 'error', 
          `Failed to process group ${group.groupId}: ${error.message}`);
        
        summary.perGroup.push({
          groupId: group.groupId,
          groupName: group.name,
          fetched: 0,
          upserted: 0,
          skipped: 0
        });
      }
    });

    await Promise.all(batchPromises);
    processedCount += batch.length;
    
    await logToSyncLogs(supabase, operationId, 'info', 
      `Processed ${processedCount}/${targetGroups.length} groups`);
  }

  return { summary, emptyGroups };
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
    const { 
      categoryId, 
      groupIds, 
      groupNameFilters, 
      maxGroups, 
      dryRun = false 
    } = await req.json();
    
    if (!categoryId || !Number.isInteger(categoryId)) {
      return json({
        success: false,
        error: "categoryId is required and must be an integer"
      }, { status: 400 });
    }

    await logToSyncLogs(supabase, operationId, 'info', 
      `Starting TCGCSV products selective sync for category ${categoryId}`);

    let targetGroups: Array<{groupId: number, name: string}> = [];

    // Resolve target groups
    if (groupIds && Array.isArray(groupIds)) {
      // Use specific group IDs - need to fetch group names
      await logToSyncLogs(supabase, operationId, 'info', `Using specific group IDs: ${groupIds.join(', ')}`);
      
      const allGroups = await fetchGroups(categoryId, operationId, supabase);
      targetGroups = allGroups.filter(g => groupIds.includes(g.groupId));
      
    } else if (groupNameFilters && Array.isArray(groupNameFilters)) {
      // Filter by group names
      await logToSyncLogs(supabase, operationId, 'info', `Filtering groups by names: ${groupNameFilters.join(', ')}`);
      
      const allGroups = await fetchGroups(categoryId, operationId, supabase);
      targetGroups = allGroups.filter(g => 
        groupNameFilters.some(filter => 
          g.name.toLowerCase().includes(filter.toLowerCase())
        )
      );
      
    } else {
      return json({
        success: false,
        error: "Either groupIds or groupNameFilters must be provided"
      }, { status: 400 });
    }

    // Apply maxGroups limit
    if (maxGroups && targetGroups.length > maxGroups) {
      targetGroups = targetGroups.slice(0, maxGroups);
      await logToSyncLogs(supabase, operationId, 'info', `Limited to ${maxGroups} groups`);
    }

    if (targetGroups.length === 0) {
      return json({
        success: true,
        categoryId,
        groupsProcessed: 0,
        groupIdsResolved: [],
        summary: {
          totalProductsFetched: 0,
          totalUpserted: 0,
          totalSkipped: 0,
          perGroup: []
        },
        emptyGroups: [],
        note: `No groups matched the specified criteria in category ${categoryId}`,
        operationId
      });
    }

    await logToSyncLogs(supabase, operationId, 'info', 
      `Resolved ${targetGroups.length} target groups`);

    // Process products for target groups
    const { summary, emptyGroups } = await processProductsForGroups(
      targetGroups, 
      categoryId, 
      operationId, 
      supabase, 
      dryRun
    );

    await logToSyncLogs(supabase, operationId, 'success', 
      'TCGCSV products selective sync completed successfully');

    // Response Shape - Success
    return json({
      success: true,
      categoryId,
      groupsProcessed: targetGroups.length,
      groupIdsResolved: targetGroups.map(g => g.groupId),
      summary,
      emptyGroups,
      dryRun,
      operationId
    });

  } catch (error: any) {
    console.error("sync-tcgcsv-products-selective error:", error?.message || error);

    if (supabase) {
      await logToSyncLogs(supabase, operationId, 'error', 
        'TCGCSV products selective sync operation failed', { error: error?.message || error });
    }

    // Response Shape - Failure
    return json({
      success: false,
      categoryId: null,
      groupsProcessed: 0,
      groupIdsResolved: [],
      summary: {
        totalProductsFetched: 0,
        totalUpserted: 0,
        totalSkipped: 0,
        perGroup: []
      },
      emptyGroups: [],
      error: error?.message || "Unknown error",
      operationId
    }, { status: 500 });
  }
});