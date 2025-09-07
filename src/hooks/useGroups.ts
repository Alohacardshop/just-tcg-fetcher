import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useGroups(categoryId?: number) {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = async () => {
    if (!categoryId) {
      setGroups([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('tcgcsv_groups')
        .select('*')
        .eq('category_id', categoryId)
        .order('name');

      if (queryError) {
        throw new Error(queryError.message);
      }

      setGroups(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [categoryId]);

  return { groups, loading, error, refetch: fetchGroups };
}