export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: number;
  uptime: number;
  version: string;
  engine: {
    name: string;
    running: boolean;
  };
}

export interface EngineStats {
  rulesCount: number;
  factsCount: number;
  timersCount: number;
  eventsProcessed: number;
  rulesExecuted: number;
  avgProcessingTimeMs: number;
  timestamp: number;
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  version: number;
  tags: string[];
  groupId?: string;
  group?: RuleGroup;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  createdAt: number;
  updatedAt: number;
}

export interface RuleGroup {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  rulesCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Fact {
  key: string;
  value: unknown;
  timestamp: number;
  source: string;
  version: number;
}

export interface TimerExpireConfig {
  topic: string;
  data: unknown;
}

export interface TimerRepeatConfig {
  interval: number;
  maxCount?: number;
}

export interface Timer {
  id: string;
  name: string;
  expiresAt: number;
  onExpire: TimerExpireConfig;
  repeat?: TimerRepeatConfig;
  correlationId?: string;
}

export type TriggerType = 'fact' | 'event' | 'timer' | 'temporal';

export interface RuleTrigger {
  type: TriggerType;
  pattern?: string;
  topic?: string;
  name?: string;
}

export type ConditionSourceType =
  | 'fact'
  | 'event'
  | 'context'
  | 'lookup'
  | 'baseline';

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'matches'
  | 'exists'
  | 'not_exists';

export interface ConditionSource {
  type: ConditionSourceType;
  pattern?: string;
  field?: string;
  key?: string;
  name?: string;
  metric?: string;
  comparison?: string;
  sensitivity?: number;
}

export interface RuleCondition {
  source: ConditionSource;
  operator: ConditionOperator;
  value?: unknown;
}

export type ActionType =
  | 'set_fact'
  | 'delete_fact'
  | 'emit_event'
  | 'set_timer'
  | 'cancel_timer'
  | 'call_service'
  | 'log'
  | 'conditional';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuleAction {
  type: ActionType;
  key?: string;
  value?: unknown;
  topic?: string;
  data?: unknown;
  timer?: unknown;
  name?: string;
  service?: string;
  method?: string;
  args?: unknown[];
  level?: LogLevel;
  message?: string;
  conditions?: RuleCondition[];
  thenActions?: RuleAction[];
  elseActions?: RuleAction[];
}

// --- Events ---

export interface EngineEvent {
  id: string;
  topic: string;
  data: unknown;
  timestamp: number;
  correlationId?: string;
  causationId?: string;
  source: string;
}

// --- Audit ---

export type AuditCategory =
  | 'rule_management'
  | 'rule_execution'
  | 'fact_change'
  | 'event_emitted'
  | 'system';

export type AuditEventType =
  | 'rule_registered'
  | 'rule_unregistered'
  | 'rule_enabled'
  | 'rule_disabled'
  | 'rule_rolled_back'
  | 'rule_executed'
  | 'rule_skipped'
  | 'rule_failed'
  | 'group_created'
  | 'group_updated'
  | 'group_deleted'
  | 'group_enabled'
  | 'group_disabled'
  | 'fact_created'
  | 'fact_updated'
  | 'fact_deleted'
  | 'event_emitted'
  | 'engine_started'
  | 'engine_stopped'
  | 'hot_reload_started'
  | 'hot_reload_completed'
  | 'hot_reload_failed'
  | 'baseline_registered'
  | 'baseline_recalculated'
  | 'baseline_anomaly_detected'
  | 'backward_query_started'
  | 'backward_query_completed';

export interface AuditEntry {
  id: string;
  timestamp: number;
  category: AuditCategory;
  type: AuditEventType;
  summary: string;
  source: string;
  ruleId?: string;
  ruleName?: string;
  correlationId?: string;
  details: unknown;
  durationMs?: number;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  totalCount: number;
  queryTimeMs: number;
  hasMore: boolean;
}

export interface AuditQueryInput {
  category?: AuditCategory;
  types?: AuditEventType[];
  ruleId?: string;
  source?: string;
  correlationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}
