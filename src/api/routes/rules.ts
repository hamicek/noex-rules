import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RuleInput, Rule } from '../../types/rule.js';
import type { ValidationResult } from '../../validation/index.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { rulesSchemas } from '../schemas/rule.js';

interface RuleParams {
  id: string;
}

interface CreateRuleBody extends Omit<RuleInput, 'enabled'> {
  enabled?: boolean;
  group?: string;
}

interface UpdateRuleBody {
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags?: string[];
  group?: string;
  trigger?: Rule['trigger'];
  conditions?: Rule['conditions'];
  actions?: Rule['actions'];
}

export async function registerRulesRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  // GET /rules - Seznam pravidel
  fastify.get('/rules', { schema: rulesSchemas.list }, async (): Promise<Rule[]> => {
    return engine.getRules();
  });

  // GET /rules/:id - Detail pravidla
  fastify.get<{ Params: RuleParams }>(
    '/rules/:id',
    { schema: rulesSchemas.get },
    async (request): Promise<Rule> => {
      const rule = engine.getRule(request.params.id);
      if (!rule) {
        throw new NotFoundError('Rule', request.params.id);
      }
      return rule;
    }
  );

  // POST /rules - Vytvoření pravidla
  fastify.post<{ Body: CreateRuleBody }>(
    '/rules',
    { schema: rulesSchemas.create },
    async (request, reply): Promise<Rule> => {
      const body = request.body;

      // Kontrola duplicity
      if (engine.getRule(body.id)) {
        throw new ConflictError(`Rule with id '${body.id}' already exists`);
      }

      const input: RuleInput = {
        id: body.id,
        name: body.name,
        priority: body.priority ?? 0,
        enabled: body.enabled ?? true,
        tags: body.tags ?? [],
        trigger: body.trigger,
        conditions: body.conditions ?? [],
        actions: body.actions ?? [],
        ...(body.description !== undefined && { description: body.description }),
        ...(body.group !== undefined && { group: body.group })
      };

      const rule = engine.registerRule(input);

      reply.status(201);
      return rule;
    }
  );

  // POST /rules/validate - Dry-run validace pravidla
  fastify.post(
    '/rules/validate',
    { schema: rulesSchemas.validate },
    async (request): Promise<ValidationResult> => {
      return engine.validateRule(request.body);
    }
  );

  // PUT /rules/:id - Aktualizace pravidla
  fastify.put<{ Params: RuleParams; Body: UpdateRuleBody }>(
    '/rules/:id',
    { schema: rulesSchemas.update },
    async (request): Promise<Rule> => {
      const { id } = request.params;

      if (!engine.getRule(id)) {
        throw new NotFoundError('Rule', id);
      }

      return engine.updateRule(id, request.body);
    }
  );

  // DELETE /rules/:id - Smazání pravidla
  fastify.delete<{ Params: RuleParams }>(
    '/rules/:id',
    { schema: rulesSchemas.delete },
    async (request, reply): Promise<void> => {
      const deleted = engine.unregisterRule(request.params.id);
      if (!deleted) {
        throw new NotFoundError('Rule', request.params.id);
      }
      reply.status(204);
    }
  );

  // POST /rules/:id/enable - Povolení pravidla
  fastify.post<{ Params: RuleParams }>(
    '/rules/:id/enable',
    { schema: rulesSchemas.enable },
    async (request): Promise<Rule> => {
      const { id } = request.params;
      const enabled = engine.enableRule(id);
      if (!enabled) {
        throw new NotFoundError('Rule', id);
      }
      const rule = engine.getRule(id);
      return rule!;
    }
  );

  // POST /rules/:id/disable - Zakázání pravidla
  fastify.post<{ Params: RuleParams }>(
    '/rules/:id/disable',
    { schema: rulesSchemas.disable },
    async (request): Promise<Rule> => {
      const { id } = request.params;
      const disabled = engine.disableRule(id);
      if (!disabled) {
        throw new NotFoundError('Rule', id);
      }
      const rule = engine.getRule(id);
      return rule!;
    }
  );
}
