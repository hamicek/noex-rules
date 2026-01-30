import type { StorageAdapter } from '@hamicek/noex';
import type { AuditStats } from '../audit/types.js';
import type { HotReloadConfig } from '../core/hot-reload/types.js';
import type { MetricsConfig, OpenTelemetryConfig } from '../observability/types.js';
import type { VersioningConfig, VersioningStats } from '../versioning/types.js';

export type { HotReloadConfig } from '../core/hot-reload/types.js';
export type { MetricsConfig, OpenTelemetryConfig } from '../observability/types.js';
export type { VersioningConfig, VersioningStats } from '../versioning/types.js';

export * from './fact.js';
export * from './event.js';
export * from './timer.js';
export * from './condition.js';
export * from './action.js';
export * from './temporal.js';
export * from './rule.js';
export * from './group.js';
export * from './lookup.js';

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
  audit?: AuditStats;
  versioning?: VersioningStats;
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

/** Konfigurace persistence audit logu */
export interface AuditPersistenceConfig {
  /** Storage adapter pro ukládání audit záznamů */
  adapter: StorageAdapter;

  /** Jak dlouho uchovávat záznamy v ms (výchozí: 30 dní) */
  retentionMs?: number;

  /** Počet záznamů na persistence batch (výchozí: 100) */
  batchSize?: number;

  /** Interval mezi flush cykly v ms (výchozí: 5000) */
  flushIntervalMs?: number;

  /** Maximální počet záznamů v paměti (výchozí: 50000) */
  maxMemoryEntries?: number;
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
  audit?: AuditPersistenceConfig;  // Persistence audit logu
  metrics?: MetricsConfig;        // Prometheus metriky (opt-in)
  opentelemetry?: OpenTelemetryConfig;  // OpenTelemetry tracing (opt-in)
  hotReload?: HotReloadConfig;    // Hot-reload pravidel (opt-in)
  versioning?: VersioningConfig;  // Verzování pravidel (opt-in)
}
