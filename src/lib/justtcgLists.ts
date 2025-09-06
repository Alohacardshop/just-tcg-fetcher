import { buildUrl, authHeaders } from './justtcgClient';
import { fetchJsonWithRetry } from './fetchJsonWithRetry';
import { Card, Meta, Envelope, ListParams, BatchItem } from '../types/justtcg';
import pLimit from 'p-limit';

const MAX_PAGES = 100; // Safety cap to avoid infinite loops

export async function listAllSets(gameId: string, pageSize = 100): Promise<{ items: any[]; meta: Meta }> {
  const allSets: any[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  let finalMeta: Meta = {};
  
  console.log(`📋 Starting to fetch all sets for game: ${gameId}`);
  
  while (hasMore && pageCount < MAX_PAGES) {
    pageCount++;
    
    const url = buildUrl('/sets', {
      game: gameId,
      limit: pageSize,
      offset
    });
    
    console.log(`📄 Fetching sets page ${pageCount}, offset: ${offset}`);
    
    try {
      const envelope: Envelope<any[]> = await fetchJsonWithRetry(url, {
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
      });
      
      const { data, meta } = envelope;
      finalMeta = meta || {};
      
      if (data && Array.isArray(data)) {
        allSets.push(...data);
        console.log(`✅ Fetched ${data.length} sets (total: ${allSets.length})`);
      }
      
      // Check if we should continue
      hasMore = meta?.hasMore === true;
      offset += pageSize;
      
      // Safety check: if we got fewer items than requested, probably at the end
      if (data && data.length < pageSize) {
        hasMore = false;
      }
      
    } catch (error) {
      console.error(`❌ Failed to fetch sets page ${pageCount}:`, error);
      throw error;
    }
  }
  
  if (pageCount >= MAX_PAGES) {
    console.warn(`⚠️ Reached maximum page limit (${MAX_PAGES}) for sets. May not have fetched all data.`);
  }
  
  console.log(`🎉 Completed fetching sets: ${allSets.length} total sets across ${pageCount} pages`);
  
  return {
    items: allSets,
    meta: {
      ...finalMeta,
      total: allSets.length,
    }
  };
}

export async function listAllCardsBySet(params: ListParams): Promise<{ items: Card[]; meta: Meta }> {
  const { gameId, setId, pageSize = 100, orderBy, order } = params;
  
  if (!setId) {
    throw new Error('setId is required for listAllCardsBySet');
  }
  
  const allCards: Card[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  let finalMeta: Meta = {};
  
  console.log(`🃏 Starting to fetch all cards for set: ${setId} in game: ${gameId}`);
  
  while (hasMore && pageCount < MAX_PAGES) {
    pageCount++;
    
    const queryParams: Record<string, string | number> = {
      game: gameId,
      set: setId,
      limit: pageSize,
      offset
    };
    
    // Add ordering params if provided (only valid for game+set queries, not free-text search)
    if (orderBy && order) {
      queryParams.orderBy = orderBy;
      queryParams.order = order;
    }
    
    const url = buildUrl('/cards', queryParams);
    
    console.log(`🔄 JustTCG API call: ${url}`);
    console.log(`📄 Fetching cards page ${pageCount}, offset: ${offset}${orderBy ? ` (${orderBy} ${order})` : ''}`);
    
    try {
      const envelope: Envelope<Card[]> = await fetchJsonWithRetry(url, {
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
      });
      
      console.log(`📥 JustTCG API response:`, {
        hasData: !!envelope.data,
        dataType: typeof envelope.data,
        dataLength: Array.isArray(envelope.data) ? envelope.data.length : 'not array',
        hasMeta: !!envelope.meta,
        meta: envelope.meta
      });
      
      const { data, meta } = envelope;
      finalMeta = meta || {};
      
      if (data && Array.isArray(data)) {
        // Ensure each card has a variants array
        const cardsWithVariants = data.map(card => ({
          ...card,
          variants: card.variants || []
        }));
        
        allCards.push(...cardsWithVariants);
        console.log(`✅ Fetched ${cardsWithVariants.length} cards (total: ${allCards.length})`);
      }
      
      // Check if we should continue
      hasMore = meta?.hasMore === true;
      offset += pageSize;
      
      // Safety check: if we got fewer items than requested, probably at the end
      if (data && data.length < pageSize) {
        hasMore = false;
      }
      
    } catch (error) {
      console.error(`❌ Failed to fetch cards page ${pageCount}:`, error);
      throw error;
    }
  }
  
  if (pageCount >= MAX_PAGES) {
    console.warn(`⚠️ Reached maximum page limit (${MAX_PAGES}) for cards. May not have fetched all data.`);
  }
  
  const totalVariants = allCards.reduce((sum, card) => sum + card.variants.length, 0);
  console.log(`🎉 Completed fetching cards: ${allCards.length} cards with ${totalVariants} total variants across ${pageCount} pages`);
  
  return {
    items: allCards,
    meta: {
      ...finalMeta,
      total: allCards.length,
    }
  };
}

export async function batchCards(items: BatchItem[], chunkSize = 100): Promise<Card[]> {
  if (items.length === 0) {
    return [];
  }
  
  console.log(`🔄 Starting batch cards lookup for ${items.length} items (chunks of ${chunkSize})`);
  
  const chunks: BatchItem[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  
  console.log(`📦 Split into ${chunks.length} chunks`);
  
  // Use limited concurrency to avoid overwhelming the API
  const limit = pLimit(5);
  const allResults: Card[] = [];
  
  const chunkPromises = chunks.map((chunk, index) =>
    limit(async () => {
      console.log(`📄 Processing chunk ${index + 1}/${chunks.length} (${chunk.length} items)`);
      
      const url = buildUrl('/cards');
      
      try {
        const envelope: Envelope<Card[]> = await fetchJsonWithRetry(url, {
          method: 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });
        
        const result = envelope.data || [];
        console.log(`✅ Chunk ${index + 1} returned ${result.length} cards`);
        return result;
        
      } catch (error) {
        console.error(`❌ Failed to process chunk ${index + 1}:`, error);
        throw error;
      }
    })
  );
  
  try {
    const results = await Promise.all(chunkPromises);
    
    // Merge results preserving original order
    for (const chunkResult of results) {
      allResults.push(...chunkResult);
    }
    
    console.log(`🎉 Batch cards completed: ${allResults.length} total cards returned`);
    return allResults;
    
  } catch (error) {
    console.error(`❌ Batch cards failed:`, error);
    throw error;
  }
}