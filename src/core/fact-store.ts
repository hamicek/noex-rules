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

  /**
   * Prefix index pro rychlejší pattern matching.
   * Mapuje první segment klíče (před ':') na množinu plných klíčů.
   */
  private prefixIndex: Map<string, Set<string>> = new Map();

  constructor(config: FactStoreConfig = {}) {
    this.name = config.name ?? 'facts';
    this.changeListener = config.onFactChange;
  }

  /**
   * Extrahuje prefix (první segment před ':') z klíče.
   */
  private getPrefix(key: string): string {
    const colonIndex = key.indexOf(':');
    return colonIndex === -1 ? key : key.slice(0, colonIndex);
  }

  /**
   * Přidá klíč do prefix indexu.
   */
  private indexKey(key: string): void {
    const prefix = this.getPrefix(key);
    let keys = this.prefixIndex.get(prefix);
    if (!keys) {
      keys = new Set();
      this.prefixIndex.set(prefix, keys);
    }
    keys.add(key);
  }

  /**
   * Odebere klíč z prefix indexu.
   */
  private unindexKey(key: string): void {
    const prefix = this.getPrefix(key);
    const keys = this.prefixIndex.get(prefix);
    if (keys) {
      keys.delete(key);
      if (keys.size === 0) {
        this.prefixIndex.delete(prefix);
      }
    }
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

    if (!existing) {
      this.indexKey(key);
    }

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
    this.unindexKey(key);

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
    // Fast path: exact match (bez wildcardů)
    if (!pattern.includes('*')) {
      const fact = this.facts.get(pattern);
      return fact ? [fact] : [];
    }

    // Pattern začínající wildcardlem musí projít full scan
    const patternPrefix = this.getPrefix(pattern);
    if (patternPrefix === '*') {
      const results: Fact[] = [];
      for (const fact of this.facts.values()) {
        if (matchesFactPattern(fact.key, pattern)) {
          results.push(fact);
        }
      }
      return results;
    }

    // Použij prefix index pro zúžení kandidátů
    const candidateKeys = this.prefixIndex.get(patternPrefix);
    if (!candidateKeys) {
      return [];
    }

    const results: Fact[] = [];
    for (const key of candidateKeys) {
      if (matchesFactPattern(key, pattern)) {
        const fact = this.facts.get(key);
        if (fact) {
          results.push(fact);
        }
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
    this.prefixIndex.clear();
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
