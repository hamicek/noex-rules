import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { RuleEngine } from '../core/rule-engine.js';
import type { RuleEngineConfig } from '../types/index.js';
import { resolveConfig, type ServerConfig, type ServerConfigInput } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';

export interface ServerOptions {
  /** Konfigurace HTTP serveru */
  server?: ServerConfigInput;

  /** Existující RuleEngine instance (pokud není zadána, vytvoří se nová) */
  engine?: RuleEngine;

  /** Konfigurace pro nový RuleEngine (ignorováno pokud je zadán engine) */
  engineConfig?: RuleEngineConfig;
}

export class RuleEngineServer {
  private readonly fastify: FastifyInstance;
  private readonly engine: RuleEngine;
  private readonly config: ServerConfig;
  private readonly ownsEngine: boolean;
  private started = false;

  private constructor(
    fastify: FastifyInstance,
    engine: RuleEngine,
    config: ServerConfig,
    ownsEngine: boolean
  ) {
    this.fastify = fastify;
    this.engine = engine;
    this.config = config;
    this.ownsEngine = ownsEngine;
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

    await fastify.register(
      async (instance) => {
        await registerRoutes(instance, { engine });
      },
      { prefix: config.apiPrefix }
    );

    await fastify.listen({ port: config.port, host: config.host });

    return new RuleEngineServer(fastify, engine, config, ownsEngine);
  }

  getEngine(): RuleEngine {
    return this.engine;
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
