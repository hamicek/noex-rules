/**
 * DSL (Domain Specific Language) for **noex-rules**.
 *
 * Provides three complementary ways to define rules:
 *
 * 1. **Fluent Builder API** — TypeScript-native, type-safe, IDE-friendly.
 * 2. **Tagged Template Literals** — compact syntax for simple rules.
 * 3. **YAML Loader** — external configuration files.
 *
 * @example
 * ```typescript
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
 * ```
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
export { event, fact, context, lookup, baseline, SourceExpr, BaselineExpr } from './condition/index.js';

// Actions
export { emit, setFact, deleteFact, setTimer, cancelTimer, callService, log, conditional } from './action/index.js';
export { ConditionalBuilder } from './action/index.js';
export type { SetTimerOptions } from './action/index.js';

// Tagged template
export { rule, parseRuleTemplate, ParseError } from './tagged/index.js';

// YAML loader
export { loadRulesFromYAML, loadRulesFromFile, YamlLoadError, validateRule, YamlValidationError } from './yaml/index.js';
export { loadTemplateFromYAML, loadTemplateFromFile, isTemplateYAML } from './yaml/index.js';
export { loadGroupsFromYAML, loadGroupsFromFile } from './yaml/index.js';

// Template
export { RuleTemplate, TemplateBuilder } from './template/index.js';
export { param, isTemplateParam } from './template/index.js';
export { TemplateValidationError, TemplateInstantiationError } from './template/index.js';
export type {
  TemplateParamOptions,
  TemplateParamType,
  TemplateParameterDef,
  TemplateParamMarker,
  TemplateParams,
  TemplateInstantiateOptions,
  TemplateBlueprintData,
  RuleTemplateDefinition,
} from './template/index.js';

// Query (backward chaining goals)
export { factGoal, eventGoal, FactGoalBuilder, EventGoalBuilder } from './query/index.js';

// Helpers
export { ref, isRef } from './helpers/index.js';

// Errors
export { DslError, DslValidationError } from './helpers/index.js';

// Types
export type {
  Ref,
  ConditionBuilder,
  TriggerBuilder,
  ActionBuilder,
  GoalBuilder,
  LookupConfig,
  BuiltRule,
  ValueOrRef,
} from './types.js';
