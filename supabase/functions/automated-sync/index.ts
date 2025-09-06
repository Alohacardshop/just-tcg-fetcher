import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Structured logging for automation runs
interface LogContext {
  operationId: string;
  operationType: string;
  gameId?: string;
  setId?: string;
  gameName?: string;
  setName?: string;
  duration?: number;
  error?: string;
  details?: any;
}

function createOperationId(): string {
  return `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function logToDatabase(
  supabase: any,
  context: LogContext,
  status: 'started' | 'success' | 'error' | 'warning',
  message: string
) {
  try {
    await supabase.from('sync_logs').insert({
      operation_type: context.operationType,
      operation_id: context.operationId,
      game_id: context.gameId || null,
      set_id: context.setId || null,
      status,
      message,
      details: {
        gameName: context.gameName,
        setName: context.setName,
        error: context.error,
        ...context.details
      },
      duration_ms: context.duration || null
    });
  } catch (error) {
    console.error('Failed to log to database:', error);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  gameIds?: string[];
  manual?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const operationId = createOperationId();
  
  try {
    console.log('🤖 Automated sync function started');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { gameIds, manual = false }: RequestBody = await req.json();
    
    const operationType = manual ? 'manual_sync' : 'automated_sync';
    const context: LogContext = {
      operationId,
      operationType,
      details: { gameIds, manual, totalGames: gameIds?.length || 0 }
    };

    // Log operation start
    await logToDatabase(supabaseClient, context, 'started', 
      `${operationType} operation started${manual ? ` for ${gameIds?.length || 0} games` : ''}`
    );
    
    let gamesToSync: string[] = [];
    
    if (manual && gameIds) {
      // Manual sync with specific games
      gamesToSync = gameIds;
      console.log(`📋 Manual sync requested for ${gameIds.length} games`);
    } else {
      // Scheduled sync - get all enabled automation settings
      const { data: settings, error: settingsError } = await supabaseClient
        .from('automation_settings')
        .select('game_id')
        .eq('enabled', true);

      if (settingsError) {
        console.error('❌ Error fetching automation settings:', settingsError);
        throw settingsError;
      }

      gamesToSync = settings?.map(s => s.game_id) || [];
      console.log(`⏰ Scheduled sync for ${gamesToSync.length} games`);
    }

    if (gamesToSync.length === 0) {
      console.log('⚠️ No games to sync');
      return new Response(
        JSON.stringify({ 
          message: 'No games configured for syncing',
          processed: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Get game details for logging
    const { data: games, error: gamesError } = await supabaseClient
      .from('games')
      .select('id, name, jt_game_id')
      .in('id', gamesToSync);

    if (gamesError) {
      console.error('❌ Error fetching games:', gamesError);
      throw gamesError;
    }

    const results = [];
    let processed = 0;

    for (const game of games || []) {
      const gameStartTime = Date.now();
      try {
        console.log(`🎮 Starting sync for game: ${game.name} (${game.jt_game_id})`);
        
        const gameContext = {
          ...context,
          gameId: game.id,
          gameName: game.name,
          details: { ...context.details, jtGameId: game.jt_game_id }
        };

        await logToDatabase(supabaseClient, gameContext, 'started', 
          `Starting sync for game: ${game.name}`
        );
        
        // Get all sets for this game
        const { data: sets, error: setsError } = await supabaseClient
          .from('sets')
          .select('id, name, jt_set_id')
          .eq('game_id', game.id);

        if (setsError) {
          console.error(`❌ Error fetching sets for ${game.name}:`, setsError);
          await logToDatabase(supabaseClient, gameContext, 'error', 
            `Error fetching sets for ${game.name}: ${setsError.message}`
          );
          continue;
        }

        // Sync each set
        for (const set of sets || []) {
          const setStartTime = Date.now();
          try {
            console.log(`📦 Syncing set: ${set.name}`);
            
            const setContext = {
              ...gameContext,
              setId: set.id,
              setName: set.name,
              details: { ...gameContext.details, jtSetId: set.jt_set_id }
            };

            await logToDatabase(supabaseClient, setContext, 'started', 
              `Starting sync for set: ${set.name} in ${game.name}`
            );
            
            // Call the sync-cards-v2 function for this set
            const { error: syncError } = await supabaseClient.functions.invoke('sync-cards-v2', {
              body: {
                gameId: game.jt_game_id,
                setId: set.jt_set_id,
                limit: 1000, // Reasonable limit for automated syncs
              }
            });

            const setDuration = Date.now() - setStartTime;

            if (syncError) {
              console.error(`❌ Error syncing ${set.name}:`, syncError);
              await logToDatabase(supabaseClient, { ...setContext, duration: setDuration, error: syncError.message }, 'error', 
                `Error syncing set ${set.name}: ${syncError.message}`
              );
              results.push({
                game: game.name,
                set: set.name,
                status: 'error',
                error: syncError.message
              });
            } else {
              console.log(`✅ Successfully synced ${set.name}`);
              await logToDatabase(supabaseClient, { ...setContext, duration: setDuration }, 'success', 
                `Successfully synced set ${set.name} in ${setDuration}ms`
              );
              results.push({
                game: game.name,
                set: set.name,
                status: 'success'
              });
              processed++;
            }

            // Small delay between sets to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 2000));
            
          } catch (error) {
            const setDuration = Date.now() - setStartTime;
            console.error(`❌ Error processing set ${set.name}:`, error);
            const setContext = {
              ...gameContext,
              setId: set.id,
              setName: set.name,
              duration: setDuration,
              error: error.message
            };
            await logToDatabase(supabaseClient, setContext, 'error', 
              `Error processing set ${set.name}: ${error.message}`
            );
            results.push({
              game: game.name,
              set: set.name,
              status: 'error',
              error: error.message
            });
          }
        }

        const gameDuration = Date.now() - gameStartTime;
        await logToDatabase(supabaseClient, { ...gameContext, duration: gameDuration }, 'success', 
          `Completed sync for game: ${game.name} in ${gameDuration}ms`
        );

        // Update last run time for automation settings if not manual
        if (!manual) {
          await supabaseClient
            .from('automation_settings')
            .update({ last_run_at: new Date().toISOString() })
            .eq('game_id', game.id);
        }

      } catch (error) {
        console.error(`❌ Error processing game ${game.name}:`, error);
        results.push({
          game: game.name,
          status: 'error',
          error: error.message
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`🏁 Automated sync completed. Processed: ${processed} sets in ${totalDuration}ms`);

    // Log final operation result
    const finalContext = {
      ...context,
      duration: totalDuration,
      details: { ...context.details, processedSets: processed, totalResults: results.length }
    };

    await logToDatabase(supabaseClient, finalContext, 'success', 
      `${operationType} completed successfully. Processed ${processed} sets in ${totalDuration}ms`
    );

    return new Response(
      JSON.stringify({
        message: `Automated sync completed`,
        processed,
        results,
        operationId,
        duration: totalDuration,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('❌ Automated sync function error:', error);
    
    return new Response(
      JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});