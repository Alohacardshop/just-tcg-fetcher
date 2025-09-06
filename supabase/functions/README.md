# Edge Functions Development Guide

## Pre-Deploy Checklist

Before deploying any edge functions, run these commands to prevent syntax/EOF errors:

```bash
# Quick check for all functions
npm run pre-deploy

# Or run individually:
npm run deno:fmt     # Format code
npm run deno:lint    # Lint for style issues  
npm run deno:check   # Type checking
```

## Preventing Brace/EOF Errors

**Both Pattern A (inline) and Pattern B (named handler) prevent syntax errors:**

### ✅ Pattern A (proxy-pricing): Inline Callback
```typescript
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await routeRequest(req);
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: "Internal error", message: (error as Error)?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### ✅ Pattern B (justtcg-sync): Named Handler  
```typescript
async function handleRequest(req: Request): Promise<Response> {
  try {
    return await routeRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Internal error" }, 500);
  }
}

Deno.serve(handleRequest);
```

### ❌ AVOID: Mixed Patterns

**Never mix these patterns in the same file:**

```typescript
// ❌ BAD: Causes dangling }); errors
async function handleRequest(req: Request): Promise<Response> {
  return json({ ok: true });
}
Deno.serve(handleRequest);
}); // <- This dangling }); breaks everything!
```

**Each function must use one pattern consistently (no mixing).**

## Pre-Deploy Checks (MANDATORY)

**Run these before every deployment:**

```bash
# Use the automated script
bash scripts/check-functions.sh

# Or run manually:
deno fmt supabase/functions/**/*.ts
deno lint supabase/functions/**/*.ts  
deno check supabase/functions/**/*.ts
```

**Critical**: These checks catch "Expected semicolon" and EOF errors before deployment.

## CI/CD Integration

Add these commands to your deployment pipeline:

```yaml
# Example GitHub Actions step
- name: Check Edge Functions
  run: |
    npm run deno:fmt
    npm run deno:lint  
    npm run deno:check
```

## Common Issues & Solutions

| Error | Solution |
|-------|----------|
| `Expected '}', got '<eof>'` | Run `deno check` - missing closing brace |
| `Missing semicolon` | Run `deno fmt` - auto-fixes formatting |
| `Unused import` | Run `deno lint` - identifies dead code |
| Function won't start | Check `supabase functions serve [name] --env-file supabase/.env` |

## Best Practices

1. **Use Pattern A (inline) or Pattern B (named) consistently per file**
2. **Run `npm run pre-deploy` before every deployment**
3. **Use the `json()` helper for consistent responses**
4. **Keep handler logic simple and focused**
5. **Test locally with `supabase functions serve` before deploying**