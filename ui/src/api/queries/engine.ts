import { graphqlClient } from '../client';
import type { HealthResponse, EngineStats } from '../../types';

const HEALTH_QUERY = /* GraphQL */ `
  query Health {
    health {
      status
      timestamp
      uptime
      version
      engine {
        name
        running
      }
    }
  }
`;

const STATS_QUERY = /* GraphQL */ `
  query Stats {
    stats {
      rulesCount
      factsCount
      timersCount
      eventsProcessed
      rulesExecuted
      avgProcessingTimeMs
      timestamp
    }
  }
`;

export async function fetchHealth(): Promise<HealthResponse> {
  const data = await graphqlClient.request<{ health: HealthResponse }>(
    HEALTH_QUERY,
  );
  return data.health;
}

export async function fetchStats(): Promise<EngineStats> {
  const data = await graphqlClient.request<{ stats: EngineStats }>(
    STATS_QUERY,
  );
  return data.stats;
}
