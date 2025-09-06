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
  
  // Log API limits for tuning concurrency
  console.log(`🏢 JustTCG API Limits - Enterprise: 500 rpm, 50k/day, 500k/month`);
  
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
      
      // Enhanced retry logic for rate limits and server errors
      if (response.status === 429 || response.status >= 500) {
        console.warn(`⚠️ Attempt ${attempt} failed (${response.status}) after ${duration}ms, will retry`);
        
        // Special handling for rate limits
        if (response.status === 429) {
          console.warn(`🚫 Rate limit hit - consider reducing concurrency (Enterprise: 500 rpm)`);
        }
        
        lastError = error;
        
        if (attempt < tries) {
          // Exponential backoff with jitter for rate limits
          const baseDelay = response.status === 429 ? baseDelayMs * 2 : baseDelayMs;
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
          console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      } else {
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
  full?: boolean; // Strip printing/condition filters when true
  orderBy?: 'price' | '24h' | '7d' | '30d';
  order?: 'asc' | 'desc';
}

interface PricingResponse {
  success: boolean;
  pricing?: any;
  cached?: boolean;
  error?: string;
  status?: number; // Add status for better error handling
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function routeRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const operation = 'proxy-pricing';
  const timer = createTimer();
  timer.start();
  
  // Parse request body
  const body = await req.json();
  const { cardId, tcgplayerId, variantId, condition, printing, refresh, full, orderBy, order } = body;
  
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
    return json({ error: 'API key not configured' }, 500);
  }

  // Log the complete request payload for debugging
  const requestPayload = { cardId, tcgplayerId, variantId, condition, printing, refresh, full, orderBy, order };
  logStructured('info', 'Pricing request started', {
    operation,
    ...requestPayload
  });
  console.log(`🏷️ Pricing request payload:`, requestPayload);
  
  // Input validation: Require ID or game+set
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
    return json({ success: false, error: 'Card ID (cardId, tcgplayerId, or variantId) is required', status: 400 }, 400);
  }

  console.log(`🆔 Using card identifier: ${primaryId} (type: ${cardId ? 'cardId' : tcgplayerId ? 'tcgplayerId' : 'variantId'})`);
  
  // Log full mode if enabled
  if (full) {
    console.log('🔓 Full mode enabled - will return all variants without filtering');
  }

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
        return json({ 
          success: true, 
          pricing: cachedPrice,
          cached: true 
        });
      }
    }
  }

  // Fetch ALL variants from JustTCG API using only ID parameter (no filtering)
  console.log(`🔄 Fetching ALL variants from JustTCG for ID: ${primaryId}`);
  
  try {
    // Build query with ID parameter
    const params: Record<string, string> = {};
    
    if (cardId) {
      params.cardId = cardId;
    } else if (tcgplayerId) {
      params.tcgplayerId = tcgplayerId;
    } else if (variantId) {
      params.variantId = variantId;
    }
    
    // If full mode is disabled, add filtering (condition/printing)
    // If full mode is enabled, skip filters to get all variants
    if (!full) {
      if (condition) {
        params.condition = condition;
      }
      if (printing) {
        params.printing = printing;
      }
    } else {
      console.log('🔓 Full mode: skipping condition/printing filters to get all variants');
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
      data: pricingData.data || [],
      meta: pricingData.meta || pricingData._metadata || {},
      cached: false
    };

    // Cache individual pricing records for faster subsequent lookups
    if (pricingData.data && Array.isArray(pricingData.data)) {
      for (const card of pricingData.data) {
        if (card.variants && Array.isArray(card.variants)) {
          for (const variant of card.variants) {
            try {
              // Handle nested structure: variant.conditions array
              if (variant.conditions && Array.isArray(variant.conditions)) {
                for (const conditionData of variant.conditions) {
                  if (conditionData.condition && conditionData.market_price !== undefined) {
                    
                    const pricingRecord = {
                      card_id: primaryId,
                      variant: variant.variant || variant.printing || 'Normal',
                      condition: conditionData.condition,
                      currency: conditionData.currency || 'USD',
                      market_price: conditionData.market_price,
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
    
    return json(response);

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
    return json({ 
      success: false, 
      error: `Variants service error: ${error.message}`,
      status: 500
    }, 500);
  }
}

// ===== CANONICAL TAIL (inline; balanced) =====
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await routeRequest(req);
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: "Internal error", message: (error as Error)?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}); // <— this MUST be the final characters; nothing after this line
