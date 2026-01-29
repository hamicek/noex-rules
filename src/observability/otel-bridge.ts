/**
 * OpenTelemetry bridge pro noex-rules.
 *
 * Subscribuje se na TraceCollector a mapuje trace entries na OTel spany.
 * Vyžaduje @opentelemetry/api jako optional peer dependency — pokud
 * není nainstalovaný, bridge je no-op.
 *
 * Span hierarchie:
 *   event_processing (correlationId)
 *     └─ rule_evaluation (ruleId)
 *          ├─ condition_evaluation (opt-in přes traceConditions)
 *          └─ action_execution (actionIndex)
 */

import type { TraceCollector } from '../debugging/trace-collector.js';
import type { DebugTraceEntry } from '../debugging/types.js';
import type { OpenTelemetryConfig } from './types.js';

// ---------------------------------------------------------------------------
// Minimální OTel API surface (zrcadlí @opentelemetry/api bez compile-time dep)
// ---------------------------------------------------------------------------

/** @internal */
export interface OTelSpan {
  setAttribute(key: string, value: string | number | boolean): OTelSpan;
  setStatus(status: { code: number; message?: string }): OTelSpan;
  end(): void;
}

/** @internal */
export interface OTelTracer {
  startSpan(
    name: string,
    options?: { attributes?: Record<string, string | number | boolean> },
    context?: OTelContext,
  ): OTelSpan;
}

/** @internal */
export interface OTelContext {
  // opaque – využíváme jen jako referenci
}

/** @internal */
export interface OTelApi {
  trace: {
    getTracer(name: string, version?: string): OTelTracer;
    setSpan(context: OTelContext, span: OTelSpan): OTelContext;
  };
  context: {
    active(): OTelContext;
  };
  SpanStatusCode: {
    UNSET: number;
    OK: number;
    ERROR: number;
  };
}

/** Loader pro dynamický import @opentelemetry/api. Výchozí = production import. */
export type OTelApiLoader = () => Promise<OTelApi>;

const OTEL_MODULE_ID = '@opentelemetry/api';
const defaultLoader: OTelApiLoader = async () => {
  const mod = await (import(/* @vite-ignore */ OTEL_MODULE_ID) as Promise<unknown>);
  return mod as OTelApi;
};

// ---------------------------------------------------------------------------
// Interní stav spanů
// ---------------------------------------------------------------------------

interface CorrelationState {
  span: OTelSpan;
  context: OTelContext;
  activeRules: number;
}

interface SpanWithContext {
  span: OTelSpan;
  context: OTelContext;
}

// ---------------------------------------------------------------------------
// OpenTelemetryBridge
// ---------------------------------------------------------------------------

export class OpenTelemetryBridge {
  private readonly serviceName: string;
  private readonly traceConditions: boolean;
  private readonly apiLoader: OTelApiLoader;

  private otel: OTelApi | null = null;
  private tracer: OTelTracer | null = null;
  private unsubscribe: (() => void) | null = null;

  private readonly correlationSpans = new Map<string, CorrelationState>();
  private readonly ruleSpans = new Map<string, SpanWithContext>();
  private readonly actionSpans = new Map<string, OTelSpan>();

  constructor(config: OpenTelemetryConfig = {}, apiLoader: OTelApiLoader = defaultLoader) {
    this.serviceName = config.serviceName ?? 'noex-rules';
    this.traceConditions = config.traceConditions ?? false;
    this.apiLoader = apiLoader;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Načte @opentelemetry/api a začne subscribovat na TraceCollector.
   * Vrací `true` pokud se OTel API podařilo načíst, `false` pokud ne (no-op).
   */
  async start(traceCollector: TraceCollector): Promise<boolean> {
    try {
      this.otel = await this.apiLoader();
      this.tracer = this.otel.trace.getTracer(this.serviceName, '0.1.0');
    } catch {
      return false;
    }

    if (!traceCollector.isEnabled()) {
      traceCollector.enable();
    }

    this.unsubscribe = traceCollector.subscribe((entry) => {
      this.processEntry(entry);
    });

    return true;
  }

  /** Odpojí subscriber a ukončí všechny otevřené spany. */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    for (const state of this.correlationSpans.values()) state.span.end();
    for (const state of this.ruleSpans.values()) state.span.end();
    for (const span of this.actionSpans.values()) span.end();

    this.correlationSpans.clear();
    this.ruleSpans.clear();
    this.actionSpans.clear();
    this.tracer = null;
    this.otel = null;
  }

  /** Zda je bridge aktivní (OTel API je načtené a subscribuje). */
  get isActive(): boolean {
    return this.tracer !== null;
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  private processEntry(entry: DebugTraceEntry): void {
    if (!this.tracer || !this.otel) return;

    switch (entry.type) {
      case 'event_emitted':
        this.onEventEmitted(entry);
        break;
      case 'rule_triggered':
        this.onRuleTriggered(entry);
        break;
      case 'rule_executed':
        this.onRuleFinished(entry, false);
        break;
      case 'rule_skipped':
        this.onRuleFinished(entry, true);
        break;
      case 'action_started':
        this.onActionStarted(entry);
        break;
      case 'action_completed':
        this.onActionFinished(entry, false);
        break;
      case 'action_failed':
        this.onActionFinished(entry, true);
        break;
      case 'condition_evaluated':
        if (this.traceConditions) {
          this.onConditionEvaluated(entry);
        }
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Entry handlers
  // -------------------------------------------------------------------------

  private onEventEmitted(entry: DebugTraceEntry): void {
    if (!this.tracer || !this.otel || !entry.correlationId) return;

    const span = this.tracer.startSpan('event_processing', {
      attributes: {
        'noex.correlation_id': entry.correlationId,
        'noex.event.topic': String(entry.details['topic'] ?? ''),
      },
    });

    const context = this.otel.trace.setSpan(this.otel.context.active(), span);
    this.correlationSpans.set(entry.correlationId, { span, context, activeRules: 0 });
  }

  private onRuleTriggered(entry: DebugTraceEntry): void {
    if (!this.tracer || !this.otel || !entry.ruleId) return;

    const correlationId = entry.correlationId ?? '';
    const corrState = this.correlationSpans.get(correlationId);
    const parentContext = corrState?.context ?? this.otel.context.active();

    const attrs: Record<string, string | number | boolean> = {
      'noex.rule.id': entry.ruleId,
    };
    if (entry.ruleName) attrs['noex.rule.name'] = entry.ruleName;
    if (entry.correlationId) attrs['noex.correlation_id'] = entry.correlationId;

    const span = this.tracer.startSpan('rule_evaluation', { attributes: attrs }, parentContext);
    const context = this.otel.trace.setSpan(this.otel.context.active(), span);

    this.ruleSpans.set(this.ruleKey(correlationId, entry.ruleId), { span, context });

    if (corrState) corrState.activeRules++;
  }

  private onRuleFinished(entry: DebugTraceEntry, skipped: boolean): void {
    if (!this.otel || !entry.ruleId) return;

    const correlationId = entry.correlationId ?? '';
    const key = this.ruleKey(correlationId, entry.ruleId);
    const ruleState = this.ruleSpans.get(key);

    if (ruleState) {
      if (skipped) {
        ruleState.span.setAttribute('noex.rule.skipped', true);
        const reason = entry.details['reason'];
        if (reason) ruleState.span.setAttribute('noex.rule.skip_reason', String(reason));
      }
      ruleState.span.setStatus({ code: this.otel.SpanStatusCode.OK });
      ruleState.span.end();
      this.ruleSpans.delete(key);
    }

    // Dekrementovat počet aktivních pravidel pro korelaci
    const corrState = this.correlationSpans.get(correlationId);
    if (corrState) {
      corrState.activeRules--;
      if (corrState.activeRules <= 0) {
        corrState.span.setStatus({ code: this.otel.SpanStatusCode.OK });
        corrState.span.end();
        this.correlationSpans.delete(correlationId);
      }
    }
  }

  private onActionStarted(entry: DebugTraceEntry): void {
    if (!this.tracer || !this.otel) return;

    const correlationId = entry.correlationId ?? '';
    const ruleId = entry.ruleId ?? '';
    const actionIndex = (entry.details['actionIndex'] as number) ?? 0;
    const actionType = String(entry.details['actionType'] ?? '');

    const ruleState = this.ruleSpans.get(this.ruleKey(correlationId, ruleId));
    const parentContext = ruleState?.context ?? this.otel.context.active();

    const attrs: Record<string, string | number | boolean> = {
      'noex.action.type': actionType,
      'noex.action.index': actionIndex,
    };
    if (entry.ruleId) attrs['noex.rule.id'] = entry.ruleId;

    const span = this.tracer.startSpan('action_execution', { attributes: attrs }, parentContext);
    this.actionSpans.set(this.actionKey(correlationId, ruleId, actionIndex), span);
  }

  private onActionFinished(entry: DebugTraceEntry, failed: boolean): void {
    if (!this.otel) return;

    const correlationId = entry.correlationId ?? '';
    const ruleId = entry.ruleId ?? '';
    const actionIndex = (entry.details['actionIndex'] as number) ?? 0;

    const key = this.actionKey(correlationId, ruleId, actionIndex);
    const span = this.actionSpans.get(key);
    if (!span) return;

    if (failed) {
      span.setStatus({
        code: this.otel.SpanStatusCode.ERROR,
        message: String(entry.details['error'] ?? 'action failed'),
      });
    } else {
      span.setStatus({ code: this.otel.SpanStatusCode.OK });
    }

    span.end();
    this.actionSpans.delete(key);
  }

  private onConditionEvaluated(entry: DebugTraceEntry): void {
    if (!this.tracer || !this.otel) return;

    const correlationId = entry.correlationId ?? '';
    const ruleId = entry.ruleId ?? '';
    const ruleState = this.ruleSpans.get(this.ruleKey(correlationId, ruleId));
    const parentContext = ruleState?.context ?? this.otel.context.active();

    const passed = entry.details['passed'] as boolean;
    const conditionIndex = (entry.details['conditionIndex'] as number) ?? 0;

    const attrs: Record<string, string | number | boolean> = {
      'noex.condition.index': conditionIndex,
      'noex.condition.passed': passed,
    };
    if (entry.ruleId) attrs['noex.rule.id'] = entry.ruleId;

    const span = this.tracer.startSpan('condition_evaluation', { attributes: attrs }, parentContext);
    span.setStatus({ code: this.otel.SpanStatusCode.OK });
    span.end();
  }

  // -------------------------------------------------------------------------
  // Key helpers
  // -------------------------------------------------------------------------

  private ruleKey(correlationId: string, ruleId: string): string {
    return `${correlationId}\0${ruleId}`;
  }

  private actionKey(correlationId: string, ruleId: string, actionIndex: number): string {
    return `${correlationId}\0${ruleId}\0${actionIndex}`;
  }
}
