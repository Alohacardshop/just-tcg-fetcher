# Card Variants Fetcher - All Variants Support

This document describes the refactored single-card fetching functionality that now returns **all variants** (printings + conditions) for a card without filtering.

## Key Changes

### 1. ID-Only Lookups
- **Before**: Used game/set/name parameters with additional filtering
- **After**: Uses only `tcgplayerId`, `cardId`, or `variantId` parameters
- **No filtering**: Returns ALL printings and conditions for the card

### 2. API Call Structure
```typescript
// NEW: ID-only lookup (returns all variants)
GET https://api.justtcg.com/v1/cards?cardId=123
GET https://api.justtcg.com/v1/cards?tcgplayerId=456  
GET https://api.justtcg.com/v1/cards?variantId=789

// OLD: Filtered lookup (returns specific variants)
GET https://api.justtcg.com/v1/cards?game=pokemon&set=base&name=pikachu&printing=1st&condition=mint
```

### 3. Response Format
API returns `{ data: Card[] }` unchanged - no ID synthesis.

Each Card contains:
```typescript
{
  id: string;
  name: string;
  game: string;
  set: string;
  number?: string;
  variants: [
    {
      id: string;
      printing: string;
      condition: string;
      price?: number;
      market_price?: number;
      // ... other pricing fields
    }
  ]
}
```

### 4. ID Precedence Guard
If ANY ID parameter is present (`tcgplayerId`, `cardId`, `variantId`), text search inputs are ignored:

```typescript
// ID takes precedence - text search ignored
fetchCardVariants({
  tcgplayerId: "123",
  name: "pikachu",     // ← IGNORED
  game: "pokemon",     // ← IGNORED  
  set: "base"          // ← IGNORED
})
```

## Usage Examples

### Basic Usage (Hook)
```typescript
import { usePricing } from '@/hooks/usePricing';

const MyComponent = ({ cardId }) => {
  const { pricing, loading, fetchPricing } = usePricing({
    cardId,                    // Primary ID
    tcgplayerId,              // Alternative ID  
    variantId,                // Alternative ID
    condition: 'Near Mint',   // Optional for caching
    printing: 'Normal',       // Optional for caching
    autoFetch: false
  });

  // pricing.allVariants === true means we got all variants
  // pricing.data contains array of cards with variants
  
  return (
    <div>
      {pricing?.allVariants && pricing.data?.map(card => (
        <div key={card.id}>
          <h3>{card.name}</h3>
          {card.variants.map(variant => (
            <div key={variant.id}>
              {variant.printing} - {variant.condition}: ${variant.market_price}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
```

### Direct API Call (Utility)
```typescript
import { fetchCardVariants } from '@/lib/cardVariantsFetcher';

// Get all variants by card ID
const response = await fetchCardVariants({
  cardId: "pokemon-base-pikachu-25"
});

// Response contains ALL printings and conditions
response.data.forEach(card => {
  console.log(`${card.name} has ${card.variants.length} variants`);
  
  card.variants.forEach(variant => {
    console.log(`  ${variant.printing} ${variant.condition}: $${variant.market_price}`);
  });
});
```

### Acceptance Test
Given a known `tcgplayerId`, the response should include multiple variant objects spanning different printing and condition values:

```typescript
const response = await fetchCardVariants({
  tcgplayerId: "123456"
});

// Should return something like:
{
  data: [
    {
      id: "card-123",
      name: "Pikachu",
      variants: [
        { printing: "1st Edition", condition: "Near Mint", market_price: 100 },
        { printing: "1st Edition", condition: "Lightly Played", market_price: 85 },
        { printing: "Unlimited", condition: "Near Mint", market_price: 50 },
        { printing: "Unlimited", condition: "Lightly Played", market_price: 40 },
        // ... more variants
      ]
    }
  ]
}
```

## Backward Compatibility

The existing components (`PricingCard`, `PricingWidget`) continue to work unchanged. They still use specific condition/printing parameters for targeted lookups, which are supported for caching purposes.

The new functionality is additive - existing code works as before, but new code can opt into all-variants fetching.

## Caching Strategy

- **All variants responses** are returned immediately (not cached in card_prices table)
- **Specific variant requests** are still cached in card_prices table for 30-minute cache duration
- Cache is used when specific condition + printing are requested

## Migration Path

1. **Phase 1**: All variants API is available alongside existing filtered API
2. **Phase 2**: Components can opt into all-variants mode by omitting condition/printing
3. **Phase 3**: UI can show variant selector populated from all available variants
4. **Phase 4**: Legacy filtered API calls can be phased out

## Demo Component

See `src/components/AllVariantsDemo.tsx` for a working example that demonstrates:
- ID precedence over text search
- Multiple variant display
- Backward compatibility with single variant mode
