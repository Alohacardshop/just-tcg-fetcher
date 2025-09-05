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

## Pagination

List endpoints (/sets, /cards) use robust pagination with:

- **Limit + offset paging**: Proper offset-based pagination instead of page numbers
- **Safe termination**: Stops when `meta.hasMore === false` or page count hits 100
- **Envelope parsing**: Handles various response formats (data, results, items, etc.)
- **Progress tracking**: Logs pagination progress and stopping reasons

```typescript
const { data, totalFetched, pagesFetched, stoppedReason } = await fetchPaginatedData(
  'https://api.justtcg.com/v1/cards?game=pokemon&set=base',
  createJustTCGHeaders(apiKey),
  { limit: 200, maxPages: 100, timeoutMs: 90000 }
);
```

### Stopping Conditions
- `hasMore_false`: API signaled no more data
- `max_pages`: Hit the 100-page safety limit  
- `empty_page`: Received empty response
- `completed`: Received fewer items than requested limit

## Game Slug Normalization

All game identifiers are automatically normalized before API calls to ensure consistency:

### Supported Normalizations

- **Pokemon variations**: `pokemon-tcg`, `pokemon-english`, `pokemon-us` → `pokemon`
- **Pokemon Japan**: `pokemon-jp`, `pokemon-japanese` → `pokemon-japan`  
- **Magic variations**: `magic`, `magic-the-gathering`, `mtg-english` → `mtg`
- **One Piece variations**: `one-piece`, `one-piece-tcg` → `one-piece-card-game`
- **Disney Lorcana variations**: `lorcana`, `disney-lorcana-tcg` → `disney-lorcana`
- **Star Wars variations**: `star-wars`, `swu` → `star-wars-unlimited`

### Usage

The normalization is applied automatically in all API calls:

```typescript
// All of these will normalize to 'pokemon' for the API call
buildJustTCGUrl('sets', { game: 'pokemon-tcg' });
buildJustTCGUrl('sets', { game: 'Pokemon-English' });
buildJustTCGUrl('sets', { game: 'POKEMON-US' });

// This will normalize to 'pokemon-japan' 
buildJustTCGUrl('sets', { game: 'pokemon-jp' });
```

The `normalizeGameSlug()` function handles case-insensitive matching and ensures consistent API communication.

## Functions

- `sync-games`: Syncs all available games
- `sync-sets`: Syncs sets for a specific game
- `sync-cards`: Syncs cards for a specific set
- `sync-cards-bulk`: Syncs cards for multiple sets

## Security

- All JustTCG API calls are server-side only
- API keys are never exposed to the browser
- Normalized header usage prevents case-sensitivity issues