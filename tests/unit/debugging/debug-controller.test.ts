import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TraceCollector } from '../../../src/debugging/trace-collector.js';
import { FactStore } from '../../../src/core/fact-store.js';
import {
  DebugController,
  type Breakpoint,
  type DebugSession,
  type Snapshot,
} from '../../../src/debugging/debug-controller.js';

describe('DebugController', () => {
  let traceCollector: TraceCollector;
  let factStore: FactStore;
  let controller: DebugController;

  beforeEach(() => {
    traceCollector = new TraceCollector({ enabled: true });
    factStore = new FactStore();
    controller = new DebugController(traceCollector, factStore);
  });

  afterEach(() => {
    controller.stop();
  });

  describe('session management', () => {
    it('should create a new session', () => {
      const session = controller.createSession();

      expect(session.id).toBeDefined();
      expect(session.paused).toBe(false);
      expect(session.breakpoints).toHaveLength(0);
      expect(session.snapshots).toHaveLength(0);
      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
      expect(session.totalHits).toBe(0);
    });

    it('should get session by id', () => {
      const session = controller.createSession();
      const retrieved = controller.getSession(session.id);

      expect(retrieved).toBe(session);
    });

    it('should return undefined for unknown session', () => {
      expect(controller.getSession('unknown-id')).toBeUndefined();
    });

    it('should get all sessions', () => {
      const session1 = controller.createSession();
      const session2 = controller.createSession();

      const sessions = controller.getSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions).toContain(session1);
      expect(sessions).toContain(session2);
    });

    it('should end session', () => {
      const session = controller.createSession();
      const result = controller.endSession(session.id);

      expect(result).toBe(true);
      expect(controller.getSession(session.id)).toBeUndefined();
    });

    it('should return false when ending unknown session', () => {
      expect(controller.endSession('unknown-id')).toBe(false);
    });
  });

  describe('breakpoint management', () => {
    let session: DebugSession;

    beforeEach(() => {
      session = controller.createSession();
    });

    it('should add breakpoint to session', () => {
      const breakpoint = controller.addBreakpoint(session.id, {
        type: 'rule',
        condition: { ruleId: 'test-rule' },
        action: 'log',
      });

      expect(breakpoint).toBeDefined();
      expect(breakpoint!.type).toBe('rule');
      expect(breakpoint!.condition.ruleId).toBe('test-rule');
      expect(breakpoint!.action).toBe('log');
      expect(breakpoint!.enabled).toBe(true);
      expect(breakpoint!.hitCount).toBe(0);
      expect(session.breakpoints).toHaveLength(1);
    });

    it('should add breakpoint with enabled=false', () => {
      const breakpoint = controller.addBreakpoint(session.id, {
        type: 'event',
        condition: { topic: 'order.*' },
        action: 'snapshot',
        enabled: false,
      });

      expect(breakpoint!.enabled).toBe(false);
    });

    it('should return undefined when adding to unknown session', () => {
      const result = controller.addBreakpoint('unknown-id', {
        type: 'rule',
        condition: {},
        action: 'log',
      });

      expect(result).toBeUndefined();
    });

    it('should remove breakpoint', () => {
      const breakpoint = controller.addBreakpoint(session.id, {
        type: 'rule',
        condition: {},
        action: 'log',
      });

      const result = controller.removeBreakpoint(session.id, breakpoint!.id);

      expect(result).toBe(true);
      expect(session.breakpoints).toHaveLength(0);
    });

    it('should return false when removing unknown breakpoint', () => {
      expect(controller.removeBreakpoint(session.id, 'unknown-bp')).toBe(false);
    });

    it('should enable breakpoint', () => {
      const breakpoint = controller.addBreakpoint(session.id, {
        type: 'rule',
        condition: {},
        action: 'log',
        enabled: false,
      });

      const result = controller.enableBreakpoint(session.id, breakpoint!.id);

      expect(result).toBe(true);
      expect(breakpoint!.enabled).toBe(true);
    });

    it('should disable breakpoint', () => {
      const breakpoint = controller.addBreakpoint(session.id, {
        type: 'rule',
        condition: {},
        action: 'log',
      });

      const result = controller.disableBreakpoint(session.id, breakpoint!.id);

      expect(result).toBe(true);
      expect(breakpoint!.enabled).toBe(false);
    });
  });

  describe('breakpoint matching', () => {
    let session: DebugSession;
    let hitCallback: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      hitCallback = vi.fn();
      controller.stop();
      controller = new DebugController(traceCollector, factStore, hitCallback);
      session = controller.createSession();
    });

    describe('rule breakpoints', () => {
      it('should match rule_triggered by ruleId', () => {
        controller.addBreakpoint(session.id, {
          type: 'rule',
          condition: { ruleId: 'test-rule' },
          action: 'log',
        });

        traceCollector.record('rule_triggered', { triggerType: 'event' }, {
          ruleId: 'test-rule',
          ruleName: 'Test Rule',
        });

        expect(hitCallback).toHaveBeenCalledTimes(1);
        expect(session.breakpoints[0]!.hitCount).toBe(1);
        expect(session.totalHits).toBe(1);
      });

      it('should not match different ruleId', () => {
        controller.addBreakpoint(session.id, {
          type: 'rule',
          condition: { ruleId: 'test-rule' },
          action: 'log',
        });

        traceCollector.record('rule_triggered', { triggerType: 'event' }, {
          ruleId: 'other-rule',
          ruleName: 'Other Rule',
        });

        expect(hitCallback).not.toHaveBeenCalled();
      });

      it('should match any rule when no ruleId specified', () => {
        controller.addBreakpoint(session.id, {
          type: 'rule',
          condition: {},
          action: 'log',
        });

        traceCollector.record('rule_executed', { actionsCount: 1 }, {
          ruleId: 'any-rule',
        });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should match rule_skipped events', () => {
        controller.addBreakpoint(session.id, {
          type: 'rule',
          condition: { ruleId: 'test-rule' },
          action: 'log',
        });

        traceCollector.record('rule_skipped', { reason: 'conditions_not_met' }, {
          ruleId: 'test-rule',
        });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });
    });

    describe('event breakpoints', () => {
      it('should match event by topic', () => {
        controller.addBreakpoint(session.id, {
          type: 'event',
          condition: { topic: 'order.created' },
          action: 'log',
        });

        traceCollector.record('event_emitted', {
          eventId: 'evt-1',
          topic: 'order.created',
          data: {},
        });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should match wildcard topic pattern', () => {
        controller.addBreakpoint(session.id, {
          type: 'event',
          condition: { topic: 'order.*' },
          action: 'log',
        });

        traceCollector.record('event_emitted', {
          eventId: 'evt-1',
          topic: 'order.created',
          data: {},
        });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should match double wildcard topic', () => {
        controller.addBreakpoint(session.id, {
          type: 'event',
          condition: { topic: '**' },
          action: 'log',
        });

        traceCollector.record('event_emitted', {
          eventId: 'evt-1',
          topic: 'some.deep.topic',
          data: {},
        });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should not match non-matching topic', () => {
        controller.addBreakpoint(session.id, {
          type: 'event',
          condition: { topic: 'order.created' },
          action: 'log',
        });

        traceCollector.record('event_emitted', {
          eventId: 'evt-1',
          topic: 'user.created',
          data: {},
        });

        expect(hitCallback).not.toHaveBeenCalled();
      });
    });

    describe('fact breakpoints', () => {
      it('should match fact change by pattern', () => {
        controller.addBreakpoint(session.id, {
          type: 'fact',
          condition: { factPattern: 'user:*' },
          action: 'log',
        });

        traceCollector.record('fact_changed', {
          key: 'user:123',
          previousValue: null,
          newValue: { name: 'John' },
        });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should match exact fact key', () => {
        controller.addBreakpoint(session.id, {
          type: 'fact',
          condition: { factPattern: 'counter' },
          action: 'log',
        });

        traceCollector.record('fact_changed', {
          key: 'counter',
          previousValue: 0,
          newValue: 1,
        });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should not match non-matching pattern', () => {
        controller.addBreakpoint(session.id, {
          type: 'fact',
          condition: { factPattern: 'user:*' },
          action: 'log',
        });

        traceCollector.record('fact_changed', {
          key: 'order:123',
          previousValue: null,
          newValue: {},
        });

        expect(hitCallback).not.toHaveBeenCalled();
      });
    });

    describe('action breakpoints', () => {
      it('should match action by type', () => {
        controller.addBreakpoint(session.id, {
          type: 'action',
          condition: { actionType: 'emit_event' },
          action: 'log',
        });

        traceCollector.record('action_started', {
          actionIndex: 0,
          actionType: 'emit_event',
          input: {},
        }, { ruleId: 'test-rule' });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should match action_completed', () => {
        controller.addBreakpoint(session.id, {
          type: 'action',
          condition: { actionType: 'set_fact' },
          action: 'log',
        });

        traceCollector.record('action_completed', {
          actionIndex: 0,
          actionType: 'set_fact',
          output: { key: 'test' },
        }, { ruleId: 'test-rule', durationMs: 5 });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should match action_failed', () => {
        controller.addBreakpoint(session.id, {
          type: 'action',
          condition: { ruleId: 'failing-rule' },
          action: 'log',
        });

        traceCollector.record('action_failed', {
          actionIndex: 0,
          actionType: 'call_service',
          error: 'Service unavailable',
        }, { ruleId: 'failing-rule', durationMs: 100 });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });

      it('should filter by ruleId and actionType', () => {
        controller.addBreakpoint(session.id, {
          type: 'action',
          condition: { ruleId: 'test-rule', actionType: 'emit_event' },
          action: 'log',
        });

        // Should match
        traceCollector.record('action_started', {
          actionIndex: 0,
          actionType: 'emit_event',
          input: {},
        }, { ruleId: 'test-rule' });

        // Should not match - wrong ruleId
        traceCollector.record('action_started', {
          actionIndex: 0,
          actionType: 'emit_event',
          input: {},
        }, { ruleId: 'other-rule' });

        // Should not match - wrong actionType
        traceCollector.record('action_started', {
          actionIndex: 0,
          actionType: 'set_fact',
          input: {},
        }, { ruleId: 'test-rule' });

        expect(hitCallback).toHaveBeenCalledTimes(1);
      });
    });

    it('should not trigger disabled breakpoints', () => {
      controller.addBreakpoint(session.id, {
        type: 'rule',
        condition: {},
        action: 'log',
        enabled: false,
      });

      traceCollector.record('rule_triggered', { triggerType: 'event' }, {
        ruleId: 'test-rule',
      });

      expect(hitCallback).not.toHaveBeenCalled();
    });
  });

  describe('breakpoint actions', () => {
    let session: DebugSession;

    beforeEach(() => {
      session = controller.createSession();
    });

    it('should take snapshot on snapshot action', () => {
      factStore.set('test-key', 'test-value', 'test');

      controller.addBreakpoint(session.id, {
        type: 'event',
        condition: { topic: 'test.event' },
        action: 'snapshot',
      });

      traceCollector.record('event_emitted', {
        eventId: 'evt-1',
        topic: 'test.event',
        data: {},
      });

      expect(session.snapshots).toHaveLength(1);
      expect(session.snapshots[0]!.facts).toContainEqual({
        key: 'test-key',
        value: 'test-value',
      });
    });
  });

  describe('snapshots', () => {
    let session: DebugSession;

    beforeEach(() => {
      session = controller.createSession();
    });

    it('should take snapshot manually', () => {
      factStore.set('fact1', 'value1', 'test');
      factStore.set('fact2', 'value2', 'test');

      const snapshot = controller.takeSnapshot(session.id);

      expect(snapshot).toBeDefined();
      expect(snapshot!.id).toBeDefined();
      expect(snapshot!.timestamp).toBeLessThanOrEqual(Date.now());
      expect(snapshot!.facts).toHaveLength(2);
      expect(session.snapshots).toHaveLength(1);
    });

    it('should take snapshot with label', () => {
      const snapshot = controller.takeSnapshot(session.id, 'Before change');

      expect(snapshot!.label).toBe('Before change');
    });

    it('should include recent traces in snapshot', () => {
      traceCollector.record('fact_changed', { key: 'test', newValue: 1 });
      traceCollector.record('event_emitted', { eventId: 'e1', topic: 'test' });

      const snapshot = controller.takeSnapshot(session.id);

      expect(snapshot!.recentTraces.length).toBeGreaterThanOrEqual(2);
    });

    it('should return undefined for unknown session', () => {
      expect(controller.takeSnapshot('unknown-id')).toBeUndefined();
    });

    it('should get snapshot by id', () => {
      const snapshot = controller.takeSnapshot(session.id);
      const retrieved = controller.getSnapshot(session.id, snapshot!.id);

      expect(retrieved).toBe(snapshot);
    });

    it('should return undefined for unknown snapshot', () => {
      expect(controller.getSnapshot(session.id, 'unknown-snap')).toBeUndefined();
    });

    it('should clear snapshots', () => {
      controller.takeSnapshot(session.id);
      controller.takeSnapshot(session.id);
      expect(session.snapshots).toHaveLength(2);

      const result = controller.clearSnapshots(session.id);

      expect(result).toBe(true);
      expect(session.snapshots).toHaveLength(0);
    });
  });

  describe('pause/resume in development mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should allow pause breakpoints in development', () => {
      const session = controller.createSession();

      expect(() => {
        controller.addBreakpoint(session.id, {
          type: 'rule',
          condition: {},
          action: 'pause',
        });
      }).not.toThrow();
    });

    it('should resume paused session', () => {
      const session = controller.createSession();
      session.paused = true;

      const result = controller.resume(session.id);

      expect(result).toBe(true);
      expect(session.paused).toBe(false);
    });

    it('should step through paused session', () => {
      const session = controller.createSession();
      session.paused = true;

      const result = controller.step(session.id);

      expect(result).toBe(true);
      expect(session.paused).toBe(false);
    });

    it('should return false for resume on non-paused session', () => {
      const session = controller.createSession();

      const result = controller.resume(session.id);

      expect(result).toBe(false);
    });
  });

  describe('pause/resume in production mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      controller.stop();
      controller = new DebugController(traceCollector, factStore);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should reject pause breakpoints in production', () => {
      const session = controller.createSession();

      expect(() => {
        controller.addBreakpoint(session.id, {
          type: 'rule',
          condition: {},
          action: 'pause',
        });
      }).toThrow('Pause breakpoints are not allowed in production mode');
    });

    it('should return false for resume in production', () => {
      const session = controller.createSession();
      session.paused = true;

      const result = controller.resume(session.id);

      expect(result).toBe(false);
    });

    it('should return false for step in production', () => {
      const session = controller.createSession();
      session.paused = true;

      const result = controller.step(session.id);

      expect(result).toBe(false);
    });

    it('should allow log breakpoints in production', () => {
      const session = controller.createSession();

      expect(() => {
        controller.addBreakpoint(session.id, {
          type: 'rule',
          condition: {},
          action: 'log',
        });
      }).not.toThrow();
    });

    it('should allow snapshot breakpoints in production', () => {
      const session = controller.createSession();

      expect(() => {
        controller.addBreakpoint(session.id, {
          type: 'event',
          condition: {},
          action: 'snapshot',
        });
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should stop and cleanup all sessions', () => {
      const session1 = controller.createSession();
      const session2 = controller.createSession();

      controller.stop();

      expect(controller.getSessions()).toHaveLength(0);
    });

    it('should resume paused sessions on stop', () => {
      const session = controller.createSession();
      session.paused = true;

      controller.stop();

      expect(session.paused).toBe(false);
    });

    it('should track paused state', () => {
      expect(controller.isPaused()).toBe(false);

      const session = controller.createSession();
      session.paused = true;

      expect(controller.isPaused()).toBe(true);
    });
  });

  describe('multiple sessions', () => {
    it('should handle breakpoints in multiple sessions', () => {
      const hitCallback = vi.fn();
      controller.stop();
      controller = new DebugController(traceCollector, factStore, hitCallback);

      const session1 = controller.createSession();
      const session2 = controller.createSession();

      controller.addBreakpoint(session1.id, {
        type: 'rule',
        condition: { ruleId: 'rule-1' },
        action: 'log',
      });

      controller.addBreakpoint(session2.id, {
        type: 'rule',
        condition: { ruleId: 'rule-2' },
        action: 'log',
      });

      traceCollector.record('rule_triggered', { triggerType: 'event' }, {
        ruleId: 'rule-1',
      });

      expect(hitCallback).toHaveBeenCalledTimes(1);
      expect(session1.totalHits).toBe(1);
      expect(session2.totalHits).toBe(0);
    });

    it('should trigger breakpoints in both sessions if both match', () => {
      const hitCallback = vi.fn();
      controller.stop();
      controller = new DebugController(traceCollector, factStore, hitCallback);

      const session1 = controller.createSession();
      const session2 = controller.createSession();

      controller.addBreakpoint(session1.id, {
        type: 'rule',
        condition: {},
        action: 'log',
      });

      controller.addBreakpoint(session2.id, {
        type: 'rule',
        condition: {},
        action: 'log',
      });

      traceCollector.record('rule_triggered', { triggerType: 'event' }, {
        ruleId: 'any-rule',
      });

      expect(hitCallback).toHaveBeenCalledTimes(2);
      expect(session1.totalHits).toBe(1);
      expect(session2.totalHits).toBe(1);
    });
  });
});
