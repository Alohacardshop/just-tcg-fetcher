import { useQuery } from '@tanstack/react-query';

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

export interface SyncLog {
  id: string;
  operation_id: string;
  operation_type: string;
  status: string;
  message: string;
  details?: any;
  created_at: string;
}

export function useSyncStatus(operationId?: string) {
  return useQuery<SyncStatus | null>({
    queryKey: ['sync_status', operationId],
    queryFn: async (): Promise<SyncStatus | null> => {
      // Database tables don't exist, return null
      return null;
    },
    enabled: false // Disable the query since tables don't exist
  });
}

export function useSyncLogs(operationId?: string) {
  return useQuery<SyncLog[]>({
    queryKey: ['sync_logs', operationId],
    queryFn: async (): Promise<SyncLog[]> => {
      // Database tables don't exist, return empty array
      return [];
    },
    enabled: false // Disable the query since tables don't exist
  });
}