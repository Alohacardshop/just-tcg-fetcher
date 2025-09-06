# Edge Functions Development Checks

## Pre-Deploy Script

Run these commands before every deployment to catch syntax/EOF errors:

```bash
#!/bin/bash
# Pre-deploy checks for Edge Functions

echo "🔍 Running Edge Functions checks..."

# Format all function files
echo "📝 Formatting Edge Functions..."
deno fmt supabase/functions/**/index.ts

# Lint all function files  
echo "🔍 Linting Edge Functions..."
deno lint supabase/functions/**/index.ts

# Type check all function files
echo "⚡ Type checking Edge Functions..."
deno check supabase/functions/**/index.ts

echo "✅ All Edge Functions checks passed!"
```

## Manual Commands

```bash
# Format all functions
deno fmt supabase/functions/**/index.ts

# Lint all functions  
deno lint supabase/functions/**/index.ts

# Type check all functions
deno check supabase/functions/**/index.ts
```

## Add to package.json Scripts

```json
{
  "scripts": {
    "functions:check": "deno fmt supabase/functions/**/index.ts && deno lint supabase/functions/**/index.ts && deno check supabase/functions/**/index.ts",
    "pre-deploy": "npm run functions:check"
  }
}
```

## GitHub Actions Integration

Add this to `.github/workflows/edge-functions.yml`:

```yaml
name: Edge Functions Check
on:
  pull_request:
    paths:
      - 'supabase/functions/**'
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'

jobs:
  check-functions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Deno
        uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
          
      - name: Format Check
        run: deno fmt --check supabase/functions/**/index.ts
        
      - name: Lint Check  
        run: deno lint supabase/functions/**/index.ts
        
      - name: Type Check
        run: deno check supabase/functions/**/index.ts
```

## Quick Dev Workflow

1. **Before making changes**: `deno check supabase/functions/**/index.ts`
2. **After making changes**: `deno fmt supabase/functions/**/index.ts && deno check supabase/functions/**/index.ts`
3. **Before committing**: `npm run functions:check` (if added to package.json)
4. **Before deploying**: Run all three commands manually

## Common Fix Patterns

### For "Expected semicolon" at catch:
```typescript
// ✅ CORRECT: Clean try-catch structure
try {
  return await someFunction();
} catch (error) {
  return errorResponse(error);
}
```

### For EOF/brace errors:
```typescript
// ✅ CORRECT: Pattern A (inline)
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handler(req);
  } catch (error) {
    return errorResponse(error);
  }
});

// ✅ CORRECT: Pattern B (named)  
async function handleRequest(req: Request): Promise<Response> {
  try {
    return await handler(req);
  } catch (error) {
    return errorResponse(error);
  }
}
Deno.serve(handleRequest);
```