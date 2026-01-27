import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FactStore,
  type FactChangeEvent,
  type FactChangeListener
} from '../../../src/core/fact-store';

describe('FactStore', () => {
  let store: FactStore;

  beforeEach(() => {
    store = new FactStore();
  });

  describe('set()', () => {
    it('creates a new fact with initial version 1', () => {
      const fact = store.set('user:123:name', 'John');

      expect(fact.key).toBe('user:123:name');
      expect(fact.value).toBe('John');
      expect(fact.version).toBe(1);
      expect(fact.source).toBe('system');
      expect(fact.timestamp).toBeTypeOf('number');
    });

    it('stores different value types', () => {
      store.set('string', 'text');
      store.set('number', 42);
      store.set('boolean', true);
      store.set('null', null);
      store.set('array', [1, 2, 3]);
      store.set('object', { nested: { value: 'deep' } });

      expect(store.get('string')?.value).toBe('text');
      expect(store.get('number')?.value).toBe(42);
      expect(store.get('boolean')?.value).toBe(true);
      expect(store.get('null')?.value).toBe(null);
      expect(store.get('array')?.value).toEqual([1, 2, 3]);
      expect(store.get('object')?.value).toEqual({ nested: { value: 'deep' } });
    });

    it('uses custom source when provided', () => {
      const fact = store.set('key', 'value', 'api-request');

      expect(fact.source).toBe('api-request');
    });

    it('overwrites existing fact and returns new fact', () => {
      store.set('key', 'original');
      const updated = store.set('key', 'modified');

      expect(updated.value).toBe('modified');
      expect(store.get('key')?.value).toBe('modified');
    });
  });

  describe('get()', () => {
    it('returns fact for existing key', () => {
      store.set('existing', 'value');

      const fact = store.get('existing');

      expect(fact).toBeDefined();
      expect(fact?.value).toBe('value');
    });

    it('returns undefined for non-existing key', () => {
      const fact = store.get('non-existing');

      expect(fact).toBeUndefined();
    });
  });

  describe('delete()', () => {
    it('removes existing fact and returns true', () => {
      store.set('to-delete', 'value');

      const result = store.delete('to-delete');

      expect(result).toBe(true);
      expect(store.get('to-delete')).toBeUndefined();
    });

    it('returns false for non-existing key', () => {
      const result = store.delete('non-existing');

      expect(result).toBe(false);
    });
  });

  describe('versioning', () => {
    it('increments version on each update', () => {
      store.set('versioned', 'v1');
      expect(store.get('versioned')?.version).toBe(1);

      store.set('versioned', 'v2');
      expect(store.get('versioned')?.version).toBe(2);

      store.set('versioned', 'v3');
      expect(store.get('versioned')?.version).toBe(3);
    });

    it('starts from version 1 after delete and re-create', () => {
      store.set('key', 'first');
      store.set('key', 'second');
      expect(store.get('key')?.version).toBe(2);

      store.delete('key');
      store.set('key', 'new');

      expect(store.get('key')?.version).toBe(1);
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      store.set('customer:100:name', 'Alice');
      store.set('customer:100:age', 30);
      store.set('customer:200:name', 'Bob');
      store.set('customer:200:age', 25);
      store.set('product:500:price', 99);
      store.set('config:theme', 'dark');
    });

    it('returns exact match', () => {
      const results = store.query('customer:100:name');

      expect(results).toHaveLength(1);
      expect(results[0].value).toBe('Alice');
    });

    it('matches wildcard at end', () => {
      const results = store.query('customer:100:*');

      expect(results).toHaveLength(2);
      expect(results.map(f => f.key).sort()).toEqual([
        'customer:100:age',
        'customer:100:name'
      ]);
    });

    it('matches wildcard in middle', () => {
      const results = store.query('customer:*:name');

      expect(results).toHaveLength(2);
      expect(results.map(f => f.value).sort()).toEqual(['Alice', 'Bob']);
    });

    it('matches wildcard at beginning', () => {
      const results = store.query('*:theme');

      expect(results).toHaveLength(1);
      expect(results[0].value).toBe('dark');
    });

    it('matches multiple wildcards', () => {
      const results = store.query('customer:*:*');

      expect(results).toHaveLength(4);
    });

    it('returns empty array for no matches', () => {
      const results = store.query('nonexistent:*');

      expect(results).toEqual([]);
    });

    it('single wildcard matches keys without separator', () => {
      store.set('simple', 'no-separator');

      const results = store.query('*');

      // * matches only keys without colons (the wildcard represents [^:]+)
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('simple');
    });
  });

  describe('filter()', () => {
    beforeEach(() => {
      store.set('score:player1', 100);
      store.set('score:player2', 250);
      store.set('score:player3', 50);
    });

    it('filters facts by predicate on value', () => {
      const highScores = store.filter(fact => (fact.value as number) >= 100);

      expect(highScores).toHaveLength(2);
      expect(highScores.map(f => f.value).sort()).toEqual([100, 250]);
    });

    it('filters facts by predicate on key', () => {
      const player1Facts = store.filter(fact => fact.key.includes('player1'));

      expect(player1Facts).toHaveLength(1);
      expect(player1Facts[0].key).toBe('score:player1');
    });

    it('returns empty array when no facts match', () => {
      const results = store.filter(fact => (fact.value as number) > 1000);

      expect(results).toEqual([]);
    });

    it('returns all facts when predicate always returns true', () => {
      const all = store.filter(() => true);

      expect(all).toHaveLength(3);
    });
  });

  describe('size property', () => {
    it('returns 0 for empty store', () => {
      expect(store.size).toBe(0);
    });

    it('returns correct count after adding facts', () => {
      store.set('a', 1);
      store.set('b', 2);
      store.set('c', 3);

      expect(store.size).toBe(3);
    });

    it('does not increase when updating existing fact', () => {
      store.set('key', 'original');
      store.set('key', 'updated');

      expect(store.size).toBe(1);
    });

    it('decreases after delete', () => {
      store.set('a', 1);
      store.set('b', 2);
      store.delete('a');

      expect(store.size).toBe(1);
    });
  });

  describe('getAll()', () => {
    it('returns empty array for empty store', () => {
      expect(store.getAll()).toEqual([]);
    });

    it('returns all facts', () => {
      store.set('a', 1);
      store.set('b', 2);

      const all = store.getAll();

      expect(all).toHaveLength(2);
      expect(all.map(f => f.key).sort()).toEqual(['a', 'b']);
    });
  });

  describe('clear()', () => {
    it('removes all facts', () => {
      store.set('a', 1);
      store.set('b', 2);
      store.set('c', 3);

      store.clear();

      expect(store.size).toBe(0);
      expect(store.getAll()).toEqual([]);
    });

    it('does nothing on empty store', () => {
      store.clear();

      expect(store.size).toBe(0);
    });
  });

  describe('change notifications', () => {
    let listener: FactChangeListener;
    let events: FactChangeEvent[];

    beforeEach(() => {
      events = [];
      listener = vi.fn((event: FactChangeEvent) => {
        events.push(event);
      });
      store = new FactStore({ onFactChange: listener });
    });

    it('notifies on fact creation', () => {
      store.set('new-fact', 'value');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(events[0].type).toBe('created');
      expect(events[0].fact.key).toBe('new-fact');
      expect(events[0].fact.value).toBe('value');
      expect(events[0].previousValue).toBeUndefined();
    });

    it('notifies on fact update with previous value', () => {
      store.set('fact', 'original');
      store.set('fact', 'updated');

      expect(listener).toHaveBeenCalledTimes(2);
      expect(events[1].type).toBe('updated');
      expect(events[1].fact.value).toBe('updated');
      expect(events[1].previousValue).toBe('original');
    });

    it('notifies on fact deletion', () => {
      store.set('to-delete', 'value');
      store.delete('to-delete');

      expect(listener).toHaveBeenCalledTimes(2);
      expect(events[1].type).toBe('deleted');
      expect(events[1].fact.key).toBe('to-delete');
    });

    it('does not notify on failed delete', () => {
      store.delete('non-existing');

      expect(listener).not.toHaveBeenCalled();
    });

    it('catches and logs errors in listener without interrupting operations', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const storeWithErrorListener = new FactStore({ onFactChange: errorListener });

      const fact = storeWithErrorListener.set('key', 'value');

      expect(fact.key).toBe('key');
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('static start()', () => {
    it('creates store instance asynchronously', async () => {
      const asyncStore = await FactStore.start({ name: 'async-store' });

      expect(asyncStore).toBeInstanceOf(FactStore);
      asyncStore.set('test', 'value');
      expect(asyncStore.get('test')?.value).toBe('value');
    });
  });

  describe('configuration', () => {
    it('uses default name when not provided', () => {
      const defaultStore = new FactStore();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorListener = () => { throw new Error('test'); };
      const storeWithListener = new FactStore({ onFactChange: errorListener });

      storeWithListener.set('key', 'value');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[facts]'),
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });

    it('uses custom name in error messages', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorListener = () => { throw new Error('test'); };
      const customStore = new FactStore({
        name: 'custom-store',
        onFactChange: errorListener
      });

      customStore.set('key', 'value');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[custom-store]'),
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });
  });
});
