import { bench, describe } from 'vitest';
import {
  Rule,
  onEvent,
  onFact,
  onTimer,
  event,
  fact,
  context,
  emit,
  setFact,
  deleteFact,
  setTimer,
  cancelTimer,
  callService,
  log,
  ref,
  sequence,
  absence,
  count,
  aggregate,
  rule,
  parseRuleTemplate,
  loadRulesFromYAML,
  validateRule,
} from '../../../src/dsl/index.js';

// ---------------------------------------------------------------------------
// Fluent Builder API
// ---------------------------------------------------------------------------

describe('DSL Builder API', () => {
  bench('simple rule (event trigger + emit action)', () => {
    Rule.create('bench-rule')
      .name('Benchmark Rule')
      .priority(100)
      .when(onEvent('order.created'))
      .then(emit('notification.send', { orderId: ref('event.orderId') }))
      .build();
  });

  bench('complex rule (trigger + 3 conditions + 3 actions)', () => {
    Rule.create('complex-rule')
      .name('Complex Benchmark Rule')
      .description('Rule with multiple conditions and actions')
      .priority(50)
      .tags('orders', 'notifications', 'vip')
      .when(onEvent('order.created'))
      .if(event('amount').gte(100))
      .and(event('status').eq('confirmed'))
      .and(fact('customer:vip').eq(true))
      .then(emit('notification.send', {
        orderId: ref('event.orderId'),
        amount: ref('event.amount'),
      }))
      .also(setFact('order:last', ref('event.orderId')))
      .also(log.info('Order processed'))
      .build();
  });

  bench('rule with setTimer (fluent)', () => {
    Rule.create('timer-rule')
      .when(onEvent('order.created'))
      .then(
        setTimer('payment-timeout')
          .after('15m')
          .emit('order.timeout', { orderId: ref('event.orderId') })
          .repeat('5m', 3),
      )
      .build();
  });

  bench('rule with callService (fluent)', () => {
    Rule.create('service-rule')
      .when(onEvent('order.created'))
      .then(
        callService('paymentService')
          .method('processPayment')
          .args(ref('event.orderId'), ref('event.amount')),
      )
      .build();
  });

  bench('rule with fact trigger', () => {
    Rule.create('fact-rule')
      .when(onFact('customer:*:status'))
      .if(fact('customer:*:status').eq('vip'))
      .then(emit('vip.upgrade'))
      .build();
  });

  bench('rule with timer trigger', () => {
    Rule.create('timer-trigger-rule')
      .when(onTimer('daily-report'))
      .then(callService('reportService', 'generate'))
      .build();
  });

  bench('build 100 simple rules', () => {
    for (let i = 0; i < 100; i++) {
      Rule.create(`rule-${i}`)
        .when(onEvent(`topic.${i}`))
        .then(emit(`result.${i}`, { index: i }))
        .build();
    }
  });
});

// ---------------------------------------------------------------------------
// Temporal Patterns
// ---------------------------------------------------------------------------

describe('DSL Temporal Patterns', () => {
  bench('sequence pattern (3 events)', () => {
    Rule.create('seq-rule')
      .when(
        sequence()
          .event('auth.login_failed')
          .event('auth.login_failed')
          .event('auth.login_failed')
          .within('5m')
          .groupBy('data.userId'),
      )
      .then(emit('security.alert', { type: 'brute_force' }))
      .build();
  });

  bench('absence pattern', () => {
    Rule.create('absence-rule')
      .when(
        absence()
          .after('order.created')
          .expected('payment.received')
          .within('15m')
          .groupBy('orderId'),
      )
      .then(emit('order.timeout'))
      .build();
  });

  bench('count pattern', () => {
    Rule.create('count-rule')
      .when(
        count()
          .event('error.occurred')
          .threshold(10)
          .comparison('gte')
          .window('1h')
          .sliding(true),
      )
      .then(emit('alert.error_spike'))
      .build();
  });

  bench('aggregate pattern', () => {
    Rule.create('agg-rule')
      .when(
        aggregate()
          .event('transaction.completed')
          .field('amount')
          .function('sum')
          .threshold(10000)
          .comparison('gte')
          .window('24h'),
      )
      .then(emit('alert.high_volume'))
      .build();
  });
});

// ---------------------------------------------------------------------------
// Tagged Template Literals
// ---------------------------------------------------------------------------

describe('DSL Tagged Template Parser', () => {
  bench('simple rule template', () => {
    rule`
      id: bench-template
      name: Benchmark Template
      WHEN event order.created
      THEN emit notification.send
    `;
  });

  bench('complex rule template (conditions + data)', () => {
    rule`
      id: complex-template
      name: Complex Template
      priority: 100
      tags: orders, notifications, vip
      WHEN event order.created
      IF event.amount >= 100
      AND event.status == "confirmed"
      THEN emit notification.send { orderId: event.orderId, amount: event.amount }
      THEN log info "Large order processed"
    `;
  });

  bench('template with interpolation', () => {
    const topic = 'order.created';
    const threshold = 100;
    rule`
      id: interpolated
      WHEN event ${topic}
      IF event.amount >= ${threshold}
      THEN emit result
    `;
  });

  bench('parse 100 simple templates', () => {
    for (let i = 0; i < 100; i++) {
      parseRuleTemplate(`
        id: rule-${i}
        WHEN event topic.${i}
        THEN emit result.${i}
      `);
    }
  });
});

// ---------------------------------------------------------------------------
// YAML Loader
// ---------------------------------------------------------------------------

const SIMPLE_YAML = `
id: yaml-bench
trigger:
  type: event
  topic: order.created
actions:
  - type: emit_event
    topic: notification.send
    data:
      orderId: "\${event.orderId}"
`;

const COMPLEX_YAML = `
id: yaml-complex
name: Complex YAML Rule
priority: 100
tags: [orders, notifications]
trigger:
  type: event
  topic: order.created
conditions:
  - source:
      type: event
      field: amount
    operator: gte
    value: 100
  - source:
      type: fact
      pattern: "customer:vip"
    operator: eq
    value: true
actions:
  - type: emit_event
    topic: notification.send
    data:
      orderId: "\${event.orderId}"
      amount: "\${event.amount}"
  - type: set_fact
    key: "order:last"
    value: "\${event.orderId}"
  - type: log
    level: info
    message: "Order processed"
`;

function generateYamlRules(count: number): string {
  const rules: string[] = [];
  for (let i = 0; i < count; i++) {
    rules.push(`  - id: rule-${i}
    trigger:
      type: event
      topic: topic.${i}
    actions:
      - type: emit_event
        topic: result.${i}
        data:
          index: ${i}`);
  }
  return `rules:\n${rules.join('\n')}`;
}

describe('DSL YAML Loader', () => {
  bench('parse simple YAML rule', () => {
    loadRulesFromYAML(SIMPLE_YAML);
  });

  bench('parse complex YAML rule', () => {
    loadRulesFromYAML(COMPLEX_YAML);
  });

  bench('parse 10 YAML rules', () => {
    loadRulesFromYAML(generateYamlRules(10));
  });

  bench('parse 100 YAML rules', () => {
    loadRulesFromYAML(generateYamlRules(100));
  });
});

// ---------------------------------------------------------------------------
// YAML Schema Validation
// ---------------------------------------------------------------------------

describe('DSL YAML Schema Validation', () => {
  const simpleRuleObj = {
    id: 'valid-rule',
    trigger: { type: 'event', topic: 'order.created' },
    actions: [{ type: 'emit_event', topic: 'notification.send', data: {} }],
  };

  const complexRuleObj = {
    id: 'complex-rule',
    name: 'Complex Rule',
    priority: 100,
    tags: ['orders', 'notifications'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
      { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true },
    ],
    actions: [
      { type: 'emit_event', topic: 'notification.send', data: { orderId: '${event.orderId}' } },
      { type: 'set_fact', key: 'order:last', value: '${event.orderId}' },
      { type: 'log', level: 'info', message: 'Order processed' },
    ],
  };

  const temporalRuleObj = {
    id: 'temporal-rule',
    trigger: {
      type: 'temporal',
      pattern: {
        type: 'sequence',
        events: [
          { topic: 'auth.login_failed' },
          { topic: 'auth.login_failed' },
          { topic: 'auth.login_failed' },
        ],
        within: '5m',
        groupBy: 'data.userId',
      },
    },
    actions: [{ type: 'emit_event', topic: 'security.alert', data: { type: 'brute_force' } }],
  };

  bench('validate simple rule object', () => {
    validateRule(simpleRuleObj);
  });

  bench('validate complex rule object', () => {
    validateRule(complexRuleObj);
  });

  bench('validate temporal rule object', () => {
    validateRule(temporalRuleObj);
  });

  bench('validate 100 simple rule objects', () => {
    for (let i = 0; i < 100; i++) {
      validateRule({
        id: `rule-${i}`,
        trigger: { type: 'event', topic: `topic.${i}` },
        actions: [{ type: 'emit_event', topic: `result.${i}`, data: {} }],
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Condition Operators
// ---------------------------------------------------------------------------

describe('DSL Condition Operators', () => {
  bench('build event condition (gte)', () => {
    event('amount').gte(100).build();
  });

  bench('build fact condition (eq)', () => {
    fact('customer:vip').eq(true).build();
  });

  bench('build context condition (in)', () => {
    context('env').in(['production', 'staging']).build();
  });

  bench('build condition with ref', () => {
    event('amount').gte(ref('context.threshold')).build();
  });

  bench('build 100 conditions', () => {
    for (let i = 0; i < 100; i++) {
      event(`field_${i}`).gte(i).build();
    }
  });
});

// ---------------------------------------------------------------------------
// Ref Normalization
// ---------------------------------------------------------------------------

describe('DSL Ref Normalization', () => {
  bench('emit with 10 ref values', () => {
    emit('topic', {
      a: ref('event.a'), b: ref('event.b'), c: ref('event.c'),
      d: ref('event.d'), e: ref('event.e'), f: ref('event.f'),
      g: ref('event.g'), h: ref('event.h'), i: ref('event.i'),
      j: ref('event.j'),
    }).build();
  });

  bench('emit with 10 plain values', () => {
    emit('topic', {
      a: 1, b: 2, c: 3, d: 4, e: 5,
      f: 'str', g: true, h: null, i: [1, 2], j: { nested: true },
    }).build();
  });

  bench('callService with 5 ref args', () => {
    callService('svc', 'method', [
      ref('event.a'), ref('event.b'), ref('event.c'),
      ref('event.d'), ref('event.e'),
    ]).build();
  });
});
