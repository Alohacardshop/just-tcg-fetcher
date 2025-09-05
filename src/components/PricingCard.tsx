import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, DollarSign, AlertCircle, Clock } from 'lucide-react';
import { usePricing } from '@/hooks/usePricing';
import { cn } from '@/lib/utils';

interface PricingCardProps {
  cardId?: string;
  cardName?: string;
  condition?: string;
  printing?: string;
  className?: string;
}

export function PricingCard({ 
  cardId, 
  cardName = 'Unknown Card',
  condition = 'Near Mint',
  printing = 'Normal',
  className 
}: PricingCardProps) {
  const { pricing, loading, error, cached, noVariants, fetchPricing } = usePricing({
    cardId,
    condition,
    printing,
    autoFetch: true
  });

  const handleRefresh = () => {
    fetchPricing({ refresh: true });
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: pricing?.currency || 'USD'
    }).format(price / 100);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Pricing
          {cached && (
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Cached
            </Badge>
          )}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading || !cardId}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <div><strong>Card:</strong> {cardName}</div>
            <div><strong>Condition:</strong> {condition}</div>
            <div><strong>Printing:</strong> {printing}</div>
          </div>

          {!cardId && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Card must be synced with JustTCG to fetch pricing
              </span>
            </div>
          )}

          {noVariants && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-800">
                No pricing variants available for {condition} condition, {printing} printing
              </span>
            </div>
          )}

          {error && !noVariants && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Fetching pricing...
              </span>
            </div>
          )}

          {pricing && !loading && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2">
                {pricing.market_price && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Market Price:</span>
                    <span className="text-lg font-bold text-green-600">
                      {formatPrice(pricing.market_price)}
                    </span>
                  </div>
                )}
                
                {(pricing.low_price || pricing.high_price) && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Price Range:</span>
                    <span className="text-sm">
                      {formatPrice(pricing.low_price)} - {formatPrice(pricing.high_price)}
                    </span>
                  </div>
                )}
              </div>

              {pricing.fetched_at && (
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Updated: {formatDate(pricing.fetched_at)}
                </div>
              )}
            </div>
          )}

          {!pricing && !loading && !error && cardId && (
            <div className="text-center py-4">
              <Button 
                variant="outline" 
                onClick={() => fetchPricing()}
                className="w-full"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Fetch Pricing
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}