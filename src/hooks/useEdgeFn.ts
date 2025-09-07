import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export function useEdgeFn<T = any>(functionName: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const invoke = useCallback(async (body: any = {}, options?: { suppressToast?: boolean }) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(functionName, {
        body
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      setData(result);
      
      // Don't show success toast if suppressToast is true
      if (!options?.suppressToast && result?.success) {
        const count = result.categoriesCount || result.groupsCount || result.summary?.totalUpserted || 0;
        if (count > 0) {
          toast({
            title: "Operation successful",
            description: `Processed ${count} items`,
          });
        }
      }
      
      return result;
    } catch (err: any) {
      const errorMessage = err?.message || "Unknown error occurred";
      setError(errorMessage);
      
      if (!options?.suppressToast) {
        toast({
          title: "Operation failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [functionName]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, error, loading, invoke, reset };
}