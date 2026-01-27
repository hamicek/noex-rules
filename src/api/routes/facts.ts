import type { FastifyInstance } from 'fastify';
import type { Fact } from '../../types/fact.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';

interface FactParams {
  key: string;
}

interface SetFactBody {
  value: unknown;
}

interface QueryFactsBody {
  pattern: string;
}

export async function registerFactsRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  // GET /facts - Seznam všech faktů
  fastify.get('/facts', async (): Promise<Fact[]> => {
    return engine.getAllFacts();
  });

  // GET /facts/:key - Detail faktu
  fastify.get<{ Params: FactParams }>(
    '/facts/:key',
    async (request): Promise<Fact> => {
      const fact = engine.getFactFull(request.params.key);
      if (!fact) {
        throw new NotFoundError('Fact', request.params.key);
      }
      return fact;
    }
  );

  // PUT /facts/:key - Nastavení faktu
  fastify.put<{ Params: FactParams; Body: SetFactBody }>(
    '/facts/:key',
    async (request, reply): Promise<Fact> => {
      const { key } = request.params;
      const { value } = request.body;

      if (value === undefined) {
        throw new ValidationError('Missing required field: value');
      }

      const isNew = !engine.getFactFull(key);
      const fact = await engine.setFact(key, value);

      if (isNew) {
        reply.status(201);
      }

      return fact;
    }
  );

  // DELETE /facts/:key - Smazání faktu
  fastify.delete<{ Params: FactParams }>(
    '/facts/:key',
    async (request, reply): Promise<void> => {
      const deleted = engine.deleteFact(request.params.key);
      if (!deleted) {
        throw new NotFoundError('Fact', request.params.key);
      }
      reply.status(204);
    }
  );

  // POST /facts/query - Query podle patternu
  fastify.post<{ Body: QueryFactsBody }>(
    '/facts/query',
    async (request): Promise<Fact[]> => {
      const { pattern } = request.body;

      if (!pattern) {
        throw new ValidationError('Missing required field: pattern');
      }

      if (pattern === '*') {
        return engine.getAllFacts();
      }

      return engine.queryFacts(pattern);
    }
  );
}
