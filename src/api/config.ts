import type { FastifyServerOptions } from 'fastify';

export interface ServerConfig {
  /** Port, na kterém server naslouchá (výchozí: 3000) */
  port: number;

  /** Host address (výchozí: '0.0.0.0') */
  host: string;

  /** Prefix pro API endpoints (výchozí: '/api/v1') */
  apiPrefix: string;

  /** Zapnout CORS (výchozí: true) */
  cors: boolean;

  /** Zapnout logování (výchozí: true) */
  logger: boolean;

  /** Dodatečné Fastify options */
  fastifyOptions: Omit<FastifyServerOptions, 'logger'> | undefined;
}

export type ServerConfigInput = Partial<ServerConfig>;

export function resolveConfig(input: ServerConfigInput = {}): ServerConfig {
  return {
    port: input.port ?? 3000,
    host: input.host ?? '0.0.0.0',
    apiPrefix: input.apiPrefix ?? '/api/v1',
    cors: input.cors ?? true,
    logger: input.logger ?? true,
    fastifyOptions: input.fastifyOptions
  };
}
