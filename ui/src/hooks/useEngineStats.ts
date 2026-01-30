import { useQuery } from '@tanstack/react-query';
import { fetchHealth, fetchStats } from '../api/queries/engine';
import { POLLING_INTERVALS } from '../lib/constants';

export function useHealth() {
  return useQuery({
    queryKey: ['engine', 'health'],
    queryFn: fetchHealth,
    refetchInterval: POLLING_INTERVALS.health,
    retry: 1,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['engine', 'stats'],
    queryFn: fetchStats,
    refetchInterval: POLLING_INTERVALS.stats,
    retry: 1,
  });
}
