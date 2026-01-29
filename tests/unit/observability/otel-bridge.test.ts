import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraceCollector } from '../../../src/debugging/trace-collector.js';
import { OpenTelemetryBridge } from '../../../src/observability/otel-bridge.js';
import type { OTelApi, OTelSpan, OTelTracer, OTelContext } from '../../../src/observability/otel-bridge.js';

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function createMockSpan(): OTelSpan & {
  setAttribute: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  const span: OTelSpan & {
    setAttribute: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  } = {
    setAttribute: vi.fn().mockReturnThis(),
    setStatus: vi.fn().mockReturnThis(),
    end: vi.fn(),
  };
  return span;
}

function createMockOTelApi(): {
  api: OTelApi;
  tracer: OTelTracer & { startSpan: ReturnType<typeof vi.fn> };
  context: OTelContext;
  spans: ReturnType<typeof createMockSpan>[];
} {
  const spans: ReturnType<typeof createMockSpan>[] = [];
  const context: OTelContext = {};

  const tracer: OTelTracer & { startSpan: ReturnType<typeof vi.fn> } = {
    startSpan: vi.fn().mockImplementation(() => {
      const span = createMockSpan();
      spans.push(span);
      return span;
    }),
  };

  const api: OTelApi = {
    trace: {
      getTracer: vi.fn().mockReturnValue(tracer),
      setSpan: vi.fn().mockReturnValue(context),
    },
    context: {
      active: vi.fn().mockReturnValue(context),
    },
    SpanStatusCode: {
      UNSET: 0,
      OK: 1,
      ERROR: 2,
    },
  };

  return { api, tracer, context, spans };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenTelemetryBridge', () => {
  let trace: TraceCollector;
  let bridge: OpenTelemetryBridge;
  let mock: ReturnType<typeof createMockOTelApi>;

  beforeEach(() => {
    trace = new TraceCollector({ enabled: true });
    mock = createMockOTelApi();
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('returns true when OTel API loads successfully', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      const result = await bridge.start(trace);

      expect(result).toBe(true);
      expect(bridge.isActive).toBe(true);
    });

    it('returns false when OTel API import fails', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.reject(new Error('not found')));
      const result = await bridge.start(trace);

      expect(result).toBe(false);
      expect(bridge.isActive).toBe(false);
    });

    it('auto-enables tracing on TraceCollector if not already enabled', async () => {
      const disabledTrace = new TraceCollector({ enabled: false });
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));

      await bridge.start(disabledTrace);

      expect(disabledTrace.isEnabled()).toBe(true);
    });

    it('does not disable already-enabled tracing', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      expect(trace.isEnabled()).toBe(true);
    });

    it('creates tracer with configured serviceName', async () => {
      bridge = new OpenTelemetryBridge(
        { serviceName: 'my-rules' },
        () => Promise.resolve(mock.api),
      );
      await bridge.start(trace);

      expect(mock.api.trace.getTracer).toHaveBeenCalledWith('my-rules', '0.1.0');
    });

    it('uses default serviceName when not configured', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      expect(mock.api.trace.getTracer).toHaveBeenCalledWith('noex-rules', '0.1.0');
    });

    it('stop() unsubscribes from TraceCollector', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      expect(bridge.isActive).toBe(true);

      bridge.stop();

      expect(bridge.isActive).toBe(false);

      // Nové entries by neměly generovat spany
      trace.record('event_emitted', { topic: 'test' }, { correlationId: 'c1' });
      expect(mock.spans).toHaveLength(0);
    });

    it('stop() is safe to call multiple times', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      bridge.stop();
      bridge.stop();

      expect(bridge.isActive).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Event processing spans
  // -------------------------------------------------------------------------

  describe('event_emitted → event_processing span', () => {
    beforeEach(async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);
    });

    it('creates event_processing span with correlation_id attribute', () => {
      trace.record('event_emitted', { topic: 'order.created' }, { correlationId: 'corr-1' });

      expect(mock.tracer.startSpan).toHaveBeenCalledWith(
        'event_processing',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'noex.correlation_id': 'corr-1',
            'noex.event.topic': 'order.created',
          }),
        }),
      );
    });

    it('does not create span when correlationId is missing', () => {
      trace.record('event_emitted', { topic: 'test' });

      expect(mock.tracer.startSpan).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Rule evaluation spans
  // -------------------------------------------------------------------------

  describe('rule_triggered → rule_evaluation span', () => {
    beforeEach(async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);
    });

    it('creates rule_evaluation span with rule attributes', () => {
      trace.record('rule_triggered', {}, {
        ruleId: 'r1',
        ruleName: 'My Rule',
        correlationId: 'c1',
      });

      expect(mock.tracer.startSpan).toHaveBeenCalledWith(
        'rule_evaluation',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'noex.rule.id': 'r1',
            'noex.rule.name': 'My Rule',
            'noex.correlation_id': 'c1',
          }),
        }),
        expect.anything(), // parent context
      );
    });

    it('sets parent context from correlation span', () => {
      // Nejdřív vytvoříme event_processing span
      trace.record('event_emitted', { topic: 'test' }, { correlationId: 'c1' });

      // Pak rule triggered
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });

      // Oba startSpan volání — druhé by mělo mít parent context
      expect(mock.tracer.startSpan).toHaveBeenCalledTimes(2);
      const ruleCall = mock.tracer.startSpan.mock.calls[1]!;
      expect(ruleCall[2]).toBe(mock.context); // parent context z setSpan
    });

    it('does not create span when ruleId is missing', () => {
      trace.record('rule_triggered', {}, { correlationId: 'c1' });

      expect(mock.tracer.startSpan).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Rule finished (executed / skipped)
  // -------------------------------------------------------------------------

  describe('rule_executed / rule_skipped', () => {
    beforeEach(async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);
    });

    it('ends rule span with OK status on rule_executed', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      const ruleSpan = mock.spans[0]!;

      trace.record('rule_executed', { actionsCount: 1 }, { ruleId: 'r1', correlationId: 'c1' });

      expect(ruleSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
      expect(ruleSpan.end).toHaveBeenCalled();
    });

    it('ends rule span with skipped attribute on rule_skipped', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      const ruleSpan = mock.spans[0]!;

      trace.record('rule_skipped', { reason: 'conditions_not_met' }, {
        ruleId: 'r1',
        correlationId: 'c1',
      });

      expect(ruleSpan.setAttribute).toHaveBeenCalledWith('noex.rule.skipped', true);
      expect(ruleSpan.setAttribute).toHaveBeenCalledWith(
        'noex.rule.skip_reason',
        'conditions_not_met',
      );
      expect(ruleSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
      expect(ruleSpan.end).toHaveBeenCalled();
    });

    it('ends correlation span when last rule finishes', () => {
      trace.record('event_emitted', { topic: 't' }, { correlationId: 'c1' });
      const eventSpan = mock.spans[0]!;

      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      trace.record('rule_triggered', {}, { ruleId: 'r2', correlationId: 'c1' });

      // Zatím correlation span by neměl být ukončen
      expect(eventSpan.end).not.toHaveBeenCalled();

      trace.record('rule_executed', {}, { ruleId: 'r1', correlationId: 'c1' });

      // Stále ne — zbývá r2
      expect(eventSpan.end).not.toHaveBeenCalled();

      trace.record('rule_executed', {}, { ruleId: 'r2', correlationId: 'c1' });

      // Teď by měl být ukončen
      expect(eventSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
      expect(eventSpan.end).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Action spans
  // -------------------------------------------------------------------------

  describe('action_started → action_execution span', () => {
    beforeEach(async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);
    });

    it('creates action_execution span with attributes', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });

      trace.record('action_started', {
        actionIndex: 0,
        actionType: 'set_fact',
        input: { key: 'x' },
      }, { ruleId: 'r1', correlationId: 'c1' });

      expect(mock.tracer.startSpan).toHaveBeenCalledWith(
        'action_execution',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'noex.action.type': 'set_fact',
            'noex.action.index': 0,
            'noex.rule.id': 'r1',
          }),
        }),
        expect.anything(), // parent context z rule span
      );
    });

    it('ends action span with OK on action_completed', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      trace.record('action_started', { actionIndex: 0, actionType: 'set_fact' }, {
        ruleId: 'r1', correlationId: 'c1',
      });

      const actionSpan = mock.spans[1]!; // [0]=rule, [1]=action

      trace.record('action_completed', {
        actionIndex: 0,
        actionType: 'set_fact',
        output: true,
      }, { ruleId: 'r1', correlationId: 'c1', durationMs: 5 });

      expect(actionSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
      expect(actionSpan.end).toHaveBeenCalled();
    });

    it('ends action span with ERROR on action_failed', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      trace.record('action_started', { actionIndex: 0, actionType: 'call_service' }, {
        ruleId: 'r1', correlationId: 'c1',
      });

      const actionSpan = mock.spans[1]!;

      trace.record('action_failed', {
        actionIndex: 0,
        actionType: 'call_service',
        error: 'Service not found',
      }, { ruleId: 'r1', correlationId: 'c1', durationMs: 2 });

      expect(actionSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // ERROR
        message: 'Service not found',
      });
      expect(actionSpan.end).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Condition evaluation spans (opt-in)
  // -------------------------------------------------------------------------

  describe('condition_evaluated → condition_evaluation span', () => {
    it('does not create span when traceConditions is false (default)', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      trace.record('condition_evaluated', {
        conditionIndex: 0,
        passed: true,
      }, { ruleId: 'r1', correlationId: 'c1', durationMs: 1 });

      // Jen rule_triggered span, žádný condition span
      expect(mock.spans).toHaveLength(1);
    });

    it('creates condition span when traceConditions is true', async () => {
      bridge = new OpenTelemetryBridge(
        { traceConditions: true },
        () => Promise.resolve(mock.api),
      );
      await bridge.start(trace);

      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      trace.record('condition_evaluated', {
        conditionIndex: 0,
        passed: true,
      }, { ruleId: 'r1', correlationId: 'c1', durationMs: 1 });

      // rule_triggered + condition_evaluated = 2 spans
      expect(mock.spans).toHaveLength(2);

      const condSpan = mock.spans[1]!;
      expect(mock.tracer.startSpan).toHaveBeenCalledWith(
        'condition_evaluation',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'noex.condition.index': 0,
            'noex.condition.passed': true,
            'noex.rule.id': 'r1',
          }),
        }),
        expect.anything(),
      );

      // Condition spany se okamžitě ukončují
      expect(condSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
      expect(condSpan.end).toHaveBeenCalled();
    });

    it('creates condition span with passed=false', async () => {
      bridge = new OpenTelemetryBridge(
        { traceConditions: true },
        () => Promise.resolve(mock.api),
      );
      await bridge.start(trace);

      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      trace.record('condition_evaluated', {
        conditionIndex: 2,
        passed: false,
      }, { ruleId: 'r1', correlationId: 'c1', durationMs: 0.5 });

      expect(mock.tracer.startSpan).toHaveBeenCalledWith(
        'condition_evaluation',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'noex.condition.index': 2,
            'noex.condition.passed': false,
          }),
        }),
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Span hierarchy — full pipeline
  // -------------------------------------------------------------------------

  describe('full span hierarchy', () => {
    it('creates event → rule → action hierarchy', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      // 1. Event emitted
      trace.record('event_emitted', { topic: 'order.created' }, { correlationId: 'c1' });
      expect(mock.spans).toHaveLength(1); // event_processing

      // 2. Rule triggered
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      expect(mock.spans).toHaveLength(2); // + rule_evaluation

      // 3. Action started
      trace.record('action_started', { actionIndex: 0, actionType: 'set_fact' }, {
        ruleId: 'r1', correlationId: 'c1',
      });
      expect(mock.spans).toHaveLength(3); // + action_execution

      // 4. Action completed
      trace.record('action_completed', {
        actionIndex: 0, actionType: 'set_fact', output: true,
      }, { ruleId: 'r1', correlationId: 'c1', durationMs: 1 });
      expect(mock.spans[2]!.end).toHaveBeenCalled(); // action ended

      // 5. Rule executed
      trace.record('rule_executed', { actionsCount: 1 }, {
        ruleId: 'r1', correlationId: 'c1', durationMs: 5,
      });
      expect(mock.spans[1]!.end).toHaveBeenCalled(); // rule ended

      // 6. Correlation span also ended (last rule)
      expect(mock.spans[0]!.end).toHaveBeenCalled(); // event ended
    });

    it('handles multiple rules under one correlation', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      trace.record('event_emitted', { topic: 'test' }, { correlationId: 'c1' });
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      trace.record('rule_triggered', {}, { ruleId: 'r2', correlationId: 'c1' });

      // spans: [0]=event, [1]=rule-r1, [2]=rule-r2
      expect(mock.spans).toHaveLength(3);

      trace.record('rule_executed', {}, { ruleId: 'r1', correlationId: 'c1' });
      expect(mock.spans[0]!.end).not.toHaveBeenCalled(); // event still open

      trace.record('rule_skipped', { reason: 'x' }, { ruleId: 'r2', correlationId: 'c1' });
      expect(mock.spans[0]!.end).toHaveBeenCalled(); // event closed after last rule
    });
  });

  // -------------------------------------------------------------------------
  // Lingering spans cleanup
  // -------------------------------------------------------------------------

  describe('lingering span cleanup on stop()', () => {
    it('ends all open spans when stop() is called', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      // Otevřeme spany bez zavření
      trace.record('event_emitted', { topic: 't' }, { correlationId: 'c1' });
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });
      trace.record('action_started', { actionIndex: 0, actionType: 'set_fact' }, {
        ruleId: 'r1', correlationId: 'c1',
      });

      // Žádný span by ještě neměl být ukončen
      expect(mock.spans[0]!.end).not.toHaveBeenCalled();
      expect(mock.spans[1]!.end).not.toHaveBeenCalled();
      expect(mock.spans[2]!.end).not.toHaveBeenCalled();

      bridge.stop();

      // Všechny by měly být ukončeny
      expect(mock.spans[0]!.end).toHaveBeenCalled(); // correlation
      expect(mock.spans[1]!.end).toHaveBeenCalled(); // rule
      expect(mock.spans[2]!.end).toHaveBeenCalled(); // action
    });

    it('does not fail when no open spans exist', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);

      expect(() => bridge.stop()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // No-op po stop / bez start
  // -------------------------------------------------------------------------

  describe('no-op behavior', () => {
    it('does not process entries after stop()', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);
      bridge.stop();

      trace.record('event_emitted', { topic: 'x' }, { correlationId: 'c1' });

      expect(mock.spans).toHaveLength(0);
    });

    it('does not process entries when import failed', async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.reject(new Error('nope')));
      await bridge.start(trace);

      trace.record('event_emitted', { topic: 'x' }, { correlationId: 'c1' });

      expect(mock.spans).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    beforeEach(async () => {
      bridge = new OpenTelemetryBridge({}, () => Promise.resolve(mock.api));
      await bridge.start(trace);
    });

    it('handles rule_executed without prior rule_triggered gracefully', () => {
      expect(() => {
        trace.record('rule_executed', {}, { ruleId: 'r1', correlationId: 'c1' });
      }).not.toThrow();
    });

    it('handles action_completed without prior action_started gracefully', () => {
      expect(() => {
        trace.record('action_completed', {
          actionIndex: 0, actionType: 'set_fact',
        }, { ruleId: 'r1', correlationId: 'c1' });
      }).not.toThrow();
    });

    it('handles action_failed without prior action_started gracefully', () => {
      expect(() => {
        trace.record('action_failed', {
          actionIndex: 0, actionType: 'set_fact', error: 'boom',
        }, { ruleId: 'r1', correlationId: 'c1' });
      }).not.toThrow();
    });

    it('ignores timer-related entries', () => {
      trace.record('timer_set', { key: 't1' });
      trace.record('timer_cancelled', { key: 't1' });
      trace.record('timer_expired', { key: 't1' });

      expect(mock.spans).toHaveLength(0);
    });

    it('handles multiple actions in sequence under one rule', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1', correlationId: 'c1' });

      trace.record('action_started', { actionIndex: 0, actionType: 'set_fact' }, {
        ruleId: 'r1', correlationId: 'c1',
      });
      trace.record('action_completed', { actionIndex: 0, actionType: 'set_fact' }, {
        ruleId: 'r1', correlationId: 'c1', durationMs: 1,
      });
      trace.record('action_started', { actionIndex: 1, actionType: 'emit_event' }, {
        ruleId: 'r1', correlationId: 'c1',
      });
      trace.record('action_completed', { actionIndex: 1, actionType: 'emit_event' }, {
        ruleId: 'r1', correlationId: 'c1', durationMs: 2,
      });

      // rule + action0 + action1 = 3 spans
      expect(mock.spans).toHaveLength(3);
      expect(mock.spans[1]!.end).toHaveBeenCalled();
      expect(mock.spans[2]!.end).toHaveBeenCalled();
    });
  });
});
