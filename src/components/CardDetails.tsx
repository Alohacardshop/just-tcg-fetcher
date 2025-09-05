import React from 'react';
import { PricingCard } from '@/components/PricingCard';
import { PricingWidget } from '@/components/PricingWidget';

interface CardDetailsProps {
  card: {
    id?: string;
    jt_card_id?: string;
    name: string;
    number?: string;
    rarity?: string;
  };
}

export function CardDetails({ card }: CardDetailsProps) {
  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card Information */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">{card.name}</h2>
          {card.number && (
            <p className="text-muted-foreground">#{card.number}</p>
          )}
          {card.rarity && (
            <p className="text-sm">
              <span className="font-medium">Rarity:</span> {card.rarity}
            </p>
          )}
          
          {card.jt_card_id ? (
            <p className="text-xs text-green-600">
              ✓ Synced with JustTCG (ID: {card.jt_card_id})
            </p>
          ) : (
            <p className="text-xs text-amber-600">
              ⚠ Not synced with JustTCG - pricing unavailable
            </p>
          )}
        </div>

        {/* Pricing Information */}
        <div className="space-y-4">
          <PricingCard 
            cardId={card.jt_card_id}
            cardName={card.name}
          />
        </div>
      </div>

      {/* Interactive Pricing Widget */}
      <div className="flex justify-center">
        <PricingWidget
          cardId={card.jt_card_id}
          cardName={card.name}
        />
      </div>
    </div>
  );
}