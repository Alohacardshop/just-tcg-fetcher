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

### ✅ RECOMMENDED: Use Deno.serve() pattern

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

### ❌ AVOID: Direct serve() callbacks

```typescript
// This pattern is error-prone due to nested braces
serve(async (req) => {
  // ... lots of code
  // Easy to miss closing braces
}); // <- Often missing or misplaced
```

## Function-Specific Checks

```bash
# Check specific function
deno fmt supabase/functions/[function-name]/index.ts
deno lint supabase/functions/[function-name]/index.ts  
deno check supabase/functions/[function-name]/index.ts

# Test local serving
supabase functions serve [function-name] --env-file supabase/.env
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