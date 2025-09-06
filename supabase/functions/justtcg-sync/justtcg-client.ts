/**
 * Hardened JustTCG API Client with Defensive Guards
 * 
 * This client ensures that all pagination loops yield arrays only,
 * preventing crashes from undefined/null responses.
 */

import { 
  buildUrl, 
  fetchJsonWithRetry, 
  normalizeGameSlug,
  getJustTCGApiKey 
} from './api-helpers.ts';

export interface JustTCGCardPage {
  data?: any[];
  cards?: any[];
  meta?: {
    hasMore?: boolean;
    total?: number;
    limit?: number;
    offset?: number;
  };
}

export class JustTCGClient {
  private apiKey: string;

  constructor() {
    this.apiKey = getJustTCGApiKey();
  }

  /**
   * Generator function that yields card pages as arrays only
   * Never yields undefined/null - always returns empty array on error
   */
  async* getCards(gameId: string, setId: string, pageSize = 100): AsyncGenerator<any[], void, unknown> {
    console.log(`🃏 Starting JustTCGClient.getCards for ${gameId}/${setId} (pageSize: ${pageSize})`);
    
    const normalizedGameId = normalizeGameSlug(gameId);
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;
    let expectedTotal: number | null = null;
    
    while (hasMore) {
      pageCount++;
      const startTime = Date.now();
      
      try {
        console.log(`📄 JustTCGClient fetching page ${pageCount} (offset: ${offset}, limit: ${pageSize})`);
        
        // Build query parameters
        const params: Record<string, string | number> = {
          game: normalizedGameId,
          set: setId,
          limit: pageSize,
          offset: offset
        };
        
        const url = buildUrl('cards', params);
        const response = await fetchJsonWithRetry(url);
        const duration = Date.now() - startTime;
        
        // Extract data with defensive guards
        let pageData: any[] = [];
        if (response && typeof response === 'object') {
          const rawData = response.data || response.cards || response.items || [];
          pageData = Array.isArray(rawData) ? rawData : [];
        }
        
        // Extract metadata with defensive guards
        const meta = (response && typeof response === 'object') 
          ? (response.meta || response._metadata || {}) 
          : {};
        
        // Store expected total from first page
        if (pageCount === 1 && typeof meta.total === 'number') {
          expectedTotal = meta.total;
          console.log(`📊 JustTCGClient expected total cards: ${expectedTotal}`);
        }
        
        console.log(`✅ JustTCGClient page ${pageCount} fetched: ${pageData.length} cards (${duration}ms)`);
        console.log(`📈 JustTCGClient meta - hasMore: ${meta.hasMore}, total: ${meta.total}, offset: ${meta.offset}`);
        
        // Always yield an array, even if empty
        yield pageData;
        
        // Check for end conditions
        if (pageData.length === 0) {
          console.log(`📭 JustTCGClient empty page received, stopping pagination`);
          break;
        }
        
        // Check meta.hasMore first (most reliable)
        if (meta.hasMore === false) {
          console.log(`🏁 JustTCGClient meta.hasMore === false, pagination complete`);
          hasMore = false;
          break;
        }
        
        // Fallback: if we got fewer items than requested, assume we're done
        if (pageData.length < pageSize) {
          console.log(`🏁 JustTCGClient partial page (${pageData.length}/${pageSize}), assuming end of data`);
          hasMore = false;
          break;
        }
        
        // Update offset for next page
        offset += pageData.length;
        
        // Safety check: prevent infinite loops
        if (pageCount > 1000) {
          console.warn(`⚠️ JustTCGClient safety break: too many pages (${pageCount}), stopping`);
          break;
        }
        
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ JustTCGClient error fetching page ${pageCount} (${duration}ms):`, error.message);
        
        // On error, yield empty array and stop pagination
        yield [];
        break;
      }
    }
    
    console.log(`📊 JustTCGClient pagination complete for ${gameId}/${setId}:`);
    console.log(`   Pages processed: ${pageCount}`);
    console.log(`   Expected total: ${expectedTotal || 'unknown'}`);
  }

  /**
   * Get sets for a game with defensive guards
   */
  async getSets(gameId: string): Promise<any[]> {
    try {
      console.log(`📦 JustTCGClient fetching sets for game: ${gameId}`);
      
      const normalizedGameId = normalizeGameSlug(gameId);
      const url = buildUrl('sets', { game: normalizedGameId });
      const response = await fetchJsonWithRetry(url);
      
      // Extract sets with defensive guards
      let sets: any[] = [];
      if (response && typeof response === 'object') {
        const rawData = response.data || response.sets || response.items || [];
        sets = Array.isArray(rawData) ? rawData : [];
      }
      
      console.log(`✅ JustTCGClient fetched ${sets.length} sets for game: ${gameId}`);
      return sets;
      
    } catch (error) {
      console.error(`❌ JustTCGClient error fetching sets for game ${gameId}:`, error.message);
      return []; // Always return empty array on error
    }
  }

  /**
   * Get games with defensive guards
   */
  async getGames(): Promise<any[]> {
    try {
      console.log(`🎮 JustTCGClient fetching games`);
      
      const url = buildUrl('games', {});
      const response = await fetchJsonWithRetry(url);
      
      // Extract games with defensive guards
      let games: any[] = [];
      if (response && typeof response === 'object') {
        const rawData = response.data || response.games || response.items || [];
        games = Array.isArray(rawData) ? rawData : [];
      }
      
      console.log(`✅ JustTCGClient fetched ${games.length} games`);
      return games;
      
    } catch (error) {
      console.error(`❌ JustTCGClient error fetching games:`, error.message);
      return []; // Always return empty array on error
    }
  }
}

// Export singleton instance
export const justTCGClient = new JustTCGClient();