/**
 * HTTP klient pro komunikaci s noex-rules API serverem.
 */

import { ConnectionError } from '../utils/errors.js';

/** Konfigurace klienta */
export interface ServerClientConfig {
  /** URL serveru (výchozí: http://localhost:3000) */
  baseUrl: string;
  /** Timeout v ms (výchozí: 30000) */
  timeout: number;
  /** API prefix (výchozí: /api) */
  apiPrefix: string;
}

/** Výchozí konfigurace */
const DEFAULT_CONFIG: ServerClientConfig = {
  baseUrl: 'http://localhost:3000',
  timeout: 30000,
  apiPrefix: '/api/v1'
};

/** Odpověď health endpointu */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: number;
  uptime: number;
  version: string;
  engine: {
    name: string;
    running: boolean;
  };
}

/** Odpověď stats endpointu */
export interface StatsResponse {
  rulesCount: number;
  factsCount: number;
  timersCount: number;
  eventsProcessed: number;
  rulesExecuted: number;
  avgProcessingTimeMs: number;
  timestamp: number;
}

/** Rule z API */
export interface RuleResponse {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  tags: string[];
  trigger: unknown;
  conditions: unknown[];
  actions: unknown[];
}

/** Chyba API odpovědi */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

/** HTTP klient pro API server */
export class ServerClient {
  private readonly config: ServerClientConfig;

  constructor(config: Partial<ServerClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Sestaví URL pro endpoint */
  private buildUrl(endpoint: string): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const prefix = this.config.apiPrefix.replace(/\/$/, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${prefix}${path}`;
  }

  /** Provede HTTP request */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const requestInit: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        signal: controller.signal
      };

      if (body !== undefined) {
        requestInit.body = JSON.stringify(body);
      }

      const response = await fetch(url, requestInit);

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as ApiErrorResponse | null;
        const message = errorBody?.message ?? `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(message);
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          throw new ConnectionError(url, new Error('Request timeout'));
        }
        if (
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('fetch failed') ||
          err.message.includes('network')
        ) {
          throw new ConnectionError(url, err);
        }
        throw err;
      }

      throw new ConnectionError(url, err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** GET request */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>('GET', endpoint);
  }

  /** POST request */
  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', endpoint, body);
  }

  /** PUT request */
  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', endpoint, body);
  }

  /** DELETE request */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint);
  }

  /** Získá health status */
  async getHealth(): Promise<HealthResponse> {
    return this.get<HealthResponse>('/health');
  }

  /** Získá statistiky */
  async getStats(): Promise<StatsResponse> {
    return this.get<StatsResponse>('/stats');
  }

  /** Získá seznam pravidel */
  async getRules(): Promise<RuleResponse[]> {
    return this.get<RuleResponse[]>('/rules');
  }

  /** Získá pravidlo podle ID */
  async getRule(id: string): Promise<RuleResponse> {
    return this.get<RuleResponse>(`/rules/${encodeURIComponent(id)}`);
  }

  /** Povolí pravidlo */
  async enableRule(id: string): Promise<RuleResponse> {
    return this.post<RuleResponse>(`/rules/${encodeURIComponent(id)}/enable`);
  }

  /** Zakáže pravidlo */
  async disableRule(id: string): Promise<RuleResponse> {
    return this.post<RuleResponse>(`/rules/${encodeURIComponent(id)}/disable`);
  }

  /** Smaže pravidlo */
  async deleteRule(id: string): Promise<void> {
    return this.delete<void>(`/rules/${encodeURIComponent(id)}`);
  }
}

/** Vytvoří novou instanci klienta */
export function createServerClient(config: Partial<ServerClientConfig> = {}): ServerClient {
  return new ServerClient(config);
}
