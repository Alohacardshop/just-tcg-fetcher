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
import { buildUrl, authHeaders, normalizeGameSlug, fetchJsonWithRetry, listAllSets } from '../shared/justtcg-client.ts';

// Re-export for backwards compatibility
export { normalizeGameSlug, fetchJsonWithRetry, listAllSets };

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