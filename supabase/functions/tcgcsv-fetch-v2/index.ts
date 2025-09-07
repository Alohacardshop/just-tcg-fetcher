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

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url} (attempt ${i + 1})`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Fetch attempt ${i + 1} failed:`, error);
      
      if (i === retries - 1) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
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
  
  const categories = await fetchWithRetry('https://tcgcsv.com/tcgplayer/categories');
  
  if (!Array.isArray(categories)) {
    throw new Error('Categories response is not an array');
  }
  
  await logToSyncLogs(supabase, operationId, 'info', `Fetched ${categories.length} categories`);
  
  // Upsert categories
  for (const cat of categories) {
    const categoryData = {
      category_id: cat.categoryId.toString(),
      name: cat.name || cat.displayName,
      slug: cat.slug,
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
  
  const groups = await fetchWithRetry(`https://tcgcsv.com/tcgplayer/${categoryId}/groups`);
  
  if (!Array.isArray(groups)) {
    throw new Error('Groups response is not an array');
  }
  
  await logToSyncLogs(supabase, operationId, 'info', `Fetched ${groups.length} groups for category ${categoryId}`);
  
  // Upsert groups
  for (const group of groups) {
    const groupData = {
      group_id: group.groupId.toString(),
      category_id: categoryId,
      tcgcsv_category_id: categoryId,
      name: group.name,
      slug: group.slug,
      release_date: group.publishedOn ? new Date(group.publishedOn).toISOString().split('T')[0] : null,
      data: group
    };
    
    await supabase
      .from('tcgcsv_groups')
      .upsert(groupData, { onConflict: 'group_id' });
  }
  
  await logToSyncLogs(supabase, operationId, 'success', `Successfully upserted ${groups.length} groups for category ${categoryId}`);
}

async function fetchProducts(supabase: any, categoryId: string, groupId: string, operationId: string): Promise<void> {
  await logToSyncLogs(supabase, operationId, 'info', `Starting to fetch products for category ${categoryId}, group ${groupId}`);
  
  const products = await fetchWithRetry(`https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/products`);
  
  if (!Array.isArray(products)) {
    throw new Error('Products response is not an array');
  }
  
  await logToSyncLogs(supabase, operationId, 'info', `Fetched ${products.length} products for group ${groupId}`);
  
  // Process products in batches
  const batchSize = 100;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const productData = batch.map(product => ({
      product_id: product.productId.toString(),
      category_id: categoryId,
      group_id: groupId,
      tcgcsv_group_id: groupId,
      name: product.name,
      number: product.number || null,
      image_url: product.imageUrl || null,
      url: product.url || null,
      data: product
    }));
    
    await supabase
      .from('tcgcsv_products')
      .upsert(productData, { onConflict: 'product_id' });
      
    await logToSyncLogs(supabase, operationId, 'info', `Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)} for group ${groupId}`);
  }
  
  await logToSyncLogs(supabase, operationId, 'success', `Successfully upserted ${products.length} products for group ${groupId}`);
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
        break;
        
      default:
        throw new Error(`Unknown fetchType: ${fetchType}`);
    }

    await logToSyncLogs(supabase, operationId, 'completed', `TCGCSV fetch completed: ${fetchType}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        operationId,
        message: `Successfully fetched ${fetchType}`
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