/**
 * JustTCG API Helper Functions
 * Normalizes API header usage and ensures server-only key access
 */

/**
 * Gets the JustTCG API key from environment variables
 * This should ONLY be called from server-side code (Edge Functions)
 */
export function getApiKey(): string {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not configured in environment');
  }
  return apiKey;
}

/**
 * Creates standardized headers for JustTCG API calls
 * Ensures consistent header format across all API calls
 */
export function createJustTCGHeaders(apiKey: string): HeadersInit {
  if (!apiKey) {
    throw new Error('API key is required');
  }
  
  return {
    'X-API-Key': apiKey, // Exact case match as required by JustTCG API
    'Content-Type': 'application/json'
  };
}

/**
 * Makes a GET request to the JustTCG API with proper headers
 */
export async function fetchFromJustTCG(url: string, apiKey: string): Promise<Response> {
  const headers = createJustTCGHeaders(apiKey);
  
  console.log(`Making JustTCG API call to: ${url}`);
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`JustTCG API error: ${response.status} - ${errorText}`);
    throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
  }
  
  return response;
}

/**
 * Validates that headers contain the required API key header
 * Used for testing and validation
 */
export function validateJustTCGHeaders(headers: HeadersInit): boolean {
  if (!headers || typeof headers !== 'object') {
    return false;
  }
  
  // Check for exact case match
  return 'X-API-Key' in headers && !!headers['X-API-Key'];
}