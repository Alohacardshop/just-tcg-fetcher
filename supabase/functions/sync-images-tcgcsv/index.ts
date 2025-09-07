import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TcgCsvProduct {
  productId: number
  name: string
  cleanName: string
  imageUrl?: string
  number?: string
  groupId: number
}

interface TcgCsvGroup {
  groupId: number
  name: string
  publishedOn: string
  modifiedOn: string
}

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url} (attempt ${i + 1}/${retries})`)
      const response = await fetch(url)
      
      if (response.status === 429) {
        console.log(`Rate limited, waiting ${delay * (i + 1)}ms`)
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        continue
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error)
      if (i === retries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
    }
  }
}

function normalizeSetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

async function syncImagesForGame(
  supabaseClient: any, 
  gameSlug: string, 
  categoryId: string,
  operationId: string,
  dryRun = false,
  forceUpdate = false
) {
  console.log(`Starting image sync for game: ${gameSlug}, category: ${categoryId}`)
  
  // Get all sets for this game that don't have images (or all if force update)
  const setsQuery = supabaseClient
    .from('sets')
    .select(`
      id,
      name,
      jt_set_id,
      cards!inner(
        id,
        name,
        number,
        jt_card_id,
        image_url
      )
    `)
    .eq('cards.game_id', (await supabaseClient.from('games').select('id').eq('slug', gameSlug).single()).data?.id)

  if (!forceUpdate) {
    setsQuery.is('cards.image_url', null)
  }

  const { data: sets, error: setsError } = await setsQuery

  if (setsError) {
    throw new Error(`Failed to fetch sets: ${setsError.message}`)
  }

  if (!sets?.length) {
    console.log('No sets found needing image updates')
    return { updated: 0, skipped: 0, errors: 0 }
  }

  console.log(`Found ${sets.length} sets to process`)

  // Fetch all groups from tcgcsv
  const groupsData = await fetchWithRetry(`https://tcgcsv.com/tcgplayer/${categoryId}/groups`)
  const groups: TcgCsvGroup[] = groupsData.results

  let totalUpdated = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const set of sets) {
    console.log(`Processing set: ${set.name}`)
    
    // Find matching group by normalized name
    const normalizedSetName = normalizeSetName(set.name)
    const matchingGroup = groups.find(group => 
      normalizeSetName(group.name) === normalizedSetName
    )

    if (!matchingGroup) {
      console.log(`No matching group found for set: ${set.name}`)
      totalSkipped++
      continue
    }

    console.log(`Found matching group: ${matchingGroup.name} (ID: ${matchingGroup.groupId})`)

    try {
      // Fetch products for this group
      const productsData = await fetchWithRetry(
        `https://tcgcsv.com/tcgplayer/${categoryId}/${matchingGroup.groupId}/products`
      )
      const products: TcgCsvProduct[] = productsData.results

      console.log(`Found ${products.length} products in group`)

      const cardsToUpdate = []

      // Match cards to products
      for (const card of set.cards) {
        if (!forceUpdate && card.image_url) {
          continue // Skip cards that already have images
        }

        let matchingProduct = null

        // Try to match by card number first
        if (card.number) {
          matchingProduct = products.find(product => 
            product.number === card.number
          )
        }

        // If no match by number, try by normalized name
        if (!matchingProduct) {
          const normalizedCardName = normalizeCardName(card.name)
          matchingProduct = products.find(product => 
            normalizeCardName(product.cleanName || product.name) === normalizedCardName
          )
        }

        if (matchingProduct && matchingProduct.imageUrl) {
          cardsToUpdate.push({
            id: card.id,
            imageUrl: matchingProduct.imageUrl,
            productId: matchingProduct.productId
          })
          console.log(`Matched card: ${card.name} -> ${matchingProduct.imageUrl}`)
        } else {
          console.log(`No image found for card: ${card.name}`)
        }
      }

      // Update cards in batch
      if (cardsToUpdate.length > 0 && !dryRun) {
        for (const cardUpdate of cardsToUpdate) {
          const { error } = await supabaseClient
            .from('cards')
            .update({ image_url: cardUpdate.imageUrl })
            .eq('id', cardUpdate.id)

          if (error) {
            console.error(`Failed to update card ${cardUpdate.id}:`, error)
            totalErrors++
          } else {
            totalUpdated++
          }
        }
      } else if (dryRun) {
        console.log(`DRY RUN: Would update ${cardsToUpdate.length} cards`)
        totalUpdated += cardsToUpdate.length
      }

      // Add small delay between sets to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))

    } catch (error) {
      console.error(`Error processing set ${set.name}:`, error)
      totalErrors++
      
      // Log error to sync_logs
      await supabaseClient.from('sync_logs').insert({
        operation_type: 'sync-images',
        operation_id: operationId,
        status: 'error',
        message: `Failed to sync images for set: ${set.name}`,
        details: { error: error.message, set_id: set.id }
      })
    }
  }

  return { updated: totalUpdated, skipped: totalSkipped, errors: totalErrors }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { 
      gameSlug = 'pokemon', 
      categoryId = '3', 
      dryRun = false, 
      forceUpdate = false,
      background = true 
    } = await req.json().catch(() => ({}))

    const operationId = `sync-images-${Date.now()}`

    // Log operation start
    await supabaseClient.from('sync_logs').insert({
      operation_type: 'sync-images',
      operation_id: operationId,
      status: 'started',
      message: `Starting image sync for ${gameSlug}`,
      details: { gameSlug, categoryId, dryRun, forceUpdate }
    })

    const syncOperation = async () => {
      try {
        const startTime = Date.now()
        
        const result = await syncImagesForGame(
          supabaseClient, 
          gameSlug, 
          categoryId, 
          operationId,
          dryRun,
          forceUpdate
        )
        
        const duration = Date.now() - startTime

        // Log success
        await supabaseClient.from('sync_logs').insert({
          operation_type: 'sync-images',
          operation_id: operationId,
          status: 'completed',
          message: `Image sync completed for ${gameSlug}`,
          details: { 
            ...result, 
            gameSlug, 
            categoryId, 
            dryRun, 
            forceUpdate 
          },
          duration_ms: duration
        })

        console.log('Image sync completed:', result)
        return result
      } catch (error) {
        console.error('Image sync failed:', error)
        
        await supabaseClient.from('sync_logs').insert({
          operation_type: 'sync-images',
          operation_id: operationId,
          status: 'error',
          message: `Image sync failed for ${gameSlug}: ${error.message}`,
          details: { error: error.message, gameSlug, categoryId }
        })
        
        throw error
      }
    }

    if (background) {
      // Start background task and return immediately
      EdgeRuntime.waitUntil(syncOperation())
      
      return new Response(
        JSON.stringify({ 
          message: 'Image sync started in background', 
          operationId 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 202 
        }
      )
    } else {
      // Run synchronously and wait for completion
      const result = await syncOperation()
      
      return new Response(
        JSON.stringify({ 
          message: 'Image sync completed', 
          operationId,
          result 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('Request failed:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})