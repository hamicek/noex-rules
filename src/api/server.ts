import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { RuleEngine } from '../core/rule-engine.js';
import type { RuleEngineConfig } from '../types/index.js';
import {
  resolveConfig,
  resolveCorsConfig,
  resolveGraphQLConfig,
  type ServerConfig,
  type ServerConfigInput
} from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';
import { registerSwagger } from './swagger.js';
import { registerGraphQL } from './graphql/index.js';
import { WebhookManager, type WebhookManagerConfig } from './notifications/webhook-manager.js';
import { SSEManager, type SSEManagerConfig } from './notifications/sse-manager.js';
import { MetricsCollector } from '../observability/metrics-collector.js';
import type { MetricsConfig } from '../observability/types.js';

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

  /**
   * Konfigurace Prometheus metrik na úrovni serveru.
   *
   * Pokud engine již má MetricsCollector (engine config metrics.enabled),
   * použije se ten. Jinak se z této konfigurace vytvoří nový MetricsCollector
   * vlastněný serverem.
   */
  metricsConfig?: MetricsConfig;
}

export class RuleEngineServer {
  private readonly fastify: FastifyInstance;
  private readonly engine: RuleEngine;
  private readonly config: ServerConfig;
  private readonly ownsEngine: boolean;
  private readonly _webhookManager: WebhookManager;
  private readonly _sseManager: SSEManager;
  private readonly _metricsCollector: MetricsCollector | null;
  private readonly ownsMetrics: boolean;
  private started = false;

  private constructor(
    fastify: FastifyInstance,
    engine: RuleEngine,
    config: ServerConfig,
    ownsEngine: boolean,
    webhookManager: WebhookManager,
    sseManager: SSEManager,
    metricsCollector: MetricsCollector | null,
    ownsMetrics: boolean,
  ) {
    this.fastify = fastify;
    this.engine = engine;
    this.config = config;
    this.ownsEngine = ownsEngine;
    this._webhookManager = webhookManager;
    this._sseManager = sseManager;
    this._metricsCollector = metricsCollector;
    this.ownsMetrics = ownsMetrics;
  }

  static async start(options: ServerOptions = {}): Promise<RuleEngineServer> {
    const config = resolveConfig(options.server);

    const fastify = Fastify({
      logger: config.logger,
      ajv: {
        customOptions: {
          coerceTypes: false,
          removeAdditional: false,
          useDefaults: true,
          allErrors: true
        }
      },
      ...config.fastifyOptions
    });

    fastify.setErrorHandler(errorHandler);

    const corsConfig = resolveCorsConfig(config.cors);
    if (corsConfig !== false) {
      await fastify.register(cors, {
        origin: corsConfig.origin,
        methods: corsConfig.methods,
        allowedHeaders: corsConfig.allowedHeaders,
        exposedHeaders: corsConfig.exposedHeaders,
        credentials: corsConfig.credentials,
        maxAge: corsConfig.maxAge,
        preflightContinue: corsConfig.preflightContinue,
        optionsSuccessStatus: corsConfig.optionsSuccessStatus
      });
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

    // Resolve MetricsCollector: přednost má engine, fallback na server-owned instanci
    let metricsCollector = engine.getMetricsCollector();
    let ownsMetrics = false;

    if (!metricsCollector && options.metricsConfig?.enabled) {
      metricsCollector = new MetricsCollector(
        engine.getTraceCollector(),
        () => engine.getStats(),
        options.metricsConfig,
      );
      ownsMetrics = true;
    }

    const routeContext = {
      engine,
      webhookManager,
      sseManager,
      ...(metricsCollector && { metricsCollector }),
    };

    await fastify.register(
      async (instance) => {
        await registerRoutes(instance, routeContext);
      },
      { prefix: config.apiPrefix }
    );

    const graphqlConfig = resolveGraphQLConfig(config.graphql);
    if (graphqlConfig !== false) {
      await registerGraphQL(fastify, routeContext, graphqlConfig);
    }

    await fastify.listen({ port: config.port, host: config.host });

    return new RuleEngineServer(
      fastify, engine, config, ownsEngine,
      webhookManager, sseManager,
      metricsCollector, ownsMetrics,
    );
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

  getMetricsCollector(): MetricsCollector | null {
    return this._metricsCollector;
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

    // Zastavit server-owned MetricsCollector (engine-owned se zastaví s enginem)
    if (this.ownsMetrics && this._metricsCollector) {
      this._metricsCollector.stop();
    }

    await this.fastify.close();

    if (this.ownsEngine) {
      await this.engine.stop();
    }
  }
}
