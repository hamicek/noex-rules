import { describe, it, expect, expectTypeOf } from 'vitest';
import type { RuleGroup, RuleGroupInput, Rule, RuleInput } from '../../../src/types/index.js';

describe('RuleGroup', () => {
  describe('type compatibility', () => {
    it('should accept minimal valid group', () => {
      const group: RuleGroup = {
        id: 'billing',
        name: 'Billing Rules',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(group.id).toBe('billing');
      expect(group.name).toBe('Billing Rules');
      expect(group.enabled).toBe(true);
      expect(group.description).toBeUndefined();
    });

    it('should accept group with all fields', () => {
      const now = Date.now();
      const group: RuleGroup = {
        id: 'notifications',
        name: 'Notification Rules',
        description: 'All notification-related rules',
        enabled: false,
        createdAt: now,
        updatedAt: now,
      };

      expect(group.id).toBe('notifications');
      expect(group.name).toBe('Notification Rules');
      expect(group.description).toBe('All notification-related rules');
      expect(group.enabled).toBe(false);
      expect(group.createdAt).toBe(now);
      expect(group.updatedAt).toBe(now);
    });

    it('should allow disabled group', () => {
      const group: RuleGroup = {
        id: 'inactive',
        name: 'Inactive Group',
        enabled: false,
        createdAt: 0,
        updatedAt: 0,
      };

      expect(group.enabled).toBe(false);
    });
  });

  describe('type constraints', () => {
    it('should require id', () => {
      // @ts-expect-error - id is required
      const _invalid: RuleGroup = {
        name: 'Missing ID',
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      };
      expect(true).toBe(true);
    });

    it('should require name', () => {
      // @ts-expect-error - name is required
      const _invalid: RuleGroup = {
        id: 'test',
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      };
      expect(true).toBe(true);
    });

    it('should require enabled', () => {
      // @ts-expect-error - enabled is required
      const _invalid: RuleGroup = {
        id: 'test',
        name: 'Test',
        createdAt: 0,
        updatedAt: 0,
      };
      expect(true).toBe(true);
    });

    it('should require createdAt', () => {
      // @ts-expect-error - createdAt is required
      const _invalid: RuleGroup = {
        id: 'test',
        name: 'Test',
        enabled: true,
        updatedAt: 0,
      };
      expect(true).toBe(true);
    });

    it('should require updatedAt', () => {
      // @ts-expect-error - updatedAt is required
      const _invalid: RuleGroup = {
        id: 'test',
        name: 'Test',
        enabled: true,
        createdAt: 0,
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RuleGroup['id']>().toEqualTypeOf<string>();
      expectTypeOf<RuleGroup['name']>().toEqualTypeOf<string>();
      expectTypeOf<RuleGroup['description']>().toEqualTypeOf<string | undefined>();
      expectTypeOf<RuleGroup['enabled']>().toEqualTypeOf<boolean>();
      expectTypeOf<RuleGroup['createdAt']>().toEqualTypeOf<number>();
      expectTypeOf<RuleGroup['updatedAt']>().toEqualTypeOf<number>();
    });
  });
});

describe('RuleGroupInput', () => {
  describe('type compatibility', () => {
    it('should accept minimal input (only required fields)', () => {
      const input: RuleGroupInput = {
        id: 'billing',
        name: 'Billing Rules',
      };

      expect(input.id).toBe('billing');
      expect(input.name).toBe('Billing Rules');
      expect(input.description).toBeUndefined();
      expect(input.enabled).toBeUndefined();
    });

    it('should accept input with all optional fields', () => {
      const input: RuleGroupInput = {
        id: 'billing',
        name: 'Billing Rules',
        description: 'All billing-related rules',
        enabled: false,
      };

      expect(input.description).toBe('All billing-related rules');
      expect(input.enabled).toBe(false);
    });

    it('should default enabled semantically to true when omitted', () => {
      const input: RuleGroupInput = {
        id: 'test',
        name: 'Test',
      };

      // enabled is optional — consumer code should default to true
      expect(input.enabled).toBeUndefined();
    });
  });

  describe('type constraints', () => {
    it('should require id', () => {
      // @ts-expect-error - id is required
      const _invalid: RuleGroupInput = {
        name: 'Missing ID',
      };
      expect(true).toBe(true);
    });

    it('should require name', () => {
      // @ts-expect-error - name is required
      const _invalid: RuleGroupInput = {
        id: 'test',
      };
      expect(true).toBe(true);
    });

    it('should not require enabled', () => {
      const input: RuleGroupInput = {
        id: 'test',
        name: 'Test',
      };
      expect(input.enabled).toBeUndefined();
    });

    it('should not require description', () => {
      const input: RuleGroupInput = {
        id: 'test',
        name: 'Test',
      };
      expect(input.description).toBeUndefined();
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RuleGroupInput['id']>().toEqualTypeOf<string>();
      expectTypeOf<RuleGroupInput['name']>().toEqualTypeOf<string>();
      expectTypeOf<RuleGroupInput['description']>().toEqualTypeOf<string | undefined>();
      expectTypeOf<RuleGroupInput['enabled']>().toEqualTypeOf<boolean | undefined>();
    });

    it('should not include auto-generated fields from RuleGroup', () => {
      type InputKeys = keyof RuleGroupInput;
      expectTypeOf<'createdAt' extends InputKeys ? true : false>().toEqualTypeOf<false>();
      expectTypeOf<'updatedAt' extends InputKeys ? true : false>().toEqualTypeOf<false>();
    });
  });
});

describe('Rule.group field', () => {
  describe('type compatibility', () => {
    it('should allow Rule without group', () => {
      const rule: Rule = {
        id: 'test-rule',
        name: 'Test Rule',
        priority: 100,
        enabled: true,
        version: 1,
        tags: [],
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [],
        actions: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(rule.group).toBeUndefined();
    });

    it('should allow Rule with group', () => {
      const rule: Rule = {
        id: 'billing-rule',
        name: 'Billing Rule',
        priority: 100,
        enabled: true,
        version: 1,
        tags: ['billing'],
        group: 'billing',
        trigger: { type: 'event', topic: 'invoice.created' },
        conditions: [],
        actions: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(rule.group).toBe('billing');
    });
  });

  describe('RuleInput propagation', () => {
    it('should include group in RuleInput', () => {
      const input: RuleInput = {
        id: 'test-rule',
        name: 'Test Rule',
        priority: 100,
        enabled: true,
        tags: [],
        group: 'my-group',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
      };

      expect(input.group).toBe('my-group');
    });

    it('should allow RuleInput without group', () => {
      const input: RuleInput = {
        id: 'test-rule',
        name: 'Test Rule',
        priority: 100,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
      };

      expect(input.group).toBeUndefined();
    });
  });

  describe('type-level assertions', () => {
    it('should have optional string type for group on Rule', () => {
      expectTypeOf<Rule['group']>().toEqualTypeOf<string | undefined>();
    });

    it('should have optional string type for group on RuleInput', () => {
      expectTypeOf<RuleInput['group']>().toEqualTypeOf<string | undefined>();
    });
  });
});
