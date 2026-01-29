import type { FastifyInstance } from 'fastify';
import type { RuleGroup, RuleGroupInput } from '../../types/group.js';
import type { Rule } from '../../types/rule.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { groupsSchemas } from '../schemas/group.js';

interface GroupParams {
  id: string;
}

interface CreateGroupBody {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
}

interface UpdateGroupBody {
  name?: string;
  description?: string;
  enabled?: boolean;
}

export async function registerGroupsRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  // GET /groups - Seznam skupin
  fastify.get('/groups', { schema: groupsSchemas.list }, async (): Promise<RuleGroup[]> => {
    return engine.getGroups();
  });

  // GET /groups/:id - Detail skupiny
  fastify.get<{ Params: GroupParams }>(
    '/groups/:id',
    { schema: groupsSchemas.get },
    async (request): Promise<RuleGroup> => {
      const group = engine.getGroup(request.params.id);
      if (!group) {
        throw new NotFoundError('Group', request.params.id);
      }
      return group;
    }
  );

  // POST /groups - Vytvoření skupiny
  fastify.post<{ Body: CreateGroupBody }>(
    '/groups',
    { schema: groupsSchemas.create },
    async (request, reply): Promise<RuleGroup> => {
      const body = request.body;

      if (engine.getGroup(body.id)) {
        throw new ConflictError(`Group with id '${body.id}' already exists`);
      }

      const input: RuleGroupInput = {
        id: body.id,
        name: body.name,
        ...(body.description !== undefined && { description: body.description }),
        ...(body.enabled !== undefined && { enabled: body.enabled })
      };

      const group = engine.createGroup(input);

      reply.status(201);
      return group;
    }
  );

  // PUT /groups/:id - Aktualizace skupiny
  fastify.put<{ Params: GroupParams; Body: UpdateGroupBody }>(
    '/groups/:id',
    { schema: groupsSchemas.update },
    async (request): Promise<RuleGroup> => {
      const { id } = request.params;

      const group = engine.updateGroup(id, request.body);
      if (!group) {
        throw new NotFoundError('Group', id);
      }

      return group;
    }
  );

  // DELETE /groups/:id - Smazání skupiny
  fastify.delete<{ Params: GroupParams }>(
    '/groups/:id',
    { schema: groupsSchemas.delete },
    async (request, reply): Promise<void> => {
      const deleted = engine.deleteGroup(request.params.id);
      if (!deleted) {
        throw new NotFoundError('Group', request.params.id);
      }
      reply.status(204);
    }
  );

  // POST /groups/:id/enable - Povolení skupiny
  fastify.post<{ Params: GroupParams }>(
    '/groups/:id/enable',
    { schema: groupsSchemas.enable },
    async (request): Promise<RuleGroup> => {
      const { id } = request.params;
      const enabled = engine.enableGroup(id);
      if (!enabled) {
        throw new NotFoundError('Group', id);
      }
      const group = engine.getGroup(id);
      return group!;
    }
  );

  // POST /groups/:id/disable - Zakázání skupiny
  fastify.post<{ Params: GroupParams }>(
    '/groups/:id/disable',
    { schema: groupsSchemas.disable },
    async (request): Promise<RuleGroup> => {
      const { id } = request.params;
      const disabled = engine.disableGroup(id);
      if (!disabled) {
        throw new NotFoundError('Group', id);
      }
      const group = engine.getGroup(id);
      return group!;
    }
  );

  // GET /groups/:id/rules - Pravidla ve skupině
  fastify.get<{ Params: GroupParams }>(
    '/groups/:id/rules',
    { schema: groupsSchemas.rules },
    async (request): Promise<Rule[]> => {
      const { id } = request.params;
      const group = engine.getGroup(id);
      if (!group) {
        throw new NotFoundError('Group', id);
      }
      return engine.getGroupRules(id);
    }
  );
}
