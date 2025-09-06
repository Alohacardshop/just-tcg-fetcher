#!/bin/bash

# Edge Functions Pre-Deploy Check Script
# Run this before every deployment to catch syntax/EOF errors

set -e  # Exit on any error

echo "🔍 Running Edge Functions pre-deploy checks..."

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo "❌ Deno is not installed. Please install Deno first."
    echo "   curl -fsSL https://deno.land/install.sh | sh"
    exit 1
fi

# Find all Edge Function index files
FUNCTION_FILES=$(find supabase/functions -name "index.ts" 2>/dev/null || echo "")

if [ -z "$FUNCTION_FILES" ]; then
    echo "⚠️  No Edge Function files found in supabase/functions/"
    exit 0
fi

echo "📁 Found Edge Functions:"
echo "$FUNCTION_FILES" | sed 's/^/   /'

# Format all function files
echo ""
echo "📝 Formatting Edge Functions..."
if deno fmt $FUNCTION_FILES; then
    echo "✅ Formatting completed"
else
    echo "❌ Formatting failed"
    exit 1
fi

# Lint all function files
echo ""
echo "🔍 Linting Edge Functions..."
if deno lint $FUNCTION_FILES; then
    echo "✅ Linting completed"
else
    echo "❌ Linting failed"
    exit 1
fi

# Type check all function files
echo ""
echo "⚡ Type checking Edge Functions..."
if deno check $FUNCTION_FILES; then
    echo "✅ Type checking completed"
else
    echo "❌ Type checking failed"
    exit 1
fi

# Pattern validation
echo ""
echo "🔍 Validating server patterns..."
errors=0

for file in $FUNCTION_FILES; do
    echo "   Checking: $file"
    
    # Check for mixed patterns
    if grep -q "Deno\.serve(handleRequest)" "$file" && grep -q "});" "$file"; then
        echo "   ❌ ERROR: Mixed patterns detected (both handleRequest and });)"
        errors=$((errors + 1))
    fi
    
    # Check file ending
    last_line=$(tail -n 1 "$file")
    if [[ "$last_line" == "Deno.serve(handleRequest);" ]]; then
        echo "   ✅ Pattern B (named handler)"
    elif [[ "$last_line" == "});" ]]; then
        echo "   ✅ Pattern A (inline callback)"
    else
        echo "   ❌ ERROR: Unexpected ending: '$last_line'"
        errors=$((errors + 1))
    fi
done

if [[ $errors -gt 0 ]]; then
    echo ""
    echo "❌ Found $errors pattern error(s). Fix these before deploying."
    exit 1
fi

echo ""
echo "🎉 All Edge Functions checks passed! Ready to deploy."