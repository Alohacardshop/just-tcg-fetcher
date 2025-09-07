import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin'
  };
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), { 
    status, 
    headers: { 
      'Content-Type': 'application/json', 
      ...cors(req ?? new Request('')) 
    }
  });
}

const kebab = (s: string) =>
  String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

class StreamingCSVParser {
  private buffer = '';
  private headers: string[] = [];
  private headersParsed = false;
  private rowCount = 0;

  private splitCsv(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result.map(c => c.trim().replace(/^"|"$/g, ''));
  }

  parseChunk(chunk: string): any[] {
    this.buffer += chunk;
    const rows: any[] = [];
    
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      if (!this.headersParsed) {
        this.headers = this.splitCsv(line).map(h => h.trim().toLowerCase());
        console.log(`[BULK] CSV Headers:`, this.headers);
        this.headersParsed = true;
        continue;
      }
      
      const cols = this.splitCsv(line);
      const row: any = {};
      
      for (let i = 0; i < this.headers.length && i < cols.length; i++) {
        row[this.headers[i]] = cols[i] || null;
      }
      
      rows.push(row);
      this.rowCount++;
    }
    
    return rows;
  }
  
  finalize(): any[] {
    if (this.buffer.trim()) {
      return this.parseChunk('\n');
    }
    return [];
  }
  
  getRowCount(): number {
    return this.rowCount;
  }
}

async function fetchGroupsForCategory(categoryId: number, operationId: string, supabase: any) {
  const { data: groups, error } = await supabase
    .from('tcgcsv_groups')
    .select('group_id, name')
    .eq('category_id', categoryId)
    .order('name');

  if (error) {
    throw new Error(`Failed to fetch groups for category ${categoryId}: ${error.message}`);
  }

  return groups || [];
}

async function fetchAndParseProducts(
  groupId: number, 
  groupName: string, 
  categoryId: number,
  includeSealed: boolean,
  includeSingles: boolean,
  operationId: string
): Promise<{
  success: boolean;
  groupId: number;
  groupName: string;
  products?: any[];
  fetched: number;
  upserted: number;
  skipped: number;
  bytes: number;
  ms: number;
  error?: string;
}> {
  const url = `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/ProductsAndPrices.csv`;
  const startTime = Date.now();
  let bytesProcessed = 0;
  
  try {
    console.log(`[${operationId}] Fetching products for group ${groupId} (${groupName})`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)',
        'Referer': 'https://tcgcsv.com/'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        groupId,
        groupName,
        fetched: 0,
        upserted: 0,
        skipped: 0,
        bytes: 0,
        ms: Date.now() - startTime,
        error: `HTTP ${response.status}`
      };
    }

    const parser = new StreamingCSVParser();
    const normalized: any[] = [];
    let skipped = 0;
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Failed to get response reader');
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      bytesProcessed += value.length;
      const chunk = decoder.decode(value, { stream: true });
      const rows = parser.parseChunk(chunk);
      
      for (const row of rows) {
        // Normalize header names for better matching
        const normalizedRow: any = {};
        Object.keys(row).forEach(key => {
          const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          normalizedRow[normalizedKey] = row[key];
        });

        const productIdCol = Object.keys(normalizedRow).find(k => 
          k === 'productid' || k === 'id'
        );
        const nameCol = Object.keys(normalizedRow).find(k => 
          k === 'name' || k === 'cleanname' || k === 'productname'
        );
        const numberCol = Object.keys(normalizedRow).find(k => 
          k.includes('number') || k === 'extnumber'
        );
        const rarityCol = Object.keys(normalizedRow).find(k => 
          k.includes('rarity') || k === 'extrarity'
        );
        const productTypeCol = Object.keys(normalizedRow).find(k => 
          k.includes('producttype') || k.includes('type') || k === 'extcardtype'
        );
        const slugCol = Object.keys(normalizedRow).find(k => 
          k.includes('slug')
        );
        
        if (!productIdCol || !nameCol) {
          skipped++;
          continue;
        }
        
        const productId = Number(normalizedRow[productIdCol]);
        const name = normalizedRow[nameCol];
        const productType = productTypeCol ? normalizedRow[productTypeCol] : null;
        
        if (!Number.isFinite(productId) || !name) {
          skipped++;
          continue;
        }
        
        // Apply product type filters
        if (!includeSealed && productType && 
            productType.toLowerCase().includes('sealed')) {
          skipped++;
          continue;
        }
        
        if (!includeSingles && productType && 
            (productType.toLowerCase().includes('card') || 
             productType.toLowerCase().includes('single'))) {
          skipped++;
          continue;
        }
        
        // Build extended_data object from all additional columns  
        const extendedData: any = {};
        Object.keys(row).forEach(key => {
          const value = row[key];
          if (value && key !== productIdCol && key !== nameCol && key !== numberCol && key !== rarityCol && key !== productTypeCol && key !== slugCol) {
            extendedData[key] = value;
          }
        });

        normalized.push({
          product_id: productId,
          group_id: groupId,
          category_id: categoryId,
          name: name,
          clean_name: name.toLowerCase().trim(),
          number: numberCol ? normalizedRow[numberCol] || null : null,
          rarity: rarityCol ? normalizedRow[rarityCol] || null : null,
          product_type: productType,
          url_slug: slugCol ? normalizedRow[slugCol] || kebab(name) : kebab(name),
          extended_data: Object.keys(extendedData).length > 0 ? extendedData : null,
          updated_at: new Date().toISOString()
        });
      }
    }
    
    // Process any remaining data
    const finalRows = parser.finalize();
    for (const row of finalRows) {
      // Same normalization as above
      const normalizedRow: any = {};
      Object.keys(row).forEach(key => {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        normalizedRow[normalizedKey] = row[key];
      });

      const productIdCol = Object.keys(normalizedRow).find(k => 
        k === 'productid' || k === 'id'
      );
      const nameCol = Object.keys(normalizedRow).find(k => 
        k === 'name' || k === 'cleanname' || k === 'productname'
      );
      
      if (productIdCol && nameCol) {
        const productId = Number(normalizedRow[productIdCol]);
        const name = normalizedRow[nameCol];
        
        if (Number.isFinite(productId) && name) {
          // Build extended_data from original row
          const extendedData: any = {};
          Object.keys(row).forEach(key => {
            const value = row[key];
            if (value && key !== productIdCol && key !== nameCol) {
              extendedData[key] = value;
            }
          });

          normalized.push({
            product_id: productId,
            group_id: groupId,
            category_id: categoryId,
            name: name,
            clean_name: name.toLowerCase().trim(),
            number: null,
            rarity: null,
            product_type: null,
            url_slug: kebab(name),
            extended_data: Object.keys(extendedData).length > 0 ? extendedData : null,
            updated_at: new Date().toISOString()
          });
        }
      }
    }
    
    const totalTime = Date.now() - startTime;
    
    console.log(`[${operationId}] Group ${groupId}: ${normalized.length} products, ${skipped} skipped, ${bytesProcessed} bytes, ${totalTime}ms`);
    
    return {
      success: true,
      groupId,
      groupName,
      products: normalized,
      fetched: parser.getRowCount(),
      upserted: 0, // Will be set after DB operation
      skipped,
      bytes: bytesProcessed,
      ms: totalTime
    };

  } catch (error: any) {
    console.error(`[${operationId}] Group ${groupId} fetch failed:`, error);
    return {
      success: false,
      groupId,
      groupName,
      fetched: 0,
      upserted: 0,
      skipped: 0,
      bytes: bytesProcessed,
      ms: Date.now() - startTime,
      error: error.message
    };
  }
}

async function batchUpsertProducts(products: any[], operationId: string, supabase: any) {
  if (!Array.isArray(products) || products.length === 0) {
    return 0;
  }

  // Deduplicate by product_id to avoid ON CONFLICT affecting the same row twice
  const uniqueMap = new Map<number, any>();
  for (const p of products) {
    if (p && typeof p.product_id === 'number') {
      uniqueMap.set(p.product_id, p);
    }
  }
  const uniqueProducts = Array.from(uniqueMap.values());

  const batchSize = Number(Deno.env.get('UPSERT_BATCH_SIZE')) || 5000;
  let totalUpserted = 0;
  
  for (let i = 0; i < uniqueProducts.length; i += batchSize) {
    const batch = uniqueProducts.slice(i, i + batchSize);
    
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const { error } = await supabase
          .from('tcgcsv_products')
          .upsert(batch, { 
            onConflict: 'product_id',
            ignoreDuplicates: false 
          });

        if (error) {
          throw new Error(`DB upsert failed: ${error.message}`);
        }
        
        totalUpserted += batch.length;
        break;
        
      } catch (error: any) {
        retries++;
        if (retries >= maxRetries) {
          throw error;
        }
        
        const backoff = Math.pow(2, retries) * 100 + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }
  
  return totalUpserted;
}

class ConcurrencyController {
  private inFlight = 0;
  private maxConcurrency: number;
  private maxInFlightBatches: number;
  private inFlightBatches = 0;

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
    this.maxInFlightBatches = maxConcurrency * 2; // Backpressure threshold
  }

  async acquire(): Promise<void> {
    while (this.inFlight >= this.maxConcurrency || 
           this.inFlightBatches >= this.maxInFlightBatches) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.inFlight++;
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  async acquireBatch(): Promise<void> {
    this.inFlightBatches++;
  }

  releaseBatch(): void {
    this.inFlightBatches = Math.max(0, this.inFlightBatches - 1);
  }

  getStats() {
    return {
      inFlight: this.inFlight,
      inFlightBatches: this.inFlightBatches,
      maxConcurrency: this.maxConcurrency
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const operationId = crypto.randomUUID();
  
  // Create Supabase client with service role for DB writes
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { 
      categoryId, 
      groupIds, 
      includeSealed = true, 
      includeSingles = true, 
      dryRun = false 
    } = await req.json();
    
    if (!categoryId || !Number.isInteger(categoryId)) {
      return json({
        success: false,
        categoryId: categoryId || null,
        summary: { fetched: 0, upserted: 0, skipped: 0 },
        error: "categoryId is required and must be an integer"
      }, 400, req);
    }

    console.log(`[${operationId}] Starting TCGCSV products bulk CSV sync for category ${categoryId}`, {
      groupIds: groupIds?.length || 'ALL',
      includeSealed, 
      includeSingles, 
      dryRun
    });

    // Determine target groups
    let targetGroups: any[] = [];
    
    if (Array.isArray(groupIds) && groupIds.length > 0) {
      const { data: groups, error } = await supabase
        .from('tcgcsv_groups')
        .select('group_id, name')
        .in('group_id', groupIds)
        .eq('category_id', categoryId);

      if (error) {
        throw new Error(`Failed to fetch specified groups: ${error.message}`);
      }
      
      targetGroups = groups || [];
    } else {
      targetGroups = await fetchGroupsForCategory(categoryId, operationId, supabase);
    }

    if (targetGroups.length === 0) {
      return json({
        success: true,
        categoryId,
        groupsProcessed: 0,
        groupIdsResolved: [],
        summary: { fetched: 0, upserted: 0, skipped: 0 },
        perGroup: [],
        note: 'No groups found for the specified criteria'
      }, 200, req);
    }

    console.log(`[${operationId}] Processing ${targetGroups.length} groups with high concurrency`);

    const concurrency = Number(Deno.env.get('TCGCSV_CONCURRENCY')) || 12;
    const controller = new ConcurrencyController(concurrency);
    
    const startTime = Date.now();
    const perGroupResults: any[] = [];
    let totalFetched = 0;
    let totalUpserted = 0;
    let totalSkipped = 0;
    
    // Process groups with high concurrency
    const promises = targetGroups.map(async (group) => {
      await controller.acquire();
      
      try {
        const result = await fetchAndParseProducts(
          group.group_id,
          group.name,
          categoryId,
          includeSealed,
          includeSingles,
          operationId
        );
        
        // Upsert products if not dry run and successful
        if (!dryRun && result.success && result.products) {
          await controller.acquireBatch();
          try {
            result.upserted = await batchUpsertProducts(result.products, operationId, supabase);
          } finally {
            controller.releaseBatch();
          }
        }
        
        perGroupResults.push({
          groupId: result.groupId,
          groupName: result.groupName,
          fetched: result.fetched,
          upserted: result.upserted,
          skipped: result.skipped,
          bytes: result.bytes,
          ms: result.ms,
          error: result.error || null
        });
        
        totalFetched += result.fetched;
        totalUpserted += result.upserted;
        totalSkipped += result.skipped;
        
        const stats = controller.getStats();
        console.log(`[${operationId}] Completed group ${group.group_id} | In-flight: ${stats.inFlight}/${stats.maxConcurrency} | Batches: ${stats.inFlightBatches}`);
        
      } finally {
        controller.release();
      }
    });

    await Promise.all(promises);
    
    const totalTime = Date.now() - startTime;
    const rateRPS = totalFetched > 0 ? Math.round((totalFetched / totalTime) * 1000) : 0;
    const rateUPS = totalUpserted > 0 ? Math.round((totalUpserted / totalTime) * 1000) : 0;

    console.log(`[${operationId}] Bulk sync completed: ${totalFetched} fetched, ${totalUpserted} upserted in ${totalTime}ms (${rateRPS} RPS, ${rateUPS} UPS)`);

    const responseBody = {
      success: true,
      categoryId,
      groupsProcessed: targetGroups.length,
      groupIdsResolved: targetGroups.map(g => g.group_id),
      summary: {
        fetched: totalFetched,
        upserted: totalUpserted,
        skipped: totalSkipped,
        rateRPS,
        rateUPS
      },
      perGroup: perGroupResults.sort((a, b) => a.groupId - b.groupId),
      dryRun,
      operationId
    };
    
    console.log(`[${operationId}] Returning response:`, JSON.stringify(responseBody, null, 2));

    return json(responseBody, 200, req);

  } catch (error: any) {
    console.error(`[${operationId}] Bulk products sync error:`, error);

    return json({
      success: false,
      categoryId: null,
      groupsProcessed: 0,
      groupIdsResolved: [],
      summary: { fetched: 0, upserted: 0, skipped: 0 },
      perGroup: [],
      error: error?.message || "Unknown error",
      operationId
    }, 500, req);
  }
});