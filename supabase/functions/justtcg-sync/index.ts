import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  fetchFromJustTCG, 
  fetchPaginatedData, 
  extractDataFromEnvelope,
  normalizeGameSlug,
  probeEnglishOnlySet,
  fetchJsonWithRetry,
  listAllSets,
  listAllCardsBySet,
  buildUrl,
  authHeaders
} from './api-helpers.ts';
import { logOperationStart, logOperationSuccess, logOperationError, logEarlyReturn, createTimer } from './telemetry.ts';

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

    try {
      // Verify API key is available
      authHeaders();
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
        result = await syncGames(supabaseClient);
        break;
      case 'sync-sets':
        if (!gameId) throw new Error('gameId required for sync-sets');
        result = await syncSets(supabaseClient, gameId);
        break;
      case 'sync-cards':
        if (!setId) throw new Error('setId required for sync-cards');
        result = await syncCards(supabaseClient, setId);
        break;
      case 'sync-cards-bulk':
        if (!setIds || !Array.isArray(setIds)) throw new Error('setIds array required for sync-cards-bulk');
        const operationId = body.operationId;
        result = await syncCardsBulk(supabaseClient, setIds, operationId);
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

async function syncGames(supabaseClient: any) {
  const operation = 'sync-games';
  const timer = createTimer();
  timer.start();
  
  logOperationStart(operation);
  console.log('Syncing games from JustTCG...');
  
  const url = buildUrl('games');
  const data = await fetchJsonWithRetry(url);
  
  // Debug logging for response structure
  console.log('Response keys:', Object.keys(data));
  console.log('Full response sample:', JSON.stringify(data).substring(0, 500) + '...');
  
  // Use unified envelope extraction
  const { data: games } = extractDataFromEnvelope(data);
  
  if (games.length === 0) {
    const duration = timer.end();
    logEarlyReturn(operation, 'No games array found in response', { duration });
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
    const duration = timer.end();
    logOperationError(operation, `Database error: ${error.message}`, { 
      duration,
      gamesCount: gameRecords.length 
    });
    console.error('Error upserting games:', error);
    throw new Error(`Database error: ${error.message}`);
  }

  const duration = timer.end();
  logOperationSuccess(operation, {
    duration,
    synced: upsertedGames?.length || 0,
    totalGames: games.length
  });
  console.log(`Successfully synced ${upsertedGames?.length || 0} games`);
  return { synced: upsertedGames?.length || 0, games: upsertedGames };
}

async function syncSets(supabaseClient: any, gameId: string) {
  const operation = 'sync-sets';
  const timer = createTimer();
  timer.start();
  
  logOperationStart(operation, { game: gameId });
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
    const duration = timer.end();
    logEarlyReturn(operation, `Game not found: ${gameId}`, { 
      game: gameId,
      duration 
    });
    throw new Error(`Game not found: ${gameId}`);
  }

  // Use complete pagination to get all sets
  const sets = await listAllSets(normalizedGameId, 200);

  console.log(`📊 Complete sets fetch: ${sets.length} sets retrieved`);
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
  return { synced: upsertedSets?.length || 0, sets: upsertedSets, gameId, setsCount };
}

async function syncCards(supabaseClient: any, setId: string) {
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

    // Get all cards for this set using complete pagination
    console.log(`🃏 Fetching all cards for set: ${setId} in game: ${gameId}`);
    const { items: allCards, meta: cardsMeta } = await listAllCardsBySet({ 
      gameId: normalizedGameId, 
      setId: setName 
    });
    console.log(`✅ Retrieved ${allCards.length} cards with pagination meta:`, cardsMeta);

    // Pokemon Japan empty results guard: Check for English-only sets
    if (normalizedGameId === 'pokemon-japan' && allCards.length === 0) {
      console.log(`🔍 Pokemon Japan returned zero cards for set: ${setName}, probing for English-only set...`);
      
      const { hasEnglishCards, cardCount } = await probeEnglishOnlySet(setName);
      
      if (hasEnglishCards) {
        const errorMessage = `Set \"${setName}\" appears to be English-only (found ${cardCount}+ cards under 'pokemon' game). This set may not have Japanese cards available. Consider syncing this set under the regular Pokemon game instead of Pokemon Japan.`;
        
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
        console.log(`❌ Set \"${setName}\" truly has no cards in either pokemon-japan or pokemon games`);
      }
    }

    // Per docs: Sealed items are represented as variants (condition: \"Sealed\") on cards.
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

  // Extract sealed products from card variants
  allSealed = allCards.reduce((acc: SealedProduct[], card: Card) => {
    if (card.variants) {
      card.variants.forEach(variant => {
        variant.conditions?.forEach(condition => {
          if (condition.condition === 'Sealed') {
            const sealedProduct: SealedProduct = {
              product_id: card.card_id + '-' + variant.variant, // Unique ID
              set_id: setData.id,
              game_id: setData.game_id,
              name: `${card.name} (${variant.variant})`,
              product_type: variant.variant,
              image_url: card.image_url || card.imageUrl,
              variants: [variant]
            };
            acc.push(sealedProduct);
          }
        });
      });
    }
    return acc;
  }, []);

  console.log(`Found ${allSealed.length} sealed products within card variants`);

  // Upsert sealed products
  const sealedRecords = allSealed.map(sealed => ({
    jt_product_id: sealed.product_id,
    set_id: setData.id,
    game_id: setData.game_id,
    name: sealed.name,
    product_type: sealed.product_type,
    image_url: sealed.image_url,
    data: sealed as any // Store full sealed data as JSONB
  }));

  const { data: upsertedSealed, error: sealedError } = await supabaseClient
    .from('sealed_products')
    .upsert(sealedRecords, { 
      onConflict: 'jt_product_id',
      ignoreDuplicates: false 
    })
    .select();

  if (sealedError) {
    console.error('Error upserting sealed products:', sealedError);
    throw new Error(`Database error: ${sealedError.message}`);
  }

  // Fetch and store pricing data for all cards
  let pricesSynced = 0;
  for (const card of allCards) {
    if (card.variants) {
      for (const variant of card.variants) {
        if (variant.conditions) {
          for (const condition of variant.conditions) {
            const pricingRecord = {
              card_id: card.id || card.card_id,
              variant: variant.variant,
              condition: condition.condition,
              currency: condition.currency,
              market_price: condition.market_price,
              low_price: condition.low_price,
              high_price: condition.high_price,
              source: 'JustTCG',
              fetched_at: new Date().toISOString()
            };

            const { error: priceError } = await supabaseClient
              .from('card_prices')
              .upsert(pricingRecord, { 
                onConflict: 'card_id,variant,condition,source',
                ignoreDuplicates: false 
              });

            if (priceError) {
              console.error('Error upserting pricing:', priceError);
            } else {
              pricesSynced++;
            }
          }
        }
      }
    }
  }

  // Update set with sync completion status and counts
  await supabaseClient
    .from('sets')
    .update({ 
      sync_status: 'completed',
      cards_synced_count: upsertedCards?.length || 0,
      sealed_synced_count: upsertedSealed?.length || 0,
      last_synced_at: new Date().toISOString(),
      last_sync_error: null
    })
    .eq('jt_set_id', setId);

  console.log(`Successfully synced ${upsertedCards?.length || 0} cards, ${upsertedSealed?.length || 0} sealed products, and ${pricesSynced} prices`);
  return { 
    synced: upsertedCards?.length || 0, 
    cards: upsertedCards, 
    sealedSynced: upsertedSealed?.length || 0, 
    sealed: upsertedSealed,
    pricesSynced,
    paginationInfo: { 
      totalFetched: allCards.length, 
      meta: cardsMeta,
      stoppedReason: 'completed'
    }
  };
  
  } catch (error) {
    console.error('Error syncing cards:', error);
    
    // Update set with error status
    await supabaseClient
      .from('sets')
      .update({ 
        sync_status: 'error',
        last_sync_error: error.message
      })
      .eq('jt_set_id', setId);
      
    throw error;
  }
}

async function syncCardsBulk(supabaseClient: any, setIds: string[], operationId?: string) {
  console.log(`Starting bulk card sync for ${setIds.length} sets`, { operationId });
  
  const results = [];
  let totalSynced = 0;
  let errors = 0;
  
  // Function to check for cancellation signals
  async function shouldCancel(): Promise<boolean> {
    if (!operationId) return false;
    
    try {
      const { data } = await supabaseClient
        .from('sync_control')
        .select('should_cancel')
        .eq('operation_type', 'bulk_sync')
        .eq('operation_id', operationId)
        .single();
      
      return data?.should_cancel === true;
    } catch (error) {
      // If we can't check cancellation status, continue
      return false;
    }
  }
  
  for (const setId of setIds) {
    // Check for cancellation before processing each set
    if (await shouldCancel()) {
      console.log(`🛑 Bulk sync cancelled by admin for operation: ${operationId}`);
      results.push({ setId, success: false, error: 'Cancelled by admin' });
      break;
    }
    
    try {
      console.log(`Syncing set ${setId} (${results.length + 1}/${setIds.length})`);
      const result = await syncCards(supabaseClient, setId);
      results.push({ setId, success: true, ...result });
      totalSynced += result.synced || 0;
    } catch (error) {
      console.error(`Error syncing set ${setId}:`, error.message);
      results.push({ setId, success: false, error: error.message });
      errors++;
    }
  }
  
  console.log(`Bulk sync complete: ${totalSynced} cards synced, ${errors} errors`);
  return { 
    operationId, 
    totalSets: setIds.length, 
    totalSynced, 
    errors, 
    results 
  };
}
