import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  try {
    console.log('🤖 Automated sync function started');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { gameIds, manual = false }: RequestBody = await req.json();
    
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
      try {
        console.log(`🎮 Starting sync for game: ${game.name} (${game.jt_game_id})`);
        
        // Get all sets for this game
        const { data: sets, error: setsError } = await supabaseClient
          .from('sets')
          .select('id, name, jt_set_id')
          .eq('game_id', game.id);

        if (setsError) {
          console.error(`❌ Error fetching sets for ${game.name}:`, setsError);
          continue;
        }

        // Sync each set
        for (const set of sets || []) {
          try {
            console.log(`📦 Syncing set: ${set.name}`);
            
            // Call the sync-cards-v2 function for this set
            const { error: syncError } = await supabaseClient.functions.invoke('sync-cards-v2', {
              body: {
                gameId: game.jt_game_id,
                setId: set.jt_set_id,
                limit: 1000, // Reasonable limit for automated syncs
              }
            });

            if (syncError) {
              console.error(`❌ Error syncing ${set.name}:`, syncError);
              results.push({
                game: game.name,
                set: set.name,
                status: 'error',
                error: syncError.message
              });
            } else {
              console.log(`✅ Successfully synced ${set.name}`);
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
            console.error(`❌ Error processing set ${set.name}:`, error);
            results.push({
              game: game.name,
              set: set.name,
              status: 'error',
              error: error.message
            });
          }
        }

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

    console.log(`🏁 Automated sync completed. Processed: ${processed} sets`);

    return new Response(
      JSON.stringify({
        message: `Automated sync completed`,
        processed,
        results,
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