# JustTCG Sync Function

This Edge Function synchronizes trading card game data from the JustTCG API to the Supabase database.

## API Key Requirements

- The function requires a `JUSTTCG_API_KEY` environment variable
- The API key is **server-only** and never sent from the browser
- All API calls use the exact header format: `X-API-Key` (case-sensitive)

## Testing

Run the unit tests to verify API header normalization:

```bash
deno run --allow-env supabase/functions/justtcg-sync/run-tests.ts
```

The tests will fail if:
- API key handling is broken
- Headers don't use exact case `X-API-Key`
- Any browser-side API key exposure is detected

## Functions

- `sync-games`: Syncs all available games
- `sync-sets`: Syncs sets for a specific game
- `sync-cards`: Syncs cards for a specific set
- `sync-cards-bulk`: Syncs cards for multiple sets

## Security

- All JustTCG API calls are server-side only
- API keys are never exposed to the browser
- Normalized header usage prevents case-sensitivity issues