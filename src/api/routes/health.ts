import type { FastifyInstance } from 'fastify';
import type { EngineStats } from '../../types/index.js';

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: number;
  uptime: number;
  version: string;
  engine: {
    name: string;
    running: boolean;
  };
}

export interface StatsResponse extends EngineStats {
  timestamp: number;
}

export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  fastify.get<{ Reply: HealthResponse }>(
    '/health',
    async (): Promise<HealthResponse> => {
      const isRunning = engine.isRunning;

      return {
        status: isRunning ? 'ok' : 'error',
        timestamp: Date.now(),
        uptime: process.uptime(),
        version: '1.0.0',
        engine: {
          name: 'noex-rules',
          running: isRunning
        }
      };
    }
  );

  fastify.get<{ Reply: StatsResponse }>(
    '/stats',
    async (): Promise<StatsResponse> => {
      const stats = engine.getStats();

      return {
        ...stats,
        timestamp: Date.now()
      };
    }
  );
}
