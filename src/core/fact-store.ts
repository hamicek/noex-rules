import type { Fact } from '../types/fact.js';
import { matchesFactPattern } from '../utils/pattern-matcher.js';

export interface FactStoreConfig {
  name?: string;
  // persistence?: PersistenceConfig;  // TODO
}

/**
 * Rychlé in-memory úložiště faktů s pattern matchingem.
 */
export class FactStore {
  private facts: Map<string, Fact> = new Map();
  private readonly name: string;

  constructor(config: FactStoreConfig = {}) {
    this.name = config.name ?? 'facts';
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

    // TODO: Notifikovat o změně přes EventBus

    return fact;
  }

  get(key: string): Fact | undefined {
    return this.facts.get(key);
  }

  delete(key: string): boolean {
    const existed = this.facts.has(key);
    this.facts.delete(key);

    // TODO: Notifikovat o smazání přes EventBus

    return existed;
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
}
