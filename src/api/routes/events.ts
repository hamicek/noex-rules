import type { FastifyInstance } from 'fastify';
import type { Event } from '../../types/event.js';
import { ValidationError } from '../middleware/error-handler.js';

interface EmitEventBody {
  topic: string;
  data?: Record<string, unknown>;
}

interface EmitCorrelatedEventBody {
  topic: string;
  data?: Record<string, unknown>;
  correlationId: string;
  causationId?: string;
}

export async function registerEventsRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  // POST /events - Emitování eventu
  fastify.post<{ Body: EmitEventBody }>(
    '/events',
    async (request, reply): Promise<Event> => {
      const { topic, data } = request.body;

      if (!topic || typeof topic !== 'string') {
        throw new ValidationError('Missing or invalid required field: topic');
      }

      if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) {
        throw new ValidationError('Field data must be an object');
      }

      const event = await engine.emit(topic, data ?? {});

      reply.status(201);
      return event;
    }
  );

  // POST /events/correlated - Event s korelací
  fastify.post<{ Body: EmitCorrelatedEventBody }>(
    '/events/correlated',
    async (request, reply): Promise<Event> => {
      const { topic, data, correlationId, causationId } = request.body;

      if (!topic || typeof topic !== 'string') {
        throw new ValidationError('Missing or invalid required field: topic');
      }

      if (!correlationId || typeof correlationId !== 'string') {
        throw new ValidationError('Missing or invalid required field: correlationId');
      }

      if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) {
        throw new ValidationError('Field data must be an object');
      }

      if (causationId !== undefined && typeof causationId !== 'string') {
        throw new ValidationError('Field causationId must be a string');
      }

      const event = await engine.emitCorrelated(
        topic,
        data ?? {},
        correlationId,
        causationId
      );

      reply.status(201);
      return event;
    }
  );
}
