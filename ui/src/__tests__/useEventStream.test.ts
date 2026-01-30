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

import { useEventStream } from '../hooks/useEventStream';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(id: string) {
  return { id, topic: 'test', data: {}, timestamp: Date.now(), source: 'test' };
}

function lastSource() {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEventStream', () => {
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
    it('connects to EventSource with default patterns', () => {
      renderHook(() => useEventStream());
      expect(MockEventSource.instances).toHaveLength(1);
      expect(lastSource().url).toBe(
        'http://test-server/stream/events?patterns=*',
      );
    });

    it('connects with custom patterns', () => {
      renderHook(() =>
        useEventStream({ patterns: ['order.*', 'user.*'] }),
      );
      expect(lastSource().url).toBe(
        'http://test-server/stream/events?patterns=order.*%2Cuser.*',
      );
    });

    it('does not connect when disabled', () => {
      renderHook(() => useEventStream({ enabled: false }));
      expect(MockEventSource.instances).toHaveLength(0);
    });

    it('sets isConnected to true on open', () => {
      const { result } = renderHook(() => useEventStream());
      expect(result.current.isConnected).toBe(false);
      act(() => {
        lastSource()._open();
      });
      expect(result.current.isConnected).toBe(true);
    });

    it('sets isConnected to false on error', () => {
      const { result } = renderHook(() => useEventStream());
      act(() => {
        lastSource()._open();
      });
      act(() => {
        lastSource()._error();
      });
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('events', () => {
    it('parses incoming events and prepends (newest first)', () => {
      const { result } = renderHook(() => useEventStream());
      const source = lastSource();
      act(() => source._message(JSON.stringify(makeEvent('1'))));
      act(() => source._message(JSON.stringify(makeEvent('2'))));
      expect(result.current.events).toHaveLength(2);
      expect(result.current.events[0].id).toBe('2');
      expect(result.current.events[1].id).toBe('1');
    });

    it('ignores non-JSON messages', () => {
      const { result } = renderHook(() => useEventStream());
      act(() => lastSource()._message('not json'));
      act(() => lastSource()._message(':heartbeat'));
      expect(result.current.events).toHaveLength(0);
    });

    it('respects maxSize limit', () => {
      const { result } = renderHook(() => useEventStream({ maxSize: 3 }));
      const source = lastSource();
      for (let i = 0; i < 5; i++) {
        act(() => source._message(JSON.stringify(makeEvent(String(i)))));
      }
      expect(result.current.events).toHaveLength(3);
      expect(result.current.events[0].id).toBe('4');
      expect(result.current.events[2].id).toBe('2');
    });
  });

  describe('pause/resume', () => {
    it('starts unpaused', () => {
      const { result } = renderHook(() => useEventStream());
      expect(result.current.isPaused).toBe(false);
    });

    it('buffers events when paused', () => {
      const { result } = renderHook(() => useEventStream());
      act(() => {
        result.current.pause();
      });
      expect(result.current.isPaused).toBe(true);
      act(() => lastSource()._message(JSON.stringify(makeEvent('1'))));
      expect(result.current.events).toHaveLength(0);
    });

    it('flushes buffer on resume', () => {
      const { result } = renderHook(() => useEventStream());
      const source = lastSource();
      act(() => source._message(JSON.stringify(makeEvent('0'))));
      act(() => {
        result.current.pause();
      });
      act(() => source._message(JSON.stringify(makeEvent('1'))));
      act(() => source._message(JSON.stringify(makeEvent('2'))));
      act(() => {
        result.current.resume();
      });
      expect(result.current.isPaused).toBe(false);
      expect(result.current.events).toHaveLength(3);
    });

    it('buffer respects maxSize during pause', () => {
      const { result } = renderHook(() => useEventStream({ maxSize: 2 }));
      const source = lastSource();
      act(() => {
        result.current.pause();
      });
      for (let i = 0; i < 5; i++) {
        act(() => source._message(JSON.stringify(makeEvent(String(i)))));
      }
      act(() => {
        result.current.resume();
      });
      expect(result.current.events.length).toBeLessThanOrEqual(2);
    });
  });

  describe('clear()', () => {
    it('empties events array', () => {
      const { result } = renderHook(() => useEventStream());
      act(() => lastSource()._message(JSON.stringify(makeEvent('1'))));
      expect(result.current.events).toHaveLength(1);
      act(() => {
        result.current.clear();
      });
      expect(result.current.events).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('closes EventSource on unmount', () => {
      const { unmount } = renderHook(() => useEventStream());
      const source = lastSource();
      expect(source.closed).toBe(false);
      unmount();
      expect(source.closed).toBe(true);
    });

    it('closes previous EventSource when disabled', () => {
      const { rerender } = renderHook(
        (props: { enabled: boolean }) => useEventStream(props),
        { initialProps: { enabled: true } },
      );
      const source = lastSource();
      rerender({ enabled: false });
      expect(source.closed).toBe(true);
    });
  });
});
