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