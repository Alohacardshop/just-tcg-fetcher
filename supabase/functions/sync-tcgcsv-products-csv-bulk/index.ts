import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithRL, getConcurrency, getThrottleStats, productUrlVariants } from '../_shared/rate.ts';

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
  retryAttempts?: number;
  rateLimited?: boolean;
}> {
  const startTime = Date.now();
  let bytesProcessed = 0;
  let retryAttempts = 0;
  let rateLimited = false;
  
  try {
    console.log(`[${operationId}] Fetching products for group ${groupId} (${groupName})`);
    
    // Try URL variants with rate limiting
    const urls = productUrlVariants(categoryId, groupId);
    let lastError = '';
    
    for (const url of urls) {
      const { res, attempt, retryAfter } = await fetchWithRL(url);
      retryAttempts = Math.max(retryAttempts, attempt);
      
      if (retryAfter) rateLimited = true;
      
      if (res.status === 503 && res.statusText === 'CIRCUIT_OPEN') {
        return {
          success: false,
          groupId,
          groupName,
          fetched: 0,
          upserted: 0,
          skipped: 0,
          bytes: 0,
          ms: Date.now() - startTime,
          error: 'CIRCUIT_OPEN',
          retryAttempts,
          rateLimited
        };
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        if (res.status === 429) rateLimited = true;
        continue; // Try next URL variant
      }

      // Parse successful response
      const parser = new StreamingCSVParser();
      const normalized: any[] = [];
      let skipped = 0;
      
      const reader = res.body?.getReader();
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
            k === 'productid' || k === 'id' || k === 'promoproductid'
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
            console.log(`[${operationId}] Skipping row - missing columns. ProductIdCol: ${productIdCol}, NameCol: ${nameCol}, Available keys: ${Object.keys(normalizedRow).join(', ')}`);
            skipped++;
            continue;
          }
          
          const productId = Number(normalizedRow[productIdCol]);
          const name = normalizedRow[nameCol];
          const productType = productTypeCol ? normalizedRow[productTypeCol] : null;
          
          if (!Number.isFinite(productId) || !name) {
            console.log(`[${operationId}] Skipping row - invalid data. ProductId: ${productId} (finite: ${Number.isFinite(productId)}), Name: "${name}" (length: ${name?.length || 0})`);
            skipped++;
            continue;
          }
          
          // Apply product type filters - only filter if productType indicates actual sealed/single distinction
          if (!includeSealed && productType) {
            const isActualSealedProduct = /^(sealed|pack|box|tin|bundle|collection|booster|starter|theme deck|deck|case)$/i.test(productType.trim());
            if (isActualSealedProduct) {
              console.log(`[${operationId}] Skipping sealed product: ${name} (type: ${productType})`);
              skipped++;
              continue;
            }
          }
          
          if (!includeSingles && productType) {
            const isActualSingleCard = /^(single|card|single card)$/i.test(productType.trim());
            if (isActualSingleCard) {
              console.log(`[${operationId}] Skipping single card: ${name} (type: ${productType})`);
              skipped++;
              continue;
            }
          }
          
          // Product accepted for processing
          console.log(`[${operationId}] Processing product: ${name} (ID: ${productId}, type: ${productType})`);}
          
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
      
      console.log(`[${operationId}] Group ${groupId}: ${normalized.length} products, ${skipped} skipped, ${bytesProcessed} bytes, ${totalTime}ms, ${retryAttempts} attempts`);
      
      return {
        success: true,
        groupId,
        groupName,
        products: normalized,
        fetched: parser.getRowCount(),
        upserted: 0, // Will be set after DB operation
        skipped,
        bytes: bytesProcessed,
        ms: totalTime,
        retryAttempts,
        rateLimited
      };
    }
    
    // All URL variants failed
    return {
      success: false,
      groupId,
      groupName,
      fetched: 0,
      upserted: 0,
      skipped: 0,
      bytes: bytesProcessed,
      ms: Date.now() - startTime,
      error: lastError || 'SOURCE_UNAVAILABLE',
      retryAttempts,
      rateLimited
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
      error: error.message,
      retryAttempts,
      rateLimited
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

  const batchSize = Number(Deno.env.get('UPSERT_BATCH_SIZE')) || 1000;
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

// Adaptive worker pool
class WorkerPool {
  private queue: number[] = [];
  private activeWorkers = 0;
  private results: any[] = [];
  private maxWorkers = getConcurrency();
  private workers: Promise<void>[] = [];
  private adjustInterval: number;

  constructor(
    private groupIds: number[],
    private categoryId: number,
    private includeSealed: boolean,
    private includeSingles: boolean,
    private operationId: string,
    private supabase: any,
    private dryRun: boolean,
    private progressCallback: (progress: any) => void
  ) {
    this.queue = [...groupIds];
    
    // Periodically adjust worker count based on adaptive concurrency
    this.adjustInterval = setInterval(() => {
      const target = getConcurrency();
      const diff = target - this.workers.length;
      if (diff > 0) {
        for (let i = 0; i < diff; i++) {
          this.workers.push(this.worker());
        }
      }
      console.log(`[${operationId}] Adaptive concurrency: ${this.workers.length} → ${target}`);
    }, 1500);
  }

  private async worker(): Promise<void> {
    while (true) {
      const groupId = this.queue.shift();
      if (groupId == null) return;
      
      this.activeWorkers++;
      
      try {
        const group = { group_id: groupId, name: `Group ${groupId}` }; // Simplified for this worker
        const result = await fetchAndParseProducts(
          group.group_id,
          group.name,
          this.categoryId,
          this.includeSealed,
          this.includeSingles,
          this.operationId
        );
        
        // Upsert products if not dry run and successful
        if (!this.dryRun && result.success && result.products) {
          try {
            result.upserted = await batchUpsertProducts(result.products, this.operationId, this.supabase);
            // free memory ASAP
            result.products = undefined;
          } catch (error: any) {
            result.error = `Upsert failed: ${error.message}`;
            result.success = false;
          }
        }
        
        this.results.push({
          groupId: result.groupId,
          groupName: result.groupName,
          fetched: result.fetched,
          upserted: result.upserted,
          skipped: result.skipped,
          bytes: result.bytes,
          ms: result.ms,
          error: result.error || null,
          retryAttempts: result.retryAttempts || 0,
          rateLimited: result.rateLimited || false
        });
        
        // Report progress
        this.progressCallback({
          completed: this.results.length,
          total: this.groupIds.length,
          inFlight: this.activeWorkers,
          workers: this.workers.length,
          throttleStats: getThrottleStats()
        });
        
      } finally {
        this.activeWorkers--;
      }
    }
  }

  async run(): Promise<any[]> {
    // Start initial workers
    this.maxWorkers = getConcurrency();
    for (let i = 0; i < this.maxWorkers; i++) {
      this.workers.push(this.worker());
    }
    
    await Promise.all(this.workers);
    clearInterval(this.adjustInterval);
    
    return this.results;
  }
}

async function createOrUpdateJob(
  supabase: any,
  operationId: string,
  categoryId: number,
  totalGroups: number,
  jobId?: string
) {
  if (jobId) {
    // Update existing job
    const { error } = await supabase
      .from('tcgcsv_jobs')
      .update({ last_updated: new Date().toISOString() })
      .eq('id', jobId);
    
    if (error) {
      console.error('Failed to update job:', error);
    }
    return jobId;
  } else {
    // Create new job
    const { data, error } = await supabase
      .from('tcgcsv_jobs')
      .insert({
        job_type: 'products_bulk_csv',
        category_id: categoryId,
        total_groups: totalGroups,
        metadata: { operation_id: operationId }
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('Failed to create job:', error);
      return null;
    }
    
    return data?.id;
  }
}

async function updateJobProgress(
  supabase: any,
  jobId: string,
  succeededIds: number[],
  failedIds: number[]
) {
  const { error } = await supabase
    .from('tcgcsv_jobs')
    .update({
      succeeded_group_ids: succeededIds,
      failed_group_ids: failedIds,
      last_updated: new Date().toISOString()
    })
    .eq('id', jobId);
  
  if (error) {
    console.error('Failed to update job progress:', error);
  }
}

async function finishJob(supabase: any, jobId: string) {
  const { error } = await supabase
    .from('tcgcsv_jobs')
    .update({
      finished_at: new Date().toISOString(),
      last_updated: new Date().toISOString()
    })
    .eq('id', jobId);
  
  if (error) {
    console.error('Failed to finish job:', error);
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
      dryRun = false,
      maxConcurrency,
      page = 1,
      pageSize = 25,
      jobId,
      retryFailedOnly = false
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
      dryRun,
      retryFailedOnly
    });

    // Determine target groups
    let targetGroups: any[] = [];
    
    if (retryFailedOnly && jobId) {
      // Get failed groups from previous job
      const { data: job } = await supabase
        .from('tcgcsv_jobs')
        .select('failed_group_ids')
        .eq('id', jobId)
        .single();
      
      if (job?.failed_group_ids?.length > 0) {
        const { data: groups, error } = await supabase
          .from('tcgcsv_groups')
          .select('group_id, name')
          .in('group_id', job.failed_group_ids)
          .eq('category_id', categoryId);

        if (error) {
          throw new Error(`Failed to fetch failed groups: ${error.message}`);
        }
        
        targetGroups = groups || [];
      }
    } else if (Array.isArray(groupIds) && groupIds.length > 0) {
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
        throttle: getThrottleStats(),
        note: 'No groups found for the specified criteria'
      }, 200, req);
    }

    console.log(`[${operationId}] Processing ${targetGroups.length} groups with pagination`);

    // Pagination to avoid worker limits
    const totalGroups = targetGroups.length;
    const p = Math.max(1, Number(page) || 1);
    const size = Math.max(1, Math.min(50, Number(pageSize) || 25));
    const sortedGroups = [...targetGroups].sort((a: any, b: any) => a.group_id - b.group_id);
    const start = (p - 1) * size;
    const end = Math.min(start + size, totalGroups);
    const groupsToProcess = sortedGroups.slice(start, end);
    const hasMore = end < totalGroups;
    const nextPage = hasMore ? p + 1 : null;

    if (groupsToProcess.length === 0) {
      return json({
        success: true,
        categoryId,
        groupsProcessed: 0,
        groupIdsResolved: [],
        summary: { fetched: 0, upserted: 0, skipped: 0, rateRPS: 0, rateUPS: 0 },
        perGroup: [],
        pagination: { page: p, pageSize: size, nextPage, hasMore, totalGroups },
        throttle: getThrottleStats(),
        note: 'No groups to process on this page'
      }, 200, req);
    }

    // Create or update job
    const currentJobId = await createOrUpdateJob(supabase, operationId, categoryId, totalGroups, jobId);
    
    const startTime = Date.now();
    let totalFetched = 0;
    let totalUpserted = 0;
    let totalSkipped = 0;
    let rateLimitedCount = 0;
    
    // Use adaptive worker pool
    const workerPool = new WorkerPool(
      groupsToProcess.map(g => g.group_id),
      categoryId,
      includeSealed,
      includeSingles,
      operationId,
      supabase,
      dryRun,
      (progress) => {
        console.log(`[${operationId}] Progress: ${progress.completed}/${progress.total} | Workers: ${progress.workers} | In-flight: ${progress.inFlight} | Concurrency: ${progress.throttleStats.concurrency}`);
      }
    );
    
    const perGroupResults = await workerPool.run();
    
    // Calculate totals
    const succeededIds: number[] = [];
    const failedIds: number[] = [];
    
    for (const result of perGroupResults) {
      totalFetched += result.fetched;
      totalUpserted += result.upserted;
      totalSkipped += result.skipped;
      
      if (result.rateLimited) rateLimitedCount++;
      
      if (result.error) {
        failedIds.push(result.groupId);
      } else {
        succeededIds.push(result.groupId);
      }
    }
    
    // Update job progress
    if (currentJobId) {
      await updateJobProgress(supabase, currentJobId, succeededIds, failedIds);
      
      if (!hasMore) {
        await finishJob(supabase, currentJobId);
      }
    }
    
    const totalTime = Date.now() - startTime;
    const rateRPS = totalFetched > 0 ? Math.round((totalFetched / totalTime) * 1000) : 0;
    const rateUPS = totalUpserted > 0 ? Math.round((totalUpserted / totalTime) * 1000) : 0;

    console.log(`[${operationId}] Bulk sync completed: ${totalFetched} fetched, ${totalUpserted} upserted in ${totalTime}ms (${rateRPS} RPS, ${rateUPS} UPS), ${rateLimitedCount} rate limited`);

    const responseBody = {
      success: true,
      categoryId,
      groupsProcessed: groupsToProcess.length,
      groupIdsResolved: groupsToProcess.map(g => g.group_id),
      summary: {
        fetched: totalFetched,
        upserted: totalUpserted,
        skipped: totalSkipped,
        rateRPS,
        rateUPS,
        rateLimitedCount
      },
      perGroup: perGroupResults.sort((a, b) => a.groupId - b.groupId),
      dryRun,
      pagination: { page: p, pageSize: size, nextPage, hasMore, totalGroups },
      throttle: getThrottleStats(),
      jobId: currentJobId,
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
      throttle: getThrottleStats(),
      error: error?.message || "Unknown error",
      operationId
    }, 500, req);
  }
});