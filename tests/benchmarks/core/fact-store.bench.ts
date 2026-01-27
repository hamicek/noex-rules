import { bench, describe } from 'vitest';
import { FactStore } from '../../../src/core/fact-store.js';
import { generateFacts, generatePatternMatchingFacts } from '../fixtures/index.js';

describe('FactStore', () => {
  describe('set() - write operations', () => {
    bench('set() - single fact', () => {
      const store = new FactStore();
      for (let i = 0; i < 100; i++) {
        store.set(`key:${i}`, { value: i });
      }
    });

    bench('set() - with source', () => {
      const store = new FactStore();
      for (let i = 0; i < 100; i++) {
        store.set(`key:${i}`, { value: i }, 'api');
      }
    });

    bench('set() - update existing (versioning)', () => {
      const store = new FactStore();
      const key = 'update:test:key';
      for (let i = 0; i < 100; i++) {
        store.set(key, { version: i });
      }
    });
  });

  describe('get() - read operations', () => {
    const store = new FactStore();
    const facts = generateFacts(10000);
    for (const fact of facts) {
      store.set(fact.key, fact.value, fact.source);
    }

    bench('get() - existing key (10k facts)', () => {
      for (let i = 0; i < 100; i++) {
        const randomIndex = Math.floor(Math.random() * facts.length);
        store.get(facts[randomIndex].key);
      }
    });

    bench('get() - non-existing key', () => {
      for (let i = 0; i < 100; i++) {
        store.get(`non:existing:key:${i}`);
      }
    });
  });

  describe('query() - pattern matching', () => {
    const store = new FactStore();
    const patterns = ['customer:*:profile', 'order:*:status', 'product:*:price'];
    const patternFacts = generatePatternMatchingFacts(patterns, 1000);
    for (const [, facts] of patternFacts) {
      for (const fact of facts) {
        store.set(fact.key, fact.value, fact.source);
      }
    }

    bench('query() - wildcard middle segment (3k facts)', () => {
      store.query('customer:*:profile');
    });

    bench('query() - wildcard suffix', () => {
      store.query('order:*');
    });

    bench('query() - exact match pattern', () => {
      store.query('customer:id_500:profile');
    });

    bench('query() - no matches', () => {
      store.query('nonexistent:*:pattern');
    });
  });

  describe('delete() - removal operations', () => {
    bench('delete() - existing keys', () => {
      const store = new FactStore();
      for (let i = 0; i < 1000; i++) {
        store.set(`delete:test:${i}`, { value: i });
      }
      for (let i = 0; i < 1000; i++) {
        store.delete(`delete:test:${i}`);
      }
    });

    bench('delete() - non-existing keys', () => {
      const store = new FactStore();
      for (let i = 0; i < 1000; i++) {
        store.delete(`non:existing:${i}`);
      }
    });
  });

  describe('scalability - get() with varying store sizes', () => {
    const scales = [100, 1000, 10000, 100000] as const;
    const stores = new Map<number, { store: FactStore; facts: ReturnType<typeof generateFacts> }>();

    for (const scale of scales) {
      const facts = generateFacts(scale);
      const store = new FactStore();
      for (const fact of facts) {
        store.set(fact.key, fact.value, fact.source);
      }
      stores.set(scale, { store, facts });
    }

    bench('get() - 100 facts', () => {
      const { store, facts } = stores.get(100)!;
      for (let i = 0; i < 100; i++) {
        store.get(facts[i % facts.length].key);
      }
    });

    bench('get() - 1,000 facts', () => {
      const { store, facts } = stores.get(1000)!;
      for (let i = 0; i < 100; i++) {
        store.get(facts[Math.floor(Math.random() * facts.length)].key);
      }
    });

    bench('get() - 10,000 facts', () => {
      const { store, facts } = stores.get(10000)!;
      for (let i = 0; i < 100; i++) {
        store.get(facts[Math.floor(Math.random() * facts.length)].key);
      }
    });

    bench('get() - 100,000 facts', () => {
      const { store, facts } = stores.get(100000)!;
      for (let i = 0; i < 100; i++) {
        store.get(facts[Math.floor(Math.random() * facts.length)].key);
      }
    });
  });

  describe('scalability - query() with varying store sizes', () => {
    const scales = [100, 1000, 10000] as const;
    const stores = new Map<number, FactStore>();

    for (const scale of scales) {
      const store = new FactStore();
      for (let i = 0; i < scale; i++) {
        store.set(`customer:${i}:name`, `Customer ${i}`);
        store.set(`customer:${i}:status`, 'active');
      }
      stores.set(scale, store);
    }

    bench('query(customer:*:name) - 100 entities', () => {
      stores.get(100)!.query('customer:*:name');
    });

    bench('query(customer:*:name) - 1,000 entities', () => {
      stores.get(1000)!.query('customer:*:name');
    });

    bench('query(customer:*:name) - 10,000 entities', () => {
      stores.get(10000)!.query('customer:*:name');
    });
  });

  describe('bulk operations', () => {
    bench('populate 1,000 facts', () => {
      const store = new FactStore();
      for (let i = 0; i < 1000; i++) {
        store.set(`bulk:${i}:value`, { index: i });
      }
    });

    bench('populate 10,000 facts', () => {
      const store = new FactStore();
      for (let i = 0; i < 10000; i++) {
        store.set(`bulk:${i}:value`, { index: i });
      }
    });

    bench('populate 1,000 facts with versioning (10 versions each)', () => {
      const store = new FactStore();
      for (let i = 0; i < 100; i++) {
        for (let v = 0; v < 10; v++) {
          store.set(`versioned:${i}:value`, { version: v });
        }
      }
    });
  });

  describe('mixed workload simulation', () => {
    bench('80% read / 20% write (5k facts)', () => {
      const store = new FactStore();
      for (let i = 0; i < 5000; i++) {
        store.set(`mixed:${i}:data`, { value: i });
      }
      for (let i = 0; i < 1000; i++) {
        const op = i % 10;
        if (op < 8) {
          store.get(`mixed:${Math.floor(Math.random() * 5000)}:data`);
        } else {
          store.set(`mixed:${Math.floor(Math.random() * 5000)}:data`, { updated: true });
        }
      }
    });

    bench('50% read / 50% write (5k facts)', () => {
      const store = new FactStore();
      for (let i = 0; i < 5000; i++) {
        store.set(`mixed:${i}:data`, { value: i });
      }
      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) {
          store.get(`mixed:${Math.floor(Math.random() * 5000)}:data`);
        } else {
          store.set(`mixed:${Math.floor(Math.random() * 5000)}:data`, { updated: true });
        }
      }
    });
  });

  describe('filter() - predicate-based filtering', () => {
    const store = new FactStore();
    for (let i = 0; i < 10000; i++) {
      store.set(`item:${i}:data`, { index: i, category: i % 5 });
    }

    bench('filter() - simple predicate (10k facts)', () => {
      store.filter(fact => (fact.value as { category: number }).category === 2);
    });
  });

  describe('getAll() - full retrieval', () => {
    const smallStore = new FactStore();
    const largeStore = new FactStore();
    for (let i = 0; i < 1000; i++) {
      smallStore.set(`item:${i}`, { value: i });
    }
    for (let i = 0; i < 10000; i++) {
      largeStore.set(`item:${i}`, { value: i });
    }

    bench('getAll() - 1,000 facts', () => {
      smallStore.getAll();
    });

    bench('getAll() - 10,000 facts', () => {
      largeStore.getAll();
    });
  });
});
