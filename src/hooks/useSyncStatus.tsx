import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SyncStatus {
  id: string;
  operation_id: string;
  operation_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  game_id?: string;
  set_id?: string;
  progress_current: number;
  progress_total: number;
  started_at: string;
  completed_at?: string;
  error_message?: string;
  resume_data?: any;
}

export function useSyncStatus(operationId?: string) {
  return useQuery<SyncStatus | null>({
    queryKey: ['sync_status', operationId],
    queryFn: async (): Promise<SyncStatus | null> => {
      if (!operationId) return null;
      
      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .eq('operation_id', operationId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as SyncStatus | null;
    },
    enabled: !!operationId,
    refetchInterval: (query) => {
      // Refetch more frequently if operation is running
      const data = query.state.data;
      if (!data || data.status === 'running' || data.status === 'pending') {
        return 2000; // 2 seconds
      }
      return false; // Stop refetching if completed/failed
    },
  });
}

export function useAllSyncStatuses() {
  return useQuery<SyncStatus[]>({
    queryKey: ['sync_status_all'],
    queryFn: async (): Promise<SyncStatus[]> => {
      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return (data || []) as SyncStatus[];
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

export function useSyncLogs(operationId?: string) {
  return useQuery({
    queryKey: ['sync_logs', operationId],
    queryFn: async () => {
      if (!operationId) return [];
      
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('operation_id', operationId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!operationId,
    refetchInterval: 3000, // Keep refetching every 3 seconds
  });
}
