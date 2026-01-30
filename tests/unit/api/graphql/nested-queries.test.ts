import { describe, it, expect, afterEach } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
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

describe('GraphQL nested / cross-entity queries', () => {
  let server: RuleEngineServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = undefined;
    }
  });

  // ─── Rule → Group field resolver ──────────────────────────────────────────

  describe('Rule → Group', () => {
    it('resolves group object through rule field resolver', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'backend', name: 'Backend Rules', description: 'Server-side logic' });
      engine.registerRule({
        id: 'r-auth',
        name: 'Auth Rule',
        trigger: { type: 'event', topic: 'auth.login' },
        group: 'backend',
        tags: ['security'],
      });

      const { body } = await gql(
        server.address,
        `{
          rule(id: "r-auth") {
            id
            name
            groupId
            group {
              id
              name
              description
              enabled
            }
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule['id']).toBe('r-auth');
      expect(rule['groupId']).toBe('backend');

      const group = rule['group'] as Record<string, unknown>;
      expect(group['id']).toBe('backend');
      expect(group['name']).toBe('Backend Rules');
      expect(group['description']).toBe('Server-side logic');
      expect(group['enabled']).toBe(true);
    });

    it('returns null group for ungrouped rule', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().registerRule({
        id: 'r-solo',
        name: 'Solo Rule',
        trigger: { type: 'event', topic: 'solo' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{ rule(id: "r-solo") { id group { id } groupId } }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule['group']).toBeNull();
      expect(rule['groupId']).toBeNull();
    });
  });

  // ─── Group → Rules + rulesCount ───────────────────────────────────────────

  describe('Group → Rules', () => {
    it('resolves rules and rulesCount through group field resolvers', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'payments', name: 'Payment Rules' });
      engine.registerRule({
        id: 'r-pay-1',
        name: 'Validate Payment',
        trigger: { type: 'event', topic: 'payment.created' },
        group: 'payments',
        tags: ['payment'],
      });
      engine.registerRule({
        id: 'r-pay-2',
        name: 'Process Refund',
        trigger: { type: 'event', topic: 'payment.refund' },
        group: 'payments',
        tags: ['payment', 'refund'],
      });
      engine.registerRule({
        id: 'r-unrelated',
        name: 'Unrelated',
        trigger: { type: 'event', topic: 'other' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{
          group(id: "payments") {
            id
            name
            rulesCount
            rules {
              id
              name
              tags
              trigger { type topic }
            }
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const group = body.data!['group'] as Record<string, unknown>;
      expect(group['name']).toBe('Payment Rules');
      expect(group['rulesCount']).toBe(2);

      const rules = group['rules'] as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(2);
      const ruleIds = rules.map(r => r['id']);
      expect(ruleIds).toContain('r-pay-1');
      expect(ruleIds).toContain('r-pay-2');
      expect(ruleIds).not.toContain('r-unrelated');
    });

    it('returns empty rules array for group with no rules', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().createGroup({ id: 'empty-group', name: 'Empty' });

      const { body } = await gql(
        server.address,
        `{ group(id: "empty-group") { rulesCount rules { id } } }`,
      );

      expect(body.errors).toBeUndefined();
      const group = body.data!['group'] as Record<string, unknown>;
      expect(group['rulesCount']).toBe(0);
      expect(group['rules']).toEqual([]);
    });
  });

  // ─── Bidirectional: Group → Rules → Group ─────────────────────────────────

  describe('bidirectional nesting', () => {
    it('resolves Group → Rules → Group back-reference in single request', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'g-bidi', name: 'Bidirectional Group' });
      engine.registerRule({
        id: 'r-bidi',
        name: 'Bidi Rule',
        trigger: { type: 'event', topic: 'bidi' },
        group: 'g-bidi',
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{
          group(id: "g-bidi") {
            id
            name
            rules {
              id
              name
              group {
                id
                name
              }
            }
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const group = body.data!['group'] as Record<string, unknown>;
      expect(group['id']).toBe('g-bidi');

      const rules = group['rules'] as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(1);

      const nestedGroup = rules[0]!['group'] as Record<string, unknown>;
      expect(nestedGroup['id']).toBe('g-bidi');
      expect(nestedGroup['name']).toBe('Bidirectional Group');
    });
  });

  // ─── Multiple root queries in one request ─────────────────────────────────

  describe('multiple root queries', () => {
    it('fetches rules, groups, facts, and health in a single request', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'g1', name: 'Group One' });
      engine.registerRule({
        id: 'r1',
        name: 'Rule One',
        trigger: { type: 'event', topic: 'test' },
        group: 'g1',
        tags: [],
      });
      await engine.setFact('counter', 42);

      const { body } = await gql(
        server.address,
        `{
          rules { id name }
          groups { id name }
          facts { key value }
          health { status engine { running } }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const data = body.data!;

      const rules = data['rules'] as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(1);
      expect(rules[0]!['name']).toBe('Rule One');

      const groups = data['groups'] as Array<Record<string, unknown>>;
      expect(groups).toHaveLength(1);
      expect(groups[0]!['name']).toBe('Group One');

      const facts = data['facts'] as Array<Record<string, unknown>>;
      expect(facts).toHaveLength(1);
      expect(facts[0]!['key']).toBe('counter');
      expect(facts[0]!['value']).toBe(42);

      const health = data['health'] as Record<string, unknown>;
      expect(health['status']).toBe('ok');
      expect((health['engine'] as Record<string, unknown>)['running']).toBe(true);
    });

    it('uses aliases to query the same type multiple times', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'r1',
        name: 'First',
        trigger: { type: 'event', topic: 'a' },
        tags: [],
      });
      engine.registerRule({
        id: 'r2',
        name: 'Second',
        trigger: { type: 'event', topic: 'b' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{
          first: rule(id: "r1") { id name }
          second: rule(id: "r2") { id name }
          missing: rule(id: "nonexistent") { id }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const data = body.data!;
      expect((data['first'] as Record<string, unknown>)['name']).toBe('First');
      expect((data['second'] as Record<string, unknown>)['name']).toBe('Second');
      expect(data['missing']).toBeNull();
    });
  });

  // ─── All groups with all rules (list nesting) ────────────────────────────

  describe('list-level nesting', () => {
    it('resolves all groups with their rules in a single request', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'g-alpha', name: 'Alpha' });
      engine.createGroup({ id: 'g-beta', name: 'Beta' });

      engine.registerRule({
        id: 'r-a1',
        name: 'Alpha R1',
        trigger: { type: 'event', topic: 'a1' },
        group: 'g-alpha',
        tags: [],
      });
      engine.registerRule({
        id: 'r-a2',
        name: 'Alpha R2',
        trigger: { type: 'event', topic: 'a2' },
        group: 'g-alpha',
        tags: [],
      });
      engine.registerRule({
        id: 'r-b1',
        name: 'Beta R1',
        trigger: { type: 'event', topic: 'b1' },
        group: 'g-beta',
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{
          groups {
            id
            name
            rulesCount
            rules {
              id
              name
              trigger { topic }
            }
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const groups = body.data!['groups'] as Array<Record<string, unknown>>;
      expect(groups).toHaveLength(2);

      const alpha = groups.find(g => g['id'] === 'g-alpha')!;
      expect(alpha['rulesCount']).toBe(2);
      expect(alpha['rules']).toHaveLength(2);

      const beta = groups.find(g => g['id'] === 'g-beta')!;
      expect(beta['rulesCount']).toBe(1);
      expect(beta['rules']).toHaveLength(1);
    });

    it('resolves all rules with their groups in a single request', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'g-x', name: 'Group X' });
      engine.registerRule({
        id: 'r-grouped',
        name: 'Grouped',
        trigger: { type: 'event', topic: 'g' },
        group: 'g-x',
        tags: [],
      });
      engine.registerRule({
        id: 'r-orphan',
        name: 'Orphan',
        trigger: { type: 'event', topic: 'o' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{ rules { id name group { id name } groupId } }`,
      );

      expect(body.errors).toBeUndefined();
      const rules = body.data!['rules'] as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(2);

      const grouped = rules.find(r => r['id'] === 'r-grouped')!;
      expect(grouped['groupId']).toBe('g-x');
      expect((grouped['group'] as Record<string, unknown>)['name']).toBe('Group X');

      const orphan = rules.find(r => r['id'] === 'r-orphan')!;
      expect(orphan['groupId']).toBeNull();
      expect(orphan['group']).toBeNull();
    });
  });

  // ─── Rules with version history ───────────────────────────────────────────

  describe('Rule → Versions (subsystem)', () => {
    it('resolves rule with inline version history', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        engineConfig: {
          versioning: { adapter: new MemoryAdapter() },
        },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'r-ver',
        name: 'Original Name',
        trigger: { type: 'event', topic: 'ver' },
        tags: [],
      });
      engine.updateRule('r-ver', { name: 'Updated Name' });

      const { body } = await gql(
        server.address,
        `{
          rule(id: "r-ver") {
            id
            name
            version
            versions(limit: 10) {
              totalVersions
              hasMore
              entries {
                version
                changeType
                ruleSnapshot { name }
              }
            }
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule['name']).toBe('Updated Name');

      const versions = rule['versions'] as Record<string, unknown>;
      expect(versions['totalVersions']).toBeGreaterThanOrEqual(2);

      const entries = versions['entries'] as Array<Record<string, unknown>>;
      expect(entries.length).toBeGreaterThanOrEqual(2);

      const registered = entries.find(e => e['changeType'] === 'registered');
      expect(registered).toBeDefined();
      expect((registered!['ruleSnapshot'] as Record<string, unknown>)['name']).toBe('Original Name');
    });

    it('returns null versions when versioning is not configured', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().registerRule({
        id: 'r-nover',
        name: 'No Versions',
        trigger: { type: 'event', topic: 'nover' },
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{ rule(id: "r-nover") { id versions { totalVersions } } }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule['versions']).toBeNull();
    });
  });

  // ─── Rules with audit entries ─────────────────────────────────────────────

  describe('Rule → AuditEntries (subsystem)', () => {
    it('resolves rule with inline audit entries', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        engineConfig: {
          audit: { adapter: new MemoryAdapter(), flushIntervalMs: 0 },
        },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'r-aud',
        name: 'Audited Rule',
        trigger: { type: 'event', topic: 'aud' },
        conditions: [],
        actions: [{ type: 'log', level: 'info', message: 'audit' }],
        tags: [],
      });
      engine.updateRule('r-aud', { name: 'Updated Audited' });

      const { body } = await gql(
        server.address,
        `{
          rule(id: "r-aud") {
            id
            name
            auditEntries(limit: 5) {
              id
              category
              type
              summary
              ruleId
              timestamp
            }
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      const entries = rule['auditEntries'] as Array<Record<string, unknown>>;
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.every(e => e['ruleId'] === 'r-aud')).toBe(true);
    });

    it('returns empty audit entries when audit is not configured', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().registerRule({
        id: 'r-noaud',
        name: 'No Audit',
        trigger: { type: 'event', topic: 'noaud' },
        conditions: [],
        actions: [{ type: 'log', level: 'info', message: 'noaud' }],
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `{ rule(id: "r-noaud") { id auditEntries { id } } }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule['auditEntries']).toEqual([]);
    });
  });

  // ─── Combined deep nesting: Group + Versions + Audit ──────────────────────

  describe('combined deep nesting', () => {
    it('resolves rule with group, versions, and audit entries in one request', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        engineConfig: {
          versioning: { adapter: new MemoryAdapter() },
          audit: { adapter: new MemoryAdapter(), flushIntervalMs: 0 },
        },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'g-deep', name: 'Deep Group' });
      engine.registerRule({
        id: 'r-deep',
        name: 'Deep Rule',
        trigger: { type: 'event', topic: 'deep' },
        conditions: [],
        actions: [{ type: 'log', level: 'info', message: 'deep' }],
        group: 'g-deep',
        priority: 5,
        tags: ['deep'],
      });
      engine.updateRule('r-deep', { name: 'Deep Rule v2', priority: 10 });

      const { body } = await gql(
        server.address,
        `{
          rule(id: "r-deep") {
            id
            name
            priority
            tags
            group {
              id
              name
              rulesCount
            }
            versions(limit: 5) {
              totalVersions
              entries {
                version
                changeType
              }
            }
            auditEntries(limit: 5) {
              type
              ruleId
            }
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule['name']).toBe('Deep Rule v2');
      expect(rule['priority']).toBe(10);
      expect(rule['tags']).toEqual(['deep']);

      const group = rule['group'] as Record<string, unknown>;
      expect(group['id']).toBe('g-deep');
      expect(group['name']).toBe('Deep Group');
      expect(group['rulesCount']).toBe(1);

      const versions = rule['versions'] as Record<string, unknown>;
      expect(versions['totalVersions']).toBeGreaterThanOrEqual(2);

      const auditEntries = rule['auditEntries'] as Array<Record<string, unknown>>;
      expect(auditEntries.length).toBeGreaterThanOrEqual(1);
      expect(auditEntries.every(e => e['ruleId'] === 'r-deep')).toBe(true);
    });
  });

  // ─── Mutation with nested field resolution ────────────────────────────────

  describe('mutation + nested resolution', () => {
    it('creates a rule and resolves group in mutation response', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      server.getEngine().createGroup({ id: 'g-mut', name: 'Mutation Group' });

      const { body } = await gql(
        server.address,
        `mutation {
          createRule(input: {
            id: "r-mut"
            name: "Mutation Rule"
            trigger: { type: event, topic: "mut.test" }
            group: "g-mut"
            actions: [{ type: log, level: info, message: "created" }]
          }) {
            id
            name
            enabled
            group {
              id
              name
            }
            groupId
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['createRule'] as Record<string, unknown>;
      expect(rule['id']).toBe('r-mut');
      expect(rule['name']).toBe('Mutation Rule');
      expect(rule['enabled']).toBe(true);
      expect(rule['groupId']).toBe('g-mut');

      const group = rule['group'] as Record<string, unknown>;
      expect(group['id']).toBe('g-mut');
      expect(group['name']).toBe('Mutation Group');
    });

    it('creates a group and queries its rules (initially empty)', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const { body } = await gql(
        server.address,
        `mutation {
          createGroup(input: {
            id: "g-new"
            name: "New Group"
            description: "Just created"
          }) {
            id
            name
            description
            rules { id }
            rulesCount
          }
        }`,
      );

      expect(body.errors).toBeUndefined();
      const group = body.data!['createGroup'] as Record<string, unknown>;
      expect(group['id']).toBe('g-new');
      expect(group['name']).toBe('New Group');
      expect(group['description']).toBe('Just created');
      expect(group['rules']).toEqual([]);
      expect(group['rulesCount']).toBe(0);
    });
  });

  // ─── Fragment usage ───────────────────────────────────────────────────────

  describe('fragments', () => {
    it('supports fragments for cross-entity queries', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'g-frag', name: 'Fragment Group' });
      engine.registerRule({
        id: 'r-frag-1',
        name: 'Frag Rule 1',
        enabled: true,
        trigger: { type: 'event', topic: 'frag1' },
        group: 'g-frag',
        tags: ['tagged'],
      });
      engine.registerRule({
        id: 'r-frag-2',
        name: 'Frag Rule 2',
        enabled: true,
        trigger: { type: 'event', topic: 'frag2' },
        group: 'g-frag',
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `
          fragment RuleFields on Rule {
            id
            name
            tags
            enabled
          }

          fragment GroupWithRules on RuleGroup {
            id
            name
            rulesCount
            rules {
              ...RuleFields
            }
          }

          {
            groups {
              ...GroupWithRules
            }
            rules {
              ...RuleFields
              group { id }
            }
          }
        `,
      );

      expect(body.errors).toBeUndefined();
      const data = body.data!;

      const groups = data['groups'] as Array<Record<string, unknown>>;
      expect(groups).toHaveLength(1);
      expect(groups[0]!['rulesCount']).toBe(2);
      expect(groups[0]!['rules']).toHaveLength(2);

      const rules = data['rules'] as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(2);
      expect(rules.every(r => typeof r['id'] === 'string')).toBe(true);
      expect(rules.every(r => typeof r['enabled'] === 'boolean')).toBe(true);
    });
  });

  // ─── Variables ────────────────────────────────────────────────────────────

  describe('variables', () => {
    it('supports query variables for parameterized cross-entity queries', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      const engine = server.getEngine();
      engine.createGroup({ id: 'g-var', name: 'Variable Group' });
      engine.registerRule({
        id: 'r-var',
        name: 'Variable Rule',
        trigger: { type: 'event', topic: 'var' },
        group: 'g-var',
        tags: [],
      });

      const { body } = await gql(
        server.address,
        `query GetRuleWithGroup($ruleId: ID!) {
          rule(id: $ruleId) {
            id
            name
            group {
              id
              name
              rulesCount
            }
          }
        }`,
        { ruleId: 'r-var' },
      );

      expect(body.errors).toBeUndefined();
      const rule = body.data!['rule'] as Record<string, unknown>;
      expect(rule['id']).toBe('r-var');
      const group = rule['group'] as Record<string, unknown>;
      expect(group['id']).toBe('g-var');
      expect(group['rulesCount']).toBe(1);
    });
  });
});
