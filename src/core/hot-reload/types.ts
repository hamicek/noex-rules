import type { StorageAdapter } from '@hamicek/noex';
import type { RuleInput } from '../../types/rule.js';

/** Konfigurace sledování souborů */
export interface FileSourceConfig {
  /** Cesty k YAML souborům nebo adresářům */
  paths: string[];

  /** Glob patterny pro filtrování (výchozí: ['*.yaml', '*.yml']) */
  patterns?: string[];

  /** Rekurzivní procházení adresářů (výchozí: false) */
  recursive?: boolean;
}

/** Konfigurace načítání pravidel ze StorageAdapteru */
export interface StorageSourceConfig {
  /** Storage adapter pro načítání pravidel */
  adapter: StorageAdapter;

  /** Klíč v úložišti (výchozí: 'hot-reload:rules') */
  key?: string;
}

/** Konfigurace hot-reload mechanismu */
export interface HotReloadConfig {
  /** Interval kontroly změn v ms (výchozí: 5000) */
  intervalMs?: number;

  /** Sledování souborových zdrojů */
  files?: FileSourceConfig;

  /** Sledování StorageAdapter zdroje */
  storage?: StorageSourceConfig;

  /** Validovat pravidla před aplikací (výchozí: true) */
  validateBeforeApply?: boolean;

  /** Atomický reload - buď se aplikují všechny změny, nebo žádné (výchozí: true) */
  atomicReload?: boolean;
}

/** Cast zpráva pro GenServer polling loop */
export type HotReloadCastMsg = { type: 'check' };

/** Interní stav watcheru */
export interface HotReloadState {
  /** SHA-256 hash pravidla podle jeho ID */
  ruleHashes: Map<string, string>;

  /** Timestamp posledního úspěšného reloadu */
  lastReloadAt: number | null;

  /** Počet úspěšných reloadů */
  reloadCount: number;

  /** Počet neúspěšných pokusů o reload */
  failureCount: number;
}

/** Výsledek porovnání aktuálních a nových pravidel */
export interface RuleDiff {
  added: RuleInput[];
  removed: string[];
  modified: RuleInput[];
}

/** Výsledek jednoho reload cyklu */
export interface ReloadResult {
  success: boolean;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  durationMs: number;
  error?: string;
  timestamp: number;
}

/** Zdroj pravidel pro hot-reload */
export interface RuleSource {
  /** Načte pravidla ze zdroje */
  loadRules(): Promise<RuleInput[]>;

  /** Název zdroje pro logování a diagnostiku */
  readonly name: string;
}

/** Veřejný stav hot-reload watcheru */
export interface HotReloadStatus {
  running: boolean;
  intervalMs: number;
  trackedRulesCount: number;
  lastReloadAt: number | null;
  reloadCount: number;
  failureCount: number;
}
