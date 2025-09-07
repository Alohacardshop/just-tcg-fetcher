import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface SyncProgress {
  operationId: string;
  type: 'justtcg' | 'tcgcsv_match';
  gameId: string;
  setId?: string;
  current: number;
  total: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errorMessage?: string;
  resumeToken?: string;
}

async function updateSyncStatus(progress: Partial<SyncProgress>) {
  const { error } = await supabase
    .from('sync_status')
    .upsert({
      operation_id: progress.operationId,
      operation_type: progress.type,
      game_id: progress.gameId,
      set_id: progress.setId,
      progress_current: progress.current,
      progress_total: progress.total,
      status: progress.status,
      error_message: progress.errorMessage,
      resume_data: progress.resumeToken ? { resumeToken: progress.resumeToken } : null,
      updated_at: new Date().toISOString()
    });
  
  if (error) {
    console.error('Failed to update sync status:', error);
  }
}

async function logProgress(operationId: string, message: string, details?: any) {
  const { error } = await supabase
    .from('sync_logs')
    .insert({
      operation_id: operationId,
      operation_type: 'unified_card_sync',
      status: 'info',
      message,
      details,
      created_at: new Date().toISOString()
    });
  
  if (error) {
    console.error('Failed to log progress:', error);
  }
}

async function syncCardsFromJustTCG(gameId: string, setId: string, operationId: string): Promise<{ success: boolean; error?: string; cardsProcessed: number }> {
  try {
    await logProgress(operationId, `Starting JustTCG sync for set ${setId}`);
    
    // Call the existing sync-cards-v2 function
    const { data, error } = await supabase.functions.invoke('sync-cards-v2', {
      body: { gameId, setId, operationId, background: true }
    });
    
    if (error) throw error;
    
    await logProgress(operationId, `JustTCG sync completed for set ${setId}`, data);
    return { success: true, cardsProcessed: data?.cardsProcessed || 0 };
    
  } catch (error: any) {
    await logProgress(operationId, `JustTCG sync failed for set ${setId}: ${error.message}`);
    return { success: false, error: error.message, cardsProcessed: 0 };
  }
}

async function matchTCGCSVProducts(gameId: string, setId: string, operationId: string): Promise<{ success: boolean; error?: string; matchesFound: number }> {
  try {
    await logProgress(operationId, `Starting TCGCSV matching for set ${setId}`);
    
    // Call the improved tcgcsv-match function for specific set
    const { data, error } = await supabase.functions.invoke('tcgcsv-match', {
      body: { 
        gameId, 
        setId,
        operationId,
        matchType: 'products',
        dryRun: false,
        background: true 
      }
    });
    
    if (error) throw error;
    
    await logProgress(operationId, `TCGCSV matching completed for set ${setId}`, data);
    return { success: true, matchesFound: data?.matchesFound || 0 };
    
  } catch (error: any) {
    await logProgress(operationId, `TCGCSV matching failed for set ${setId}: ${error.message}`);
    return { success: false, error: error.message, matchesFound: 0 };
  }
}

async function syncSingleSet(gameId: string, setId: string, operationId: string): Promise<boolean> {
  await updateSyncStatus({
    operationId,
    type: 'justtcg',
    gameId,
    setId,
    status: 'running'
  });
  
  // Step 1: Sync cards from JustTCG
  const justTCGResult = await syncCardsFromJustTCG(gameId, setId, operationId);
  if (!justTCGResult.success) {
    await updateSyncStatus({
      operationId,
      status: 'failed',
      errorMessage: `JustTCG sync failed: ${justTCGResult.error}`
    });
    return false;
  }
  
  // Step 2: Match with TCGCSV products
  const tcgcsvResult = await matchTCGCSVProducts(gameId, setId, operationId);
  if (!tcgcsvResult.success) {
    // Don't fail the entire operation if matching fails
    await logProgress(operationId, `TCGCSV matching failed but continuing: ${tcgcsvResult.error}`);
  }
  
  await updateSyncStatus({
    operationId,
    status: 'completed',
    current: 1,
    total: 1
  });
  
  return true;
}

async function syncMultipleSets(gameId: string, setIds: string[], operationId: string): Promise<void> {
  const total = setIds.length;
  let current = 0;
  let failures = 0;
  
  await updateSyncStatus({
    operationId,
    type: 'justtcg',
    gameId,
    status: 'running',
    current: 0,
    total
  });
  
  for (const setId of setIds) {
    // Check for cancellation
    const { data: controlData } = await supabase
      .from('sync_control')
      .select('should_cancel')
      .eq('operation_id', operationId)
      .single();
    
    if (controlData?.should_cancel) {
      await logProgress(operationId, 'Sync cancelled by user');
      await updateSyncStatus({
        operationId,
        status: 'failed',
        errorMessage: 'Cancelled by user'
      });
      return;
    }
    
    const success = await syncSingleSet(gameId, setId, `${operationId}_set_${setId}`);
    if (!success) failures++;
    
    current++;
    await updateSyncStatus({
      operationId,
      current,
      total
    });
  }
  
  const finalStatus = failures === 0 ? 'completed' : (current - failures > 0 ? 'completed' : 'failed');
  const message = failures > 0 ? `Completed with ${failures} failures out of ${total} sets` : `Successfully synced all ${total} sets`;
  
  await updateSyncStatus({
    operationId,
    status: finalStatus,
    errorMessage: failures > 0 ? message : undefined
  });
  
  await logProgress(operationId, message, { totalSets: total, failures, successes: current - failures });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { gameId, setId, setIds, operationId, background = true } = await req.json();
    
    if (!gameId) {
      return new Response(
        JSON.stringify({ error: 'gameId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const opId = operationId || `unified_sync_${Date.now()}`;
    
    // Create sync control record
    await supabase
      .from('sync_control')
      .upsert({
        operation_id: opId,
        operation_type: 'unified_card_sync',
        should_cancel: false
      });
    
    if (background) {
      // Start background task
      const task = async () => {
        if (setIds && setIds.length > 1) {
          await syncMultipleSets(gameId, setIds, opId);
        } else if (setId) {
          await syncSingleSet(gameId, setId, opId);
        } else {
          // Sync all sets for the game
          const { data: sets } = await supabase
            .from('sets')
            .select('id')
            .eq('game_id', gameId);
          
          if (sets && sets.length > 0) {
            await syncMultipleSets(gameId, sets.map(s => s.id), opId);
          }
        }
      };
      
      EdgeRuntime.waitUntil(task());
      
      return new Response(
        JSON.stringify({ 
          message: 'Sync started in background',
          operationId: opId,
          status: 'background'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Synchronous execution
      if (setIds && setIds.length > 1) {
        await syncMultipleSets(gameId, setIds, opId);
      } else if (setId) {
        await syncSingleSet(gameId, setId, opId);
      }
      
      return new Response(
        JSON.stringify({ 
          message: 'Sync completed',
          operationId: opId,
          status: 'completed'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
  } catch (error: any) {
    console.error('Unified sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});