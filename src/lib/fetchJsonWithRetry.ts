export interface FetchOptions {
  tries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

export interface FetchError extends Error {
  status?: number;
  body?: any;
}

export async function fetchJsonWithRetry(
  url: string,
  init?: RequestInit,
  opts?: FetchOptions
): Promise<any> {
  const { tries = 5, timeoutMs = 90000, baseDelayMs = 400 } = opts || {};
  
  let lastError: FetchError | null = null;
  
  for (let attempt = 1; attempt <= tries; attempt++) {
    const startTime = Date.now();
    let timedOut = false;
    
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      
      console.log(`🔄 Attempt ${attempt}/${tries} for ${url}`);
      
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        let body: any;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }
        
        const error: FetchError = new Error(
          body?.message || `HTTP ${response.status}: ${response.statusText}`
        );
        error.status = response.status;
        error.body = body;
        
        // Retry on 429 (rate limit) and 5xx errors
        if (response.status === 429 || response.status >= 500) {
          console.warn(`⚠️ Attempt ${attempt} failed (${response.status}) after ${duration}ms, will retry`);
          lastError = error;
          
          if (attempt < tries) {
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        throw error;
      }
      
      console.log(`✅ Request succeeded on attempt ${attempt} after ${duration}ms`);
      return await response.json();
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (timedOut) {
        console.error(`⏰ Attempt ${attempt} timed out after ${duration}ms`);
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
      } else if (error.name === 'AbortError') {
        console.error(`🚫 Attempt ${attempt} aborted after ${duration}ms`);
        lastError = new Error(`Request was aborted`);
      } else {
        console.error(`❌ Attempt ${attempt} failed after ${duration}ms:`, error.message);
        lastError = error;
      }
      
      // Don't retry on non-retryable errors
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw error;
      }
      
      if (attempt < tries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`All ${tries} attempts failed`);
}