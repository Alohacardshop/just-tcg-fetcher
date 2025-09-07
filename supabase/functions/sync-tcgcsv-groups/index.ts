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
  const urls = [
    `https://tcgcsv.com/tcgplayer/${categoryId}/groups`, // Primary: path-style
    `https://tcgcsv.com/tcgplayer/groups?categoryId=${categoryId}` // Fallback: query-style
  ];

  for (const url of urls) {
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      try {
        attempt++;
        await logToSyncLogs(supabase, operationId, 'info', `Fetching groups from ${url} (attempt ${attempt})`);

        // Fetch with timeout and proper headers
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, { 
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)'
          },
          signal: controller.signal 
        });
        clearTimeout(timeout);

        // Extract response metadata
        const status = response.status;
        const contentType = response.headers.get('content-type') || '';
        const contentLength = response.headers.get('content-length') || '';
        const cfCacheStatus = response.headers.get('cf-cache-status') || '';
        const age = response.headers.get('age') || '';

        let parsedAs = 'unknown';

        console.log("TCGCSV groups HTTP response", { url, status, contentType, contentLength, parsedAs });
        await logToSyncLogs(supabase, operationId, 'info', `HTTP response: ${status}`, { 
          url, status, contentType, contentLength, cfCacheStatus, age 
        });

        if (!response.ok) {
          if (attempt < maxAttempts) {
            const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue;
          }
          // If this is the last attempt for this URL, try next URL
          if (url !== urls[urls.length - 1]) {
            await logToSyncLogs(supabase, operationId, 'warning', `HTTP ${response.status} for ${url}, trying next URL`);
            break;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        // Try to parse JSON
        let json: any;
        
        try {
          json = await response.json();
          parsedAs = 'json';
        } catch (jsonError) {
          // If JSON parsing fails, read as text and classify
          const text = await response.text().catch(() => "");
          
          if (text.trim().startsWith('<')) {
            parsedAs = 'html';
          } else if (text.trim() === '') {
            parsedAs = 'empty';
          } else if (text.includes(',') && !text.includes('{') && !text.includes('[')) {
            parsedAs = 'csv';
          } else {
            parsedAs = 'unknown';
          }
          
          console.log("Non-JSON response", { url, status, contentType, parsedAs, sampleText: text.slice(0, 100) });
          
          if (attempt < maxAttempts) {
            console.warn(`JSON parse failed (${parsedAs}) on attempt ${attempt}, retrying...`);
            const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue;
          }
          
          // If this is the last URL and last attempt, return error
          if (url === urls[urls.length - 1]) {
            const hint = {
              code: parsedAs === 'html' ? 'HTML_BODY' : 
                    parsedAs === 'empty' ? 'EMPTY_BODY' :
                    parsedAs === 'csv' ? 'CSV_BODY' : 
                    'UNKNOWN_NON_JSON',
              sample: text.slice(0, 300),
              headers: { contentType, contentLength, cfCacheStatus, age }
            };
            
            await logToSyncLogs(supabase, operationId, 'error', 'Non-JSON response after all retries', hint);
            return { 
              success: false, 
              categoryId,
              groups: [], 
              groupsCount: 0, 
              skipped: 0,
              error: 'NON_JSON_BODY', 
              hint 
            };
          }
          
          // Try next URL
          break;
        }

        // Enhanced parsing with case-insensitive handling
        console.log('Envelope keys', Object.keys(json || {}));
        
        // Create lowercase version for fallback matching
        const lower = json && typeof json === 'object'
          ? Object.fromEntries(Object.entries(json).map(([k,v]) => [k.toLowerCase(), v]))
          : {};

        // Log diagnostic counts
        console.log('Counts', {
          resultsCount: Array.isArray(json?.results) ? json.results.length : 0,
          ResultsCount: Array.isArray(json?.Results) ? json.Results.length : 0,
          groupsCount: Array.isArray(json?.groups) ? json.groups.length : 0,
          dataCount: Array.isArray(json?.data) ? json.data.length : 0,
          lowerResults: Array.isArray(lower?.results) ? lower.results.length : 0
        });

        // Enhanced group extraction with comprehensive fallbacks
        let groups: any[] = [];
        let parseSource = '';
        
        // Primary: results array (lowercase or uppercase)
        if (Array.isArray(json?.results) && json.results.length > 0) {
          groups = json.results;
          parseSource = 'json.results';
        } else if (Array.isArray(json?.Results) && json.Results.length > 0) {
          groups = json.Results;
          parseSource = 'json.Results';
        } else if (Array.isArray(lower?.results) && lower.results.length > 0) {
          groups = lower.results;
          parseSource = 'lower.results';
        }
        // Sometimes results can be an object with 'data' or 'groups'
        else if (Array.isArray(json?.results?.data) && json.results.data.length > 0) {
          groups = json.results.data;
          parseSource = 'json.results.data';
        } else if (Array.isArray(json?.results?.groups) && json.results.groups.length > 0) {
          groups = json.results.groups;
          parseSource = 'json.results.groups';
        } else if (Array.isArray(lower?.results?.data) && lower.results.data.length > 0) {
          groups = lower.results.data;
          parseSource = 'lower.results.data';
        } else if (Array.isArray(lower?.results?.groups) && lower.results.groups.length > 0) {
          groups = lower.results.groups;
          parseSource = 'lower.results.groups';
        }
        // Fallbacks: top-level arrays or common container keys
        else if (Array.isArray(json) && json.length > 0) {
          groups = json;
          parseSource = 'bare_array';
        } else if (Array.isArray(json?.groups) && json.groups.length > 0) {
          groups = json.groups;
          parseSource = 'json.groups';
        } else if (Array.isArray(json?.data) && json.data.length > 0) {
          groups = json.data;
          parseSource = 'json.data';
        } else if (Array.isArray(lower?.groups) && lower.groups.length > 0) {
          groups = lower.groups;
          parseSource = 'lower.groups';
        } else if (Array.isArray(lower?.data) && lower.data.length > 0) {
          groups = lower.data;
          parseSource = 'lower.data';
        }

        // Final safety check
        if (!Array.isArray(groups)) {
          groups = [];
        }

        await logToSyncLogs(supabase, operationId, 'info', `Parsed groups from ${parseSource}`, {
          parseSource,
          envelopeKeys: Object.keys(json || {}),
          finalGroupsCount: groups.length,
          url
        });

        // Log sample group for debugging
        if (Array.isArray(groups) && groups[0]) {
          const sampleKeys = Object.keys(groups[0]).slice(0, 10);
          console.log('Sample group keys', sampleKeys);
          await logToSyncLogs(supabase, operationId, 'info', 'Sample group structure', { 
            sampleKeys,
            firstGroup: groups[0],
            totalCount: groups.length 
          });
        }

        // Enhanced normalization with better field extraction
        const normalized: any[] = [];
        let skipped = 0;
        
        if (Array.isArray(groups)) {
          for (const g of groups) {
            // Skip items missing required fields
            const groupId = g?.groupId ?? g?.id;
            const name = g?.name ?? g?.displayName ?? g?.seoName;
            
            if (!groupId || !name) {
              skipped++;
              continue;
            }
            
            const normalizedGroup = {
              group_id: Number(groupId),
              category_id: categoryId,
              name: String(name),
              abbreviation: g.abbreviation ?? null,
              release_date: g.releaseDate ? new Date(g.releaseDate).toISOString() : null,
              is_supplemental: g.isSupplemental ?? null,
              sealed_product: g.sealedProduct ?? null,
              url_slug: g.slug ?? String(name)
                .toLowerCase()
                .trim()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, ''),
              updated_at: new Date().toISOString()
            };
            
            normalized.push(normalizedGroup);
          }
        }

        await logToSyncLogs(supabase, operationId, 'info', `Normalized ${normalized.length} groups, skipped ${skipped} from ${url}`);

        if (normalized.length === 0) {
          // If no groups found, try next URL if available
          if (url !== urls[urls.length - 1]) {
            await logToSyncLogs(supabase, operationId, 'info', `No groups found at ${url}, trying next URL`);
            break; // Break from attempt loop to try next URL
          }
          
          return { 
            success: true, 
            categoryId,
            groups: [], 
            groupsCount: 0, 
            skipped,
            note: `No groups returned for category ${categoryId}`,
            parseSource
          };
        }

        return { 
          success: true, 
          categoryId,
          groups: normalized, 
          groupsCount: normalized.length, 
          skipped,
          url, // Include which URL worked
          parseSource // Include which parsing path worked
        };

      } catch (error: any) {
        if (attempt < maxAttempts) {
          console.warn(`Attempt ${attempt} failed for ${url}:`, error.message);
          const backoff = [250, 750, 1500][attempt - 1] + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        
        // If this is the last URL, throw the error
        if (url === urls[urls.length - 1]) {
          await logToSyncLogs(supabase, operationId, 'error', 'Failed to fetch TCGCSV groups after all URLs and retries', { 
            error: error.message,
            lastUrl: url
          });
          throw error;
        }
        
        // Try next URL
        await logToSyncLogs(supabase, operationId, 'warning', `Failed to fetch from ${url}, trying next URL`, { 
          error: error.message 
        });
        break; // Break from attempt loop to try next URL
      }
    }
  }
  
  throw new Error('All URLs exhausted');
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
      url: finalResult.url, // Include which URL worked
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
      skipped: 0,
      error: error?.message || "Unknown error",
      operationId
    }, { status: 500 });
  }
});