/**
 * Sync Cards V2 - Hardened with Defensive Guards
 * 
 * This function implements defensive programming patterns to prevent crashes
 * from undefined arrays, null responses, and other edge cases.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { justTCGClient } from '../justtcg-sync/justtcg-client.ts';
import { SyncManager } from '../justtcg-sync/sync-manager.ts';

// CORS headers for web app compatibility
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Handle CORS preflight requests
function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

interface SyncCardsRequest {
  setId: string;
  gameId?: string;
  operationId?: string;
  background?: boolean;
}

async function routeRequest(req: Request): Promise<Response> {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Parse request body with defensive guards
    let requestData: SyncCardsRequest;
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
    const setId = typeof requestData.setId === 'string' ? requestData.setId.trim() : '';
    const operationId = typeof requestData.operationId === 'string' ? requestData.operationId : undefined;
    const isBackground = Boolean(requestData.background);

    if (!setId) {
      return new Response(
        JSON.stringify({ error: 'setId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Starting sync-cards-v2 for setId: ${setId}, operationId: ${operationId || 'none'}, background: ${isBackground}`);

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Initialize sync manager
    const syncManager = new SyncManager(supabaseClient);

    // For background sync, return immediately and continue processing
    if (isBackground) {
      // Use EdgeRuntime.waitUntil if available, otherwise process synchronously
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(syncCardsV2(supabaseClient, syncManager, setId, operationId));
      } else {
        // Fallback: start async processing
        syncCardsV2(supabaseClient, syncManager, setId, operationId).catch(error => {
          console.error('Background sync failed:', error);
        });
      }
      
      return new Response(
        JSON.stringify({ started: true, setId, operationId }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Synchronous processing
    const result = await syncCardsV2(supabaseClient, syncManager, setId, operationId);
    
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in sync-cards-v2:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: typeof error?.message === 'string' ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function syncCardsV2(
  supabaseClient: any, 
  syncManager: SyncManager, 
  setId: string, 
  operationId?: string
) {
  const jobId = setId; // Use setId as jobId for tracking
  let totalCards = 0;
  let processed = 0;
  let pagesProcessed = 0;
  let processedCards: any[] = [];

  try {
    console.log(`🎯 sync-cards-v2 starting for set: ${setId}`);

    // Update set status to syncing
    await syncManager.updateSetStatus(setId, 'syncing');

    // Get set and game data with defensive guards
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
      .maybeSingle();

    if (setError || !setData) {
      const errorMsg = `Set not found: ${setId}`;
      await syncManager.updateSetStatus(setId, 'error', errorMsg);
      throw new Error(errorMsg);
    }

    // Extract data with defensive guards
    const gameId = (setData.games && typeof setData.games.jt_game_id === 'string') 
      ? setData.games.jt_game_id 
      : '';
    const setName = typeof setData.name === 'string' ? setData.name : setId;
    const expectedTotalCards = typeof setData.total_cards === 'number' ? setData.total_cards : 0;

    if (!gameId) {
      const errorMsg = `Invalid game data for set: ${setId}`;
      await syncManager.updateSetStatus(setId, 'error', errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`🎮 Syncing cards for game: ${gameId}, set: ${setName} (expected: ${expectedTotalCards} cards)`);

    // Check for cancellation before starting
    if (await syncManager.shouldCancel(operationId)) {
      const errorMsg = 'Sync cancelled by admin before starting';
      await syncManager.updateSetStatus(setId, 'error', errorMsg);
      throw new Error(errorMsg);
    }

    // ===== A. HARDENED PAGE LOOP WITH DEFENSIVE GUARDS =====
    console.log(`🔄 Starting hardened pagination loop for ${gameId}/${setName}`);
    
    for await (const cardsPage of justTCGClient.getCards(gameId, setName)) {
      // ✅ Defensive guard: treat any non-array page as empty array
      const page = Array.isArray(cardsPage) ? cardsPage : [];
      totalCards += page.length;  // ✅ Safe - page is guaranteed to be array
      pagesProcessed++;
      
      console.log(`📄 Processing page ${pagesProcessed}: ${page.length} cards (total: ${totalCards})`);
      
      await syncManager.updateProgress(jobId, processed, totalCards);

      // Check for cancellation between pages
      if (await syncManager.shouldCancel(operationId)) {
        const errorMsg = `Sync cancelled by admin at page ${pagesProcessed}`;
        await syncManager.updateSetStatus(setId, 'error', errorMsg);
        throw new Error(errorMsg);
      }

      // Process cards in batches with defensive guards
      await syncManager.batchProcess(
        page,
        async (cardsBatch) => {
          // Defensive guard for batch
          const safeBatch = Array.isArray(cardsBatch) ? cardsBatch : [];
          
          if (safeBatch.length === 0) return;

          // Transform cards with defensive guards
          const transformedCards = safeBatch.map(card => {
            // Defensive guards for card properties
            const safeCard = card && typeof card === 'object' ? card : {};
            
            return {
              jt_card_id: typeof safeCard.id === 'string' ? safeCard.id : `unknown_${Date.now()}_${Math.random()}`,
              name: typeof safeCard.name === 'string' ? safeCard.name : 'Unknown Card',
              set_id: setData.id,
              game_id: setData.game_id,
              image_url: typeof safeCard.image === 'string' ? safeCard.image : null,
              rarity: typeof safeCard.rarity === 'string' ? safeCard.rarity : null,
              number: typeof safeCard.number === 'string' ? safeCard.number : null,
              data: safeCard,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
          });

          // Insert/update cards
          const { data: upsertedCards, error: upsertError } = await supabaseClient
            .from('cards')
            .upsert(transformedCards, { 
              onConflict: 'jt_card_id',
              ignoreDuplicates: false 
            })
            .select('id');

          if (upsertError) {
            console.error('❌ Error upserting cards batch:', upsertError);
            throw upsertError;
          }

          // Accumulate processed cards with defensive guards
          const safeUpserted = Array.isArray(upsertedCards) ? upsertedCards : [];
          processedCards.push(...safeUpserted);
          processed += safeBatch.length;
          
          console.log(`✅ Processed batch: ${safeBatch.length} cards (total processed: ${processed})`);
        }
      );
    }

    // Final validation and status update
    const finalProcessedCount = processedCards?.length ?? 0;
    const wasSuccessful = finalProcessedCount > 0;
    
    if (wasSuccessful) {
      await syncManager.updateSetStatus(setId, 'completed', undefined, {
        totalProcessed: finalProcessedCount,
        pagesProcessed
      });
    } else {
      const errorMsg = 'No cards were processed successfully';
      await syncManager.updateSetStatus(setId, 'error', errorMsg);
    }

    // ===== B. HARDENED SUCCESS LOGGING =====
    const successMessage = `Successfully synced ${finalProcessedCount} cards for set ${setId}`;
    
    return syncManager.createResult(
      wasSuccessful,
      jobId,
      successMessage,
      {
        totalProcessed: finalProcessedCount,
        totalInserted: finalProcessedCount, // In upsert scenario, consider all as inserts for simplicity
        totalUpdated: 0,
        totalErrors: totalCards - finalProcessedCount,
        pagesProcessed
      }
    );

  } catch (error) {
    console.error(`❌ Error in syncCardsV2 for set ${setId}:`, error);
    
    // ===== B. HARDENED ERROR LOGGING =====
    const errorMessage = `Failed to sync cards for set ${setId}: ${typeof error?.message === 'string' ? error.message : 'Unknown error'}`;
    
    await syncManager.updateSetStatus(setId, 'error', errorMessage);
    
    return syncManager.createResult(
      false,
      jobId,
      errorMessage,
      {
        totalProcessed: processedCards?.length ?? 0,
        totalInserted: 0,
        totalUpdated: 0,
        totalErrors: totalCards,
        pagesProcessed
      }
    );
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