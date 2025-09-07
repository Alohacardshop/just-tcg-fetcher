import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tcgcsvThrottler, justtcgThrottler } from '@/lib/apiThrottler';

export interface ThrottleStats {
  tcgcsv: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    throttled: number;
    totalTasks: number;
    maxConcurrency: number;
    requestsPerSecond: number;
  };
  justtcg: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    throttled: number;
    totalTasks: number;
    maxConcurrency: number;
    requestsPerSecond: number;
  };
}

export function useThrottleStats() {
  const [stats, setStats] = useState<ThrottleStats>({
    tcgcsv: tcgcsvThrottler.getStats(),
    justtcg: justtcgThrottler.getStats()
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats({
        tcgcsv: tcgcsvThrottler.getStats(),
        justtcg: justtcgThrottler.getStats()
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const clearCompleted = () => {
    tcgcsvThrottler.clearCompleted();
    justtcgThrottler.clearCompleted();
  };

  return {
    stats,
    clearCompleted
  };
}

export function useTaskStatuses() {
  const [taskStatuses, setTaskStatuses] = useState(() => ({
    tcgcsv: tcgcsvThrottler.getTaskStatuses(),
    justtcg: justtcgThrottler.getTaskStatuses()
  }));

  useEffect(() => {
    const interval = setInterval(() => {
      setTaskStatuses({
        tcgcsv: tcgcsvThrottler.getTaskStatuses(),
        justtcg: justtcgThrottler.getTaskStatuses()
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return taskStatuses;
}