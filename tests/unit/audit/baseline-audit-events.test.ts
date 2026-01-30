import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogService } from '../../../src/audit/audit-log-service';
import { AUDIT_EVENT_CATEGORIES } from '../../../src/audit/types';
import type { AuditEventType, AuditEntry } from '../../../src/audit/types';

const BASELINE_EVENT_TYPES: AuditEventType[] = [
  'baseline_registered',
  'baseline_recalculated',
  'baseline_anomaly_detected',
];

describe('Baseline audit event types', () => {
  let service: AuditLogService;

  beforeEach(async () => {
    service = await AuditLogService.start(undefined, { flushIntervalMs: 0 });
  });

  afterEach(async () => {
    await service.stop();
  });

  // ---------------------------------------------------------------------------
  // AUDIT_EVENT_CATEGORIES mapping
  // ---------------------------------------------------------------------------

  describe('AUDIT_EVENT_CATEGORIES mapping', () => {
    it('maps baseline_registered to system category', () => {
      expect(AUDIT_EVENT_CATEGORIES.baseline_registered).toBe('system');
    });

    it('maps baseline_recalculated to system category', () => {
      expect(AUDIT_EVENT_CATEGORIES.baseline_recalculated).toBe('system');
    });

    it('maps baseline_anomaly_detected to rule_execution category', () => {
      expect(AUDIT_EVENT_CATEGORIES.baseline_anomaly_detected).toBe('rule_execution');
    });

    it('has all baseline event types in the mapping', () => {
      for (const type of BASELINE_EVENT_TYPES) {
        expect(AUDIT_EVENT_CATEGORIES).toHaveProperty(type);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Recording baseline audit entries
  // ---------------------------------------------------------------------------

  describe('recording baseline audit entries', () => {
    it('records baseline_registered with correct category', () => {
      const entry = service.record('baseline_registered', {
        metric: 'error_rate',
        topic: 'error.*',
        method: 'zscore',
      });

      expect(entry.type).toBe('baseline_registered');
      expect(entry.category).toBe('system');
      expect(entry.details).toEqual({
        metric: 'error_rate',
        topic: 'error.*',
        method: 'zscore',
      });
    });

    it('records baseline_recalculated with correct category', () => {
      const entry = service.record('baseline_recalculated', {
        metric: 'api_latency',
        sampleCount: 150,
        mean: 42.5,
        stddev: 8.3,
      });

      expect(entry.type).toBe('baseline_recalculated');
      expect(entry.category).toBe('system');
      expect(entry.details.metric).toBe('api_latency');
      expect(entry.details.sampleCount).toBe(150);
    });

    it('records baseline_anomaly_detected with correct category', () => {
      const entry = service.record('baseline_anomaly_detected', {
        metric: 'error_rate',
        currentValue: 250,
        zScore: 3.7,
        severity: 'high',
      });

      expect(entry.type).toBe('baseline_anomaly_detected');
      expect(entry.category).toBe('rule_execution');
      expect(entry.details.severity).toBe('high');
      expect(entry.details.zScore).toBe(3.7);
    });
  });

  // ---------------------------------------------------------------------------
  // Default summaries
  // ---------------------------------------------------------------------------

  describe('default summary generation', () => {
    it('generates "Baseline registered" for baseline_registered', () => {
      const entry = service.record('baseline_registered', {});
      expect(entry.summary).toBe('Baseline registered');
    });

    it('generates "Baseline recalculated" for baseline_recalculated', () => {
      const entry = service.record('baseline_recalculated', {});
      expect(entry.summary).toBe('Baseline recalculated');
    });

    it('generates "Baseline anomaly detected" for baseline_anomaly_detected', () => {
      const entry = service.record('baseline_anomaly_detected', {});
      expect(entry.summary).toBe('Baseline anomaly detected');
    });

    it('allows custom summary override', () => {
      const entry = service.record('baseline_anomaly_detected', {}, {
        summary: 'Error rate spike: 3.7σ above baseline',
      });
      expect(entry.summary).toBe('Error rate spike: 3.7σ above baseline');
    });
  });

  // ---------------------------------------------------------------------------
  // Querying baseline audit entries
  // ---------------------------------------------------------------------------

  describe('querying baseline audit entries', () => {
    beforeEach(() => {
      service.record('baseline_registered', { metric: 'error_rate' }, {
        id: 'b1', timestamp: 1000,
      });
      service.record('baseline_recalculated', { metric: 'error_rate', sampleCount: 100 }, {
        id: 'b2', timestamp: 2000,
      });
      service.record('baseline_anomaly_detected', { metric: 'error_rate', zScore: 3.2 }, {
        id: 'b3', timestamp: 3000,
      });
      service.record('rule_executed', { result: true }, {
        id: 'r1', ruleId: 'rule-1', timestamp: 4000,
      });
      service.record('engine_started', {}, {
        id: 's1', timestamp: 5000,
      });
    });

    it('filters by baseline_registered type', () => {
      const result = service.query({ types: ['baseline_registered'] });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.id).toBe('b1');
    });

    it('filters by baseline_recalculated type', () => {
      const result = service.query({ types: ['baseline_recalculated'] });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.id).toBe('b2');
    });

    it('filters by baseline_anomaly_detected type', () => {
      const result = service.query({ types: ['baseline_anomaly_detected'] });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.id).toBe('b3');
    });

    it('filters multiple baseline types at once', () => {
      const result = service.query({
        types: ['baseline_registered', 'baseline_recalculated', 'baseline_anomaly_detected'],
      });
      expect(result.entries).toHaveLength(3);
      expect(result.entries.map(e => e.id)).toEqual(['b1', 'b2', 'b3']);
    });

    it('includes baseline_anomaly_detected in rule_execution category query', () => {
      const result = service.query({ category: 'rule_execution' });
      const ids = result.entries.map(e => e.id);
      expect(ids).toContain('b3');
      expect(ids).toContain('r1');
    });

    it('includes baseline_registered and baseline_recalculated in system category query', () => {
      const result = service.query({ category: 'system' });
      const ids = result.entries.map(e => e.id);
      expect(ids).toContain('b1');
      expect(ids).toContain('b2');
      expect(ids).toContain('s1');
    });

    it('separates baseline system events from baseline execution events by category', () => {
      const systemResult = service.query({ category: 'system' });
      const executionResult = service.query({ category: 'rule_execution' });

      const systemIds = systemResult.entries.map(e => e.id);
      const executionIds = executionResult.entries.map(e => e.id);

      expect(systemIds).toContain('b1');
      expect(systemIds).toContain('b2');
      expect(systemIds).not.toContain('b3');

      expect(executionIds).toContain('b3');
      expect(executionIds).not.toContain('b1');
      expect(executionIds).not.toContain('b2');
    });
  });

  // ---------------------------------------------------------------------------
  // Subscriber notifications
  // ---------------------------------------------------------------------------

  describe('subscriber notifications for baseline events', () => {
    it('notifies subscriber when baseline_anomaly_detected is recorded', () => {
      const received: AuditEntry[] = [];
      service.subscribe(entry => received.push(entry));

      service.record('baseline_anomaly_detected', {
        metric: 'api_latency',
        zScore: 4.1,
        severity: 'critical',
      });

      expect(received).toHaveLength(1);
      expect(received[0]!.type).toBe('baseline_anomaly_detected');
      expect(received[0]!.details.severity).toBe('critical');
    });

    it('notifies subscriber for all baseline event types', () => {
      const received: AuditEntry[] = [];
      service.subscribe(entry => received.push(entry));

      for (const type of BASELINE_EVENT_TYPES) {
        service.record(type, { metric: 'test_metric' });
      }

      expect(received).toHaveLength(3);
      expect(received.map(e => e.type)).toEqual(BASELINE_EVENT_TYPES);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats integration
  // ---------------------------------------------------------------------------

  describe('stats tracking for baseline events', () => {
    it('counts baseline system events in system category', () => {
      service.record('baseline_registered', { metric: 'a' });
      service.record('baseline_recalculated', { metric: 'a' });

      const stats = service.getStats();
      expect(stats.entriesByCategory.system).toBe(2);
    });

    it('counts baseline anomalies in rule_execution category', () => {
      service.record('baseline_anomaly_detected', { metric: 'a' });

      const stats = service.getStats();
      expect(stats.entriesByCategory.rule_execution).toBe(1);
    });

    it('does not bleed baseline events into other categories', () => {
      service.record('baseline_registered', {});
      service.record('baseline_recalculated', {});
      service.record('baseline_anomaly_detected', {});

      const stats = service.getStats();
      expect(stats.entriesByCategory.fact_change).toBe(0);
      expect(stats.entriesByCategory.event_emitted).toBe(0);
      expect(stats.entriesByCategory.rule_management).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Exhaustiveness – every AuditEventType has a category
  // ---------------------------------------------------------------------------

  describe('type-to-category exhaustiveness', () => {
    it('AUDIT_EVENT_CATEGORIES covers every known audit event type', () => {
      const allTypes: AuditEventType[] = [
        'rule_registered', 'rule_unregistered', 'rule_enabled', 'rule_disabled', 'rule_rolled_back',
        'rule_executed', 'rule_skipped', 'rule_failed',
        'group_created', 'group_updated', 'group_deleted', 'group_enabled', 'group_disabled',
        'fact_created', 'fact_updated', 'fact_deleted',
        'event_emitted',
        'engine_started', 'engine_stopped',
        'hot_reload_started', 'hot_reload_completed', 'hot_reload_failed',
        'baseline_registered', 'baseline_recalculated', 'baseline_anomaly_detected',
        'backward_query_started', 'backward_query_completed',
      ];

      for (const type of allTypes) {
        expect(AUDIT_EVENT_CATEGORIES[type]).toBeDefined();
      }

      // Verify mapping has no extra keys beyond declared types
      expect(Object.keys(AUDIT_EVENT_CATEGORIES)).toHaveLength(allTypes.length);
    });
  });
});
