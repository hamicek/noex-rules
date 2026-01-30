import { useHealth } from './useEngineStats';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export function useServerConnection() {
  const { data, isLoading, isError, error } = useHealth();

  let status: ConnectionStatus;
  if (isLoading) {
    status = 'connecting';
  } else if (isError || !data) {
    status = 'disconnected';
  } else {
    status = 'connected';
  }

  return { status, health: data, isLoading, isError, error };
}
