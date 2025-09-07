import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('tcgcsv_categories')
        .select('tcgcsv_category_id, name, display_name')
        .order('name');

      if (queryError) {
        throw new Error(queryError.message);
      }

      setCategories(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return { categories, loading, error, refetch: fetchCategories };
}