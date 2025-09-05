import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getApiKey, createJustTCGHeaders, fetchJsonWithRetry, buildJustTCGUrl } from '../justtcg-sync/api-helpers.ts';

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