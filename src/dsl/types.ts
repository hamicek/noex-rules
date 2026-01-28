import type { RuleCondition } from '../types/condition.js';
import type { RuleAction } from '../types/action.js';
import type { RuleTrigger, RuleInput } from '../types/rule.js';

/**
 * Reference na hodnotu z kontextu.
 */
export interface Ref<T = unknown> {
  ref: string;
  __type?: T;
}

/**
 * Podporované operátory pro podmínky.
 */
export type ConditionOperator = RuleCondition['operator'];

/**
 * Zdroj dat pro podmínku.
 */
export type ConditionSource = RuleCondition['source'];

/**
 * Builder pro podmínky - vrací RuleCondition.
 */
export interface ConditionBuilder {
  build(): RuleCondition;
}

/**
 * Builder pro triggery - vrací RuleTrigger.
 */
export interface TriggerBuilder {
  build(): RuleTrigger;
}

/**
 * Builder pro akce - vrací RuleAction.
 */
export interface ActionBuilder {
  build(): RuleAction;
}

/**
 * Kontext pro rule builder - sleduje stav buildu.
 */
export interface RuleBuildContext {
  id?: string;
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags: string[];
  trigger?: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

/**
 * Výsledek buildu pravidla.
 */
export type BuiltRule = RuleInput;

/**
 * Hodnota nebo reference.
 */
export type ValueOrRef<T> = T | Ref<T>;
