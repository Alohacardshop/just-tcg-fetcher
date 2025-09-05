/**
 * Centralized JustTCG API client
 * Provides consistent base URL and authentication headers
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
  
  return allSets;
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
  
  return allSets;
}