import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const apiKey = Deno.env.get('JUSTTCG_API_KEY');
    if (!apiKey) {
      console.error('JustTCG API key not found');
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
        const { operationId } = body;
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
  
  const response = await fetch('https://api.justtcg.com/v1/games', {
    headers: { 'X-API-KEY': apiKey }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`JustTCG API error: ${response.status} - ${errorText}`);
    throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Debug logging for response structure
  console.log('Response keys:', Object.keys(data));
  console.log('Full response sample:', JSON.stringify(data).substring(0, 500) + '...');
  
  // Robust parsing - try different response shapes
  let games: any[] = [];
  if (Array.isArray(data)) {
    games = data;
    console.log('Response is direct array with', games.length, 'items');
  } else if (data.games && Array.isArray(data.games)) {
    games = data.games;
    console.log('Found games array with', games.length, 'items');
  } else if (data.data && Array.isArray(data.data)) {
    games = data.data;
    console.log('Found data array with', games.length, 'items');
  } else if (data.data && data.data.games && Array.isArray(data.data.games)) {
    games = data.data.games;
    console.log('Found nested data.games array with', games.length, 'items');
  } else {
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

  // Get the internal game UUID from jt_game_id
  const { data: gameData, error: gameError } = await supabaseClient
    .from('games')
    .select('id')
    .eq('jt_game_id', gameId)
    .single();

  if (gameError || !gameData) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const response = await fetch(`https://api.justtcg.com/v1/sets?game=${encodeURIComponent(gameId)}`, {
    headers: { 'X-API-KEY': apiKey }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`JustTCG API error: ${response.status} - ${errorText}`);
    throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  // Debug response structure
  console.log('Sets response keys:', Object.keys(data));
  console.log('Sets response sample:', JSON.stringify(data).substring(0, 400) + '...');

  // Robust parsing for sets
  let sets: any[] = [];
  if (Array.isArray(data)) {
    sets = data;
  } else if (Array.isArray((data as any).sets)) {
    sets = (data as any).sets;
  } else if (Array.isArray((data as any).data)) {
    sets = (data as any).data;
  } else if ((data as any).data && Array.isArray((data as any).data.sets)) {
    sets = (data as any).data.sets;
  } else {
    console.error('Could not find sets array in response structure');
    return { synced: 0, sets: [] };
  }

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
    const setName = setData.name;
    const expectedTotalCards = setData.total_cards;
  
    console.log(`Fetching cards for game: ${gameId}, set: ${setName} (expected: ${expectedTotalCards} cards)`);

    // Fetch all cards with pagination
    let allCards: Card[] = [];
    let page = 1;
    let hasMore = true;
    const limit = 200; // Maximum for Pro/Enterprise plans

    while (hasMore) {
      const url = new URL('https://api.justtcg.com/v1/cards');
      url.searchParams.set('game', gameId);
      url.searchParams.set('set', setName);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('page', page.toString());

      console.log(`Fetching page ${page} of cards...`);

      const response = await fetch(url.toString(), {
        headers: { 'X-API-KEY': apiKey }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`JustTCG API error: ${response.status} - ${errorText}`);
        throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
      }

      const responseData = await response.json();
      
      if (page === 1) {
        console.log('API response keys:', Object.keys(responseData));
        // Log metadata if available
        if (responseData._metadata) {
          console.log('API metadata:', responseData._metadata);
        }
        if (responseData.meta) {
          console.log('API meta:', responseData.meta);
        }
      }
      
      // Parse response - JustTCG returns { data: Card[] }
      const pageCards: Card[] = responseData.data || responseData.cards || responseData || [];
      console.log(`Page ${page}: Found ${pageCards.length} cards`);
      
      if (pageCards.length === 0) {
        hasMore = false;
      } else {
        allCards = allCards.concat(pageCards);
        
        // Check if we have more pages
        // If we got less than the limit, we're on the last page
        if (pageCards.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
        
        // Safety check to prevent infinite loops
        if (page > 20) {
          console.warn('Reached maximum page limit (20), stopping pagination');
          hasMore = false;
        }
      }
    }

    console.log(`Total cards fetched across ${page} pages: ${allCards.length}`);
    
    // Log discrepancy if expected vs actual count differs
    if (expectedTotalCards && allCards.length !== expectedTotalCards) {
      console.warn(`Card count mismatch! Expected: ${expectedTotalCards}, Fetched: ${allCards.length}`);
    }

  if (allCards.length === 0) {
    console.log('No cards found for this set');
    await supabaseClient
      .from('sets')
      .update({ 
        sync_status: 'completed',
        cards_synced_count: 0,
        last_synced_at: new Date().toISOString(),
        last_sync_error: null
      })
      .eq('jt_set_id', setId);
    return { synced: 0, cards: [], pricesSynced: 0 };
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
          source: 'justtcg'
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

    // Update set with successful sync status and card count
    const { count: cardCount } = await supabaseClient
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .eq('set_id', setData.id);

    await supabaseClient
      .from('sets')
      .update({ 
        sync_status: 'completed',
        cards_synced_count: cardCount || 0,
        last_synced_at: new Date().toISOString(),
        last_sync_error: null
      })
      .eq('jt_set_id', setId);

    console.log(`Successfully synced ${upsertedCards?.length || 0} cards and ${totalPrices} prices`);
    return { 
      synced: upsertedCards?.length || 0, 
      cards: upsertedCards,
      pricesSynced: totalPrices 
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