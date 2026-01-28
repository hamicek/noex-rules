import type { FastifyInstance } from 'fastify';
import type {
  WebhookManager,
  WebhookConfig,
  WebhookRegistration,
  WebhookManagerStats
} from '../notifications/webhook-manager.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import { webhooksSchemas } from '../schemas/webhook.js';

interface WebhookParams {
  id: string;
}

interface CreateWebhookBody {
  url: string;
  patterns?: string[];
  secret?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

interface WebhookResponse extends Omit<WebhookConfig, 'secret'> {
  hasSecret: boolean;
}

function toWebhookResponse(webhook: WebhookConfig): WebhookResponse {
  const { secret, ...rest } = webhook;
  return {
    ...rest,
    hasSecret: !!secret
  };
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function registerWebhooksRoutes(
  fastify: FastifyInstance,
  webhookManager: WebhookManager
): Promise<void> {
  // GET /webhooks - Seznam webhooků
  fastify.get('/webhooks', { schema: webhooksSchemas.list }, async (): Promise<WebhookResponse[]> => {
    return webhookManager.list().map(toWebhookResponse);
  });

  // GET /webhooks/stats - Statistiky webhooků
  fastify.get('/webhooks/stats', { schema: webhooksSchemas.stats }, async (): Promise<WebhookManagerStats> => {
    return webhookManager.getStats();
  });

  // GET /webhooks/:id - Detail webhooku
  fastify.get<{ Params: WebhookParams }>(
    '/webhooks/:id',
    { schema: webhooksSchemas.get },
    async (request): Promise<WebhookResponse> => {
      const webhook = webhookManager.get(request.params.id);
      if (!webhook) {
        throw new NotFoundError('Webhook', request.params.id);
      }
      return toWebhookResponse(webhook);
    }
  );

  // POST /webhooks - Registrace webhooku
  fastify.post<{ Body: CreateWebhookBody }>(
    '/webhooks',
    { schema: webhooksSchemas.create },
    async (request, reply): Promise<WebhookResponse> => {
      const { url, patterns, secret, headers, timeout } = request.body;

      // Dodatečná validace URL protokolu
      if (!isValidUrl(url)) {
        throw new ValidationError('Invalid URL format. Must be a valid HTTP or HTTPS URL');
      }

      const registration: WebhookRegistration = { url };

      if (patterns !== undefined) {
        registration.patterns = patterns;
      }
      if (secret !== undefined) {
        registration.secret = secret;
      }
      if (headers !== undefined) {
        registration.headers = headers;
      }
      if (timeout !== undefined) {
        registration.timeout = timeout;
      }

      const webhook = webhookManager.register(registration);
      reply.status(201);
      return toWebhookResponse(webhook);
    }
  );

  // POST /webhooks/:id/enable - Povolení webhooku
  fastify.post<{ Params: WebhookParams }>(
    '/webhooks/:id/enable',
    { schema: webhooksSchemas.enable },
    async (request): Promise<WebhookResponse> => {
      const success = webhookManager.enable(request.params.id);
      if (!success) {
        throw new NotFoundError('Webhook', request.params.id);
      }
      const webhook = webhookManager.get(request.params.id)!;
      return toWebhookResponse(webhook);
    }
  );

  // POST /webhooks/:id/disable - Zakázání webhooku
  fastify.post<{ Params: WebhookParams }>(
    '/webhooks/:id/disable',
    { schema: webhooksSchemas.disable },
    async (request): Promise<WebhookResponse> => {
      const success = webhookManager.disable(request.params.id);
      if (!success) {
        throw new NotFoundError('Webhook', request.params.id);
      }
      const webhook = webhookManager.get(request.params.id)!;
      return toWebhookResponse(webhook);
    }
  );

  // DELETE /webhooks/:id - Smazání webhooku
  fastify.delete<{ Params: WebhookParams }>(
    '/webhooks/:id',
    { schema: webhooksSchemas.delete },
    async (request, reply): Promise<void> => {
      const deleted = webhookManager.unregister(request.params.id);
      if (!deleted) {
        throw new NotFoundError('Webhook', request.params.id);
      }
      reply.status(204);
    }
  );
}
