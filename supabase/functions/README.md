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

**CRITICAL**: All functions now use Pattern B (named handler) to prevent syntax errors:

### ✅ Pattern B (STANDARD): Named Handler
```typescript
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRequest(req: Request): Promise<Response> {
  try {
    // Your handler logic here
    return json({ success: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Internal error" }, 500);
  }
}

// Single line - no braces to mismatch  
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

**All functions must use Pattern B consistently.**

## Pre-Deploy Checks (MANDATORY)

**Run these before every deployment:**

```bash
# Format all functions
deno fmt supabase/functions/**/*.ts

# Lint all functions  
deno lint supabase/functions/**/*.ts

# Type check all functions
deno check supabase/functions/**/*.ts

# Pattern validation (prevent mixed patterns)
bash .github/workflows/check-patterns.sh
```

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

1. **Always use named handler functions** instead of inline callbacks
2. **Run `npm run pre-deploy` before every deployment**
3. **Use the `json()` helper for consistent responses**
4. **Keep handler logic simple and focused**
5. **Test locally with `supabase functions serve` before deploying**