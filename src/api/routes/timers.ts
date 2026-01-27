import type { FastifyInstance } from 'fastify';
import type { Timer } from '../../types/timer.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';

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
  fastify.get('/timers', async (): Promise<Timer[]> => {
    return engine.getTimers();
  });

  // GET /timers/:name - Detail timeru
  fastify.get<{ Params: TimerParams }>(
    '/timers/:name',
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
    async (request, reply): Promise<Timer> => {
      const { name, duration, onExpire, repeat } = request.body;

      if (!name || typeof name !== 'string') {
        throw new ValidationError('Missing or invalid required field: name');
      }

      if (duration === undefined || (typeof duration !== 'string' && typeof duration !== 'number')) {
        throw new ValidationError('Missing or invalid required field: duration');
      }

      if (!onExpire || typeof onExpire !== 'object' || onExpire === null) {
        throw new ValidationError('Missing or invalid required field: onExpire');
      }

      if (!onExpire.topic || typeof onExpire.topic !== 'string') {
        throw new ValidationError('Missing or invalid required field: onExpire.topic');
      }

      if (onExpire.data !== undefined && (typeof onExpire.data !== 'object' || onExpire.data === null || Array.isArray(onExpire.data))) {
        throw new ValidationError('Field onExpire.data must be an object');
      }

      if (repeat !== undefined) {
        if (typeof repeat !== 'object' || repeat === null) {
          throw new ValidationError('Field repeat must be an object');
        }

        if (repeat.interval === undefined || (typeof repeat.interval !== 'string' && typeof repeat.interval !== 'number')) {
          throw new ValidationError('Missing or invalid required field: repeat.interval');
        }

        if (repeat.maxCount !== undefined && typeof repeat.maxCount !== 'number') {
          throw new ValidationError('Field repeat.maxCount must be a number');
        }
      }

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
    async (request, reply): Promise<void> => {
      const cancelled = await engine.cancelTimer(request.params.name);
      if (!cancelled) {
        throw new NotFoundError('Timer', request.params.name);
      }
      reply.status(204);
    }
  );
}
