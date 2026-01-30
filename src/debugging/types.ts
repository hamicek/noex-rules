/**
 * Debugging types for rule engine tracing and profiling.
 */

/** Types of trace entries that can be recorded */
export type TraceEntryType =
  | 'rule_triggered'
  | 'rule_executed'
  | 'rule_skipped'
  | 'condition_evaluated'
  | 'action_started'
  | 'action_completed'
  | 'action_failed'
  | 'fact_changed'
  | 'event_emitted'
  | 'timer_set'
  | 'timer_cancelled'
  | 'timer_expired'
  | 'lookup_resolved'
  | 'backward_goal_evaluated'
  | 'backward_rule_explored';

/** A single trace entry recording an engine activity */
export interface DebugTraceEntry {
  /** Unique identifier for this trace entry */
  id: string;

  /** Unix timestamp in milliseconds when this occurred */
  timestamp: number;

  /** Type of activity being traced */
  type: TraceEntryType;

  /** Correlation ID linking related activities across rules */
  correlationId?: string;

  /** ID of the trace entry that caused this one */
  causationId?: string;

  /** ID of the rule involved, if applicable */
  ruleId?: string;

  /** Human-readable name of the rule */
  ruleName?: string;

  /** Additional contextual information about the activity */
  details: Record<string, unknown>;

  /** Duration of the activity in milliseconds, if applicable */
  durationMs?: number;
}

/** Filter options for querying trace entries */
export interface TraceFilter {
  /** Filter by correlation ID */
  correlationId?: string;

  /** Filter by rule ID */
  ruleId?: string;

  /** Filter by entry types */
  types?: TraceEntryType[];

  /** Filter entries after this timestamp */
  fromTimestamp?: number;

  /** Filter entries before this timestamp */
  toTimestamp?: number;

  /** Maximum number of entries to return */
  limit?: number;
}

/** Callback type for trace entry subscriptions */
export type TraceSubscriber = (entry: DebugTraceEntry) => void;

/** Detailed information about a single condition evaluation */
export interface ConditionEvaluationResult {
  /** Index of the condition in the rule's conditions array */
  conditionIndex: number;

  /** The source being evaluated */
  source: {
    type: 'fact' | 'event' | 'context' | 'lookup' | 'baseline';
    pattern?: string;
    field?: string;
    key?: string;
    name?: string;
    metric?: string;
  };

  /** The operator used for comparison */
  operator: string;

  /** The actual value retrieved from the source */
  actualValue: unknown;

  /** The expected value (resolved from literal or reference) */
  expectedValue: unknown;

  /** Whether the condition passed */
  result: boolean;

  /** Duration of evaluation in milliseconds */
  durationMs: number;
}

/** Callback type for condition evaluation tracing */
export type ConditionEvaluationCallback = (result: ConditionEvaluationResult) => void;

/** Information about an action execution start */
export interface ActionStartedInfo {
  /** Index of the action in the rule's actions array */
  actionIndex: number;

  /** Type of the action being executed */
  actionType: string;

  /** Input parameters for the action (sanitized for tracing) */
  input: Record<string, unknown>;
}

/** Information about a successfully completed action */
export interface ActionCompletedInfo {
  /** Index of the action in the rule's actions array */
  actionIndex: number;

  /** Type of the action that was executed */
  actionType: string;

  /** Output/result of the action */
  output: unknown;

  /** Duration of execution in milliseconds */
  durationMs: number;
}

/** Information about a failed action */
export interface ActionFailedInfo {
  /** Index of the action in the rule's actions array */
  actionIndex: number;

  /** Type of the action that failed */
  actionType: string;

  /** Error message describing the failure */
  error: string;

  /** Duration until failure in milliseconds */
  durationMs: number;
}

/** Callback type for action started tracing */
export type ActionStartedCallback = (info: ActionStartedInfo) => void;

/** Callback type for action completed tracing */
export type ActionCompletedCallback = (info: ActionCompletedInfo) => void;

/** Callback type for action failed tracing */
export type ActionFailedCallback = (info: ActionFailedInfo) => void;
