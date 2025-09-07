import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

function normalizeSetName(name: string): string {
  return normalizeText(name)
    // Handle common set name variations
    .replace(/\b(first|1st)\s+edition\b/g, 'first edition')
    .replace(/\b(base|basic)\s+set\b/g, 'base set')
    .replace(/\bpromo\b/g, 'promotional')
    // Roman numerals
    .replace(/\bii\b/g, '2')
    .replace(/\biii\b/g, '3')
    .replace(/\biv\b/g, '4')
    .replace(/\bv\b/g, '5')
}

function normalizeCardName(name: string): string {
  return normalizeText(name)
    // Remove common suffixes that might differ
    .replace(/\s+(ex|gx|v|vmax|vstar|tag team|break)$/g, '')
    .replace(/\s+\(.*?\)$/g, '') // Remove parenthetical info
}

function normalizeCardNumber(number: string): string {
  if (!number) return ''
  
  // Normalize different number formats
  return number
    .toLowerCase()
    .replace(/[-_\s]/g, '') // Remove separators
    .replace(/^#/, '') // Remove hash prefix
    .trim()
}

function calculateSimilarity(str1: string, str2: string): number {
  // Simple Levenshtein-based similarity
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

async function logToSyncLogs(supabase: any, operationId: string, status: string, message: string, details?: any) {
  await supabase.from('sync_logs').insert({
    operation_id: operationId,
    operation_type: 'tcgcsv-match',
    status,
    message,
    details
  })
}

async function matchGroupsToSets(supabase: any, gameId: string, operationId: string, dryRun: boolean) {
  // Get all groups for this game
  const { data: groups, error: groupsError } = await supabase
    .from('tcgcsv_groups')
    .select('group_id, name, data')
    .eq('game_id', gameId)
    .order('name')
  
  if (groupsError) throw groupsError
  
  // Get all sets for this game that don't have a tcgcsv_group_id
  const { data: sets, error: setsError } = await supabase
    .from('sets')
    .select('id, name, code, jt_set_id, tcgcsv_group_id')
    .eq('game_id', gameId)
    .order('name')
  
  if (setsError) throw setsError
  
  const matches = []
  const ambiguous = []
  let autoMatched = 0
  
  for (const group of groups) {
    const normalizedGroupName = normalizeSetName(group.name)
    let bestMatch = null
    let bestScore = 0
    let secondBestScore = 0
    
    // Find best matching set
    for (const set of sets) {
      // Skip if set already has a group mapping
      if (set.tcgcsv_group_id) continue
      
      let score = 0
      
      // Exact name match (highest priority)
      if (normalizeSetName(set.name) === normalizedGroupName) {
        score = 1.0
      }
      // Code match (if available)
      else if (set.code && normalizeText(set.code) === normalizeText(group.name)) {
        score = 0.95
      }
      // Similarity-based matching
      else {
        score = calculateSimilarity(normalizedGroupName, normalizeSetName(set.name))
      }
      
      if (score > bestScore) {
        secondBestScore = bestScore
        bestScore = score
        bestMatch = set
      } else if (score > secondBestScore) {
        secondBestScore = score
      }
    }
    
    if (bestMatch) {
      const confidence = bestScore >= 0.9 && (bestScore - secondBestScore) > 0.1
      
      matches.push({
        group_id: group.group_id,
        group_name: group.name,
        set_id: bestMatch.id,
        set_name: bestMatch.name,
        score: bestScore,
        confidence: confidence ? 'high' : 'low'
      })
      
      if (confidence) {
        if (!dryRun) {
          // Auto-apply high confidence matches
          await supabase
            .from('sets')
            .update({ tcgcsv_group_id: group.group_id })
            .eq('id', bestMatch.id)
        }
        autoMatched++
      } else {
        ambiguous.push({
          group: group,
          candidates: [{ set: bestMatch, score: bestScore }]
        })
      }
    }
  }
  
  await logToSyncLogs(supabase, operationId, 'progress', `Group-to-set matching: ${autoMatched} auto-matched, ${ambiguous.length} ambiguous`, {
    autoMatched,
    ambiguous: ambiguous.length,
    totalGroups: groups.length,
    totalSets: sets.length
  })
  
  return { matches, ambiguous, autoMatched }
}

async function matchProductsToCards(supabase: any, gameId: string, operationId: string, dryRun: boolean, onlyUnmapped: boolean) {
  // Get sets that have tcgcsv_group_id mappings
  const { data: mappedSets, error: setsError } = await supabase
    .from('sets')
    .select('id, tcgcsv_group_id, name')
    .eq('game_id', gameId)
    .not('tcgcsv_group_id', 'is', null)
  
  if (setsError) throw setsError
  
  if (mappedSets.length === 0) {
    throw new Error('No sets have TCGCSV group mappings. Run group-to-set matching first.')
  }
  
  let totalMatched = 0
  let numberMatches = 0
  let nameMatches = 0
  let updated = 0
  const unmatchedProducts = []
  const ambiguousMatches = []
  
  for (const set of mappedSets) {
    // Get products for this group
    const { data: products, error: productsError } = await supabase
      .from('tcgcsv_products')
      .select('product_id, name, number, url, image_url, data')
      .eq('game_id', gameId)
      .eq('group_id', set.tcgcsv_group_id)
    
    if (productsError) throw productsError
    
    // Get cards for this set
    const cardQuery = supabase
      .from('cards')
      .select('id, name, number, tcgplayer_product_id, image_url, product_url')
      .eq('set_id', set.id)
    
    if (onlyUnmapped) {
      cardQuery.is('tcgplayer_product_id', null)
    }
    
    const { data: cards, error: cardsError } = await cardQuery
    
    if (cardsError) throw cardsError
    
    console.log(`Processing set ${set.name}: ${products.length} products, ${cards.length} cards`)
    
    for (const product of products) {
      let matchedCard = null
      let matchMethod = null
      
      // Primary matching: by card number
      if (product.number) {
        const normalizedProductNumber = normalizeCardNumber(product.number)
        
        for (const card of cards) {
          if (card.number && normalizeCardNumber(card.number) === normalizedProductNumber) {
            matchedCard = card
            matchMethod = 'number'
            numberMatches++
            break
          }
        }
      }
      
      // Fallback matching: by name similarity
      if (!matchedCard) {
        const normalizedProductName = normalizeCardName(product.name)
        let bestScore = 0
        
        for (const card of cards) {
          const score = calculateSimilarity(normalizedProductName, normalizeCardName(card.name))
          if (score > bestScore && score >= 0.8) { // Threshold for name matching
            bestScore = score
            matchedCard = card
            matchMethod = 'name'
          }
        }
        
        if (matchedCard && matchMethod === 'name') {
          nameMatches++
        }
      }
      
      if (matchedCard) {
        totalMatched++
        
        if (!dryRun) {
          // Update card with TCGCSV data
          const updates: any = {
            tcgplayer_product_id: parseInt(product.product_id)
          }
          
          // Only update image_url if card doesn't have one or if product has a better one
          if (!matchedCard.image_url || product.image_url) {
            updates.image_url = product.image_url
          }
          
          // Always update product_url if available
          if (product.url) {
            updates.product_url = product.url
          }
          
          await supabase
            .from('cards')
            .update(updates)
            .eq('id', matchedCard.id)
          
          updated++
        }
      } else {
        unmatchedProducts.push({
          product_id: product.product_id,
          name: product.name,
          number: product.number,
          set_name: set.name
        })
      }
    }
  }
  
  await logToSyncLogs(supabase, operationId, 'progress', `Product-to-card matching: ${totalMatched} matched (${numberMatches} by number, ${nameMatches} by name), ${updated} updated`, {
    totalMatched,
    numberMatches,
    nameMatches,
    updated,
    unmatchedProducts: unmatchedProducts.length,
    examples: {
      unmatched: unmatchedProducts.slice(0, 5)
    }
  })
  
  return {
    totalMatched,
    numberMatches,
    nameMatches,
    updated,
    unmatchedProducts: unmatchedProducts.slice(0, 20), // Limit for response size
    ambiguousMatches: ambiguousMatches.slice(0, 10)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { gameId, dryRun = true, background = false, onlyUnmapped = true, matchType = 'both' } = await req.json()

    if (!gameId) {
      return new Response(
        JSON.stringify({ error: 'gameId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const operationId = `tcgcsv-match-${gameId}-${Date.now()}`
    
    const matchOperation = async () => {
      try {
        await logToSyncLogs(supabase, operationId, 'started', `Starting TCGCSV matching for game ${gameId}`, {
          gameId,
          dryRun,
          onlyUnmapped,
          matchType
        })

        let groupMatching = null
        let productMatching = null

        // Step 1: Match groups to sets (if requested)
        if (matchType === 'groups' || matchType === 'both') {
          groupMatching = await matchGroupsToSets(supabase, gameId, operationId, dryRun)
        }

        // Step 2: Match products to cards (if requested)
        if (matchType === 'products' || matchType === 'both') {
          productMatching = await matchProductsToCards(supabase, gameId, operationId, dryRun, onlyUnmapped)
        }

        const result = {
          success: true,
          dryRun,
          groupMatching,
          productMatching,
          message: dryRun 
            ? 'Matching analysis completed (dry run - no changes made)'
            : 'Matching completed successfully'
        }

        await logToSyncLogs(supabase, operationId, 'completed', result.message, result)
        return result

      } catch (error) {
        console.error('Error in matching:', error)
        await logToSyncLogs(supabase, operationId, 'error', `Matching failed: ${error.message}`, { error: error.message })
        throw error
      }
    }

    if (background) {
      // Start background task and return immediately
      EdgeRuntime.waitUntil(matchOperation())
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'TCGCSV matching started in background',
          operationId 
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Run synchronously
      const result = await matchOperation()
      
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Error in tcgcsv-match:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})