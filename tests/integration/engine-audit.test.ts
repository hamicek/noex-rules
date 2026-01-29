import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';
import type { AuditEntry } from '../../src/audit/types';

const createTestRule = (id: string, overrides: Partial<RuleInput> = {}): RuleInput => ({
  id,
  name: `Rule ${id}`,
  priority: 100,
  enabled: true,
  tags: ['test'],
  trigger: { type: 'event', topic: `test.${id}` },
  conditions: [],
  actions: [{ type: 'set_fact', key: `executed:${id}`, value: true }],
  ...overrides,
});

describe('RuleEngine Audit Integration', () => {
  let adapter: MemoryAdapter;
  let engine: RuleEngine;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    engine = await RuleEngine.start({
      name: 'audit-test',
      audit: { adapter, flushIntervalMs: 0 },
    });
  });

  afterEach(async () => {
    await engine.stop();
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe('engine lifecycle', () => {
    it('records engine_started on start', () => {
      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['engine_started'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.type).toBe('engine_started');
      expect(result.entries[0]!.details).toMatchObject({ name: 'audit-test' });
    });

    it('records engine_stopped on stop', async () => {
      await engine.stop();
      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['engine_stopped'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.type).toBe('engine_stopped');
      expect(result.entries[0]!.details).toMatchObject({ name: 'audit-test' });
    });

    it('flushes audit entries to adapter on stop', async () => {
      engine.registerRule(createTestRule('flush-rule'));
      await engine.stop();

      const keys = await adapter.listKeys('audit-log:');
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Rule management
  // ---------------------------------------------------------------------------

  describe('rule management', () => {
    it('records rule_registered', () => {
      const rule = engine.registerRule(createTestRule('reg-1'));
      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_registered'] });

      expect(result.totalCount).toBe(1);
      const entry = result.entries[0]!;
      expect(entry.ruleId).toBe(rule.id);
      expect(entry.ruleName).toBe(rule.name);
      expect(entry.details).toMatchObject({
        trigger: rule.trigger,
        conditionsCount: 0,
        actionsCount: 1,
      });
    });

    it('records rule_unregistered', () => {
      const rule = engine.registerRule(createTestRule('unreg-1'));
      engine.unregisterRule(rule.id);

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_unregistered'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.ruleId).toBe(rule.id);
      expect(result.entries[0]!.ruleName).toBe(rule.name);
    });

    it('does not record rule_unregistered for nonexistent rule', () => {
      engine.unregisterRule('nonexistent');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_unregistered'] });
      expect(result.totalCount).toBe(0);
    });

    it('records rule_disabled', () => {
      const rule = engine.registerRule(createTestRule('dis-1'));
      engine.disableRule(rule.id);

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_disabled'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.ruleId).toBe(rule.id);
    });

    it('records rule_enabled', () => {
      const rule = engine.registerRule(createTestRule('en-1'));
      engine.disableRule(rule.id);
      engine.enableRule(rule.id);

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_enabled'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.ruleId).toBe(rule.id);
    });

    it('does not record enable for nonexistent rule', () => {
      engine.enableRule('nonexistent');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_enabled'] });
      expect(result.totalCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Fact changes
  // ---------------------------------------------------------------------------

  describe('fact changes', () => {
    it('records fact_created for new fact', async () => {
      await engine.setFact('temperature', 42);

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['fact_created'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.details).toMatchObject({
        key: 'temperature',
        value: 42,
      });
      expect(result.entries[0]!.details).not.toHaveProperty('previousValue');
    });

    it('records fact_updated when overwriting existing fact', async () => {
      await engine.setFact('temperature', 20);
      await engine.setFact('temperature', 35);

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['fact_updated'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.details).toMatchObject({
        key: 'temperature',
        value: 35,
        previousValue: 20,
      });
    });

    it('records fact_deleted', async () => {
      await engine.setFact('temp', 'warm');
      engine.deleteFact('temp');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['fact_deleted'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.details).toMatchObject({
        key: 'temp',
        lastValue: 'warm',
      });
    });

    it('does not record fact_deleted for nonexistent fact', () => {
      engine.deleteFact('nope');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['fact_deleted'] });
      expect(result.totalCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  describe('event emission', () => {
    it('records event_emitted for emitted event', async () => {
      await engine.emit('order.created', { orderId: 'o1' });

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['event_emitted'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.details).toMatchObject({
        topic: 'order.created',
        data: { orderId: 'o1' },
      });
    });

    it('records event_emitted with correlationId from correlated emit', async () => {
      await engine.emitCorrelated('order.shipped', { trackingId: 't1' }, 'corr-abc');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['event_emitted'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.correlationId).toBe('corr-abc');
    });
  });

  // ---------------------------------------------------------------------------
  // Rule execution
  // ---------------------------------------------------------------------------

  describe('rule execution', () => {
    it('records rule_executed when rule fires', async () => {
      engine.registerRule(createTestRule('exec-1'));
      await engine.emit('test.exec-1', { payload: true });

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_executed'] });

      expect(result.totalCount).toBe(1);
      const entry = result.entries[0]!;
      expect(entry.ruleId).toBe('exec-1');
      expect(entry.ruleName).toBe('Rule exec-1');
      expect(entry.details).toMatchObject({
        actionsCount: 1,
        triggerType: 'event',
      });
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('records rule_skipped when conditions not met', async () => {
      engine.registerRule(createTestRule('skip-1', {
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [{ source: { type: 'event', field: 'amount' }, operator: 'gt', value: 100 }],
      }));

      await engine.emit('order.created', { amount: 50 });

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_skipped'] });

      expect(result.totalCount).toBe(1);
      const entry = result.entries[0]!;
      expect(entry.ruleId).toBe('skip-1');
      expect(entry.details).toMatchObject({
        reason: 'conditions_not_met',
        triggerType: 'event',
      });
    });

    it('records rule_executed even when action fails internally', async () => {
      // ActionExecutor catches action errors internally, so the rule
      // is still considered "executed" (not "failed"). rule_failed
      // is reserved for truly unexpected errors outside the executor.
      engine.registerRule(createTestRule('action-err', {
        actions: [{
          type: 'call_service',
          service: 'nonexistent_service',
          method: 'doSomething',
          args: [],
        }],
      }));

      await engine.emit('test.action-err', {});

      const auditLog = engine.getAuditLog()!;

      const executed = auditLog.query({ types: ['rule_executed'] });
      expect(executed.totalCount).toBe(1);
      expect(executed.entries[0]!.ruleId).toBe('action-err');

      const failed = auditLog.query({ types: ['rule_failed'] });
      expect(failed.totalCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  describe('category filtering', () => {
    it('groups audit entries by correct categories', async () => {
      engine.registerRule(createTestRule('cat-1'));
      await engine.setFact('x', 1);
      await engine.emit('test.cat-1', {});

      const auditLog = engine.getAuditLog()!;

      const mgmt = auditLog.query({ category: 'rule_management' });
      expect(mgmt.totalCount).toBeGreaterThanOrEqual(1);

      const facts = auditLog.query({ category: 'fact_change' });
      expect(facts.totalCount).toBeGreaterThanOrEqual(1);

      const events = auditLog.query({ category: 'event_emitted' });
      expect(events.totalCount).toBeGreaterThanOrEqual(1);

      const execution = auditLog.query({ category: 'rule_execution' });
      expect(execution.totalCount).toBeGreaterThanOrEqual(1);

      const system = auditLog.query({ category: 'system' });
      expect(system.totalCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats & accessor
  // ---------------------------------------------------------------------------

  describe('getStats and getAuditLog', () => {
    it('includes audit stats in engine stats', async () => {
      await engine.setFact('a', 1);
      const stats = engine.getStats();

      expect(stats.audit).toBeDefined();
      expect(stats.audit!.totalEntries).toBeGreaterThan(0);
      expect(stats.audit!.memoryEntries).toBeGreaterThan(0);
    });

    it('getAuditLog returns service when configured', () => {
      expect(engine.getAuditLog()).not.toBeNull();
    });

    it('getAuditLog returns null when not configured', async () => {
      const noAuditEngine = await RuleEngine.start({ name: 'no-audit' });
      expect(noAuditEngine.getAuditLog()).toBeNull();

      const stats = noAuditEngine.getStats();
      expect(stats.audit).toBeUndefined();

      await noAuditEngine.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Subscriber integration
  // ---------------------------------------------------------------------------

  describe('real-time subscribers', () => {
    it('subscribers receive entries from engine operations', async () => {
      const received: AuditEntry[] = [];
      const auditLog = engine.getAuditLog()!;
      const unsub = auditLog.subscribe((entry) => received.push(entry));

      engine.registerRule(createTestRule('sub-1'));
      await engine.setFact('x', 1);
      await engine.emit('test.sub-1', {});

      unsub();

      expect(received.length).toBeGreaterThanOrEqual(3);
      const types = received.map(e => e.type);
      expect(types).toContain('rule_registered');
      expect(types).toContain('fact_created');
      expect(types).toContain('event_emitted');
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence round-trip
  // ---------------------------------------------------------------------------

  describe('persistence', () => {
    it('persists entries to adapter and allows query after flush', async () => {
      engine.registerRule(createTestRule('persist-1'));
      await engine.setFact('data', 'value');

      const auditLog = engine.getAuditLog()!;
      await auditLog.flush();

      const keys = await adapter.listKeys('audit-log:');
      expect(keys.length).toBeGreaterThan(0);

      const bucket = await adapter.load(keys[0]!);
      expect(bucket).toBeDefined();
      expect((bucket!.state as { entries: AuditEntry[] }).entries.length).toBeGreaterThan(0);
    });
  });
});
