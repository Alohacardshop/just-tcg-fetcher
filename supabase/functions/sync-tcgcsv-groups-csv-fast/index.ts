import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type',
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

const toBool = (v: any) =>
  typeof v === 'boolean' ? v :
  v == null ? null :
  ['true', '1', 'yes', 'y'].includes(String(v).trim().toLowerCase()) ? true :
  ['false', '0', 'no', 'n'].includes(String(v).trim().toLowerCase()) ? false : null;

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
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      if (!this.headersParsed) {
        this.headers = line.split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        this.headersParsed = true;
        continue;
      }
      
      const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
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

async function fetchAndParseGroups(categoryId: number, operationId: string, supabase: any) {
  const url = `https://tcgcsv.com/tcgplayer/${categoryId}/groups.csv`;
  const startTime = Date.now();
  
  try {
    console.log(`[${operationId}] Starting high-throughput groups fetch for category ${categoryId}`);
    
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
      if (response.status === 403) {
        return {
          success: false,
          error: 'CSV_ACCESS_FORBIDDEN',
          summary: { fetched: 0, upserted: 0, skipped: 0 },
          note: `Groups CSV for category ${categoryId} returned 403 Forbidden`
        };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    console.log(`[${operationId}] Response received: ${response.status}, Content-Length: ${contentLength}`);

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
      
      for (const row of rows) {
        const groupIdCol = Object.keys(row).find(k => 
          k.includes('groupid') || k.includes('group_id')
        );
        const nameCol = Object.keys(row).find(k => 
          k.includes('groupname') || k.includes('name')
        );
        const abbreviationCol = Object.keys(row).find(k => 
          k.includes('abbreviation')
        );
        const releaseDateCol = Object.keys(row).find(k => 
          k.includes('releasedate') || k.includes('release_date')
        );
        const isSupplementalCol = Object.keys(row).find(k => 
          k.includes('issupplemental') || k.includes('is_supplemental')
        );
        const sealedProductCol = Object.keys(row).find(k => 
          k.includes('sealedproduct') || k.includes('sealed_product')
        );
        const popularityCol = Object.keys(row).find(k => 
          k.includes('popularity')
        );
        const slugCol = Object.keys(row).find(k => 
          k.includes('slug')
        );
        
        if (!groupIdCol || !nameCol) {
          skipped++;
          continue;
        }
        
        const groupId = Number(row[groupIdCol]);
        const name = row[nameCol];
        
        if (!Number.isFinite(groupId) || !name) {
          skipped++;
          continue;
        }
        
        normalized.push({
          group_id: groupId,
          category_id: categoryId,
          name: name,
          abbreviation: abbreviationCol ? row[abbreviationCol] || null : null,
          release_date: releaseDateCol ? row[releaseDateCol] || null : null,
          is_supplemental: isSupplementalCol ? toBool(row[isSupplementalCol]) : null,
          sealed_product: sealedProductCol ? toBool(row[sealedProductCol]) : null,
          popularity: popularityCol ? Number(row[popularityCol]) || null : null,
          url_slug: slugCol ? row[slugCol] || kebab(name) : kebab(name),
          updated_at: new Date().toISOString()
        });
      }
    }
    
    const finalRows = parser.finalize();
    for (const row of finalRows) {
      const groupIdCol = Object.keys(row).find(k => 
        k.includes('groupid') || k.includes('group_id')
      );
      const nameCol = Object.keys(row).find(k => 
        k.includes('groupname') || k.includes('name')
      );
      
      if (groupIdCol && nameCol) {
        const groupId = Number(row[groupIdCol]);
        const name = row[nameCol];
        
        if (Number.isFinite(groupId) && name) {
          normalized.push({
            group_id: groupId,
            category_id: categoryId,
            name: name,
            abbreviation: null,
            release_date: null,
            is_supplemental: null,
            sealed_product: null,
            popularity: null,
            url_slug: kebab(name),
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
    
    console.log(`[${operationId}] Parsed ${normalized.length} groups in ${totalTime}ms (${rateRPS} rows/sec), skipped ${skipped}`);
    
    return {
      success: true,
      groups: normalized,
      summary: {
        fetched: parser.getRowCount(),
        upserted: 0,
        skipped,
        rateRPS
      }
    };

  } catch (error: any) {
    console.error(`[${operationId}] Groups fetch failed:`, error);
    throw error;
  }
}

async function batchUpsertGroups(groups: any[], operationId: string, supabase: any) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return { upserted: 0, rateUPS: 0 };
  }

  const batchSize = Number(Deno.env.get('UPSERT_BATCH_SIZE')) || 5000;
  const startTime = Date.now();
  let totalUpserted = 0;
  
  console.log(`[${operationId}] Starting batch upsert: ${groups.length} groups, batch size: ${batchSize}`);
  
  for (let i = 0; i < groups.length; i += batchSize) {
    const batch = groups.slice(i, i + batchSize);
    
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const { error } = await supabase
          .from('tcgcsv_groups')
          .upsert(batch, { 
            onConflict: 'group_id',
            ignoreDuplicates: false 
          });

        if (error) {
          throw new Error(`DB upsert failed: ${error.message}`);
        }
        
        totalUpserted += batch.length;
        console.log(`[${operationId}] Upserted batch ${Math.floor(i/batchSize) + 1}: ${batch.length} groups`);
        break;
        
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
  
  console.log(`[${operationId}] Batch upsert completed: ${totalUpserted} groups in ${totalTime}ms (${rateUPS} upserts/sec)`);
  
  return { upserted: totalUpserted, rateUPS };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const operationId = crypto.randomUUID();
  
  // Create Supabase client with token pass-through
  const auth = req.headers.get('Authorization') ?? `Bearer ${SUPABASE_ANON_KEY}`;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } }
  });

  try {
    const { categoryId } = await req.json();
    
    if (!categoryId || !Number.isInteger(categoryId)) {
      return json({
        success: false,
        categoryId: categoryId || null,
        summary: { fetched: 0, upserted: 0, skipped: 0 },
        error: "categoryId is required and must be an integer"
      }, 400, req);
    }

    console.log(`[${operationId}] Starting TCGCSV groups fast CSV sync for category ${categoryId}`);

    const result = await fetchAndParseGroups(categoryId, operationId, supabase);
    
    if (!result.success) {
      return json({
        success: false,
        categoryId,
        summary: { fetched: 0, upserted: 0, skipped: 0 },
        error: result.error,
        note: result.note,
        operationId
      }, 500, req);
    }
    
    const { upserted, rateUPS } = await batchUpsertGroups(result.groups, operationId, supabase);

    console.log(`[${operationId}] Groups fast sync completed successfully`);

    return json({
      success: true,
      categoryId,
      summary: {
        fetched: result.summary.fetched,
        upserted,
        skipped: result.summary.skipped,
        rateRPS: result.summary.rateRPS,
        rateUPS
      },
      operationId
    }, 200, req);

  } catch (error: any) {
    console.error(`[${operationId}] Groups fast sync error:`, error);

    return json({
      success: false,
      categoryId: null,
      summary: { fetched: 0, upserted: 0, skipped: 0 },
      error: error?.message || "Unknown error",
      operationId
    }, 500, req);
  }
});