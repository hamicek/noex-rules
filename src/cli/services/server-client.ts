/**
 * HTTP klient pro komunikaci s noex-rules API serverem.
 */

import { ConnectionError } from '../utils/errors.js';
import type {
  AuditCategory,
  AuditEventType,
  AuditEntry,
  AuditQueryResult,
  AuditStats,
} from '../../audit/types.js';

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

/** Parametry pro dotazování audit záznamů */
export interface AuditEntriesParams {
  category?: AuditCategory;
  types?: AuditEventType[];
  ruleId?: string;
  source?: string;
  correlationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

/** Parametry pro export audit záznamů */
export interface AuditExportParams {
  format?: 'json' | 'csv';
  category?: AuditCategory;
  types?: AuditEventType[];
  ruleId?: string;
  source?: string;
  from?: number;
  to?: number;
}

/** Výsledek audit cleanup operace */
export interface AuditCleanupResult {
  removedCount: number;
  remainingCount: number;
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

  /** Sestaví query string z parametrů, vynechá undefined hodnoty */
  private buildQueryString(params: Record<string, string | number | undefined>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }

  /** Provede HTTP request a vrátí raw text místo parsovaného JSON */
  private async requestText(
    method: 'GET' | 'POST',
    endpoint: string,
  ): Promise<string> {
    const url = this.buildUrl(endpoint);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: '*/*' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as ApiErrorResponse | null;
        const message = errorBody?.message ?? `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(message);
      }

      return await response.text();
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

  /** Získá audit záznamy s volitelným filtrováním */
  async getAuditEntries(params: AuditEntriesParams = {}): Promise<AuditQueryResult> {
    const qs = this.buildQueryString({
      category: params.category,
      types: params.types?.join(','),
      ruleId: params.ruleId,
      source: params.source,
      correlationId: params.correlationId,
      from: params.from,
      to: params.to,
      limit: params.limit,
      offset: params.offset,
    });
    return this.get<AuditQueryResult>(`/audit/entries${qs}`);
  }

  /** Získá jeden audit záznam podle ID */
  async getAuditEntry(id: string): Promise<AuditEntry> {
    return this.get<AuditEntry>(`/audit/entries/${encodeURIComponent(id)}`);
  }

  /** Získá statistiky audit logu */
  async getAuditStats(): Promise<AuditStats> {
    return this.get<AuditStats>('/audit/stats');
  }

  /** Exportuje audit záznamy jako raw text (JSON nebo CSV) */
  async exportAudit(params: AuditExportParams = {}): Promise<string> {
    const qs = this.buildQueryString({
      format: params.format,
      category: params.category,
      types: params.types?.join(','),
      ruleId: params.ruleId,
      source: params.source,
      from: params.from,
      to: params.to,
    });
    return this.requestText('GET', `/audit/export${qs}`);
  }

  /** Spustí manuální cleanup starých audit záznamů */
  async cleanupAudit(): Promise<AuditCleanupResult> {
    return this.post<AuditCleanupResult>('/audit/cleanup');
  }
}

/** Vytvoří novou instanci klienta */
export function createServerClient(config: Partial<ServerClientConfig> = {}): ServerClient {
  return new ServerClient(config);
}
