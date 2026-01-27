import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RuleInput, Rule } from '../../types/rule.js';
import { NotFoundError, ConflictError, ValidationError } from '../middleware/error-handler.js';

interface RuleParams {
  id: string;
}

interface CreateRuleBody extends Omit<RuleInput, 'enabled'> {
  enabled?: boolean;
}

interface UpdateRuleBody {
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags?: string[];
  trigger?: Rule['trigger'];
  conditions?: Rule['conditions'];
  actions?: Rule['actions'];
}

export async function registerRulesRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  // GET /rules - Seznam pravidel
  fastify.get('/rules', async (): Promise<Rule[]> => {
    return engine.getRules();
  });

  // GET /rules/:id - Detail pravidla
  fastify.get<{ Params: RuleParams }>(
    '/rules/:id',
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
    async (request, reply): Promise<Rule> => {
      const body = request.body;

      if (!body.id) {
        throw new ValidationError('Missing required field: id');
      }
      if (!body.name) {
        throw new ValidationError('Missing required field: name');
      }
      if (!body.trigger) {
        throw new ValidationError('Missing required field: trigger');
      }

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
        ...(body.description !== undefined && { description: body.description })
      };

      const rule = engine.registerRule(input);

      reply.status(201);
      return rule;
    }
  );

  // PUT /rules/:id - Aktualizace pravidla
  fastify.put<{ Params: RuleParams; Body: UpdateRuleBody }>(
    '/rules/:id',
    async (request): Promise<Rule> => {
      const { id } = request.params;
      const existingRule = engine.getRule(id);

      if (!existingRule) {
        throw new NotFoundError('Rule', id);
      }

      const body = request.body;

      // Unregister old rule
      engine.unregisterRule(id);

      // Register updated rule
      const description = body.description ?? existingRule.description;
      const input: RuleInput = {
        id,
        name: body.name ?? existingRule.name,
        priority: body.priority ?? existingRule.priority,
        enabled: body.enabled ?? existingRule.enabled,
        tags: body.tags ?? existingRule.tags,
        trigger: body.trigger ?? existingRule.trigger,
        conditions: body.conditions ?? existingRule.conditions,
        actions: body.actions ?? existingRule.actions,
        ...(description !== undefined && { description })
      };

      return engine.registerRule(input);
    }
  );

  // DELETE /rules/:id - Smazání pravidla
  fastify.delete<{ Params: RuleParams }>(
    '/rules/:id',
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
