/**
 * Full Set Harvester - Fetch all cards and variants for a complete set
 * 
 * Handles pagination to get every card with all printing and condition variants.
 * Stores results in database with proper deduplication.
 */

import { supabase } from '@/integrations/supabase/client';

export interface HarvestCard {
  id: string;
  name: string;
  game: string;
  set: string;
  number?: string | null;
  tcgplayerId?: string | null;
  rarity?: string | null;
  details?: string | null;
  image_url?: string | null;
  variants: HarvestVariant[];
}

export interface HarvestVariant {
  id: string;
  printing: string;
  condition: string;
  price?: number | null;
  market_price?: number | null;
  low_price?: number | null;
  high_price?: number | null;
  currency?: string;
  lastUpdated?: string | null;
  priceChange24hr?: number | null;
  priceChange7d?: number | null;
  priceChange30d?: number | null;
  priceChange90d?: number | null;
  avgPrice?: number | null;
  priceHistory?: Array<{ date: string; price: number }> | null;
}

export interface HarvestMeta {
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
}

export interface HarvestPage {
  data: HarvestCard[];
  meta: HarvestMeta;
}

export interface HarvestResult {
  cards: HarvestCard[];
  totalPages: number;
  totalCards: number;
  expectedTotal?: number;
  gameId: string;
  setId: string;
  harvestedAt: string;
}

/**
 * Fetch all cards and variants for a complete set with pagination
 * 
 * @param gameId - Game identifier (e.g., 'pokemon', 'mtg')
 * @param setId - Set identifier (e.g., 'base-set', 'alpha')
 * @param limit - Page size (default: 100, max recommended: 200)
 * @param orderBy - Server-side sorting by price/change metrics
 * @param order - Sort order (asc/desc)
 * @returns Promise<HarvestResult> - All cards with complete variant data
 */
export async function fetchFullSetCards(
  gameId: string, 
  setId: string, 
  limit: number = 100,
  orderBy?: 'price' | '24h' | '7d' | '30d',
  order?: 'asc' | 'desc'
): Promise<HarvestResult> {
  console.log(`🌾 Starting full set harvest: ${gameId}/${setId} (pageSize: ${limit})`);
  
  const startTime = Date.now();
  let allCards: HarvestCard[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  let expectedTotal: number | undefined;
  
  // Dedupe map to prevent duplicates across pages
  const cardMap = new Map<string, HarvestCard>();
  
  while (hasMore) {
    pageCount++;
    const pageStartTime = Date.now();
    
    try {
      console.log(`📄 Fetching page ${pageCount} (offset: ${offset}, limit: ${limit}, orderBy: ${orderBy}, order: ${order})`);
      
      // Call the proxy function to get page data
      const { data: pageResponse, error } = await supabase.functions.invoke('harvest-set-cards', {
        body: {
          gameId,
          setId,
          limit,
          offset,
          orderBy,
          order
        }
      });
      
      if (error) {
        throw new Error(`Harvest API error: ${error.message}`);
      }
      
      const pageData: HarvestCard[] = pageResponse.data || [];
      const meta: HarvestMeta = pageResponse.meta || {};
      
      const pageDuration = Date.now() - pageStartTime;
      
      // Store expected total from first page
      if (pageCount === 1 && meta.total !== undefined) {
        expectedTotal = meta.total;
        console.log(`📊 Expected total cards: ${expectedTotal}`);
      }
      
      console.log(`✅ Page ${pageCount} fetched: ${pageData.length} cards (${pageDuration}ms)`);
      console.log(`📈 Meta - hasMore: ${meta.hasMore}, total: ${meta.total}, limit: ${meta.limit}, offset: ${meta.offset}`);
      
      if (pageData.length === 0) {
        console.log(`📭 Empty page received, stopping pagination`);
        break;
      }
      
      // Deduplicate cards by ID
      pageData.forEach(card => {
        if (card.id) {
          cardMap.set(card.id, card);
        }
      });
      
      // Check meta.hasMore first (most reliable)
      if (meta.hasMore === false) {
        console.log(`🏁 meta.hasMore === false, pagination complete`);
        hasMore = false;
        break;
      }
      
      // Fallback: if we got fewer items than requested, assume we're done
      if (pageData.length < limit) {
        console.log(`🏁 Partial page (${pageData.length}/${limit}), assuming end of data`);
        hasMore = false;
        break;
      }
      
      // Update offset for next page
      offset += pageData.length;
      
      // Safety check: if we've reached expected total, stop
      if (expectedTotal !== undefined && cardMap.size >= expectedTotal) {
        console.log(`🏁 Reached expected total (${cardMap.size}/${expectedTotal}), stopping`);
        hasMore = false;
        break;
      }
      
      // Rate limiting: small delay between pages
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      const pageDuration = Date.now() - pageStartTime;
      console.error(`❌ Error fetching page ${pageCount} (${pageDuration}ms):`, error);
      
      // If we have some data, return what we got; otherwise re-throw
      if (cardMap.size > 0) {
        console.warn(`⚠️ Partial data recovered: ${cardMap.size} cards from ${pageCount - 1} successful pages`);
        break;
      } else {
        throw error;
      }
    }
  }
  
  // Convert map to array
  allCards = Array.from(cardMap.values());
  
  const totalDuration = Date.now() - startTime;
  
  console.log(`🌾 Set harvest complete for ${gameId}/${setId}:`);
  console.log(`   Total cards harvested: ${allCards.length}`);
  console.log(`   Pages processed: ${pageCount}`);
  console.log(`   Expected total: ${expectedTotal || 'unknown'}`);
  console.log(`   Total variants: ${allCards.reduce((sum, card) => sum + (card.variants?.length || 0), 0)}`);
  console.log(`   Duration: ${totalDuration}ms`);
  
  // Validate against expected total if available
  if (expectedTotal !== undefined && allCards.length !== expectedTotal) {
    console.warn(`⚠️ Count mismatch: harvested ${allCards.length}, expected ${expectedTotal}`);
  } else if (expectedTotal !== undefined) {
    console.log(`✅ Count matches expected total: ${allCards.length}`);
  }
  
  return {
    cards: allCards,
    totalPages: pageCount,
    totalCards: allCards.length,
    expectedTotal,
    gameId,
    setId,
    harvestedAt: new Date().toISOString()
  };
}

/**
 * Sync a complete set to the database with transaction safety
 * 
 * @param gameId - Game identifier
 * @param setId - Set identifier  
 * @param limit - Page size for harvesting (default: 100)
 * @param orderBy - Server-side sorting by price/change metrics
 * @param order - Sort order (asc/desc)
 * @returns Promise<HarvestResult & { dbStats: any }> - Harvest result with DB stats
 */
export async function syncSet(
  gameId: string,
  setId: string,
  limit: number = 100,
  orderBy?: 'price' | '24h' | '7d' | '30d',
  order?: 'asc' | 'desc'
): Promise<HarvestResult & { dbStats: any }> {
  console.log(`💾 Starting full set sync: ${gameId}/${setId}`);
  
  try {
    // Step 1: Harvest all cards and variants
    const harvestResult = await fetchFullSetCards(gameId, setId, limit, orderBy, order);
    
    if (harvestResult.cards.length === 0) {
      throw new Error(`No cards found for set ${gameId}/${setId}`);
    }
    
    // Step 2: Sync to database via edge function
    console.log(`💾 Syncing ${harvestResult.cards.length} cards to database...`);
    
    const { data: syncResponse, error: syncError } = await supabase.functions.invoke('sync-harvested-set', {
      body: {
        gameId,
        setId,
        cards: harvestResult.cards,
        harvestMeta: {
          totalPages: harvestResult.totalPages,
          totalCards: harvestResult.totalCards,
          expectedTotal: harvestResult.expectedTotal,
          harvestedAt: harvestResult.harvestedAt
        }
      }
    });
    
    if (syncError) {
      throw new Error(`Database sync error: ${syncError.message}`);
    }
    
    console.log(`✅ Set sync complete for ${gameId}/${setId}:`, syncResponse);
    
    return {
      ...harvestResult,
      dbStats: syncResponse
    };
    
  } catch (error) {
    console.error(`❌ Set sync failed for ${gameId}/${setId}:`, error);
    throw error;
  }
}

/**
 * Utility function to validate harvest results
 */
export function validateHarvestResult(result: HarvestResult): {
  isValid: boolean;
  warnings: string[];
  stats: {
    totalVariants: number;
    avgVariantsPerCard: number;
    cardsWithMultipleVariants: number;
    distinctPrintings: number;
    distinctConditions: number;
  };
} {
  const warnings: string[] = [];
  
  // Check for expected total mismatch
  if (result.expectedTotal && result.totalCards !== result.expectedTotal) {
    warnings.push(`Card count mismatch: got ${result.totalCards}, expected ${result.expectedTotal}`);
  }
  
  // Check for cards without variants
  const cardsWithoutVariants = result.cards.filter(card => !card.variants || card.variants.length === 0);
  if (cardsWithoutVariants.length > 0) {
    warnings.push(`${cardsWithoutVariants.length} cards have no variants`);
  }
  
  // Calculate stats
  const totalVariants = result.cards.reduce((sum, card) => sum + (card.variants?.length || 0), 0);
  const avgVariantsPerCard = result.totalCards > 0 ? totalVariants / result.totalCards : 0;
  const cardsWithMultipleVariants = result.cards.filter(card => card.variants && card.variants.length > 1).length;
  
  const allPrintings = new Set<string>();
  const allConditions = new Set<string>();
  
  result.cards.forEach(card => {
    card.variants?.forEach(variant => {
      if (variant.printing) allPrintings.add(variant.printing);
      if (variant.condition) allConditions.add(variant.condition);
    });
  });
  
  return {
    isValid: warnings.length === 0,
    warnings,
    stats: {
      totalVariants,
      avgVariantsPerCard: Math.round(avgVariantsPerCard * 100) / 100,
      cardsWithMultipleVariants,
      distinctPrintings: allPrintings.size,
      distinctConditions: allConditions.size
    }
  };
}