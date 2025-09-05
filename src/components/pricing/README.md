# Pricing Flow Implementation

This implementation provides a complete pricing flow that validates JustTCG card IDs before fetching pricing data.

## Key Features

### 1. JustTCG ID Validation
- **Blocks pricing requests** until `justtcgCardId` is present
- **Early toast notifications** inform users when ID is missing
- **Clear UI indicators** show sync status

### 2. Server-Side Proxy Function
- **`proxy-pricing`** edge function handles all JustTCG API calls
- **Caching system** reduces API calls (30-minute cache)
- **Error handling** with specific error messages for different scenarios
- **Authentication required** for security

### 3. React Components

#### `usePricing` Hook
```typescript
const { pricing, loading, error, cached, fetchPricing } = usePricing({
  cardId: 'jt-card-123',
  condition: 'Near Mint',
  printing: 'Normal',
  autoFetch: true
});
```

#### `PricingCard` Component
- Displays pricing information in a compact card format
- Shows cache status and last updated time
- Handles missing JustTCG ID gracefully

#### `PricingWidget` Component
- Interactive pricing tool with condition/printing selectors
- Manual fetch control for better UX
- Clear validation messages

## Usage Examples

### Basic Usage
```typescript
import { PricingCard } from '@/components/PricingCard';

<PricingCard 
  cardId={card.jt_card_id}
  cardName={card.name}
  condition="Near Mint"
  printing="Foil"
/>
```

### Interactive Widget
```typescript
import { PricingWidget } from '@/components/PricingWidget';

<PricingWidget
  cardId={card.jt_card_id}
  cardName={card.name}
  initialCondition="Lightly Played"
  initialPrinting="Normal"
/>
```

### Custom Hook Usage
```typescript
import { usePricing } from '@/hooks/usePricing';

const MyComponent = ({ cardId }) => {
  const { pricing, loading, fetchPricing } = usePricing({
    cardId,
    condition: 'Near Mint',
    autoFetch: false
  });

  return (
    <button onClick={() => fetchPricing({ refresh: true })}>
      Refresh Pricing
    </button>
  );
};
```

## Validation Flow

1. **Component Mount**: Check if `cardId` is present
2. **Early Warning**: Show toast if `cardId` is missing
3. **API Call**: Only proceed if `cardId` is valid
4. **Caching**: Return cached data if available and fresh
5. **Fresh Fetch**: Contact JustTCG API if needed
6. **Error Handling**: Specific messages for different error types

## Error Scenarios Handled

- **Missing JustTCG ID**: Clear UI warnings and toast notifications
- **Card Not Found**: Database lookup failures
- **No Pricing Data**: When JustTCG has no pricing for the card/variant
- **API Failures**: Network errors, rate limits, etc.
- **Invalid Conditions**: When requested condition/printing isn't available

## Caching Strategy

- **30-minute cache** for pricing data
- **Manual refresh** option to force fresh data
- **Cache indicators** in UI show when data is cached
- **Automatic invalidation** on refresh requests

This implementation ensures users understand why pricing might be unavailable and provides clear paths to resolution.