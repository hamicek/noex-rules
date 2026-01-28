import { generateId } from '../utils/id-generator.js';
import type { TraceCollector } from './trace-collector.js';
import type { FactStore } from '../core/fact-store.js';
import type { DebugTraceEntry, TraceEntryType } from './types.js';

/** Type of breakpoint trigger */
export type BreakpointType = 'rule' | 'event' | 'fact' | 'action';

/** Action to take when breakpoint is hit */
export type BreakpointAction = 'pause' | 'log' | 'snapshot';

/** Condition for breakpoint trigger */
export interface BreakpointCondition {
  /** Rule ID to match (for rule/action breakpoints) */
  ruleId?: string;

  /** Event topic pattern to match (for event breakpoints) */
  topic?: string;

  /** Fact key pattern to match (for fact breakpoints) */
  factPattern?: string;

  /** Action type to match (for action breakpoints) */
  actionType?: string;
}

/** A debugging breakpoint */
export interface Breakpoint {
  /** Unique identifier */
  id: string;

  /** Type of breakpoint */
  type: BreakpointType;

  /** Condition that must be met to trigger */
  condition: BreakpointCondition;

  /** Action to take when triggered */
  action: BreakpointAction;

  /** Whether the breakpoint is active */
  enabled: boolean;

  /** Hit count since creation */
  hitCount: number;

  /** When the breakpoint was created */
  createdAt: number;
}

/** A point-in-time snapshot of engine state */
export interface Snapshot {
  /** Unique identifier */
  id: string;

  /** When the snapshot was taken */
  timestamp: number;

  /** All facts at snapshot time */
  facts: Array<{ key: string; value: unknown }>;

  /** Recent trace entries at snapshot time */
  recentTraces: DebugTraceEntry[];

  /** The breakpoint that triggered this snapshot (if any) */
  triggeredBy?: string;

  /** Optional label for the snapshot */
  label?: string;
}

/** A debug session */
export interface DebugSession {
  /** Unique session identifier */
  id: string;

  /** Whether execution is currently paused */
  paused: boolean;

  /** Breakpoints registered in this session */
  breakpoints: Breakpoint[];

  /** Snapshots taken during this session */
  snapshots: Snapshot[];

  /** When the session was created */
  createdAt: number;

  /** Total breakpoint hits during session */
  totalHits: number;
}

/** Input for creating a breakpoint */
export interface BreakpointInput {
  type: BreakpointType;
  condition: BreakpointCondition;
  action: BreakpointAction;
  enabled?: boolean;
}

/** Callback when a breakpoint is hit */
export type BreakpointHitCallback = (
  session: DebugSession,
  breakpoint: Breakpoint,
  entry: DebugTraceEntry
) => void;

/**
 * Controls debugging sessions with breakpoints and snapshots.
 *
 * Provides IDE-like debugging features for the rule engine:
 * - Breakpoints that can pause, log, or snapshot on specific conditions
 * - Point-in-time snapshots of engine state
 * - Step-through execution (development mode only)
 *
 * Safety: pause/step operations are only available when NODE_ENV !== 'production'
 */
export class DebugController {
  private readonly sessions = new Map<string, DebugSession>();
  private readonly traceCollector: TraceCollector;
  private readonly factStore: FactStore;

  private readonly onBreakpointHit: BreakpointHitCallback | undefined;
  private unsubscribe: (() => void) | null = null;

  private pauseResolver: (() => void) | null = null;
  private stepMode = false;

  constructor(
    traceCollector: TraceCollector,
    factStore: FactStore,
    onBreakpointHit?: BreakpointHitCallback
  ) {
    this.traceCollector = traceCollector;
    this.factStore = factStore;
    this.onBreakpointHit = onBreakpointHit;

    this.unsubscribe = this.traceCollector.subscribe((entry) => {
      this.processTraceEntry(entry);
    });
  }

  /** Check if running in development mode */
  private isDevelopment(): boolean {
    return process.env['NODE_ENV'] !== 'production';
  }

  /** Create a new debug session */
  createSession(): DebugSession {
    const session: DebugSession = {
      id: generateId(),
      paused: false,
      breakpoints: [],
      snapshots: [],
      createdAt: Date.now(),
      totalHits: 0,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /** Get a session by ID */
  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get all active sessions */
  getSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  /** End a debug session and clean up */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Resume if paused
    if (session.paused) {
      this.resumeSession(session);
    }

    this.sessions.delete(sessionId);
    return true;
  }

  /** Add a breakpoint to a session */
  addBreakpoint(sessionId: string, input: BreakpointInput): Breakpoint | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    // Validate pause action in production
    if (input.action === 'pause' && !this.isDevelopment()) {
      throw new Error('Pause breakpoints are not allowed in production mode');
    }

    const breakpoint: Breakpoint = {
      id: generateId(),
      type: input.type,
      condition: { ...input.condition },
      action: input.action,
      enabled: input.enabled ?? true,
      hitCount: 0,
      createdAt: Date.now(),
    };

    session.breakpoints.push(breakpoint);
    return breakpoint;
  }

  /** Remove a breakpoint from a session */
  removeBreakpoint(sessionId: string, breakpointId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const index = session.breakpoints.findIndex((bp) => bp.id === breakpointId);
    if (index === -1) {
      return false;
    }

    session.breakpoints.splice(index, 1);
    return true;
  }

  /** Enable a breakpoint */
  enableBreakpoint(sessionId: string, breakpointId: string): boolean {
    const breakpoint = this.findBreakpoint(sessionId, breakpointId);
    if (!breakpoint) {
      return false;
    }

    breakpoint.enabled = true;
    return true;
  }

  /** Disable a breakpoint */
  disableBreakpoint(sessionId: string, breakpointId: string): boolean {
    const breakpoint = this.findBreakpoint(sessionId, breakpointId);
    if (!breakpoint) {
      return false;
    }

    breakpoint.enabled = false;
    return true;
  }

  /** Resume execution after a pause */
  resume(sessionId: string): boolean {
    if (!this.isDevelopment()) {
      return false;
    }

    const session = this.sessions.get(sessionId);
    if (!session || !session.paused) {
      return false;
    }

    this.stepMode = false;
    this.resumeSession(session);
    return true;
  }

  /** Step to next breakpoint (development mode only) */
  step(sessionId: string): boolean {
    if (!this.isDevelopment()) {
      return false;
    }

    const session = this.sessions.get(sessionId);
    if (!session || !session.paused) {
      return false;
    }

    this.stepMode = true;
    this.resumeSession(session);
    return true;
  }

  /** Take a snapshot of current engine state */
  takeSnapshot(sessionId: string, label?: string): Snapshot | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const snapshot = this.createSnapshot(label);
    session.snapshots.push(snapshot);
    return snapshot;
  }

  /** Get a specific snapshot */
  getSnapshot(sessionId: string, snapshotId: string): Snapshot | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    return session.snapshots.find((s) => s.id === snapshotId);
  }

  /** Clear all snapshots from a session */
  clearSnapshots(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.snapshots = [];
    return true;
  }

  /** Stop the controller and clean up */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Resume any paused sessions
    for (const session of this.sessions.values()) {
      if (session.paused) {
        this.resumeSession(session);
      }
    }

    this.sessions.clear();
  }

  /** Check if any session is currently paused */
  isPaused(): boolean {
    for (const session of this.sessions.values()) {
      if (session.paused) {
        return true;
      }
    }
    return false;
  }

  private findBreakpoint(sessionId: string, breakpointId: string): Breakpoint | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    return session.breakpoints.find((bp) => bp.id === breakpointId);
  }

  private processTraceEntry(entry: DebugTraceEntry): void {
    for (const session of this.sessions.values()) {
      for (const breakpoint of session.breakpoints) {
        if (!breakpoint.enabled) {
          continue;
        }

        if (this.matchesBreakpoint(entry, breakpoint)) {
          this.handleBreakpointHit(session, breakpoint, entry);
        }
      }
    }
  }

  private matchesBreakpoint(entry: DebugTraceEntry, breakpoint: Breakpoint): boolean {
    const { type, condition } = breakpoint;

    switch (type) {
      case 'rule':
        return this.matchesRuleBreakpoint(entry, condition);
      case 'event':
        return this.matchesEventBreakpoint(entry, condition);
      case 'fact':
        return this.matchesFactBreakpoint(entry, condition);
      case 'action':
        return this.matchesActionBreakpoint(entry, condition);
      default:
        return false;
    }
  }

  private matchesRuleBreakpoint(entry: DebugTraceEntry, condition: BreakpointCondition): boolean {
    const ruleTypes: TraceEntryType[] = ['rule_triggered', 'rule_executed', 'rule_skipped'];
    if (!ruleTypes.includes(entry.type)) {
      return false;
    }

    if (condition.ruleId && entry.ruleId !== condition.ruleId) {
      return false;
    }

    return true;
  }

  private matchesEventBreakpoint(entry: DebugTraceEntry, condition: BreakpointCondition): boolean {
    if (entry.type !== 'event_emitted') {
      return false;
    }

    if (condition.topic) {
      const topic = entry.details['topic'] as string | undefined;
      if (!topic || !this.matchesTopicPattern(topic, condition.topic)) {
        return false;
      }
    }

    return true;
  }

  private matchesFactBreakpoint(entry: DebugTraceEntry, condition: BreakpointCondition): boolean {
    if (entry.type !== 'fact_changed') {
      return false;
    }

    if (condition.factPattern) {
      const factKey = entry.details['key'] as string | undefined;
      if (!factKey || !this.matchesPattern(factKey, condition.factPattern)) {
        return false;
      }
    }

    return true;
  }

  private matchesActionBreakpoint(entry: DebugTraceEntry, condition: BreakpointCondition): boolean {
    const actionTypes: TraceEntryType[] = ['action_started', 'action_completed', 'action_failed'];
    if (!actionTypes.includes(entry.type)) {
      return false;
    }

    if (condition.ruleId && entry.ruleId !== condition.ruleId) {
      return false;
    }

    if (condition.actionType) {
      const actionType = entry.details['actionType'] as string | undefined;
      if (!actionType || actionType !== condition.actionType) {
        return false;
      }
    }

    return true;
  }

  private matchesTopicPattern(topic: string, pattern: string): boolean {
    if (pattern === '*' || pattern === '**') {
      return true;
    }

    const patternParts = pattern.split('.');
    const topicParts = topic.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];

      if (patternPart === '**') {
        return true;
      }

      if (patternPart === '*') {
        continue;
      }

      if (i >= topicParts.length || patternPart !== topicParts[i]) {
        return false;
      }
    }

    return patternParts.length === topicParts.length;
  }

  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return value.startsWith(prefix);
    }

    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return value.endsWith(suffix);
    }

    return value === pattern;
  }

  private handleBreakpointHit(
    session: DebugSession,
    breakpoint: Breakpoint,
    entry: DebugTraceEntry
  ): void {
    breakpoint.hitCount++;
    session.totalHits++;

    switch (breakpoint.action) {
      case 'pause':
        if (this.isDevelopment()) {
          this.pauseSession(session, breakpoint, entry);
        }
        break;

      case 'snapshot':
        const snapshot = this.createSnapshot(undefined, breakpoint.id);
        session.snapshots.push(snapshot);
        break;

      case 'log':
        // Callback handles logging
        break;
    }

    if (this.onBreakpointHit) {
      this.onBreakpointHit(session, breakpoint, entry);
    }
  }

  private pauseSession(
    session: DebugSession,
    _breakpoint: Breakpoint,
    _entry: DebugTraceEntry
  ): void {
    session.paused = true;

    // In a real implementation, this would coordinate with the rule engine
    // to pause execution. For now, we track the paused state.
    // The actual pause mechanism would need integration with RuleEngine.
  }

  private resumeSession(session: DebugSession): void {
    session.paused = false;

    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
  }

  private createSnapshot(label?: string, triggeredBy?: string): Snapshot {
    const facts = this.factStore.getAll().map((f) => ({
      key: f.key,
      value: f.value,
    }));

    const recentTraces = this.traceCollector.getRecent(50);

    return {
      id: generateId(),
      timestamp: Date.now(),
      facts,
      recentTraces,
      ...(triggeredBy && { triggeredBy }),
      ...(label && { label }),
    };
  }
}
