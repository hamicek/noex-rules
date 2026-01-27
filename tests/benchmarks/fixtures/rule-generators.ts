import type { Rule, RuleInput, RuleTrigger } from '../../../src/types/rule.js';
import type { RuleCondition } from '../../../src/types/condition.js';
import type { RuleAction } from '../../../src/types/action.js';
import type { TemporalPattern, SequencePattern, AbsencePattern, CountPattern, AggregatePattern } from '../../../src/types/temporal.js';

type ConditionOperator = RuleCondition['operator'];
type SourceType = RuleCondition['source']['type'];

const OPERATORS: ConditionOperator[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'exists', 'not_exists'
];

const TOPICS = [
  'order.created', 'order.updated', 'order.cancelled', 'order.completed',
  'payment.initiated', 'payment.completed', 'payment.failed',
  'user.registered', 'user.logged_in', 'user.profile_updated',
  'inventory.updated', 'inventory.low_stock', 'inventory.out_of_stock',
  'shipping.dispatched', 'shipping.delivered', 'shipping.returned'
];

const FACT_PATTERNS = [
  'customer:*:profile', 'customer:*:age', 'customer:*:status',
  'order:*:status', 'order:*:total', 'order:*:items',
  'product:*:price', 'product:*:stock', 'product:*:category',
  'config:*:enabled', 'config:*:threshold', 'config:*:limit'
];

export interface RuleGeneratorOptions {
  conditionCount?: number;
  actionCount?: number;
  triggerType?: RuleTrigger['type'];
  priority?: number;
  enabled?: boolean;
  tags?: string[];
}

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCondition(index: number): RuleCondition {
  const operator = OPERATORS[index % OPERATORS.length];
  const sourceTypes: SourceType[] = ['fact', 'event', 'context'];
  const sourceType = sourceTypes[index % sourceTypes.length];

  let source: RuleCondition['source'];
  switch (sourceType) {
    case 'fact':
      source = { type: 'fact', pattern: `customer:${index}:status` };
      break;
    case 'event':
      source = { type: 'event', field: `data.field${index}` };
      break;
    case 'context':
      source = { type: 'context', key: `ctx_var_${index}` };
      break;
  }

  let value: unknown;
  switch (operator) {
    case 'eq':
    case 'neq':
      value = `value_${index}`;
      break;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      value = index * 10;
      break;
    case 'in':
    case 'not_in':
      value = [`option_${index}`, `option_${index + 1}`, `option_${index + 2}`];
      break;
    case 'contains':
    case 'not_contains':
      value = `substr_${index}`;
      break;
    case 'matches':
      value = `^pattern_${index}.*$`;
      break;
    case 'exists':
    case 'not_exists':
      value = true;
      break;
  }

  return { source, operator, value };
}

function generateAction(index: number): RuleAction {
  const actionTypes = [
    'set_fact', 'delete_fact', 'emit_event',
    'set_timer', 'cancel_timer', 'log'
  ] as const;

  const actionType = actionTypes[index % actionTypes.length];

  switch (actionType) {
    case 'set_fact':
      return {
        type: 'set_fact',
        key: `result:${index}:value`,
        value: { ref: 'event.data.computed' }
      };
    case 'delete_fact':
      return {
        type: 'delete_fact',
        key: `temp:${index}:cache`
      };
    case 'emit_event':
      return {
        type: 'emit_event',
        topic: `processed.event_${index}`,
        data: {
          originalIndex: index,
          timestamp: { ref: 'event.timestamp' }
        }
      };
    case 'set_timer':
      return {
        type: 'set_timer',
        timer: {
          name: `timer_${index}`,
          delay: '5m',
          data: { timerIndex: index }
        }
      };
    case 'cancel_timer':
      return {
        type: 'cancel_timer',
        name: `timer_${index}`
      };
    case 'log':
      return {
        type: 'log',
        level: 'info',
        message: `Rule ${index} executed successfully`
      };
  }
}

function generateTrigger(type: RuleTrigger['type'], index: number): RuleTrigger {
  switch (type) {
    case 'event':
      return { type: 'event', topic: TOPICS[index % TOPICS.length] };
    case 'fact':
      return { type: 'fact', pattern: FACT_PATTERNS[index % FACT_PATTERNS.length] };
    case 'timer':
      return { type: 'timer', name: `scheduled_timer_${index}` };
    case 'temporal':
      return { type: 'temporal', pattern: generateTemporalPattern(index) };
  }
}

function generateTemporalPattern(index: number): TemporalPattern {
  const patternTypes = ['sequence', 'absence', 'count', 'aggregate'] as const;
  const patternType = patternTypes[index % patternTypes.length];

  switch (patternType) {
    case 'sequence':
      return {
        type: 'sequence',
        events: [
          { topic: 'order.created', as: 'orderCreated' },
          { topic: 'payment.completed', as: 'paymentDone' }
        ],
        within: '30m',
        groupBy: 'orderId'
      } satisfies SequencePattern;

    case 'absence':
      return {
        type: 'absence',
        after: { topic: 'order.created' },
        expected: { topic: 'payment.completed' },
        within: '1h',
        groupBy: 'orderId'
      } satisfies AbsencePattern;

    case 'count':
      return {
        type: 'count',
        event: { topic: 'user.logged_in' },
        threshold: 5,
        comparison: 'gte',
        window: '1h',
        groupBy: 'userId'
      } satisfies CountPattern;

    case 'aggregate':
      return {
        type: 'aggregate',
        event: { topic: 'order.completed' },
        field: 'data.total',
        function: 'sum',
        threshold: 1000,
        comparison: 'gte',
        window: '24h',
        groupBy: 'customerId'
      } satisfies AggregatePattern;
  }
}

export function generateRule(index: number, options: RuleGeneratorOptions = {}): RuleInput {
  const {
    conditionCount = 3,
    actionCount = 2,
    triggerType = 'event',
    priority = 50,
    enabled = true,
    tags = []
  } = options;

  const conditions: RuleCondition[] = [];
  for (let i = 0; i < conditionCount; i++) {
    conditions.push(generateCondition(index * 100 + i));
  }

  const actions: RuleAction[] = [];
  for (let i = 0; i < actionCount; i++) {
    actions.push(generateAction(index * 100 + i));
  }

  return {
    id: `rule_${index}`,
    name: `Generated Rule ${index}`,
    description: `Auto-generated rule for benchmark testing (index: ${index})`,
    priority,
    enabled,
    tags: tags.length > 0 ? tags : [`bench`, `auto_${index % 10}`],
    trigger: generateTrigger(triggerType, index),
    conditions,
    actions
  };
}

export function generateRules(count: number, options: RuleGeneratorOptions = {}): RuleInput[] {
  const rules: RuleInput[] = [];
  for (let i = 0; i < count; i++) {
    rules.push(generateRule(i, options));
  }
  return rules;
}

export function generateRulesWithMixedTriggers(count: number): RuleInput[] {
  const triggerTypes: RuleTrigger['type'][] = ['event', 'fact', 'timer', 'temporal'];
  const rules: RuleInput[] = [];

  for (let i = 0; i < count; i++) {
    rules.push(generateRule(i, {
      triggerType: triggerTypes[i % triggerTypes.length]
    }));
  }

  return rules;
}

export function generateRulesWithVaryingComplexity(
  count: number,
  minConditions: number = 1,
  maxConditions: number = 20
): RuleInput[] {
  const rules: RuleInput[] = [];

  for (let i = 0; i < count; i++) {
    const conditionCount = minConditions + Math.floor(
      (i / count) * (maxConditions - minConditions)
    );
    rules.push(generateRule(i, { conditionCount }));
  }

  return rules;
}

export function generateRulesForTopic(topic: string, count: number): RuleInput[] {
  const rules: RuleInput[] = [];

  for (let i = 0; i < count; i++) {
    rules.push({
      ...generateRule(i),
      trigger: { type: 'event', topic }
    });
  }

  return rules;
}

export function generateRulesForFactPattern(pattern: string, count: number): RuleInput[] {
  const rules: RuleInput[] = [];

  for (let i = 0; i < count; i++) {
    rules.push({
      ...generateRule(i),
      trigger: { type: 'fact', pattern }
    });
  }

  return rules;
}

export { OPERATORS, TOPICS, FACT_PATTERNS };
