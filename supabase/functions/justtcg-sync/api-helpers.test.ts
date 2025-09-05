/**
 * Unit tests for JustTCG API helpers
 * Ensures proper header normalization and API key handling
 */

import { 
  getApiKey, 
  createJustTCGHeaders, 
  validateJustTCGHeaders 
} from './api-helpers.ts';

// Mock Deno.env for testing
const mockEnv = {
  get: (key: string) => {
    if (key === 'JUSTTCG_API_KEY') return 'test-api-key-123';
    return undefined;
  }
};

// @ts-ignore - Mock for testing
globalThis.Deno = { env: mockEnv };

// Test suite
const tests = [
  {
    name: 'getApiKey returns API key from environment',
    test: () => {
      const apiKey = getApiKey();
      if (apiKey !== 'test-api-key-123') {
        throw new Error(`Expected 'test-api-key-123', got '${apiKey}'`);
      }
      console.log('✅ getApiKey test passed');
    }
  },
  
  {
    name: 'getApiKey throws when API key missing',
    test: () => {
      const originalGet = mockEnv.get;
      mockEnv.get = () => undefined;
      
      try {
        getApiKey();
        throw new Error('Expected error but none was thrown');
      } catch (error) {
        if (!error.message.includes('JUSTTCG_API_KEY not configured')) {
          throw new Error(`Unexpected error message: ${error.message}`);
        }
      }
      
      mockEnv.get = originalGet;
      console.log('✅ getApiKey error handling test passed');
    }
  },
  
  {
    name: 'createJustTCGHeaders uses exact case X-API-Key',
    test: () => {
      const headers = createJustTCGHeaders('test-key');
      
      // CRITICAL: Must be exact case "X-API-Key"
      if (!headers['X-API-Key']) {
        throw new Error('Missing required header X-API-Key (exact case)');
      }
      
      if (headers['X-API-Key'] !== 'test-key') {
        throw new Error(`Expected API key 'test-key', got '${headers['X-API-Key']}'`);
      }
      
      // Ensure no variations exist
      if (headers['X-API-KEY'] || headers['x-api-key'] || headers['X-Api-Key']) {
        throw new Error('Header contains incorrect case variations');
      }
      
      console.log('✅ Header case test passed');
    }
  },
  
  {
    name: 'createJustTCGHeaders throws when API key missing',
    test: () => {
      try {
        createJustTCGHeaders('');
        throw new Error('Expected error but none was thrown');
      } catch (error) {
        if (!error.message.includes('API key is required')) {
          throw new Error(`Unexpected error message: ${error.message}`);
        }
  },
  
  {
    name: 'normalizeGameSlug handles pokemon variations',
    test: () => {
      const { normalizeGameSlug } = require('./api-helpers.ts');
      
      // Pokemon variations should normalize to 'pokemon'
      if (normalizeGameSlug('pokemon-tcg') !== 'pokemon') {
        throw new Error('Expected pokemon-tcg to normalize to pokemon');
      }
      
      if (normalizeGameSlug('Pokemon-English') !== 'pokemon') {
        throw new Error('Expected Pokemon-English to normalize to pokemon');
      }
      
      if (normalizeGameSlug('POKEMON-US') !== 'pokemon') {
        throw new Error('Expected POKEMON-US to normalize to pokemon');
      }
      
      // Pokemon Japan should remain distinct
      if (normalizeGameSlug('pokemon-japan') !== 'pokemon-japan') {
        throw new Error('Expected pokemon-japan to remain pokemon-japan');
      }
      
      if (normalizeGameSlug('pokemon-jp') !== 'pokemon-japan') {
        throw new Error('Expected pokemon-jp to normalize to pokemon-japan');
      }
      
      console.log('✅ Pokemon normalization test passed');
    }
  },
  
  {
    name: 'normalizeGameSlug handles mtg variations',
    test: () => {
      const { normalizeGameSlug } = require('./api-helpers.ts');
      
      if (normalizeGameSlug('magic') !== 'mtg') {
        throw new Error('Expected magic to normalize to mtg');
      }
      
      if (normalizeGameSlug('Magic-The-Gathering') !== 'mtg') {
        throw new Error('Expected Magic-The-Gathering to normalize to mtg');
      }
      
      if (normalizeGameSlug('MTG-English') !== 'mtg') {
        throw new Error('Expected MTG-English to normalize to mtg');
      }
      
      console.log('✅ MTG normalization test passed');
    }
  },
  
  {
    name: 'normalizeGameSlug handles other game variations',
    test: () => {
      const { normalizeGameSlug } = require('./api-helpers.ts');
      
      // One Piece variations
      if (normalizeGameSlug('one-piece') !== 'one-piece-card-game') {
        throw new Error('Expected one-piece to normalize to one-piece-card-game');
      }
      
      // Disney Lorcana variations
      if (normalizeGameSlug('lorcana') !== 'disney-lorcana') {
        throw new Error('Expected lorcana to normalize to disney-lorcana');
      }
      
      // Star Wars variations
      if (normalizeGameSlug('star-wars') !== 'star-wars-unlimited') {
        throw new Error('Expected star-wars to normalize to star-wars-unlimited');
      }
      
      if (normalizeGameSlug('swu') !== 'star-wars-unlimited') {
        throw new Error('Expected swu to normalize to star-wars-unlimited');
      }
      
      console.log('✅ Other games normalization test passed');
    }
  },
  
  {
    name: 'normalizeGameSlug preserves already normalized slugs',
    test: () => {
      const { normalizeGameSlug } = require('./api-helpers.ts');
      
      // Already normalized should remain unchanged
      if (normalizeGameSlug('pokemon') !== 'pokemon') {
        throw new Error('Expected pokemon to remain pokemon');
      }
      
      if (normalizeGameSlug('mtg') !== 'mtg') {
        throw new Error('Expected mtg to remain mtg');
      }
      
      if (normalizeGameSlug('disney-lorcana') !== 'disney-lorcana') {
        throw new Error('Expected disney-lorcana to remain disney-lorcana');
      }
      
      console.log('✅ Preserved normalization test passed');
    }
  },
  
  {
    name: 'normalizeGameSlug throws on invalid input',
    test: () => {
      const { normalizeGameSlug } = require('./api-helpers.ts');
      
      try {
        normalizeGameSlug('');
        throw new Error('Expected error for empty string');
      } catch (error) {
        if (!error.message.includes('Game slug is required')) {
          throw new Error('Expected specific error message for empty string');
        }
      }
      
      try {
        normalizeGameSlug(null);
        throw new Error('Expected error for null');
      } catch (error) {
        if (!error.message.includes('Game slug is required')) {
          throw new Error('Expected specific error message for null');
        }
      }
      
      console.log('✅ Input validation test passed');
    }
  },
  
  {
    name: 'buildJustTCGUrl applies normalization automatically',
    test: () => {
      const { buildJustTCGUrl } = require('./api-helpers.ts');
      
      const url1 = buildJustTCGUrl('sets', { game: 'pokemon-tcg' });
      if (!url1.includes('game=pokemon')) {
        throw new Error('Expected URL to contain normalized game=pokemon');
      }
      
      const url2 = buildJustTCGUrl('cards', { game: 'magic', set: 'alpha' });
      if (!url2.includes('game=mtg')) {
        throw new Error('Expected URL to contain normalized game=mtg');
      }
      
      console.log('✅ URL builder normalization test passed');
    }
  }
      console.log('✅ Header validation test passed');
    }
  },
  
  {
    name: 'validateJustTCGHeaders validates exact case',
    test: () => {
      // Valid headers
      if (!validateJustTCGHeaders({ 'X-API-Key': 'test' })) {
        throw new Error('Should validate correct headers');
      }
      
      // Invalid case variations
      if (validateJustTCGHeaders({ 'X-API-KEY': 'test' })) {
        throw new Error('Should reject X-API-KEY (wrong case)');
      }
      
      if (validateJustTCGHeaders({ 'x-api-key': 'test' })) {
        throw new Error('Should reject x-api-key (wrong case)');
      }
      
      if (validateJustTCGHeaders({ 'X-Api-Key': 'test' })) {
        throw new Error('Should reject X-Api-Key (wrong case)');
      }
      
      // Missing header
      if (validateJustTCGHeaders({})) {
        throw new Error('Should reject missing headers');
      }
      
      console.log('✅ Header validation case test passed');
    }
  },
  
  {
    name: 'fetchJsonWithRetry handles successful responses',
    test: async () => {
      // Mock successful fetch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
      
      try {
        const { fetchJsonWithRetry } = await import('./api-helpers.ts');
        const result = await fetchJsonWithRetry('https://test.com', { headers: { 'X-API-Key': 'test' } });
        
        if (!result.success) {
          throw new Error('Expected successful response');
        }
        
        console.log('✅ fetchJsonWithRetry success test passed');
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  },
  
  {
    name: 'fetchJsonWithRetry retries on 429 errors',
    test: async () => {
      let attempts = 0;
      const originalFetch = globalThis.fetch;
      
      globalThis.fetch = async () => {
        attempts++;
        if (attempts < 3) {
          return new Response('Rate limited', { status: 429 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      try {
        const { fetchJsonWithRetry } = await import('./api-helpers.ts');
        const result = await fetchJsonWithRetry(
          'https://test.com', 
          { headers: { 'X-API-Key': 'test' } },
          { tries: 3, baseDelayMs: 10 }
        );
        
        if (attempts !== 3) {
          throw new Error(`Expected 3 attempts, got ${attempts}`);
        }
        
        if (!result.success) {
          throw new Error('Expected successful result after retries');
        }
        
        console.log('✅ fetchJsonWithRetry retry test passed');
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  },
  
  {
    name: 'fetchJsonWithRetry fails on non-retryable errors',
    test: async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('Not found', { status: 404 });
      
      try {
        const { fetchJsonWithRetry } = await import('./api-helpers.ts');
        
        try {
          await fetchJsonWithRetry('https://test.com', { headers: { 'X-API-Key': 'test' } });
          throw new Error('Expected error but none was thrown');
        } catch (error) {
          if (!error.message.includes('404')) {
            throw new Error(`Expected 404 error, got: ${error.message}`);
          }
        }
        
        console.log('✅ fetchJsonWithRetry non-retryable error test passed');
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  },
  
  {
    name: 'fetchPaginatedData handles single page',
    test: async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        // Check for limit/offset params
        const urlObj = new URL(url);
        const limit = urlObj.searchParams.get('limit');
        const offset = urlObj.searchParams.get('offset');
        
        if (limit !== '100' || offset !== '0') {
          throw new Error(`Expected limit=100&offset=0, got limit=${limit}&offset=${offset}`);
        }
        
        return new Response(JSON.stringify({ 
          data: [{ id: 1 }, { id: 2 }],
          meta: { hasMore: false }
        }), { status: 200 });
      };
      
      try {
        const { fetchPaginatedData } = await import('./api-helpers.ts');
        const result = await fetchPaginatedData(
          'https://test.com', 
          { 'X-API-Key': 'test' },
          { limit: 100, maxPages: 5 }
        );
        
        if (result.totalFetched !== 2) {
          throw new Error(`Expected 2 items, got ${result.totalFetched}`);
        }
        
        if (result.stoppedReason !== 'hasMore_false') {
          throw new Error(`Expected hasMore_false, got ${result.stoppedReason}`);
        }
        
        console.log('✅ fetchPaginatedData single page test passed');
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  },
  
  {
    name: 'fetchPaginatedData handles multiple pages and envelope extraction',
    test: async () => {
      let requestCount = 0;
      const originalFetch = globalThis.fetch;
      
      globalThis.fetch = async (url) => {
        requestCount++;
        const urlObj = new URL(url);
        const offset = parseInt(urlObj.searchParams.get('offset') || '0');
        
        // Return different envelope formats to test extraction
        if (requestCount === 1) {
          return new Response(JSON.stringify({ 
            results: [{ id: 1 }, { id: 2 }] // Using 'results' envelope
          }), { status: 200 });
        } else if (requestCount === 2) {
          return new Response(JSON.stringify({ 
            data: { cards: [{ id: 3 }] } // Using nested 'cards' envelope
          }), { status: 200 });
        } else {
          return new Response(JSON.stringify({ data: [] }), { status: 200 }); // Empty page
        }
      };
      
      try {
        const { fetchPaginatedData } = await import('./api-helpers.ts');
        const result = await fetchPaginatedData(
          'https://test.com', 
          { 'X-API-Key': 'test' },
          { limit: 2, maxPages: 5 }
        );
        
        if (result.totalFetched !== 3) {
          throw new Error(`Expected 3 items, got ${result.totalFetched}`);
        }
        
        if (result.pagesFetched !== 2) {
          throw new Error(`Expected 2 pages, got ${result.pagesFetched}`);
        }
        
        if (result.stoppedReason !== 'empty_page') {
          throw new Error(`Expected empty_page, got ${result.stoppedReason}`);
        }
        
        console.log('✅ fetchPaginatedData multiple pages test passed');
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  }
];

// Run tests
console.log('Running JustTCG API Helper Tests...\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    test.test();
    passed++;
  } catch (error) {
    console.error(`❌ ${test.name}: ${error.message}`);
    failed++;
  }
}

console.log(`\nTest Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('Some tests failed!');
  // Deno.exit(1); // Uncomment for CI/CD
} else {
  console.log('All tests passed! ✅');
}