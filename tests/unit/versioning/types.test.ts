import { describe, it, expect, expectTypeOf } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import type { Rule } from '../../../src/types/rule.js';
import type {
  RuleChangeType,
  RuleVersionEntry,
  RecordVersionOptions,
  RuleVersionQuery,
  RuleVersionQueryResult,
  RuleFieldChange,
  RuleVersionDiff,
  VersioningConfig,
  VersioningStats,
} from '../../../src/versioning/types.js';

/** Helper: creates a minimal valid Rule snapshot for tests */
function createRuleSnapshot(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    priority: 100,
    enabled: true,
    version: 1,
    tags: [],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [],
    actions: [{ type: 'log', level: 'info', message: 'Rule fired' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('RuleChangeType', () => {
  describe('type compatibility', () => {
    it('should accept all valid change types', () => {
      const types: RuleChangeType[] = [
        'registered',
        'updated',
        'enabled',
        'disabled',
        'unregistered',
        'rolled_back',
      ];

      expect(types).toHaveLength(6);
      expect(types).toContain('registered');
      expect(types).toContain('updated');
      expect(types).toContain('enabled');
      expect(types).toContain('disabled');
      expect(types).toContain('unregistered');
      expect(types).toContain('rolled_back');
    });

    it('should reject invalid change type', () => {
      // @ts-expect-error - 'archived' is not a valid change type
      const _invalid: RuleChangeType = 'archived';
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should be a union of string literals', () => {
      expectTypeOf<RuleChangeType>().toEqualTypeOf<
        'registered' | 'updated' | 'enabled' | 'disabled' | 'unregistered' | 'rolled_back'
      >();
    });
  });
});

describe('RuleVersionEntry', () => {
  describe('type compatibility', () => {
    it('should accept minimal valid entry', () => {
      const entry: RuleVersionEntry = {
        version: 1,
        ruleSnapshot: createRuleSnapshot(),
        timestamp: Date.now(),
        changeType: 'registered',
      };

      expect(entry.version).toBe(1);
      expect(entry.changeType).toBe('registered');
      expect(entry.ruleSnapshot.id).toBe('test-rule');
      expect(entry.rolledBackFrom).toBeUndefined();
      expect(entry.description).toBeUndefined();
    });

    it('should accept entry with all optional fields', () => {
      const entry: RuleVersionEntry = {
        version: 5,
        ruleSnapshot: createRuleSnapshot({ version: 12 }),
        timestamp: Date.now(),
        changeType: 'rolled_back',
        rolledBackFrom: 11,
        description: 'Rolled back due to production incident',
      };

      expect(entry.version).toBe(5);
      expect(entry.changeType).toBe('rolled_back');
      expect(entry.rolledBackFrom).toBe(11);
      expect(entry.description).toBe('Rolled back due to production incident');
    });

    it('should store complete rule snapshot with all fields', () => {
      const snapshot = createRuleSnapshot({
        id: 'complex-rule',
        name: 'Complex Rule',
        description: 'A complex rule for testing',
        priority: 200,
        enabled: false,
        version: 7,
        tags: ['billing', 'critical'],
        group: 'billing',
        trigger: { type: 'fact', pattern: 'customer:*:status' },
        conditions: [
          { source: { type: 'fact', pattern: 'customer:*:age' }, operator: 'gte', value: 18 },
        ],
        actions: [
          { type: 'emit_event', topic: 'customer.verified', data: { verified: true } },
        ],
      });

      const entry: RuleVersionEntry = {
        version: 3,
        ruleSnapshot: snapshot,
        timestamp: Date.now(),
        changeType: 'updated',
      };

      expect(entry.ruleSnapshot.id).toBe('complex-rule');
      expect(entry.ruleSnapshot.tags).toEqual(['billing', 'critical']);
      expect(entry.ruleSnapshot.group).toBe('billing');
      expect(entry.ruleSnapshot.conditions).toHaveLength(1);
      expect(entry.ruleSnapshot.actions).toHaveLength(1);
    });

    it('should accept every valid changeType', () => {
      const changeTypes: RuleChangeType[] = [
        'registered', 'updated', 'enabled', 'disabled', 'unregistered', 'rolled_back',
      ];
      const entries: RuleVersionEntry[] = changeTypes.map((changeType, i) => ({
        version: i + 1,
        ruleSnapshot: createRuleSnapshot(),
        timestamp: Date.now(),
        changeType,
      }));

      expect(entries).toHaveLength(6);
      entries.forEach((entry, i) => {
        expect(entry.changeType).toBe(changeTypes[i]);
      });
    });
  });

  describe('type constraints', () => {
    it('should require version', () => {
      // @ts-expect-error - version is required
      const _invalid: RuleVersionEntry = {
        ruleSnapshot: createRuleSnapshot(),
        timestamp: Date.now(),
        changeType: 'registered',
      };
      expect(true).toBe(true);
    });

    it('should require ruleSnapshot', () => {
      // @ts-expect-error - ruleSnapshot is required
      const _invalid: RuleVersionEntry = {
        version: 1,
        timestamp: Date.now(),
        changeType: 'registered',
      };
      expect(true).toBe(true);
    });

    it('should require timestamp', () => {
      // @ts-expect-error - timestamp is required
      const _invalid: RuleVersionEntry = {
        version: 1,
        ruleSnapshot: createRuleSnapshot(),
        changeType: 'registered',
      };
      expect(true).toBe(true);
    });

    it('should require changeType', () => {
      // @ts-expect-error - changeType is required
      const _invalid: RuleVersionEntry = {
        version: 1,
        ruleSnapshot: createRuleSnapshot(),
        timestamp: Date.now(),
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RuleVersionEntry['version']>().toEqualTypeOf<number>();
      expectTypeOf<RuleVersionEntry['ruleSnapshot']>().toEqualTypeOf<Rule>();
      expectTypeOf<RuleVersionEntry['timestamp']>().toEqualTypeOf<number>();
      expectTypeOf<RuleVersionEntry['changeType']>().toEqualTypeOf<RuleChangeType>();
      expectTypeOf<RuleVersionEntry['rolledBackFrom']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<RuleVersionEntry['description']>().toEqualTypeOf<string | undefined>();
    });
  });
});

describe('RecordVersionOptions', () => {
  describe('type compatibility', () => {
    it('should accept empty options', () => {
      const opts: RecordVersionOptions = {};

      expect(opts.rolledBackFrom).toBeUndefined();
      expect(opts.description).toBeUndefined();
    });

    it('should accept rolledBackFrom only', () => {
      const opts: RecordVersionOptions = {
        rolledBackFrom: 5,
      };

      expect(opts.rolledBackFrom).toBe(5);
    });

    it('should accept description only', () => {
      const opts: RecordVersionOptions = {
        description: 'Emergency rollback',
      };

      expect(opts.description).toBe('Emergency rollback');
    });

    it('should accept both fields', () => {
      const opts: RecordVersionOptions = {
        rolledBackFrom: 8,
        description: 'Rolled back from version 8 due to regression',
      };

      expect(opts.rolledBackFrom).toBe(8);
      expect(opts.description).toBe('Rolled back from version 8 due to regression');
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RecordVersionOptions['rolledBackFrom']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<RecordVersionOptions['description']>().toEqualTypeOf<string | undefined>();
    });
  });
});

describe('RuleVersionQuery', () => {
  describe('type compatibility', () => {
    it('should accept query with only required fields', () => {
      const query: RuleVersionQuery = {
        ruleId: 'my-rule',
      };

      expect(query.ruleId).toBe('my-rule');
      expect(query.limit).toBeUndefined();
      expect(query.offset).toBeUndefined();
      expect(query.order).toBeUndefined();
      expect(query.fromVersion).toBeUndefined();
      expect(query.toVersion).toBeUndefined();
      expect(query.changeTypes).toBeUndefined();
      expect(query.from).toBeUndefined();
      expect(query.to).toBeUndefined();
    });

    it('should accept query with pagination', () => {
      const query: RuleVersionQuery = {
        ruleId: 'my-rule',
        limit: 20,
        offset: 40,
      };

      expect(query.limit).toBe(20);
      expect(query.offset).toBe(40);
    });

    it('should accept ascending and descending order', () => {
      const ascending: RuleVersionQuery = { ruleId: 'r', order: 'asc' };
      const descending: RuleVersionQuery = { ruleId: 'r', order: 'desc' };

      expect(ascending.order).toBe('asc');
      expect(descending.order).toBe('desc');
    });

    it('should accept version range filter', () => {
      const query: RuleVersionQuery = {
        ruleId: 'my-rule',
        fromVersion: 3,
        toVersion: 10,
      };

      expect(query.fromVersion).toBe(3);
      expect(query.toVersion).toBe(10);
    });

    it('should accept changeTypes filter', () => {
      const query: RuleVersionQuery = {
        ruleId: 'my-rule',
        changeTypes: ['registered', 'updated', 'rolled_back'],
      };

      expect(query.changeTypes).toHaveLength(3);
      expect(query.changeTypes).toContain('registered');
    });

    it('should accept timestamp range filter', () => {
      const now = Date.now();
      const query: RuleVersionQuery = {
        ruleId: 'my-rule',
        from: now - 86400_000,
        to: now,
      };

      expect(query.from).toBeLessThan(query.to!);
    });

    it('should accept fully specified query', () => {
      const now = Date.now();
      const query: RuleVersionQuery = {
        ruleId: 'my-rule',
        limit: 10,
        offset: 20,
        order: 'desc',
        fromVersion: 1,
        toVersion: 50,
        changeTypes: ['updated'],
        from: now - 3600_000,
        to: now,
      };

      expect(query.ruleId).toBe('my-rule');
      expect(query.limit).toBe(10);
      expect(query.offset).toBe(20);
      expect(query.order).toBe('desc');
      expect(query.fromVersion).toBe(1);
      expect(query.toVersion).toBe(50);
      expect(query.changeTypes).toEqual(['updated']);
    });
  });

  describe('type constraints', () => {
    it('should require ruleId', () => {
      // @ts-expect-error - ruleId is required
      const _invalid: RuleVersionQuery = {};
      expect(true).toBe(true);
    });

    it('should reject invalid order value', () => {
      // @ts-expect-error - order must be 'asc' or 'desc'
      const _invalid: RuleVersionQuery = { ruleId: 'r', order: 'random' };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RuleVersionQuery['ruleId']>().toEqualTypeOf<string>();
      expectTypeOf<RuleVersionQuery['limit']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<RuleVersionQuery['offset']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<RuleVersionQuery['order']>().toEqualTypeOf<'asc' | 'desc' | undefined>();
      expectTypeOf<RuleVersionQuery['fromVersion']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<RuleVersionQuery['toVersion']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<RuleVersionQuery['changeTypes']>().toEqualTypeOf<RuleChangeType[] | undefined>();
      expectTypeOf<RuleVersionQuery['from']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<RuleVersionQuery['to']>().toEqualTypeOf<number | undefined>();
    });
  });
});

describe('RuleVersionQueryResult', () => {
  describe('type compatibility', () => {
    it('should accept empty result', () => {
      const result: RuleVersionQueryResult = {
        entries: [],
        totalVersions: 0,
        hasMore: false,
      };

      expect(result.entries).toHaveLength(0);
      expect(result.totalVersions).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should accept result with entries and pagination', () => {
      const result: RuleVersionQueryResult = {
        entries: [
          {
            version: 1,
            ruleSnapshot: createRuleSnapshot(),
            timestamp: Date.now(),
            changeType: 'registered',
          },
          {
            version: 2,
            ruleSnapshot: createRuleSnapshot({ version: 2, name: 'Updated Rule' }),
            timestamp: Date.now(),
            changeType: 'updated',
          },
        ],
        totalVersions: 15,
        hasMore: true,
      };

      expect(result.entries).toHaveLength(2);
      expect(result.totalVersions).toBe(15);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('type constraints', () => {
    it('should require entries', () => {
      // @ts-expect-error - entries is required
      const _invalid: RuleVersionQueryResult = {
        totalVersions: 0,
        hasMore: false,
      };
      expect(true).toBe(true);
    });

    it('should require totalVersions', () => {
      // @ts-expect-error - totalVersions is required
      const _invalid: RuleVersionQueryResult = {
        entries: [],
        hasMore: false,
      };
      expect(true).toBe(true);
    });

    it('should require hasMore', () => {
      // @ts-expect-error - hasMore is required
      const _invalid: RuleVersionQueryResult = {
        entries: [],
        totalVersions: 0,
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RuleVersionQueryResult['entries']>().toEqualTypeOf<RuleVersionEntry[]>();
      expectTypeOf<RuleVersionQueryResult['totalVersions']>().toEqualTypeOf<number>();
      expectTypeOf<RuleVersionQueryResult['hasMore']>().toEqualTypeOf<boolean>();
    });
  });
});

describe('RuleFieldChange', () => {
  describe('type compatibility', () => {
    it('should accept primitive value change', () => {
      const change: RuleFieldChange = {
        field: 'name',
        oldValue: 'Old Name',
        newValue: 'New Name',
      };

      expect(change.field).toBe('name');
      expect(change.oldValue).toBe('Old Name');
      expect(change.newValue).toBe('New Name');
    });

    it('should accept numeric value change', () => {
      const change: RuleFieldChange = {
        field: 'priority',
        oldValue: 100,
        newValue: 200,
      };

      expect(change.oldValue).toBe(100);
      expect(change.newValue).toBe(200);
    });

    it('should accept boolean value change', () => {
      const change: RuleFieldChange = {
        field: 'enabled',
        oldValue: true,
        newValue: false,
      };

      expect(change.oldValue).toBe(true);
      expect(change.newValue).toBe(false);
    });

    it('should accept complex nested value change', () => {
      const change: RuleFieldChange = {
        field: 'trigger',
        oldValue: { type: 'event', topic: 'order.created' },
        newValue: { type: 'fact', pattern: 'customer:*:status' },
      };

      expect(change.field).toBe('trigger');
      expect(change.oldValue).toEqual({ type: 'event', topic: 'order.created' });
      expect(change.newValue).toEqual({ type: 'fact', pattern: 'customer:*:status' });
    });

    it('should accept array value change', () => {
      const change: RuleFieldChange = {
        field: 'tags',
        oldValue: ['billing'],
        newValue: ['billing', 'critical'],
      };

      expect(change.oldValue).toEqual(['billing']);
      expect(change.newValue).toEqual(['billing', 'critical']);
    });

    it('should accept null/undefined transitions', () => {
      const addedDescription: RuleFieldChange = {
        field: 'description',
        oldValue: undefined,
        newValue: 'New description',
      };

      const removedDescription: RuleFieldChange = {
        field: 'description',
        oldValue: 'Old description',
        newValue: undefined,
      };

      expect(addedDescription.oldValue).toBeUndefined();
      expect(addedDescription.newValue).toBe('New description');
      expect(removedDescription.oldValue).toBe('Old description');
      expect(removedDescription.newValue).toBeUndefined();
    });
  });

  describe('type constraints', () => {
    it('should require field', () => {
      // @ts-expect-error - field is required
      const _invalid: RuleFieldChange = {
        oldValue: 'old',
        newValue: 'new',
      };
      expect(true).toBe(true);
    });

    it('should require oldValue', () => {
      // @ts-expect-error - oldValue is required
      const _invalid: RuleFieldChange = {
        field: 'name',
        newValue: 'new',
      };
      expect(true).toBe(true);
    });

    it('should require newValue', () => {
      // @ts-expect-error - newValue is required
      const _invalid: RuleFieldChange = {
        field: 'name',
        oldValue: 'old',
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RuleFieldChange['field']>().toEqualTypeOf<string>();
      expectTypeOf<RuleFieldChange['oldValue']>().toEqualTypeOf<unknown>();
      expectTypeOf<RuleFieldChange['newValue']>().toEqualTypeOf<unknown>();
    });
  });
});

describe('RuleVersionDiff', () => {
  describe('type compatibility', () => {
    it('should accept diff with no changes', () => {
      const diff: RuleVersionDiff = {
        ruleId: 'my-rule',
        fromVersion: 1,
        toVersion: 2,
        changes: [],
      };

      expect(diff.ruleId).toBe('my-rule');
      expect(diff.fromVersion).toBe(1);
      expect(diff.toVersion).toBe(2);
      expect(diff.changes).toHaveLength(0);
    });

    it('should accept diff with multiple field changes', () => {
      const diff: RuleVersionDiff = {
        ruleId: 'billing-rule',
        fromVersion: 3,
        toVersion: 7,
        changes: [
          { field: 'name', oldValue: 'Old Name', newValue: 'New Name' },
          { field: 'priority', oldValue: 100, newValue: 200 },
          { field: 'enabled', oldValue: true, newValue: false },
          {
            field: 'trigger',
            oldValue: { type: 'event', topic: 'order.created' },
            newValue: { type: 'event', topic: 'order.updated' },
          },
        ],
      };

      expect(diff.changes).toHaveLength(4);
      expect(diff.changes[0]!.field).toBe('name');
      expect(diff.changes[3]!.field).toBe('trigger');
    });
  });

  describe('type constraints', () => {
    it('should require ruleId', () => {
      // @ts-expect-error - ruleId is required
      const _invalid: RuleVersionDiff = {
        fromVersion: 1,
        toVersion: 2,
        changes: [],
      };
      expect(true).toBe(true);
    });

    it('should require fromVersion', () => {
      // @ts-expect-error - fromVersion is required
      const _invalid: RuleVersionDiff = {
        ruleId: 'r',
        toVersion: 2,
        changes: [],
      };
      expect(true).toBe(true);
    });

    it('should require toVersion', () => {
      // @ts-expect-error - toVersion is required
      const _invalid: RuleVersionDiff = {
        ruleId: 'r',
        fromVersion: 1,
        changes: [],
      };
      expect(true).toBe(true);
    });

    it('should require changes', () => {
      // @ts-expect-error - changes is required
      const _invalid: RuleVersionDiff = {
        ruleId: 'r',
        fromVersion: 1,
        toVersion: 2,
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RuleVersionDiff['ruleId']>().toEqualTypeOf<string>();
      expectTypeOf<RuleVersionDiff['fromVersion']>().toEqualTypeOf<number>();
      expectTypeOf<RuleVersionDiff['toVersion']>().toEqualTypeOf<number>();
      expectTypeOf<RuleVersionDiff['changes']>().toEqualTypeOf<RuleFieldChange[]>();
    });
  });
});

describe('VersioningConfig', () => {
  describe('type compatibility', () => {
    it('should accept minimal config with only adapter', () => {
      const config: VersioningConfig = {
        adapter: new MemoryAdapter(),
      };

      expect(config.adapter).toBeDefined();
      expect(config.maxVersionsPerRule).toBeUndefined();
      expect(config.maxAgeMs).toBeUndefined();
    });

    it('should accept config with maxVersionsPerRule', () => {
      const config: VersioningConfig = {
        adapter: new MemoryAdapter(),
        maxVersionsPerRule: 50,
      };

      expect(config.maxVersionsPerRule).toBe(50);
    });

    it('should accept config with maxAgeMs', () => {
      const config: VersioningConfig = {
        adapter: new MemoryAdapter(),
        maxAgeMs: 90 * 24 * 3600 * 1000,
      };

      expect(config.maxAgeMs).toBe(90 * 24 * 3600 * 1000);
    });

    it('should accept full config', () => {
      const config: VersioningConfig = {
        adapter: new MemoryAdapter(),
        maxVersionsPerRule: 100,
        maxAgeMs: 30 * 24 * 3600 * 1000,
      };

      expect(config.adapter).toBeDefined();
      expect(config.maxVersionsPerRule).toBe(100);
      expect(config.maxAgeMs).toBe(30 * 24 * 3600 * 1000);
    });
  });

  describe('type constraints', () => {
    it('should require adapter', () => {
      // @ts-expect-error - adapter is required
      const _invalid: VersioningConfig = {};
      expect(true).toBe(true);
    });

    it('should not accept invalid adapter type', () => {
      // @ts-expect-error - adapter must be StorageAdapter
      const _invalid: VersioningConfig = {
        adapter: { notAStorageAdapter: true },
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<VersioningConfig['maxVersionsPerRule']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<VersioningConfig['maxAgeMs']>().toEqualTypeOf<number | undefined>();
    });
  });
});

describe('VersioningStats', () => {
  describe('type compatibility', () => {
    it('should accept empty stats', () => {
      const stats: VersioningStats = {
        trackedRules: 0,
        totalVersions: 0,
        dirtyRules: 0,
        oldestEntry: null,
        newestEntry: null,
      };

      expect(stats.trackedRules).toBe(0);
      expect(stats.totalVersions).toBe(0);
      expect(stats.dirtyRules).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });

    it('should accept populated stats', () => {
      const now = Date.now();
      const stats: VersioningStats = {
        trackedRules: 15,
        totalVersions: 247,
        dirtyRules: 3,
        oldestEntry: now - 86400_000 * 30,
        newestEntry: now,
      };

      expect(stats.trackedRules).toBe(15);
      expect(stats.totalVersions).toBe(247);
      expect(stats.dirtyRules).toBe(3);
      expect(stats.oldestEntry).toBeTypeOf('number');
      expect(stats.newestEntry).toBeTypeOf('number');
      expect(stats.oldestEntry!).toBeLessThan(stats.newestEntry!);
    });
  });

  describe('type constraints', () => {
    it('should require trackedRules', () => {
      // @ts-expect-error - trackedRules is required
      const _invalid: VersioningStats = {
        totalVersions: 0,
        dirtyRules: 0,
        oldestEntry: null,
        newestEntry: null,
      };
      expect(true).toBe(true);
    });

    it('should require totalVersions', () => {
      // @ts-expect-error - totalVersions is required
      const _invalid: VersioningStats = {
        trackedRules: 0,
        dirtyRules: 0,
        oldestEntry: null,
        newestEntry: null,
      };
      expect(true).toBe(true);
    });

    it('should require dirtyRules', () => {
      // @ts-expect-error - dirtyRules is required
      const _invalid: VersioningStats = {
        trackedRules: 0,
        totalVersions: 0,
        oldestEntry: null,
        newestEntry: null,
      };
      expect(true).toBe(true);
    });

    it('should require oldestEntry', () => {
      // @ts-expect-error - oldestEntry is required
      const _invalid: VersioningStats = {
        trackedRules: 0,
        totalVersions: 0,
        dirtyRules: 0,
        newestEntry: null,
      };
      expect(true).toBe(true);
    });

    it('should require newestEntry', () => {
      // @ts-expect-error - newestEntry is required
      const _invalid: VersioningStats = {
        trackedRules: 0,
        totalVersions: 0,
        dirtyRules: 0,
        oldestEntry: null,
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<VersioningStats['trackedRules']>().toEqualTypeOf<number>();
      expectTypeOf<VersioningStats['totalVersions']>().toEqualTypeOf<number>();
      expectTypeOf<VersioningStats['dirtyRules']>().toEqualTypeOf<number>();
      expectTypeOf<VersioningStats['oldestEntry']>().toEqualTypeOf<number | null>();
      expectTypeOf<VersioningStats['newestEntry']>().toEqualTypeOf<number | null>();
    });
  });
});
