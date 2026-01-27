import type { StorageAdapter, PersistedState, StateMetadata } from '@hamicek/noex';
import type { Rule } from '../types/rule.js';

/** Konfigurační options pro RulePersistence */
export interface RulePersistenceOptions {
  /** Klíč pro uložení v databázi (výchozí: 'rules') */
  key?: string;
  /** Verze schématu pro migrace (výchozí: 1) */
  schemaVersion?: number;
}

/** Interní struktura uloženého stavu */
interface RulesState {
  rules: Rule[];
}

/**
 * Persistence pravidel pomocí StorageAdapter.
 *
 * Ukládá pravidla do externího storage (SQLite, file, memory) a umožňuje
 * jejich obnovení po restartu.
 */
export class RulePersistence {
  private readonly adapter: StorageAdapter;
  private readonly key: string;
  private readonly schemaVersion: number;

  constructor(adapter: StorageAdapter, options?: RulePersistenceOptions) {
    this.adapter = adapter;
    this.key = options?.key ?? 'rules';
    this.schemaVersion = options?.schemaVersion ?? 1;
  }

  /**
   * Uloží pravidla do storage.
   */
  async save(rules: Rule[]): Promise<void> {
    const state: RulesState = { rules };
    const metadata: StateMetadata = {
      persistedAt: Date.now(),
      serverId: 'rule-engine',
      schemaVersion: this.schemaVersion,
    };

    const persisted: PersistedState<RulesState> = {
      state,
      metadata,
    };

    await this.adapter.save(this.key, persisted);
  }

  /**
   * Načte pravidla ze storage.
   * Vrátí prázdné pole pokud žádná pravidla nejsou uložena.
   */
  async load(): Promise<Rule[]> {
    const result = await this.adapter.load<RulesState>(this.key);
    if (!result) {
      return [];
    }

    if (result.metadata.schemaVersion !== this.schemaVersion) {
      // V budoucnu zde může být migrace
      return [];
    }

    return result.state.rules;
  }

  /**
   * Smaže všechna persistovaná pravidla.
   */
  async clear(): Promise<boolean> {
    return this.adapter.delete(this.key);
  }

  /**
   * Zkontroluje, zda existují uložená pravidla.
   */
  async exists(): Promise<boolean> {
    return this.adapter.exists(this.key);
  }

  /**
   * Vrátí klíč použitý pro persistenci.
   */
  getKey(): string {
    return this.key;
  }

  /**
   * Vrátí aktuální verzi schématu.
   */
  getSchemaVersion(): number {
    return this.schemaVersion;
  }
}
