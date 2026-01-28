/**
 * DSL (Domain Specific Language) pro noex-rules.
 *
 * Poskytuje fluent builder API pro vytváření pravidel s plnou TypeScript podporou.
 *
 * @example
 * import { Rule, onEvent, event, emit, ref } from 'noex-rules/dsl';
 *
 * const rule = Rule.create('order-notification')
 *   .name('Send Order Notification')
 *   .priority(100)
 *   .tags('orders', 'notifications')
 *   .when(onEvent('order.created'))
 *   .if(event('amount').gte(100))
 *   .then(emit('notification.send', {
 *     orderId: ref('event.orderId'),
 *     message: 'Large order received!'
 *   }))
 *   .build();
 *
 * @module dsl
 */

// Builder
export { Rule, RuleBuilder } from './builder/index.js';

// Triggers
export { onEvent, onFact, onTimer } from './trigger/index.js';

// Temporal patterns
export { sequence, absence, count, aggregate } from './trigger/temporal/index.js';
export type { SequenceBuilder, AbsenceBuilder, CountBuilder, AggregateBuilder } from './trigger/temporal/index.js';

// Conditions
export { event, fact, context, SourceExpr } from './condition/index.js';

// Actions
export { emit, setFact, deleteFact, setTimer, cancelTimer, callService, log } from './action/index.js';
export type { SetTimerOptions } from './action/index.js';

// Tagged template
export { rule, parseRuleTemplate, ParseError } from './tagged/index.js';

// Helpers
export { ref, isRef } from './helpers/index.js';

// Types
export type {
  Ref,
  ConditionBuilder,
  TriggerBuilder,
  ActionBuilder,
  BuiltRule,
  ValueOrRef,
} from './types.js';
