import { parseDuration } from '../utils/duration-parser.js';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-memory TTL cache pro výsledky lookupů.
 * Klíč se skládá z názvu služby, metody a serializovaných argumentů.
 */
export class LookupCache {
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  /** Vrací cachovanou hodnotu nebo `undefined` pokud záznam expiroval či neexistuje. */
  get(key: string): unknown | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value;
  }

  /** Uloží hodnotu s daným TTL v milisekundách. */
  set(key: string, value: unknown, ttlMs: number): void {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Sestaví cache klíč z názvu služby, metody a argumentů.
   * Deterministická serializace zajišťuje konzistentní klíče.
   */
  static buildKey(service: string, method: string, args: unknown[]): string {
    return `${service}:${method}:${stableStringify(args)}`;
  }

  /**
   * Parsuje TTL z konfigurace (duration string nebo milisekundy).
   * Vrací TTL v milisekundách.
   */
  static parseTtl(ttl: string | number): number {
    return parseDuration(ttl);
  }

  /** Odstraní všechny expirované záznamy. */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) {
        this.entries.delete(key);
      }
    }
  }

  /** Smaže všechny záznamy a resetuje statistiky. */
  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /** Vrací statistiky cache. */
  stats(): { size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.entries.size,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }
}

/**
 * Deterministická serializace hodnoty.
 * Na rozdíl od JSON.stringify řadí klíče objektů abecedně,
 * takže `{ a: 1, b: 2 }` a `{ b: 2, a: 1 }` produkují stejný výstup.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
