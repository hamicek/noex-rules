export * from './fact.js';
export * from './event.js';
export * from './timer.js';
export * from './condition.js';
export * from './action.js';
export * from './temporal.js';
export * from './rule.js';

/** Unified input - společný vstup do enginu */
export type EngineInput =
  | { type: 'fact_changed'; fact: import('./fact.js').Fact }
  | { type: 'event_received'; event: import('./event.js').Event }
  | { type: 'timer_expired'; timer: import('./timer.js').Timer };

/** Statistiky enginu */
export interface EngineStats {
  rulesCount: number;
  factsCount: number;
  timersCount: number;
  eventsProcessed: number;
  rulesExecuted: number;
  avgProcessingTimeMs: number;
}

/** Konfigurace persistence */
export interface PersistenceConfig {
  adapter: unknown;  // TODO: definovat adapter interface
  path?: string;
}

/** Konfigurace Rule Engine */
export interface RuleEngineConfig {
  name?: string;
  maxConcurrency?: number;        // Max paralelních vyhodnocení
  debounceMs?: number;            // Debounce pro změny faktů
  persistence?: PersistenceConfig;
  services?: Record<string, unknown>;  // Externí služby pro call_service
}
