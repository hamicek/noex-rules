import { createHmac, randomUUID } from 'node:crypto';
import type { Event } from '../../types/event.js';

/**
 * Konfigurace pro jednotlivý webhook.
 */
export interface WebhookConfig {
  /** Unikátní ID webhooku */
  id: string;
  /** URL pro doručení */
  url: string;
  /** Topic patterny pro filtrování eventů (podporuje wildcardy) */
  patterns: string[];
  /** Volitelný secret pro HMAC-SHA256 podpis */
  secret?: string;
  /** Vlastní hlavičky pro request */
  headers?: Record<string, string>;
  /** Timeout v ms (výchozí: 10000) */
  timeout?: number;
  /** Aktivní/neaktivní */
  enabled: boolean;
  /** Timestamp vytvoření */
  createdAt: number;
}

/**
 * Vstup pro registraci nového webhooku.
 */
export interface WebhookRegistration {
  url: string;
  patterns?: string[];
  secret?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Výsledek doručení webhooku.
 */
export interface WebhookDeliveryResult {
  webhookId: string;
  eventId: string;
  success: boolean;
  statusCode?: number;
  attempts: number;
  duration: number;
  error?: string;
}

/**
 * Statistiky WebhookManageru.
 */
export interface WebhookManagerStats {
  /** Počet registrovaných webhooků */
  webhookCount: number;
  /** Počet aktivních webhooků */
  activeWebhookCount: number;
  /** Celkový počet doručených eventů */
  totalDeliveries: number;
  /** Počet úspěšných doručení */
  successfulDeliveries: number;
  /** Počet neúspěšných doručení */
  failedDeliveries: number;
}

/**
 * Konfigurace WebhookManageru.
 */
export interface WebhookManagerConfig {
  /** Maximální počet pokusů o doručení (výchozí: 3) */
  maxRetries?: number;
  /** Základ pro exponential backoff v ms (výchozí: 1000) */
  retryBaseDelay?: number;
  /** Výchozí timeout v ms (výchozí: 10000) */
  defaultTimeout?: number;
}

/**
 * Payload odesílaný na webhook.
 */
interface WebhookPayload {
  id: string;
  webhookId: string;
  event: {
    id: string;
    topic: string;
    data: Record<string, unknown>;
    timestamp: number;
    correlationId?: string;
    source: string;
  };
  deliveredAt: number;
}

/**
 * Manager pro webhook notifikace.
 *
 * Umožňuje registrovat webhooky, které budou notifikovány při výskytu eventů
 * odpovídajících zadaným topic patternům. Podporuje HMAC podpis, retry logiku
 * a timeout handling.
 *
 * @example
 * ```typescript
 * const webhookManager = new WebhookManager();
 *
 * // Registrace webhooku
 * const webhook = webhookManager.register({
 *   url: 'https://example.com/webhook',
 *   patterns: ['order.*'],
 *   secret: 'my-secret'
 * });
 *
 * // V engine subscriberu:
 * engine.subscribe('*', async (event, topic) => {
 *   await webhookManager.deliver(event, topic);
 * });
 * ```
 */
export class WebhookManager {
  private readonly webhooks: Map<string, WebhookConfig> = new Map();
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;
  private readonly defaultTimeout: number;

  private totalDeliveries = 0;
  private successfulDeliveries = 0;
  private failedDeliveries = 0;

  constructor(config: WebhookManagerConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseDelay = config.retryBaseDelay ?? 1000;
    this.defaultTimeout = config.defaultTimeout ?? 10000;
  }

  /**
   * Registruje nový webhook.
   *
   * @param registration - Konfigurace webhooku
   * @returns Vytvoření webhook konfigurace
   */
  register(registration: WebhookRegistration): WebhookConfig {
    const id = randomUUID();

    const webhook: WebhookConfig = {
      id,
      url: registration.url,
      patterns: registration.patterns?.length ? registration.patterns : ['*'],
      timeout: registration.timeout ?? this.defaultTimeout,
      enabled: true,
      createdAt: Date.now()
    };

    if (registration.secret !== undefined) {
      webhook.secret = registration.secret;
    }
    if (registration.headers !== undefined) {
      webhook.headers = registration.headers;
    }

    this.webhooks.set(id, webhook);
    return webhook;
  }

  /**
   * Odregistruje webhook.
   *
   * @param id - ID webhooku
   * @returns true pokud byl webhook nalezen a odstraněn
   */
  unregister(id: string): boolean {
    return this.webhooks.delete(id);
  }

  /**
   * Vrátí webhook podle ID.
   */
  get(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  /**
   * Vrátí všechny webhooky.
   */
  list(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Povolí webhook.
   */
  enable(id: string): boolean {
    const webhook = this.webhooks.get(id);
    if (webhook) {
      webhook.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Zakáže webhook.
   */
  disable(id: string): boolean {
    const webhook = this.webhooks.get(id);
    if (webhook) {
      webhook.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Doručí event všem relevantním webhookům.
   *
   * @param event - Event k doručení
   * @param topic - Topic eventu (pro filtrování)
   * @returns Pole výsledků doručení
   */
  async deliver(event: Event, topic: string): Promise<WebhookDeliveryResult[]> {
    const results: WebhookDeliveryResult[] = [];

    const matchingWebhooks = Array.from(this.webhooks.values()).filter(
      (webhook) => webhook.enabled && this.matchesAnyPattern(topic, webhook.patterns)
    );

    const deliveryPromises = matchingWebhooks.map((webhook) =>
      this.deliverToWebhook(webhook, event, topic)
    );

    const deliveryResults = await Promise.all(deliveryPromises);
    results.push(...deliveryResults);

    return results;
  }

  /**
   * Vrátí statistiky manageru.
   */
  getStats(): WebhookManagerStats {
    const webhookList = Array.from(this.webhooks.values());
    return {
      webhookCount: webhookList.length,
      activeWebhookCount: webhookList.filter((w) => w.enabled).length,
      totalDeliveries: this.totalDeliveries,
      successfulDeliveries: this.successfulDeliveries,
      failedDeliveries: this.failedDeliveries
    };
  }

  /**
   * Doručí event na konkrétní webhook s retry logikou.
   */
  private async deliverToWebhook(
    webhook: WebhookConfig,
    event: Event,
    topic: string
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    let lastError: string | undefined;
    let lastStatusCode: number | undefined;

    const payload = this.createPayload(webhook, event, topic);
    const body = JSON.stringify(payload);
    const headers = this.buildHeaders(webhook, body);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.sendRequest(webhook, body, headers);
        lastStatusCode = response.status;

        if (response.ok) {
          this.totalDeliveries++;
          this.successfulDeliveries++;
          return {
            webhookId: webhook.id,
            eventId: event.id,
            success: true,
            statusCode: response.status,
            attempts: attempt,
            duration: Date.now() - startTime
          };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      // Exponential backoff před dalším pokusem (kromě posledního)
      if (attempt < this.maxRetries) {
        const delay = this.retryBaseDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    this.totalDeliveries++;
    this.failedDeliveries++;

    const result: WebhookDeliveryResult = {
      webhookId: webhook.id,
      eventId: event.id,
      success: false,
      attempts: this.maxRetries,
      duration: Date.now() - startTime
    };

    if (lastStatusCode !== undefined) {
      result.statusCode = lastStatusCode;
    }
    if (lastError !== undefined) {
      result.error = lastError;
    }

    return result;
  }

  /**
   * Vytvoří payload pro webhook.
   */
  private createPayload(webhook: WebhookConfig, event: Event, topic: string): WebhookPayload {
    const eventPayload: WebhookPayload['event'] = {
      id: event.id,
      topic,
      data: event.data,
      timestamp: event.timestamp,
      source: event.source
    };

    if (event.correlationId !== undefined) {
      eventPayload.correlationId = event.correlationId;
    }

    return {
      id: randomUUID(),
      webhookId: webhook.id,
      event: eventPayload,
      deliveredAt: Date.now()
    };
  }

  /**
   * Sestaví hlavičky pro request včetně HMAC podpisu.
   */
  private buildHeaders(webhook: WebhookConfig, body: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'noex-rules-webhook/1.0',
      ...webhook.headers
    };

    if (webhook.secret) {
      const signature = this.signPayload(body, webhook.secret);
      headers['X-Webhook-Signature'] = signature;
    }

    return headers;
  }

  /**
   * Vytvoří HMAC-SHA256 podpis payloadu.
   */
  private signPayload(payload: string, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Odešle HTTP request na webhook URL.
   */
  private async sendRequest(
    webhook: WebhookConfig,
    body: string,
    headers: Record<string, string>
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout ?? this.defaultTimeout);

    try {
      return await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Kontroluje, zda se topic shoduje s některým z patternů.
   */
  private matchesAnyPattern(topic: string, patterns: string[]): boolean {
    return patterns.some((pattern) => this.matchesTopicPattern(topic, pattern));
  }

  /**
   * Kontroluje shodu topic s patternem (podporuje wildcardy).
   *
   * Příklady:
   * - '*' matchuje všechno
   * - 'order.*' matchuje 'order.created', 'order.updated'
   * - 'order.created' matchuje pouze 'order.created'
   */
  private matchesTopicPattern(topic: string, pattern: string): boolean {
    if (pattern === '*') return true;

    const patternParts = pattern.split('.');
    const topicParts = topic.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const topicPart = topicParts[i];

      if (patternPart === '*') {
        // Wildcard matchuje jeden segment - musí existovat
        if (topicPart === undefined) return false;
        // Wildcard na konci matchuje zbytek
        if (i === patternParts.length - 1) return true;
        continue;
      }

      if (patternPart !== topicPart) return false;
    }

    return patternParts.length === topicParts.length;
  }

  /**
   * Helper pro čekání (exponential backoff).
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
