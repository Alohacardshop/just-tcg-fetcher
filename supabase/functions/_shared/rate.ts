// Rate limiting and adaptive concurrency management for TCGCSV API

// --- Token bucket ---
export class TokenBucket {
  private tokens: number;
  private last: number;
  
  constructor(private rate: number, private burst: number) {
    this.tokens = burst;
    this.last = Date.now();
  }
  
  async take() {
    while (true) {
      const now = Date.now();
      const elapsed = (now - this.last) / 1000;
      this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate);
      this.last = now;
      
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      
      await new Promise(r => setTimeout(r, 50));
    }
  }
  
  getTokens() {
    const now = Date.now();
    const elapsed = (now - this.last) / 1000;
    return Math.min(this.burst, this.tokens + elapsed * this.rate);
  }
}

// --- Adaptive concurrency (AIMD) ---
export class AdaptiveConcurrency {
  current: number;
  successes = 0;
  
  constructor(public min: number, public max: number, start?: number) {
    this.current = Math.max(min, Math.min(max, start ?? max));
  }
  
  onSuccess() {
    if (++this.successes >= 20) {
      this.current = Math.min(this.max, this.current + 1);
      this.successes = 0;
    }
  }
  
  onRateLimit() {
    this.current = Math.max(this.min, Math.floor(this.current / 2));
    this.successes = 0;
  }
  
  onError() {
    this.successes = 0;
  }
}

// --- Retry-After parse ---
export function parseRetryAfter(h?: string | null): number | undefined {
  if (!h) return;
  
  const s = Number(h);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  
  const d = Date.parse(h);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
}

// --- Full-jitter backoff ---
export function backoffDelay(attempt: number, baseMs: number) {
  const cap = Math.min(30000, baseMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * cap);
}

// --- Circuit breaker ---
export class Circuit {
  private openedAt = 0;
  private fails = 0;
  
  constructor(private threshold: number, private openMs: number) {}
  
  isOpen() {
    return Date.now() - this.openedAt < this.openMs;
  }
  
  record(ok: boolean) {
    if (ok) {
      this.fails = 0;
      return;
    }
    
    this.fails++;
    if (this.fails >= this.threshold) {
      this.openedAt = Date.now();
    }
  }
  
  getFailures() {
    return this.fails;
  }
  
  getTimeUntilClose() {
    if (!this.isOpen()) return 0;
    return Math.max(0, this.openMs - (Date.now() - this.openedAt));
  }
}

// --- Rate-limited fetch wrapper ---
const RPS = Number(Deno.env.get('TCGCSV_TARGET_RPS') ?? 4);
const BURST = Number(Deno.env.get('TCGCSV_BURST_TOKENS') ?? 6);
const bucket = new TokenBucket(RPS, BURST);

const conc = new AdaptiveConcurrency(
  Number(Deno.env.get('TCGCSV_MIN_CONCURRENCY') ?? 2),
  Number(Deno.env.get('TCGCSV_MAX_CONCURRENCY') ?? 12)
);

const circuit = new Circuit(5, Number(Deno.env.get('TCGCSV_CIRCUIT_OPEN_MS') ?? 60000));

const BASE_HEADERS = {
  'Accept': 'text/csv, */*',
  'Cache-Control': 'no-cache',
  'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)',
  'Referer': 'https://tcgcsv.com/'
};

export interface FetchResult {
  res: Response;
  attempt: number;
  waited?: number;
  retryAfter?: number;
}

export async function fetchWithRL(url: string, opts: RequestInit = {}): Promise<FetchResult> {
  const maxAttempts = Number(Deno.env.get('TCGCSV_RETRY_MAX') ?? 6);
  const base = Number(Deno.env.get('TCGCSV_BACKOFF_BASE_MS') ?? 300);
  let attempt = 0;
  
  if (circuit.isOpen()) {
    const wait = Number(Deno.env.get('TCGCSV_CIRCUIT_OPEN_MS') ?? 60000);
    return {
      res: new Response(null, { status: 503, statusText: 'CIRCUIT_OPEN' }),
      attempt,
      waited: wait
    };
  }
  
  while (true) {
    attempt++;
    await bucket.take();
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    let res: Response;
    try {
      res = await fetch(url, {
        ...opts,
        headers: { ...BASE_HEADERS, ...(opts.headers || {}) },
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeout);
      if (attempt >= maxAttempts) {
        circuit.record(false);
        return {
          res: new Response(null, { status: 599, statusText: 'NETWORK_ERROR' }),
          attempt
        };
      }
      const delay = backoffDelay(attempt, base);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    
    clearTimeout(timeout);
    
    // Success path
    if (res.ok) {
      circuit.record(true);
      conc.onSuccess();
      return { res, attempt };
    }
    
    // 429 / 5xx → backoff
    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      conc.onRateLimit();
      circuit.record(false);
      
      const ra = parseRetryAfter(res.headers.get('Retry-After'));
      const delay = ra ?? backoffDelay(attempt, base);
      
      if (attempt >= maxAttempts) {
        return { res, attempt, waited: delay, retryAfter: ra };
      }
      
      if (delay) {
        await new Promise(r => setTimeout(r, delay));
      }
      continue;
    }
    
    // Other errors (403/404…) → return immediately
    circuit.record(false);
    conc.onError();
    return { res, attempt };
  }
}

export function getConcurrency() {
  return conc.current;
}

export function getThrottleStats() {
  return {
    concurrency: conc.current,
    successes: conc.successes,
    tokens: bucket.getTokens(),
    maxTokens: BURST,
    targetRps: RPS,
    circuitOpen: circuit.isOpen(),
    circuitFailures: circuit.getFailures(),
    circuitTimeUntilClose: circuit.getTimeUntilClose()
  };
}

// --- URL variants for fallback ---
export function productUrlVariants(categoryId: number, groupId: number): string[] {
  const base = `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}`;
  return [
    `${base}/ProductsAndPrices.csv`,
    `${base}/productsandprices.csv`,
    `${base}/ProductsAndPrices.CSV`,
    `${base}/Products.csv`,
    `${base}/products.csv`
  ];
}
