import type { FastifyServerOptions } from 'fastify';

/**
 * CORS konfigurace pro API server.
 *
 * Podporuje všechny standardní CORS headers:
 * - Access-Control-Allow-Origin
 * - Access-Control-Allow-Methods
 * - Access-Control-Allow-Headers
 * - Access-Control-Allow-Credentials
 * - Access-Control-Expose-Headers
 * - Access-Control-Max-Age
 */
export interface CorsConfig {
  /**
   * Povolené origins.
   *
   * - `true` - povolí všechny origins (Access-Control-Allow-Origin: *)
   * - `false` - CORS vypnut
   * - `string` - konkrétní origin (např. 'https://example.com')
   * - `string[]` - seznam povolených origins
   * - `RegExp` - pattern pro matching origins
   * - `(origin: string | undefined) => boolean` - funkce pro dynamické rozhodování
   *
   * Výchozí: true (povolí všechny origins)
   */
  origin?: boolean | string | string[] | RegExp | ((origin: string | undefined) => boolean);

  /**
   * Povolené HTTP metody.
   *
   * Výchozí: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']
   */
  methods?: string[];

  /**
   * Povolené request headers.
   *
   * Výchozí: ['Content-Type', 'Authorization', 'X-Requested-With']
   */
  allowedHeaders?: string[];

  /**
   * Headers které budou vystaveny klientovi.
   *
   * Tyto headers budou čitelné z response v JavaScriptu.
   * Výchozí: ['X-Request-Id']
   */
  exposedHeaders?: string[];

  /**
   * Povolit odesílání credentials (cookies, authorization headers).
   *
   * Pokud je true, origin nesmí být '*' - musí být konkrétní.
   * Výchozí: false
   */
  credentials?: boolean;

  /**
   * Cache doba pro preflight requests v sekundách.
   *
   * Browser si uloží odpověď na OPTIONS request a nebude ji opakovat.
   * Výchozí: 86400 (24 hodin)
   */
  maxAge?: number;

  /**
   * Preflight continue - zda předat preflight request dalším handlerům.
   *
   * Výchozí: false
   */
  preflightContinue?: boolean;

  /**
   * Status code pro úspěšný OPTIONS request.
   *
   * Některé legacy browsers (IE11) mají problém s 204.
   * Výchozí: 204
   */
  optionsSuccessStatus?: number;
}

export interface ServerConfig {
  /** Port, na kterém server naslouchá (výchozí: 3000) */
  port: number;

  /** Host address (výchozí: '0.0.0.0') */
  host: string;

  /** Prefix pro API endpoints (výchozí: '/api/v1') */
  apiPrefix: string;

  /**
   * CORS konfigurace.
   *
   * - `true` - zapnout CORS s výchozími hodnotami
   * - `false` - vypnout CORS
   * - `CorsConfig` - detailní konfigurace
   *
   * Výchozí: true
   */
  cors: boolean | CorsConfig;

  /** Zapnout Swagger/OpenAPI dokumentaci (výchozí: true) */
  swagger: boolean;

  /** Zapnout logování (výchozí: true) */
  logger: boolean;

  /** Dodatečné Fastify options */
  fastifyOptions: Omit<FastifyServerOptions, 'logger'> | undefined;
}

export type ServerConfigInput = Partial<ServerConfig>;

/** Výchozí CORS konfigurace */
const DEFAULT_CORS_CONFIG: Required<CorsConfig> = {
  origin: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Request-Id'],
  credentials: false,
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

/**
 * Vyřeší CORS konfiguraci do formátu pro @fastify/cors.
 */
export function resolveCorsConfig(
  input: boolean | CorsConfig | undefined
): false | Required<CorsConfig> {
  if (input === false) {
    return false;
  }

  if (input === true || input === undefined) {
    return { ...DEFAULT_CORS_CONFIG };
  }

  return {
    origin: input.origin ?? DEFAULT_CORS_CONFIG.origin,
    methods: input.methods ?? DEFAULT_CORS_CONFIG.methods,
    allowedHeaders: input.allowedHeaders ?? DEFAULT_CORS_CONFIG.allowedHeaders,
    exposedHeaders: input.exposedHeaders ?? DEFAULT_CORS_CONFIG.exposedHeaders,
    credentials: input.credentials ?? DEFAULT_CORS_CONFIG.credentials,
    maxAge: input.maxAge ?? DEFAULT_CORS_CONFIG.maxAge,
    preflightContinue: input.preflightContinue ?? DEFAULT_CORS_CONFIG.preflightContinue,
    optionsSuccessStatus: input.optionsSuccessStatus ?? DEFAULT_CORS_CONFIG.optionsSuccessStatus
  };
}

export function resolveConfig(input: ServerConfigInput = {}): ServerConfig {
  return {
    port: input.port ?? 3000,
    host: input.host ?? '0.0.0.0',
    apiPrefix: input.apiPrefix ?? '/api/v1',
    cors: input.cors ?? true,
    swagger: input.swagger ?? true,
    logger: input.logger ?? true,
    fastifyOptions: input.fastifyOptions
  };
}
