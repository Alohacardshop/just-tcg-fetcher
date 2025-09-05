import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UsePricingOptions {
  cardId?: string;
  condition?: string;
  printing?: string;
  autoFetch?: boolean;
}

interface PricingData {
  market_price?: number;
  low_price?: number;
  high_price?: number;
  currency?: string;
  variant?: string;
  condition?: string;
  fetched_at?: string;
}

interface UsePricingReturn {
  pricing: PricingData | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
  fetchPricing: (options?: { refresh?: boolean }) => Promise<void>;
}

export function usePricing({
  cardId,
  condition = 'Near Mint',
  printing = 'Normal',
  autoFetch = true
}: UsePricingOptions): UsePricingReturn {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const { toast } = useToast();

  const fetchPricing = async (options: { refresh?: boolean } = {}) => {
    // Early validation: block if no JustTCG card ID
    if (!cardId?.trim()) {
      const message = 'JustTCG card ID is required before fetching pricing';
      setError(message);
      
      toast({
        title: "Pricing Unavailable",
        description: "Card must be synced with JustTCG before pricing can be fetched.",
        variant: "destructive",
      });
      
      console.warn('⚠️ Pricing fetch blocked: missing JustTCG card ID');
      return;
    }

    setLoading(true);
    setError(null);
    
    console.log(`🔄 Fetching pricing for card: ${cardId}, condition: ${condition}, printing: ${printing}`);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('proxy-pricing', {
        body: {
          cardId,
          condition,
          printing,
          refresh: options.refresh || false
        }
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to fetch pricing');
      }

      setPricing(data.pricing);
      setCached(data.cached || false);
      
      if (data.cached) {
        console.log(`📋 Loaded cached pricing for card: ${cardId}`);
      } else {
        console.log(`✅ Fetched fresh pricing for card: ${cardId}`);
        toast({
          title: "Pricing Updated",
          description: `Fresh pricing data fetched for ${condition} condition.`,
        });
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      
      console.error('❌ Pricing fetch failed:', errorMessage);
      
      toast({
        title: "Pricing Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when dependencies change (if enabled and cardId is available)
  useEffect(() => {
    if (autoFetch && cardId?.trim()) {
      fetchPricing();
    }
  }, [cardId, condition, printing, autoFetch]);

  return {
    pricing,
    loading,
    error,
    cached,
    fetchPricing
  };
}