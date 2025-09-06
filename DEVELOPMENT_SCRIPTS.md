# Edge Functions Development Guide

## ✅ NORMALIZED: Functions use consistent patterns

`proxy-pricing` uses **Pattern A (inline callback)** and `justtcg-sync` uses **Pattern B (named handler)** to prevent EOF/brace errors.

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

## ✅ FIXED: Pattern A (Inline Callback) Applied

**proxy-pricing/index.ts** now uses Pattern A with clean inline callback:

```typescript
async function routeRequest(req: Request): Promise<Response> {
  // All business logic here
  return json({ success: true });
}

// ===== CANONICAL TAIL (inline; balanced) =====
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await routeRequest(req);
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: "Internal error", message: (error as Error)?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}); // ← Final characters, nothing after this line
```

## Pattern Consistency

- ✅ **proxy-pricing/index.ts**: Pattern A (inline callback, ends with `});`)
- ✅ **justtcg-sync/index.ts**: Pattern B (named handler, ends with `;`)
- ✅ Both patterns are valid and prevent EOF/brace errors
- ✅ No mixed patterns within the same file

## Error Prevention

Both Pattern A and Pattern B prevent these common issues:

| Error | Root Cause | Pattern A Solution | Pattern B Solution |
|-------|------------|-------------------|-------------------|
| `Expected '}', got '<eof>'` | Missing closing brace | Single `});` closer | No nested braces |
| `})` unexpected token | Dangling closer | Clean `});` ending | Single line ending |
| Mixed pattern errors | Both patterns in same file | Validation prevents mixing | Validation prevents mixing |
| Complex nesting issues | Deep callbacks | Separate route handler | Separate route handler |

## Files Changed

- ✅ `supabase/functions/proxy-pricing/index.ts` - Normalized to Pattern A (inline)
- ✅ `supabase/functions/justtcg-sync/index.ts` - Already Pattern B  
- ✅ `.github/workflows/edge-functions.yml` - CI checks
- ✅ `.github/workflows/check-patterns.sh` - Pattern validation
- ✅ `supabase/functions/README.md` - Updated guidelines