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

  // For long-running operations, detect background sync mode
  const isBackgroundSync = req.headers.get('x-background-sync') === 'true';

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

    const body = await req.json();
    const { action, gameId, setId, setIds, operationId } = body;
    console.log(`Starting JustTCG sync action: ${action}`, { gameId, setId, setIds, operationId });

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
        
        // For background sync, return immediately and continue processing
        if (isBackgroundSync) {
          EdgeRuntime.waitUntil(syncCards(supabaseClient, setId));
          return new Response(
            JSON.stringify({ started: true, setId, operationId }),
            { 
              status: 202,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        
        result = await syncCards(supabaseClient, setId);
        break;
      case 'sync-cards-bulk':
        if (!setIds || !Array.isArray(setIds)) throw new Error('setIds array required for sync-cards-bulk');
        
        // For background sync, return immediately and continue processing
        if (isBackgroundSync) {
          EdgeRuntime.waitUntil(syncCardsBulk(supabaseClient, setIds, operationId));
          return new Response(
            JSON.stringify({ started: true, setIds, operationId }),
            { 
              status: 202,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        
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
      last_synced_at: new Date().toISOString() 
    })
    .eq('jt_set_id', setId);

  // Function to check for cancellation signals
  async function shouldCancel(): Promise<boolean> {
    try {
      const { data } = await supabaseClient
        .from('sync_control')
        .select('should_cancel')
        .eq('operation_type', 'force_stop')
        .limit(1)
        .single();
      
      return data?.should_cancel === true;
    } catch (error) {
      // If we can't check cancellation status, continue
      return false;
    }
  }

  // Check for cancellation before starting
  if (await shouldCancel()) {
    console.log(`🛑 Sync cancelled by admin for set: ${setId}`);
    throw new Error('Sync cancelled by admin');
  }

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

    // Check for cancellation before fetching cards
    if (await shouldCancel()) {
      console.log(`🛑 Sync cancelled by admin before card fetch for set: ${setId}`);
      throw new Error('Sync cancelled by admin');
    }

    // Get all cards for this set using complete pagination
    console.log(`🃏 Fetching all cards for set: ${setName} in game: ${normalizedGameId}`);
    console.log(`🔍 Calling listAllCardsBySet with params:`, { gameId: normalizedGameId, setId: setName });
    
    // Define outside try so they're available later
    let allCards: any[] = [];
    let cardsMeta: any = undefined;
    try {
      const cardsResult = await listAllCardsBySet({ 
        gameId: normalizedGameId, 
        setId: setName 
      });
      // listAllCardsBySet in edge helpers returns a plain array
      const rawResult: any = cardsResult as any;
      if (Array.isArray(rawResult)) {
        allCards = rawResult;
        cardsMeta = undefined;
      } else {
        allCards = rawResult.items || rawResult.data || [];
        cardsMeta = rawResult.meta || rawResult._metadata;
      }
      
      console.log(`✅ Retrieved ${allCards.length} cards with pagination meta:`, cardsMeta);
      console.log(`🔍 cardsResult structure:`, { 
        isArray: Array.isArray(rawResult),
        hasItems: !Array.isArray(rawResult) && !!rawResult.items, 
        itemsLength: !Array.isArray(rawResult) ? rawResult.items?.length : rawResult.length, 
        hasMeta: !Array.isArray(rawResult) && !!rawResult.meta,
        rawResultType: typeof rawResult,
        rawResultKeys: Array.isArray(rawResult) ? ['array'] : Object.keys(rawResult)
      });
    } catch (apiError) {
      console.error(`❌ API call failed:`, apiError);
      throw new Error(`Failed to fetch cards from JustTCG API: ${apiError.message}`);
    }

    // Check for cancellation after fetching cards
    if (await shouldCancel()) {
      console.log(`🛑 Sync cancelled by admin after card fetch for set: ${setId}`);
      throw new Error('Sync cancelled by admin');
    }

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
      
      // If we expected cards but got none, mark as error, not completed
      const syncStatus = expectedTotalCards && expectedTotalCards > 0 ? 'error' : 'completed';
      const errorMessage = expectedTotalCards && expectedTotalCards > 0 
        ? `Expected ${expectedTotalCards} cards but found 0. This may indicate an API issue or the set may not be available.`
        : null;
      
      await supabaseClient
        .from('sets')
        .update({ 
          sync_status: syncStatus,
          cards_synced_count: 0,
          sealed_synced_count: 0,
          last_synced_at: new Date().toISOString(),
          last_sync_error: errorMessage
        })
        .eq('jt_set_id', setId);
      
      return { 
        setId,
        totalCards: 0,
        totalSealed: 0,
        pricesSynced: 0,
        message: errorMessage || 'No cards or sealed products found for this set'
      };
    }

    // Check for cancellation before upserting cards
    if (await shouldCancel()) {
      console.log(`🛑 Sync cancelled by admin before card upsert for set: ${setId}`);
      throw new Error('Sync cancelled by admin');
    }

  // Upsert cards (dedupe by jt_card_id to avoid ON CONFLICT double-update)
  const cardRecordsRaw = allCards.map(card => ({
    jt_card_id: (card as any).id || (card as any).card_id,
    set_id: setData.id,
    game_id: setData.game_id,
    name: card.name,
    number: (card as any).number,
    rarity: (card as any).rarity,
    image_url: (card as any).image_url || (card as any).imageUrl,
    data: card as any // Store full card data as JSONB
  }));

  const cardMap = new Map<string, any>();
  for (const rec of cardRecordsRaw) {
    if (!rec.jt_card_id) continue;
    cardMap.set(rec.jt_card_id, rec); // last write wins
  }
  const cardRecords = Array.from(cardMap.values());
  if (cardRecords.length !== cardRecordsRaw.length) {
    console.warn(`🧹 Deduped card records: input=${cardRecordsRaw.length}, unique=${cardRecords.length}`);
  }

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

  console.log(`Successfully upserted ${upsertedCards?.length || 0} cards for set: ${setId}`);

  // Update cards synced count immediately after cards upsert
  await supabaseClient
    .from('sets')
    .update({ 
      cards_synced_count: upsertedCards?.length || 0,
      last_synced_at: new Date().toISOString()
    })
    .eq('jt_set_id', setId);

  // Extract sealed products from card variants
  allSealed = allCards.reduce((acc: SealedProduct[], card: Card) => {
    try {
      if (card.variants && Array.isArray(card.variants)) {
        card.variants.forEach(variant => {
          try {
            // Support both shapes: variant.condition or variant.conditions[]
            const conditionsArray = (variant as any).conditions as any[] | undefined;
            if (conditionsArray && Array.isArray(conditionsArray)) {
              conditionsArray.forEach(condition => {
                if (condition && condition.condition === 'Sealed') {
                  const sealedProduct: SealedProduct = {
                    product_id: (card as any).card_id + '-' + (variant.variant || 'sealed'),
                    set_id: setData.id,
                    game_id: setData.game_id,
                    name: `${card.name} (${variant.variant || 'Sealed'})`,
                    product_type: variant.variant || 'Sealed',
                    image_url: (card as any).image_url || (card as any).imageUrl,
                    variants: [variant]
                  };
                  acc.push(sealedProduct);
                }
              });
            } else if ((variant as any).condition === 'Sealed') {
              const sealedProduct: SealedProduct = {
                product_id: (card as any).card_id + '-' + (variant.variant || 'sealed'),
                set_id: setData.id,
                game_id: setData.game_id,
                name: `${card.name} (${variant.variant || 'Sealed'})`,
                product_type: variant.variant || 'Sealed',
                image_url: (card as any).image_url || (card as any).imageUrl,
                variants: [variant]
              };
              acc.push(sealedProduct);
            }
          } catch (variantError) {
            console.error(`Error processing variant for sealed extraction from card ${card.id}:`, variantError.message);
          }
        });
      }
    } catch (cardError) {
      console.error(`Error processing card ${card.id} for sealed extraction:`, cardError.message);
    }
    return acc;
  }, []);

  console.log(`Found ${allSealed.length} sealed products within card variants`);

  // Upsert sealed products (dedupe by jt_product_id)
  const sealedRecordsRaw = allSealed.map(sealed => ({
    jt_product_id: sealed.product_id,
    set_id: setData.id,
    game_id: setData.game_id,
    name: sealed.name,
    product_type: sealed.product_type,
    image_url: sealed.image_url,
    data: sealed as any // Store full sealed data as JSONB
  }));

  const sealedMap = new Map<string, any>();
  for (const rec of sealedRecordsRaw) {
    if (!rec.jt_product_id) continue;
    sealedMap.set(rec.jt_product_id, rec);
  }
  const sealedRecords = Array.from(sealedMap.values());
  if (sealedRecords.length !== sealedRecordsRaw.length) {
    console.warn(`🧹 Deduped sealed records: input=${sealedRecordsRaw.length}, unique=${sealedRecords.length}`);
  }

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

  console.log(`Successfully upserted ${upsertedSealed?.length || 0} sealed products for set: ${setId}`);

  // Update sealed synced count
  await supabaseClient
    .from('sets')
    .update({ 
      sealed_synced_count: upsertedSealed?.length || 0,
      last_synced_at: new Date().toISOString()
    })
    .eq('jt_set_id', setId);

  // Check for cancellation before pricing sync
  if (await shouldCancel()) {
    console.log(`🛑 Sync cancelled by admin before pricing sync for set: ${setId}`);
    throw new Error('Sync cancelled by admin');
  }

  // Build a map of JustTCG card IDs to our database card UUIDs for pricing linkage
  const cardIdMap = new Map();
  if (upsertedCards) {
    upsertedCards.forEach(dbCard => {
      cardIdMap.set(dbCard.jt_card_id, dbCard.id);
    });
  }

  // Fetch and store pricing data for all cards in batches
  console.log(`📊 Processing pricing for ${allCards.length} cards...`);
  let pricesSynced = 0;
  const batchSize = 10;
  
  for (let i = 0; i < allCards.length; i += batchSize) {
    const batch = allCards.slice(i, i + batchSize);
    console.log(`📦 Processing pricing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allCards.length/batchSize)}`);
    
    for (const card of batch) {
    const dbCardId = cardIdMap.get(card.id || card.card_id);
    if (!dbCardId) {
      console.warn(`No database card ID found for JustTCG card: ${card.id || card.card_id}`);
      continue;
    }

    if (card.variants && Array.isArray(card.variants)) {
      for (const variant of card.variants) {
        try {
          // Handle different variant structures
          if (variant.conditions && Array.isArray(variant.conditions)) {
            for (const condition of variant.conditions) {
              const pricingRecord = {
                card_id: dbCardId,
                variant: variant.variant || variant.printing || 'Normal',
                condition: condition.condition,
                currency: condition.currency || 'USD',
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
          } else if (variant.condition && variant.price !== undefined) {
            // Handle direct variant structure (legacy format)
            const pricingRecord = {
              card_id: dbCardId,
              variant: variant.variant || variant.printing || 'Normal',
              condition: variant.condition,
              currency: variant.currency || 'USD',
              market_price: variant.price,
              low_price: variant.lowPrice,
              high_price: variant.highPrice,
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
        } catch (variantError) {
          console.error(`Error processing variant for card ${card.id}:`, variantError.message);
          console.error('Variant structure:', JSON.stringify(variant, null, 2));
        }
      }
    }
    
    // Update progress every batch
    if ((i + batchSize) % 50 === 0 || i + batchSize >= allCards.length) {
      console.log(`📈 Processed pricing for ${Math.min(i + batchSize, allCards.length)}/${allCards.length} cards`);
      await supabaseClient
        .from('sets')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('jt_set_id', setId);
    }
  }

  // Query the actual count of cards in database to get accurate count
  const { count: actualDbCount } = await supabaseClient
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .eq('set_id', setData.id);
  
  const actualCardsCount = actualDbCount || 0;
  
  // Determine sync status based on whether we got all expected cards
  const isComplete = !expectedTotalCards || actualCardsCount === expectedTotalCards;
  const syncStatus = isComplete ? 'completed' : 'partial';
  const syncError = isComplete ? null : `Expected ${expectedTotalCards} cards but only synced ${actualCardsCount}`;

  // Final update set sync status to completed
  console.log(`🏁 Finalizing sync for set: ${setId}`);
  await supabaseClient
    .from('sets')
    .update({ 
      sync_status: syncStatus,
      cards_synced_count: actualCardsCount, // Use actual database count
      sealed_synced_count: upsertedSealed?.length || 0,
      last_synced_at: new Date().toISOString(),
      last_sync_error: syncError
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
    
    // Determine if this was a cancellation or other error
    const isCancellation = error.message?.includes('cancelled by admin');
    const finalStatus = isCancellation ? 'cancelled' : 'error';
    
    // Update set with error status
    await supabaseClient
      .from('sets')
      .update({ 
        sync_status: finalStatus,
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
