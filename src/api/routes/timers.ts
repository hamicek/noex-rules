import type { FastifyInstance } from 'fastify';
import type { Timer } from '../../types/timer.js';
import { NotFoundError } from '../middleware/error-handler.js';
import { timersSchemas } from '../schemas/timer.js';

interface TimerParams {
  name: string;
}

interface CreateTimerBody {
  name: string;
  duration: string | number;
  onExpire: {
    topic: string;
    data?: Record<string, unknown>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}

export async function registerTimersRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  // GET /timers - Seznam timerů
  fastify.get('/timers', { schema: timersSchemas.list }, async (): Promise<Timer[]> => {
    return engine.getTimers();
  });

  // GET /timers/:name - Detail timeru
  fastify.get<{ Params: TimerParams }>(
    '/timers/:name',
    { schema: timersSchemas.get },
    async (request): Promise<Timer> => {
      const timer = engine.getTimer(request.params.name);
      if (!timer) {
        throw new NotFoundError('Timer', request.params.name);
      }
      return timer;
    }
  );

  // POST /timers - Vytvoření timeru
  fastify.post<{ Body: CreateTimerBody }>(
    '/timers',
    { schema: timersSchemas.create },
    async (request, reply): Promise<Timer> => {
      const { name, duration, onExpire, repeat } = request.body;

      const timerConfig: {
        name: string;
        duration: string | number;
        onExpire: { topic: string; data: Record<string, unknown> };
        repeat?: { interval: string | number; maxCount?: number };
      } = {
        name,
        duration,
        onExpire: {
          topic: onExpire.topic,
          data: onExpire.data ?? {}
        }
      };

      if (repeat) {
        timerConfig.repeat = repeat;
      }

      const timer = await engine.setTimer(timerConfig);

      reply.status(201);
      return timer;
    }
  );

  // DELETE /timers/:name - Zrušení timeru
  fastify.delete<{ Params: TimerParams }>(
    '/timers/:name',
    { schema: timersSchemas.delete },
    async (request, reply): Promise<void> => {
      const cancelled = await engine.cancelTimer(request.params.name);
      if (!cancelled) {
        throw new NotFoundError('Timer', request.params.name);
      }
      reply.status(204);
    }
  );
}
