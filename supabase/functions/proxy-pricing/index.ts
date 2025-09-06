import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from "https://esm.sh/stripe@14.21.0";

// Telemetry functions (copied for isolation)
interface LogContext {
  operation: string;
  cardId?: string;
  condition?: string;
  printing?: string;
  duration?: number;
  cached?: boolean;
  error?: string;
  statusCode?: number;
  [key: string]: any;
}

function logStructured(level: 'info' | 'warn' | 'error', message: string, context: LogContext) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level: level.toUpperCase(), message, context };
  const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📊';
  console.log(`${emoji} [${level.toUpperCase()}] ${message}`, logEntry.context);
}

function createTimer() {
  let startTime = 0;
  return {
    start: () => { startTime = Date.now(); },
    end: () => Date.now() - startTime
  };
}

// JustTCG client functions (self-contained for edge function compatibility)
const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';

function getApiKey(): string {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not configured in environment');
  }
  return apiKey;
}

function normalizeGameSlug(game: string): string {
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

function buildUrl(path: string, params?: Record<string, string | number>): string {
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

function authHeaders(): HeadersInit {
  const apiKey = getApiKey();
  
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json'
  };
}

async function fetchJsonWithRetry(
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
      
      const body = await response.text();
      const error = {
        status: response.status,
        message: `JustTCG API error: ${response.status} - ${response.statusText}`,
        body: body.substring(0, 500)
      };
      
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
        console.error(`❌ Non-retryable error on attempt ${attempt} (${duration}ms): ${error.status}`);
        throw error;
}

/**
 * Complete pagination for cards by set - loops until meta.hasMore === false
 * Returns all cards for a given game/set with optional ordering support
 */
async function listAllCardsBySet({
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

function extractDataFromEnvelope(response: any): { data: any[], hasMore?: boolean } {
  if (Array.isArray(response)) {
    return { data: response };
  }
  
  const patterns = ['data', 'results', 'items', 'sets', 'cards', 'games'];
  
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PricingRequest {
  cardId?: string;
  tcgplayerId?: string;
  variantId?: string;
  condition?: string;
  printing?: string;
  refresh?: boolean;
}

interface PricingResponse {
  success: boolean;
  pricing?: any;
  cached?: boolean;
  error?: string;
  status?: number; // Add status for better error handling
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const operation = 'proxy-pricing';
    const timer = createTimer();
    timer.start();
    
    // Parse request body
    const body = await req.json();
    const { cardId, tcgplayerId, variantId, condition, printing, refresh } = body;
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
      // Verify API key is available
      authHeaders();
    } catch (error) {
      logStructured('error', 'JustTCG API key not configured', {
        operation,
        error: error.message
      });
      console.error('JustTCG API key not found:', error.message);
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the complete request payload for debugging
    const requestPayload = { cardId, tcgplayerId, variantId, condition, printing, refresh };
    logStructured('info', 'Pricing request started', {
      operation,
      ...requestPayload
    });
    console.log(`🏷️ Pricing request payload:`, requestPayload);
    
    // Determine which identifier to use (ID takes precedence)
    const primaryId = cardId || tcgplayerId || variantId;
    const hasIdParam = !!primaryId;
    
    if (!hasIdParam) {
      const duration = timer.end();
      logStructured('error', 'Missing card identifier in request payload', {
        operation,
        duration,
        error: 'Card ID (cardId, tcgplayerId, or variantId) is required'
      });
      console.error('❌ Missing card identifier in request payload');
      return new Response(
        JSON.stringify({ success: false, error: 'Card ID (cardId, tcgplayerId, or variantId) is required', status: 400 }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🆔 Using card identifier: ${primaryId} (type: ${cardId ? 'cardId' : tcgplayerId ? 'tcgplayerId' : 'variantId'})`);

    // If specific condition/printing requested and cached data exists, check cache first
    if (!refresh && condition && printing) {
      // First, get the card details to extract internal ID for cache lookup
      let internalCardId = null;
      
      if (cardId) {
        const { data: cardData } = await supabaseClient
          .from('cards')
          .select('jt_card_id')
          .eq('jt_card_id', cardId)
          .maybeSingle();
        internalCardId = cardData?.jt_card_id;
      }
      
      if (internalCardId) {
        const cacheTimer = createTimer();
        cacheTimer.start();
        
        const cacheTimeLimit = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
        
        const { data: cachedPrice, error: cacheError } = await supabaseClient
          .from('card_prices')
          .select('*')
          .eq('card_id', internalCardId)
          .eq('condition', condition)
          .eq('variant', printing)
          .eq('source', 'JustTCG')
          .gte('fetched_at', cacheTimeLimit.toISOString())
          .order('fetched_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const cacheDuration = cacheTimer.end();
        
        if (!cacheError && cachedPrice) {
          const totalDuration = timer.end();
          logStructured('info', 'Using cached pricing', {
            operation,
            cardId: primaryId,
            condition,
            printing,
            cached: true,
            cacheDuration,
            totalDuration
          });
          console.log(`📋 Using cached pricing for card: ${primaryId}`);
          return new Response(
            JSON.stringify({ 
              success: true, 
              pricing: cachedPrice,
              cached: true 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    // Fetch ALL variants from JustTCG API using only ID parameter (no filtering)
    console.log(`🔄 Fetching ALL variants from JustTCG for ID: ${primaryId}`);
    
    try {
      // Build query with only ID parameter - no printing or condition filters
      const params: Record<string, string> = {};
      
      if (cardId) {
        params.cardId = cardId;
      } else if (tcgplayerId) {
        params.tcgplayerId = tcgplayerId;
      } else if (variantId) {
        params.variantId = variantId;
      }
      
      const pricingUrl = buildUrl('cards', params);
      
      const pricingData = await fetchJsonWithRetry(
        pricingUrl,
        {},
        { tries: 3, baseDelayMs: 500, timeoutMs: 30000 }
      );

      // Return API response unchanged - preserve all returned variant fields
      const response = {
        success: true,
        data: pricingData.data || pricingData || [],
        cached: false,
        allVariants: true // Flag to indicate this contains all variants
      };

      console.log(`✅ Fetched ${response.data.length} cards with all variants for ID: ${primaryId}`);
      
      // If specific condition/printing was requested, also save individual pricing records
      if (condition && printing && response.data.length > 0) {
        for (const card of response.data) {
          if (card.variants && Array.isArray(card.variants)) {
            for (const variant of card.variants) {
              try {
                // Handle different variant structures
                if (variant.conditions && Array.isArray(variant.conditions)) {
                  for (const conditionData of variant.conditions) {
                    if ((conditionData.condition || 'Near Mint') === condition && 
                        (variant.variant || variant.printing || 'Normal') === printing) {
                      
                      // Save this specific pricing to database for caching
                      const pricingRecord = {
                        card_id: primaryId,
                        variant: printing,
                        condition: condition,
                        currency: conditionData.currency || 'USD',
                        market_price: conditionData.market_price || conditionData.price,
                        low_price: conditionData.low_price,
                        high_price: conditionData.high_price,
                        source: 'JustTCG',
                        fetched_at: new Date().toISOString()
                      };

                      await supabaseClient
                        .from('card_prices')
                        .upsert(pricingRecord, { 
                          onConflict: 'card_id,variant,condition,source',
                          ignoreDuplicates: false 
                        });
                    }
                  }
                } else if (variant.condition && variant.price !== undefined) {
                  // Handle direct variant structure (legacy format)
                  if ((variant.condition || 'Near Mint') === condition && 
                      (variant.variant || variant.printing || 'Normal') === printing) {
                    
                    const pricingRecord = {
                      card_id: primaryId,
                      variant: printing,
                      condition: condition,
                      currency: variant.currency || 'USD',
                      market_price: variant.price,
                      low_price: variant.lowPrice,
                      high_price: variant.highPrice,
                      source: 'JustTCG',
                      fetched_at: new Date().toISOString()
                    };

                    await supabaseClient
                      .from('card_prices')
                      .upsert(pricingRecord, { 
                        onConflict: 'card_id,variant,condition,source',
                        ignoreDuplicates: false 
                      });
                  }
                }
              } catch (saveError) {
                console.warn('Warning: Could not save pricing record:', saveError);
                // Continue processing other variants
              }
            }
          }
        }
      }
      
      const totalDuration = timer.end();
      logStructured('info', 'All variants fetched successfully', {
        operation,
        cardId: primaryId,
        condition,
        printing,
        cached: false,
        duration: totalDuration,
        variantCount: response.data.reduce((sum, card) => sum + (card.variants?.length || 0), 0)
      });
      
      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      const duration = timer.end();
      logStructured('error', 'Error fetching variants from JustTCG', {
        operation,
        cardId: primaryId,
        condition,
        printing,
        duration,
        error: error.message
      });
      console.error('❌ Error fetching variants from JustTCG:', error.message, 'Payload:', requestPayload);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Variants service error: ${error.message}`,
          status: 500
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    logStructured('error', 'Top-level error in proxy-pricing function', {
      operation: 'proxy-pricing',
      error: error.message
    });
    console.error('❌ Error in proxy-pricing function:', error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Service error: ${error.message}`,
        status: 500 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});