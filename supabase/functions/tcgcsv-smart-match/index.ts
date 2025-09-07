import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCardName(name: string): string {
  return normalizeText(name)
    .replace(/\b(holo|reverse holo|1st edition|unlimited|shadowless)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLen = Math.max(len1, len2);
  return (maxLen - matrix[len1][len2]) / maxLen;
}

async function logToSyncLogs(supabase: any, operationId: string, status: string, message: string, details?: any): Promise<void> {
  try {
    await supabase
      .from('sync_logs')
      .insert({
        operation_id: operationId,
        operation_type: 'tcgcsv-smart-match',
        status,
        message,
        details
      });
  } catch (error) {
    console.error('Failed to log to sync_logs:', error);
  }
}

async function smartMatchCards(
  supabase: any, 
  gameId: string, 
  setId: string | null, 
  operationId: string, 
  dryRun: boolean = false
): Promise<any> {
  await logToSyncLogs(supabase, operationId, 'info', `Starting smart match for game ${gameId}${setId ? `, set ${setId}` : ''}`);
  
  // Get JustTCG cards
  let cardsQuery = supabase
    .from('cards')
    .select(`
      id,
      name,
      number,
      set_id,
      game_id,
      sets!inner(name, tcgcsv_group_id)
    `)
    .eq('game_id', gameId);
    
  if (setId) {
    cardsQuery = cardsQuery.eq('set_id', setId);
  }
  
  const { data: cards, error: cardsError } = await cardsQuery;
  
  if (cardsError) {
    throw new Error(`Failed to fetch cards: ${cardsError.message}`);
  }
  
  if (!cards || cards.length === 0) {
    await logToSyncLogs(supabase, operationId, 'warning', 'No cards found to match');
    return { matches: [], stats: { total: 0, matched: 0, skipped: 0 } };
  }
  
  await logToSyncLogs(supabase, operationId, 'info', `Found ${cards.length} cards to match`);
  
  const matches = [];
  let matched = 0;
  let skipped = 0;
  
  for (const card of cards) {
    try {
      // Skip if already matched
      const { data: existingMatch } = await supabase
        .from('card_product_links')
        .select('id')
        .eq('card_id', card.id)
        .single();
        
      if (existingMatch) {
        skipped++;
        continue;
      }
      
      const setInfo = card.sets;
      const tcgcsvGroupId = setInfo?.tcgcsv_group_id;
      
      if (!tcgcsvGroupId) {
        console.log(`No TCGCSV group ID for set: ${setInfo?.name}`);
        continue;
      }
      
      // Get TCGCSV products for this group
      const { data: products, error: productsError } = await supabase
        .from('tcgcsv_products')
        .select('product_id, name, number')
        .eq('tcgcsv_group_id', tcgcsvGroupId);
        
      if (productsError || !products) {
        console.log(`No products found for group ${tcgcsvGroupId}`);
        continue;
      }
      
      let bestMatch = null;
      let bestScore = 0;
      let matchMethod = '';
      
      const cardNormalized = normalizeCardName(card.name);
      const cardNumber = card.number;
      
      for (const product of products) {
        let score = 0;
        let method = '';
        
        // Exact number match gets highest priority
        if (cardNumber && product.number && cardNumber === product.number) {
          const nameScore = calculateSimilarity(cardNormalized, normalizeCardName(product.name));
          if (nameScore > 0.6) { // Name must be reasonably similar too
            score = 0.9 + (nameScore * 0.1); // 0.9-1.0 range
            method = 'exact_number_match';
          }
        }
        
        // Name-based matching
        if (score === 0) {
          const nameScore = calculateSimilarity(cardNormalized, normalizeCardName(product.name));
          if (nameScore > 0.8) {
            score = nameScore * 0.8; // 0.64-0.8 range
            method = 'name_similarity';
          }
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = product;
          matchMethod = method;
        }
      }
      
      if (bestMatch && bestScore > 0.7) {
        const matchData = {
          card_id: card.id,
          tcgcsv_product_id: bestMatch.product_id,
          match_confidence: bestScore,
          match_method: matchMethod,
          verified: false
        };
        
        matches.push({
          ...matchData,
          card_name: card.name,
          product_name: bestMatch.name,
          card_number: card.number,
          product_number: bestMatch.number
        });
        
        if (!dryRun) {
          await supabase
            .from('card_product_links')
            .upsert(matchData, { onConflict: 'card_id,tcgcsv_product_id' });
        }
        
        matched++;
      }
      
    } catch (error) {
      console.error(`Error matching card ${card.id}:`, error);
    }
  }
  
  const stats = {
    total: cards.length,
    matched,
    skipped,
    unmatched: cards.length - matched - skipped
  };
  
  await logToSyncLogs(supabase, operationId, 'success', 
    `Smart match completed. Matched: ${matched}, Skipped: ${skipped}, Total: ${cards.length}`, 
    { stats, dryRun }
  );
  
  return { matches, stats };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      gameId, 
      setId = null, 
      dryRun = false, 
      operationId = `tcgcsv-match-${Date.now()}` 
    } = await req.json();
    
    if (!gameId) {
      throw new Error('gameId is required');
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await logToSyncLogs(supabase, operationId, 'started', 'Starting TCGCSV smart match', { gameId, setId, dryRun });

    const result = await smartMatchCards(supabase, gameId, setId, operationId, dryRun);

    await logToSyncLogs(supabase, operationId, 'completed', 'TCGCSV smart match completed');

    return new Response(
      JSON.stringify({ 
        success: true, 
        operationId,
        ...result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in tcgcsv-smart-match:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});