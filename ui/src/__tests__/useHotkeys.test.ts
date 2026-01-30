// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHotkeys } from '../hooks/useHotkeys';

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, ...opts }),
  );
}

function pressKeyOnElement(el: HTMLElement, key: string) {
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true }),
  );
}

describe('useHotkeys', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('single-key bindings', () => {
    it('fires handler on key press', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: '?', handler }]));
      pressKey('?');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('fires correct handler among multiple bindings', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      renderHook(() =>
        useHotkeys([
          { keys: '?', handler: h1 },
          { keys: 'b', handler: h2 },
        ]),
      );
      pressKey('b');
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledOnce();
    });

    it('does not fire for unbound keys', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: '?', handler }]));
      pressKey('x');
      expect(handler).not.toHaveBeenCalled();
    });

    it('fires on each press', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: '?', handler }]));
      pressKey('?');
      pressKey('?');
      pressKey('?');
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('two-key sequences', () => {
    it('fires handler on correct sequence', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'g d', handler }]));
      pressKey('g');
      pressKey('d');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not fire on prefix key alone', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'g d', handler }]));
      pressKey('g');
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not fire after 1500ms timeout', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'g d', handler }]));
      pressKey('g');
      vi.advanceTimersByTime(1600);
      pressKey('d');
      expect(handler).not.toHaveBeenCalled();
    });

    it('fires when second key is within timeout window', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'g d', handler }]));
      pressKey('g');
      vi.advanceTimersByTime(1400);
      pressKey('d');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not fire on wrong second key', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'g d', handler }]));
      pressKey('g');
      pressKey('x');
      expect(handler).not.toHaveBeenCalled();
    });

    it('selects correct sequence among multiple', () => {
      const hd = vi.fn();
      const hr = vi.fn();
      renderHook(() =>
        useHotkeys([
          { keys: 'g d', handler: hd },
          { keys: 'g r', handler: hr },
        ]),
      );
      pressKey('g');
      pressKey('r');
      expect(hd).not.toHaveBeenCalled();
      expect(hr).toHaveBeenCalledOnce();
    });

    it('resets pending state after successful match', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'g d', handler }]));
      pressKey('g');
      pressKey('d');
      // Second sequence should require pressing 'g' again
      pressKey('d');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('allows new sequence after failed match', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'g d', handler }]));
      pressKey('g');
      pressKey('x'); // failed match
      pressKey('g');
      pressKey('d'); // new sequence
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('modifier suppression', () => {
    it('does not fire when Ctrl is held', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: '?', handler }]));
      pressKey('?', { ctrlKey: true });
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not fire when Meta is held', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: '?', handler }]));
      pressKey('?', { metaKey: true });
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not fire when Alt is held', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: '?', handler }]));
      pressKey('?', { altKey: true });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('editable element suppression', () => {
    it('ignores keydown on input elements', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: '?', handler }]));
      const input = document.createElement('input');
      document.body.appendChild(input);
      pressKeyOnElement(input, '?');
      expect(handler).not.toHaveBeenCalled();
      input.remove();
    });

    it('ignores keydown on textarea elements', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'b', handler }]));
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      pressKeyOnElement(textarea, 'b');
      expect(handler).not.toHaveBeenCalled();
      textarea.remove();
    });

    it('ignores keydown on select elements', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'b', handler }]));
      const select = document.createElement('select');
      document.body.appendChild(select);
      pressKeyOnElement(select, 'b');
      expect(handler).not.toHaveBeenCalled();
      select.remove();
    });

    it('ignores keydown on contentEditable elements', () => {
      const handler = vi.fn();
      renderHook(() => useHotkeys([{ keys: 'b', handler }]));
      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);
      pressKeyOnElement(div, 'b');
      expect(handler).not.toHaveBeenCalled();
      div.remove();
    });
  });

  describe('cleanup', () => {
    it('removes event listener on unmount', () => {
      const handler = vi.fn();
      const { unmount } = renderHook(() => useHotkeys([{ keys: '?', handler }]));
      unmount();
      pressKey('?');
      expect(handler).not.toHaveBeenCalled();
    });

    it('clears pending timeout on unmount', () => {
      const handler = vi.fn();
      const { unmount } = renderHook(() => useHotkeys([{ keys: 'g d', handler }]));
      pressKey('g');
      unmount();
      vi.advanceTimersByTime(2000);
      // Should not throw or have lingering effects
    });
  });
});
