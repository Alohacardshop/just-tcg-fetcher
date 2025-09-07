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

const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer';

type FetchKind = 'csv' | 'json';

const CASE_VARIANTS = {
  groups: (categoryId: number) => [
    `${TCGCSV_BASE}/${categoryId}/Groups.csv`, // preferred
    `${TCGCSV_BASE}/${categoryId}/groups.csv`, // lowercase fallback
  ]
};

async function fetchCsvWithFallback(kind: 'groups', id: number) {
  const headers = {
    'Accept': 'text/csv, */*',
    'Cache-Control': 'no-cache',
    'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)',
    'Referer': 'https://tcgcsv.com/'
  };
  const variants = CASE_VARIANTS[kind](id);

  // Try CSV variants first
  for (const url of variants) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok && (res.headers.get('content-type') || '').includes('text/csv')) {
        return { kind: 'csv' as FetchKind, url, res };
      }
      if (res.status === 403 || res.status === 404) continue; // try next variant
    } catch (e) {
      continue; // try next variant
    }
  }

  // Fallback to JSON API if CSV paths are blocked/unavailable
  const jsonUrl = `${TCGCSV_BASE}/${id}/groups`;
  try {
    const jr = await fetch(jsonUrl, { 
      headers: { 
        'Accept': 'application/json', 
        'Cache-Control': 'no-cache', 
        'User-Agent': headers['User-Agent'] 
      } 
    });
    if (jr.ok && (jr.headers.get('content-type') || '').includes('application/json')) {
      return { kind: 'json' as FetchKind, url: jsonUrl, res: jr };
    }
  } catch (e) {
    // JSON fallback failed too
  }

  // Surface a helpful error payload
  return { 
    kind: 'csv' as FetchKind, 
    url: variants[0], 
    res: new Response(null, { status: 502, statusText: 'CSV_AND_JSON_UNAVAILABLE' }) 
  };
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
    if (this.buffer.trim()) {
      return this.parseChunk('\n');
    }
    return [];
  }
  
  getRowCount(): number {
    return this.rowCount;
  }
}

function processGroupRow(row: any, categoryId: number): any | null {
  const groupIdCol = Object.keys(row).find(k => 
    k.includes('groupid') || k.includes('group_id')
  );
  const nameCol = Object.keys(row).find(k => 
    k.includes('groupname') || k.includes('name')
  );
  
  if (!groupIdCol || !nameCol) {
    return null;
  }
  
  const groupId = Number(row[groupIdCol]);
  const name = row[nameCol];
  
  if (!Number.isFinite(groupId) || !name) {
    return null;
  }
  
  const abbreviationCol = Object.keys(row).find(k => 
    k.includes('abbreviation')
  );
  const releaseDateCol = Object.keys(row).find(k => 
    k.includes('releasedate') || k.includes('release_date')
  );
  const sealedProductCol = Object.keys(row).find(k => 
    k.includes('sealedproduct') || k.includes('sealed_product')
  );
  const isSupplementalCol = Object.keys(row).find(k => 
    k.includes('issupplemental') || k.includes('is_supplemental')
  );
  const slugCol = Object.keys(row).find(k => 
    k.includes('slug')
  );
  
  return {
    group_id: groupId,
    category_id: categoryId,
    name: name,
    abbreviation: abbreviationCol ? row[abbreviationCol] || null : null,
    release_date: releaseDateCol ? row[releaseDateCol] || null : null,
    is_supplemental: isSupplementalCol ? toBool(row[isSupplementalCol]) : null,
    sealed_product: sealedProductCol ? toBool(row[sealedProductCol]) : null,
    url_slug: slugCol ? row[slugCol] || kebab(name) : kebab(name),
    updated_at: new Date().toISOString()
  };
}

async function fetchAndParseGroups(categoryId: number, operationId: string) {
  const startTime = Date.now();
  
  try {
    console.log(`[${operationId}] Starting groups fetch for category ${categoryId}`);
    
    const { kind, url, res } = await fetchCsvWithFallback('groups', categoryId);
    
    console.log(`[${operationId}] Fetch result: kind=${kind}, url=${url}, status=${res.status}`);
    
    if (!res.ok) {
      if (res.status === 403) {
        return {
          success: false,
          categoryId,
          error: 'CSV_ACCESS_FORBIDDEN',
          hint: { 
            code: 'HTTP_403', 
            sample: 'Access forbidden. Tried both Groups.csv and groups.csv variants.',
            headers: Object.fromEntries([...res.headers.entries()].slice(0, 5))
          }
        };
      }
      if (res.status === 502 && res.statusText === 'CSV_AND_JSON_UNAVAILABLE') {
        return {
          success: false,
          categoryId,
          error: 'CSV_AND_JSON_UNAVAILABLE',
          hint: { code: 'BOTH_UNAVAILABLE', sample: 'Neither CSV nor JSON endpoints accessible' }
        };
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentLength = res.headers.get('content-length');
    console.log(`[${operationId}] Response received: ${res.status}, Content-Length: ${contentLength}, Kind: ${kind}`);

    const normalized: any[] = [];
    let skipped = 0;
    
    if (kind === 'csv') {
      // Stream parse CSV
      const parser = new StreamingCSVParser();
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Failed to get response reader');
      
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const rows = parser.parseChunk(chunk);
        
        for (const row of rows) {
          const processedRow = processGroupRow(row, categoryId);
          if (processedRow) {
            normalized.push(processedRow);
          } else {
            skipped++;
          }
        }
      }
      
      // Process any remaining data
      const finalRows = parser.finalize();
      for (const row of finalRows) {
        const processedRow = processGroupRow(row, categoryId);
        if (processedRow) {
          normalized.push(processedRow);
        } else {
          skipped++;
        }
      }
    } else {
      // Parse JSON
      const jsonData = await res.json();
      const rows = Array.isArray(jsonData) ? jsonData : jsonData?.results ?? [];
      
      for (const row of rows) {
        const processedRow = processGroupRow(row, categoryId);
        if (processedRow) {
          normalized.push(processedRow);
        } else {
          skipped++;
        }
      }
    }
    
    const totalTime = Date.now() - startTime;
    const rateRPS = normalized.length > 0 ? Math.round((normalized.length / totalTime) * 1000) : 0;
    
    console.log(`[${operationId}] Parsed ${normalized.length} groups in ${totalTime}ms (${rateRPS} rows/sec), skipped ${skipped}, used ${kind} source`);
    
    return {
      success: true,
      categoryId,
      groups: normalized,
      usedFallback: kind === 'json',
      sourceUrl: url,
      summary: {
        fetched: normalized.length + skipped,
        upserted: 0, // Will be set after DB operation
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
    
    if (!Number.isFinite(categoryId)) {
      return json({
        success: false,
        error: 'INVALID_CATEGORY_ID',
        hint: { code: 'VALIDATION_ERROR', sample: 'categoryId must be a finite number' }
      }, 400, req);
    }

    console.log(`[${operationId}] Starting TCGCSV groups fast CSV sync for category ${categoryId}`);

    const result = await fetchAndParseGroups(categoryId, operationId);
    
    if (!result.success) {
      return json({
        success: false,
        categoryId,
        summary: { fetched: 0, upserted: 0, skipped: 0 },
        error: result.error,
        hint: result.hint,
        operationId
      }, 200, req);
    }
    
    const { upserted, rateUPS } = await batchUpsertGroups(result.groups, operationId, supabase);

    console.log(`[${operationId}] Groups fast sync completed successfully`);

    return json({
      success: true,
      categoryId,
      groupsCount: upserted,
      usedFallback: result.usedFallback,
      sourceUrl: result.sourceUrl,
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
      summary: { fetched: 0, upserted: 0, skipped: 0 },
      error: error?.message || "Unknown error",
      operationId
    }, 500, req);
  }
});