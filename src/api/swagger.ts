/**
 * Konfigurace Swagger/OpenAPI dokumentace.
 */
import type { FastifyInstance } from 'fastify';

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  const swagger = await import('@fastify/swagger');
  const swaggerUi = await import('@fastify/swagger-ui');

  await fastify.register(swagger.default, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'noex-rules API',
        description: 'REST API for the noex-rules Rule Engine with Complex Event Processing (CEP)',
        version: '1.0.0',
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server'
        }
      ],
      tags: [
        { name: 'Rules', description: 'Rule management endpoints' },
        { name: 'Facts', description: 'Fact storage endpoints' },
        { name: 'Events', description: 'Event emission endpoints' },
        { name: 'Timers', description: 'Timer management endpoints' },
        { name: 'Webhooks', description: 'Webhook notification endpoints' },
        { name: 'Stream', description: 'Server-Sent Events streaming' },
        { name: 'System', description: 'Health check and statistics' }
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
            description: 'Optional API key for authentication (when configured)'
          }
        }
      }
    }
  });

  await fastify.register(swaggerUi.default, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true
    },
    staticCSP: true
  });
}
