import type { RuleCondition } from './condition.js';
import type { RuleAction } from './action.js';
import type { TemporalPattern } from './temporal.js';

/** Trigger - co spustí pravidlo */
export type RuleTrigger =
  | { type: 'fact'; pattern: string }           // Změna faktu: "customer:*:age"
  | { type: 'event'; topic: string }            // Event: "order.created"
  | { type: 'timer'; name: string }             // Timer expiroval
  | { type: 'temporal'; pattern: TemporalPattern };  // Temporální vzor

/** Základní pravidlo */
export interface Rule {
  id: string;
  name: string;
  description?: string;
  priority: number;         // Vyšší = dříve
  enabled: boolean;
  version: number;
  tags: string[];

  // Typ triggeru
  trigger: RuleTrigger;

  // Podmínky (všechny musí platit)
  conditions: RuleCondition[];

  // Akce při splnění
  actions: RuleAction[];

  // Metadata
  createdAt: number;
  updatedAt: number;
}

/** Pravidlo bez auto-generovaných polí (pro registraci) */
export type RuleInput = Omit<Rule, 'version' | 'createdAt' | 'updatedAt'>;
