import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { RuleEngine } from '../core/rule-engine.js';
import type { RuleEngineConfig } from '../types/index.js';
import { resolveConfig, type ServerConfig, type ServerConfigInput } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';
import { registerSwagger } from './swagger.js';
import { WebhookManager, type WebhookManagerConfig } from './notifications/webhook-manager.js';
import { SSEManager, type SSEManagerConfig } from './notifications/sse-manager.js';

export interface ServerOptions {
  /** Konfigurace HTTP serveru */
  server?: ServerConfigInput;

  /** Existující RuleEngine instance (pokud není zadána, vytvoří se nová) */
  engine?: RuleEngine;

  /** Konfigurace pro nový RuleEngine (ignorováno pokud je zadán engine) */
  engineConfig?: RuleEngineConfig;

  /** Konfigurace pro WebhookManager */
  webhookConfig?: WebhookManagerConfig;

  /** Konfigurace pro SSEManager */
  sseConfig?: SSEManagerConfig;
}

export class RuleEngineServer {
  private readonly fastify: FastifyInstance;
  private readonly engine: RuleEngine;
  private readonly config: ServerConfig;
  private readonly ownsEngine: boolean;
  private readonly _webhookManager: WebhookManager;
  private readonly _sseManager: SSEManager;
  private started = false;

  private constructor(
    fastify: FastifyInstance,
    engine: RuleEngine,
    config: ServerConfig,
    ownsEngine: boolean,
    webhookManager: WebhookManager,
    sseManager: SSEManager
  ) {
    this.fastify = fastify;
    this.engine = engine;
    this.config = config;
    this.ownsEngine = ownsEngine;
    this._webhookManager = webhookManager;
    this._sseManager = sseManager;
  }

  static async start(options: ServerOptions = {}): Promise<RuleEngineServer> {
    const config = resolveConfig(options.server);

    const fastify = Fastify({
      logger: config.logger,
      ...config.fastifyOptions
    });

    fastify.setErrorHandler(errorHandler);

    if (config.cors) {
      await fastify.register(cors);
    }

    if (config.swagger) {
      await registerSwagger(fastify);
    }

    let engine: RuleEngine;
    let ownsEngine: boolean;

    if (options.engine) {
      engine = options.engine;
      ownsEngine = false;
    } else {
      engine = await RuleEngine.start(options.engineConfig ?? {});
      ownsEngine = true;
    }

    const webhookManager = new WebhookManager(options.webhookConfig);
    const sseManager = new SSEManager(options.sseConfig);

    // Spustit SSE heartbeat
    sseManager.start();

    // Propojit engine eventy s notifikačními manažery
    engine.subscribe('*', (event, topic) => {
      // Webhook delivery je async, spustíme na pozadí
      webhookManager.deliver(event, topic).catch(() => {
        // Chyby doručení jsou logovány v WebhookManager
      });
      sseManager.broadcast(event, topic);
    });

    await fastify.register(
      async (instance) => {
        await registerRoutes(instance, { engine, webhookManager, sseManager });
      },
      { prefix: config.apiPrefix }
    );

    await fastify.listen({ port: config.port, host: config.host });

    return new RuleEngineServer(fastify, engine, config, ownsEngine, webhookManager, sseManager);
  }

  getEngine(): RuleEngine {
    return this.engine;
  }

  getWebhookManager(): WebhookManager {
    return this._webhookManager;
  }

  getSSEManager(): SSEManager {
    return this._sseManager;
  }

  get address(): string {
    const addr = this.fastify.server.address();
    if (typeof addr === 'string') {
      return addr;
    }
    if (addr) {
      return `http://${addr.address === '::' ? 'localhost' : addr.address}:${addr.port}`;
    }
    return '';
  }

  get port(): number {
    return this.config.port;
  }

  async stop(): Promise<void> {
    // Zastavit SSE manager (uzavře všechna připojení)
    this._sseManager.stop();

    await this.fastify.close();

    if (this.ownsEngine) {
      await this.engine.stop();
    }
  }
}
