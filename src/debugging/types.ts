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
  | 'timer_expired';

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
    type: 'fact' | 'event' | 'context';
    pattern?: string;
    field?: string;
    key?: string;
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
