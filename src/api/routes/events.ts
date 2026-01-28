import type { FastifyInstance } from 'fastify';
import type { Event } from '../../types/event.js';
import { eventsSchemas } from '../schemas/event.js';

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
    { schema: eventsSchemas.emit },
    async (request, reply): Promise<Event> => {
      const { topic, data } = request.body;
      const event = await engine.emit(topic, data ?? {});

      reply.status(201);
      return event;
    }
  );

  // POST /events/correlated - Event s korelací
  fastify.post<{ Body: EmitCorrelatedEventBody }>(
    '/events/correlated',
    { schema: eventsSchemas.emitCorrelated },
    async (request, reply): Promise<Event> => {
      const { topic, data, correlationId, causationId } = request.body;

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
