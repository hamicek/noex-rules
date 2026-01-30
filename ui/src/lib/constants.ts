export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  fact: 'Fact',
  event: 'Event',
  timer: 'Timer',
  temporal: 'Temporal',
};

export const TRIGGER_TYPE_COLORS: Record<string, string> = {
  fact: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  event: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  timer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  temporal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

export const HEALTH_STATUS_COLORS: Record<string, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  degraded: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};

export const HEALTH_STATUS_BG: Record<string, string> = {
  ok: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  error: 'bg-red-500',
};

export const POLLING_INTERVALS = {
  health: 5_000,
  stats: 5_000,
  rules: 30_000,
} as const;
