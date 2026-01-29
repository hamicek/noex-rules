import type { FastifyInstance } from 'fastify';
import type { MetricsCollector } from '../../observability/metrics-collector.js';
import { formatMetrics } from '../../observability/prometheus-formatter.js';
import { metricsSchemas } from '../schemas/metrics.js';

const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export async function registerMetricsRoutes(
  fastify: FastifyInstance,
  metricsCollector: MetricsCollector,
): Promise<void> {
  fastify.get(
    '/metrics',
    { schema: metricsSchemas.getMetrics },
    async (_request, reply) => {
      const counters = metricsCollector.getCounters();
      const gauges = metricsCollector.getGauges();
      const histograms = metricsCollector.getHistograms();

      const body = formatMetrics(counters, gauges, histograms);

      return reply
        .type(PROMETHEUS_CONTENT_TYPE)
        .send(body);
    },
  );
}
