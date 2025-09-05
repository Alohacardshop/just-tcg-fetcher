export const BASE = "https://api.justtcg.com/v1";

export function authHeaders(): { [k: string]: string } {
  if (typeof process !== 'undefined' && process.env?.JUSTTCG_API_KEY) {
    return { "x-api-key": process.env.JUSTTCG_API_KEY };
  }
  
  // For edge functions, check Deno env
  if (typeof globalThis !== 'undefined' && 'Deno' in globalThis) {
    const Deno = (globalThis as any).Deno;
    const apiKey = Deno.env.get('JUSTTCG_API_KEY');
    if (!apiKey) {
      throw new Error("JUSTTCG_API_KEY environment variable is required but not set");
    }
    return { "x-api-key": apiKey };
  }
  
  throw new Error("JUSTTCG_API_KEY environment variable is required but not set");
}

export function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, BASE);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  
  return url.toString();
}