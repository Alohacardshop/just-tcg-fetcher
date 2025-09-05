import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface CardData {
  id: string;
  name: string;
  number: string;
  rarity: string;
  image_url?: string;
  data: any;
}

interface CardGridProps {
  cards: CardData[];
  loading: boolean;
}

export const CardGrid = ({ cards, loading }: CardGridProps) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="animate-pulse bg-gradient-card border-border">
            <div className="p-4 space-y-3">
              <div className="w-full h-48 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <Card className="bg-gradient-card border-border shadow-card">
        <div className="p-8 text-center text-muted-foreground">
          <div className="h-12 w-12 mx-auto mb-4 opacity-50 bg-muted rounded"></div>
          <p>No cards found matching your search criteria</p>
        </div>
      </Card>
    );
  }

  const getPrice = (card: CardData) => {
    const variants = card.data?.variants || [];
    if (variants.length > 0) {
      return variants[0].price || 0;
    }
    return 0;
  };

  const getPriceChange = (card: CardData) => {
    const variants = card.data?.variants || [];
    if (variants.length > 0) {
      return variants[0].priceChange30d || 0;
    }
    return 0;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => {
        const price = getPrice(card);
        const priceChange = getPriceChange(card);
        
        return (
          <Card key={card.id} className="bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 group shadow-card">
            <CardContent className="p-4 space-y-3">
              {/* Card Image */}
              <div className="relative">
                {card.image_url ? (
                  <img 
                    src={card.image_url} 
                    alt={card.name}
                    className="w-full h-48 object-cover rounded border border-border/50"
                  />
                ) : (
                  <div className="w-full h-48 bg-muted rounded border border-border/50 flex items-center justify-center">
                    <span className="text-muted-foreground text-sm">No Image</span>
                  </div>
                )}
                {card.rarity && (
                  <Badge 
                    variant="secondary" 
                    className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm"
                  >
                    {card.rarity}
                  </Badge>
                )}
              </div>

              {/* Card Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm leading-tight line-clamp-2">
                  {card.name}
                </h4>
                
                {card.number && (
                  <div className="text-xs text-muted-foreground">
                    #{card.number}
                  </div>
                )}

                {/* Price Info */}
                {price > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-green-600" />
                      <span className="text-sm font-medium">${price.toFixed(2)}</span>
                    </div>
                    
                    {priceChange !== 0 && (
                      <div className={`flex items-center gap-1 text-xs ${
                        priceChange > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {priceChange > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span>{Math.abs(priceChange).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                View Details
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};