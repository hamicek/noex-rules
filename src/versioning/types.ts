import type { StorageAdapter } from '@hamicek/noex';
import type { Rule } from '../types/rule.js';

/** Type of change that created a version entry */
export type RuleChangeType =
  | 'registered'
  | 'updated'
  | 'enabled'
  | 'disabled'
  | 'unregistered'
  | 'rolled_back';

/** A single version snapshot of a rule */
export interface RuleVersionEntry {
  /** Sequential version number within the rule's version history (1-based) */
  version: number;

  /** Full snapshot of the rule at this version */
  ruleSnapshot: Rule;

  /** Timestamp when this version was created */
  timestamp: number;

  /** Type of change that created this version */
  changeType: RuleChangeType;

  /** If changeType is 'rolled_back', the global rule version before rollback */
  rolledBackFrom?: number;

  /** Optional human-readable description of the change */
  description?: string;
}

/** Options passed to recordVersion() */
export interface RecordVersionOptions {
  /** If changeType is 'rolled_back', the global rule version before rollback */
  rolledBackFrom?: number;

  /** Optional human-readable description of the change */
  description?: string;
}

/** Query parameters for version history */
export interface RuleVersionQuery {
  /** Rule ID to query versions for */
  ruleId: string;

  /** Maximum number of entries to return (default: 50) */
  limit?: number;

  /** Number of entries to skip for pagination */
  offset?: number;

  /** Sort order by version number (default: 'desc') */
  order?: 'asc' | 'desc';

  /** Filter: minimum version number (inclusive) */
  fromVersion?: number;

  /** Filter: maximum version number (inclusive) */
  toVersion?: number;

  /** Filter: only include specific change types */
  changeTypes?: RuleChangeType[];

  /** Filter: entries created after this timestamp (inclusive) */
  from?: number;

  /** Filter: entries created before this timestamp (inclusive) */
  to?: number;
}

/** Result of a version history query */
export interface RuleVersionQueryResult {
  /** Matching version entries */
  entries: RuleVersionEntry[];

  /** Total number of versions for this rule (before filtering) */
  totalVersions: number;

  /** Whether more entries exist beyond the current page */
  hasMore: boolean;
}

/** A single field-level change between two versions */
export interface RuleFieldChange {
  /** Path of the changed field (e.g. 'name', 'priority', 'trigger.type') */
  field: string;

  /** Value in the older version */
  oldValue: unknown;

  /** Value in the newer version */
  newValue: unknown;
}

/** Diff result comparing two versions of a rule */
export interface RuleVersionDiff {
  /** Rule ID being compared */
  ruleId: string;

  /** Version number of the older snapshot */
  fromVersion: number;

  /** Version number of the newer snapshot */
  toVersion: number;

  /** List of field-level changes between the two versions */
  changes: RuleFieldChange[];
}

/** Configuration for rule versioning */
export interface VersioningConfig {
  /** Storage adapter for persisting version history */
  adapter: StorageAdapter;

  /** Maximum number of versions to keep per rule (default: 100) */
  maxVersionsPerRule?: number;

  /** Maximum age of version entries in milliseconds (default: 90 days) */
  maxAgeMs?: number;
}

/** Statistics about the versioning service */
export interface VersioningStats {
  /** Number of rules that have version history */
  trackedRules: number;

  /** Total number of version entries across all rules */
  totalVersions: number;

  /** Number of rules with unsaved changes */
  dirtyRules: number;

  /** Timestamp of the oldest version entry, or null if empty */
  oldestEntry: number | null;

  /** Timestamp of the newest version entry, or null if empty */
  newestEntry: number | null;
}
