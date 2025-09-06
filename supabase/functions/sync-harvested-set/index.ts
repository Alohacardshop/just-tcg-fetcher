import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HarvestCard {
  id: string;
  name: string;
  game: string;
  set: string;
  number?: string | null;
  tcgplayerId?: string | null;
  rarity?: string | null;
  details?: string | null;
  image_url?: string | null;
  variants: HarvestVariant[];
}

interface HarvestVariant {
  id: string;
  printing: string;
  condition: string;
  price?: number | null;
  market_price?: number | null;
  low_price?: number | null;
  high_price?: number | null;
  currency?: string;
  lastUpdated?: string | null;
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

    const { gameId, setId, cards, harvestMeta } = await req.json();

    if (!gameId || !setId || !cards || !Array.isArray(cards)) {
      return new Response(
        JSON.stringify({ error: 'gameId, setId, and cards array are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`💾 Starting database sync for ${gameId}/${setId}: ${cards.length} cards`);

    // Step 1: Get or create game record
    let gameDbId: string;
    const { data: existingGame } = await supabaseClient
      .from('games')
      .select('id')
      .eq('jt_game_id', gameId)
      .single();

    if (existingGame) {
      gameDbId = existingGame.id;
    } else {
      const { data: newGame, error: gameError } = await supabaseClient
        .from('games')
        .insert({ 
          jt_game_id: gameId,
          name: gameId.charAt(0).toUpperCase() + gameId.slice(1).replace('-', ' '),
          last_synced_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (gameError) {
        throw new Error(`Failed to create game: ${gameError.message}`);
      }
      gameDbId = newGame.id;
    }

    // Step 2: Get or create set record
    let setDbId: string;
    const { data: existingSet } = await supabaseClient
      .from('sets')
      .select('id')
      .eq('jt_set_id', setId)
      .eq('game_id', gameDbId)
      .single();

    if (existingSet) {
      setDbId = existingSet.id;
    } else {
      const { data: newSet, error: setError } = await supabaseClient
        .from('sets')
        .insert({
          jt_set_id: setId,
          game_id: gameDbId,
          name: setId.charAt(0).toUpperCase() + setId.slice(1).replace('-', ' '),
          total_cards: harvestMeta?.expectedTotal || cards.length,
          last_synced_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (setError) {
        throw new Error(`Failed to create set: ${setError.message}`);
      }
      setDbId = newSet.id;
    }

    // Step 3: Prepare card records for bulk insert
    const cardRecords = cards.map((card: HarvestCard) => ({
      jt_card_id: card.id,
      set_id: setDbId,
      game_id: gameDbId,
      name: card.name,
      number: card.number,
      rarity: card.rarity,
      image_url: card.image_url,
      data: card // Store full card data as JSONB
    }));

    // Step 4: Upsert cards in batches
    console.log(`📦 Upserting ${cardRecords.length} cards...`);
    const batchSize = 100;
    const upsertedCards = [];

    for (let i = 0; i < cardRecords.length; i += batchSize) {
      const batch = cardRecords.slice(i, i + batchSize);
      
      const { data: batchResult, error: cardError } = await supabaseClient
        .from('cards')
        .upsert(batch, {
          onConflict: 'jt_card_id',
          ignoreDuplicates: false
        })
        .select('id, jt_card_id');

      if (cardError) {
        throw new Error(`Failed to upsert cards batch ${i}-${i + batch.length}: ${cardError.message}`);
      }

      upsertedCards.push(...(batchResult || []));
    }

    console.log(`✅ Upserted ${upsertedCards.length} cards`);

    // Step 5: Create card ID mapping for pricing records
    const cardIdMap = new Map<string, string>();
    upsertedCards.forEach(dbCard => {
      cardIdMap.set(dbCard.jt_card_id, dbCard.id);
    });

    // Step 6: Prepare pricing records from all variants
    const pricingRecords = [];
    
    cards.forEach((card: HarvestCard) => {
      const dbCardId = cardIdMap.get(card.id);
      if (!dbCardId) return;

      card.variants?.forEach((variant: HarvestVariant) => {
        if (variant.market_price !== undefined || variant.price !== undefined) {
          pricingRecords.push({
            card_id: dbCardId,
            variant: variant.printing || 'Normal',
            condition: variant.condition || 'Near Mint',
            currency: variant.currency || 'USD',
            market_price: variant.market_price || variant.price,
            low_price: variant.low_price,
            high_price: variant.high_price,
            source: 'JustTCG',
            fetched_at: variant.lastUpdated || new Date().toISOString()
          });
        }
      });
    });

    // Step 7: Upsert pricing records in batches
    console.log(`💰 Upserting ${pricingRecords.length} pricing records...`);
    let upsertedPrices = 0;

    for (let i = 0; i < pricingRecords.length; i += batchSize) {
      const batch = pricingRecords.slice(i, i + batchSize);
      
      const { data: priceBatch, error: priceError } = await supabaseClient
        .from('card_prices')
        .upsert(batch, {
          onConflict: 'card_id,variant,condition,source',
          ignoreDuplicates: false
        })
        .select('id');

      if (priceError) {
        console.warn(`⚠️ Failed to upsert pricing batch ${i}-${i + batch.length}: ${priceError.message}`);
        // Continue with other batches
      } else {
        upsertedPrices += priceBatch?.length || 0;
      }
    }

    console.log(`✅ Upserted ${upsertedPrices} pricing records`);

    // Step 8: Update set statistics
    const { error: updateError } = await supabaseClient
      .from('sets')
      .update({
        cards_synced_count: upsertedCards.length,
        sync_status: 'completed',
        last_synced_at: new Date().toISOString(),
        last_sync_error: null
      })
      .eq('id', setDbId);

    if (updateError) {
      console.warn('⚠️ Failed to update set statistics:', updateError.message);
    }

    // Step 9: Update game statistics
    const { count: totalSetsCount } = await supabaseClient
      .from('sets')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameDbId);

    const { count: totalCardsCount } = await supabaseClient
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameDbId);

    await supabaseClient
      .from('games')
      .update({
        sets_count: totalSetsCount,
        cards_count: totalCardsCount,
        last_synced_at: new Date().toISOString()
      })
      .eq('id', gameDbId);

    const result = {
      success: true,
      gameId,
      setId,
      stats: {
        cardsUpserted: upsertedCards.length,
        pricingRecordsUpserted: upsertedPrices,
        totalVariants: cards.reduce((sum, card) => sum + (card.variants?.length || 0), 0),
        harvestMeta
      }
    };

    console.log(`✅ Database sync complete for ${gameId}/${setId}:`, result.stats);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Error in sync-harvested-set function:', error);
    return new Response(
      JSON.stringify({ 
        error: `Sync error: ${error.message}`,
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});