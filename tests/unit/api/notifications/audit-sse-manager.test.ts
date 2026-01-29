import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuditSSEManager, type AuditSSEClient } from '../../../../src/api/notifications/audit-sse-manager';
import { AuditLogService } from '../../../../src/audit/audit-log-service';
import type { AuditEntry, AuditCategory, AuditEventType } from '../../../../src/audit/types';

function createMockReply(): {
  reply: AuditSSEClient['reply'];
  writtenData: string[];
  headers: Record<string, unknown>;
  ended: boolean;
} {
  const writtenData: string[] = [];
  let headers: Record<string, unknown> = {};
  let ended = false;
  const closeHandlers: Array<() => void> = [];

  const reply = {
    raw: {
      writeHead: vi.fn((status: number, hdrs: Record<string, unknown>) => {
        headers = hdrs;
      }),
      write: vi.fn((data: string) => {
        if (ended) throw new Error('Write after end');
        writtenData.push(data);
        return true;
      }),
      end: vi.fn(() => {
        ended = true;
      }),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandlers.push(handler);
        }
      }),
      get writableEnded() {
        return ended;
      }
    },
    triggerClose: () => {
      closeHandlers.forEach((h) => h());
    }
  } as unknown as AuditSSEClient['reply'] & { triggerClose: () => void };

  return { reply, writtenData, headers, ended };
}

function createAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'entry-1',
    timestamp: Date.now(),
    category: 'rule_execution',
    type: 'rule_executed',
    summary: 'Rule executed',
    source: 'rule-engine',
    details: {},
    ...overrides
  };
}

describe('AuditSSEManager', () => {
  let auditSSE: AuditSSEManager;
  let auditLog: AuditLogService;

  beforeEach(async () => {
    vi.useFakeTimers();
    auditLog = await AuditLogService.start(undefined, { flushIntervalMs: 0 });
    auditSSE = new AuditSSEManager({ heartbeatInterval: 1000 });
  });

  afterEach(() => {
    auditSSE.stop();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates manager with default heartbeat interval', () => {
      const manager = new AuditSSEManager();
      expect(manager.connectionCount).toBe(0);
      manager.stop();
    });

    it('creates manager with custom heartbeat interval', () => {
      const manager = new AuditSSEManager({ heartbeatInterval: 5000 });
      expect(manager.connectionCount).toBe(0);
      manager.stop();
    });
  });

  describe('start/stop', () => {
    it('starts heartbeat timer and subscribes to audit log', () => {
      auditSSE.start(auditLog);
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      vi.advanceTimersByTime(1000);

      expect(writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
    });

    it('broadcasts audit entries from audit log service', () => {
      auditSSE.start(auditLog);
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      auditLog.record('rule_executed', { actionsCount: 1 }, {
        ruleId: 'rule-1',
        ruleName: 'Test Rule'
      });

      expect(writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
    });

    it('does not start heartbeat twice', () => {
      auditSSE.start(auditLog);
      auditSSE.start(auditLog);

      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      vi.advanceTimersByTime(1000);

      const heartbeats = writtenData.filter((d) => d.includes('heartbeat'));
      expect(heartbeats.length).toBe(1);
    });

    it('stops heartbeat timer and unsubscribes', () => {
      auditSSE.start(auditLog);
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      auditSSE.stop();

      vi.advanceTimersByTime(2000);

      const heartbeats = writtenData.filter((d) => d.includes('heartbeat'));
      expect(heartbeats.length).toBe(0);
    });

    it('stops receiving audit entries after stop', () => {
      auditSSE.start(auditLog);
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      const initialLength = writtenData.length;

      auditSSE.stop();

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(writtenData.length).toBe(initialLength);
    });

    it('closes all connections on stop', () => {
      auditSSE.start(auditLog);
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      auditSSE.addConnection('conn-1', mock1.reply);
      auditSSE.addConnection('conn-2', mock2.reply);

      expect(auditSSE.connectionCount).toBe(2);

      auditSSE.stop();

      expect(auditSSE.connectionCount).toBe(0);
      expect(mock1.reply.raw.end).toHaveBeenCalled();
      expect(mock2.reply.raw.end).toHaveBeenCalled();
    });
  });

  describe('addConnection', () => {
    it('adds connection with SSE headers', () => {
      const { reply } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      expect(reply.raw.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
    });

    it('sends connection confirmation comment', () => {
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      expect(writtenData.length).toBeGreaterThanOrEqual(1);
      expect(writtenData[0]).toContain(': connected:conn-1');
    });

    it('sends filter description comment when filter provided', () => {
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply, {
        categories: ['rule_execution'],
        types: ['rule_executed', 'rule_failed'],
        sources: ['rule-engine']
      });

      expect(writtenData.some((d) => d.includes('filter:'))).toBe(true);
      expect(writtenData.some((d) => d.includes('categories=rule_execution'))).toBe(true);
      expect(writtenData.some((d) => d.includes('types=rule_executed,rule_failed'))).toBe(true);
      expect(writtenData.some((d) => d.includes('sources=rule-engine'))).toBe(true);
    });

    it('uses empty filter when no filter specified', () => {
      const { reply } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      const connections = auditSSE.getConnections();
      expect(connections[0].filter).toEqual({});
    });

    it('uses provided filter', () => {
      const { reply } = createMockReply();
      auditSSE.addConnection('conn-1', reply, {
        categories: ['rule_management'],
        ruleIds: ['rule-1', 'rule-2']
      });

      const connections = auditSSE.getConnections();
      expect(connections[0].filter).toEqual({
        categories: ['rule_management'],
        ruleIds: ['rule-1', 'rule-2']
      });
    });

    it('increments connection count', () => {
      expect(auditSSE.connectionCount).toBe(0);

      const { reply: reply1 } = createMockReply();
      auditSSE.addConnection('conn-1', reply1);
      expect(auditSSE.connectionCount).toBe(1);

      const { reply: reply2 } = createMockReply();
      auditSSE.addConnection('conn-2', reply2);
      expect(auditSSE.connectionCount).toBe(2);
    });

    it('registers close handler for automatic cleanup', () => {
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply);

      expect(auditSSE.connectionCount).toBe(1);

      (mock.reply as unknown as { triggerClose: () => void }).triggerClose();

      expect(auditSSE.connectionCount).toBe(0);
    });
  });

  describe('removeConnection', () => {
    it('removes existing connection', () => {
      const { reply } = createMockReply();
      auditSSE.addConnection('conn-1', reply);
      expect(auditSSE.connectionCount).toBe(1);

      auditSSE.removeConnection('conn-1');
      expect(auditSSE.connectionCount).toBe(0);
    });

    it('ends the connection stream', () => {
      const { reply } = createMockReply();
      auditSSE.addConnection('conn-1', reply);

      auditSSE.removeConnection('conn-1');

      expect(reply.raw.end).toHaveBeenCalled();
    });

    it('does nothing for non-existent connection', () => {
      auditSSE.removeConnection('non-existent');
      expect(auditSSE.connectionCount).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('sends audit entry to all clients without filter', () => {
      auditSSE.start(auditLog);
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      auditSSE.addConnection('conn-1', mock1.reply);
      auditSSE.addConnection('conn-2', mock2.reply);

      auditLog.record('rule_executed', { actionsCount: 1 }, {
        ruleId: 'rule-1',
        ruleName: 'Test Rule'
      });

      expect(mock1.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
      expect(mock2.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
    });

    it('filters by category', () => {
      auditSSE.start(auditLog);
      const mockExec = createMockReply();
      const mockMgmt = createMockReply();

      auditSSE.addConnection('conn-exec', mockExec.reply, { categories: ['rule_execution'] });
      auditSSE.addConnection('conn-mgmt', mockMgmt.reply, { categories: ['rule_management'] });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(mockExec.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
      expect(mockMgmt.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('filters by event type', () => {
      auditSSE.start(auditLog);
      const mockExecuted = createMockReply();
      const mockFailed = createMockReply();

      auditSSE.addConnection('conn-executed', mockExecuted.reply, { types: ['rule_executed'] });
      auditSSE.addConnection('conn-failed', mockFailed.reply, { types: ['rule_failed'] });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(mockExecuted.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
      expect(mockFailed.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('filters by rule ID', () => {
      auditSSE.start(auditLog);
      const mockRule1 = createMockReply();
      const mockRule2 = createMockReply();

      auditSSE.addConnection('conn-rule1', mockRule1.reply, { ruleIds: ['rule-1'] });
      auditSSE.addConnection('conn-rule2', mockRule2.reply, { ruleIds: ['rule-2'] });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(mockRule1.writtenData.some((d) => d.includes('rule-1'))).toBe(true);
      expect(mockRule2.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('filters by source', () => {
      auditSSE.start(auditLog);
      const mockEngine = createMockReply();
      const mockApi = createMockReply();

      auditSSE.addConnection('conn-engine', mockEngine.reply, { sources: ['rule-engine'] });
      auditSSE.addConnection('conn-api', mockApi.reply, { sources: ['api'] });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1', source: 'rule-engine' });

      expect(mockEngine.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
      expect(mockApi.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('combines multiple filters with AND logic', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();

      auditSSE.addConnection('conn-1', mock.reply, {
        categories: ['rule_execution'],
        types: ['rule_executed'],
        ruleIds: ['rule-1']
      });

      // Matches: correct category, type, and rule
      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });
      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);

      // Does not match: wrong type (rule_failed is still rule_execution category)
      auditLog.record('rule_failed', { error: 'boom' }, { ruleId: 'rule-1' });
      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);

      // Does not match: wrong rule
      auditLog.record('rule_executed', {}, { ruleId: 'rule-2' });
      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);

      // Does not match: wrong category (fact_change)
      auditLog.record('fact_created', { key: 'x', value: 1 });
      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);
    });

    it('increments totalEntriesSent counter', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply);

      expect(auditSSE.getStats().totalEntriesSent).toBe(0);

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(auditSSE.getStats().totalEntriesSent).toBe(1);
    });

    it('increments totalEntriesFiltered counter', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply, { types: ['rule_failed'] });

      expect(auditSSE.getStats().totalEntriesFiltered).toBe(0);

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(auditSSE.getStats().totalEntriesFiltered).toBe(1);
    });

    it('counts entries per client', () => {
      auditSSE.start(auditLog);
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      auditSSE.addConnection('conn-1', mock1.reply);
      auditSSE.addConnection('conn-2', mock2.reply);

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(auditSSE.getStats().totalEntriesSent).toBe(2);
    });

    it('formats audit entry data correctly', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply);

      auditLog.record('rule_executed', { actionsCount: 3 }, {
        ruleId: 'rule-123',
        ruleName: 'Test Rule',
        correlationId: 'corr-456',
        durationMs: 42
      });

      const dataLines = mock.writtenData.filter((d) => d.startsWith('data:'));
      expect(dataLines.length).toBe(1);

      const data = JSON.parse(dataLines[0].replace('data: ', '').trim());
      expect(data.type).toBe('rule_executed');
      expect(data.category).toBe('rule_execution');
      expect(data.ruleId).toBe('rule-123');
      expect(data.ruleName).toBe('Test Rule');
      expect(data.correlationId).toBe('corr-456');
      expect(data.durationMs).toBe(42);
      expect(data.details.actionsCount).toBe(3);
      expect(data.source).toBe('rule-engine');
      expect(data.summary).toBe('Rule executed');
    });

    it('removes dead connections during broadcast', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply);

      mock.reply.raw.end();

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(auditSSE.connectionCount).toBe(0);
    });

    it('broadcasts directly without audit log subscription', () => {
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply);

      const entry = createAuditEntry({ type: 'engine_started', category: 'system' });
      auditSSE.broadcast(entry);

      expect(mock.writtenData.some((d) => d.includes('engine_started'))).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns correct stats', () => {
      auditSSE.start(auditLog);
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      auditSSE.addConnection('conn-1', mock1.reply);
      auditSSE.addConnection('conn-2', mock2.reply, { types: ['rule_failed'] });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });

      const stats = auditSSE.getStats();
      expect(stats).toEqual({
        activeConnections: 2,
        totalEntriesSent: 1,
        totalEntriesFiltered: 1
      });
    });

    it('returns zero stats initially', () => {
      expect(auditSSE.getStats()).toEqual({
        activeConnections: 0,
        totalEntriesSent: 0,
        totalEntriesFiltered: 0
      });
    });
  });

  describe('getConnections', () => {
    it('returns list of active connections', () => {
      vi.useRealTimers();
      const beforeConnect = Date.now();

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      auditSSE.addConnection('conn-1', mock1.reply, { categories: ['rule_execution'] });
      auditSSE.addConnection('conn-2', mock2.reply, { ruleIds: ['rule-1', 'rule-2'] });

      const afterConnect = Date.now();
      const connections = auditSSE.getConnections();

      expect(connections).toHaveLength(2);
      expect(connections[0]).toMatchObject({
        id: 'conn-1',
        filter: { categories: ['rule_execution'] }
      });
      expect(connections[0].connectedAt).toBeGreaterThanOrEqual(beforeConnect);
      expect(connections[0].connectedAt).toBeLessThanOrEqual(afterConnect);

      expect(connections[1]).toMatchObject({
        id: 'conn-2',
        filter: { ruleIds: ['rule-1', 'rule-2'] }
      });

      vi.useFakeTimers();
    });

    it('returns empty array when no connections', () => {
      expect(auditSSE.getConnections()).toEqual([]);
    });
  });

  describe('heartbeat', () => {
    it('sends heartbeat to all connections', () => {
      auditSSE.start(auditLog);

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      auditSSE.addConnection('conn-1', mock1.reply);
      auditSSE.addConnection('conn-2', mock2.reply);

      vi.advanceTimersByTime(1000);

      expect(mock1.writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
      expect(mock2.writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
    });

    it('removes dead connections during heartbeat', () => {
      auditSSE.start(auditLog);

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      auditSSE.addConnection('conn-1', mock1.reply);
      auditSSE.addConnection('conn-2', mock2.reply);

      mock1.reply.raw.end();

      vi.advanceTimersByTime(1000);

      expect(auditSSE.connectionCount).toBe(1);
      const connections = auditSSE.getConnections();
      expect(connections[0].id).toBe('conn-2');
    });
  });

  describe('filter matching edge cases', () => {
    it('excludes entries without ruleId when filtering by ruleIds', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply, { ruleIds: ['rule-1'] });

      auditLog.record('fact_created', { key: 'test', value: 42 });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('allows any category when categories filter is empty array', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply, { categories: [] });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });
      auditLog.record('fact_created', { key: 'x', value: 1 });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(2);
    });

    it('allows any type when types filter is empty array', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply, { types: [] });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' });
      auditLog.record('rule_failed', { error: 'test' }, { ruleId: 'rule-1' });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(2);
    });

    it('allows any ruleId when ruleIds filter is empty array', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply, { ruleIds: [] });

      auditLog.record('rule_executed', {}, { ruleId: 'any-rule' });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);
    });

    it('allows any source when sources filter is empty array', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply, { sources: [] });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1', source: 'custom-source' });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);
    });

    it('filters multiple categories correctly', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply, {
        categories: ['rule_execution', 'fact_change']
      });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1' }); // rule_execution - match
      auditLog.record('fact_created', { key: 'x', value: 1 });     // fact_change - match
      auditLog.record('engine_started', {});                        // system - no match

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(2);
    });

    it('filters multiple sources correctly', () => {
      auditSSE.start(auditLog);
      const mock = createMockReply();
      auditSSE.addConnection('conn-1', mock.reply, {
        sources: ['rule-engine', 'api']
      });

      auditLog.record('rule_executed', {}, { ruleId: 'rule-1', source: 'rule-engine' }); // match
      auditLog.record('rule_executed', {}, { ruleId: 'rule-2', source: 'api' });          // match
      auditLog.record('rule_executed', {}, { ruleId: 'rule-3', source: 'cli' });          // no match

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(2);
    });
  });

  describe('filter description', () => {
    it('does not send filter comment when filter is empty', () => {
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply, {});

      const filterComments = writtenData.filter((d) => d.includes('filter:'));
      expect(filterComments.length).toBe(0);
    });

    it('describes ruleIds in filter comment', () => {
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply, { ruleIds: ['rule-1', 'rule-2'] });

      expect(writtenData.some((d) => d.includes('ruleIds=rule-1,rule-2'))).toBe(true);
    });

    it('describes all filter parts joined by semicolons', () => {
      const { reply, writtenData } = createMockReply();
      auditSSE.addConnection('conn-1', reply, {
        categories: ['system'],
        types: ['engine_started'],
        ruleIds: ['r-1'],
        sources: ['api']
      });

      const filterComment = writtenData.find((d) => d.includes('filter:'));
      expect(filterComment).toBeDefined();
      expect(filterComment).toContain('categories=system');
      expect(filterComment).toContain('types=engine_started');
      expect(filterComment).toContain('ruleIds=r-1');
      expect(filterComment).toContain('sources=api');
    });
  });
});
