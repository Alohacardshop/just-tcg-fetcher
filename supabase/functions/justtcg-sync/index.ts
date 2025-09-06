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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function handleRequest(req: Request): Promise<Response> {
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
      return json({ error: 'API key not configured' }, 500);
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
          return json({ started: true, setId, operationId }, 202);
        }
        
        result = await syncCards(supabaseClient, setId);
        break;
      case 'sync-cards-bulk':
        if (!setIds || !Array.isArray(setIds)) throw new Error('setIds array required for sync-cards-bulk');
        
        // For background sync, return immediately and continue processing
        if (isBackgroundSync) {
          EdgeRuntime.waitUntil(syncCardsBulk(supabaseClient, setIds, operationId));
          return json({ started: true, setIds, operationId }, 202);
        }
        
        result = await syncCardsBulk(supabaseClient, setIds, operationId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return json(result);

  } catch (error) {
    console.error('Error in justtcg-sync function:', error);
    return json({ error: error.message }, 500);
  }
}

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
    // listAllCardsBySet in edge helpers returns a plain array with defensive guards
    const rawResult: any = cardsResult as any;
    if (Array.isArray(rawResult)) {
      allCards = rawResult;
      cardsMeta = undefined;
    } else {
      // Defensive guards for non-array results
      const safeResult = rawResult && typeof rawResult === 'object' ? rawResult : {};
      allCards = Array.isArray(safeResult.items) ? safeResult.items : 
                  Array.isArray(safeResult.data) ? safeResult.data : [];
      cardsMeta = safeResult.meta || safeResult._metadata;
    }
    
    console.log(`✅ Retrieved ${allCards.length} cards with pagination meta:`, cardsMeta);
    console.log(`🔍 cardsResult structure:`, { 
      isArray: Array.isArray(rawResult),
      hasItems: !Array.isArray(rawResult) && !!rawResult?.items, 
      itemsLength: !Array.isArray(rawResult) ? (rawResult?.items?.length ?? 0) : rawResult.length, 
      hasMeta: !Array.isArray(rawResult) && !!rawResult?.meta,
      rawResultType: typeof rawResult,
      rawResultKeys: Array.isArray(rawResult) ? ['array'] : (rawResult ? Object.keys(rawResult) : [])
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
  
  // Log totals for visibility with defensive guards
  const totalItems = Array.isArray(allCards) ? allCards.length : 0;
  console.log(`Total items from cards endpoint: ${totalItems}`);
  
  // Warn if we expected more items (optional informational log)
  if (expectedTotalCards && totalItems !== expectedTotalCards) {
    console.warn(`Item count mismatch vs set.total_cards. Expected: ${expectedTotalCards}, From cards: ${totalItems}`);
  }

  if ((Array.isArray(allCards) ? allCards.length : 0) === 0 && (Array.isArray(allSealed) ? allSealed.length : 0) === 0) {
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

  // Process cards (simplified version - keeping the core logic)
  const cardRecords = allCards.map((card: any) => ({
    jt_card_id: card.card_id || card.id?.toString(),
    set_id: setData.id,
    game_id: setData.game_id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    image_url: card.image_url,
    data: card // Store complete card data as JSONB
  }));

  if (cardRecords.length > 0) {
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

    console.log(`Successfully upserted ${upsertedCards?.length || 0} cards`);
  }

  // Update set status to completed
  await supabaseClient
    .from('sets')
    .update({ 
      sync_status: 'completed',
      cards_synced_count: Array.isArray(cardRecords) ? cardRecords.length : 0,
      sealed_synced_count: Array.isArray(allSealed) ? allSealed.length : 0,
      last_synced_at: new Date().toISOString(),
      last_sync_error: null
    })
    .eq('jt_set_id', setId);

  console.log(`Card sync completed for set: ${setId}`);
  return { 
    setId,
    synced: Array.isArray(cardRecords) ? cardRecords.length : 0,
    totalCards: Array.isArray(allCards) ? allCards.length : 0,
    totalSealed: Array.isArray(allSealed) ? allSealed.length : 0,
    totalFetched: Array.isArray(allCards) ? allCards.length : 0, 
    meta: cardsMeta,
    stoppedReason: 'completed'
  };
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

Deno.serve(handleRequest);
