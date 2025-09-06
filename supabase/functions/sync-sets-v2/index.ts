/**
 * Sync Sets V2 - Hardened with Defensive Guards
 * 
 * This function implements defensive programming patterns to prevent crashes
 * from undefined arrays, null responses, and other edge cases.
 * All shared code is included directly in this file as required for edge functions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

// ===== SHARED API HELPERS =====

/**
 * Gets the JustTCG API key from environment
 */
function getJustTCGApiKey(): string {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not configured in environment');
  }
  return apiKey;
}

/**
 * Normalizes game slugs for JustTCG API consistency
 */
function normalizeGameSlug(gameSlug: string): string {
  const normalized = gameSlug.toLowerCase().trim();
  const normalizationMap: Record<string, string> = {
    'pokemon-tcg': 'pokemon',
    'pokemon-english': 'pokemon',
    'pokemon-us': 'pokemon',
    'pokemon-en': 'pokemon',
    'pokemon-global': 'pokemon',
    'pokemon-international': 'pokemon',
    'pokemon-tcg-english': 'pokemon',
    'pokemon-jp': 'pokemon-japan',
    'pokemon-japanese': 'pokemon-japan',
    'pokemon-japan-tcg': 'pokemon-japan',
    'magic-the-gathering': 'magic',
    'mtg': 'magic',
    'magic-tcg': 'magic',
    'yugioh': 'yu-gi-oh',
    'yugioh-tcg': 'yu-gi-oh',
    'ygo': 'yu-gi-oh'
  };
  return normalizationMap[normalized] || normalized;
}

/**
 * Builds JustTCG API URL with proper base and parameters
 */
function buildUrl(path: string, params: Record<string, string | number> = {}): string {
  const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';
  const url = new URL(`${JUSTTCG_BASE_URL}/${path}`);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  
  return url.toString();
}

/**
 * Returns standardized authentication headers for JustTCG API
 */
function createJustTCGHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) {
    throw new Error('API key is required for JustTCG headers');
  }
  
  return {
    'X-API-Key': apiKey,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Supabase-Edge-Function/1.0'
  };
}

/**
 * Fetch with retry logic and proper error handling
 */
async function fetchJsonWithRetry(
  url: string,
  tries = 3,
  delay = 1000
): Promise<any> {
  const apiKey = getJustTCGApiKey();
  const headers = createJustTCGHeaders(apiKey);
  
  for (let attempt = 1; attempt <= tries; attempt++) {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 JustTCG API attempt ${attempt}/${tries}: ${url}`);
      
      const response = await fetch(url, { 
        method: 'GET',
        headers 
      });
      
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ JustTCG API success on attempt ${attempt} (${duration}ms)`);
        return data;
      } else {
        throw {
          status: response.status,
          message: `JustTCG API error: ${response.status} - ${response.statusText}`,
          response
        };
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (attempt === tries) {
        console.error(`❌ JustTCG API failed after ${tries} attempts (${duration}ms):`, error);
        throw error;
      } else {
        console.warn(`⚠️ JustTCG API attempt ${attempt} failed (${duration}ms), retrying in ${delay}ms:`, error.message || error);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
      }
    }
  }
}

// CORS headers for web app compatibility
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function routeRequest(req: Request): Promise<Response> {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Parse request body with defensive guards
    let requestData: { gameId?: string; background?: boolean };
    try {
      const body = await req.text();
      requestData = body ? JSON.parse(body) : {};
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required parameters with defensive guards
    const gameId = typeof requestData.gameId === 'string' ? requestData.gameId.trim() : '';
    const isBackground = Boolean(requestData.background);

    if (!gameId) {
      return new Response(
        JSON.stringify({ error: 'gameId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Starting sync-sets-v2 for gameId: ${gameId}, background: ${isBackground}`);

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // For background sync, return immediately and continue processing
    if (isBackground) {
      // Use EdgeRuntime.waitUntil if available, otherwise process synchronously
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(syncSetsV2(supabaseClient, gameId));
      } else {
        // Fallback: start async processing
        syncSetsV2(supabaseClient, gameId).catch(error => {
          console.error('Background sync failed:', error);
        });
      }
      
      return new Response(
        JSON.stringify({ started: true, gameId }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Synchronous processing
    const result = await syncSetsV2(supabaseClient, gameId);
    
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in sync-sets-v2:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: typeof error?.message === 'string' ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function syncSetsV2(supabaseClient: any, gameId: string) {
  try {
    console.log(`🎯 sync-sets-v2 starting for game: ${gameId}`);

    const normalizedGameId = normalizeGameSlug(gameId);
    console.log(`🎮 Fetching sets for game: ${gameId} (normalized: ${normalizedGameId})`);

    // Fetch sets from JustTCG API with defensive guards
    const url = buildUrl('sets', { game: normalizedGameId });
    const response = await fetchJsonWithRetry(url);
    
    // Extract sets with defensive guards
    let apiSets: any[] = [];
    if (response && typeof response === 'object') {
      const rawData = response.data || response.sets || response.items || [];
      apiSets = Array.isArray(rawData) ? rawData : [];
    }

    if (apiSets.length === 0) {
      console.warn(`⚠️ No sets found for game: ${gameId}`);
      return {
        success: true,
        gameId,
        synced: 0,
        message: `No sets found for game ${gameId}`
      };
    }

    console.log(`📦 Retrieved ${apiSets.length} sets for game: ${gameId}`);

    // Get or find the game record
    const { data: gameData, error: gameError } = await supabaseClient
      .from('games')
      .select('id')
      .eq('jt_game_id', gameId)
      .maybeSingle();

    if (gameError) {
      console.error(`❌ Error finding game ${gameId}:`, gameError);
      throw new Error(`Game not found: ${gameId}`);
    }

    if (!gameData) {
      console.error(`❌ Game not found in database: ${gameId}`);
      throw new Error(`Game not found in database: ${gameId}`);
    }

    // Transform and upsert sets with defensive guards
    const transformedSets = apiSets.map(set => {
      const safeSet = set && typeof set === 'object' ? set : {};
      
      return {
        jt_set_id: typeof safeSet.id === 'string' ? safeSet.id : `unknown_${Date.now()}_${Math.random()}`,
        name: typeof safeSet.name === 'string' ? safeSet.name : 'Unknown Set',
        code: typeof safeSet.code === 'string' ? safeSet.code : null,
        release_date: typeof safeSet.release_date === 'string' ? safeSet.release_date : null,
        total_cards: typeof safeSet.total_cards === 'number' ? safeSet.total_cards : null,
        game_id: gameData.id,
        sync_status: 'idle',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    // Upsert sets
    const { data: upsertedSets, error: upsertError } = await supabaseClient
      .from('sets')
      .upsert(transformedSets, { 
        onConflict: 'jt_set_id',
        ignoreDuplicates: false 
      })
      .select('id, name');

    if (upsertError) {
      console.error('❌ Error upserting sets:', upsertError);
      throw upsertError;
    }

    // Update game sets count with defensive guards
    const setsCount = Array.isArray(upsertedSets) ? upsertedSets.length : 0;
    await supabaseClient
      .from('games')
      .update({
        sets_count: setsCount,
        last_synced_at: new Date().toISOString()
      })
      .eq('id', gameData.id);

    console.log(`✅ sync-sets-v2 completed for game: ${gameId}, synced: ${setsCount} sets`);

    return {
      success: true,
      gameId,
      synced: setsCount,
      sets: upsertedSets,
      message: `Successfully synced ${setsCount} sets for game ${gameId}`
    };

  } catch (error) {
    console.error(`❌ Error in syncSetsV2 for game ${gameId}:`, error);
    
    return {
      success: false,
      gameId,
      synced: 0,
      message: `Failed to sync sets for game ${gameId}: ${typeof error?.message === 'string' ? error.message : 'Unknown error'}`
    };
  }
}

// ===== PATTERN A: INLINE CALLBACK =====
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await routeRequest(req);
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: "Internal error", message: (error as Error)?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});