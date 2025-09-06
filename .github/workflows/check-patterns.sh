#!/bin/bash

# Pattern validation script to prevent mixed patterns that cause dangling });

echo "🔍 Checking for mixed server patterns..."

errors=0

for file in supabase/functions/**/index.ts; do
  if [[ -f "$file" ]]; then
    echo "Checking: $file"
    
    # Check for mixed patterns
    if grep -q "Deno\.serve(handleRequest)" "$file" && grep -q "});" "$file"; then
      echo "❌ ERROR: $file contains both Deno.serve(handleRequest) and dangling });"
      echo "   This will cause 'Expected '}', got '<eof>' errors"
      echo "   Use Pattern B (named handler) consistently"
      errors=$((errors + 1))
    fi
    
    # Check for old serve imports
    if grep -q "import.*serve.*from.*std.*http" "$file"; then
      echo "⚠️  WARNING: $file still imports serve from std/http"
      echo "   Consider using Deno.serve() instead"
    fi
    
    # Verify file ends properly
    last_line=$(tail -n 1 "$file")
    if [[ "$last_line" == "Deno.serve(handleRequest);" ]]; then
      echo "✅ $file: Proper Pattern B ending"
    elif [[ "$last_line" == "});" ]]; then
      echo "⚠️  $file: Pattern A ending (acceptable but prefer Pattern B)"
    else
      echo "❌ ERROR: $file: Unexpected ending: '$last_line'"
      errors=$((errors + 1))
    fi
  fi
done

if [[ $errors -gt 0 ]]; then
  echo ""
  echo "❌ Found $errors error(s). Fix these before deploying."
  exit 1
else
  echo ""
  echo "✅ All pattern checks passed!"
  exit 0
fi