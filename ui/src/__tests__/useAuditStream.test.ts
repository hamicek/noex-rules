// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../api/client', () => ({
  getServerUrl: () => 'http://test-server',
}));

// ---------------------------------------------------------------------------
// MockEventSource
// ---------------------------------------------------------------------------

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 0;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  _open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  _message(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  _error() {
    this.onerror?.(new Event('error'));
  }
}

const OriginalEventSource = globalThis.EventSource;

import { useAuditStream } from '../hooks/useAuditStream';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function auditEntry(id: string, overrides = {}) {
  return {
    id,
    timestamp: Date.now(),
    category: 'rule_execution',
    type: 'rule_executed',
    summary: `Rule executed ${id}`,
    source: 'test',
    details: {},
    ...overrides,
  };
}

function lastSource() {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuditStream', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    if (OriginalEventSource) {
      globalThis.EventSource = OriginalEventSource;
    } else {
      delete (globalThis as any).EventSource;
    }
  });

  describe('connection', () => {
    it('connects to audit stream endpoint without filters', () => {
      renderHook(() => useAuditStream());
      expect(MockEventSource.instances).toHaveLength(1);
      expect(lastSource().url).toBe('http://test-server/audit/stream');
    });

    it('includes category filter in URL', () => {
      renderHook(() =>
        useAuditStream({ categories: ['rule_execution', 'fact_change'] }),
      );
      expect(lastSource().url).toContain(
        'categories=rule_execution%2Cfact_change',
      );
    });

    it('includes type filter in URL', () => {
      renderHook(() =>
        useAuditStream({ types: ['rule_executed', 'rule_failed'] }),
      );
      expect(lastSource().url).toContain(
        'types=rule_executed%2Crule_failed',
      );
    });

    it('includes ruleId filter in URL', () => {
      renderHook(() => useAuditStream({ ruleIds: ['r1', 'r2'] }));
      expect(lastSource().url).toContain('ruleIds=r1%2Cr2');
    });

    it('combines multiple filters in URL', () => {
      renderHook(() =>
        useAuditStream({
          categories: ['system'],
          types: ['engine_started'],
          ruleIds: ['r1'],
        }),
      );
      const url = lastSource().url;
      expect(url).toContain('categories=system');
      expect(url).toContain('types=engine_started');
      expect(url).toContain('ruleIds=r1');
    });

    it('does not connect when disabled', () => {
      renderHook(() => useAuditStream({ enabled: false }));
      expect(MockEventSource.instances).toHaveLength(0);
    });

    it('sets isConnected on open', () => {
      const { result } = renderHook(() => useAuditStream());
      act(() => lastSource()._open());
      expect(result.current.isConnected).toBe(true);
    });

    it('sets isConnected to false on error', () => {
      const { result } = renderHook(() => useAuditStream());
      act(() => lastSource()._open());
      act(() => lastSource()._error());
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('entries', () => {
    it('parses incoming entries and prepends (newest first)', () => {
      const { result } = renderHook(() => useAuditStream());
      const source = lastSource();
      act(() => source._message(JSON.stringify(auditEntry('1'))));
      act(() => source._message(JSON.stringify(auditEntry('2'))));
      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[0].id).toBe('2');
      expect(result.current.entries[1].id).toBe('1');
    });

    it('ignores non-JSON messages', () => {
      const { result } = renderHook(() => useAuditStream());
      act(() => lastSource()._message(':heartbeat'));
      act(() => lastSource()._message('not json'));
      expect(result.current.entries).toHaveLength(0);
    });

    it('respects maxSize limit', () => {
      const { result } = renderHook(() => useAuditStream({ maxSize: 3 }));
      const source = lastSource();
      for (let i = 0; i < 5; i++) {
        act(() => source._message(JSON.stringify(auditEntry(String(i)))));
      }
      expect(result.current.entries).toHaveLength(3);
      expect(result.current.entries[0].id).toBe('4');
      expect(result.current.entries[2].id).toBe('2');
    });

    it('defaults maxSize to 200', () => {
      const { result } = renderHook(() => useAuditStream());
      const source = lastSource();
      for (let i = 0; i < 210; i++) {
        act(() => source._message(JSON.stringify(auditEntry(String(i)))));
      }
      expect(result.current.entries).toHaveLength(200);
    });
  });

  describe('clear()', () => {
    it('empties entries array', () => {
      const { result } = renderHook(() => useAuditStream());
      act(() => lastSource()._message(JSON.stringify(auditEntry('1'))));
      expect(result.current.entries).toHaveLength(1);
      act(() => {
        result.current.clear();
      });
      expect(result.current.entries).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('closes EventSource on unmount', () => {
      const { unmount } = renderHook(() => useAuditStream());
      const source = lastSource();
      unmount();
      expect(source.closed).toBe(true);
    });

    it('closes previous EventSource when disabled', () => {
      const { rerender } = renderHook(
        (props: { enabled: boolean }) => useAuditStream(props),
        { initialProps: { enabled: true } },
      );
      const source = lastSource();
      rerender({ enabled: false });
      expect(source.closed).toBe(true);
    });
  });
});
