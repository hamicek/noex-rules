import type { StorageAdapter } from '@hamicek/noex';

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

/** Statistiky tracingu */
export interface TracingStats {
  enabled: boolean;
  entriesCount: number;
  maxEntries: number;
}

/** Základní profilingové statistiky */
export interface ProfilingStats {
  totalRulesProfiled: number;
  totalTriggers: number;
  totalExecutions: number;
  totalTimeMs: number;
  avgRuleTimeMs: number;
  slowestRule: { ruleId: string; ruleName: string; avgTimeMs: number } | null;
  hottestRule: { ruleId: string; ruleName: string; triggerCount: number } | null;
}

/** Statistiky enginu */
export interface EngineStats {
  rulesCount: number;
  factsCount: number;
  timersCount: number;
  eventsProcessed: number;
  rulesExecuted: number;
  avgProcessingTimeMs: number;
  tracing?: TracingStats;
  profiling?: ProfilingStats;
}

/** Konfigurace persistence */
export interface PersistenceConfig {
  /** Storage adapter (např. SQLiteAdapter z @hamicek/noex) */
  adapter: StorageAdapter;

  /** Klíč pro uložení v databázi (výchozí: 'rules') */
  key?: string;

  /** Verze schématu pro migrace (výchozí: 1) */
  schemaVersion?: number;
}

/** Konfigurace persistence timerů přes DurableTimerService */
export interface TimerPersistenceConfig {
  /** Storage adapter pro ukládání timer metadat */
  adapter: StorageAdapter;

  /** Interval kontroly expirovaných timerů v ms (výchozí dle DurableTimerService) */
  checkIntervalMs?: number;
}

/** Konfigurace tracingu */
export interface TracingConfig {
  /** Povolit tracing při startu enginu (default: false) */
  enabled?: boolean;

  /** Maximální počet trace entries v ring bufferu (default: 10000) */
  maxEntries?: number;
}

/** Konfigurace Rule Engine */
export interface RuleEngineConfig {
  name?: string;
  maxConcurrency?: number;        // Max paralelních vyhodnocení
  debounceMs?: number;            // Debounce pro změny faktů
  persistence?: PersistenceConfig;
  services?: Record<string, unknown>;  // Externí služby pro call_service
  tracing?: TracingConfig;        // Konfigurace debugging tracingu
  timerPersistence?: TimerPersistenceConfig;  // Persistence timerů přes DurableTimerService
}
