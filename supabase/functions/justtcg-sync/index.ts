import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getApiKey, createJustTCGHeaders, fetchJsonWithRetry, fetchPaginatedData, extractDataFromEnvelope, normalizeGameSlug, buildJustTCGUrl, probeEnglishOnlySet } from './api-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Game {
  game_id: string;
  name: string;
  slug?: string;
  sets_count?: number;
  cards_count?: number;
}

interface Set {
  set_id: string;
  game_id: string;
  code?: string;
  name: string;
  release_date?: string;
  total_cards?: number;
}

interface Card {
  card_id: string;
  set_id: string;
  game_id: string;
  name: string;
  number?: string;
  rarity?: string;
  image_url?: string;
  variants?: Array<{
    variant: string;
    conditions: Array<{
      condition: string;
      currency: string;
      market_price?: number;
      low_price?: number;
      high_price?: number;
    }>;
  }>;
}

interface SealedProduct {
  product_id: string;
  set_id: string;
  game_id: string;
  name: string;
  product_type?: string;
  image_url?: string;
  variants?: Array<{
    variant: string;
    conditions: Array<{
      condition: string;
      currency: string;
      market_price?: number;
      low_price?: number;
      high_price?: number;
    }>;
  }>;
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
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, gameId, setId, setIds } = await req.json();
    console.log(`Starting JustTCG sync action: ${action}`, { gameId, setId, setIds });

    let result = {};

    switch (action) {
      case 'sync-games':
        result = await syncGames(supabaseClient, apiKey);
        break;
      case 'sync-sets':
        if (!gameId) throw new Error('gameId required for sync-sets');
        result = await syncSets(supabaseClient, apiKey, gameId);
        break;
      case 'sync-cards':
        if (!setId) throw new Error('setId required for sync-cards');
        result = await syncCards(supabaseClient, apiKey, setId);
        break;
      case 'sync-cards-bulk':
        if (!setIds || !Array.isArray(setIds)) throw new Error('setIds array required for sync-cards-bulk');
        const { operationId } = await req.json();
        result = await syncCardsBulk(supabaseClient, apiKey, setIds, operationId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in justtcg-sync function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function syncGames(supabaseClient: any, apiKey: string) {
  console.log('Syncing games from JustTCG...');
  
  const data = await fetchJsonWithRetry(
    buildJustTCGUrl('games'),
    { headers: createJustTCGHeaders(apiKey) },
    { tries: 6, baseDelayMs: 500, timeoutMs: 90000 }
  );

  
  // Debug logging for response structure
  console.log('Response keys:', Object.keys(data));
  console.log('Full response sample:', JSON.stringify(data).substring(0, 500) + '...');
  
  // Use unified envelope extraction
  const { data: games } = extractDataFromEnvelope(data);
  
  if (games.length === 0) {
    console.error('Could not find games array in response structure');
    return { synced: 0, error: 'No games array found in response' };
  }

  console.log(`Found ${games.length} games to sync`);

  // Upsert games with last_synced_at timestamp
  const gameRecords = games.map(game => ({
    jt_game_id: game.game_id || game.id?.toString(),
    name: game.name,
    slug: game.slug,
    sets_count: game.sets_count,
    cards_count: game.cards_count,
    last_synced_at: new Date().toISOString()
  }));

  const { data: upsertedGames, error } = await supabaseClient
    .from('games')
    .upsert(gameRecords, { 
      onConflict: 'jt_game_id',
      ignoreDuplicates: false 
    })
    .select();

  if (error) {
    console.error('Error upserting games:', error);
    throw new Error(`Database error: ${error.message}`);
  }

  console.log(`Successfully synced ${upsertedGames?.length || 0} games`);
  return { synced: upsertedGames?.length || 0, games: upsertedGames };
}

async function syncSets(supabaseClient: any, apiKey: string, gameId: string) {
  console.log(`Syncing sets for game: ${gameId}`);
  
  // Normalize the game ID for API consistency
  const normalizedGameId = normalizeGameSlug(gameId);
  console.log(`Normalized game ID: ${gameId} -> ${normalizedGameId}`);

  // Get the internal game UUID from jt_game_id (use original, not normalized for DB lookup)
  const { data: gameData, error: gameError } = await supabaseClient
    .from('games')
    .select('id')
    .eq('jt_game_id', gameId) // Use original gameId for DB lookup
    .single();

  if (gameError || !gameData) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const { data: sets, totalFetched, pagesFetched, stoppedReason } = await fetchPaginatedData(
    buildJustTCGUrl('sets', { game: normalizedGameId }), // Use normalized for API
    createJustTCGHeaders(apiKey),
    { limit: 200, maxPages: 100, timeoutMs: 90000 }
  );

  console.log(`📊 Sets pagination complete: ${totalFetched} sets, ${pagesFetched} pages, stopped: ${stoppedReason}`);
  console.log(`Found ${sets.length} sets to sync`);

  // Upsert sets
  const setRecords = sets.map((set: any) => ({
    jt_set_id: set.set_id || set.id?.toString(),
    game_id: gameData.id,
    code: set.code,
    name: set.name,
    release_date: set.release_date,
    total_cards: set.total_cards ?? set.cards_count
  }));

  const { data: upsertedSets, error } = await supabaseClient
    .from('sets')
    .upsert(setRecords, { 
      onConflict: 'jt_set_id',
      ignoreDuplicates: false 
    })
    .select();

  if (error) {
    console.error('Error upserting sets:', error);
    throw new Error(`Database error: ${error.message}`);
  }

  // Update games.sets_count with accurate count and last_synced_at
  const { count: setsCount } = await supabaseClient
    .from('sets')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameData.id);

  if (setsCount !== null) {
    await supabaseClient
      .from('games')
      .update({ 
        sets_count: setsCount,
        last_synced_at: new Date().toISOString()
      })
      .eq('id', gameData.id);
  }

  console.log(`Successfully synced ${upsertedSets?.length || 0} sets`);
  return { synced: upsertedSets?.length || 0, sets: upsertedSets, gameId, setsCount, paginationInfo: { totalFetched, pagesFetched, stoppedReason } };
}

async function syncCards(supabaseClient: any, apiKey: string, setId: string) {
  console.log(`Syncing cards for set: ${setId}`);

  // Update set status to syncing
  await supabaseClient
    .from('sets')
    .update({ 
      sync_status: 'syncing',
      last_sync_error: null
    })
    .eq('jt_set_id', setId);

  try {
    // Get the set and game data - we need the set name and game JustTCG ID for the API call
    const { data: setData, error: setError } = await supabaseClient
      .from('sets')
      .select(`
        id, 
        game_id, 
        name,
        total_cards,
        games!inner(jt_game_id)
      `)
      .eq('jt_set_id', setId)
      .single();

    if (setError || !setData) {
      throw new Error(`Set not found: ${setId}`);
    }

    const gameId = setData.games.jt_game_id;
    const normalizedGameId = normalizeGameSlug(gameId);
    const setName = setData.name;
    const expectedTotalCards = setData.total_cards;
  
    console.log(`Fetching cards for game: ${gameId} (normalized: ${normalizedGameId}), set: ${setName} (expected: ${expectedTotalCards} cards)`);

    // Fetch all cards (singles) with robust pagination
    const { data: allCards, totalFetched, pagesFetched, stoppedReason } = await fetchPaginatedData<Card>(
      buildJustTCGUrl('cards', { game: normalizedGameId, set: setName }),
      createJustTCGHeaders(apiKey),
      { limit: 200, maxPages: 100, timeoutMs: 90000 }
    );

    console.log(`📊 Cards pagination complete: ${totalFetched} cards, ${pagesFetched} pages, stopped: ${stoppedReason}`);

    // Pokemon Japan empty results guard: Check for English-only sets
    if (normalizedGameId === 'pokemon-japan' && totalFetched === 0 && stoppedReason === 'empty_page') {
      console.log(`🔍 Pokemon Japan returned zero cards for set: ${setName}, probing for English-only set...`);
      
      const { hasEnglishCards, cardCount } = await probeEnglishOnlySet(setName, apiKey);
      
      if (hasEnglishCards) {
        const errorMessage = `Set "${setName}" appears to be English-only (found ${cardCount}+ cards under 'pokemon' game). This set may not have Japanese cards available. Consider syncing this set under the regular Pokemon game instead of Pokemon Japan.`;
        
        console.warn(`⚠️ English-only set detected: ${setName}`);
        
        // Update set with specific error status
        await supabaseClient
          .from('sets')
          .update({ 
            sync_status: 'error',
            last_sync_error: errorMessage
          })
          .eq('jt_set_id', setId);
        
        throw new Error(errorMessage);
      } else {
        console.log(`❌ Set "${setName}" truly has no cards in either pokemon-japan or pokemon games`);
      }
    }

    // Per docs: Sealed items are represented as variants (condition: "Sealed") on cards.
    // We intentionally skip separate sealed endpoints and rely solely on the cards endpoint.
    let allSealed: SealedProduct[] = [];
    console.log('Skipping sealed endpoint fetch; sealed variants will be captured within card variants.');
    
    // Log totals for visibility
    const totalItems = allCards.length;
    console.log(`Total items from cards endpoint: ${allCards.length}`);
    
    // Warn if we expected more items (optional informational log)
    if (expectedTotalCards && totalItems !== expectedTotalCards) {
      console.warn(`Item count mismatch vs set.total_cards. Expected: ${expectedTotalCards}, From cards: ${totalItems}`);
    }

    if (allCards.length === 0 && allSealed.length === 0) {
      console.log('No cards or sealed products found for this set');
      
      // For pokemon-japan, this should have been caught by the guard above
      // For other games, this is a normal empty set
      await supabaseClient
        .from('sets')
        .update({ 
          sync_status: 'completed',
          cards_synced_count: 0,
          sealed_synced_count: 0,
          last_synced_at: new Date().toISOString(),
          last_sync_error: null
        })
        .eq('jt_set_id', setId);
      return { synced: 0, cards: [], sealedSynced: 0, pricesSynced: 0 };
    }

  // Upsert cards
  const cardRecords = allCards.map(card => ({
    jt_card_id: card.id || card.card_id,
    set_id: setData.id,
    game_id: setData.game_id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    image_url: card.image_url || card.imageUrl,
    data: card as any // Store full card data as JSONB
  }));

  const { data: upsertedCards, error: cardError } = await supabaseClient
    .from('cards')
    .upsert(cardRecords, { 
      onConflict: 'jt_card_id',
      ignoreDuplicates: false 
    })
    .select();

  if (cardError) {
    console.error('Error upserting cards:', cardError);
    throw new Error(`Database error: ${cardError.message}`);
  }

  // Upsert sealed products
  let upsertedSealed: any[] = [];
  if (allSealed.length > 0) {
    const sealedRecords = allSealed.map(sealed => ({
      jt_product_id: sealed.id || sealed.product_id,
      set_id: setData.id,
      game_id: setData.game_id,
      name: sealed.name,
      product_type: sealed.product_type || sealed.type,
      image_url: sealed.image_url || sealed.imageUrl,
      data: sealed as any // Store full product data as JSONB
    }));

    const { data: sealedData, error: sealedError } = await supabaseClient
      .from('sealed_products')
      .upsert(sealedRecords, { 
        onConflict: 'jt_product_id',
        ignoreDuplicates: false 
      })
      .select();

    if (sealedError) {
      console.error('Error upserting sealed products:', sealedError);
    } else {
      upsertedSealed = sealedData || [];
      console.log(`Successfully synced ${upsertedSealed.length} sealed products`);
    }
  }

  // Upsert card prices from variants
  let totalPrices = 0;
  for (const card of allCards) {
    if (card.variants && Array.isArray(card.variants)) {
      const cardId = upsertedCards?.find(c => c.jt_card_id === (card.id || card.card_id))?.id;
      
      if (!cardId) {
        console.error(`Could not find card ID for ${card.name}`);
        continue;
      }

      for (const variant of card.variants) {
        const priceRecord = {
          card_id: cardId,
          variant: variant.printing || variant.variant || 'Normal',
          condition: variant.condition || 'Near Mint',
          currency: 'USD', // JustTCG uses USD
          market_price: variant.price || variant.market_price,
          low_price: variant.low_price,
          high_price: variant.high_price,
          source: 'JustTCG'
        };

        const { error: priceError } = await supabaseClient
          .from('card_prices')
          .upsert(priceRecord, { 
            onConflict: 'card_id,variant,condition,source',
            ignoreDuplicates: false 
          });

        if (priceError) {
          console.error('Error upserting price:', priceError, priceRecord);
        } else {
          totalPrices++;
        }
      }
    }
  }

  // Upsert sealed prices from variants
  for (const sealed of allSealed) {
    if (sealed.variants && Array.isArray(sealed.variants)) {
      const productId = upsertedSealed?.find(p => p.jt_product_id === (sealed.id || sealed.product_id))?.id;
      
      if (!productId) {
        console.error(`Could not find product ID for ${sealed.name}`);
        continue;
      }

      for (const variant of sealed.variants) {
        const priceRecord = {
          product_id: productId,
          variant: variant.printing || variant.variant || 'Normal',
          condition: variant.condition || 'Near Mint',
          currency: 'USD',
          market_price: variant.price || variant.market_price,
          low_price: variant.low_price,
          high_price: variant.high_price,
          source: 'JustTCG'
        };

        const { error: priceError } = await supabaseClient
          .from('sealed_prices')
          .upsert(priceRecord, { 
            onConflict: 'product_id,variant,condition,source',
            ignoreDuplicates: false 
          });

        if (priceError) {
          console.error('Error upserting sealed price:', priceError, priceRecord);
        } else {
          totalPrices++;
        }
      }
    }
  }

    // Update set with successful sync status and counts
    const { count: cardCount } = await supabaseClient
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .eq('set_id', setData.id);

    const { count: sealedCount } = await supabaseClient
      .from('sealed_products')
      .select('*', { count: 'exact', head: true })
      .eq('set_id', setData.id);

    await supabaseClient
      .from('sets')
      .update({ 
        sync_status: 'completed',
        cards_synced_count: cardCount || 0,
        sealed_synced_count: sealedCount || 0,
        last_synced_at: new Date().toISOString(),
        last_sync_error: null
      })
      .eq('jt_set_id', setId);

    console.log(`Successfully synced ${upsertedCards?.length || 0} cards, ${upsertedSealed?.length || 0} sealed products, and ${totalPrices} prices`);
    console.log(`📊 Pagination summary: ${totalFetched} items fetched, ${pagesFetched} pages, stopped: ${stoppedReason}`);
    return { 
      synced: upsertedCards?.length || 0, 
      cards: upsertedCards,
      sealedSynced: upsertedSealed?.length || 0,
      sealedProducts: upsertedSealed,
      pricesSynced: totalPrices,
      paginationInfo: { totalFetched, pagesFetched, stoppedReason }
    };
  } catch (error) {
    // Update set with error status
    await supabaseClient
      .from('sets')
      .update({ 
        sync_status: 'error',
        last_sync_error: error.message?.substring(0, 255) || 'Unknown error'
      })
      .eq('jt_set_id', setId);
    
    throw error;
  }
}

async function syncCardsBulk(supabaseClient: any, apiKey: string, setIds: string[], operationId?: string) {
  console.log(`Bulk syncing cards for ${setIds.length} sets with operation ID: ${operationId}`);
  
  const results = [];
  let totalCards = 0;
  let totalPrices = 0;
  let processedSets = 0;
  
  for (const setId of setIds) {
    // Check for cancellation signal if operation ID provided
    if (operationId) {
      try {
        const { data: cancelCheck } = await supabaseClient
          .from('sync_control')
          .select('should_cancel')
          .eq('operation_type', 'bulk_sync')
          .eq('operation_id', operationId)
          .single();
        
        if (cancelCheck?.should_cancel) {
          console.log(`Operation ${operationId} cancelled by admin`);
          results.push({ setId, success: false, error: 'Operation cancelled by admin' });
          continue;
        }
      } catch (error) {
        // If sync_control check fails, continue with sync
        console.log('Could not check cancellation status, continuing:', error);
      }
    }
    
    try {
      const result = await syncCards(supabaseClient, apiKey, setId);
      results.push({ setId, success: true, cards: result.synced, prices: result.pricesSynced });
      totalCards += result.synced;
      totalPrices += result.pricesSynced;
      processedSets++;
      console.log(`Processed set ${processedSets}/${setIds.length}: ${setId}`);
    } catch (error) {
      console.error(`Failed to sync set ${setId}:`, error);
      results.push({ setId, success: false, error: error.message });
    }
  }
  
  console.log(`Bulk sync complete: ${processedSets}/${setIds.length} sets, ${totalCards} cards, ${totalPrices} prices`);
  return {
    totalSets: setIds.length,
    processedSets,
    totalCards,
    totalPrices,
    results
  };
}