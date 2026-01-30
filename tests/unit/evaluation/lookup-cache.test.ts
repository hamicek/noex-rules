import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LookupCache } from '../../../src/evaluation/lookup-cache';

describe('LookupCache', () => {
  let cache: LookupCache;

  beforeEach(() => {
    cache = new LookupCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get / set', () => {
    it('returns undefined for missing key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('stores and retrieves a value', () => {
      cache.set('key', 42, 10_000);
      expect(cache.get('key')).toBe(42);
    });

    it('stores complex objects', () => {
      const data = { score: 750, tier: 'gold', history: [1, 2, 3] };
      cache.set('credit', data, 10_000);
      expect(cache.get('credit')).toEqual(data);
    });

    it('stores null and falsy values', () => {
      cache.set('null', null, 10_000);
      cache.set('zero', 0, 10_000);
      cache.set('empty', '', 10_000);
      cache.set('false', false, 10_000);

      expect(cache.get('null')).toBeNull();
      expect(cache.get('zero')).toBe(0);
      expect(cache.get('empty')).toBe('');
      expect(cache.get('false')).toBe(false);
    });

    it('overwrites existing value', () => {
      cache.set('key', 'first', 10_000);
      cache.set('key', 'second', 10_000);
      expect(cache.get('key')).toBe('second');
    });

    it('returns undefined after TTL expires', () => {
      cache.set('key', 'value', 5_000);
      expect(cache.get('key')).toBe('value');

      vi.advanceTimersByTime(5_000);
      expect(cache.get('key')).toBeUndefined();
    });

    it('removes expired entry on access', () => {
      cache.set('key', 'value', 1_000);
      vi.advanceTimersByTime(1_000);
      cache.get('key');

      // Interní mapa by měla být prázdná
      expect(cache.stats().size).toBe(0);
    });

    it('handles very short TTL', () => {
      cache.set('key', 'value', 1);
      vi.advanceTimersByTime(1);
      expect(cache.get('key')).toBeUndefined();
    });

    it('returns value just before expiry', () => {
      cache.set('key', 'value', 5_000);
      vi.advanceTimersByTime(4_999);
      expect(cache.get('key')).toBe('value');
    });
  });

  describe('buildKey', () => {
    it('builds key from service, method, and args', () => {
      const key = LookupCache.buildKey('creditService', 'getScore', ['user-123']);
      expect(key).toBe('creditService:getScore:["user-123"]');
    });

    it('produces deterministic keys for objects with different key order', () => {
      const key1 = LookupCache.buildKey('svc', 'method', [{ b: 2, a: 1 }]);
      const key2 = LookupCache.buildKey('svc', 'method', [{ a: 1, b: 2 }]);
      expect(key1).toBe(key2);
    });

    it('distinguishes different services', () => {
      const key1 = LookupCache.buildKey('serviceA', 'get', [1]);
      const key2 = LookupCache.buildKey('serviceB', 'get', [1]);
      expect(key1).not.toBe(key2);
    });

    it('distinguishes different methods', () => {
      const key1 = LookupCache.buildKey('svc', 'getScore', [1]);
      const key2 = LookupCache.buildKey('svc', 'getRisk', [1]);
      expect(key1).not.toBe(key2);
    });

    it('distinguishes different args', () => {
      const key1 = LookupCache.buildKey('svc', 'get', ['alice']);
      const key2 = LookupCache.buildKey('svc', 'get', ['bob']);
      expect(key1).not.toBe(key2);
    });

    it('handles empty args', () => {
      const key = LookupCache.buildKey('svc', 'get', []);
      expect(key).toBe('svc:get:[]');
    });

    it('handles nested objects in args', () => {
      const key = LookupCache.buildKey('svc', 'get', [{ user: { id: 1, name: 'test' } }]);
      expect(key).toContain('svc:get:');
      expect(key).toContain('"id":1');
      expect(key).toContain('"name":"test"');
    });

    it('handles null and undefined args', () => {
      const key1 = LookupCache.buildKey('svc', 'get', [null]);
      const key2 = LookupCache.buildKey('svc', 'get', [undefined]);
      expect(key1).not.toBe(key2);
    });

    it('handles mixed arg types', () => {
      const key = LookupCache.buildKey('svc', 'method', [1, 'two', true, null, { k: 'v' }]);
      expect(key).toBe('svc:method:[1,"two",true,null,{"k":"v"}]');
    });
  });

  describe('parseTtl', () => {
    it('parses seconds', () => {
      expect(LookupCache.parseTtl('30s')).toBe(30_000);
    });

    it('parses minutes', () => {
      expect(LookupCache.parseTtl('5m')).toBe(300_000);
    });

    it('parses hours', () => {
      expect(LookupCache.parseTtl('1h')).toBe(3_600_000);
    });

    it('passes through numeric milliseconds', () => {
      expect(LookupCache.parseTtl(60_000)).toBe(60_000);
    });

    it('throws on invalid format', () => {
      expect(() => LookupCache.parseTtl('invalid')).toThrow('Invalid duration');
    });
  });

  describe('cleanup', () => {
    it('removes expired entries', () => {
      cache.set('short', 'a', 1_000);
      cache.set('long', 'b', 10_000);

      vi.advanceTimersByTime(2_000);
      cache.cleanup();

      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('b');
    });

    it('keeps all entries when none are expired', () => {
      cache.set('a', 1, 10_000);
      cache.set('b', 2, 10_000);

      cache.cleanup();

      expect(cache.stats().size).toBe(2);
    });

    it('removes all entries when all are expired', () => {
      cache.set('a', 1, 1_000);
      cache.set('b', 2, 2_000);

      vi.advanceTimersByTime(3_000);
      cache.cleanup();

      expect(cache.stats().size).toBe(0);
    });

    it('handles empty cache', () => {
      cache.cleanup();
      expect(cache.stats().size).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('a', 1, 10_000);
      cache.set('b', 2, 10_000);

      cache.clear();

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.stats().size).toBe(0);
    });

    it('resets hit/miss statistics', () => {
      cache.set('key', 'value', 10_000);
      cache.get('key');  // hit
      cache.get('miss'); // miss

      cache.clear();

      expect(cache.stats().hitRate).toBe(0);
    });
  });

  describe('stats', () => {
    it('returns zero size and hitRate for empty cache', () => {
      expect(cache.stats()).toEqual({ size: 0, hitRate: 0 });
    });

    it('tracks cache size', () => {
      cache.set('a', 1, 10_000);
      cache.set('b', 2, 10_000);

      expect(cache.stats().size).toBe(2);
    });

    it('computes hit rate correctly', () => {
      cache.set('key', 'value', 10_000);

      cache.get('key');        // hit
      cache.get('key');        // hit
      cache.get('missing');    // miss

      expect(cache.stats().hitRate).toBeCloseTo(2 / 3);
    });

    it('reports 0% hit rate on all misses', () => {
      cache.get('missing1');
      cache.get('missing2');

      expect(cache.stats().hitRate).toBe(0);
    });

    it('reports 100% hit rate on all hits', () => {
      cache.set('key', 'value', 10_000);

      cache.get('key');
      cache.get('key');
      cache.get('key');

      expect(cache.stats().hitRate).toBe(1);
    });

    it('counts expired entry access as miss', () => {
      cache.set('key', 'value', 1_000);
      cache.get('key'); // hit

      vi.advanceTimersByTime(1_000);
      cache.get('key'); // miss (expired)

      // 1 hit, 1 miss → 50%
      expect(cache.stats().hitRate).toBe(0.5);
    });

    it('does not count size of expired-but-not-cleaned entries', () => {
      cache.set('a', 1, 1_000);
      cache.set('b', 2, 10_000);

      vi.advanceTimersByTime(2_000);
      // 'a' je expirovaná ale nebyla čištěna — stále v mapě
      // Po přístupu se odstraní
      cache.get('a');

      expect(cache.stats().size).toBe(1);
    });
  });

  describe('concurrent access patterns', () => {
    it('handles rapid set/get cycles', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key-${i}`, i, 10_000);
      }

      for (let i = 0; i < 100; i++) {
        expect(cache.get(`key-${i}`)).toBe(i);
      }

      expect(cache.stats().size).toBe(100);
    });

    it('handles interleaved set and expiration', () => {
      cache.set('key', 'v1', 1_000);
      vi.advanceTimersByTime(500);

      cache.set('key', 'v2', 2_000);
      vi.advanceTimersByTime(1_000);

      // v2 by měla být stále platná (zbývá 1000ms)
      expect(cache.get('key')).toBe('v2');
    });
  });
});
