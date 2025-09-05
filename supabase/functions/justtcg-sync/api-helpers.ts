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
 * @deprecated Use fetchJsonWithRetry instead for better error handling
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

interface RetryOptions {
  tries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

/**
 * Unified fetch helper with timeout and exponential backoff
 * Handles retries on 429/5xx errors with proper logging
 */
export async function fetchJsonWithRetry(
  url: string, 
  init: RequestInit = {}, 
  options: RetryOptions = {}
): Promise<any> {
  const { tries = 6, baseDelayMs = 500, timeoutMs = 90000 } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= tries; attempt++) {
    const startTime = Date.now();
    let timedOut = false;
    
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      
      console.log(`🔄 Attempt ${attempt}/${tries} for ${url}`);
      
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`✅ Success on attempt ${attempt} (${duration}ms): ${url}`);
        return await response.json();
      }
      
      // Handle retryable errors
      if (response.status === 429 || response.status >= 500) {
        const errorText = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
        
        console.warn(`⚠️ Retryable error on attempt ${attempt} (${duration}ms): ${response.status} - ${errorText}`);
        
        if (attempt < tries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`⏰ Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      } else {
        // Non-retryable error
        const errorText = await response.text();
        console.error(`❌ Non-retryable error on attempt ${attempt} (${duration}ms): ${response.status} - ${errorText}`);
        throw new Error(`JustTCG API error: ${response.status} - ${errorText}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error.name === 'AbortError' || timedOut) {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
        console.error(`⏰ Timeout on attempt ${attempt} (${duration}ms): ${url}`);
      } else {
        lastError = error as Error;
        console.error(`❌ Network error on attempt ${attempt} (${duration}ms):`, error.message);
      }
      
      if (attempt < tries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`⏰ Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  console.error(`💥 All ${tries} attempts failed for ${url}`);
  throw lastError || new Error('All retry attempts failed');
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