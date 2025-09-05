import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from "https://esm.sh/stripe@14.21.0";

// Helper functions for JustTCG API (copied from justtcg-sync for isolation)
function getApiKey(): string {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not configured in environment');
  }
  return apiKey;
}

function createJustTCGHeaders(apiKey: string): HeadersInit {
  if (!apiKey) {
    throw new Error('API key is required');
  }
  
  return {
    'X-API-Key': apiKey,
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

function buildJustTCGUrl(endpoint: string, params: Record<string, string | number> = {}): string {
  const url = new URL(`https://api.justtcg.com/v1/${endpoint}`);
  
  if (params.game) {
    params.game = normalizeGameSlug(params.game.toString());
  }
  
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value.toString());
  });
  
  return url.toString();
}

async function fetchJsonWithRetry(
  url: string, 
  init: RequestInit = {}, 
  options: { tries?: number; baseDelayMs?: number; timeoutMs?: number } = {}
): Promise<any> {
  const { tries = 3, baseDelayMs = 500, timeoutMs = 30000 } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= tries; attempt++) {
    const startTime = Date.now();
    let timedOut = false;
    
    try {
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
  cardId: string;
  condition?: string;
  printing?: string;
  refresh?: boolean;
}

interface PricingResponse {
  success: boolean;
  pricing?: any;
  cached?: boolean;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let apiKey: string;
    try {
      apiKey = getApiKey();
    } catch (error) {
      console.error('JustTCG API key not found:', error.message);
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { cardId, condition = 'Near Mint', printing = 'Normal', refresh = false }: PricingRequest = await req.json();
    
    if (!cardId) {
      return new Response(
        JSON.stringify({ success: false, error: 'JustTCG card ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🏷️ Fetching pricing for card: ${cardId}, condition: ${condition}, printing: ${printing}, refresh: ${refresh}`);

    // First, get the card details to extract game and set info
    const { data: cardData, error: cardError } = await supabaseClient
      .from('cards')
      .select(`
        jt_card_id,
        name,
        sets!inner(name, games!inner(jt_game_id))
      `)
      .eq('jt_card_id', cardId)
      .maybeSingle();

    if (cardError || !cardData) {
      console.error('Card not found:', cardId);
      return new Response(
        JSON.stringify({ success: false, error: `Card not found: ${cardId}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gameId = cardData.sets.games.jt_game_id;
    const setName = cardData.sets.name;
    const cardName = cardData.name;

    // Check if we have recent cached pricing (unless refresh is requested)
    if (!refresh) {
      const cacheTimeLimit = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
      
      const { data: cachedPrice, error: cacheError } = await supabaseClient
        .from('card_prices')
        .select('*')
        .eq('card_id', cardData.jt_card_id)
        .eq('condition', condition)
        .eq('variant', printing)
        .eq('source', 'JustTCG')
        .gte('fetched_at', cacheTimeLimit.toISOString())
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cacheError && cachedPrice) {
        console.log(`📋 Using cached pricing for card: ${cardId}`);
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

    // Fetch fresh pricing from JustTCG API
    console.log(`🔄 Fetching fresh pricing from JustTCG for: ${gameId}/${setName}/${cardName}`);
    
    try {
      const pricingUrl = buildJustTCGUrl('cards', { 
        game: gameId,
        set: setName,
        name: cardName
      });
      
      const pricingData = await fetchJsonWithRetry(
        pricingUrl,
        { headers: createJustTCGHeaders(apiKey) },
        { tries: 3, baseDelayMs: 500, timeoutMs: 30000 }
      );

      // Extract pricing for the specific card and variant
      const cards = pricingData.data || pricingData || [];
      const targetCard = cards.find((card: any) => 
        (card.id || card.card_id) === cardId ||
        card.name?.toLowerCase() === cardName.toLowerCase()
      );

      if (!targetCard || !targetCard.variants) {
        console.warn(`No pricing variants found for card: ${cardId}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'No pricing data available for this card' 
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find the specific variant/condition pricing
      const targetVariant = targetCard.variants.find((variant: any) => {
        const variantMatch = (variant.variant || variant.printing || 'Normal') === printing;
        const conditionMatch = variant.conditions?.some((cond: any) => 
          (cond.condition || 'Near Mint') === condition
        );
        return variantMatch && conditionMatch;
      });

      if (!targetVariant) {
        console.warn(`No pricing found for condition: ${condition}, printing: ${printing}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `No pricing available for ${condition} condition, ${printing} printing` 
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const conditionPricing = targetVariant.conditions.find((cond: any) => 
        (cond.condition || 'Near Mint') === condition
      );

      // Save the pricing to our database
      const pricingRecord = {
        card_id: cardData.jt_card_id,
        variant: printing,
        condition: condition,
        currency: conditionPricing.currency || 'USD',
        market_price: conditionPricing.market_price || conditionPricing.price,
        low_price: conditionPricing.low_price,
        high_price: conditionPricing.high_price,
        source: 'JustTCG',
        fetched_at: new Date().toISOString()
      };

      const { data: savedPrice, error: saveError } = await supabaseClient
        .from('card_prices')
        .upsert(pricingRecord, { 
          onConflict: 'card_id,variant,condition,source',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (saveError) {
        console.error('Error saving pricing:', saveError);
        // Still return the pricing data even if save failed
      }

      console.log(`✅ Fresh pricing fetched and saved for card: ${cardId}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          pricing: savedPrice || pricingRecord,
          cached: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('Error fetching pricing from JustTCG:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to fetch pricing: ${error.message}` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in proxy-pricing function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});