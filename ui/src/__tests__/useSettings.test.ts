// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../hooks/useSettings';

const STORAGE_KEY = 'noex-rules-settings';

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('reading settings', () => {
    it('returns defaults when localStorage is empty', () => {
      const { result } = renderHook(() => useSettings());
      expect(result.current.settings).toEqual({
        defaultRuleView: 'form',
        pageSize: 25,
        notificationsEnabled: true,
      });
    });

    it('merges stored partial settings with defaults', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pageSize: 50 }));
      const { result } = renderHook(() => useSettings());
      expect(result.current.settings.pageSize).toBe(50);
      expect(result.current.settings.defaultRuleView).toBe('form');
      expect(result.current.settings.notificationsEnabled).toBe(true);
    });

    it('returns defaults on invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{invalid');
      const { result } = renderHook(() => useSettings());
      expect(result.current.settings).toEqual(result.current.DEFAULTS);
    });

    it('overrides all fields from stored settings', () => {
      const stored = {
        defaultRuleView: 'yaml',
        pageSize: 100,
        notificationsEnabled: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      const { result } = renderHook(() => useSettings());
      expect(result.current.settings).toEqual(stored);
    });
  });

  describe('update()', () => {
    it('merges patch into current settings', () => {
      const { result } = renderHook(() => useSettings());
      act(() => {
        result.current.update({ pageSize: 100 });
      });
      expect(result.current.settings.pageSize).toBe(100);
      expect(result.current.settings.defaultRuleView).toBe('form');
      expect(result.current.settings.notificationsEnabled).toBe(true);
    });

    it('persists to localStorage', () => {
      const { result } = renderHook(() => useSettings());
      act(() => {
        result.current.update({ notificationsEnabled: false });
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.notificationsEnabled).toBe(false);
    });

    it('accumulates multiple updates', () => {
      const { result } = renderHook(() => useSettings());
      act(() => {
        result.current.update({ pageSize: 50 });
      });
      act(() => {
        result.current.update({ defaultRuleView: 'yaml' });
      });
      expect(result.current.settings.pageSize).toBe(50);
      expect(result.current.settings.defaultRuleView).toBe('yaml');
    });

    it('overwrites previously updated fields', () => {
      const { result } = renderHook(() => useSettings());
      act(() => {
        result.current.update({ pageSize: 50 });
      });
      act(() => {
        result.current.update({ pageSize: 75 });
      });
      expect(result.current.settings.pageSize).toBe(75);
    });
  });

  describe('reset()', () => {
    it('restores default settings', () => {
      const { result } = renderHook(() => useSettings());
      act(() => {
        result.current.update({ pageSize: 999, defaultRuleView: 'flow' });
      });
      act(() => {
        result.current.reset();
      });
      expect(result.current.settings).toEqual(result.current.DEFAULTS);
    });

    it('persists defaults to localStorage', () => {
      const { result } = renderHook(() => useSettings());
      act(() => {
        result.current.update({ pageSize: 999 });
      });
      act(() => {
        result.current.reset();
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored).toEqual(result.current.DEFAULTS);
    });
  });

  describe('DEFAULTS', () => {
    it('exposes default values', () => {
      const { result } = renderHook(() => useSettings());
      expect(result.current.DEFAULTS).toEqual({
        defaultRuleView: 'form',
        pageSize: 25,
        notificationsEnabled: true,
      });
    });
  });
});
