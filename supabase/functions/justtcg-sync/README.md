# JustTCG Sync Function

This Edge Function synchronizes trading card game data from the JustTCG API to the Supabase database.

## API Key Requirements

- The function requires a `JUSTTCG_API_KEY` environment variable
- The API key is **server-only** and never sent from the browser
- All API calls use the exact header format: `X-API-Key` (case-sensitive)
- Unified retry logic with exponential backoff for reliability

## Testing

Run the unit tests to verify API header normalization:

```bash
deno run --allow-env supabase/functions/justtcg-sync/run-tests.ts
```

The tests will fail if:
- API key handling is broken
- Headers don't use exact case `X-API-Key`
- Retry logic fails on 429/5xx errors
- Timeout handling doesn't work properly
- Any browser-side API key exposure is detected

## Fetch Helper

All JustTCG API calls use the unified `fetchJsonWithRetry` helper that provides:

- **Timeout control**: 90-second default timeout with AbortController
- **Exponential backoff**: Retries on 429/5xx errors with 6 attempts by default
- **Comprehensive logging**: Attempt number, duration, timeout status
- **Error classification**: Retryable vs non-retryable error handling

```typescript
const data = await fetchJsonWithRetry(
  'https://api.justtcg.com/v1/games',
  { headers: createJustTCGHeaders(apiKey) },
  { tries: 6, baseDelayMs: 500, timeoutMs: 90000 }
);
```

## Functions

- `sync-games`: Syncs all available games
- `sync-sets`: Syncs sets for a specific game
- `sync-cards`: Syncs cards for a specific set
- `sync-cards-bulk`: Syncs cards for multiple sets

## Security

- All JustTCG API calls are server-side only
- API keys are never exposed to the browser
- Normalized header usage prevents case-sensitivity issues