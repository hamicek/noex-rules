/**
 * Serializace metrik do Prometheus text exposition formátu (v0.0.4).
 *
 * Pure funkce bez side-effectů — přijímá surová data metrik a vrací
 * naformátovaný string pro HTTP endpoint.
 *
 * @see https://prometheus.io/docs/instrumenting/exposition_formats/
 */

import type {
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  MetricLabels,
} from './types.js';
import { DEFAULT_METRICS_PREFIX } from './types.js';

/**
 * Escapování hodnoty labelu dle Prometheus specifikace.
 * Backslash, uvozovky a newline musí být escapovány.
 */
export function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Serializace labelů do Prometheus formátu: {key="value",key2="value2"}
 * Vrací prázdný string pokud nejsou žádné labely.
 */
function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const parts = entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`);
  return `{${parts.join(',')}}`;
}

/**
 * Serializace labelů rozšířených o extra key-value pár.
 * Používá se pro histogram buckets kde se přidává le="..." label.
 */
function formatLabelsWithExtra(
  labels: MetricLabels,
  extraKey: string,
  extraValue: string,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(labels)) {
    parts.push(`${k}="${escapeLabelValue(v)}"`);
  }
  parts.push(`${extraKey}="${extraValue}"`);
  return `{${parts.join(',')}}`;
}

/**
 * Formátování čísla pro Prometheus output.
 * Speciální hodnoty: +Inf, -Inf, NaN.
 */
function formatNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return Object.is(value, -0) ? '0' : String(value);
}

/**
 * Escapování help textu dle Prometheus specifikace.
 * Backslash a newline musí být escapovány.
 */
function escapeHelp(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

/**
 * Serializace všech metrik do Prometheus text exposition formátu.
 *
 * @param counters - Counter metriky
 * @param gauges - Gauge metriky
 * @param histograms - Histogram metriky
 * @param prefix - Prefix pro názvy metrik (default: 'noex_rules')
 * @returns Naformátovaný text pro Prometheus scrape endpoint
 */
export function formatMetrics(
  counters: CounterMetric[],
  gauges: GaugeMetric[],
  histograms: HistogramMetric[],
  prefix: string = DEFAULT_METRICS_PREFIX,
): string {
  const lines: string[] = [];

  for (const counter of counters) {
    const name = `${prefix}_${counter.name}`;
    lines.push(`# HELP ${name} ${escapeHelp(counter.help)}`);
    lines.push(`# TYPE ${name} counter`);
    for (const { labels, value } of counter.values) {
      lines.push(`${name}${formatLabels(labels)} ${formatNumber(value)}`);
    }
  }

  for (const gauge of gauges) {
    const name = `${prefix}_${gauge.name}`;
    lines.push(`# HELP ${name} ${escapeHelp(gauge.help)}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${formatNumber(gauge.value)}`);
  }

  for (const histogram of histograms) {
    const name = `${prefix}_${histogram.name}`;
    lines.push(`# HELP ${name} ${escapeHelp(histogram.help)}`);
    lines.push(`# TYPE ${name} histogram`);

    for (const sample of histogram.samples) {
      // Bucket lines: name_bucket{...,le="boundary"} count
      for (let i = 0; i < histogram.buckets.length; i++) {
        const le = formatNumber(histogram.buckets[i]!);
        const labelStr = formatLabelsWithExtra(sample.labels, 'le', le);
        lines.push(`${name}_bucket${labelStr} ${sample.bucketCounts[i] ?? 0}`);
      }

      // +Inf bucket (celkový count)
      const infLabelStr = formatLabelsWithExtra(sample.labels, 'le', '+Inf');
      lines.push(`${name}_bucket${infLabelStr} ${sample.count}`);

      // Sum a count
      const labelStr = formatLabels(sample.labels);
      lines.push(`${name}_sum${labelStr} ${formatNumber(sample.sum)}`);
      lines.push(`${name}_count${labelStr} ${sample.count}`);
    }
  }

  if (lines.length === 0) return '';
  return lines.join('\n') + '\n';
}
