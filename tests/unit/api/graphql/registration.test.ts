import { describe, it, expect, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';

describe('GraphQL registration', () => {
  let server: RuleEngineServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = undefined;
    }
  });

  async function gql(
    address: string,
    query: string,
    variables?: Record<string, unknown>,
    path = '/graphql',
  ): Promise<{ status: number; body: GraphQLResponse }> {
    const response = await fetch(`${address}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as GraphQLResponse;
    return { status: response.status, body };
  }

  interface GraphQLResponse {
    data?: Record<string, unknown> | null;
    errors?: Array<{
      message: string;
      path?: Array<string | number>;
      extensions?: Record<string, unknown>;
    }>;
  }

  // ─── Default registration ──────────────────────────────────────────────────

  describe('default configuration', () => {
    it('registers GraphQL endpoint at /graphql by default', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { status, body } = await gql(
        server.address,
        '{ health { status } }',
      );

      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body.data!['health']).toEqual(
        expect.objectContaining({ status: 'ok' }),
      );
    });

    it('serves GraphiQL IDE when graphiql is enabled (default)', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const response = await fetch(`${server.address}/graphiql`);

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('html');
    });
  });

  // ─── Disabled ──────────────────────────────────────────────────────────────

  describe('disabled', () => {
    it('does not register GraphQL when graphql is false', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false, graphql: false },
      });

      const response = await fetch(`${server.address}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ health { status } }' }),
      });

      expect(response.status).toBe(404);
    });
  });

  // ─── Custom path ───────────────────────────────────────────────────────────

  describe('custom path', () => {
    it('registers endpoint at custom path', async () => {
      server = await RuleEngineServer.start({
        server: {
          port: 0,
          logger: false,
          graphql: { path: '/gql' },
        },
      });

      const { status, body } = await gql(
        server.address,
        '{ health { status } }',
        undefined,
        '/gql',
      );

      expect(status).toBe(200);
      expect(body.data!['health']).toEqual(
        expect.objectContaining({ status: 'ok' }),
      );
    });
  });

  // ─── Queries ───────────────────────────────────────────────────────────────

  describe('queries', () => {
    it('resolves rules query', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'gql-rule-1',
        name: 'GraphQL Test Rule',
        trigger: { type: 'event', topic: 'gql.test' },
        tags: ['graphql'],
      });

      const { body } = await gql(
        server.address,
        '{ rules { id name tags } }',
      );

      expect(body.errors).toBeUndefined();
      const rules = body.data!['rules'] as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual(
        expect.objectContaining({
          id: 'gql-rule-1',
          name: 'GraphQL Test Rule',
          tags: ['graphql'],
        }),
      );
    });

    it('resolves single rule query with nested fields', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'gql-nested',
        name: 'Nested Query Rule',
        priority: 5,
        enabled: true,
        trigger: { type: 'event', topic: 'test' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{
          rule(id: "gql-nested") {
            id
            name
            enabled
            priority
            trigger { type topic }
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule).toEqual(
        expect.objectContaining({
          id: 'gql-nested',
          name: 'Nested Query Rule',
          enabled: true,
          priority: 5,
          trigger: { type: 'event', topic: 'test' },
        }),
      );
    });

    it('returns null for non-existent rule', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        '{ rule(id: "missing") { id } }',
      );

      expect(body.errors).toBeUndefined();
      expect(body.data!['rule']).toBeNull();
    });

    it('resolves facts query', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      await engine.setFact('gql:key', 42);

      const { body } = await gql(
        server.address,
        '{ facts { key value } }',
      );

      expect(body.errors).toBeUndefined();
      const facts = body.data!['facts'] as Array<Record<string, unknown>>;
      expect(facts).toHaveLength(1);
      expect(facts[0]).toEqual(
        expect.objectContaining({ key: 'gql:key', value: 42 }),
      );
    });

    it('resolves stats query', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        '{ stats { rulesCount factsCount eventsProcessed } }',
      );

      expect(body.errors).toBeUndefined();
      const stats = body.data!['stats'] as Record<string, unknown>;
      expect(stats).toEqual(
        expect.objectContaining({
          rulesCount: 0,
          factsCount: 0,
          eventsProcessed: 0,
        }),
      );
    });
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  describe('mutations', () => {
    it('creates a rule via mutation', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation {
          createRule(input: {
            id: "mut-rule"
            name: "Mutation Rule"
            trigger: { type: event, topic: "mut.test" }
            actions: [{ type: set_fact, key: "done", value: true }]
          }) {
            id
            name
            enabled
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const created = body.data!['createRule'] as Record<string, unknown>;
      expect(created).toEqual(
        expect.objectContaining({
          id: 'mut-rule',
          name: 'Mutation Rule',
          enabled: true,
        }),
      );

      // Verify engine state
      expect(server.getEngine().getRule('mut-rule')).toBeDefined();
    });

    it('sets a fact via mutation', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation {
          setFact(key: "gql:fact", value: "hello") {
            key
            value
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const fact = body.data!['setFact'] as Record<string, unknown>;
      expect(fact.key).toBe('gql:fact');
      expect(fact.value).toBe('hello');
    });

    it('deletes a rule via mutation', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'del-rule',
        name: 'To Delete',
        trigger: { type: 'event', topic: 'del' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        'mutation { deleteRule(id: "del-rule") }',
      );

      expect(body.errors).toBeUndefined();
      expect(body.data!['deleteRule']).toBe(true);
      expect(engine.getRule('del-rule')).toBeUndefined();
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns GraphQL errors with extensions for app errors', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().registerRule({
        id: 'dup-rule',
        name: 'Duplicate',
        trigger: { type: 'event', topic: 'dup' },
        tags: [],
      });

      const { status, body } = await gql(
        server.address,
        `mutation {
          createRule(input: {
            id: "dup-rule"
            name: "Duplicate"
            trigger: { type: event, topic: "dup" }
            actions: [{ type: set_fact, key: "x", value: 1 }]
          }) {
            id
          }
        }`,
      );

      // GraphQL always returns 200 per spec
      expect(status).toBe(200);
      expect(body.errors).toBeDefined();
      expect(body.errors!.length).toBeGreaterThan(0);
      expect(body.errors![0]!.extensions).toEqual(
        expect.objectContaining({
          code: 'CONFLICT',
          statusCode: 409,
        }),
      );
    });

    it('returns validation error for invalid query syntax', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        '{ invalidFieldThatDoesNotExist }',
      );

      expect(body.errors).toBeDefined();
      expect(body.errors!.length).toBeGreaterThan(0);
    });
  });

  // ─── Groups with nested rules ──────────────────────────────────────────────

  describe('nested queries', () => {
    it('resolves groups with nested rules', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'grp-1', name: 'Test Group' });
      engine.registerRule({
        id: 'grp-rule',
        name: 'Grouped Rule',
        trigger: { type: 'event', topic: 'grp' },
        group: 'grp-1',
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{
          group(id: "grp-1") {
            id
            name
            rules { id name }
            rulesCount
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const group = body.data!['group'] as Record<string, unknown>;
      expect(group['name']).toBe('Test Group');
      expect(group['rulesCount']).toBe(1);
      const rules = group['rules'] as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(1);
      expect(rules[0]!['id']).toBe('grp-rule');
    });

    it('resolves rule with group field resolver', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'grp-2', name: 'Linked Group' });
      engine.registerRule({
        id: 'linked-rule',
        name: 'Linked',
        trigger: { type: 'event', topic: 'link' },
        group: 'grp-2',
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{
          rule(id: "linked-rule") {
            id
            group { id name }
            groupId
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule['groupId']).toBe('grp-2');
      const group = rule['group'] as Record<string, unknown>;
      expect(group['id']).toBe('grp-2');
      expect(group['name']).toBe('Linked Group');
    });
  });

  // ─── Multiple operations in one request ────────────────────────────────────

  describe('field selection', () => {
    it('returns only requested fields', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'sel-rule',
        name: 'Selection Test',
        trigger: { type: 'event', topic: 'sel' },
        tags: ['a', 'b'],
      });

      const { body } = await gql(
        server.address,
        '{ rules { id } }',
      );

      expect(body.errors).toBeUndefined();
      const rules = body.data!['rules'] as Array<Record<string, unknown>>;
      expect(rules[0]).toEqual({ id: 'sel-rule' });
      // name, tags etc. should not be present
      expect(rules[0]).not.toHaveProperty('name');
      expect(rules[0]).not.toHaveProperty('tags');
    });
  });

  // ─── GraphQL is independent of REST API prefix ─────────────────────────────

  describe('independence from REST prefix', () => {
    it('GraphQL works at root level regardless of custom apiPrefix', async () => {
      server = await RuleEngineServer.start({
        server: {
          port: 0,
          logger: false,
          apiPrefix: '/custom/v2',
        },
      });

      const { body } = await gql(
        server.address,
        '{ health { status } }',
      );

      expect(body.errors).toBeUndefined();
      expect(body.data!['health']).toEqual(
        expect.objectContaining({ status: 'ok' }),
      );

      // REST API is under custom prefix
      const restRes = await fetch(`${server.address}/custom/v2/health`);
      expect(restRes.status).toBe(200);

      // Default REST prefix should not work
      const defaultRes = await fetch(`${server.address}/api/v1/health`);
      expect(defaultRes.status).toBe(404);
    });
  });
});
