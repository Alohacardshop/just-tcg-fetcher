import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import pLimit from 'https://esm.sh/p-limit@5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TcgCsvGroup {
  groupId: number
  name: string
  slug?: string
  publishedOn: string
  modifiedOn: string
}

interface TcgCsvProduct {
  productId: number
  name: string
  cleanName: string
  imageUrl?: string
  url?: string
  number?: string
  groupId: number
}

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url} (attempt ${i + 1}/${retries})`)
      const response = await fetch(url)
      
      if (response.status === 429) {
        const waitTime = delay * Math.pow(2, i) + Math.random() * 1000 // Exponential backoff with jitter
        console.log(`Rate limited, waiting ${waitTime}ms`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error)
      if (i === retries - 1) throw error
      const waitTime = delay * Math.pow(2, i) + Math.random() * 1000
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
}

function parseCardNumber(productName: string): string | null {
  // Extract card numbers like "123/165", "SVP-001", "PROMO-001", etc.
  const patterns = [
    /\b(\d{1,4}\/\d{1,4})\b/, // Standard format like 123/165
    /\b([A-Z]{2,4}[-_]?\d{1,4})\b/, // Promo formats like SVP-001, PROMO-001
    /\b(#\d{1,4})\b/, // Hash numbers like #123
    /\b(\d{1,4}[A-Z]?)\b(?=\s|$)/ // Simple numbers at word boundaries
  ]
  
  for (const pattern of patterns) {
    const match = productName.match(pattern)
    if (match) {
      return match[1].replace(/[-_]/g, '-') // Normalize separators
    }
  }
  
  return null
}

function selectBestImageUrl(imageUrl: string | undefined): string | null {
  if (!imageUrl) return null
  
  // Prefer larger images if multiple sizes are available
  // TCGCSV often provides URLs with size parameters
  if (imageUrl.includes('200w')) {
    return imageUrl.replace('200w', '400w')
  }
  
  return imageUrl
}

async function logToSyncLogs(supabase: any, operationId: string, status: string, message: string, details?: any) {
  await supabase.from('sync_logs').insert({
    operation_id: operationId,
    operation_type: 'tcgcsv-fetch-all',
    status,
    message,
    details
  })
}

async function upsertGroups(supabase: any, groups: any[], gameId: string, categoryId: string, operationId: string) {
  const batchSize = 100
  let totalUpserted = 0
  
  for (let i = 0; i < groups.length; i += batchSize) {
    const batch = groups.slice(i, i + batchSize)
    const records = batch.map(group => ({
      group_id: (group.groupId || group.id || group.group_id)?.toString(),
      category_id: categoryId,
      game_id: gameId,
      name: group.name,
      slug: group.slug || null,
      release_date: group.publishedOn ? new Date(group.publishedOn).toISOString().split('T')[0] : null,
      data: group
    }))
    
    const { error } = await supabase
      .from('tcgcsv_groups')
      .upsert(records, { onConflict: 'group_id' })
    
    if (error) {
      console.error('Error upserting groups batch:', error)
      throw error
    }
    
    totalUpserted += batch.length
    console.log(`Upserted ${totalUpserted}/${groups.length} groups`)
  }
  
  await logToSyncLogs(supabase, operationId, 'progress', `Upserted ${totalUpserted} groups`)
  return totalUpserted
}

async function upsertProducts(supabase: any, products: any[], gameId: string, categoryId: string, operationId: string) {
  const batchSize = 200
  let totalUpserted = 0
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    const records = batch.map(product => ({
      product_id: (product.productId || product.id || product.product_id)?.toString(),
      group_id: (product.groupId || product.group_id)?.toString(),
      category_id: categoryId,
      game_id: gameId,
      name: product.name,
      number: parseCardNumber(product.name),
      url: product.url || null,
      image_url: selectBestImageUrl(product.imageUrl || product.image_url),
      data: product
    }))
    
    const { error } = await supabase
      .from('tcgcsv_products')
      .upsert(records, { onConflict: 'product_id' })
    
    if (error) {
      console.error('Error upserting products batch:', error)
      throw error
    }
    
    totalUpserted += batch.length
    
    if (totalUpserted % 1000 === 0 || i + batchSize >= products.length) {
      console.log(`Upserted ${totalUpserted}/${products.length} products`)
      await logToSyncLogs(supabase, operationId, 'progress', `Upserted ${totalUpserted}/${products.length} products`)
    }
  }
  
  return totalUpserted
}

async function fetchAllData(gameId: string, categoryId: string, operationId: string, wipeBefore: boolean, supabase: any) {
  try {
    // Wipe existing data if requested
    if (wipeBefore) {
      await logToSyncLogs(supabase, operationId, 'progress', 'Wiping existing TCGCSV data for game')
      await supabase.from('tcgcsv_products').delete().eq('game_id', gameId)
      await supabase.from('tcgcsv_groups').delete().eq('game_id', gameId)
    }
    
    // Fetch all groups
    await logToSyncLogs(supabase, operationId, 'progress', 'Fetching TCGCSV groups')
    const groupsUrl = `https://tcgcsv.com/tcgplayer/${categoryId}/groups`
    const groupsResponse = await fetchWithRetry(groupsUrl)
    
    // Handle various response shapes from TCGCSV API
    let groupsData
    if (Array.isArray(groupsResponse)) {
      groupsData = groupsResponse
    } else if (groupsResponse && typeof groupsResponse === 'object') {
      // Check for common wrapper properties
      if (Array.isArray(groupsResponse.data)) {
        groupsData = groupsResponse.data
      } else if (Array.isArray(groupsResponse.groups)) {
        groupsData = groupsResponse.groups
      } else if (Array.isArray(groupsResponse.results)) {
        groupsData = groupsResponse.results
      } else {
        // If it's an object but not wrapped, treat as single item
        groupsData = [groupsResponse]
      }
    } else {
      throw new Error(`Invalid groups response format. Expected array or object with data property, got: ${typeof groupsResponse}`)
    }
    
    if (!Array.isArray(groupsData) || groupsData.length === 0) {
      console.warn('No groups found for category', categoryId)
      await logToSyncLogs(supabase, operationId, 'warning', `No groups found for category ${categoryId}`)
      return {
        success: true,
        groupsUpserted: 0,
        productsUpserted: 0,
        message: 'No groups found for this category'
      }
    }
    
    console.log(`Found ${groupsData.length} groups`)
    const groupsUpserted = await upsertGroups(supabase, groupsData, gameId, categoryId, operationId)
    
    // Fetch products for each group with concurrency control
    await logToSyncLogs(supabase, operationId, 'progress', 'Fetching TCGCSV products for all groups')
    const limit = pLimit(8) // Limit concurrent requests
    let allProducts: any[] = []
    let processedGroups = 0
    
    const productPromises = groupsData.map(group => 
      limit(async () => {
        try {
          const productsUrl = `https://tcgcsv.com/tcgplayer/${categoryId}/${group.groupId}/products`
          const productsResponse = await fetchWithRetry(productsUrl)
          
          // Handle various response shapes for products too
          let productsData
          if (Array.isArray(productsResponse)) {
            productsData = productsResponse
          } else if (productsResponse && typeof productsResponse === 'object') {
            if (Array.isArray(productsResponse.data)) {
              productsData = productsResponse.data
            } else if (Array.isArray(productsResponse.products)) {
              productsData = productsResponse.products
            } else if (Array.isArray(productsResponse.results)) {
              productsData = productsResponse.results
            } else {
              productsData = [productsResponse]
            }
          } else {
            productsData = []
          }
          
          if (Array.isArray(productsData) && productsData.length > 0) {
            // Normalize product IDs and add groupId to each product
            const productsWithGroup = productsData.map(product => ({
              ...product,
              productId: product.productId || product.id || product.product_id,
              groupId: group.groupId || group.id || group.group_id
            }))
            allProducts.push(...productsWithGroup)
            
            processedGroups++
            if (processedGroups % 10 === 0) {
              console.log(`Processed ${processedGroups}/${groupsData.length} groups, found ${allProducts.length} products so far`)
            }
          } else {
            console.log(`No products found for group ${group.groupId} (${group.name})`)
          }
        } catch (error) {
          console.error(`Error fetching products for group ${group.groupId}:`, error)
          // Continue with other groups instead of failing entirely
        }
      })
    )
    
    await Promise.all(productPromises)
    
    console.log(`Found ${allProducts.length} total products`)
    const productsUpserted = await upsertProducts(supabase, allProducts, gameId, categoryId, operationId)
    
    await logToSyncLogs(supabase, operationId, 'completed', 'TCGCSV fetch completed successfully', {
      groupsUpserted,
      productsUpserted,
      categoryId,
      gameId,
      wipeBefore
    })
    
    return {
      success: true,
      groupsUpserted,
      productsUpserted,
      message: `Successfully fetched ${groupsUpserted} groups and ${productsUpserted} products`
    }
    
  } catch (error) {
    console.error('Error in fetchAllData:', error)
    await logToSyncLogs(supabase, operationId, 'error', `Fetch failed: ${error.message}`, { error: error.message })
    throw error
  }
}

async function fetchAllGamesData(operationId: string, wipeBefore: boolean, supabase: any) {
  try {
    // Get all games with TCGCSV category IDs
    const { data: games, error } = await supabase
      .from('games')
      .select('id, name, tcgcsv_category_id')
      .not('tcgcsv_category_id', 'is', null)
    
    if (error) throw error
    
    if (!games || games.length === 0) {
      throw new Error('No games found with TCGCSV category IDs')
    }
    
    await logToSyncLogs(supabase, operationId, 'progress', `Starting fetch for ${games.length} games`)
    
    // Wipe all data if requested
    if (wipeBefore) {
      await logToSyncLogs(supabase, operationId, 'progress', 'Wiping all existing TCGCSV data')
      await supabase.from('tcgcsv_products').delete().neq('game_id', 'null')
      await supabase.from('tcgcsv_groups').delete().neq('game_id', 'null')
    }
    
    // Process all games concurrently with limited concurrency
    const limit = pLimit(3) // Process 3 games at once to avoid overwhelming the API
    let totalGroupsUpserted = 0
    let totalProductsUpserted = 0
    const results = []
    
    const gamePromises = games.map(game => 
      limit(async () => {
        try {
          const gameOperationId = `${operationId}-game-${game.id}`
          await logToSyncLogs(supabase, gameOperationId, 'progress', `Starting fetch for game: ${game.name}`)
          
          const result = await fetchAllData(game.id, game.tcgcsv_category_id, gameOperationId, false, supabase)
          
          totalGroupsUpserted += result.groupsUpserted
          totalProductsUpserted += result.productsUpserted
          
          results.push({
            gameId: game.id,
            gameName: game.name,
            ...result
          })
          
          await logToSyncLogs(supabase, gameOperationId, 'completed', `Completed fetch for game: ${game.name}`)
          
          return result
        } catch (error) {
          console.error(`Error processing game ${game.name}:`, error)
          await logToSyncLogs(supabase, operationId, 'error', `Failed to process game ${game.name}: ${error.message}`)
          
          results.push({
            gameId: game.id,
            gameName: game.name,
            success: false,
            message: error.message
          })
          
          // Don't throw here, let other games continue
        }
      })
    )
    
    await Promise.all(gamePromises)
    
    await logToSyncLogs(supabase, operationId, 'completed', 'All games fetch completed', {
      totalGames: games.length,
      totalGroupsUpserted,
      totalProductsUpserted,
      results
    })
    
    return {
      success: true,
      totalGames: games.length,
      totalGroupsUpserted,
      totalProductsUpserted,
      message: `Successfully processed ${games.length} games with ${totalGroupsUpserted} groups and ${totalProductsUpserted} products`,
      results
    }
    
  } catch (error) {
    console.error('Error in fetchAllGamesData:', error)
    await logToSyncLogs(supabase, operationId, 'error', `All games fetch failed: ${error.message}`, { error: error.message })
    throw error
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { gameId, categoryId, wipeBefore = false, background = false } = await req.json()

    // Handle "all games" mode when no specific game is provided
    if (!gameId && !categoryId) {
      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      const operationId = `tcgcsv-fetch-all-games-${Date.now()}`
      
      await logToSyncLogs(supabase, operationId, 'started', 'Starting TCGCSV fetch for all games', {
        wipeBefore,
        background
      })

      if (background) {
        // Start background task and return immediately
        EdgeRuntime.waitUntil(fetchAllGamesData(operationId, wipeBefore, supabase))
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'TCGCSV fetch for all games started in background',
            operationId 
          }),
          { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        // Run synchronously
        const result = await fetchAllGamesData(operationId, wipeBefore, supabase)
        
        return new Response(
          JSON.stringify(result),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!gameId || !categoryId) {
      return new Response(
        JSON.stringify({ error: 'Either provide both gameId and categoryId, or neither for all games mode' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const operationId = `tcgcsv-fetch-${gameId}-${Date.now()}`
    
    await logToSyncLogs(supabase, operationId, 'started', `Starting TCGCSV fetch for game ${gameId}`, {
      gameId,
      categoryId,
      wipeBefore,
      background
    })

    if (background) {
      // Start background task and return immediately
      EdgeRuntime.waitUntil(fetchAllData(gameId, categoryId, operationId, wipeBefore, supabase))
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'TCGCSV fetch started in background',
          operationId 
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Run synchronously
      const result = await fetchAllData(gameId, categoryId, operationId, wipeBefore, supabase)
      
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Error in tcgcsv-fetch-all:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})