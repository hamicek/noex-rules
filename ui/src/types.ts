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

export interface RuleTrigger {
  type: 'fact' | 'event' | 'timer' | 'temporal';
  pattern?: string;
  topic?: string;
  name?: string;
}

export interface RuleCondition {
  source: {
    type: string;
    pattern?: string;
    field?: string;
  };
  operator: string;
  value?: unknown;
}

export interface RuleAction {
  type: string;
  key?: string;
  value?: unknown;
  topic?: string;
  data?: unknown;
}
