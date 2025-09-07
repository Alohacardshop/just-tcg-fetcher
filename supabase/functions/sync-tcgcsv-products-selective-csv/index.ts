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
      operation_type: 'tcgcsv_products_selective_csv_sync',
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

async function resolveGroupIds(categoryId: number, groupNameFilters: string[] | undefined, maxGroups: number, supabase: any, operationId: string) {
  // Get all groups for the category
  const { data: groups, error } = await supabase
    .from('tcgcsv_groups')
    .select('group_id, name')
    .eq('category_id', categoryId)
    .order('name');

  if (error) {
    throw new Error(`Failed to fetch groups: ${error.message}`);
  }

  if (!Array.isArray(groups) || groups.length === 0) {
    await logToSyncLogs(supabase, operationId, 'warning', `No groups found for category ${categoryId}`);
    return [];
  }

  let filteredGroups = groups;

  // Apply name filters if provided
  if (Array.isArray(groupNameFilters) && groupNameFilters.length > 0) {
    const filters = groupNameFilters.map(f => f.toLowerCase().trim());
    filteredGroups = groups.filter(group => 
      filters.some(filter => group.name.toLowerCase().includes(filter))
    );
    
    await logToSyncLogs(supabase, operationId, 'info', `Filtered ${groups.length} groups to ${filteredGroups.length} using name filters`, { 
      filters: groupNameFilters,
      matchedNames: filteredGroups.map(g => g.name).slice(0, 10)
    });
  }

  // Apply maxGroups limit
  if (filteredGroups.length > maxGroups) {
    filteredGroups = filteredGroups.slice(0, maxGroups);
    await logToSyncLogs(supabase, operationId, 'info', `Limited to ${maxGroups} groups`);
  }

  return filteredGroups;
}

async function fetchAndParseProducts(groupId: number, groupName: string, categoryId: number, operationId: string, supabase: any) {
  const url = `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/ProductsAndPrices.csv`;
  let attempt = 0;
  const maxAttempts = 3;
  
  while (attempt < maxAttempts) {
    try {
      attempt++;
      await logToSyncLogs(supabase, operationId, 'info', `Fetching products CSV for group ${groupId} (attempt ${attempt})`, { url, groupId, groupName });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/csv, */*',
          'Cache-Control': 'no-cache',
          'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)',
          'Referer': 'https://tcgcsv.com/'
        signal: controller.signal
      });
      clearTimeout(timeout);

      const status = response.status;
      const contentType = response.headers.get('content-type') || '';
      const contentLength = response.headers.get('content-length') || '';

      console.log("TCGCSV products CSV response", { url, status, contentType, contentLength, groupId });

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
          groupId,
          groupName,
          fetched: 0,
          upserted: 0,
          skipped: 0,
          error: 'EMPTY_CSV'
        };
      }

      // Parse CSV
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return {
          success: false,
          groupId,
          groupName,
          fetched: 0,
          upserted: 0,
          skipped: 0,
          error: 'INSUFFICIENT_LINES'
        };
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const rows = lines.slice(1);

      // Find required columns
      const productIdIdx = headers.findIndex(h => h.includes('productid') || h.includes('product_id'));
      const nameIdx = headers.findIndex(h => h.includes('productname') || h.includes('name'));
      const numberIdx = headers.findIndex(h => h.includes('number'));
      const rarityIdx = headers.findIndex(h => h.includes('rarity'));
      const productTypeIdx = headers.findIndex(h => h.includes('producttype') || h.includes('product_type'));
      const slugIdx = headers.findIndex(h => h.includes('slug'));
      const extendedDataIdx = headers.findIndex(h => h.includes('extendeddata') || h.includes('extended_data'));

      if (productIdIdx === -1 || nameIdx === -1) {
        return {
          success: false,
          groupId,
          groupName,
          fetched: 0,
          upserted: 0,
          skipped: 0,
          error: 'MISSING_REQUIRED_COLUMNS'
        };
      }

      const normalized: any[] = [];
      let skipped = 0;

      for (const row of rows) {
        const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
        
        const productId = Number(cols[productIdIdx]);
        const name = cols[nameIdx];
        
        if (!Number.isFinite(productId) || !name) {
          skipped++;
          continue;
        }
        
        normalized.push({
          product_id: productId,
          group_id: groupId,
          category_id: categoryId,
          name: name,
          clean_name: name.toLowerCase().trim(),
          number: numberIdx >= 0 ? cols[numberIdx] || null : null,
          rarity: rarityIdx >= 0 ? cols[rarityIdx] || null : null,
          product_type: productTypeIdx >= 0 ? cols[productTypeIdx] || null : null,
          url_slug: slugIdx >= 0 ? cols[slugIdx] || kebab(name) : kebab(name),
          extended_data: extendedDataIdx >= 0 ? cols[extendedDataIdx] || null : null,
          updated_at: new Date().toISOString()
        });
      }

      return {
        success: true,
        groupId,
        groupName,
        products: normalized,
        fetched: rows.length,
        upserted: 0, // Will be set after DB operation
        skipped
      };

    } catch (error: any) {
      if (attempt < maxAttempts) {
        const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      
      return {
        success: false,
        groupId,
        groupName,
        fetched: 0,
        upserted: 0,
        skipped: 0,
        error: error.message
      };
    }
  }
  
  return {
    success: false,
    groupId,
    groupName,
    fetched: 0,
    upserted: 0,
    skipped: 0,
    error: 'All attempts exhausted'
  };
}

async function syncProductsToDB(products: any[], operationId: string, supabase: any) {
  if (!Array.isArray(products) || products.length === 0) {
    return 0;
  }

  try {
    const chunkSize = 500;
    let totalUpserted = 0;
    
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      
      const { data, error } = await supabase
        .from('tcgcsv_products')
        .upsert(chunk, { 
          onConflict: 'product_id',
          ignoreDuplicates: false 
        });

      if (error) {
        throw new Error(`DB upsert failed for chunk ${Math.floor(i/chunkSize) + 1}: ${error.message}`);
      }
      
      totalUpserted += chunk.length;
    }

    return totalUpserted;

  } catch (error: any) {
    await logToSyncLogs(supabase, operationId, 'error', 'Products DB sync failed', { error: error.message });
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

    const { 
      categoryId, 
      groupIds, 
      groupNameFilters, 
      maxGroups = 10, 
      dryRun = false 
    } = await req.json();
    
    if (!categoryId || !Number.isInteger(categoryId)) {
      return json({
        success: false,
        error: "categoryId is required and must be an integer",
        summary: { totalFetched: 0, totalUpserted: 0, totalSkipped: 0, perGroup: [] }
      }, { status: 400 });
    }

    await logToSyncLogs(supabase, operationId, 'info', `Starting TCGCSV products selective CSV sync for category ${categoryId}`, {
      categoryId, groupIds, groupNameFilters, maxGroups, dryRun
    });

    // Resolve target groups
    let targetGroups: any[] = [];
    
    if (Array.isArray(groupIds) && groupIds.length > 0) {
      // Use explicit group IDs
      const { data: groups, error } = await supabase
        .from('tcgcsv_groups')
        .select('group_id, name')
        .in('group_id', groupIds)
        .eq('category_id', categoryId);

      if (error) {
        throw new Error(`Failed to fetch groups by IDs: ${error.message}`);
      }
      
      targetGroups = groups || [];
    } else {
      // Resolve by filters
      targetGroups = await resolveGroupIds(categoryId, groupNameFilters, maxGroups, supabase, operationId);
    }

    if (targetGroups.length === 0) {
      await logToSyncLogs(supabase, operationId, 'warning', 'No target groups resolved');
      return json({
        success: true,
        categoryId,
        groupsProcessed: 0,
        groupIdsResolved: [],
        summary: {
          totalFetched: 0,
          totalUpserted: 0,
          totalSkipped: 0,
          perGroup: []
        },
        emptyGroups: [],
        note: 'No groups matched the criteria'
      });
    }

    await logToSyncLogs(supabase, operationId, 'info', `Processing ${targetGroups.length} groups`, {
      groupNames: targetGroups.map(g => g.name)
    });

    // Process groups with concurrency limit
    const concurrencyLimit = 3;
    const results: any[] = [];
    const emptyGroups: any[] = [];
    
    for (let i = 0; i < targetGroups.length; i += concurrencyLimit) {
      const batch = targetGroups.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(group => 
        fetchAndParseProducts(group.group_id, group.name, categoryId, operationId, supabase)
      );
      
      const batchResults = await Promise.all(batchPromises);
      
      // Process each result
      for (const result of batchResults) {
        if (!result.success) {
          results.push(result);
          continue;
        }
        
        if (result.fetched === 0) {
          emptyGroups.push({ groupId: result.groupId, groupName: result.groupName });
          results.push(result);
          continue;
        }
        
        // Sync to DB if not dry run
        if (!dryRun && Array.isArray(result.products)) {
          try {
            const upserted = await syncProductsToDB(result.products, operationId, supabase);
            result.upserted = upserted;
          } catch (error: any) {
            result.success = false;
            result.error = error.message;
          }
        }
        
        results.push(result);
      }
    }

    // Calculate totals
    const summary = {
      totalFetched: results.reduce((sum, r) => sum + (r.fetched || 0), 0),
      totalUpserted: results.reduce((sum, r) => sum + (r.upserted || 0), 0),
      totalSkipped: results.reduce((sum, r) => sum + (r.skipped || 0), 0),
      perGroup: results.map(r => ({
        groupId: r.groupId,
        groupName: r.groupName,
        fetched: r.fetched || 0,
        upserted: r.upserted || 0,
        skipped: r.skipped || 0,
        error: r.error || null
      }))
    };

    await logToSyncLogs(supabase, operationId, 'success', 'Products selective CSV sync completed', summary);

    return json({
      success: true,
      categoryId,
      groupsProcessed: targetGroups.length,
      groupIdsResolved: targetGroups.map(g => g.group_id),
      summary,
      emptyGroups,
      dryRun,
      operationId
    });

  } catch (error: any) {
    console.error("sync-tcgcsv-products-selective-csv error:", error?.message || error);

    if (supabase) {
      await logToSyncLogs(supabase, operationId, 'error', 'Products selective CSV sync failed', { error: error?.message || error });
    }

    return json({
      success: false,
      categoryId: null,
      groupsProcessed: 0,
      groupIdsResolved: [],
      summary: { totalFetched: 0, totalUpserted: 0, totalSkipped: 0, perGroup: [] },
      emptyGroups: [],
      error: error?.message || "Unknown error",
      operationId
    }, { status: 500 });
  }
});