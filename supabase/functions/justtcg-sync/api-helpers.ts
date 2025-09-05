/**
 * JustTCG API Helper Functions
 * Normalizes API header usage and ensures server-only key access
 */

/**
 * Gets the JustTCG API key from environment variables
 * This should ONLY be called from server-side code (Edge Functions)
 */
export function getApiKey(): string {
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
  
  // Apply normalization rules for known game variations
  switch (normalized) {
    // Pokemon variations
    case 'pokemon-tcg':
    case 'pokemon-english':
    case 'pokemon-us':
      return 'pokemon';
    
    // Pokemon Japan specifically 
    case 'pokemon-jp':
    case 'pokemon-japanese':
      return 'pokemon-japan';
    
    // Magic: The Gathering variations
    case 'magic':
    case 'magic-the-gathering':
    case 'mtg-english':
      return 'mtg';
    
    // One Piece variations
    case 'one-piece':
    case 'one-piece-tcg':
      return 'one-piece-card-game';
    
    // Disney Lorcana variations
    case 'lorcana':
    case 'disney-lorcana-tcg':
      return 'disney-lorcana';
    
    // Star Wars variations
    case 'star-wars':
    case 'swu':
      return 'star-wars-unlimited';
    
    // Already normalized or unrecognized
    default:
      return normalized;
  }
}

/**
 * Creates standardized headers for JustTCG API calls
 * Ensures consistent header format across all API calls
 */
export function createJustTCGHeaders(apiKey: string): HeadersInit {
  if (!apiKey) {
    throw new Error('API key is required');
  }
  
  return {
    'X-API-Key': apiKey, // Exact case match as required by JustTCG API
    'Content-Type': 'application/json'
  };
}

/**
 * Makes a GET request to the JustTCG API with proper headers
 * @deprecated Use fetchJsonWithRetry instead for better error handling
 */
export async function fetchFromJustTCG(url: string, apiKey: string): Promise<Response> {
  const headers = createJustTCGHeaders(apiKey);
  
  console.log(`Making JustTCG API call to: ${url}`);
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`JustTCG API error: ${response.status} - ${errorText}`);
    throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
  }
  
  return response;
}

/**
 * Builds normalized URL for JustTCG API endpoints
 * Automatically applies game slug normalization
 */
export function buildJustTCGUrl(
  endpoint: string, 
  params: Record<string, string | number> = {}
): string {
  const url = new URL(`https://api.justtcg.com/v1/${endpoint}`);
  
  // Normalize game parameter if present
  if (params.game) {
    params.game = normalizeGameSlug(params.game.toString());
  }
  
  // Add all parameters to URL
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value.toString());
  });
  
  return url.toString();
}

/**
 * Probes for English-only sets when Pokemon Japan returns empty results
 * Checks if the same set exists under the regular 'pokemon' game
 */
export async function probeEnglishOnlySet(
  setName: string, 
  apiKey: string
): Promise<{ hasEnglishCards: boolean; cardCount: number }> {
  console.log(`🔍 Probing for English-only cards in set: ${setName}`);
  
  try {
    // Probe page 1 of the same set under regular 'pokemon'
    const probeUrl = buildJustTCGUrl('cards', { 
      game: 'pokemon', // Use regular pokemon, not pokemon-japan
      set: setName,
      limit: 1,
      offset: 0
    });
    
    const response = await fetchJsonWithRetry(
      probeUrl,
      { headers: createJustTCGHeaders(apiKey) },
      { tries: 3, baseDelayMs: 300, timeoutMs: 30000 } // Faster probe
    );
    
    const { data: probeCards } = extractDataFromEnvelope(response);
    const hasEnglishCards = probeCards.length > 0;
    
    if (hasEnglishCards) {
      console.log(`✅ Found English cards for set: ${setName} under 'pokemon' game`);
      
      // Get rough count by checking if there are more than 1 card
      const countUrl = buildJustTCGUrl('cards', { 
        game: 'pokemon',
        set: setName,
        limit: 200,
        offset: 0
      });
      
      const countResponse = await fetchJsonWithRetry(
        countUrl,
        { headers: createJustTCGHeaders(apiKey) },
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

interface RetryOptions {
  tries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

/**
 * Unified fetch helper with timeout and exponential backoff
 * Handles retries on 429/5xx errors with proper logging
 */
export async function fetchJsonWithRetry(
  url: string, 
  init: RequestInit = {}, 
  options: RetryOptions = {}
): Promise<any> {
  const { tries = 6, baseDelayMs = 500, timeoutMs = 90000 } = options;
  
  let lastError: Error | null = null;
  
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
      
      console.log(`🔄 Attempt ${attempt}/${tries} for ${url}`);
      
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`✅ Success on attempt ${attempt} (${duration}ms): ${url}`);
        return await response.json();
      }
      
      // Handle retryable errors
      if (response.status === 429 || response.status >= 500) {
        const errorText = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
        
        console.warn(`⚠️ Retryable error on attempt ${attempt} (${duration}ms): ${response.status} - ${errorText}`);
        
        if (attempt < tries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`⏰ Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      } else {
        // Non-retryable error
        const errorText = await response.text();
        console.error(`❌ Non-retryable error on attempt ${attempt} (${duration}ms): ${response.status} - ${errorText}`);
        throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error.name === 'AbortError' || timedOut) {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
        console.error(`⏰ Timeout on attempt ${attempt} (${duration}ms): ${url}`);
      } else {
        lastError = error as Error;
        console.error(`❌ Network error on attempt ${attempt} (${duration}ms):`, error.message);
      }
      
      if (attempt < tries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`⏰ Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  console.error(`💥 All ${tries} attempts failed for ${url}`);
  throw lastError || new Error('All retry attempts failed');
}

interface PaginationOptions {
  limit?: number;
  maxPages?: number;
  timeoutMs?: number;
  retryOptions?: RetryOptions;
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
  headers: HeadersInit,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<T>> {
  const { 
    limit = 200, 
    maxPages = 100, 
    timeoutMs = 90000,
    retryOptions = {}
  } = options;
  
  let allData: T[] = [];
  let offset = 0;
  let pagesFetched = 0;
  let stoppedReason: PaginatedResponse<T>['stoppedReason'] = 'completed';
  
  console.log(`🔄 Starting paginated fetch: ${baseUrl} (limit=${limit}, maxPages=${maxPages})`);
  
  while (pagesFetched < maxPages) {
    const url = new URL(baseUrl);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('offset', offset.toString());
    
    console.log(`📄 Fetching page ${pagesFetched + 1}/${maxPages} (offset=${offset}, limit=${limit})`);
    
    try {
      const response = await fetchJsonWithRetry(
        url.toString(),
        { headers },
        { timeoutMs, ...retryOptions }
      );
      
      const { data: pageData, hasMore } = extractDataFromEnvelope(response);
      
      if (pageData.length === 0) {
        console.log(`📭 Empty page received, stopping pagination`);
        stoppedReason = 'empty_page';
        break;
      }
      
      allData = allData.concat(pageData);
      pagesFetched++;
      offset += pageData.length; // Use actual returned count for offset
      
      console.log(`📊 Page ${pagesFetched}: ${pageData.length} items (total: ${allData.length})`);
      
      // Check hasMore flag if available
      if (hasMore === false) {
        console.log(`🏁 API signaled no more data (hasMore=false), stopping`);
        stoppedReason = 'hasMore_false';
        break;
      }
      
      // If we got less than requested limit, likely at the end
      if (pageData.length < limit) {
        console.log(`🏁 Received ${pageData.length} < ${limit} requested, likely at end`);
        stoppedReason = 'completed';
        break;
      }
      
    } catch (error) {
      console.error(`❌ Pagination failed on page ${pagesFetched + 1}:`, error.message);
      throw error;
    }
  }
  
  if (pagesFetched >= maxPages) {
    console.warn(`⚠️ Hit maximum page limit (${maxPages}), stopping pagination`);
    stoppedReason = 'max_pages';
  }
  
  console.log(`✅ Pagination complete: ${allData.length} total items, ${pagesFetched} pages, stopped: ${stoppedReason}`);
  
  return {
    data: allData,
    totalFetched: allData.length,
    pagesFetched,
    stoppedReason
  };
}

/**
 * Validates that headers contain the required API key header
 * Used for testing and validation
 */
export function validateJustTCGHeaders(headers: HeadersInit): boolean {
  if (!headers || typeof headers !== 'object') {
    return false;
  }
  
  // Check for exact case match
  return 'X-API-Key' in headers && !!headers['X-API-Key'];
}