import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildSchema, type GraphQLSchema } from 'graphql';

const SCHEMA_DIR = join(__dirname, '../../../../src/api/graphql/schema');
const TYPES_DIR = join(SCHEMA_DIR, 'types');

function loadSchema(): GraphQLSchema {
  const typeDefs: string[] = [];

  for (const file of readdirSync(TYPES_DIR).sort()) {
    if (file.endsWith('.graphql')) {
      typeDefs.push(readFileSync(join(TYPES_DIR, file), 'utf-8'));
    }
  }

  typeDefs.push(readFileSync(join(SCHEMA_DIR, 'schema.graphql'), 'utf-8'));

  return buildSchema(typeDefs.join('\n'));
}

describe('GraphQL Schema', () => {
  let schema: GraphQLSchema;

  it('parses and builds without errors', () => {
    schema = loadSchema();
    expect(schema).toBeDefined();
  });

  describe('root types', () => {
    it('defines Query type', () => {
      schema = loadSchema();
      const queryType = schema.getQueryType();
      expect(queryType).toBeDefined();
    });

    it('defines Mutation type', () => {
      schema = loadSchema();
      const mutationType = schema.getMutationType();
      expect(mutationType).toBeDefined();
    });

    it('defines Subscription type', () => {
      schema = loadSchema();
      const subscriptionType = schema.getSubscriptionType();
      expect(subscriptionType).toBeDefined();
    });
  });

  describe('Query fields', () => {
    const expectedQueries = [
      'rules', 'rule',
      'groups', 'group',
      'facts', 'fact', 'factsQuery',
      'timers', 'timer',
      'auditEntries',
      'ruleVersions', 'ruleVersion', 'ruleVersionDiff',
      'query',
      'health', 'stats', 'tracingStatus',
    ];

    it.each(expectedQueries)('has "%s" field', (field) => {
      schema = loadSchema();
      const fields = schema.getQueryType()!.getFields();
      expect(fields[field]).toBeDefined();
    });
  });

  describe('Mutation fields', () => {
    const expectedMutations = [
      'createRule', 'updateRule', 'deleteRule', 'enableRule', 'disableRule', 'rollbackRule',
      'createGroup', 'updateGroup', 'deleteGroup', 'enableGroup', 'disableGroup',
      'setFact', 'deleteFact',
      'emitEvent', 'emitCorrelatedEvent',
      'createTimer', 'cancelTimer',
      'enableTracing', 'disableTracing',
    ];

    it.each(expectedMutations)('has "%s" field', (field) => {
      schema = loadSchema();
      const fields = schema.getMutationType()!.getFields();
      expect(fields[field]).toBeDefined();
    });
  });

  describe('Subscription fields', () => {
    it('has engineEvent field', () => {
      schema = loadSchema();
      const fields = schema.getSubscriptionType()!.getFields();
      expect(fields['engineEvent']).toBeDefined();
    });

    it('has auditEvent field', () => {
      schema = loadSchema();
      const fields = schema.getSubscriptionType()!.getFields();
      expect(fields['auditEvent']).toBeDefined();
    });
  });

  describe('domain types', () => {
    const expectedTypes = [
      // Core domain
      'Rule', 'RuleGroup', 'Fact', 'Event', 'Timer',
      // Rule internals
      'RuleTrigger', 'RuleCondition', 'RuleAction',
      'ConditionSource', 'DataRequirement', 'LookupCacheConfig',
      // Temporal
      'TemporalPattern', 'EventMatcher',
      // Timer sub-types
      'TimerExpireConfig', 'TimerRepeatConfig',
      // Audit
      'AuditEntry', 'AuditQueryResult',
      // Versioning
      'RuleVersionEntry', 'RuleVersionQueryResult', 'RuleVersionDiff', 'RuleFieldChange',
      // Backward chaining
      'FactGoal', 'EventGoal', 'QueryResult',
      'FactExistsNode', 'RuleProofNode', 'ConditionProofNode', 'UnachievableNode',
      // Engine
      'HealthResponse', 'EngineInfo', 'EngineStats',
      'TracingStatus', 'TracingStats', 'ProfilingStats',
      'AuditLogStats', 'VersioningServiceStats', 'BaselineServiceStats',
      'SlowestRuleStats', 'HottestRuleStats', 'AuditCategoryCount',
      // Subscription
      'EngineEventPayload',
    ];

    it.each(expectedTypes)('defines "%s" type', (typeName) => {
      schema = loadSchema();
      expect(schema.getType(typeName)).toBeDefined();
    });
  });

  describe('union types', () => {
    it('defines Goal union', () => {
      schema = loadSchema();
      const goalType = schema.getType('Goal');
      expect(goalType).toBeDefined();
      expect(goalType!.astNode?.kind).toBe('UnionTypeDefinition');
    });

    it('defines ProofNode union', () => {
      schema = loadSchema();
      const proofType = schema.getType('ProofNode');
      expect(proofType).toBeDefined();
      expect(proofType!.astNode?.kind).toBe('UnionTypeDefinition');
    });
  });

  describe('enum types', () => {
    const expectedEnums: [string, string[]][] = [
      ['SortOrder', ['asc', 'desc']],
      ['TriggerType', ['fact', 'event', 'timer', 'temporal']],
      ['ConditionSourceType', ['fact', 'event', 'context', 'lookup', 'baseline']],
      ['ConditionOperator', [
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
        'in', 'not_in', 'contains', 'not_contains',
        'matches', 'exists', 'not_exists',
      ]],
      ['BaselineComparison', ['above', 'below', 'outside', 'above_percentile', 'below_percentile']],
      ['ActionType', [
        'set_fact', 'delete_fact', 'emit_event', 'set_timer',
        'cancel_timer', 'call_service', 'log', 'conditional',
      ]],
      ['LogLevel', ['debug', 'info', 'warn', 'error']],
      ['TemporalPatternType', ['sequence', 'absence', 'count', 'aggregate']],
      ['ThresholdComparison', ['gte', 'lte', 'eq']],
      ['AggregateFunction', ['sum', 'avg', 'min', 'max', 'count']],
      ['LookupErrorStrategy', ['skip', 'fail']],
      ['HealthStatus', ['ok', 'degraded', 'error']],
      ['AuditCategory', ['rule_management', 'rule_execution', 'fact_change', 'event_emitted', 'system']],
      ['AuditEventType', [
        'rule_registered', 'rule_unregistered', 'rule_enabled', 'rule_disabled', 'rule_rolled_back',
        'rule_executed', 'rule_skipped', 'rule_failed',
        'group_created', 'group_updated', 'group_deleted', 'group_enabled', 'group_disabled',
        'fact_created', 'fact_updated', 'fact_deleted',
        'event_emitted',
        'engine_started', 'engine_stopped',
        'hot_reload_started', 'hot_reload_completed', 'hot_reload_failed',
        'baseline_registered', 'baseline_recalculated', 'baseline_anomaly_detected',
        'backward_query_started', 'backward_query_completed',
      ]],
      ['RuleChangeType', ['registered', 'updated', 'enabled', 'disabled', 'unregistered', 'rolled_back']],
      ['GoalType', ['fact', 'event']],
      ['GoalOperator', ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']],
      ['UnachievableReason', ['no_rules', 'cycle_detected', 'max_depth', 'all_paths_failed']],
    ];

    it.each(expectedEnums)('defines "%s" enum with correct values', (enumName, values) => {
      schema = loadSchema();
      const enumType = schema.getType(enumName);
      expect(enumType).toBeDefined();
      expect(enumType!.astNode?.kind).toBe('EnumTypeDefinition');

      const enumValues = (enumType as import('graphql').GraphQLEnumType).getValues().map(v => v.name);
      expect(enumValues).toEqual(values);
    });
  });

  describe('input types', () => {
    const expectedInputs = [
      'CreateRuleInput', 'UpdateRuleInput',
      'RuleTriggerInput',
      'ConditionSourceInput', 'RuleConditionInput',
      'RuleActionInput',
      'TemporalPatternInput', 'EventMatcherInput',
      'DataRequirementInput', 'LookupCacheConfigInput',
      'CreateGroupInput', 'UpdateGroupInput',
      'EmitEventInput', 'EmitCorrelatedEventInput',
      'CreateTimerInput', 'TimerExpireInput', 'TimerRepeatInput',
      'AuditQueryInput',
      'RuleVersionQueryInput',
      'GoalInput',
    ];

    it.each(expectedInputs)('defines "%s" input type', (inputName) => {
      schema = loadSchema();
      const inputType = schema.getType(inputName);
      expect(inputType).toBeDefined();
      expect(inputType!.astNode?.kind).toBe('InputObjectTypeDefinition');
    });
  });

  describe('scalar types', () => {
    it('defines JSON scalar', () => {
      schema = loadSchema();
      expect(schema.getType('JSON')).toBeDefined();
    });

    it('defines Timestamp scalar', () => {
      schema = loadSchema();
      expect(schema.getType('Timestamp')).toBeDefined();
    });
  });

  describe('key field relationships', () => {
    it('Rule has group field resolver returning RuleGroup', () => {
      schema = loadSchema();
      const ruleType = schema.getType('Rule') as import('graphql').GraphQLObjectType;
      const groupField = ruleType.getFields()['group'];
      expect(groupField).toBeDefined();
    });

    it('Rule has versions field with pagination args', () => {
      schema = loadSchema();
      const ruleType = schema.getType('Rule') as import('graphql').GraphQLObjectType;
      const versionsField = ruleType.getFields()['versions'];
      expect(versionsField).toBeDefined();
      const argNames = versionsField.args.map(a => a.name);
      expect(argNames).toContain('limit');
      expect(argNames).toContain('offset');
    });

    it('Rule has auditEntries field with limit arg', () => {
      schema = loadSchema();
      const ruleType = schema.getType('Rule') as import('graphql').GraphQLObjectType;
      const auditField = ruleType.getFields()['auditEntries'];
      expect(auditField).toBeDefined();
      expect(auditField.args.map(a => a.name)).toContain('limit');
    });

    it('RuleGroup has rules and rulesCount field resolvers', () => {
      schema = loadSchema();
      const groupType = schema.getType('RuleGroup') as import('graphql').GraphQLObjectType;
      expect(groupType.getFields()['rules']).toBeDefined();
      expect(groupType.getFields()['rulesCount']).toBeDefined();
    });

    it('RuleProofNode has recursive ProofNode children', () => {
      schema = loadSchema();
      const ruleProofType = schema.getType('RuleProofNode') as import('graphql').GraphQLObjectType;
      const childrenField = ruleProofType.getFields()['children'];
      expect(childrenField).toBeDefined();
    });

    it('RuleAction supports recursive conditional actions', () => {
      schema = loadSchema();
      const actionType = schema.getType('RuleAction') as import('graphql').GraphQLObjectType;
      expect(actionType.getFields()['thenActions']).toBeDefined();
      expect(actionType.getFields()['elseActions']).toBeDefined();
      expect(actionType.getFields()['conditions']).toBeDefined();
    });
  });

  describe('subscription arguments', () => {
    it('engineEvent has patterns argument with default', () => {
      schema = loadSchema();
      const subType = schema.getSubscriptionType()!;
      const engineEventField = subType.getFields()['engineEvent'];
      const patternsArg = engineEventField.args.find(a => a.name === 'patterns');
      expect(patternsArg).toBeDefined();
      expect(patternsArg!.defaultValue).toEqual(['*']);
    });

    it('auditEvent has filter arguments', () => {
      schema = loadSchema();
      const subType = schema.getSubscriptionType()!;
      const auditEventField = subType.getFields()['auditEvent'];
      const argNames = auditEventField.args.map(a => a.name);
      expect(argNames).toContain('categories');
      expect(argNames).toContain('types');
      expect(argNames).toContain('ruleIds');
    });
  });
});
