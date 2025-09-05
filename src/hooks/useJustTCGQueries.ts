import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Query keys
export const QUERY_KEYS = {
  games: ['games'],
  sets: (gameId?: string) => ['sets', gameId],
  cards: (gameId?: string, setId?: string) => ['cards', gameId, setId],
  pricing: (cardId?: string, condition?: string, printing?: string) => 
    ['pricing', cardId, condition, printing],
};

export function useGamesQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.games,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSetsQuery(gameId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.sets(gameId),
    queryFn: async () => {
      if (!gameId) return [];
      
      const { data, error } = await supabase
        .from('sets')
        .select('*')
        .filter('jt_game_id', 'eq', gameId)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!gameId,
  });
}

export function useCardsQuery(gameId?: string, setId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.cards(gameId, setId),
    queryFn: async () => {
      if (!gameId || !setId) return [];
      
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .filter('jt_game_id', 'eq', gameId)
        .filter('jt_set_id', 'eq', setId)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!gameId && !!setId,
  });
}

export function useSyncGameMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (action: string) => {
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.games });
    },
  });
}

export function useSyncSetsMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ gameId }: { gameId: string }) => {
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-sets', gameId }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { gameId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sets(gameId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.games });
    },
  });
}

export function useSyncCardsMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ gameId, setId }: { gameId: string; setId: string }) => {
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-cards', gameId, setId }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { gameId, setId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cards(gameId, setId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sets(gameId) });
    },
  });
}