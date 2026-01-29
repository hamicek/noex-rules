import { describe, it, expect } from 'vitest';
import {
  formatMetrics,
  escapeLabelValue,
} from '../../../src/observability/prometheus-formatter.js';
import type {
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
} from '../../../src/observability/types.js';

describe('PrometheusFormatter', () => {
  describe('escapeLabelValue', () => {
    it('should return simple strings unchanged', () => {
      expect(escapeLabelValue('hello')).toBe('hello');
    });

    it('should escape backslashes', () => {
      expect(escapeLabelValue('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should escape double quotes', () => {
      expect(escapeLabelValue('say "hello"')).toBe('say \\"hello\\"');
    });

    it('should escape newlines', () => {
      expect(escapeLabelValue('line1\nline2')).toBe('line1\\nline2');
    });

    it('should escape all special characters together', () => {
      expect(escapeLabelValue('a\\b"c\nd')).toBe('a\\\\b\\"c\\nd');
    });

    it('should handle empty string', () => {
      expect(escapeLabelValue('')).toBe('');
    });
  });

  describe('formatMetrics', () => {
    describe('empty input', () => {
      it('should return empty string for no metrics', () => {
        expect(formatMetrics([], [], [])).toBe('');
      });

      it('should return empty string for all empty arrays', () => {
        expect(formatMetrics([], [], [], 'custom')).toBe('');
      });
    });

    describe('counters', () => {
      it('should format a simple counter without labels', () => {
        const counters: CounterMetric[] = [{
          name: 'rules_triggered_total',
          help: 'Total number of rules triggered',
          values: [{ labels: {}, value: 42 }],
        }];

        const result = formatMetrics(counters, [], []);

        expect(result).toBe(
          '# HELP noex_rules_rules_triggered_total Total number of rules triggered\n'
          + '# TYPE noex_rules_rules_triggered_total counter\n'
          + 'noex_rules_rules_triggered_total 42\n',
        );
      });

      it('should format counter with labels', () => {
        const counters: CounterMetric[] = [{
          name: 'rules_executed_total',
          help: 'Total rules executed',
          values: [
            { labels: { rule_id: 'r1', rule_name: 'Check Temperature' }, value: 10 },
            { labels: { rule_id: 'r2', rule_name: 'Check Humidity' }, value: 5 },
          ],
        }];

        const result = formatMetrics(counters, [], []);

        expect(result).toContain(
          'noex_rules_rules_executed_total{rule_id="r1",rule_name="Check Temperature"} 10',
        );
        expect(result).toContain(
          'noex_rules_rules_executed_total{rule_id="r2",rule_name="Check Humidity"} 5',
        );
      });

      it('should format counter with zero value', () => {
        const counters: CounterMetric[] = [{
          name: 'errors_total',
          help: 'Total errors',
          values: [{ labels: {}, value: 0 }],
        }];

        const result = formatMetrics(counters, [], []);

        expect(result).toContain('noex_rules_errors_total 0\n');
      });

      it('should format multiple counters', () => {
        const counters: CounterMetric[] = [
          {
            name: 'triggered_total',
            help: 'Triggers',
            values: [{ labels: {}, value: 100 }],
          },
          {
            name: 'executed_total',
            help: 'Executions',
            values: [{ labels: {}, value: 80 }],
          },
        ];

        const result = formatMetrics(counters, [], []);

        expect(result).toContain('# TYPE noex_rules_triggered_total counter');
        expect(result).toContain('noex_rules_triggered_total 100');
        expect(result).toContain('# TYPE noex_rules_executed_total counter');
        expect(result).toContain('noex_rules_executed_total 80');
      });

      it('should escape special characters in label values', () => {
        const counters: CounterMetric[] = [{
          name: 'test_total',
          help: 'Test counter',
          values: [{ labels: { name: 'rule "special\\path\nnewline"' }, value: 1 }],
        }];

        const result = formatMetrics(counters, [], []);

        expect(result).toContain(
          'noex_rules_test_total{name="rule \\"special\\\\path\\nnewline\\""} 1',
        );
      });

      it('should output counter with no values as HELP and TYPE only', () => {
        const counters: CounterMetric[] = [{
          name: 'empty_total',
          help: 'No values yet',
          values: [],
        }];

        const result = formatMetrics(counters, [], []);

        expect(result).toContain('# HELP noex_rules_empty_total No values yet');
        expect(result).toContain('# TYPE noex_rules_empty_total counter');
        // No value line
        const lines = result.trim().split('\n');
        expect(lines).toHaveLength(2);
      });
    });

    describe('gauges', () => {
      it('should format a simple gauge', () => {
        const gauges: GaugeMetric[] = [{
          name: 'active_rules',
          help: 'Number of currently active rules',
          value: 15,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toBe(
          '# HELP noex_rules_active_rules Number of currently active rules\n'
          + '# TYPE noex_rules_active_rules gauge\n'
          + 'noex_rules_active_rules 15\n',
        );
      });

      it('should format gauge with zero value', () => {
        const gauges: GaugeMetric[] = [{
          name: 'active_timers',
          help: 'Active timers',
          value: 0,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('noex_rules_active_timers 0\n');
      });

      it('should format gauge with decimal value', () => {
        const gauges: GaugeMetric[] = [{
          name: 'buffer_utilization',
          help: 'Buffer utilization ratio',
          value: 0.75,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('noex_rules_buffer_utilization 0.75\n');
      });

      it('should format multiple gauges', () => {
        const gauges: GaugeMetric[] = [
          { name: 'active_rules', help: 'Rules', value: 10 },
          { name: 'active_facts', help: 'Facts', value: 50 },
          { name: 'active_timers', help: 'Timers', value: 3 },
        ];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('noex_rules_active_rules 10');
        expect(result).toContain('noex_rules_active_facts 50');
        expect(result).toContain('noex_rules_active_timers 3');
      });
    });

    describe('histograms', () => {
      it('should format a histogram without labels', () => {
        const histograms: HistogramMetric[] = [{
          name: 'evaluation_duration_seconds',
          help: 'Duration of rule evaluations',
          buckets: [0.01, 0.05, 0.1, 0.5, 1],
          samples: [{
            labels: {},
            count: 200,
            sum: 12.5,
            bucketCounts: [50, 120, 160, 190, 198],
          }],
        }];

        const result = formatMetrics([], [], histograms);
        const lines = result.trim().split('\n');

        expect(lines).toContain(
          '# HELP noex_rules_evaluation_duration_seconds Duration of rule evaluations',
        );
        expect(lines).toContain(
          '# TYPE noex_rules_evaluation_duration_seconds histogram',
        );
        expect(lines).toContain(
          'noex_rules_evaluation_duration_seconds_bucket{le="0.01"} 50',
        );
        expect(lines).toContain(
          'noex_rules_evaluation_duration_seconds_bucket{le="0.05"} 120',
        );
        expect(lines).toContain(
          'noex_rules_evaluation_duration_seconds_bucket{le="0.1"} 160',
        );
        expect(lines).toContain(
          'noex_rules_evaluation_duration_seconds_bucket{le="0.5"} 190',
        );
        expect(lines).toContain(
          'noex_rules_evaluation_duration_seconds_bucket{le="1"} 198',
        );
        expect(lines).toContain(
          'noex_rules_evaluation_duration_seconds_bucket{le="+Inf"} 200',
        );
        expect(lines).toContain(
          'noex_rules_evaluation_duration_seconds_sum 12.5',
        );
        expect(lines).toContain(
          'noex_rules_evaluation_duration_seconds_count 200',
        );
      });

      it('should format histogram with labels', () => {
        const histograms: HistogramMetric[] = [{
          name: 'action_duration_seconds',
          help: 'Duration of action execution',
          buckets: [0.01, 0.1],
          samples: [{
            labels: { action_type: 'set_fact' },
            count: 30,
            sum: 0.45,
            bucketCounts: [20, 28],
          }],
        }];

        const result = formatMetrics([], [], histograms);

        expect(result).toContain(
          'noex_rules_action_duration_seconds_bucket{action_type="set_fact",le="0.01"} 20',
        );
        expect(result).toContain(
          'noex_rules_action_duration_seconds_bucket{action_type="set_fact",le="0.1"} 28',
        );
        expect(result).toContain(
          'noex_rules_action_duration_seconds_bucket{action_type="set_fact",le="+Inf"} 30',
        );
        expect(result).toContain(
          'noex_rules_action_duration_seconds_sum{action_type="set_fact"} 0.45',
        );
        expect(result).toContain(
          'noex_rules_action_duration_seconds_count{action_type="set_fact"} 30',
        );
      });

      it('should format histogram with multiple label sets', () => {
        const histograms: HistogramMetric[] = [{
          name: 'action_duration_seconds',
          help: 'Action duration',
          buckets: [0.1],
          samples: [
            {
              labels: { action_type: 'set_fact' },
              count: 10,
              sum: 0.5,
              bucketCounts: [8],
            },
            {
              labels: { action_type: 'emit_event' },
              count: 5,
              sum: 0.2,
              bucketCounts: [5],
            },
          ],
        }];

        const result = formatMetrics([], [], histograms);

        // set_fact
        expect(result).toContain(
          'noex_rules_action_duration_seconds_bucket{action_type="set_fact",le="0.1"} 8',
        );
        expect(result).toContain(
          'noex_rules_action_duration_seconds_bucket{action_type="set_fact",le="+Inf"} 10',
        );

        // emit_event
        expect(result).toContain(
          'noex_rules_action_duration_seconds_bucket{action_type="emit_event",le="0.1"} 5',
        );
        expect(result).toContain(
          'noex_rules_action_duration_seconds_bucket{action_type="emit_event",le="+Inf"} 5',
        );
      });

      it('should format histogram with no samples as HELP and TYPE only', () => {
        const histograms: HistogramMetric[] = [{
          name: 'empty_histogram',
          help: 'No data yet',
          buckets: [0.1, 0.5],
          samples: [],
        }];

        const result = formatMetrics([], [], histograms);

        expect(result).toContain('# HELP noex_rules_empty_histogram No data yet');
        expect(result).toContain('# TYPE noex_rules_empty_histogram histogram');
        const lines = result.trim().split('\n');
        expect(lines).toHaveLength(2);
      });

      it('should produce correct line order for histogram', () => {
        const histograms: HistogramMetric[] = [{
          name: 'latency',
          help: 'Latency',
          buckets: [0.1, 0.5],
          samples: [{
            labels: {},
            count: 10,
            sum: 2.5,
            bucketCounts: [5, 8],
          }],
        }];

        const result = formatMetrics([], [], histograms);
        const lines = result.trim().split('\n');

        // Prometheus vyžaduje pořadí: HELP, TYPE, buckets vzestupně, +Inf, sum, count
        expect(lines[0]).toBe('# HELP noex_rules_latency Latency');
        expect(lines[1]).toBe('# TYPE noex_rules_latency histogram');
        expect(lines[2]).toBe('noex_rules_latency_bucket{le="0.1"} 5');
        expect(lines[3]).toBe('noex_rules_latency_bucket{le="0.5"} 8');
        expect(lines[4]).toBe('noex_rules_latency_bucket{le="+Inf"} 10');
        expect(lines[5]).toBe('noex_rules_latency_sum 2.5');
        expect(lines[6]).toBe('noex_rules_latency_count 10');
      });
    });

    describe('custom prefix', () => {
      it('should use custom prefix for all metrics', () => {
        const counters: CounterMetric[] = [{
          name: 'total',
          help: 'Counter',
          values: [{ labels: {}, value: 1 }],
        }];
        const gauges: GaugeMetric[] = [{
          name: 'current',
          help: 'Gauge',
          value: 5,
        }];
        const histograms: HistogramMetric[] = [{
          name: 'latency',
          help: 'Histogram',
          buckets: [1],
          samples: [{
            labels: {},
            count: 1,
            sum: 0.5,
            bucketCounts: [1],
          }],
        }];

        const result = formatMetrics(counters, gauges, histograms, 'myapp');

        expect(result).toContain('myapp_total 1');
        expect(result).toContain('myapp_current 5');
        expect(result).toContain('myapp_latency_bucket{le="1"} 1');
        expect(result).toContain('myapp_latency_sum 0.5');
        expect(result).toContain('myapp_latency_count 1');
      });

      it('should use default prefix when not specified', () => {
        const gauges: GaugeMetric[] = [{
          name: 'active',
          help: 'Active',
          value: 1,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('noex_rules_active 1');
      });
    });

    describe('HELP text escaping', () => {
      it('should escape backslash in help text', () => {
        const gauges: GaugeMetric[] = [{
          name: 'test',
          help: 'Path is C:\\Users\\admin',
          value: 1,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('# HELP noex_rules_test Path is C:\\\\Users\\\\admin');
      });

      it('should escape newline in help text', () => {
        const gauges: GaugeMetric[] = [{
          name: 'test',
          help: 'Line one\nLine two',
          value: 1,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('# HELP noex_rules_test Line one\\nLine two');
      });
    });

    describe('special numeric values', () => {
      it('should format NaN', () => {
        const gauges: GaugeMetric[] = [{
          name: 'ratio',
          help: 'Some ratio',
          value: NaN,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('noex_rules_ratio NaN');
      });

      it('should format positive infinity', () => {
        const gauges: GaugeMetric[] = [{
          name: 'unbounded',
          help: 'Unbounded',
          value: Infinity,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('noex_rules_unbounded +Inf');
      });

      it('should format negative infinity', () => {
        const gauges: GaugeMetric[] = [{
          name: 'neg',
          help: 'Negative',
          value: -Infinity,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('noex_rules_neg -Inf');
      });

      it('should format negative zero as zero', () => {
        const gauges: GaugeMetric[] = [{
          name: 'zero',
          help: 'Zero',
          value: -0,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result).toContain('noex_rules_zero 0\n');
      });
    });

    describe('combined output', () => {
      it('should produce valid output with all metric types', () => {
        const counters: CounterMetric[] = [{
          name: 'events_total',
          help: 'Total events',
          values: [{ labels: {}, value: 1000 }],
        }];
        const gauges: GaugeMetric[] = [{
          name: 'active_rules',
          help: 'Active rules',
          value: 25,
        }];
        const histograms: HistogramMetric[] = [{
          name: 'duration_seconds',
          help: 'Processing duration',
          buckets: [0.1],
          samples: [{
            labels: {},
            count: 100,
            sum: 5.5,
            bucketCounts: [90],
          }],
        }];

        const result = formatMetrics(counters, gauges, histograms);

        // Pořadí: counters → gauges → histograms
        const counterIdx = result.indexOf('# TYPE noex_rules_events_total counter');
        const gaugeIdx = result.indexOf('# TYPE noex_rules_active_rules gauge');
        const histIdx = result.indexOf('# TYPE noex_rules_duration_seconds histogram');

        expect(counterIdx).toBeLessThan(gaugeIdx);
        expect(gaugeIdx).toBeLessThan(histIdx);
      });

      it('should always end with trailing newline', () => {
        const gauges: GaugeMetric[] = [{
          name: 'test',
          help: 'Test',
          value: 1,
        }];

        const result = formatMetrics([], gauges, []);

        expect(result.endsWith('\n')).toBe(true);
        // Ale ne double newline
        expect(result.endsWith('\n\n')).toBe(false);
      });
    });
  });
});
