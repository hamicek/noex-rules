import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';

describe('Engine — Conditional Actions Integration', () => {
  let engine: RuleEngine;

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'conditional-test' });
  });

  afterEach(async () => {
    await engine.stop();
  });

  describe('then branch execution', () => {
    it('executes then branch when condition is met', async () => {
      const rule: RuleInput = {
        id: 'cond-then',
        name: 'Conditional Then',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
            ],
            then: [
              { type: 'set_fact', key: 'order:tier', value: 'premium' }
            ],
            else: [
              { type: 'set_fact', key: 'order:tier', value: 'standard' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { amount: 250 });

      expect(engine.getFact('order:tier')).toBe('premium');
    });
  });

  describe('else branch execution', () => {
    it('executes else branch when condition is not met', async () => {
      const rule: RuleInput = {
        id: 'cond-else',
        name: 'Conditional Else',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
            ],
            then: [
              { type: 'set_fact', key: 'order:tier', value: 'premium' }
            ],
            else: [
              { type: 'set_fact', key: 'order:tier', value: 'standard' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { amount: 50 });

      expect(engine.getFact('order:tier')).toBe('standard');
    });
  });

  describe('conditional without else', () => {
    it('does nothing when condition is not met and else is absent', async () => {
      const rule: RuleInput = {
        id: 'cond-no-else',
        name: 'Conditional No Else',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 1000 }
            ],
            then: [
              { type: 'set_fact', key: 'vip:flagged', value: true }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { amount: 50 });

      expect(engine.getFact('vip:flagged')).toBeUndefined();
    });
  });

  describe('multiple conditions (AND logic)', () => {
    it('executes then only when all conditions pass', async () => {
      await engine.setFact('customer:vip', true);

      const rule: RuleInput = {
        id: 'cond-multi',
        name: 'Multi Condition',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
              { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true }
            ],
            then: [
              { type: 'set_fact', key: 'route', value: 'vip-queue' }
            ],
            else: [
              { type: 'set_fact', key: 'route', value: 'standard-queue' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { amount: 200 });

      expect(engine.getFact('route')).toBe('vip-queue');
    });

    it('falls to else when one condition fails', async () => {
      await engine.setFact('customer:vip', false);

      const rule: RuleInput = {
        id: 'cond-multi-fail',
        name: 'Multi Condition Fail',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
              { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true }
            ],
            then: [
              { type: 'set_fact', key: 'route', value: 'vip-queue' }
            ],
            else: [
              { type: 'set_fact', key: 'route', value: 'standard-queue' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { amount: 200 });

      expect(engine.getFact('route')).toBe('standard-queue');
    });
  });

  describe('nested conditional actions', () => {
    it('evaluates nested conditionals correctly', async () => {
      const rule: RuleInput = {
        id: 'cond-nested',
        name: 'Nested Conditional',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
            ],
            then: [
              {
                type: 'conditional',
                conditions: [
                  { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 500 }
                ],
                then: [
                  { type: 'set_fact', key: 'order:tier', value: 'gold' }
                ],
                else: [
                  { type: 'set_fact', key: 'order:tier', value: 'silver' }
                ]
              }
            ],
            else: [
              { type: 'set_fact', key: 'order:tier', value: 'bronze' }
            ]
          }
        ]
      };

      engine.registerRule(rule);

      // amount >= 500 → gold
      await engine.emit('order.created', { amount: 600 });
      expect(engine.getFact('order:tier')).toBe('gold');
    });

    it('nested conditional selects inner else', async () => {
      const rule: RuleInput = {
        id: 'cond-nested-inner-else',
        name: 'Nested Inner Else',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
            ],
            then: [
              {
                type: 'conditional',
                conditions: [
                  { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 500 }
                ],
                then: [
                  { type: 'set_fact', key: 'order:tier', value: 'gold' }
                ],
                else: [
                  { type: 'set_fact', key: 'order:tier', value: 'silver' }
                ]
              }
            ],
            else: [
              { type: 'set_fact', key: 'order:tier', value: 'bronze' }
            ]
          }
        ]
      };

      engine.registerRule(rule);

      // 100 <= amount < 500 → silver
      await engine.emit('order.created', { amount: 250 });
      expect(engine.getFact('order:tier')).toBe('silver');
    });

    it('nested conditional selects outer else', async () => {
      const rule: RuleInput = {
        id: 'cond-nested-outer-else',
        name: 'Nested Outer Else',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
            ],
            then: [
              {
                type: 'conditional',
                conditions: [
                  { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 500 }
                ],
                then: [
                  { type: 'set_fact', key: 'order:tier', value: 'gold' }
                ],
                else: [
                  { type: 'set_fact', key: 'order:tier', value: 'silver' }
                ]
              }
            ],
            else: [
              { type: 'set_fact', key: 'order:tier', value: 'bronze' }
            ]
          }
        ]
      };

      engine.registerRule(rule);

      // amount < 100 → bronze
      await engine.emit('order.created', { amount: 30 });
      expect(engine.getFact('order:tier')).toBe('bronze');
    });
  });

  describe('conditional mixed with other actions', () => {
    it('executes actions before and after conditional', async () => {
      const rule: RuleInput = {
        id: 'cond-mixed',
        name: 'Mixed Actions',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'step', value: 'before' },
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'priority' }, operator: 'eq', value: 'high' }
            ],
            then: [
              { type: 'set_fact', key: 'routed', value: 'express' }
            ],
            else: [
              { type: 'set_fact', key: 'routed', value: 'normal' }
            ]
          },
          { type: 'set_fact', key: 'step', value: 'after' }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { priority: 'high' });

      expect(engine.getFact('routed')).toBe('express');
      expect(engine.getFact('step')).toBe('after');
    });
  });

  describe('fact mutations inside branches', () => {
    it('facts set in then branch are visible to subsequent actions', async () => {
      const rule: RuleInput = {
        id: 'cond-fact-mutation',
        name: 'Fact Mutation',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'process' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'type' }, operator: 'eq', value: 'premium' }
            ],
            then: [
              { type: 'set_fact', key: 'discount:rate', value: 20 }
            ],
            else: [
              { type: 'set_fact', key: 'discount:rate', value: 0 }
            ]
          },
          { type: 'set_fact', key: 'processed', value: true }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('process', { type: 'premium' });

      expect(engine.getFact('discount:rate')).toBe(20);
      expect(engine.getFact('processed')).toBe(true);
    });

    it('facts set in else branch persist correctly', async () => {
      const rule: RuleInput = {
        id: 'cond-else-persist',
        name: 'Else Persist',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'process' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'type' }, operator: 'eq', value: 'premium' }
            ],
            then: [
              { type: 'set_fact', key: 'discount:rate', value: 20 }
            ],
            else: [
              { type: 'set_fact', key: 'discount:rate', value: 0 }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('process', { type: 'basic' });

      expect(engine.getFact('discount:rate')).toBe(0);
    });
  });

  describe('conditional with event references', () => {
    it('uses event data refs inside conditional branches', async () => {
      const rule: RuleInput = {
        id: 'cond-ref',
        name: 'Conditional Refs',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'express' }, operator: 'eq', value: true }
            ],
            then: [
              { type: 'set_fact', key: 'order:${event.orderId}:shipping', value: 'express' }
            ],
            else: [
              { type: 'set_fact', key: 'order:${event.orderId}:shipping', value: 'standard' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { orderId: 'ORD-42', express: true });

      expect(engine.getFact('order:ORD-42:shipping')).toBe('express');
    });
  });

  describe('conditional with fact-based conditions', () => {
    it('evaluates conditions against current fact store', async () => {
      await engine.setFact('feature:dark-mode', true);

      const rule: RuleInput = {
        id: 'cond-fact-source',
        name: 'Fact Source Condition',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'ui.render' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'fact', pattern: 'feature:dark-mode' }, operator: 'eq', value: true }
            ],
            then: [
              { type: 'set_fact', key: 'theme', value: 'dark' }
            ],
            else: [
              { type: 'set_fact', key: 'theme', value: 'light' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('ui.render', {});

      expect(engine.getFact('theme')).toBe('dark');
    });

    it('reflects fact changes between rule executions', async () => {
      await engine.setFact('mode', 'maintenance');

      const rule: RuleInput = {
        id: 'cond-dynamic-fact',
        name: 'Dynamic Fact',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'check' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'fact', pattern: 'mode' }, operator: 'eq', value: 'maintenance' }
            ],
            then: [
              { type: 'set_fact', key: 'status', value: 'blocked' }
            ],
            else: [
              { type: 'set_fact', key: 'status', value: 'active' }
            ]
          }
        ]
      };

      engine.registerRule(rule);

      await engine.emit('check', {});
      expect(engine.getFact('status')).toBe('blocked');

      await engine.setFact('mode', 'normal');
      await engine.emit('check', {});
      expect(engine.getFact('status')).toBe('active');
    });
  });

  describe('conditional with rule-level conditions', () => {
    it('rule-level conditions gate, then conditional branches inside', async () => {
      await engine.setFact('system:active', true);

      const rule: RuleInput = {
        id: 'cond-gated',
        name: 'Gated Conditional',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'request' },
        conditions: [
          { source: { type: 'fact', pattern: 'system:active' }, operator: 'eq', value: true }
        ],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'role' }, operator: 'eq', value: 'admin' }
            ],
            then: [
              { type: 'set_fact', key: 'access', value: 'full' }
            ],
            else: [
              { type: 'set_fact', key: 'access', value: 'limited' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('request', { role: 'admin' });

      expect(engine.getFact('access')).toBe('full');
    });

    it('rule-level condition fails — conditional action is never reached', async () => {
      await engine.setFact('system:active', false);

      const rule: RuleInput = {
        id: 'cond-gated-skip',
        name: 'Gated Skip',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'request' },
        conditions: [
          { source: { type: 'fact', pattern: 'system:active' }, operator: 'eq', value: true }
        ],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'role' }, operator: 'eq', value: 'admin' }
            ],
            then: [
              { type: 'set_fact', key: 'access', value: 'full' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('request', { role: 'admin' });

      expect(engine.getFact('access')).toBeUndefined();
    });
  });

  describe('conditional emit_event action', () => {
    it('emits event from conditional branch that triggers another rule', async () => {
      const routingRule: RuleInput = {
        id: 'cond-emit',
        name: 'Conditional Emit',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
            ],
            then: [
              { type: 'emit_event', topic: 'order.premium', data: { orderId: { ref: 'event.orderId' } } }
            ],
            else: [
              { type: 'emit_event', topic: 'order.standard', data: { orderId: { ref: 'event.orderId' } } }
            ]
          }
        ]
      };

      const premiumHandler: RuleInput = {
        id: 'premium-handler',
        name: 'Premium Handler',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.premium' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'premium:handled', value: true },
          { type: 'set_fact', key: 'premium:orderId', value: { ref: 'event.orderId' } }
        ]
      };

      engine.registerRule(routingRule);
      engine.registerRule(premiumHandler);
      await engine.emit('order.created', { orderId: 'ORD-99', amount: 200 });

      expect(engine.getFact('premium:handled')).toBe(true);
      expect(engine.getFact('premium:orderId')).toBe('ORD-99');
    });
  });

  describe('tracing integration', () => {
    it('conditional actions produce trace entries', async () => {
      engine.enableTracing();

      const rule: RuleInput = {
        id: 'cond-trace',
        name: 'Traced Conditional',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'traced' },
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'flag' }, operator: 'eq', value: true }
            ],
            then: [
              { type: 'set_fact', key: 'traced:result', value: 'yes' }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('traced', { flag: true });

      expect(engine.getFact('traced:result')).toBe('yes');

      const traceCollector = engine.getTraceCollector();

      // Verify conditional action appeared in traces
      const actionStarted = traceCollector.query({ types: ['action_started'] });
      const conditionalStart = actionStarted.find(e => e.details.actionType === 'conditional');
      expect(conditionalStart).toBeDefined();

      const actionCompleted = traceCollector.query({ types: ['action_completed'] });
      const conditionalComplete = actionCompleted.find(e => e.details.actionType === 'conditional');
      expect(conditionalComplete).toBeDefined();
    });
  });
});
