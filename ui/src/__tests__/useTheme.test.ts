// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../hooks/useTheme';

const STORAGE_KEY = 'noex-rules-theme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  describe('initial theme', () => {
    it('returns light when no stored preference and system prefers light', () => {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('light');
    });

    it('returns dark when no stored preference and system prefers dark', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockReturnValue({ matches: true }),
      });
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('dark');
    });

    it('returns stored light theme', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('light');
    });

    it('returns stored dark theme', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('dark');
    });

    it('ignores invalid stored value and falls back to system preference', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid');
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockReturnValue({ matches: true }),
      });
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('dark');
    });
  });

  describe('toggle()', () => {
    it('switches light to dark', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const { result } = renderHook(() => useTheme());
      act(() => {
        result.current.toggle();
      });
      expect(result.current.theme).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });

    it('switches dark to light', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      const { result } = renderHook(() => useTheme());
      act(() => {
        result.current.toggle();
      });
      expect(result.current.theme).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('toggles twice to return to original theme', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const { result } = renderHook(() => useTheme());
      act(() => {
        result.current.toggle();
      });
      act(() => {
        result.current.toggle();
      });
      expect(result.current.theme).toBe('light');
    });
  });

  describe('setTheme()', () => {
    it('sets dark theme and persists', () => {
      const { result } = renderHook(() => useTheme());
      act(() => {
        result.current.setTheme('dark');
      });
      expect(result.current.theme).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });

    it('sets light theme and persists', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      const { result } = renderHook(() => useTheme());
      act(() => {
        result.current.setTheme('light');
      });
      expect(result.current.theme).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });
  });

  describe('CSS class application', () => {
    it('adds dark class for dark theme', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      renderHook(() => useTheme());
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('does not add dark class for light theme', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      renderHook(() => useTheme());
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('removes dark class when switching to light', () => {
      document.documentElement.classList.add('dark');
      localStorage.setItem(STORAGE_KEY, 'dark');
      const { result } = renderHook(() => useTheme());
      act(() => {
        result.current.setTheme('light');
      });
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('adds dark class when toggling to dark', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const { result } = renderHook(() => useTheme());
      act(() => {
        result.current.toggle();
      });
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});
