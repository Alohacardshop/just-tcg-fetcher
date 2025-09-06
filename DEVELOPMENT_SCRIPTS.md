# Edge Functions Development Guide

## ✅ NORMALIZED: All functions now use Pattern B

Both `proxy-pricing` and `justtcg-sync` functions have been normalized to use **Pattern B (named handler)** to prevent EOF/brace errors.

## Pattern B Structure (STANDARD)

```typescript
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function handleRequest(req: Request): Promise<Response> {
  try {
    // Handler logic here
    return json({ success: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Internal error" }, 500);
  }
}

Deno.serve(handleRequest); // ← Clean ending, no dangling });
```

## MANDATORY Pre-Deploy Checks

**Run these before EVERY deployment:**

```bash
# 1. Format all functions
deno fmt supabase/functions/**/*.ts

# 2. Lint all functions  
deno lint supabase/functions/**/*.ts

# 3. Type check all functions
deno check supabase/functions/**/*.ts

# 4. Pattern validation (prevent mixed patterns)
bash .github/workflows/check-patterns.sh

# 5. Test local serving
supabase functions serve proxy-pricing --env-file supabase/.env
supabase functions serve justtcg-sync --env-file supabase/.env
```

## ✅ Definition of Done

- ✅ `proxy-pricing/index.ts` - No dangling `});`, uses `Deno.serve(handleRequest);`
- ✅ `justtcg-sync/index.ts` - Uses `Deno.serve(handleRequest);` consistently  
- ✅ Both functions compile without `Expected '}', got '<eof>'` errors
- ✅ `deno fmt|lint|check` all pass for both files
- ✅ Deploy succeeds without `(SUPABASE_CODEGEN_ERROR)`
- ✅ Comprehensive pattern validation scripts in place
- ✅ GitHub Actions workflow for automated checks

## Error Prevention

The new Pattern B structure prevents these common issues:

| Error | Root Cause | Solution |
|-------|------------|----------|
| `Expected '}', got '<eof>'` | Missing closing brace | Pattern B has no nested braces |
| `})` unexpected token | Dangling closer | Pattern B ends with single line |
| Mixed pattern errors | Both patterns in same file | Validation script prevents this |

## Files Changed

- ✅ `supabase/functions/proxy-pricing/index.ts` - Normalized to Pattern B
- ✅ `supabase/functions/justtcg-sync/index.ts` - Already Pattern B  
- ✅ `.github/workflows/edge-functions.yml` - CI checks
- ✅ `.github/workflows/check-patterns.sh` - Pattern validation
- ✅ `supabase/functions/README.md` - Updated guidelines