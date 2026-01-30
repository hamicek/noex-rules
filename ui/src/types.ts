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
