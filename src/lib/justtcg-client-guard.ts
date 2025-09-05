/**
 * Client-side guard for JustTCG API
 * Prevents accidental direct API calls from the browser
 */

const JUSTTCG_API_BASE = 'https://api.justtcg.com';

/**
 * Throws an error if attempting to call JustTCG API directly from browser
 * Use Supabase Edge Functions instead for all JustTCG API interactions
 */
export function preventDirectJustTCGCalls() {
  // Override fetch to detect direct JustTCG API calls
  const originalFetch = window.fetch;
  
  window.fetch = function(...args) {
    const url = args[0];
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url?.url || '';
    
    if (urlString.includes(JUSTTCG_API_BASE)) {
      console.error('❌ Direct JustTCG API calls from browser are not allowed!');
      console.error('Use Supabase Edge Functions instead: supabase.functions.invoke("justtcg-sync", {...})');
      throw new Error(
        'Direct JustTCG API calls from browser are prohibited. ' +
        'Use Supabase Edge Functions instead to protect API keys.'
      );
    }
    
    return originalFetch.apply(this, args);
  };
}

/**
 * Call this once in your app initialization to enable the guard
 */
export function initJustTCGGuard() {
  if (typeof window !== 'undefined') {
    preventDirectJustTCGCalls();
    console.log('🛡️ JustTCG API browser guard enabled');
  }
}