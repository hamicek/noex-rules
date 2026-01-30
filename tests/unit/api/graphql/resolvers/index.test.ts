import { describe, it, expect } from 'vitest';
import { resolvers } from '../../../../../src/api/graphql/resolvers/index';

describe('resolvers index (merge)', () => {
  it('has Query with all expected fields', () => {
    const queryFields = Object.keys(resolvers['Query']!);

    expect(queryFields).toContain('rules');
    expect(queryFields).toContain('rule');
    expect(queryFields).toContain('groups');
    expect(queryFields).toContain('group');
    expect(queryFields).toContain('facts');
    expect(queryFields).toContain('fact');
    expect(queryFields).toContain('factsQuery');
    expect(queryFields).toContain('timers');
    expect(queryFields).toContain('timer');
    expect(queryFields).toContain('health');
    expect(queryFields).toContain('stats');
    expect(queryFields).toContain('tracingStatus');
    // Audit
    expect(queryFields).toContain('auditEntries');
    // Versions
    expect(queryFields).toContain('ruleVersions');
    expect(queryFields).toContain('ruleVersion');
    expect(queryFields).toContain('ruleVersionDiff');
    // Backward chaining
    expect(queryFields).toContain('query');
  });

  it('has Mutation with all expected fields', () => {
    const mutationFields = Object.keys(resolvers['Mutation']!);

    expect(mutationFields).toContain('createRule');
    expect(mutationFields).toContain('updateRule');
    expect(mutationFields).toContain('deleteRule');
    expect(mutationFields).toContain('enableRule');
    expect(mutationFields).toContain('disableRule');
    expect(mutationFields).toContain('createGroup');
    expect(mutationFields).toContain('updateGroup');
    expect(mutationFields).toContain('deleteGroup');
    expect(mutationFields).toContain('enableGroup');
    expect(mutationFields).toContain('disableGroup');
    expect(mutationFields).toContain('setFact');
    expect(mutationFields).toContain('deleteFact');
    expect(mutationFields).toContain('emitEvent');
    expect(mutationFields).toContain('emitCorrelatedEvent');
    expect(mutationFields).toContain('createTimer');
    expect(mutationFields).toContain('cancelTimer');
    expect(mutationFields).toContain('enableTracing');
    expect(mutationFields).toContain('disableTracing');
    // Versions
    expect(mutationFields).toContain('rollbackRule');
  });

  it('has union type resolvers', () => {
    expect(resolvers['Goal']).toBeDefined();
    expect(resolvers['Goal']!['__resolveType']).toBeTypeOf('function');

    expect(resolvers['ProofNode']).toBeDefined();
    expect(resolvers['ProofNode']!['__resolveType']).toBeTypeOf('function');
  });

  it('has Rule type resolvers', () => {
    const ruleFields = Object.keys(resolvers['Rule']!);

    expect(ruleFields).toContain('groupId');
    expect(ruleFields).toContain('group');
    expect(ruleFields).toContain('versions');
    expect(ruleFields).toContain('auditEntries');
  });

  it('has RuleGroup type resolvers', () => {
    const groupFields = Object.keys(resolvers['RuleGroup']!);

    expect(groupFields).toContain('rules');
    expect(groupFields).toContain('rulesCount');
  });
});
