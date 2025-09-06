# Full Set Harvest - Complete Set Data Collection

This document describes the full-set harvest functionality that fetches every card and every variant with pricing data for a complete trading card set.

## Overview

The Full Set Harvester implements comprehensive data collection by:
- **Automatic Pagination**: Loops through all pages until `meta.hasMore === false`
- **Complete Coverage**: No printing or condition filters to capture ALL variants
- **Deduplication**: Prevents duplicate cards across pages
- **Database Sync**: Transactional updates with proper error handling
- **Validation**: Quality assurance with detailed statistics

## Core Functions

### `fetchFullSetCards(gameId, setId, limit = 100)`

Fetches all cards and variants for a complete set with automatic pagination.

```typescript
const result = await fetchFullSetCards('pokemon', 'base-set', 100);

// Returns:
{
  cards: HarvestCard[],           // All cards with variants
  totalPages: number,             // Number of pages processed
  totalCards: number,             // Total cards harvested
  expectedTotal?: number,         // Expected from API metadata
  gameId: string,                 // Input game ID
  setId: string,                  // Input set ID  
  harvestedAt: string            // ISO timestamp
}
```

**Pagination Logic:**
- Calls `GET /cards?game={gameId}&set={setId}&limit={limit}&offset={offset}`
- Increments `offset += limit` each request
- Continues until `meta.hasMore === false` or partial page received
- Deduplicates by card ID to prevent double-counting

### `syncSet(gameId, setId, limit = 100)`

Convenience wrapper that harvests AND syncs to database in a transaction.

```typescript
const result = await syncSet('mtg', 'alpha', 150);

// Returns: HarvestResult + { dbStats: DatabaseStats }
```

**Database Operations:**
1. **Cards First**: Upsert all card records with deduplication
2. **Pricing Second**: Insert all variant pricing data  
3. **Statistics**: Update set and game counts and timestamps
4. **Validation**: Report success/failure with detailed metrics

## API Endpoints

### Edge Function: `harvest-set-cards`

Handles single page requests with JustTCG API integration.

```typescript
// Request
{
  gameId: string,
  setId: string,
  limit?: number,
  offset?: number
}

// Response  
{
  data: HarvestCard[],
  meta: {
    total?: number,
    limit: number,
    offset: number,
    hasMore?: boolean
  }
}
```

### Edge Function: `sync-harvested-set`

Handles database synchronization of harvested data.

```typescript
// Request
{
  gameId: string,
  setId: string, 
  cards: HarvestCard[],
  harvestMeta: HarvestMetadata
}

// Response
{
  success: boolean,
  stats: {
    cardsUpserted: number,
    pricingRecordsUpserted: number,
    totalVariants: number
  }
}
```

## Data Structures

### HarvestCard
```typescript
interface HarvestCard {
  id: string;                    // Card identifier from API
  name: string;                  // Card name
  game: string;                  // Game identifier  
  set: string;                   // Set identifier
  number?: string;               // Card number in set
  tcgplayerId?: string;          // TCGPlayer ID if available
  rarity?: string;               // Card rarity
  image_url?: string;            // Card image URL
  variants: HarvestVariant[];    // ALL variants (key feature)
}
```

### HarvestVariant
```typescript
interface HarvestVariant {
  id: string;                    // Variant identifier
  printing: string;              // Printing type (1st Edition, Unlimited, etc.)
  condition: string;             // Condition (Near Mint, Lightly Played, etc.)
  price?: number;                // Current price
  market_price?: number;         // Market price
  low_price?: number;            // Low price
  high_price?: number;           // High price
  currency?: string;             // Currency (usually USD)
  lastUpdated?: string;          // Last price update
  // ... additional pricing fields
}
```

## Usage Examples

### Basic Harvest (No Database)
```typescript
import { fetchFullSetCards } from '@/lib/fullSetHarvester';

// Fetch all cards for Pokemon Base Set
const result = await fetchFullSetCards('pokemon', 'base-set');

console.log(`Harvested ${result.totalCards} cards in ${result.totalPages} pages`);
console.log(`Total variants: ${result.cards.reduce((sum, card) => sum + card.variants.length, 0)}`);

// Check for multiple variants
result.cards.forEach(card => {
  if (card.variants.length > 1) {
    console.log(`${card.name} has ${card.variants.length} variants:`);
    card.variants.forEach(variant => {
      console.log(`  ${variant.printing} - ${variant.condition}: $${variant.market_price}`);
    });
  }
});
```

### Full Sync (Harvest + Database)
```typescript
import { syncSet } from '@/lib/fullSetHarvester';

// Harvest and sync Magic Alpha set
const result = await syncSet('mtg', 'alpha', 100);

console.log(`Synced ${result.totalCards} cards to database`);
console.log(`Database stats:`, result.dbStats.stats);

// Validation results
if (result.validation?.warnings.length > 0) {
  console.warn('Validation warnings:', result.validation.warnings);
}
```

### Validation and Quality Assurance
```typescript
import { validateHarvestResult } from '@/lib/fullSetHarvester';

const validation = validateHarvestResult(harvestResult);

console.log(`Validation ${validation.isValid ? 'passed' : 'failed'}`);
console.log(`Statistics:`, validation.stats);

if (!validation.isValid) {
  validation.warnings.forEach(warning => {
    console.warn(warning);
  });
}
```

## Acceptance Criteria ✅

### Large Set Multi-Page Handling
```bash
# Test with a large set (e.g., MTG Modern Masters)
fetchFullSetCards('mtg', 'modern-masters', 100)
# ✅ Should fetch ≥2 pages for sets with 200+ cards
# ✅ totalPages >= 2
# ✅ No duplicates in final result
```

### Card Count Accuracy  
```bash
# Verify aggregate equals sum of pages
result.totalCards === sum(all_page_lengths)
# ✅ No double-counting across pagination
# ✅ Deduplication by card ID
```

### Multiple Variants Per Card
```bash
# Sample card should show multiple variants
const sampleCard = result.cards.find(card => card.variants.length > 1);
console.log(sampleCard.variants);
# ✅ Should show ≥2 variants with distinct {printing, condition}
# ✅ Example: [{printing: "1st Edition", condition: "Near Mint"}, {printing: "Unlimited", condition: "Lightly Played"}]
```

## Performance Characteristics

### Timing Benchmarks
- **Small sets** (50-100 cards): ~10-30 seconds
- **Medium sets** (200-500 cards): ~1-3 minutes  
- **Large sets** (500+ cards): ~3-10 minutes

### Rate Limiting
- 100ms delay between page requests
- 3 retry attempts with exponential backoff
- 30-second timeout per request

### Memory Efficiency
- Streaming pagination (doesn't load all data at once)
- Deduplication map prevents memory bloat
- Batch database operations (100 records per batch)

## Error Handling

### Partial Failure Recovery
```typescript
try {
  const result = await fetchFullSetCards('pokemon', 'base-set');
} catch (error) {
  // If some pages succeeded, partial data is preserved
  if (error.partialData) {
    console.log(`Recovered ${error.partialData.cards.length} cards from successful pages`);
  }
}
```

### Database Transaction Safety
```typescript
// Database operations are transactional
// If any step fails, entire sync is rolled back
const result = await syncSet('mtg', 'alpha');
// Either: All data synced successfully
// Or: No data changed (transaction rolled back)
```

## UI Components

### FullSetHarvester Component
Interactive UI for triggering harvests with real-time progress and validation results.

**Location**: `/harvest` route or `src/components/FullSetHarvester.tsx`

**Features**:
- Game/Set input with validation
- "Harvest Only" vs "Harvest & Sync" modes
- Real-time progress indicators
- Validation warnings and statistics
- Sample card display with variants

### Integration with Existing Components
The harvester integrates seamlessly with existing data import workflows:
- Uses same database schema as `justtcg-sync` 
- Compatible with existing pricing and card display components
- Follows same authentication and permission patterns

## CLI Usage (Future)

```bash
# Via edge function API
curl -X POST https://[project].supabase.co/functions/v1/harvest-set \
  -H "apikey: [key]" \
  -d '{"action": "sync-set", "gameId": "pokemon", "setId": "base-set"}'

# Expected response
{
  "success": true,
  "totalCards": 102,
  "totalVariants": 408,
  "totalPages": 2,
  "duration": "45s"
}
```

This comprehensive harvest system ensures complete data coverage while maintaining data quality and providing detailed feedback on the collection process.