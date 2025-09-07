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
  const startTime = Date.now()
  const MAX_EXECUTION_TIME = 45000 // 45 seconds to avoid timeout
  
  // Get sets that have tcgcsv_group_id mappings
  const { data: mappedSets, error: setsError } = await supabase
    .from('sets')
    .select('id, tcgcsv_group_id, name')
    .eq('game_id', gameId)
    .not('tcgcsv_group_id', 'is', null)
    .order('name')
  
  if (setsError) throw setsError
  
  if (mappedSets.length === 0) {
    throw new Error('No sets have TCGCSV group mappings. Run group-to-set matching first.')
  }
  
  let totalMatched = 0
  let numberMatches = 0
  let nameMatches = 0
  let updated = 0
  let processedSets = 0
  const unmatchedProducts = []
  const ambiguousMatches = []
  const BATCH_SIZE = 50 // Process products in smaller batches
  
  for (const set of mappedSets) {
    // Check execution time before processing each set
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      console.log(`Stopping due to time limit. Processed ${processedSets}/${mappedSets.length} sets`)
      await logToSyncLogs(supabase, operationId, 'timeout', `Processing stopped due to time limit after ${processedSets} sets`, {
        processedSets,
        totalSets: mappedSets.length,
        partialResults: { totalMatched, numberMatches, nameMatches, updated }
      })
      break
    }
    
    try {
      // Get products for this group in smaller batches
      const { data: products, error: productsError } = await supabase
        .from('tcgcsv_products')
        .select('product_id, name, number, url, image_url, data')
        .eq('game_id', gameId)
        .eq('group_id', set.tcgcsv_group_id)
        .order('name')
        .limit(BATCH_SIZE)
      
      if (productsError) throw productsError
      
      // Get cards for this set
      const cardQuery = supabase
        .from('cards')
        .select('id, name, number, tcgplayer_product_id, image_url, product_url')
        .eq('set_id', set.id)
        .order('name')
      
      if (onlyUnmapped) {
        cardQuery.is('tcgplayer_product_id', null)
      }
      
      const { data: cards, error: cardsError } = await cardQuery
      
      if (cardsError) throw cardsError
      
      console.log(`Processing set ${set.name}: ${products.length} products, ${cards.length} cards`)
      
      // Process products in smaller chunks to avoid memory issues
      const PRODUCT_CHUNK_SIZE = 25
      for (let i = 0; i < products.length; i += PRODUCT_CHUNK_SIZE) {
        const productChunk = products.slice(i, i + PRODUCT_CHUNK_SIZE)
        
        for (const product of productChunk) {
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
          
          // Fallback matching: by name similarity (limited to avoid timeout)
          if (!matchedCard && cards.length < 200) { // Only do name matching for smaller sets
            const normalizedProductName = normalizeCardName(product.name)
            let bestScore = 0
            
            for (const card of cards) {
              const score = calculateSimilarity(normalizedProductName, normalizeCardName(card.name))
              if (score > bestScore && score >= 0.8) {
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
              // Batch updates for better performance
              const updates: any = {
                tcgplayer_product_id: parseInt(product.product_id)
              }
              
              if (!matchedCard.image_url || product.image_url) {
                updates.image_url = product.image_url
              }
              
              if (product.url) {
                updates.product_url = product.url
              }
              
              try {
                await supabase
                  .from('cards')
                  .update(updates)
                  .eq('id', matchedCard.id)
                
                updated++
              } catch (updateError) {
                console.error(`Failed to update card ${matchedCard.id}:`, updateError)
              }
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
      
      processedSets++
      
      // Log progress every 5 sets
      if (processedSets % 5 === 0) {
        await logToSyncLogs(supabase, operationId, 'progress', `Processed ${processedSets}/${mappedSets.length} sets. ${totalMatched} matches so far.`, {
          processedSets,
          totalSets: mappedSets.length,
          totalMatched,
          updated
        })
      }
      
    } catch (setError) {
      console.error(`Error processing set ${set.name}:`, setError)
      await logToSyncLogs(supabase, operationId, 'warning', `Skipped set ${set.name} due to error: ${setError.message}`)
      continue
    }
  }
  
  await logToSyncLogs(supabase, operationId, 'progress', `Product-to-card matching: ${totalMatched} matched (${numberMatches} by number, ${nameMatches} by name), ${updated} updated`, {
    totalMatched,
    numberMatches,
    nameMatches,
    updated,
    processedSets,
    totalSets: mappedSets.length,
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
    processedSets,
    totalSets: mappedSets.length,
    unmatchedProducts: unmatchedProducts.slice(0, 20),
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
      const operationStart = Date.now()
      
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
          console.log('Starting group-to-set matching...')
          groupMatching = await matchGroupsToSets(supabase, gameId, operationId, dryRun)
          console.log('Group matching completed:', groupMatching.autoMatched, 'auto-matched')
        }

        // Step 2: Match products to cards (if requested)
        if (matchType === 'products' || matchType === 'both') {
          console.log('Starting product-to-card matching...')
          productMatching = await matchProductsToCards(supabase, gameId, operationId, dryRun, onlyUnmapped)
          console.log('Product matching completed:', productMatching.totalMatched, 'matched')
        }

        const executionTime = Date.now() - operationStart
        const result = {
          success: true,
          dryRun,
          operationId,
          executionTime,
          groupMatching,
          productMatching,
          message: dryRun 
            ? `Matching analysis completed in ${Math.round(executionTime/1000)}s (dry run - no changes made)`
            : `Matching completed successfully in ${Math.round(executionTime/1000)}s`
        }

        await logToSyncLogs(supabase, operationId, 'completed', result.message, result)
        return result

      } catch (error) {
        console.error('Error in matching:', error)
        const executionTime = Date.now() - operationStart
        await logToSyncLogs(supabase, operationId, 'error', `Matching failed after ${Math.round(executionTime/1000)}s: ${error.message}`, { 
          error: error.message,
          executionTime,
          stack: error.stack 
        })
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