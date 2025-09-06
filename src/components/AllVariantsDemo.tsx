/**
 * Demo component showing how to fetch all variants for a card
 * This demonstrates the new functionality that returns all printings and conditions
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { usePricing } from '@/hooks/usePricing';

interface AllVariantsDemoProps {
  className?: string;
}

export function AllVariantsDemo({ className }: AllVariantsDemoProps) {
  const [cardId, setCardId] = useState('');
  const [tcgplayerId, setTcgplayerId] = useState('');
  const [variantId, setVariantId] = useState('');

  // Use the updated usePricing hook to fetch all variants
  const { pricing, loading, error, fetchPricing } = usePricing({
    cardId: cardId.trim() || undefined,
    tcgplayerId: tcgplayerId.trim() || undefined, 
    variantId: variantId.trim() || undefined,
    autoFetch: false // Manual control
  });

  const handleFetchAllVariants = () => {
    fetchPricing({ refresh: false });
  };

  const handleRefresh = () => {
    fetchPricing({ refresh: true });
  };

  const hasAllVariants = pricing?.allVariants === true;
  const variantData = pricing?.data || [];

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle>All Variants Fetcher Demo</CardTitle>
          <CardDescription>
            Fetch all printings and conditions for a card using only ID parameters.
            ID takes precedence over text search.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Input Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Card ID</label>
              <Input
                placeholder="e.g. card-123"
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">TCGPlayer ID</label>
              <Input
                placeholder="e.g. tcg-456"
                value={tcgplayerId}
                onChange={(e) => setTcgplayerId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Variant ID</label>
              <Input
                placeholder="e.g. var-789"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={handleFetchAllVariants}
              disabled={loading || (!cardId.trim() && !tcgplayerId.trim() && !variantId.trim())}
              className="flex-1"
            >
              {loading ? 'Fetching...' : 'Fetch All Variants'}
            </Button>
            <Button 
              onClick={handleRefresh}
              disabled={loading || !pricing}
              variant="outline"
            >
              Refresh
            </Button>
          </div>

          {/* Results Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">Error: {error}</p>
            </div>
          )}

          {hasAllVariants && variantData.length > 0 && (
            <div className="space-y-4">
              <Separator />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">All Variants Found</h3>
                <Badge variant="outline">
                  {variantData.length} card{variantData.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {variantData.map((card, cardIndex) => (
                <Card key={cardIndex} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{card.name}</CardTitle>
                      <Badge variant="secondary">{card.game}</Badge>
                    </div>
                    <CardDescription>
                      Set: {card.set} {card.number && `• #${card.number}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {card.variants && card.variants.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Variants:</span>
                          <Badge variant="outline">
                            {card.variants.length} variant{card.variants.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        
                        <div className="grid gap-3">
                          {card.variants.map((variant, variantIndex) => (
                            <div 
                              key={variantIndex}
                              className="p-3 bg-gray-50 rounded-lg border"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge>{variant.printing || 'Normal'}</Badge>
                                  <Badge variant="outline">{variant.condition || 'Near Mint'}</Badge>
                                </div>
                                {variant.market_price && (
                                  <span className="font-medium text-green-600">
                                    ${variant.market_price.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              
                              {(variant.low_price || variant.high_price) && (
                                <div className="text-sm text-gray-600">
                                  Range: ${variant.low_price?.toFixed(2) || 'N/A'} - ${variant.high_price?.toFixed(2) || 'N/A'}
                                </div>
                              )}
                              
                              {variant.lastUpdated && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Updated: {new Date(variant.lastUpdated).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500">No variants found for this card.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {pricing && !hasAllVariants && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm">
                Single variant result (legacy format) - consider using the new all-variants endpoint.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}