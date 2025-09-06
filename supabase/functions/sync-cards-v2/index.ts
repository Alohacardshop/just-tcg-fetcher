/**
 * Sync Cards V2 - Hardened with Defensive Guards
 * 
 * This function implements defensive programming patterns to prevent crashes
 * from undefined arrays, null responses, and other edge cases.
 * All shared code is included directly in this file as required for edge functions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

// ===== SHARED API HELPERS =====

/**
 * Gets the JustTCG API key from environment
 */
function getJustTCGApiKey(): string {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not configured in environment');
  }
  return apiKey;
}

/**
 * Normalizes game slugs for JustTCG API consistency
 */
function normalizeGameSlug(gameSlug: string): string {
  const normalized = gameSlug.toLowerCase().trim();
  const normalizationMap: Record<string, string> = {
    'pokemon-tcg': 'pokemon',
    'pokemon-english': 'pokemon',
    'pokemon-us': 'pokemon',
    'pokemon-en': 'pokemon',
    'pokemon-global': 'pokemon',
    'pokemon-international': 'pokemon',
    'pokemon-tcg-english': 'pokemon',
    'pokemon-jp': 'pokemon-japan',
    'pokemon-japanese': 'pokemon-japan',
    'pokemon-japan-tcg': 'pokemon-japan',
    'magic-the-gathering': 'magic',
    'mtg': 'magic',
    'magic-tcg': 'magic',
    'yugioh': 'yu-gi-oh',
    'yugioh-tcg': 'yu-gi-oh',
    'ygo': 'yu-gi-oh'
  };
  return normalizationMap[normalized] || normalized;
}

/**
 * Builds JustTCG API URL with proper base and parameters
 */
function buildUrl(path: string, params: Record<string, string | number> = {}): string {
  const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';
  const url = new URL(`${JUSTTCG_BASE_URL}/${path}`);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  
  return url.toString();
}

/**
 * Returns standardized authentication headers for JustTCG API
 */
function createJustTCGHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) {
    throw new Error('API key is required for JustTCG headers');
  }
  
  return {
    'X-API-Key': apiKey,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Supabase-Edge-Function/1.0'
  };
}

/**
 * Fetch with retry logic and proper error handling
 */
async function fetchJsonWithRetry(
  url: string,
  tries = 3,
  delay = 1000
): Promise<any> {
  const apiKey = getJustTCGApiKey();
  const headers = createJustTCGHeaders(apiKey);
  
  for (let attempt = 1; attempt <= tries; attempt++) {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 JustTCG API attempt ${attempt}/${tries}: ${url}`);
      
      const response = await fetch(url, { 
        method: 'GET',
        headers 
      });
      
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ JustTCG API success on attempt ${attempt} (${duration}ms)`);
        return data;
      } else {
        throw {
          status: response.status,
          message: `JustTCG API error: ${response.status} - ${response.statusText}`,
          response
        };
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (attempt === tries) {
        console.error(`❌ JustTCG API failed after ${tries} attempts (${duration}ms):`, error);
        throw error;
      } else {
        console.warn(`⚠️ JustTCG API attempt ${attempt} failed (${duration}ms), retrying in ${delay}ms:`, error.message || error);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
      }
    }
  }
}

// ===== JUSTTCG CLIENT =====

export interface JustTCGCardPage {
  data?: any[];
  cards?: any[];
  meta?: {
    hasMore?: boolean;
    total?: number;
    limit?: number;
    offset?: number;
  };
}

export class JustTCGClient {
  private apiKey: string;

  constructor() {
    this.apiKey = getJustTCGApiKey();
  }

  /**
   * Enhanced set resolution: DB code → JustTCG API fallback → retry logic
   */
  async resolveSetCode(gameSlug: string, setId: string, supabaseClient?: any): Promise<{ code: string; source: string }> {
    console.log(`🔍 Resolving set code for game=${gameSlug}, setId=${setId}`);

    try {
      // 1. Check if setId already looks like a short code (e.g., "10e", "som")
      const looksLikeCode = setId && setId.length <= 6 && !setId.includes(' ') && !/^[A-Z]/.test(setId);
      if (looksLikeCode) {
        console.log(`✅ setId already looks like a code: ${setId}`);
        return { code: setId, source: 'direct-code' };
      }

      // 2. Try to get code from our database first (if supabase client provided)
      if (supabaseClient) {
        const { data: setData } = await supabaseClient
          .from('sets')
          .select('code, jt_set_id, name')
          .eq('jt_set_id', setId)
          .maybeSingle();

        if (setData?.code) {
          console.log(`✅ Found code in DB: ${setData.code} for setId=${setId}`);
          return { code: setData.code, source: 'db-code' };
        }

        console.log(`📝 No code in DB for setId=${setId}, trying JustTCG API lookup`);
      }

      // 3. Fallback: Query JustTCG /sets to find the code by name matching
      const normalizedGame = normalizeGameSlug(gameSlug);
      console.log(`🔎 Searching JustTCG /sets for game=${normalizedGame}, setName=${setId}`);

      const searchTerms = [setId.toLowerCase().trim()];
      // Add common variations for Magic sets
      if (setId.includes('Edition')) {
        searchTerms.push(setId.replace(' Edition', '').toLowerCase().trim());
      }

      for (const searchTerm of searchTerms) {
        let offset = 0;
        const pageSize = 200;
        let page = 0;

        while (page < 5) { // Reduced safety cap
          page++;
          const url = buildUrl('sets', { game: normalizedGame, limit: pageSize, offset });
          console.log(`🔎 JustTCG sets lookup attempt ${page}: searching for "${searchTerm}"`);
          
          const response = await fetchJsonWithRetry(url);
          const items = (response?.data || response?.sets || response?.items || []) as any[];
          
          if (!Array.isArray(items) || items.length === 0) {
            console.log(`📭 No more sets found at page ${page}`);
            break;
          }

          console.log(`📋 Checking ${items.length} sets for match with: ${searchTerm}`);

          for (const set of items) {
            const candidateFields = [
              set?.id, 
              set?.name, 
              set?.code, 
              set?.slug, 
              set?.provider_id,
              set?.tcgplayer_id
            ].filter(Boolean).map((v: string) => String(v).toLowerCase().trim());

            if (candidateFields.includes(searchTerm)) {
              const foundCode = set?.code || set?.id || set?.provider_id;
              if (foundCode) {
                console.log(`🎯 Found matching set via JustTCG API: "${setId}" → code="${foundCode}"`);
                console.log(`📊 Match details:`, { name: set?.name, code: set?.code, id: set?.id });
                return { code: String(foundCode), source: 'justtcg-api' };
              }
            }
          }

          // Continue pagination
          offset += pageSize;
          if (items.length < pageSize) {
            console.log(`📄 Last page reached (${items.length} < ${pageSize})`);
            break;
          }
        }
      }

      console.log(`⚠️ No code found via DB or API, using original setId: ${setId}`);
      return { code: setId, source: 'fallback-original' };

    } catch (error: any) {
      console.warn(`⚠️ Error in set resolution, using original setId: ${setId}`, error?.message || error);
      return { code: setId, source: 'error-fallback' };
    }
  }

      console.log(`⚠️ No code found via DB or API, using original setId: ${setId}`);
      return { code: setId, source: 'fallback-original' };

    } catch (error: any) {
      console.warn(`⚠️ Error in set resolution, using original setId: ${setId}`, error?.message || error);
      return { code: setId, source: 'error-fallback' };
    }
  }

  /**
   * Enhanced cards fetching with proper set code resolution
   * Supports both limit/offset and page/pageSize pagination
   */
  async* getCards(gameId: string, setId: string, pageSize = 100, supabaseClient?: any): AsyncGenerator<any[], void, unknown> {
    console.log(`🃏 Starting enhanced JustTCGClient.getCards for ${gameId}/${setId} (pageSize: ${pageSize})`);
    
    const normalizedGameId = normalizeGameSlug(gameId);
    
    // Enhanced set resolution
    const { code: resolvedSetCode, source } = await this.resolveSetCode(gameId, setId, supabaseClient);
    console.log(`🎯 Set resolution: "${setId}" → "${resolvedSetCode}" (source: ${source})`);
    
    let offset = 0;
    let page = 1; // Start with page 1 for page-based pagination
    let hasMore = true;
    let pageCount = 0;
    let expectedTotal: number | null = null;
    let paginationMode: 'offset' | 'page' = 'offset'; // Default to offset, switch if needed
    
    while (hasMore) {
      pageCount++;
      const startTime = Date.now();
      
      try {
        console.log(`📄 JustTCGClient fetching page ${pageCount} (${paginationMode} mode)`);
        
        // Try both pagination modes - start with limit/offset, fallback to page/pageSize
        let params: Record<string, string | number>;
        let url: string;
        
        if (paginationMode === 'offset') {
          params = {
            game: normalizedGameId,
            set: resolvedSetCode,
            limit: pageSize,
            offset: offset
          };
          url = buildUrl('cards', params);
          console.log(`📡 API call (offset mode): ${url}`);
        } else {
          params = {
            game: normalizedGameId,
            set: resolvedSetCode,
            pageSize: pageSize,
            page: page
          };
          url = buildUrl('cards', params);
          console.log(`📡 API call (page mode): ${url}`);
        }
        
        const response = await fetchJsonWithRetry(url);
        const duration = Date.now() - startTime;
        
        console.log(`📊 API Response (${duration}ms):`, {
          hasData: !!response?.data,
          dataLength: Array.isArray(response?.data) ? response.data.length : 'not array',
          hasMeta: !!response?.meta,
          status: response?.status || 'unknown'
        });
        
        // Extract data with defensive guards
        let pageData: any[] = [];
        if (response && typeof response === 'object') {
          const rawData = response.data || response.cards || response.items || [];
          pageData = Array.isArray(rawData) ? rawData : [];
        }
        
        // If first attempt with offset fails and returns 0 cards, try page mode
        if (pageCount === 1 && pageData.length === 0 && paginationMode === 'offset') {
          console.log(`🔄 No cards with offset mode, trying page/pageSize mode`);
          paginationMode = 'page';
          continue; // Retry with page mode
        }
        
        // Extract metadata
        const meta = (response && typeof response === 'object') 
          ? (response.meta || response._metadata || {}) 
          : {};
        
        // Store expected total from first page
        if (pageCount === 1 && typeof meta.total === 'number') {
          expectedTotal = meta.total;
          console.log(`📊 Expected total cards: ${expectedTotal}`);
        }
        
        console.log(`✅ Page ${pageCount} processed: ${pageData.length} cards (${duration}ms)`);
        console.log(`📈 Pagination meta:`, { hasMore: meta.hasMore, total: meta.total, currentPage: paginationMode === 'page' ? page : Math.floor(offset / pageSize) + 1 });
        
        // Always yield an array, even if empty
        yield pageData;
        
        // Check for end conditions
        if (pageData.length === 0) {
          console.log(`📭 Empty page received, stopping pagination`);
          break;
        }
        
        // Check meta.hasMore first (most reliable)
        if (meta.hasMore === false) {
          console.log(`🏁 meta.hasMore === false, pagination complete`);
          hasMore = false;
          break;
        }
        
        // Fallback: if we got fewer items than requested, assume we're done
        if (pageData.length < pageSize) {
          console.log(`🏁 Partial page (${pageData.length}/${pageSize}), assuming end of data`);
          hasMore = false;
          break;
        }
        
        // Update pagination parameters
        if (paginationMode === 'offset') {
          offset += pageData.length;
        } else {
          page += 1;
        }
        
        // Safety check: prevent infinite loops
        if (pageCount > 1000) {
          console.warn(`⚠️ Safety break: too many pages (${pageCount}), stopping`);
          break;
        }
        
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ JustTCGClient error fetching page ${pageCount} (${duration}ms):`, error.message || error);
        
        console.error(`🔍 Error context: gameId=${gameId}, setId=${setId}, resolvedCode=${resolvedSetCode}, page=${pageCount}`);
        
        // For first page errors, try switching pagination mode once
        if (pageCount === 1 && paginationMode === 'offset') {
          console.log(`🔄 First page failed with offset, trying page mode`);
          paginationMode = 'page';
          continue;
        }
        
        // For transient errors, yield empty and stop
        console.error(`❌ JustTCGClient stopping pagination due to error`);
        yield [];
        break;
      }
    }
    
    console.log(`📊 JustTCGClient pagination complete:`);
    console.log(`   Game: ${gameId} → ${normalizedGameId}`);
    console.log(`   Set: ${setId} → ${resolvedSetCode} (${source})`);
    console.log(`   Pages processed: ${pageCount}`);
    console.log(`   Expected total: ${expectedTotal || 'unknown'}`);
    console.log(`   Pagination mode: ${paginationMode}`);
  }
}

// ===== SYNC MANAGER =====

export interface SyncResult {
  success: boolean;
  jobId: string;
  message: string;
  stats: {
    totalProcessed: number;
    totalInserted: number;
    totalUpdated: number;
    totalErrors: number;
    pagesProcessed: number;
  };
}

export class SyncManager {
  private supabaseClient: any;

  constructor(supabaseClient: any) {
    this.supabaseClient = supabaseClient;
  }

  /**
   * Update sync progress with defensive guards
   */
  async updateProgress(jobId: string, processed: number, total: number): Promise<void> {
    try {
      const safeProcessed = typeof processed === 'number' ? processed : 0;
      const safeTotal = typeof total === 'number' ? total : 0;
      
      console.log(`📊 Sync progress for ${jobId}: ${safeProcessed}/${safeTotal}`);
      
      // Update set status with safe values
      await this.supabaseClient
        .from('sets')
        .update({ 
          cards_synced_count: safeProcessed,
          last_synced_at: new Date().toISOString()
        })
        .eq('jt_set_id', jobId);
        
    } catch (error) {
      console.error(`❌ Error updating progress for ${jobId}:`, error.message);
      // Don't throw - progress updates should not fail the sync
    }
  }

  /**
   * Process cards in batches with defensive guards
   */
  async batchProcess<T>(
    items: T[], 
    processor: (batch: T[]) => Promise<any>,
    batchSize = 50
  ): Promise<{ processed: number; errors: number }> {
    // Defensive guard for items array
    const safeItems = Array.isArray(items) ? items : [];
    const safeBatchSize = typeof batchSize === 'number' && batchSize > 0 ? batchSize : 50;
    
    let processed = 0;
    let errors = 0;
    
    console.log(`🔄 Processing ${safeItems.length} items in batches of ${safeBatchSize}`);
    
    for (let i = 0; i < safeItems.length; i += safeBatchSize) {
      const batch = safeItems.slice(i, i + safeBatchSize);
      
      try {
        await processor(batch);
        processed += batch.length;
        console.log(`✅ Processed batch ${Math.floor(i / safeBatchSize) + 1}: ${batch.length} items`);
      } catch (error) {
        errors += batch.length;
        console.error(`❌ Error processing batch starting at index ${i}:`, error.message);
        // Continue with next batch instead of failing completely
      }
    }
    
    return { processed, errors };
  }

  /**
   * Create sync result with defensive string formatting
   */
  createResult(
    success: boolean, 
    jobId: string, 
    message: string, 
    stats: Partial<SyncResult['stats']> = {}
  ): SyncResult {
    // Defensive guards for all stats
    const safeStats = {
      totalProcessed: typeof stats.totalProcessed === 'number' ? stats.totalProcessed : 0,
      totalInserted: typeof stats.totalInserted === 'number' ? stats.totalInserted : 0,
      totalUpdated: typeof stats.totalUpdated === 'number' ? stats.totalUpdated : 0,
      totalErrors: typeof stats.totalErrors === 'number' ? stats.totalErrors : 0,
      pagesProcessed: typeof stats.pagesProcessed === 'number' ? stats.pagesProcessed : 0
    };
    
    // Safe string formatting
    const safeJobId = typeof jobId === 'string' ? jobId : 'unknown';
    const safeMessage = typeof message === 'string' ? message : 'No message provided';
    
    return {
      success: Boolean(success),
      jobId: safeJobId,
      message: safeMessage,
      stats: safeStats
    };
  }

  /**
   * Update set status with defensive guards
   */
  async updateSetStatus(
    setId: string, 
    status: 'syncing' | 'completed' | 'error' | 'partial',
    error?: string,
    stats?: Partial<SyncResult['stats']>
  ): Promise<void> {
    try {
      const safeSetId = typeof setId === 'string' ? setId : '';
      const safeStatus = typeof status === 'string' ? status : 'error';
      const safeError = typeof error === 'string' ? error : null;
      
      const updateData: any = {
        sync_status: safeStatus,
        last_synced_at: new Date().toISOString()
      };
      
      if (safeError) {
        updateData.last_sync_error = safeError;
      } else if (safeStatus === 'completed') {
        updateData.last_sync_error = null;
      }
      
      if (stats && typeof stats.totalProcessed === 'number') {
        updateData.cards_synced_count = stats.totalProcessed;
      }
      
      await this.supabaseClient
        .from('sets')
        .update(updateData)
        .eq('jt_set_id', safeSetId);
        
      console.log(`📝 Updated set ${safeSetId} status to: ${safeStatus}`);
      
    } catch (error) {
      console.error(`❌ Error updating set status for ${setId}:`, error.message);
      // Don't throw - status updates should not fail the sync
    }
  }

  /**
   * Check for cancellation signals with defensive guards
   */
  async shouldCancel(operationId?: string): Promise<boolean> {
    try {
      const { data } = await this.supabaseClient
        .from('sync_control')
        .select('should_cancel')
        .or('operation_type.eq.force_stop,operation_type.eq.emergency_stop')
        .limit(1)
        .maybeSingle();
      
      const shouldStop = data?.should_cancel === true;
      
      if (shouldStop && operationId) {
        console.log(`🛑 Cancellation signal received for operation: ${operationId}`);
      }
      
      return shouldStop;
    } catch (error) {
      console.error('❌ Error checking cancellation status:', error.message);
      // If we can't check cancellation status, continue (don't fail the operation)
      return false;
    }
  }
}

// CORS headers for web app compatibility
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Handle CORS preflight requests
function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

interface SyncCardsRequest {
  setId?: string;
  game?: string;
  gameId?: string;
  operationId?: string;
  background?: boolean;
}

async function routeRequest(req: Request): Promise<Response> {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    let bodyText = await req.text();
    console.log('📦 raw body:', bodyText?.slice(0, 200));
    const body = (bodyText ? JSON.parse(bodyText) : {}) as SyncCardsRequest;

    // Accept game or gameId; normalize slugs (mtg -> magic)
    const rawGame = (body.game ?? body.gameId ?? '').toString().trim().toLowerCase();
    const normalizedGame = normalizeGameSlug(rawGame); // maps mtg, magic-the-gathering -> magic
    const rawSet = (body.setId ?? '').toString().trim();

    if (!rawSet) {
      return new Response(JSON.stringify({ code: 'MISSING_SET_ID', message: 'setId is required (provider id or set name)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!normalizedGame) {
      return new Response(JSON.stringify({ code: 'MISSING_GAME', message: 'game is required (e.g., "magic", "pokemon")' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const justKey = Deno.env.get('JUSTTCG_API_KEY');
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ code: 'MISSING_SUPABASE_CONFIG', message: 'Supabase config missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!justKey) {
      return new Response(JSON.stringify({ code: 'MISSING_API_KEY', message: 'JUSTTCG_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supa = createClient(supabaseUrl, supabaseKey);
    const syncManager = new SyncManager(supa);

    console.log(`🔍 Enhanced set resolution for game="${rawGame}" → "${normalizedGame}", setId="${rawSet}"`);

    // ---- Enhanced set resolution with comprehensive fallback ----
    const setKey = rawSet.toLowerCase();
    
    // First try exact jt_set_id match
    let { data: setRow, error: setErr } = await supa
      .from('sets')
      .select('id, jt_set_id, name, game_id, code')
      .eq('jt_set_id', setKey)
      .maybeSingle();

    console.log(`📊 DB lookup by jt_set_id="${setKey}":`, setRow ? 'found' : 'not found');

    if (!setRow) {
      // Try case-insensitive name matching
      const { data: guess } = await supa
        .from('sets')
        .select('id, jt_set_id, name, game_id, code')
        .ilike('name', setKey)
        .maybeSingle();

      console.log(`📊 DB lookup by name="${setKey}":`, guess ? 'found' : 'not found');
      setRow = guess ?? null;
    }

    if (!setRow) {
      return new Response(JSON.stringify({
        code: 'SET_NOT_FOUND',
        message: `Set not found in database. Searched for: jt_set_id="${setKey}" and name ilike "${setKey}". Available sets can be synced via 'Sync Sets' first.`,
        received: { game: normalizedGame, setId: rawSet }
      }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Use jt_set_id from sets table - the JustTCGClient will resolve this to proper code
    const resolvedSetId = setRow.jt_set_id;
    const dbCode = setRow.code;
    
    console.log(`✅ Set resolved: "${rawSet}" → jt_set_id="${resolvedSetId}", db_code="${dbCode || 'null'}"`);
    console.log(`🎯 Will use enhanced resolution in JustTCGClient.getCards()`);

    // background by default if requested
    const isBg = Boolean(body.background);
    if (isBg) {
      // @ts-ignore EdgeRuntime may not exist in types
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(syncCardsV2(supa, syncManager, resolvedSetId, body.operationId, normalizedGame));
      } else {
        syncCardsV2(supa, syncManager, resolvedSetId, body.operationId, normalizedGame).catch(e => console.error('bg sync failed', e));
      }
      return new Response(JSON.stringify({ started: true, setId: resolvedSetId }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = await syncCardsV2(supa, new SyncManager(supa), resolvedSetId, body.operationId, normalizedGame);
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('sync-cards-v2 top-level error:', e);
    return new Response(JSON.stringify({ code: 'UNHANDLED', message: e?.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function syncCardsV2(
  supabaseClient: any, 
  syncManager: SyncManager, 
  setId: string, 
  operationId?: string,
  providedGameId?: string
) {
  const jobId = setId; // Use setId as jobId for tracking
  let totalCards = 0;
  let processed = 0;
  let pagesProcessed = 0;
  let processedCards: any[] = [];

  try {
    console.log(`🎯 sync-cards-v2 starting for set: ${setId}`);

    // Update set status to syncing
    await syncManager.updateSetStatus(setId, 'syncing');

    // Get set and game data with defensive guards
    const { data: setData, error: setError } = await supabaseClient
      .from('sets')
      .select(`
        id, 
        game_id, 
        name,
        total_cards,
        games!inner(jt_game_id)
      `)
      .eq('jt_set_id', setId)
      .maybeSingle();

    if (setError || !setData) {
      const errorMsg = `Set not found: ${setId}`;
      await syncManager.updateSetStatus(setId, 'error', errorMsg);
      throw new Error(errorMsg);
    }

    // Extract data with defensive guards
    const gameId = (setData.games && typeof setData.games.jt_game_id === 'string') 
      ? setData.games.jt_game_id 
      : (typeof providedGameId === 'string' ? providedGameId : '');
    const setName = typeof setData.name === 'string' ? setData.name : setId;
    const expectedTotalCards = typeof setData.total_cards === 'number' ? setData.total_cards : 0;

    if (!gameId) {
      const errorMsg = `Invalid game data for set: ${setId}. Please ensure the set exists and has a valid game association.`;
      await syncManager.updateSetStatus(setId, 'error', errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`🎮 Syncing cards for game: ${gameId}, set: ${setName} (expected: ${expectedTotalCards} cards)`);

    // Check for cancellation before starting
    if (await syncManager.shouldCancel(operationId)) {
      const errorMsg = 'Sync cancelled by admin before starting';
      await syncManager.updateSetStatus(setId, 'error', errorMsg);
      throw new Error(errorMsg);
    }

    // ===== A. HARDENED PAGE LOOP WITH DEFENSIVE GUARDS =====
    console.log(`🔄 Starting hardened pagination loop for ${gameId}/${setId}`);
    
    // Ensure client instance in this scope
    const justTCGClient = new JustTCGClient();
    
    for await (const cardsPage of justTCGClient.getCards(gameId, setId, 100, supabaseClient)) {
      // ✅ Defensive guard: treat any non-array page as empty array
      const page = Array.isArray(cardsPage) ? cardsPage : [];
      totalCards += page.length;  // ✅ Safe - page is guaranteed to be array
      pagesProcessed++;
      
      console.log(`📄 Processing page ${pagesProcessed}: ${page.length} cards (total: ${totalCards})`);
      
      await syncManager.updateProgress(jobId, processed, totalCards);

      // Check for cancellation between pages
      if (await syncManager.shouldCancel(operationId)) {
        const errorMsg = `Sync cancelled by admin at page ${pagesProcessed}`;
        await syncManager.updateSetStatus(setId, 'error', errorMsg);
        throw new Error(errorMsg);
      }

      // Process cards in batches with defensive guards
      await syncManager.batchProcess(
        page,
        async (cardsBatch) => {
          // Defensive guard for batch
          const safeBatch = Array.isArray(cardsBatch) ? cardsBatch : [];
          
          if (safeBatch.length === 0) return;

          // Transform cards with defensive guards
          const transformedCards = safeBatch.map(card => {
            // Defensive guards for card properties
            const safeCard = card && typeof card === 'object' ? card : {};
            
            return {
              jt_card_id: typeof safeCard.id === 'string' ? safeCard.id : `unknown_${Date.now()}_${Math.random()}`,
              name: typeof safeCard.name === 'string' ? safeCard.name : 'Unknown Card',
              set_id: setData.id,
              game_id: setData.game_id,
              image_url: typeof safeCard.image === 'string' ? safeCard.image : null,
              rarity: typeof safeCard.rarity === 'string' ? safeCard.rarity : null,
              number: typeof safeCard.number === 'string' ? safeCard.number : null,
              data: safeCard,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
          });

          // Insert/update cards
          const { data: upsertedCards, error: upsertError } = await supabaseClient
            .from('cards')
            .upsert(transformedCards, { 
              onConflict: 'jt_card_id',
              ignoreDuplicates: false 
            })
            .select('id');

          if (upsertError) {
            console.error('❌ Error upserting cards batch:', upsertError);
            throw upsertError;
          }

          // Accumulate processed cards with defensive guards
          const safeUpserted = Array.isArray(upsertedCards) ? upsertedCards : [];
          processedCards.push(...safeUpserted);
          processed += safeBatch.length;
          
          console.log(`✅ Processed batch: ${safeBatch.length} cards (total processed: ${processed})`);
        }
      );
    }

    // Final validation and status update with defensive guards
    const finalProcessedCount = processedCards?.length ?? 0;
    const wasSuccessful = finalProcessedCount > 0;
    
    if (wasSuccessful) {
      await syncManager.updateSetStatus(setId, 'completed', undefined, {
        totalProcessed: finalProcessedCount,
        pagesProcessed
      });
    } else {
      const errorMsg = 'No cards were processed successfully';
      await syncManager.updateSetStatus(setId, 'error', errorMsg);
    }

    // ===== B. HARDENED SUCCESS LOGGING WITH NULL-SAFE COUNTS =====
    const cardsCount = processedCards?.length ?? 0;
    const successMessage = `Successfully synced ${cardsCount} cards for set ${setId}`;
    
    return syncManager.createResult(
      wasSuccessful,
      jobId,
      successMessage,
      {
        totalProcessed: cardsCount,
        totalInserted: cardsCount, // In upsert scenario, consider all as inserts for simplicity
        totalUpdated: 0,
        totalErrors: Math.max(0, totalCards - cardsCount),
        pagesProcessed
      }
    );

  } catch (error) {
    console.error(`❌ Error in syncCardsV2 for set ${setId}:`, error);
    
    // ===== B. HARDENED ERROR LOGGING WITH NULL-SAFE COUNTS =====
    const cardsCount = processedCards?.length ?? 0;
    const errorMessage = `Failed to sync cards for set ${setId}: ${typeof error?.message === 'string' ? error.message : 'Unknown error'}`;
    
    await syncManager.updateSetStatus(setId, 'error', errorMessage);
    
    return syncManager.createResult(
      false,
      jobId,
      errorMessage,
      {
        totalProcessed: cardsCount,
        totalInserted: 0,
        totalUpdated: 0,
        totalErrors: Math.max(0, totalCards - cardsCount),
        pagesProcessed
      }
    );
  }
}

// ===== PATTERN A: INLINE CALLBACK =====
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await routeRequest(req);
  } catch (error) {
    console.error('🚨 Unhandled error in sync-cards-v2:', error);
    return new Response(
      JSON.stringify({ error: "Internal error", message: (error as Error)?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});