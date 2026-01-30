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
  groups: 30_000,
  facts: 30_000,
  timers: 10_000,
  audit: 15_000,
} as const;

export const CONDITION_SOURCE_TYPE_LABELS: Record<string, string> = {
  fact: 'Fact',
  event: 'Event',
  context: 'Context',
  lookup: 'Lookup',
  baseline: 'Baseline',
};

export const CONDITION_OPERATOR_LABELS: Record<string, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'in',
  not_in: 'not in',
  contains: 'contains',
  not_contains: 'not contains',
  matches: 'matches',
  exists: 'exists',
  not_exists: 'not exists',
};

export const UNARY_OPERATORS = new Set(['exists', 'not_exists']);

export const ACTION_TYPE_LABELS: Record<string, string> = {
  set_fact: 'Set Fact',
  delete_fact: 'Delete Fact',
  emit_event: 'Emit Event',
  set_timer: 'Set Timer',
  cancel_timer: 'Cancel Timer',
  call_service: 'Call Service',
  log: 'Log',
  conditional: 'Conditional',
};

export const LOG_LEVEL_LABELS: Record<string, string> = {
  debug: 'Debug',
  info: 'Info',
  warn: 'Warning',
  error: 'Error',
};

export const AUDIT_CATEGORY_LABELS: Record<string, string> = {
  rule_management: 'Rule Management',
  rule_execution: 'Rule Execution',
  fact_change: 'Fact Change',
  event_emitted: 'Event Emitted',
  system: 'System',
};

export const AUDIT_CATEGORY_COLORS: Record<string, string> = {
  rule_management: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  rule_execution: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  fact_change: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  event_emitted: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  system: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export const AUDIT_EVENT_TYPE_LABELS: Record<string, string> = {
  rule_registered: 'Rule Registered',
  rule_unregistered: 'Rule Unregistered',
  rule_enabled: 'Rule Enabled',
  rule_disabled: 'Rule Disabled',
  rule_rolled_back: 'Rule Rolled Back',
  rule_executed: 'Rule Executed',
  rule_skipped: 'Rule Skipped',
  rule_failed: 'Rule Failed',
  group_created: 'Group Created',
  group_updated: 'Group Updated',
  group_deleted: 'Group Deleted',
  group_enabled: 'Group Enabled',
  group_disabled: 'Group Disabled',
  fact_created: 'Fact Created',
  fact_updated: 'Fact Updated',
  fact_deleted: 'Fact Deleted',
  event_emitted: 'Event Emitted',
  engine_started: 'Engine Started',
  engine_stopped: 'Engine Stopped',
  hot_reload_started: 'Hot Reload Started',
  hot_reload_completed: 'Hot Reload Completed',
  hot_reload_failed: 'Hot Reload Failed',
  baseline_registered: 'Baseline Registered',
  baseline_recalculated: 'Baseline Recalculated',
  baseline_anomaly_detected: 'Baseline Anomaly',
  backward_query_started: 'Backward Query Started',
  backward_query_completed: 'Backward Query Completed',
};

export const MAX_EVENT_STREAM_SIZE = 500;

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  registered: 'Registered',
  updated: 'Updated',
  enabled: 'Enabled',
  disabled: 'Disabled',
  unregistered: 'Unregistered',
  rolled_back: 'Rolled Back',
};

export const CHANGE_TYPE_COLORS: Record<string, string> = {
  registered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  updated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  enabled: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  disabled: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  unregistered: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  rolled_back: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

export const FLOW_NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  fact: { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-300' },
  event: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300' },
  timer: { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-300' },
  temporal: { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-300 dark:border-purple-700', text: 'text-purple-700 dark:text-purple-300' },
  condition: { bg: 'bg-slate-50 dark:bg-slate-900/40', border: 'border-slate-300 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300' },
  set_fact: { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-300' },
  delete_fact: { bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-red-300 dark:border-red-700', text: 'text-red-700 dark:text-red-300' },
  emit_event: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300' },
  set_timer: { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-300' },
  cancel_timer: { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-300 dark:border-orange-700', text: 'text-orange-700 dark:text-orange-300' },
  call_service: { bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-300 dark:border-indigo-700', text: 'text-indigo-700 dark:text-indigo-300' },
  log: { bg: 'bg-slate-50 dark:bg-slate-900/40', border: 'border-slate-300 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300' },
  conditional: { bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-300 dark:border-violet-700', text: 'text-violet-700 dark:text-violet-300' },
};
