/**
 * JSON schémata pro Metrics API (Prometheus scrape endpoint).
 */

export const metricsSchemas = {
  getMetrics: {
    tags: ['Observability'],
    summary: 'Prometheus metrics',
    description: 'Returns all collected metrics in Prometheus text exposition format (v0.0.4)',
    produces: ['text/plain; version=0.0.4; charset=utf-8'],
    response: {
      200: {
        type: 'string',
        description: 'Prometheus text exposition format'
      }
    }
  }
};
