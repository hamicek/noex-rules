import { describe, it, expect, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';

describe('Forward chaining recursion guard', () => {
  let engine: RuleEngine;

  afterEach(async () => {
    if (engine?.isRunning) await engine.stop();
  });

  it('stops direct event cycle at maxForwardDepth', async () => {
    engine = await RuleEngine.start({
      name: 'cycle-test',
      maxForwardDepth: 3,
      tracing: { enabled: true }
    });

    // Rule emits "ping" on "ping" → infinite cycle
    engine.registerRule({
      id: 'ping-pong',
      name: 'Ping Pong',
      priority: 10,
      enabled: true,
      tags: [],
      trigger: { type: 'event', topic: 'ping' },
      conditions: [],
      actions: [{ type: 'emit_event', topic: 'ping', data: {} }]
    });

    // Should complete without throwing — chain silently stops at depth 3
    await engine.emit('ping', {});

    const entries = engine.getTraceCollector().getByType('forward_chaining_limit');
    expect(entries.length).toBe(1);
    expect(entries[0].details.depth).toBe(3);
    expect(entries[0].details.maxForwardDepth).toBe(3);
    expect(entries[0].details.triggerType).toBe('event');
    expect(entries[0].details.triggerData.topic).toBe('ping');
  });

  it('stops indirect event cycle (A → B → A) at maxForwardDepth', async () => {
    engine = await RuleEngine.start({
      name: 'indirect-cycle-test',
      maxForwardDepth: 4,
      tracing: { enabled: true }
    });

    // Rule A: "ping" → emit "pong"
    engine.registerRule({
      id: 'rule-a',
      name: 'Rule A',
      priority: 10,
      enabled: true,
      tags: [],
      trigger: { type: 'event', topic: 'ping' },
      conditions: [],
      actions: [{ type: 'emit_event', topic: 'pong', data: {} }]
    });

    // Rule B: "pong" → emit "ping"
    engine.registerRule({
      id: 'rule-b',
      name: 'Rule B',
      priority: 10,
      enabled: true,
      tags: [],
      trigger: { type: 'event', topic: 'pong' },
      conditions: [],
      actions: [{ type: 'emit_event', topic: 'ping', data: {} }]
    });

    await engine.emit('ping', {});

    const entries = engine.getTraceCollector().getByType('forward_chaining_limit');
    expect(entries.length).toBe(1);
    expect(entries[0].details.depth).toBe(4);
    expect(entries[0].details.triggerType).toBe('event');
  });

  it('allows chains within the depth limit', async () => {
    engine = await RuleEngine.start({
      name: 'chain-ok-test',
      maxForwardDepth: 5,
      tracing: { enabled: true }
    });

    // 2-step chain: "step1" → set fact + emit "step2" → set fact
    engine.registerRule({
      id: 'step1',
      name: 'Step 1',
      priority: 10,
      enabled: true,
      tags: [],
      trigger: { type: 'event', topic: 'step1' },
      conditions: [],
      actions: [
        { type: 'set_fact', key: 'step1:done', value: true },
        { type: 'emit_event', topic: 'step2', data: {} }
      ]
    });

    engine.registerRule({
      id: 'step2',
      name: 'Step 2',
      priority: 10,
      enabled: true,
      tags: [],
      trigger: { type: 'event', topic: 'step2' },
      conditions: [],
      actions: [{ type: 'set_fact', key: 'step2:done', value: true }]
    });

    await engine.emit('step1', {});

    expect(engine.getFact('step1:done')).toBe(true);
    expect(engine.getFact('step2:done')).toBe(true);

    // No recursion limit hit
    const entries = engine.getTraceCollector().getByType('forward_chaining_limit');
    expect(entries.length).toBe(0);
  });

  it('uses default maxForwardDepth of 10', async () => {
    engine = await RuleEngine.start({
      name: 'default-depth-test',
      tracing: { enabled: true }
    });

    // 15-step linear chain: level:0 → level:1 → ... → level:14
    for (let i = 0; i < 15; i++) {
      engine.registerRule({
        id: `chain-${i}`,
        name: `Chain ${i}`,
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: `level:${i}` },
        conditions: [],
        actions: [
          { type: 'set_fact', key: `reached:${i}`, value: true },
          { type: 'emit_event', topic: `level:${i + 1}`, data: {} }
        ]
      });
    }

    await engine.emit('level:0', {});

    // Chain should reach up to level 9 (depths 1..10), then stop at depth 10
    for (let i = 0; i < 10; i++) {
      expect(engine.getFact(`reached:${i}`)).toBe(true);
    }
    expect(engine.getFact('reached:10')).toBeUndefined();

    const entries = engine.getTraceCollector().getByType('forward_chaining_limit');
    expect(entries.length).toBe(1);
    expect(entries[0].details.depth).toBe(10);
  });
});
