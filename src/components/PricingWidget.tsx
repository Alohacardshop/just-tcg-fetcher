import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, RefreshCw, AlertTriangle } from 'lucide-react';
import { usePricing } from '@/hooks/usePricing';

interface PricingWidgetProps {
  cardId?: string;
  cardName?: string;
  initialCondition?: string;
  initialPrinting?: string;
}

const CONDITIONS = [
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged'
];

const PRINTINGS = [
  'Normal',
  'Foil',
  'Reverse Foil',
  'Holo',
  'First Edition',
  'Unlimited'
];

export function PricingWidget({ 
  cardId, 
  cardName = 'Unknown Card',
  initialCondition = 'Near Mint',
  initialPrinting = 'Normal'
}: PricingWidgetProps) {
  const [selectedCondition, setSelectedCondition] = useState(initialCondition);
  const [selectedPrinting, setSelectedPrinting] = useState(initialPrinting);

  const { pricing, loading, error, cached, noVariants, fetchPricing } = usePricing({
    cardId,
    condition: selectedCondition,
    printing: selectedPrinting,
    autoFetch: false // Manual control for better UX
  });

  const handleFetchPricing = () => {
    fetchPricing({ refresh: false });
  };

  const handleRefreshPricing = () => {
    fetchPricing({ refresh: true });
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: pricing?.currency || 'USD'
    }).format(price / 100);
  };

  const isCardIdMissing = !cardId?.trim();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5" />
          Card Pricing
          {cached && (
            <Badge variant="secondary" className="text-xs">
              Cached
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{cardName}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* JustTCG ID Warning */}
        {isCardIdMissing && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">JustTCG ID Required</p>
              <p className="text-amber-700">
                This card needs to be synced with JustTCG before pricing can be fetched.
              </p>
            </div>
          </div>
        )}

        {/* Condition Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Condition</label>
          <Select 
            value={selectedCondition} 
            onValueChange={setSelectedCondition}
            disabled={isCardIdMissing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map(condition => (
                <SelectItem key={condition} value={condition}>
                  {condition}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Printing Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Printing</label>
          <Select 
            value={selectedPrinting} 
            onValueChange={setSelectedPrinting}
            disabled={isCardIdMissing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRINTINGS.map(printing => (
                <SelectItem key={printing} value={printing}>
                  {printing}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pricing Display */}
        {pricing && (
          <div className="space-y-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex justify-between items-center">
              <span className="font-medium text-green-800">Market Price</span>
              <span className="text-xl font-bold text-green-600">
                {formatPrice(pricing.market_price)}
              </span>
            </div>
            
            {(pricing.low_price || pricing.high_price) && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-700">Range</span>
                <span className="text-sm text-green-700">
                  {formatPrice(pricing.low_price)} - {formatPrice(pricing.high_price)}
                </span>
              </div>
            )}

            {pricing.fetched_at && (
              <div className="text-xs text-green-600">
                Updated: {new Date(pricing.fetched_at).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* No Variants Available */}
        {noVariants && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              No pricing variants available for the selected condition and printing.
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && !noVariants && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={handleFetchPricing}
            disabled={loading || isCardIdMissing}
            className="flex-1"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4 mr-2" />
                Get Pricing
              </>
            )}
          </Button>

          {pricing && (
            <Button 
              variant="outline"
              onClick={handleRefreshPricing}
              disabled={loading || isCardIdMissing}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}