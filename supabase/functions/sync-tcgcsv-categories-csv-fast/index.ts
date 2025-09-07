import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(body: unknown, status: number = 200) {
  return new Response(JSON.stringify(body), { 
    status,
    headers: CORS 
  });
}

const kebab = (s: string) =>
  String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

class StreamingCSVParser {
  private buffer = '';
  private headers: string[] = [];
  private headersParsed = false;
  private rowCount = 0;

  parseChunk(chunk: string): any[] {
    this.buffer += chunk;
    const rows: any[] = [];
    
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      if (!this.headersParsed) {
        this.headers = line.split(',').map(h => h.trim().toLowerCase().replace(/\"/g, ''));
        this.headersParsed = true;
        continue;
      }
      
      const cols = line.split(',').map(c => c.trim().replace(/\"/g, ''));
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
    // Process any remaining data in buffer
    if (this.buffer.trim()) {
      return this.parseChunk('\n');
    }
    return [];
  }
  
  getRowCount(): number {
    return this.rowCount;
  }
}

async function fetchAndParseCategories(operationId: string, supabase: any) {
  const url = 'https://tcgcsv.com/tcgplayer/categories.csv';
  const startTime = Date.now();
  
  try {
    console.log(`[${operationId}] Starting high-throughput categories fetch`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    console.log(`[${operationId}] Response received: ${response.status}, Content-Length: ${contentLength}`);

    // Stream and parse CSV
    const parser = new StreamingCSVParser();
    const normalized: any[] = [];
    let skipped = 0;
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Failed to get response reader');
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const rows = parser.parseChunk(chunk);
      
      // Process rows as they arrive
      for (const row of rows) {
        const categoryIdCol = Object.keys(row).find(k => 
          k.includes('categoryid') || k.includes('category_id')
        );
        const nameCol = Object.keys(row).find(k => 
          k.includes('categoryname') || k.includes('name')
        );
        const displayNameCol = Object.keys(row).find(k => 
          k.includes('displayname') || k.includes('display_name')
        );
        const seoNameCol = Object.keys(row).find(k => 
          k.includes('seocategoryname') || k.includes('seo_name')
        );
        
        if (!categoryIdCol || !nameCol) {
          skipped++;
          continue;
        }
        
        const categoryId = Number(row[categoryIdCol]);
        const name = row[nameCol];
        
        if (!Number.isFinite(categoryId) || !name) {
          skipped++;
          continue;
        }
        
        normalized.push({
          tcgcsv_category_id: categoryId,
          name: name,
          display_name: displayNameCol ? row[displayNameCol] || null : null,
          seo_category_name: seoNameCol ? row[seoNameCol] || null : null,
          slug: kebab(name),
          updated_at: new Date().toISOString()
        });
      }
    }
    
    // Process any remaining data
    const finalRows = parser.finalize();
    for (const row of finalRows) {
      // Same processing logic as above
      const categoryIdCol = Object.keys(row).find(k => 
        k.includes('categoryid') || k.includes('category_id')
      );
      const nameCol = Object.keys(row).find(k => 
        k.includes('categoryname') || k.includes('name')
      );
      
      if (categoryIdCol && nameCol) {
        const categoryId = Number(row[categoryIdCol]);
        const name = row[nameCol];
        
        if (Number.isFinite(categoryId) && name) {
          normalized.push({
            tcgcsv_category_id: categoryId,
            name: name,
            display_name: null,
            seo_category_name: null,
            slug: kebab(name),
            updated_at: new Date().toISOString()
          });
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }
    
    const totalTime = Date.now() - startTime;
    const rateRPS = normalized.length > 0 ? Math.round((normalized.length / totalTime) * 1000) : 0;
    
    console.log(`[${operationId}] Parsed ${normalized.length} categories in ${totalTime}ms (${rateRPS} rows/sec), skipped ${skipped}`);
    
    return {
      success: true,
      categories: normalized,
      summary: {
        fetched: parser.getRowCount(),
        upserted: 0, // Will be set after DB operation
        skipped,
        rateRPS
      }
    };

  } catch (error: any) {
    console.error(`[${operationId}] Categories fetch failed:`, error);
    throw error;
  }
}

async function batchUpsertCategories(categories: any[], operationId: string, supabase: any) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return { upserted: 0, rateUPS: 0 };
  }

  const batchSize = Number(Deno.env.get('UPSERT_BATCH_SIZE')) || 5000;
  const startTime = Date.now();
  let totalUpserted = 0;
  
  console.log(`[${operationId}] Starting batch upsert: ${categories.length} categories, batch size: ${batchSize}`);
  
  for (let i = 0; i < categories.length; i += batchSize) {
    const batch = categories.slice(i, i + batchSize);
    
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const { error } = await supabase
          .from('tcgcsv_categories')
          .upsert(batch, { 
            onConflict: 'tcgcsv_category_id',
            ignoreDuplicates: false 
          });

        if (error) {
          throw new Error(`DB upsert failed: ${error.message}`);
        }
        
        totalUpserted += batch.length;
        console.log(`[${operationId}] Upserted batch ${Math.floor(i/batchSize) + 1}: ${batch.length} categories`);
        break; // Success, exit retry loop
        
      } catch (error: any) {
        retries++;
        if (retries >= maxRetries) {
          throw error;
        }
        
        const backoff = Math.pow(2, retries) * 100 + Math.random() * 100;
        console.log(`[${operationId}] Batch upsert retry ${retries} after ${backoff}ms`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }
  
  const totalTime = Date.now() - startTime;
  const rateUPS = totalUpserted > 0 ? Math.round((totalUpserted / totalTime) * 1000) : 0;
  
  console.log(`[${operationId}] Batch upsert completed: ${totalUpserted} categories in ${totalTime}ms (${rateUPS} upserts/sec)`);
  
  return { upserted: totalUpserted, rateUPS };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const operationId = crypto.randomUUID();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[${operationId}] Starting TCGCSV categories fast CSV sync`);

    const result = await fetchAndParseCategories(operationId, supabase);
    
    if (!result.success) {
      return json({
        success: false,
        summary: { fetched: 0, upserted: 0, skipped: 0 },
        error: 'FETCH_FAILED',
        operationId
      });
    }
    
    const { upserted, rateUPS } = await batchUpsertCategories(result.categories, operationId, supabase);

    console.log(`[${operationId}] Categories fast sync completed successfully`);

    return json({
      success: true,
      summary: {
        fetched: result.summary.fetched,
        upserted,
        skipped: result.summary.skipped,
        rateRPS: result.summary.rateRPS,
        rateUPS
      },
      operationId
    });

  } catch (error: any) {
    console.error(`[${operationId}] Categories fast sync error:`, error);

    return json({
      success: false,
      summary: { fetched: 0, upserted: 0, skipped: 0 },
      error: error?.message || "Unknown error",
      operationId
    });
  }
});
