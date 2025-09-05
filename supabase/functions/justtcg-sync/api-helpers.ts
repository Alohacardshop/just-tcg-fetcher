import { 
  logStructured, 
  logOperationStart, 
  logOperationSuccess, 
  logOperationError, 
  logRetryAttempt, 
  logTimeout,
  logPaginationProgress,
  createTimer 
} from './telemetry.ts';

/**
 * JustTCG API Helper Functions
 * Self-contained for Supabase edge function compatibility
 */

const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';

/**
 * Gets the JustTCG API key from environment
 * Throws if the key is missing
 */
function getApiKey(): string {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not configured in environment');
  }
  return apiKey;
}

/**
 * Normalizes game slugs for JustTCG API consistency
 * Handles known variations and edge cases
 */
export function normalizeGameSlug(game: string): string {
  if (!game || typeof game !== 'string') {
    throw new Error('Game slug is required and must be a string');
  }
  
  const normalized = game.toLowerCase().trim();
  
  switch (normalized) {
    case 'pokemon-tcg':
    case 'pokemon-english':
    case 'pokemon-us':
      return 'pokemon';
    case 'pokemon-jp':
    case 'pokemon-japanese':
      return 'pokemon-japan';
    case 'magic':
    case 'magic-the-gathering':
    case 'mtg-english':
      return 'mtg';
    case 'one-piece':
    case 'one-piece-tcg':
      return 'one-piece-card-game';
    case 'lorcana':
    case 'disney-lorcana-tcg':
      return 'disney-lorcana';
    case 'star-wars':
    case 'swu':
      return 'star-wars-unlimited';
    default:
      return normalized;
  }
}

/**
 * Builds JustTCG API URL with proper base and parameters
 */
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(`${JUSTTCG_BASE_URL}/${path}`);
  
  if (params) {
    if (params.game) {
      params.game = normalizeGameSlug(params.game.toString());
    }
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value.toString());
    });
  }
  
  return url.toString();
}

/**
 * Returns standardized authentication headers for JustTCG API
 * Uses exact header key 'x-api-key' as required
 */
export function authHeaders(): HeadersInit {
  const apiKey = getApiKey();
  
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json'
  };
}

/**
 * Unified fetch helper with timeout and exponential backoff
 * Handles retries on 429/5xx errors with proper error formatting
 */
export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit = {},
  options: { tries?: number; timeoutMs?: number; baseDelayMs?: number } = {}
): Promise<any> {
  const { tries = 5, timeoutMs = 90000, baseDelayMs = 400 } = options;
  
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= tries; attempt++) {
    const startTime = Date.now();
    let timedOut = false;
    
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      
      console.log(`🔄 JustTCG API attempt ${attempt}/${tries}: ${url}`);
      
      const response = await fetch(url, {
        ...init,
        headers: {
          ...authHeaders(),
          ...init.headers
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`✅ JustTCG API success on attempt ${attempt} (${duration}ms)`);
        return await response.json();
      }
      
      // Handle non-ok responses
      const body = await response.text();
      const error = {
        status: response.status,
        message: `JustTCG API error: ${response.status} - ${response.statusText}`,
        body: body.substring(0, 500) // Body snippet for debugging
      };
      
      // Retry on 429 (rate limit) or 5xx (server errors)
      if (response.status === 429 || response.status >= 500) {
        lastError = error;
        
        console.warn(`⚠️ Retryable error on attempt ${attempt} (${duration}ms): ${error.status} - ${body.substring(0, 100)}`);
        
        if (attempt < tries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`⏰ Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      } else {
        // Non-retryable error
        console.error(`❌ Non-retryable error on attempt ${attempt} (${duration}ms): ${error.status}`);
        throw error;
      }
      
    } catch (networkError) {
      const duration = Date.now() - startTime;
      
      if (networkError.name === 'AbortError' || timedOut) {
        lastError = {
          status: 408,
          message: `Request timed out after ${timeoutMs}ms`,
          body: 'Timeout'
        };
        console.error(`⏰ Timeout on attempt ${attempt} (${duration}ms)`);
      } else if (networkError.status) {
        // Already formatted error from above
        throw networkError;
      } else {
        lastError = {
          status: 0,
          message: `Network error: ${networkError.message}`,
          body: networkError.message
        };
        console.error(`❌ Network error on attempt ${attempt} (${duration}ms):`, networkError.message);
      }
      
      if (attempt < tries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`⏰ Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  console.error(`💥 All ${tries} attempts failed for ${url}`);
  throw lastError || {
    status: 0,
    message: 'All retry attempts failed',
    body: 'Unknown error'
  };
}

/**
 * Complete pagination for sets - loops until meta.hasMore === false
 * Returns all sets for a given game with proper accumulation across pages
 */
export async function listAllSets(gameId: string, pageSize: number = 100): Promise<any[]> {
  console.log(`📚 Starting complete sets pagination for game: ${gameId} (pageSize: ${pageSize})`);
  
  let allSets: any[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  let expectedTotal: number | null = null;
  
  while (hasMore) {
    pageCount++;
    const startTime = Date.now();
    
    try {
      console.log(`📄 Fetching sets page ${pageCount} (offset: ${offset}, limit: ${pageSize})`);
      
      const url = buildUrl('sets', {
        game: gameId,
        limit: pageSize,
        offset: offset
      });
      
      const response = await fetchJsonWithRetry(url);
      const duration = Date.now() - startTime;
      
      // Extract data and metadata
      const pageData = response.data || response.sets || [];
      const meta = response.meta || response._metadata || {};
      
      // Store expected total from first page
      if (pageCount === 1 && meta.total !== undefined) {
        expectedTotal = meta.total;
        console.log(`📊 Expected total sets: ${expectedTotal}`);
      }
      
      console.log(`✅ Page ${pageCount} fetched: ${pageData.length} sets (${duration}ms)`);
      console.log(`📈 Meta info - hasMore: ${meta.hasMore}, total: ${meta.total}, limit: ${meta.limit}, offset: ${meta.offset}`);
      
      if (pageData.length === 0) {
        console.log(`📭 Empty page received, stopping pagination`);
        break;
      }
      
      // Accumulate data
      allSets.push(...pageData);
      
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
      
      // Update offset for next page
      offset += pageData.length;
      
      // Safety check: if we've reached expected total, stop
      if (expectedTotal !== null && allSets.length >= expectedTotal) {
        console.log(`🏁 Reached expected total (${allSets.length}/${expectedTotal}), stopping`);
        hasMore = false;
        break;
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Error fetching sets page ${pageCount} (${duration}ms):`, error.message);
      
      // If we have some data, return what we got; otherwise re-throw
      if (allSets.length > 0) {
        console.warn(`⚠️ Partial data recovered: ${allSets.length} sets from ${pageCount - 1} successful pages`);
        break;
      } else {
        throw error;
      }
    }
  }
  
  console.log(`📊 Sets pagination complete for ${gameId}:`);
  console.log(`   Total sets fetched: ${allSets.length}`);
  console.log(`   Pages processed: ${pageCount}`);
  console.log(`   Expected total: ${expectedTotal || 'unknown'}`);
  
  // Validate against expected total if available
  if (expectedTotal !== null && allSets.length !== expectedTotal) {
    console.warn(`⚠️ Count mismatch: fetched ${allSets.length}, expected ${expectedTotal}`);
  } else if (expectedTotal !== null) {
    console.log(`✅ Count matches expected total: ${allSets.length}`);
}

/**
 * Complete pagination for cards by set - loops until meta.hasMore === false
 * Returns all cards for a given game/set with optional ordering support
 */
export async function listAllCardsBySet({
  gameId,
  setId,
  pageSize = 100,
  orderBy,
  order
}: {
  gameId: string;
  setId: string;
  pageSize?: number;
  orderBy?: 'price' | '24h' | '7d' | '30d';
  order?: 'asc' | 'desc';
}): Promise<any[]> {
  console.log(`🃏 Starting complete cards pagination for ${gameId}/${setId} (pageSize: ${pageSize}, orderBy: ${orderBy}, order: ${order})`);
  
  let allCards: any[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  let expectedTotal: number | null = null;
  
  while (hasMore) {
    pageCount++;
    const startTime = Date.now();
    
    try {
      console.log(`📄 Fetching cards page ${pageCount} (offset: ${offset}, limit: ${pageSize})`);
      
      // Build query parameters
      const params: Record<string, string | number> = {
        game: gameId,
        set: setId,
        limit: pageSize,
        offset: offset
      };
      
      // Add ordering parameters if specified (only for game/set queries, not search)
      if (orderBy) {
        params.orderBy = orderBy;
      }
      if (order) {
        params.order = order;
      }
      
      const url = buildUrl('cards', params);
      
      const response = await fetchJsonWithRetry(url);
      const duration = Date.now() - startTime;
      
      // Extract data and metadata
      const pageData = response.data || response.cards || [];
      const meta = response.meta || response._metadata || {};
      
      // Store expected total from first page
      if (pageCount === 1 && meta.total !== undefined) {
        expectedTotal = meta.total;
        console.log(`📊 Expected total cards: ${expectedTotal}`);
      }
      
      console.log(`✅ Page ${pageCount} fetched: ${pageData.length} cards (${duration}ms)`);
      console.log(`📈 Meta info - hasMore: ${meta.hasMore}, total: ${meta.total}, limit: ${meta.limit}, offset: ${meta.offset}`);
      
      if (pageData.length === 0) {
        console.log(`📭 Empty page received, stopping pagination`);
        break;
      }
      
      // Accumulate data
      allCards.push(...pageData);
      
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
      
      // Update offset for next page
      offset += pageData.length;
      
      // Safety check: if we've reached expected total, stop
      if (expectedTotal !== null && allCards.length >= expectedTotal) {
        console.log(`🏁 Reached expected total (${allCards.length}/${expectedTotal}), stopping`);
        hasMore = false;
        break;
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Error fetching cards page ${pageCount} (${duration}ms):`, error.message);
      
      // If we have some data, return what we got; otherwise re-throw
      if (allCards.length > 0) {
        console.warn(`⚠️ Partial data recovered: ${allCards.length} cards from ${pageCount - 1} successful pages`);
        break;
      } else {
        throw error;
      }
    }
  }
  
  console.log(`📊 Cards pagination complete for ${gameId}/${setId}:`);
  console.log(`   Total cards fetched: ${allCards.length}`);
  console.log(`   Pages processed: ${pageCount}`);
  console.log(`   Expected total: ${expectedTotal || 'unknown'}`);
  console.log(`   Ordering: ${orderBy ? `${orderBy} ${order || 'asc'}` : 'default'}`);
  
  // Validate against expected total if available
  if (expectedTotal !== null && allCards.length !== expectedTotal) {
    console.warn(`⚠️ Count mismatch: fetched ${allCards.length}, expected ${expectedTotal}`);
  } else if (expectedTotal !== null) {
    console.log(`✅ Count matches expected total: ${allCards.length}`);
  }
  
  return allCards;
}
  
  return allSets;
}

/**
 * JustTCG API Helper Functions
 * Normalizes API header usage and ensures server-only key access
 */

/**
 * Makes a GET request to the JustTCG API with proper headers
 * @deprecated Use fetchJsonWithRetry instead for better error handling
 */
export async function fetchFromJustTCG(url: string): Promise<Response> {
  console.log(`Making JustTCG API call to: ${url}`);
  
  try {
    const data = await fetchJsonWithRetry(url);
    // Convert back to Response-like object for backwards compatibility
    return {
      ok: true,
      json: () => Promise.resolve(data)
    } as Response;
  } catch (error) {
    console.error(`JustTCG API error: ${error.status} - ${error.message}`);
    throw new Error(`JustTCG API error: ${error.status} - ${error.message}`);
  }
}
/**
 * Probes for English-only sets when Pokemon Japan returns empty results
 * Checks if the same set exists under the regular 'pokemon' game
 */
export async function probeEnglishOnlySet(
  setName: string
): Promise<{ hasEnglishCards: boolean; cardCount: number }> {
  console.log(`🔍 Probing for English-only cards in set: ${setName}`);
  
  try {
    // Probe page 1 of the same set under regular 'pokemon'
    const probeUrl = buildUrl('cards', { 
      game: 'pokemon', // Use regular pokemon, not pokemon-japan
      set: setName,
      limit: 1,
      offset: 0
    });
    
    const response = await fetchJsonWithRetry(
      probeUrl,
      {},
      { tries: 3, baseDelayMs: 300, timeoutMs: 30000 } // Faster probe
    );
    
    const { data: probeCards } = extractDataFromEnvelope(response);
    const hasEnglishCards = probeCards.length > 0;
    
    if (hasEnglishCards) {
      console.log(`✅ Found English cards for set: ${setName} under 'pokemon' game`);
      
      // Get rough count by checking if there are more than 1 card
      const countUrl = buildUrl('cards', { 
        game: 'pokemon',
        set: setName,
        limit: 200,
        offset: 0
      });
      
      const countResponse = await fetchJsonWithRetry(
        countUrl,
        {},
        { tries: 2, baseDelayMs: 300, timeoutMs: 30000 }
      );
      
      const { data: countCards } = extractDataFromEnvelope(countResponse);
      console.log(`📊 Estimated ${countCards.length}+ English cards found for set: ${setName}`);
      
      return { hasEnglishCards: true, cardCount: countCards.length };
    } else {
      console.log(`❌ No English cards found for set: ${setName}`);
      return { hasEnglishCards: false, cardCount: 0 };
    }
    
  } catch (error) {
    console.warn(`⚠️ Error probing English-only set ${setName}:`, error.message);
    return { hasEnglishCards: false, cardCount: 0 };
  }
}
interface PaginationOptions {
  limit?: number;
  maxPages?: number;
  timeoutMs?: number;
  retryOptions?: { tries?: number; baseDelayMs?: number; timeoutMs?: number };
}

interface PaginatedResponse<T> {
  data: T[];
  totalFetched: number;
  pagesFetched: number;
  stoppedReason: 'hasMore_false' | 'max_pages' | 'empty_page' | 'completed';
}

/**
 * Robust data extraction from various API response envelopes
 */
export function extractDataFromEnvelope(response: any): { data: any[], hasMore?: boolean } {
  // Direct array response
  if (Array.isArray(response)) {
    return { data: response };
  }
  
  // Try common envelope patterns
  const patterns = [
    'data',
    'results', 
    'items',
    'sets',
    'cards',
    'games'
  ];
  
  for (const pattern of patterns) {
    if (response[pattern] && Array.isArray(response[pattern])) {
      const hasMore = response.meta?.hasMore ?? 
                     response._metadata?.hasMore ?? 
                     response.pagination?.hasMore ??
                     undefined;
      
      return { 
        data: response[pattern], 
        hasMore 
      };
    }
  }
  
  // Nested data patterns
  if (response.data) {
    for (const pattern of patterns) {
      if (response.data[pattern] && Array.isArray(response.data[pattern])) {
        const hasMore = response.data.meta?.hasMore ?? 
                       response.data._metadata?.hasMore ?? 
                       response.data.pagination?.hasMore ??
                       response.meta?.hasMore ?? 
                       response._metadata?.hasMore ?? 
                       response.pagination?.hasMore ??
                       undefined;
        
        return { 
          data: response.data[pattern], 
          hasMore 
        };
      }
    }
  }
  
  console.warn('Could not extract data from response envelope:', Object.keys(response));
  return { data: [] };
}

/**
 * Paginated fetch with limit+offset for JustTCG API endpoints
 * Handles various response envelope formats and stops appropriately
 */
export async function fetchPaginatedData<T = any>(
  baseUrl: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<T>> {
  const { 
    limit = 200, 
    maxPages = 100, 
    timeoutMs = 90000,
    retryOptions = {}
  } = options;
  
  const operation = 'fetchPaginatedData';
  const timer = createTimer();
  timer.start();
  
  const urlObj = new URL(baseUrl);
  const game = urlObj.searchParams.get('game');
  const set = urlObj.searchParams.get('set');
  
  logOperationStart(operation, { 
    url: baseUrl, 
    game, 
    set, 
    limit, 
    maxPages 
  });
  
  let allData: T[] = [];
  let offset = 0;
  let pagesFetched = 0;
  let stoppedReason: PaginatedResponse<T>['stoppedReason'] = 'completed';
  
  while (pagesFetched < maxPages) {
    const pageTimer = createTimer();
    pageTimer.start();
    
    const url = new URL(baseUrl);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('offset', offset.toString());
    
    logPaginationProgress(operation, pagesFetched + 1, allData.length, {
      game,
      set,
      offset,
      limit
    });
    
    console.log(`📄 Fetching page ${pagesFetched + 1}/${maxPages} (offset=${offset}, limit=${limit})`);
    
    try {
      const response = await fetchJsonWithRetry(
        url.toString(),
        {},
        { timeoutMs, ...retryOptions }
      );
      
      const { data: pageData, hasMore } = extractDataFromEnvelope(response);
      const pageDuration = pageTimer.end();
      
      if (pageData.length === 0) {
        logStructured('info', 'Empty page received, stopping pagination', {
          operation,
          game,
          set,
          page: pagesFetched + 1,
          duration: pageDuration
        });
        console.log(`📭 Empty page received, stopping pagination`);
        stoppedReason = 'empty_page';
        break;
      }
      
      allData = allData.concat(pageData);
      pagesFetched++;
      offset += pageData.length; // Use actual returned count for offset
      
      logStructured('info', `Page ${pagesFetched} completed`, {
        operation,
        game,
        set,
        page: pagesFetched,
        itemsThisPage: pageData.length,
        totalItems: allData.length,
        duration: pageDuration,
        hasMore
      });
      
      console.log(`✅ Page ${pagesFetched} fetched: ${pageData.length} items (total: ${allData.length})`);
      
      // Check if API explicitly says no more data
      if (hasMore === false) {
        logStructured('info', 'API reported hasMore=false, stopping pagination', {
          operation,
          game,
          set,
          page: pagesFetched,
          totalItems: allData.length
        });
        console.log(`🏁 API reported hasMore=false, stopping pagination`);
        stoppedReason = 'hasMore_false';
        break;
      }
      
      // Auto-stop if we get a partial page (indicates end of data)
      if (pageData.length < limit) {
        logStructured('info', 'Partial page received, assuming end of data', {
          operation,
          game,
          set,
          page: pagesFetched,
          itemsThisPage: pageData.length,
          expectedLimit: limit,
          totalItems: allData.length
        });
        console.log(`🏁 Partial page (${pageData.length}/${limit}), assuming end of data`);
        stoppedReason = 'completed';
        break;
      }
      
    } catch (error) {
      const pageDuration = pageTimer.end();
      logOperationError(operation, `Error fetching page ${pagesFetched + 1}`, {
        game,
        set,
        page: pagesFetched + 1,
        duration: pageDuration,
        totalItemsFetched: allData.length,
        error: error.message
      });
      
      // If we have some data, return what we got; otherwise re-throw
      if (allData.length > 0) {
        logStructured('warn', 'Partial data recovered from pagination error', {
          operation,
          game,
          set,
          totalItemsFetched: allData.length,
          lastSuccessfulPage: pagesFetched
        });
        console.warn(`⚠️ Error on page ${pagesFetched + 1}, returning ${allData.length} items from successful pages`);
        break;
      } else {
        throw error;
      }
    }
  }
  
  if (pagesFetched >= maxPages && allData.length > 0) {
    stoppedReason = 'max_pages';
    logStructured('warn', 'Pagination stopped due to max pages limit', {
      operation,
      game,
      set,
      maxPages,
      totalItems: allData.length
    });
    console.warn(`⚠️ Reached max pages limit (${maxPages}), may have more data available`);
  }
  
  const totalDuration = timer.end();
  logOperationSuccess(operation, {
    game,
    set,
    totalItems: allData.length,
    pagesFetched,
    stoppedReason,
    duration: totalDuration
  });
  
  console.log(`📊 Pagination complete: ${allData.length} items, ${pagesFetched} pages, stopped: ${stoppedReason}`);
  
  return {
    data: allData,
    totalFetched: allData.length,
    pagesFetched,
    stoppedReason
  };
}