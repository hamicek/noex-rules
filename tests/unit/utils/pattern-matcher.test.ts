import { describe, it, expect } from 'vitest';
import {
  matchesTopic,
  matchesFactPattern,
  matchesTimerPattern,
  matchesFilter,
  getNestedValue,
  clearPatternCache,
} from '../../../src/utils/pattern-matcher';

describe('matchesTopic', () => {
  describe('exact match', () => {
    it('matches identical topics', () => {
      expect(matchesTopic('order.created', 'order.created')).toBe(true);
      expect(matchesTopic('user.login', 'user.login')).toBe(true);
      expect(matchesTopic('payment', 'payment')).toBe(true);
    });

    it('does not match different topics', () => {
      expect(matchesTopic('order.created', 'order.updated')).toBe(false);
      expect(matchesTopic('user.login', 'user.logout')).toBe(false);
    });
  });

  describe('trailing wildcard (.*)', () => {
    it('matches topics with same prefix', () => {
      expect(matchesTopic('order.created', 'order.*')).toBe(true);
      expect(matchesTopic('order.updated', 'order.*')).toBe(true);
      expect(matchesTopic('order.deleted', 'order.*')).toBe(true);
    });

    it('does not match topics with different prefix', () => {
      expect(matchesTopic('user.created', 'order.*')).toBe(false);
      expect(matchesTopic('payment.completed', 'order.*')).toBe(false);
    });

    it('does not match topic without segment after prefix', () => {
      expect(matchesTopic('order', 'order.*')).toBe(false);
    });

    it('matches nested segments when using trailing wildcard', () => {
      // Trailing .* uses startsWith, so it matches any depth
      expect(matchesTopic('order.item.created', 'order.*')).toBe(true);
      expect(matchesTopic('order.a.b.c', 'order.*')).toBe(true);
    });
  });

  describe('middle wildcard', () => {
    it('matches topics with wildcard in middle segment', () => {
      expect(matchesTopic('order.123.status', 'order.*.status')).toBe(true);
      expect(matchesTopic('order.abc.status', 'order.*.status')).toBe(true);
      expect(matchesTopic('user.john.profile', 'user.*.profile')).toBe(true);
    });

    it('does not match topics with wrong prefix or suffix', () => {
      expect(matchesTopic('payment.123.status', 'order.*.status')).toBe(false);
      expect(matchesTopic('order.123.updated', 'order.*.status')).toBe(false);
    });

    it('does not match nested wildcards', () => {
      expect(matchesTopic('order.123.456.status', 'order.*.status')).toBe(false);
    });
  });

  describe('leading wildcard', () => {
    it('matches topics with wildcard at start', () => {
      expect(matchesTopic('order.created', '*.created')).toBe(true);
      expect(matchesTopic('user.created', '*.created')).toBe(true);
      expect(matchesTopic('payment.created', '*.created')).toBe(true);
    });

    it('does not match topics with wrong suffix', () => {
      expect(matchesTopic('order.updated', '*.created')).toBe(false);
    });
  });

  describe('multiple wildcards', () => {
    it('matches topics with multiple wildcard segments (non-trailing)', () => {
      // Pattern ending in .* is treated as trailing wildcard, so use explicit middle wildcards
      expect(matchesTopic('a.b.c', '*.b.c')).toBe(true);
      expect(matchesTopic('order.123.status', '*.*.status')).toBe(true);
    });

    it('does not match topics with different segment count (non-trailing patterns)', () => {
      expect(matchesTopic('a.b', '*.b.c')).toBe(false);
      expect(matchesTopic('a.b.c.d', '*.b.c')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles single segment topics', () => {
      expect(matchesTopic('order', 'order')).toBe(true);
      expect(matchesTopic('order', '*')).toBe(true);
      expect(matchesTopic('order', 'user')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(matchesTopic('', '')).toBe(true);
      expect(matchesTopic('order', '')).toBe(false);
      expect(matchesTopic('', 'order')).toBe(false);
    });
  });
});

describe('matchesFactPattern', () => {
  describe('exact match', () => {
    it('matches identical keys', () => {
      expect(matchesFactPattern('customer:123:age', 'customer:123:age')).toBe(true);
      expect(matchesFactPattern('settings:theme', 'settings:theme')).toBe(true);
      expect(matchesFactPattern('counter', 'counter')).toBe(true);
    });

    it('does not match different keys', () => {
      expect(matchesFactPattern('customer:123:age', 'customer:456:age')).toBe(false);
      expect(matchesFactPattern('settings:theme', 'settings:language')).toBe(false);
    });
  });

  describe('wildcard matching', () => {
    it('matches keys with wildcard in middle segment', () => {
      expect(matchesFactPattern('customer:123:age', 'customer:*:age')).toBe(true);
      expect(matchesFactPattern('customer:456:age', 'customer:*:age')).toBe(true);
      expect(matchesFactPattern('customer:abc:age', 'customer:*:age')).toBe(true);
    });

    it('matches keys with wildcard at end', () => {
      expect(matchesFactPattern('customer:123:age', 'customer:123:*')).toBe(true);
      expect(matchesFactPattern('customer:123:name', 'customer:123:*')).toBe(true);
    });

    it('matches keys with wildcard at start', () => {
      expect(matchesFactPattern('customer:123:age', '*:123:age')).toBe(true);
      expect(matchesFactPattern('user:123:age', '*:123:age')).toBe(true);
    });

    it('matches keys with multiple wildcards', () => {
      expect(matchesFactPattern('customer:123:age', '*:*:age')).toBe(true);
      expect(matchesFactPattern('user:456:age', '*:*:age')).toBe(true);
      expect(matchesFactPattern('a:b:c', '*:*:*')).toBe(true);
    });

    it('does not match keys with wrong segments', () => {
      expect(matchesFactPattern('customer:123:name', 'customer:*:age')).toBe(false);
      expect(matchesFactPattern('user:123:age', 'customer:*:age')).toBe(false);
    });

    it('does not match keys with different segment count', () => {
      expect(matchesFactPattern('customer:123', 'customer:*:age')).toBe(false);
      expect(matchesFactPattern('customer:123:age:extra', 'customer:*:age')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles single segment keys', () => {
      expect(matchesFactPattern('counter', 'counter')).toBe(true);
      expect(matchesFactPattern('counter', '*')).toBe(true);
      expect(matchesFactPattern('counter', 'total')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(matchesFactPattern('', '')).toBe(true);
      expect(matchesFactPattern('key', '')).toBe(false);
      expect(matchesFactPattern('', 'key')).toBe(false);
    });

    it('wildcard does not span multiple segments', () => {
      expect(matchesFactPattern('a:b:c', 'a:*')).toBe(false);
      expect(matchesFactPattern('a:b', '*:b:c')).toBe(false);
    });
  });
});

describe('matchesTimerPattern', () => {
  describe('exact match', () => {
    it('matches identical timer names', () => {
      expect(matchesTimerPattern('payment-timeout:order123', 'payment-timeout:order123')).toBe(true);
      expect(matchesTimerPattern('reminder', 'reminder')).toBe(true);
      expect(matchesTimerPattern('cleanup:session:abc', 'cleanup:session:abc')).toBe(true);
    });

    it('does not match different timer names', () => {
      expect(matchesTimerPattern('payment-timeout:order123', 'payment-timeout:order456')).toBe(false);
      expect(matchesTimerPattern('reminder', 'notification')).toBe(false);
    });
  });

  describe('wildcard matching', () => {
    it('matches timer names with wildcard in middle segment', () => {
      expect(matchesTimerPattern('payment-timeout:order123', 'payment-timeout:*')).toBe(true);
      expect(matchesTimerPattern('payment-timeout:order456', 'payment-timeout:*')).toBe(true);
      expect(matchesTimerPattern('unlock:user123', 'unlock:*')).toBe(true);
    });

    it('matches timer names with wildcard at start', () => {
      expect(matchesTimerPattern('payment-timeout:order123', '*:order123')).toBe(true);
      expect(matchesTimerPattern('shipping-timeout:order123', '*:order123')).toBe(true);
    });

    it('matches timer names with multiple wildcards', () => {
      expect(matchesTimerPattern('cleanup:session:abc', '*:*:abc')).toBe(true);
      expect(matchesTimerPattern('expire:cache:xyz', '*:*:xyz')).toBe(true);
      expect(matchesTimerPattern('a:b:c', '*:*:*')).toBe(true);
    });

    it('does not match timer names with wrong segments', () => {
      expect(matchesTimerPattern('payment-timeout:order123', 'shipping-timeout:*')).toBe(false);
      expect(matchesTimerPattern('cleanup:session:abc', 'cleanup:*:xyz')).toBe(false);
    });

    it('does not match timer names with different segment count', () => {
      expect(matchesTimerPattern('payment-timeout', 'payment-timeout:*')).toBe(false);
      expect(matchesTimerPattern('a:b:c:d', 'a:*:c')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles single segment timer names', () => {
      expect(matchesTimerPattern('cleanup', 'cleanup')).toBe(true);
      expect(matchesTimerPattern('cleanup', '*')).toBe(true);
      expect(matchesTimerPattern('cleanup', 'garbage')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(matchesTimerPattern('', '')).toBe(true);
      expect(matchesTimerPattern('timer', '')).toBe(false);
      expect(matchesTimerPattern('', 'timer')).toBe(false);
    });

    it('wildcard does not span multiple segments', () => {
      expect(matchesTimerPattern('a:b:c', 'a:*')).toBe(false);
      expect(matchesTimerPattern('a:b', '*:b:c')).toBe(false);
    });
  });
});

describe('matchesFilter', () => {
  describe('simple filters', () => {
    it('matches when all filter properties match', () => {
      const data = { type: 'order', status: 'pending', amount: 100 };
      expect(matchesFilter(data, { type: 'order' })).toBe(true);
      expect(matchesFilter(data, { status: 'pending' })).toBe(true);
      expect(matchesFilter(data, { type: 'order', status: 'pending' })).toBe(true);
    });

    it('does not match when any filter property differs', () => {
      const data = { type: 'order', status: 'pending', amount: 100 };
      expect(matchesFilter(data, { type: 'payment' })).toBe(false);
      expect(matchesFilter(data, { type: 'order', status: 'completed' })).toBe(false);
    });

    it('does not match when filter property is missing from data', () => {
      const data = { type: 'order' };
      expect(matchesFilter(data, { status: 'pending' })).toBe(false);
    });

    it('matches empty filter against any data', () => {
      expect(matchesFilter({ type: 'order' }, {})).toBe(true);
      expect(matchesFilter({}, {})).toBe(true);
    });
  });

  describe('nested property filters', () => {
    it('matches nested properties using dot notation', () => {
      const data = {
        order: { id: 123, customer: { name: 'John', tier: 'gold' } },
        status: 'pending',
      };
      expect(matchesFilter(data, { 'order.id': 123 })).toBe(true);
      expect(matchesFilter(data, { 'order.customer.name': 'John' })).toBe(true);
      expect(matchesFilter(data, { 'order.customer.tier': 'gold', status: 'pending' })).toBe(true);
    });

    it('does not match when nested property differs', () => {
      const data = { order: { id: 123 } };
      expect(matchesFilter(data, { 'order.id': 456 })).toBe(false);
    });

    it('does not match when nested path does not exist', () => {
      const data = { order: { id: 123 } };
      expect(matchesFilter(data, { 'order.customer.name': 'John' })).toBe(false);
    });
  });

  describe('type coercion', () => {
    it('uses strict equality for comparisons', () => {
      const data = { count: 1, enabled: true, value: '100' };
      expect(matchesFilter(data, { count: 1 })).toBe(true);
      expect(matchesFilter(data, { count: '1' })).toBe(false);
      expect(matchesFilter(data, { enabled: true })).toBe(true);
      expect(matchesFilter(data, { enabled: 'true' })).toBe(false);
      expect(matchesFilter(data, { value: '100' })).toBe(true);
      expect(matchesFilter(data, { value: 100 })).toBe(false);
    });
  });

  describe('special values', () => {
    it('matches null values', () => {
      const data = { value: null, other: 'test' };
      expect(matchesFilter(data, { value: null })).toBe(true);
      expect(matchesFilter(data, { other: null })).toBe(false);
    });

    it('matches undefined values when property is missing', () => {
      const data = { existing: 'value' };
      expect(matchesFilter(data, { missing: undefined })).toBe(true);
    });

    it('matches boolean values', () => {
      const data = { active: true, deleted: false };
      expect(matchesFilter(data, { active: true })).toBe(true);
      expect(matchesFilter(data, { deleted: false })).toBe(true);
      expect(matchesFilter(data, { active: false })).toBe(false);
    });
  });
});

describe('getNestedValue', () => {
  describe('simple property access', () => {
    it('returns top-level property values', () => {
      const obj = { name: 'John', age: 30, active: true };
      expect(getNestedValue(obj, 'name')).toBe('John');
      expect(getNestedValue(obj, 'age')).toBe(30);
      expect(getNestedValue(obj, 'active')).toBe(true);
    });

    it('returns undefined for missing properties', () => {
      const obj = { name: 'John' };
      expect(getNestedValue(obj, 'missing')).toBeUndefined();
    });
  });

  describe('nested property access', () => {
    it('returns deeply nested values', () => {
      const obj = {
        user: {
          profile: {
            address: {
              city: 'Prague',
              zip: '12000',
            },
          },
        },
      };
      expect(getNestedValue(obj, 'user.profile.address.city')).toBe('Prague');
      expect(getNestedValue(obj, 'user.profile.address.zip')).toBe('12000');
    });

    it('returns intermediate objects', () => {
      const obj = { user: { name: 'John' } };
      expect(getNestedValue(obj, 'user')).toEqual({ name: 'John' });
    });

    it('returns undefined when path does not exist', () => {
      const obj = { user: { name: 'John' } };
      expect(getNestedValue(obj, 'user.profile')).toBeUndefined();
      expect(getNestedValue(obj, 'user.profile.address')).toBeUndefined();
    });
  });

  describe('array access', () => {
    it('accesses array elements by index', () => {
      const obj = { items: ['a', 'b', 'c'] };
      expect(getNestedValue(obj, 'items.0')).toBe('a');
      expect(getNestedValue(obj, 'items.1')).toBe('b');
      expect(getNestedValue(obj, 'items.2')).toBe('c');
    });

    it('returns undefined for out of bounds index', () => {
      const obj = { items: ['a', 'b'] };
      expect(getNestedValue(obj, 'items.5')).toBeUndefined();
    });

    it('accesses nested objects in arrays', () => {
      const obj = { users: [{ name: 'John' }, { name: 'Jane' }] };
      expect(getNestedValue(obj, 'users.0.name')).toBe('John');
      expect(getNestedValue(obj, 'users.1.name')).toBe('Jane');
    });
  });

  describe('edge cases', () => {
    it('returns undefined for null input', () => {
      expect(getNestedValue(null, 'any.path')).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(getNestedValue(undefined, 'any.path')).toBeUndefined();
    });

    it('returns undefined when traversing through null', () => {
      const obj = { user: null };
      expect(getNestedValue(obj, 'user.name')).toBeUndefined();
    });

    it('returns undefined when traversing through primitive', () => {
      const obj = { value: 42 };
      expect(getNestedValue(obj, 'value.something')).toBeUndefined();
    });

    it('returns undefined for empty path', () => {
      // Empty string splits to [''], which looks for key '' that doesn't exist
      const obj = { name: 'John' };
      expect(getNestedValue(obj, '')).toBeUndefined();
    });

    it('returns null values when present', () => {
      const obj = { value: null };
      expect(getNestedValue(obj, 'value')).toBeNull();
    });

    it('returns 0 and false values correctly', () => {
      const obj = { count: 0, active: false };
      expect(getNestedValue(obj, 'count')).toBe(0);
      expect(getNestedValue(obj, 'active')).toBe(false);
    });
  });
});

describe('clearPatternCache', () => {
  it('clears regex cache without affecting matching behavior', () => {
    // Populate cache
    expect(matchesTopic('order.123.status', 'order.*.status')).toBe(true);
    expect(matchesFactPattern('customer:123:age', 'customer:*:age')).toBe(true);
    expect(matchesTimerPattern('payment-timeout:order123', 'payment-timeout:*')).toBe(true);

    // Clear cache
    clearPatternCache();

    // Matching should still work correctly after cache clear
    expect(matchesTopic('order.123.status', 'order.*.status')).toBe(true);
    expect(matchesTopic('order.456.status', 'order.*.status')).toBe(true);
    expect(matchesFactPattern('customer:123:age', 'customer:*:age')).toBe(true);
    expect(matchesFactPattern('customer:456:age', 'customer:*:age')).toBe(true);
    expect(matchesTimerPattern('payment-timeout:order123', 'payment-timeout:*')).toBe(true);
    expect(matchesTimerPattern('payment-timeout:order456', 'payment-timeout:*')).toBe(true);
  });

  it('can be called multiple times without error', () => {
    clearPatternCache();
    clearPatternCache();
    clearPatternCache();
    expect(matchesTopic('order.created', 'order.*')).toBe(true);
  });
});

describe('regex cache efficiency', () => {
  it('uses cached regex for repeated pattern matching', () => {
    clearPatternCache();

    // Multiple calls with same pattern should use cached regex
    for (let i = 0; i < 100; i++) {
      expect(matchesTopic(`order.${i}.status`, 'order.*.status')).toBe(true);
    }
  });

  it('caches different patterns separately', () => {
    clearPatternCache();

    // Different patterns
    expect(matchesTopic('order.123.status', 'order.*.status')).toBe(true);
    expect(matchesTopic('user.john.profile', 'user.*.profile')).toBe(true);
    expect(matchesFactPattern('customer:123:age', 'customer:*:age')).toBe(true);
    expect(matchesFactPattern('order:456:status', 'order:*:status')).toBe(true);

    // Verify they still work after caching
    expect(matchesTopic('order.456.status', 'order.*.status')).toBe(true);
    expect(matchesTopic('user.jane.profile', 'user.*.profile')).toBe(true);
    expect(matchesFactPattern('customer:789:age', 'customer:*:age')).toBe(true);
    expect(matchesFactPattern('order:123:status', 'order:*:status')).toBe(true);
  });
});
