import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TcgCsvCategory {
  categoryId: number;
  name: string;
  displayName: string;
  slug: string;
}

interface TcgCsvGroup {
  groupId: number;
  name: string;
  categoryId: number;
  slug: string;
  publishedOn: string;
}

interface TcgCsvProduct {
  productId: number;
  name: string;
  cleanName: string;
  groupId: number;
  categoryId: number;
  imageUrl?: string;
  url?: string;
  number?: string;
}

async function fetchWithRetry(url: string, operationId: string, supabase: any, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`🌐 Fetching: ${url} (attempt ${attempt + 1})`);
      await logToSyncLogs(supabase, operationId, 'info', `Fetching: ${url} (attempt ${attempt + 1})`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      await logToSyncLogs(supabase, operationId, 'success', `Successfully fetched: ${url}`, { 
        url, 
        status: response.status,
        dataLength: Array.isArray(data) ? data.length : Object.keys(data).length 
      });
      
      return data;
    } catch (error) {
      console.error(`Fetch attempt ${attempt + 1} failed:`, error);
      await logToSyncLogs(supabase, operationId, 'warning', `Fetch attempt ${attempt + 1} failed: ${error.message}`, { url, attempt: attempt + 1 });
      
      if (attempt === retries - 1) {
        throw error;
      }
      
      // Simple delay between retries
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

async function logToSyncLogs(supabase: any, operationId: string, status: string, message: string, details?: any): Promise<void> {
  try {
    await supabase
      .from('sync_logs')
      .insert({
        operation_id: operationId,
        operation_type: 'tcgcsv-fetch-v2',
        status,
        message,
        details
      });
  } catch (error) {
    console.error('Failed to log to sync_logs:', error);
  }
}

async function fetchCategories(supabase: any, operationId: string): Promise<void> {
  await logToSyncLogs(supabase, operationId, 'info', 'Starting to fetch TCGCSV categories');
  
  const response = await fetchWithRetry('https://tcgcsv.com/tcgplayer/categories', operationId, supabase);
  
  await logToSyncLogs(supabase, operationId, 'info', `Categories response type: ${typeof response}`, { response });
  
  // Handle different response formats
  let categories;
  if (Array.isArray(response)) {
    categories = response;
  } else if (response && response.results && Array.isArray(response.results)) {
    categories = response.results;
  } else if (response && response.data && Array.isArray(response.data)) {
    categories = response.data;
  } else {
    throw new Error(`Unexpected categories response format. Got: ${JSON.stringify(response).substring(0, 200)}`);
  }
  
  await logToSyncLogs(supabase, operationId, 'info', `Fetched ${categories.length} categories`);
  
  // Upsert categories
  for (const cat of categories) {
    const categoryData = {
      category_id: (cat.categoryId || cat.id || cat.category_id).toString(),
      name: cat.name || cat.displayName || cat.title,
      slug: cat.slug || cat.seoCategoryName || null,
      data: cat
    };
    
    await supabase
      .from('tcgcsv_categories')
      .upsert(categoryData, { onConflict: 'category_id' });
  }
  
  await logToSyncLogs(supabase, operationId, 'success', `Successfully upserted ${categories.length} categories`);
}

async function fetchGroups(supabase: any, categoryId: string, operationId: string): Promise<void> {
  await logToSyncLogs(supabase, operationId, 'info', `Starting to fetch groups for category ${categoryId}`);

  // Resolve game_id for this TCGCSV category
  const { data: gameRow, error: gameErr } = await supabase
    .from('games')
    .select('id')
    .eq('tcgcsv_category_id', categoryId)
    .maybeSingle();

  if (gameErr) {
    await logToSyncLogs(supabase, operationId, 'error', `Failed to resolve game for category ${categoryId}`, { error: gameErr.message });
    throw gameErr;
  }

  if (!gameRow?.id) {
    await logToSyncLogs(supabase, operationId, 'warning', `No game mapped to TCGCSV category ${categoryId}. Skipping group upsert.`);
    return;
  }
  const gameId = gameRow.id;
  
  const response = await fetchWithRetry(`https://tcgcsv.com/tcgplayer/${categoryId}/groups`, operationId, supabase);
  
  // Handle different response formats
  let groups;
  if (Array.isArray(response)) {
    groups = response;
  } else if (response && response.results && Array.isArray(response.results)) {
    groups = response.results;
  } else if (response && response.data && Array.isArray(response.data)) {
    groups = response.data;
  } else {
    throw new Error(`Unexpected groups response format for category ${categoryId}. Got: ${JSON.stringify(response).substring(0, 200)}`);
  }
  
  await logToSyncLogs(supabase, operationId, 'info', `Fetched ${groups.length} groups for category ${categoryId}`);
  
  // Upsert groups with required game_id
  let successCount = 0;
  for (const group of groups) {
    const groupData = {
      group_id: group.groupId.toString(),
      category_id: categoryId,
      tcgcsv_category_id: categoryId,
      game_id: gameId,
      name: group.name,
      slug: group.slug,
      release_date: group.publishedOn ? new Date(group.publishedOn).toISOString().split('T')[0] : null,
      data: group
    };
    
    const { error: upsertErr } = await supabase
      .from('tcgcsv_groups')
      .upsert(groupData, { onConflict: 'group_id' });

    if (upsertErr) {
      await logToSyncLogs(supabase, operationId, 'error', `Failed to upsert group ${group.groupId}`, { error: upsertErr.message });
    } else {
      successCount += 1;
    }
  }
  
  await logToSyncLogs(supabase, operationId, 'success', `Successfully upserted ${successCount}/${groups.length} groups for category ${categoryId}`, { gameId });
}

async function fetchProducts(supabase: any, categoryId: string, groupId: string, operationId: string): Promise<void> {
  await logToSyncLogs(supabase, operationId, 'info', `Starting to fetch products for category ${categoryId}, group ${groupId}`);
  
  // Resolve game_id via category
  const { data: gameRow, error: gameErr } = await supabase
    .from('games')
    .select('id')
    .eq('tcgcsv_category_id', categoryId)
    .maybeSingle();

  if (gameErr) {
    await logToSyncLogs(supabase, operationId, 'error', `Failed to resolve game for products in category ${categoryId}`, { error: gameErr.message });
    throw gameErr;
  }
  if (!gameRow?.id) {
    await logToSyncLogs(supabase, operationId, 'warning', `No game mapped to TCGCSV category ${categoryId}. Skipping product upsert.`);
    return;
  }
  const gameId = gameRow.id;
  
  const response = await fetchWithRetry(`https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/products`, operationId, supabase);
  
  // Handle different response formats
  let products;
  if (Array.isArray(response)) {
    products = response;
  } else if (response && response.results && Array.isArray(response.results)) {
    products = response.results;
  } else if (response && response.data && Array.isArray(response.data)) {
    products = response.data;
  } else {
    throw new Error(`Unexpected products response format for category ${categoryId}, group ${groupId}. Got: ${JSON.stringify(response).substring(0, 200)}`);
  }
  
  await logToSyncLogs(supabase, operationId, 'info', `Fetched ${products.length} products for group ${groupId}`);
  
  // Process products in batches
  const batchSize = 100;
  let successCount = 0;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const productData = batch.map((product: any) => ({
      product_id: product.productId.toString(),
      category_id: categoryId,
      group_id: groupId,
      tcgcsv_group_id: groupId,
      game_id: gameId,
      name: product.name,
      number: product.number || null,
      image_url: product.imageUrl || null,
      url: product.url || null,
      data: product
    }));
    
    const { error: upsertErr } = await supabase
      .from('tcgcsv_products')
      .upsert(productData, { onConflict: 'product_id' });
    
    if (upsertErr) {
      await logToSyncLogs(supabase, operationId, 'error', `Failed to upsert products batch for group ${groupId}`, { error: upsertErr.message });
    } else {
      successCount += productData.length;
    }
    
    await logToSyncLogs(supabase, operationId, 'info', `Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)} for group ${groupId}`);
  }
  
  await logToSyncLogs(supabase, operationId, 'success', `Upserted ~${successCount}/${products.length} products for group ${groupId}`, { gameId });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId, groupId, fetchType, operationId = `tcgcsv-fetch-${Date.now()}` } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await logToSyncLogs(supabase, operationId, 'started', `Starting TCGCSV fetch: ${fetchType}`, { categoryId, groupId });

    switch (fetchType) {
      case 'categories':
        await fetchCategories(supabase, operationId);
        break;
        
      case 'groups':
        if (!categoryId) {
          throw new Error('categoryId is required for fetching groups');
        }
        await fetchGroups(supabase, categoryId, operationId);
        break;
        
      case 'products':
        if (!categoryId || !groupId) {
          throw new Error('categoryId and groupId are required for fetching products');
        }
        await fetchProducts(supabase, categoryId, groupId, operationId);
        break;
        
      case 'all':
        // For large operations, run in background to avoid timeouts
        const backgroundTask = async () => {
          try {
            // Fetch everything: categories -> groups -> products
            await fetchCategories(supabase, operationId);
            
            // Get all categories
            const { data: categories } = await supabase
              .from('tcgcsv_categories')
              .select('category_id');
              
            for (const cat of categories || []) {
              await fetchGroups(supabase, cat.category_id, operationId);
              
              // Get groups for this category
              const { data: groups } = await supabase
                .from('tcgcsv_groups')
                .select('group_id')
                .eq('tcgcsv_category_id', cat.category_id);
                
              for (const group of groups || []) {
                await fetchProducts(supabase, cat.category_id, group.group_id, operationId);
              }
            }
            
            await logToSyncLogs(supabase, operationId, 'completed', `TCGCSV fetch completed: ${fetchType}`);
          } catch (error) {
            await logToSyncLogs(supabase, operationId, 'failed', `TCGCSV fetch failed: ${error.message}`, { error: error.message });
          }
        };
        
        // Run in background for large operations
        EdgeRuntime.waitUntil(backgroundTask());
        break;
        
      default:
        throw new Error(`Unknown fetchType: ${fetchType}`);
    }

    // For non-background operations, log completion
    if (fetchType !== 'all') {
      await logToSyncLogs(supabase, operationId, 'completed', `TCGCSV fetch completed: ${fetchType}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        operationId,
        message: `Successfully ${fetchType === 'all' ? 'started' : 'completed'} ${fetchType} fetch`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in tcgcsv-fetch-v2:', error);
    
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