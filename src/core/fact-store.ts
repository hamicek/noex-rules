import type { Fact } from '../types/fact.js';
import { matchesFactPattern } from '../utils/pattern-matcher.js';

/**
 * Typy změn faktů pro notifikace.
 */
export type FactChangeType = 'created' | 'updated' | 'deleted';

/**
 * Událost změny faktu.
 */
export interface FactChangeEvent {
  type: FactChangeType;
  fact: Fact;
  previousValue?: unknown;
}

/**
 * Callback pro notifikace o změnách faktů.
 */
export type FactChangeListener = (event: FactChangeEvent) => void;

export interface FactStoreConfig {
  name?: string;
  onFactChange?: FactChangeListener;
  // persistence?: PersistenceConfig;  // TODO
}

/**
 * Rychlé in-memory úložiště faktů s pattern matchingem.
 *
 * Podporuje notifikace o změnách pomocí callbacku `onFactChange`.
 */
export class FactStore {
  private facts: Map<string, Fact> = new Map();
  private readonly name: string;
  private readonly changeListener: FactChangeListener | undefined;

  constructor(config: FactStoreConfig = {}) {
    this.name = config.name ?? 'facts';
    this.changeListener = config.onFactChange;
  }

  static async start(config: FactStoreConfig = {}): Promise<FactStore> {
    return new FactStore(config);
  }

  set(key: string, value: unknown, source: string = 'system'): Fact {
    const existing = this.facts.get(key);
    const fact: Fact = {
      key,
      value,
      timestamp: Date.now(),
      source,
      version: existing ? existing.version + 1 : 1
    };

    this.facts.set(key, fact);

    this.notifyChange({
      type: existing ? 'updated' : 'created',
      fact,
      previousValue: existing?.value
    });

    return fact;
  }

  get(key: string): Fact | undefined {
    return this.facts.get(key);
  }

  delete(key: string): boolean {
    const existing = this.facts.get(key);
    if (!existing) {
      return false;
    }

    this.facts.delete(key);

    this.notifyChange({
      type: 'deleted',
      fact: existing
    });

    return true;
  }

  /**
   * Pattern matching: "customer:*:age" → všechny věky zákazníků
   */
  query(pattern: string): Fact[] {
    const results: Fact[] = [];

    for (const fact of this.facts.values()) {
      if (matchesFactPattern(fact.key, pattern)) {
        results.push(fact);
      }
    }

    return results;
  }

  /**
   * Filtrování pomocí predikátu.
   */
  filter(predicate: (fact: Fact) => boolean): Fact[] {
    return [...this.facts.values()].filter(predicate);
  }

  /**
   * Počet faktů.
   */
  get size(): number {
    return this.facts.size;
  }

  /**
   * Všechny fakty.
   */
  getAll(): Fact[] {
    return [...this.facts.values()];
  }

  /**
   * Vymaže všechny fakty.
   */
  clear(): void {
    this.facts.clear();
  }

  /**
   * Notifikuje listener o změně faktu.
   */
  private notifyChange(event: FactChangeEvent): void {
    if (this.changeListener) {
      try {
        this.changeListener(event);
      } catch (error) {
        console.error(`[${this.name}] Error in fact change listener:`, error);
      }
    }
  }
}
