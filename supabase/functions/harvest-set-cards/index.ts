import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// JustTCG API configuration
const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';

function getApiKey(): string {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not configured in environment');
  }
  return apiKey;
}

function authHeaders(): HeadersInit {
  return {
    'x-api-key': getApiKey(),
    'Content-Type': 'application/json'
  };
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

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit = {},
  options: { tries?: number; timeoutMs?: number; baseDelayMs?: number } = {}
): Promise<any> {
  const { tries = 3, timeoutMs = 30000, baseDelayMs = 500 } = options;
  
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
        
        console.warn(`⚠️ Retryable error on attempt ${attempt} (${duration}ms): ${error.status}`);
        
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { gameId, setId, limit = 100, offset = 0 } = await req.json();
    
    if (!gameId || !setId) {
      return new Response(
        JSON.stringify({ error: 'gameId and setId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🌾 Harvesting cards: ${gameId}/${setId} (limit: ${limit}, offset: ${offset})`);

    // Build URL with game, set, limit, offset - NO printing or condition filters
    const url = buildUrl('cards', {
      game: gameId,
      set: setId,
      limit,
      offset
    });

    // Fetch page of cards with all variants
    const response = await fetchJsonWithRetry(url, {}, {
      tries: 3,
      baseDelayMs: 500,
      timeoutMs: 30000
    });

    // Extract data and meta
    const cards = response.data || response.cards || [];
    const meta = response.meta || response._metadata || {};

    console.log(`📄 Page fetched: ${cards.length} cards, hasMore: ${meta.hasMore}`);

    // Validate response structure
    const processedCards = cards.map((card: any) => ({
      id: card.id || card.card_id,
      name: card.name,
      game: card.game || gameId,
      set: card.set || setId,
      number: card.number,
      tcgplayerId: card.tcgplayerId,
      rarity: card.rarity,
      details: card.details,
      image_url: card.image_url || card.imageUrl,
      variants: (card.variants || []).map((variant: any) => ({
        id: variant.id,
        printing: variant.printing || variant.variant || 'Normal',
        condition: variant.condition || 'Near Mint',
        price: variant.price,
        market_price: variant.market_price,
        low_price: variant.low_price,
        high_price: variant.high_price,
        currency: variant.currency || 'USD',
        lastUpdated: variant.lastUpdated || variant.last_updated,
        priceChange24hr: variant.priceChange24hr,
        priceChange7d: variant.priceChange7d,
        priceChange30d: variant.priceChange30d,
        priceChange90d: variant.priceChange90d,
        avgPrice: variant.avgPrice,
        priceHistory: variant.priceHistory
      }))
    }));

    return new Response(
      JSON.stringify({
        data: processedCards,
        meta: {
          total: meta.total,
          limit: meta.limit || limit,
          offset: meta.offset || offset,
          hasMore: meta.hasMore
        }
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Error in harvest-set-cards function:', error);
    return new Response(
      JSON.stringify({ 
        error: `Harvest error: ${error.message}`,
        status: error.status || 500
      }),
      { 
        status: error.status || 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});