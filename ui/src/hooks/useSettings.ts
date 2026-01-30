import { useCallback, useSyncExternalStore } from 'react';

export type RuleDetailView = 'form' | 'yaml' | 'flow';

export interface AppSettings {
  defaultRuleView: RuleDetailView;
  pageSize: number;
  notificationsEnabled: boolean;
}

const STORAGE_KEY = 'noex-rules-settings';

const DEFAULTS: AppSettings = {
  defaultRuleView: 'form',
  pageSize: 25,
  notificationsEnabled: true,
};

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function writeSettings(next: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notify();
}

function getSnapshot(): AppSettings {
  return readSettings();
}

function getServerSnapshot(): AppSettings {
  return DEFAULTS;
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((patch: Partial<AppSettings>) => {
    writeSettings({ ...readSettings(), ...patch });
  }, []);

  const reset = useCallback(() => {
    writeSettings(DEFAULTS);
  }, []);

  return { settings, update, reset, DEFAULTS };
}
