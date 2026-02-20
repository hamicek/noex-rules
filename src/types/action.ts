import type { RuleCondition } from './condition.js';
import type { TimerConfig } from './timer.js';

/** Akce pravidla */
export type RuleAction =
  | { type: 'set_fact'; key: string; value: unknown | { ref: string } }
  | { type: 'delete_fact'; key: string }
  | { type: 'emit_event'; topic: string; data: Record<string, unknown | { ref: string }> }
  | { type: 'set_timer'; timer: TimerConfig }
  | { type: 'cancel_timer'; name: string }
  | { type: 'call_service'; service: string; method: string; args: unknown[] }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string }
  | { type: 'conditional'; conditions: RuleCondition[]; then: RuleAction[]; else?: RuleAction[] }
  | { type: 'for_each'; collection: unknown | { ref: string }; as: string; actions: RuleAction[]; maxIterations?: number };

/** Výsledek akce */
export interface ActionResult {
  action: RuleAction;
  success: boolean;
  result?: unknown;
  error?: string;
}

/** Výsledek podmíněné akce */
export interface ConditionalActionResult {
  conditionMet: boolean;
  branchExecuted: 'then' | 'else' | 'none';
  results: ActionResult[];
}

/** Výsledek for_each akce */
export interface ForEachActionResult {
  iterations: number;
  results: ActionResult[][];
}
