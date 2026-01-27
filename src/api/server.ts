import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { RuleEngine } from '../core/rule-engine.js';
import type { RuleEngineConfig } from '../types/index.js';
import { resolveConfig, type ServerConfig, type ServerConfigInput } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';
import { WebhookManager, type WebhookManagerConfig } from './notifications/webhook-manager.js';

export interface ServerOptions {
  /** Konfigurace HTTP serveru */
  server?: ServerConfigInput;

  /** Existující RuleEngine instance (pokud není zadána, vytvoří se nová) */
  engine?: RuleEngine;

  /** Konfigurace pro nový RuleEngine (ignorováno pokud je zadán engine) */
  engineConfig?: RuleEngineConfig;

  /** Konfigurace pro WebhookManager */
  webhookConfig?: WebhookManagerConfig;
}

export class RuleEngineServer {
  private readonly fastify: FastifyInstance;
  private readonly engine: RuleEngine;
  private readonly config: ServerConfig;
  private readonly ownsEngine: boolean;
  private readonly _webhookManager: WebhookManager;
  private started = false;

  private constructor(
    fastify: FastifyInstance,
    engine: RuleEngine,
    config: ServerConfig,
    ownsEngine: boolean,
    webhookManager: WebhookManager
  ) {
    this.fastify = fastify;
    this.engine = engine;
    this.config = config;
    this.ownsEngine = ownsEngine;
    this._webhookManager = webhookManager;
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

    await fastify.register(
      async (instance) => {
        await registerRoutes(instance, { engine, webhookManager });
      },
      { prefix: config.apiPrefix }
    );

    await fastify.listen({ port: config.port, host: config.host });

    return new RuleEngineServer(fastify, engine, config, ownsEngine, webhookManager);
  }

  getEngine(): RuleEngine {
    return this.engine;
  }

  getWebhookManager(): WebhookManager {
    return this._webhookManager;
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
    await this.fastify.close();

    if (this.ownsEngine) {
      await this.engine.stop();
    }
  }
}
