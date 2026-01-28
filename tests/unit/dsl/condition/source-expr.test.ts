import { describe, it, expect } from 'vitest';
import { event, fact, context } from '../../../../src/dsl/condition/source-expr';
import { ref } from '../../../../src/dsl/helpers/ref';

describe('event', () => {
  it('creates source expression for event field', () => {
    const expr = event('orderId');
    const condition = expr.eq('ORD-123').build();

    expect(condition.source).toEqual({ type: 'event', field: 'orderId' });
    expect(condition.operator).toBe('eq');
    expect(condition.value).toBe('ORD-123');
  });

  it('supports nested field paths', () => {
    const condition = event('customer.address.city').eq('Prague').build();
    expect(condition.source).toEqual({ type: 'event', field: 'customer.address.city' });
  });
});

describe('fact', () => {
  it('creates source expression for fact pattern', () => {
    const condition = fact('customer:123:vip').eq(true).build();

    expect(condition.source).toEqual({ type: 'fact', pattern: 'customer:123:vip' });
    expect(condition.operator).toBe('eq');
    expect(condition.value).toBe(true);
  });

  it('supports interpolation patterns', () => {
    const condition = fact('order:${event.orderId}:status').eq('pending').build();
    expect(condition.source).toEqual({
      type: 'fact',
      pattern: 'order:${event.orderId}:status',
    });
  });
});

describe('context', () => {
  it('creates source expression for context key', () => {
    const condition = context('threshold').lte(100).build();

    expect(condition.source).toEqual({ type: 'context', key: 'threshold' });
    expect(condition.operator).toBe('lte');
    expect(condition.value).toBe(100);
  });
});

describe('operators', () => {
  describe('comparison operators', () => {
    it('eq - equals', () => {
      const condition = event('status').eq('active').build();
      expect(condition.operator).toBe('eq');
      expect(condition.value).toBe('active');
    });

    it('neq - not equals', () => {
      const condition = event('status').neq('deleted').build();
      expect(condition.operator).toBe('neq');
      expect(condition.value).toBe('deleted');
    });

    it('gt - greater than', () => {
      const condition = event('amount').gt(100).build();
      expect(condition.operator).toBe('gt');
      expect(condition.value).toBe(100);
    });

    it('gte - greater than or equal', () => {
      const condition = event('amount').gte(100).build();
      expect(condition.operator).toBe('gte');
      expect(condition.value).toBe(100);
    });

    it('lt - less than', () => {
      const condition = event('amount').lt(50).build();
      expect(condition.operator).toBe('lt');
      expect(condition.value).toBe(50);
    });

    it('lte - less than or equal', () => {
      const condition = event('amount').lte(50).build();
      expect(condition.operator).toBe('lte');
      expect(condition.value).toBe(50);
    });
  });

  describe('list operators', () => {
    it('in - value in list', () => {
      const condition = event('status').in(['pending', 'active', 'completed']).build();
      expect(condition.operator).toBe('in');
      expect(condition.value).toEqual(['pending', 'active', 'completed']);
    });

    it('notIn - value not in list', () => {
      const condition = event('status').notIn(['deleted', 'archived']).build();
      expect(condition.operator).toBe('not_in');
      expect(condition.value).toEqual(['deleted', 'archived']);
    });
  });

  describe('string/array operators', () => {
    it('contains - contains value', () => {
      const condition = event('items').contains('SKU-123').build();
      expect(condition.operator).toBe('contains');
      expect(condition.value).toBe('SKU-123');
    });

    it('notContains - does not contain value', () => {
      const condition = event('tags').notContains('deprecated').build();
      expect(condition.operator).toBe('not_contains');
      expect(condition.value).toBe('deprecated');
    });

    it('matches - regex pattern', () => {
      const condition = event('email').matches('^[a-z]+@example.com$').build();
      expect(condition.operator).toBe('matches');
      expect(condition.value).toBe('^[a-z]+@example.com$');
    });

    it('matches - accepts RegExp and extracts source', () => {
      const condition = event('email').matches(/^[a-z]+@example\.com$/i).build();
      expect(condition.operator).toBe('matches');
      expect(condition.value).toBe('^[a-z]+@example\\.com$');
    });
  });

  describe('existence operators', () => {
    it('exists - value exists', () => {
      const condition = event('optionalField').exists().build();
      expect(condition.operator).toBe('exists');
      expect(condition.value).toBe(true);
    });

    it('notExists - value does not exist', () => {
      const condition = event('deletedAt').notExists().build();
      expect(condition.operator).toBe('not_exists');
      expect(condition.value).toBe(true);
    });
  });

  describe('reference values', () => {
    it('accepts ref() as comparison value', () => {
      const condition = event('amount').gte(ref('fact.threshold')).build();
      expect(condition.operator).toBe('gte');
      expect(condition.value).toEqual({ ref: 'fact.threshold' });
    });

    it('accepts ref() in list operators', () => {
      const condition = event('category').in(ref('fact.allowedCategories')).build();
      expect(condition.operator).toBe('in');
      expect(condition.value).toEqual({ ref: 'fact.allowedCategories' });
    });
  });

  describe('error handling', () => {
    it('throws when building without operator', () => {
      const expr = event('field');
      expect(() => expr.build()).toThrow('Condition operator not specified');
    });
  });
});
