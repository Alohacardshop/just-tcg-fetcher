# Sync V2 Functions Testing

## Test CORS and POST functionality

### Test sync-cards-v2 function:
```bash
curl -X POST https://ljywcyhnpzqgpowwrpre.supabase.co/functions/v1/sync-cards-v2 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA" \
  -H "Content-Type: application/json" \
  -d '{"setId": "aquapolis", "gameId": "pokemon", "background": true}'
```

### Test sync-sets-v2 function:
```bash
curl -X POST https://ljywcyhnpzqgpowwrpre.supabase.co/functions/v1/sync-sets-v2 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA" \
  -H "Content-Type: application/json" \
  -d '{"gameId": "pokemon", "background": true}'
```

### Test sync-games-v2 function:
```bash
curl -X POST https://ljywcyhnpzqgpowwrpre.supabase.co/functions/v1/sync-games-v2 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA" \
  -H "Content-Type: application/json" \
  -d '{"background": true}'
```

### Test CORS preflight:
```bash
curl -X OPTIONS https://ljywcyhnpzqgpowwrpre.supabase.co/functions/v1/sync-cards-v2 \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  -H "Origin: https://example.com" \
  -v
```

## Expected Results

- **CORS preflight**: Should return 200 with proper Access-Control-Allow-Methods header
- **POST requests**: Should return either 202 (background) or 200 (synchronous) with proper CORS headers
- **No "Failed to fetch" errors**: Browser should be able to POST successfully
- **Server logs**: Should populate in Supabase edge function logs for debugging
- **Null-safe processing**: No crashes from undefined .length reads

## Acceptance Criteria

✅ Browser POSTs to all three v2 functions succeed cross-origin  
✅ Aquapolis bulk-sync runs without "Cannot read properties of undefined"  
✅ Empty/non-array API pages handled gracefully  
✅ UI status lines never access .length on undefined values  
✅ All function responses carry CORS headers including Access-Control-Allow-Methods  

## Changes Made

1. **CORS Headers**: Added `Access-Control-Allow-Methods: 'POST, OPTIONS'` to all v2 functions
2. **Array Guards**: Protected all `.length` reads with `Array.isArray()` checks
3. **Iterator Output**: JustTCGClient always yields arrays, never undefined
4. **Null-Safe UI**: Toast messages and logs use `?? 0` for undefined values  
5. **Error Context**: Better logging when API pages fail with context information