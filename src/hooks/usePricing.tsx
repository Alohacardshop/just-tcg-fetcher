import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { updateApiInspectorData } from '@/components/ApiInspector';

interface UsePricingOptions {
  cardId?: string;
  tcgplayerId?: string;
  variantId?: string;
  condition?: string;
  printing?: string;
  autoFetch?: boolean;
}

interface PricingData {
  card_id?: string;
  variant?: string;
  condition?: string;
  market_price?: number;
  low_price?: number;
  high_price?: number;
  currency?: string;
  fetched_at?: string;
  // New: support for multiple variants response
  data?: Array<{
    id: string;
    name: string;
    game?: string;
    set?: string;
    number?: string;
    tcgplayerId?: string;
    rarity?: string;
    details?: string;
    variants: Array<{
      id: string;
      printing: string;
      condition: string;
      price?: number;
      market_price?: number;
      low_price?: number;
      high_price?: number;
      currency?: string;
      lastUpdated?: string;
    }>;
  }>;
  allVariants?: boolean;
}

interface UsePricingReturn {
  pricing: PricingData | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
  noVariants: boolean; // New: indicates 404 - no variants available
  fetchPricing: (options?: { refresh?: boolean }) => Promise<void>;
}

export function usePricing({
  cardId,
  tcgplayerId,
  variantId,
  condition = 'Near Mint',
  printing = 'Normal',
  autoFetch = true
}: UsePricingOptions): UsePricingReturn {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [noVariants, setNoVariants] = useState(false);
  const { toast } = useToast();

  const fetchPricing = async (options: { refresh?: boolean } = {}) => {
    // Early validation: block if no card identifier provided
    const primaryId = cardId || tcgplayerId || variantId;
    if (!primaryId?.trim()) {
      const message = 'Card identifier (cardId, tcgplayerId, or variantId) is required before fetching pricing';
      setError(message);
      
      console.warn('⚠️ Pricing fetch blocked: missing card identifier');
      return;
    }

    setLoading(true);
    setError(null);
    setNoVariants(false);
    
    const requestPayload = { cardId, tcgplayerId, variantId, condition, printing, refresh: options.refresh || false };
    console.log(`🔄 Fetching pricing with payload:`, requestPayload);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('proxy-pricing', {
        body: requestPayload
      });

      // Update API Inspector with response metadata
      updateApiInspectorData({
        endpoint: 'proxy-pricing',
        meta: data?.meta,
        _metadata: data?._metadata,
      });

      // Handle function-level errors (network, auth, etc.)
      if (functionError) {
        console.error('❌ Function error:', functionError);
        throw new Error(`Service error: ${functionError.message}`);
      }

      // Handle application-level responses
      if (!data?.success) {
        const errorMessage = data?.error || 'Unknown error occurred';
        console.error('❌ Pricing error:', errorMessage);
        
        // Special handling for 404 - no variants available
        if (data?.status === 404 || errorMessage.toLowerCase().includes('no pricing') || errorMessage.toLowerCase().includes('no variants')) {
          console.log(`📭 No variants available for: ${primaryId} (${condition}, ${printing})`);
          setNoVariants(true);
          setPricing(null);
          
          // Don't show error toast for no variants - it's expected behavior
          return;
        }
        
        // For other errors, show concise error message
        throw new Error(errorMessage);
      }

      // Success case
      setPricing(data.pricing);
      setCached(data.cached || false);
      setNoVariants(false);
      
      if (data.cached) {
        console.log(`📋 Loaded cached pricing for: ${primaryId}`);
      } else {
        console.log(`✅ Fetched fresh pricing for: ${primaryId}`);
        toast({
          title: "Pricing Updated",
          description: `Fresh pricing data fetched for ${condition} condition.`,
        });
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setPricing(null);
      setNoVariants(false);
      
      console.error('❌ Pricing fetch failed:', errorMessage, 'Payload:', requestPayload);
      
      toast({
        title: "Pricing Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when dependencies change (if enabled and card identifier is available)
  useEffect(() => {
    const primaryId = cardId || tcgplayerId || variantId;
    if (autoFetch && primaryId?.trim()) {
      fetchPricing();
    }
  }, [cardId, tcgplayerId, variantId, condition, printing, autoFetch]);

  return {
    pricing,
    loading,
    error,
    cached,
    noVariants,
    fetchPricing
  };
}