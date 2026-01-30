import { describe, it, expect, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';

interface GraphQLResponse {
  data?: Record<string, unknown> | null;
  errors?: Array<{
    message: string;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
  }>;
}

async function gql(
  address: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ status: number; body: GraphQLResponse }> {
  const response = await fetch(`${address}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as GraphQLResponse;
  return { status: response.status, body };
}

describe('GraphQL error handling (integration)', () => {
  let server: RuleEngineServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = undefined;
    }
  });

  // ─── HTTP status ──────────────────────────────────────────────────────────

  describe('HTTP response', () => {
    it('always returns HTTP 200 even for application errors', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { status, body } = await gql(
        server.address,
        `mutation { deleteRule(id: "nonexistent") }`,
      );

      expect(status).toBe(200);
      expect(body.errors).toBeDefined();
      expect(body.errors!.length).toBeGreaterThan(0);
    });
  });

  // ─── NotFoundError across domains ─────────────────────────────────────────

  describe('NotFoundError', () => {
    it('returns NOT_FOUND for non-existent rule update', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation {
          updateRule(id: "ghost", input: { name: "X" }) { id }
        }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions).toEqual(
        expect.objectContaining({
          code: 'NOT_FOUND',
          statusCode: 404,
        }),
      );
      expect(body.errors![0]!.path).toEqual(['updateRule']);
    });

    it('returns NOT_FOUND for non-existent rule deletion', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { deleteRule(id: "missing") }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions).toEqual(
        expect.objectContaining({
          code: 'NOT_FOUND',
          statusCode: 404,
        }),
      );
    });

    it('returns NOT_FOUND for non-existent rule enable', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { enableRule(id: "phantom") { id } }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions!['code']).toBe('NOT_FOUND');
    });

    it('returns NOT_FOUND for non-existent rule disable', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { disableRule(id: "phantom") { id } }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions!['code']).toBe('NOT_FOUND');
    });

    it('returns NOT_FOUND for non-existent group update', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation {
          updateGroup(id: "ghost", input: { name: "X" }) { id }
        }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions).toEqual(
        expect.objectContaining({
          code: 'NOT_FOUND',
          statusCode: 404,
        }),
      );
    });

    it('returns NOT_FOUND for non-existent group deletion', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { deleteGroup(id: "missing") }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions!['code']).toBe('NOT_FOUND');
    });

    it('returns NOT_FOUND for non-existent group enable', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { enableGroup(id: "phantom") { id } }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions!['code']).toBe('NOT_FOUND');
    });

    it('returns NOT_FOUND for non-existent fact deletion', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { deleteFact(key: "nonexistent") }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions).toEqual(
        expect.objectContaining({
          code: 'NOT_FOUND',
          statusCode: 404,
        }),
      );
    });

    it('returns NOT_FOUND for non-existent timer cancellation', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { cancelTimer(name: "ghost-timer") }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions!['code']).toBe('NOT_FOUND');
    });
  });

  // ─── ConflictError ────────────────────────────────────────────────────────

  describe('ConflictError', () => {
    it('returns CONFLICT for duplicate rule creation', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().registerRule({
        id: 'existing-rule',
        name: 'Existing',
        trigger: { type: 'event', topic: 'dup' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `mutation {
          createRule(input: {
            id: "existing-rule"
            name: "Duplicate"
            trigger: { type: event, topic: "dup" }
            actions: [{ type: log, level: info, message: "x" }]
          }) { id }
        }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions).toEqual(
        expect.objectContaining({
          code: 'CONFLICT',
          statusCode: 409,
        }),
      );
      expect(body.errors![0]!.path).toEqual(['createRule']);
    });

    it('returns CONFLICT for duplicate group creation', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().createGroup({ id: 'existing-group', name: 'Existing' });

      const { body } = await gql(
        server.address,
        `mutation {
          createGroup(input: {
            id: "existing-group"
            name: "Duplicate"
          }) { id }
        }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions).toEqual(
        expect.objectContaining({
          code: 'CONFLICT',
          statusCode: 409,
        }),
      );
    });
  });

  // ─── ServiceUnavailableError ──────────────────────────────────────────────

  describe('ServiceUnavailableError', () => {
    it('returns SERVICE_UNAVAILABLE for version queries without versioning', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `{ ruleVersions(ruleId: "any") { totalVersions } }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions).toEqual(
        expect.objectContaining({
          code: 'SERVICE_UNAVAILABLE',
          statusCode: 503,
        }),
      );
    });

    it('returns SERVICE_UNAVAILABLE for rollback without versioning', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().registerRule({
        id: 'rb-rule',
        name: 'Rollback Target',
        trigger: { type: 'event', topic: 'rb' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `mutation { rollbackRule(id: "rb-rule", version: 1) { id } }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions!['code']).toBe('SERVICE_UNAVAILABLE');
    });
  });

  // ─── GraphQL validation errors ────────────────────────────────────────────

  describe('GraphQL validation errors', () => {
    it('returns error for unknown field', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `{ rules { id nonExistentField } }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors!.length).toBeGreaterThan(0);
    });

    it('returns error for missing required argument', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `{ rule { id } }`,
      );

      expect(body.errors).toBeDefined();
    });

    it('returns error for invalid enum value in input', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation {
          createRule(input: {
            id: "bad"
            name: "Bad"
            trigger: { type: invalid_type, topic: "x" }
            actions: [{ type: log, level: info, message: "x" }]
          }) { id }
        }`,
      );

      expect(body.errors).toBeDefined();
    });
  });

  // ─── Nullable queries vs error-throwing mutations ─────────────────────────

  describe('null vs error convention', () => {
    it('queries return null for non-existent entities (no error)', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `{
          rule(id: "missing") { id }
          group(id: "missing") { id }
          fact(key: "missing") { key }
          timer(name: "missing") { name }
        }`,
      );

      expect(body.errors).toBeUndefined();
      expect(body.data!['rule']).toBeNull();
      expect(body.data!['group']).toBeNull();
      expect(body.data!['fact']).toBeNull();
      expect(body.data!['timer']).toBeNull();
    });

    it('mutations throw errors for non-existent entities', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { deleteRule(id: "missing") }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.extensions!['code']).toBe('NOT_FOUND');
    });
  });

  // ─── Error extensions consistency ─────────────────────────────────────────

  describe('error extensions format', () => {
    it('consistently includes code and statusCode in all app errors', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().registerRule({
        id: 'dup-ext',
        name: 'Dup',
        trigger: { type: 'event', topic: 'dup' },
        tags: [],
      });

      // ConflictError
      const { body: conflictBody } = await gql(
        server.address,
        `mutation {
          createRule(input: {
            id: "dup-ext"
            name: "Dup"
            trigger: { type: event, topic: "dup" }
            actions: [{ type: log, level: info, message: "x" }]
          }) { id }
        }`,
      );

      // NotFoundError
      const { body: notFoundBody } = await gql(
        server.address,
        `mutation { deleteRule(id: "absent") }`,
      );

      for (const body of [conflictBody, notFoundBody]) {
        expect(body.errors).toBeDefined();
        const ext = body.errors![0]!.extensions!;
        expect(ext).toHaveProperty('code');
        expect(ext).toHaveProperty('statusCode');
        expect(typeof ext['code']).toBe('string');
        expect(typeof ext['statusCode']).toBe('number');
      }

      expect(conflictBody.errors![0]!.extensions!['code']).toBe('CONFLICT');
      expect(conflictBody.errors![0]!.extensions!['statusCode']).toBe(409);
      expect(notFoundBody.errors![0]!.extensions!['code']).toBe('NOT_FOUND');
      expect(notFoundBody.errors![0]!.extensions!['statusCode']).toBe(404);
    });

    it('error includes path pointing to the failing resolver', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation {
          updateGroup(id: "gone", input: { name: "X" }) { id }
        }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.path).toEqual(['updateGroup']);
    });

    it('error message includes descriptive information', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation { deleteRule(id: "descriptive-id") }`,
      );

      expect(body.errors).toBeDefined();
      expect(body.errors![0]!.message).toContain('descriptive-id');
    });
  });

  // ─── Aliased mutations with mixed outcomes ────────────────────────────────

  describe('aliased mutations', () => {
    it('handles aliased queries with mixed null/found results', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().registerRule({
        id: 'exists',
        name: 'Exists',
        trigger: { type: 'event', topic: 'ex' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{
          found: rule(id: "exists") { id name }
          absent: rule(id: "nope") { id }
        }`,
      );

      expect(body.errors).toBeUndefined();
      expect(body.data!['found']).not.toBeNull();
      expect((body.data!['found'] as Record<string, unknown>)['name']).toBe('Exists');
      expect(body.data!['absent']).toBeNull();
    });
  });
});
