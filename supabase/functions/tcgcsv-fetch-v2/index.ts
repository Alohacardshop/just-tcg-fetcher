import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Throttling configuration
interface ThrottleConfig {
  maxConcurrency: number;
  requestsPerSecond: number;
  retryDelayMs: number;
  maxRetries: number;
}

class APIThrottler {
  private config: ThrottleConfig;
  private queue: (() => Promise<any>)[] = [];
  private running = 0;
  private lastRequestTime = 0;
  
  constructor(config: ThrottleConfig) {
    this.config = config;
  }
  
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedFn = async () => {
        try {
          const result = await this.executeWithRetry(fn);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      
      this.queue.push(wrappedFn);
      this.processQueue();
    });
  }
  
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();
        return await fn();
      } catch (error) {
        if (attempt === this.config.maxRetries) {
          throw error;
        }
        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }
  
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.config.requestsPerSecond;
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  private async processQueue(): Promise<void> {
    if (this.running >= this.config.maxConcurrency || this.queue.length === 0) {
      return;
    }
    
    const task = this.queue.shift();
    if (!task) return;
    
    this.running++;
    
    try {
      await task();
    } finally {
      this.running--;
      this.processQueue();
    }
  }
}

// Global throttler
const throttler = new APIThrottler({
  maxConcurrency: 3,
  requestsPerSecond: 2,
  retryDelayMs: 1000,
  maxRetries: 3
});

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

async function fetchWithRetry(url: string, operationId: string, supabase: any): Promise<any> {
  return throttler.enqueue(async () => {
    console.log(`🌐 Fetching: ${url}`);
    await logToSyncLogs(supabase, operationId, 'info', `Fetching: ${url}`);
    
    const response = await fetch(url);
    
    if (response.status === 429) {
      await logToSyncLogs(supabase, operationId, 'warning', 'Rate limited, will retry', { url, status: 429 });
      throw new Error('Rate limited');
    }
    
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
  });
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
        const backgroundTask = async () => {
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
        };
        
        // Run in background for large operations
        EdgeRuntime.waitUntil(backgroundTask());
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