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

    const { action, gameId, setId } = await req.json();
    console.log(`Starting JustTCG sync action: ${action}`, { gameId, setId });

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
  const games: Game[] = data.games || [];

  console.log(`Found ${games.length} games to sync`);

  // Upsert games
  const gameRecords = games.map(game => ({
    jt_game_id: game.game_id,
    name: game.name,
    slug: game.slug,
    sets_count: game.sets_count,
    cards_count: game.cards_count
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

  const response = await fetch(`https://api.justtcg.com/v1/games/${gameId}/sets`, {
    headers: { 'X-API-KEY': apiKey }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`JustTCG API error: ${response.status} - ${errorText}`);
    throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const sets: Set[] = data.sets || [];

  console.log(`Found ${sets.length} sets to sync`);

  // Upsert sets
  const setRecords = sets.map(set => ({
    jt_set_id: set.set_id,
    game_id: gameData.id,
    code: set.code,
    name: set.name,
    release_date: set.release_date,
    total_cards: set.total_cards
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

  console.log(`Successfully synced ${upsertedSets?.length || 0} sets`);
  return { synced: upsertedSets?.length || 0, sets: upsertedSets };
}

async function syncCards(supabaseClient: any, apiKey: string, setId: string) {
  console.log(`Syncing cards for set: ${setId}`);

  // Get the internal set UUID and game UUID from jt_set_id
  const { data: setData, error: setError } = await supabaseClient
    .from('sets')
    .select('id, game_id')
    .eq('jt_set_id', setId)
    .single();

  if (setError || !setData) {
    throw new Error(`Set not found: ${setId}`);
  }

  const response = await fetch(`https://api.justtcg.com/v1/sets/${setId}/cards`, {
    headers: { 'X-API-KEY': apiKey }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`JustTCG API error: ${response.status} - ${errorText}`);
    throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const cards: Card[] = data.cards || [];

  console.log(`Found ${cards.length} cards to sync`);

  // Upsert cards
  const cardRecords = cards.map(card => ({
    jt_card_id: card.card_id,
    set_id: setData.id,
    game_id: setData.game_id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    image_url: card.image_url,
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

  // Upsert card prices
  let totalPrices = 0;
  for (const card of cards) {
    if (card.variants) {
      for (const variant of card.variants) {
        for (const condition of variant.conditions) {
          const priceRecord = {
            card_id: upsertedCards?.find(c => c.jt_card_id === card.card_id)?.id,
            variant: variant.variant,
            condition: condition.condition,
            currency: condition.currency,
            market_price: condition.market_price,
            low_price: condition.low_price,
            high_price: condition.high_price
          };

          const { error: priceError } = await supabaseClient
            .from('card_prices')
            .upsert(priceRecord, { 
              onConflict: 'card_id,variant,condition,source',
              ignoreDuplicates: false 
            });

          if (priceError) {
            console.error('Error upserting price:', priceError);
          } else {
            totalPrices++;
          }
        }
      }
    }
  }

  console.log(`Successfully synced ${upsertedCards?.length || 0} cards and ${totalPrices} prices`);
  return { 
    synced: upsertedCards?.length || 0, 
    cards: upsertedCards,
    pricesSynced: totalPrices 
  };
}