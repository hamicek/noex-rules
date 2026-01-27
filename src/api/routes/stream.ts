import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SSEManager, SSEManagerStats } from '../notifications/sse-manager.js';

interface StreamQuerystring {
  patterns?: string;
}

interface ConnectionInfo {
  id: string;
  patterns: string[];
  connectedAt: number;
}

/**
 * Generuje unikátní ID pro SSE připojení.
 */
function generateConnectionId(): string {
  return `sse-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Parsuje patterns z query stringu.
 * Podporuje formáty: "pattern1,pattern2" nebo "pattern1"
 */
function parsePatterns(patternsParam?: string): string[] {
  if (!patternsParam || typeof patternsParam !== 'string') {
    return ['*'];
  }

  const patterns = patternsParam
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return patterns.length > 0 ? patterns : ['*'];
}

export async function registerStreamRoutes(
  fastify: FastifyInstance,
  sseManager: SSEManager
): Promise<void> {
  // GET /stream/events - SSE stream pro eventy
  fastify.get<{ Querystring: StreamQuerystring }>(
    '/stream/events',
    async (request: FastifyRequest<{ Querystring: StreamQuerystring }>, reply) => {
      const patterns = parsePatterns(request.query.patterns);
      const connectionId = generateConnectionId();

      // Přidáme připojení do SSE manageru
      // Manager nastaví správné hlavičky a bude spravovat připojení
      sseManager.addConnection(connectionId, reply, patterns);

      // Nikdy neukončujeme request - SSE je long-lived connection
      // Fastify by jinak ukončil response, takže musíme vrátit reply bez dalšího zpracování
      return reply;
    }
  );

  // GET /stream/stats - Statistiky SSE připojení
  fastify.get('/stream/stats', async (): Promise<SSEManagerStats> => {
    return sseManager.getStats();
  });

  // GET /stream/connections - Seznam aktivních připojení (pro admin/debug)
  fastify.get('/stream/connections', async (): Promise<ConnectionInfo[]> => {
    return sseManager.getConnections();
  });
}
