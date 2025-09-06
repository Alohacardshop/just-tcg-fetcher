/**
 * Card Variants Fetcher - Fetch all variants for a card using only ID parameters
 * 
 * Returns all printings and conditions for a given card without filtering.
 * Supports tcgplayerId, cardId, or variantId as input.
 */

export interface CardVariant {
  id: string;
  printing: string;
  condition: string;
  price?: number | null;
  lastUpdated?: string | null;
  priceChange24hr?: number | null;
  priceChange7d?: number | null;
  priceChange30d?: number | null;
  priceChange90d?: number | null;
  avgPrice?: number | null;
  priceHistory?: Array<{ date: string; price: number }> | null;
  currency?: string;
  market_price?: number | null;
  low_price?: number | null;
  high_price?: number | null;
}

export interface CardWithVariants {
  id: string;
  name: string;
  game: string;
  set: string;
  number?: string | null;
  tcgplayerId?: string | null;
  rarity?: string | null;
  details?: string | null;
  variants: CardVariant[];
}

export interface VariantsFetchResponse {
  data: CardWithVariants[];
}

export interface VariantsFetchParams {
  tcgplayerId?: string;
  cardId?: string;
  variantId?: string;
  // Text search is ignored if any ID param is present
  name?: string;
  game?: string;
  set?: string;
  // Full mode strips printing/condition filters
  full?: boolean;
  // Server-side sorting (only for game/set queries, not ID/search)
  orderBy?: 'price' | '24h' | '7d' | '30d';
  order?: 'asc' | 'desc';
}

/**
 * Fetch all variants for a card by ID (no filtering by printing or condition)
 * 
 * @param params - Search parameters with ID taking precedence over text search
 * @returns Promise<VariantsFetchResponse> - All variants for the card
 */
export async function fetchCardVariants(params: VariantsFetchParams): Promise<VariantsFetchResponse> {
  const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';
  
  // Input validation
  const hasIdParam = !!(params.tcgplayerId || params.cardId || params.variantId);
  const hasGameSet = !!(params.game && params.set);
  
  // Validate inputs based on query type
  if (!hasIdParam && !hasGameSet && !params.name) {
    throw new Error('Validation failed: Require either ID (tcgplayerId/cardId/variantId) or game+set for set-level queries, or name for text search');
  }
  
  // Guard: ID takes precedence over text search
  if (hasIdParam) {
    console.log('🆔 ID parameter provided, ignoring text search inputs');
    if (params.name || params.game || params.set) {
      console.log('⚠️ Text search parameters ignored due to ID precedence');
    }
  }
  
  // Build query parameters
  const queryParams = new URLSearchParams();
  
  if (params.tcgplayerId) {
    queryParams.append('tcgplayerId', params.tcgplayerId);
  } else if (params.cardId) {
    queryParams.append('cardId', params.cardId);
  } else if (params.variantId) {
    queryParams.append('variantId', params.variantId);
  } else {
    // Only use text search if no ID params provided
    if (params.name) queryParams.append('name', params.name);
    if (params.game) queryParams.append('game', params.game);
    if (params.set) queryParams.append('set', params.set);
    
    // Add server-side sorting for game/set queries (not for text search)
    if (hasGameSet && params.orderBy) {
      queryParams.append('orderBy', params.orderBy);
      if (params.order) {
        queryParams.append('order', params.order);
      }
    }
  }
  
  // Full mode: don't add printing/condition filters (they're stripped)
  if (params.full) {
    console.log('🔓 Full mode enabled - all variants will be returned without filtering');
  }
  
  const url = `${JUSTTCG_BASE_URL}/cards?${queryParams.toString()}`;
  
  try {
    // Import fetchJsonWithRetry for enhanced error handling
    const { fetchJsonWithRetry } = await import('./fetchJsonWithRetry');
    
    const data = await fetchJsonWithRetry(url, {
      headers: {
        'x-api-key': await getApiKey(),
        'Content-Type': 'application/json'
      }
    }, {
      tries: 3,
      baseDelayMs: 500,
      timeoutMs: 30000
    });
    
    // Return the API response unchanged - preserve exact IDs from API
    return data as VariantsFetchResponse;
    
  } catch (error) {
    console.error('❌ Error fetching card variants:', error);
    throw error;
  }
}

/**
 * Get API key from Supabase edge function or environment
 * This function is a placeholder - actual implementation would go through the proxy
 */
async function getApiKey(): Promise<string> {
  // In practice, this function wouldn't be used directly
  // The cardVariantsFetcher would call the proxy-pricing edge function instead
  throw new Error('Direct API calls not supported - use Supabase proxy-pricing function instead');
}

/**
 * Utility function to check if response contains multiple variants
 */
export function hasMultipleVariants(response: VariantsFetchResponse): boolean {
  return response.data.some(card => card.variants.length > 1);
}

/**
 * Utility function to get all unique printing types from variants
 */
export function getUniquePrintings(card: CardWithVariants): string[] {
  const printings = card.variants.map(v => v.printing).filter(Boolean);
  return [...new Set(printings)];
}

/**
 * Utility function to get all unique conditions from variants
 */
export function getUniqueConditions(card: CardWithVariants): string[] {
  const conditions = card.variants.map(v => v.condition).filter(Boolean);
  return [...new Set(conditions)];
}
