import type { Fact } from '../types/fact.js';
import type { Event } from '../types/event.js';
import type { Timer } from '../types/timer.js';
import type { Rule, RuleInput } from '../types/rule.js';
import type { RuleEngineConfig, EngineStats } from '../types/index.js';
import { RuleInputValidator, RuleValidationError } from '../validation/index.js';
import type { ValidationResult } from '../validation/index.js';
import { FactStore, type FactStoreConfig } from './fact-store.js';
import { EventStore, type EventStoreConfig } from './event-store.js';
import { TimerManager, type TimerManagerConfig } from './timer-manager.js';
import { RuleManager } from './rule-manager.js';
import { RulePersistence, type RulePersistenceOptions } from '../persistence/rule-persistence.js';
import { ConditionEvaluator, type EvaluationContext, type EvaluationOptions } from '../evaluation/condition-evaluator.js';
import { ActionExecutor, type ExecutionContext, type ExecutionOptions } from '../evaluation/action-executor.js';
import { generateId } from '../utils/id-generator.js';
import { TraceCollector } from '../debugging/trace-collector.js';
import { Profiler } from '../debugging/profiler.js';
import { AuditLogService } from '../audit/audit-log-service.js';

type EventHandler = (event: Event, topic: string) => void | Promise<void>;
type Unsubscribe = () => void;

interface EngineInternals {
  totalEventsProcessed: number;
  totalRulesExecuted: number;
  totalProcessingTimeMs: number;
}

/**
 * Hlavní orchestrátor rule enginu.
 *
 * Spojuje všechny komponenty a poskytuje unified API pro:
 * - Správu pravidel (register, unregister, enable, disable)
 * - Správu faktů (set, get, delete, query)
 * - Emitování eventů
 * - Správu timerů
 *
 * Forward chaining - změna faktů/eventů automaticky spouští vyhodnocení
 * relevantních pravidel.
 */
export class RuleEngine {
  private readonly factStore: FactStore;
  private readonly eventStore: EventStore;
  private readonly timerManager: TimerManager;
  private readonly ruleManager: RuleManager;
  private readonly conditionEvaluator: ConditionEvaluator;
  private readonly actionExecutor: ActionExecutor;
  private readonly traceCollector: TraceCollector;
  private readonly auditLog: AuditLogService | null;
  private readonly config: Required<Omit<RuleEngineConfig, 'persistence' | 'tracing' | 'timerPersistence' | 'audit'>>;
  private readonly services: Map<string, unknown>;
  private readonly validator: RuleInputValidator;

  private readonly subscribers: Map<string, Set<EventHandler>> = new Map();
  private readonly wildcardSubscribers: Map<string, Set<EventHandler>> = new Map();

  private readonly internals: EngineInternals = {
    totalEventsProcessed: 0,
    totalRulesExecuted: 0,
    totalProcessingTimeMs: 0
  };

  private running = false;
  private processingQueue: Promise<void> = Promise.resolve();
  private processingDepth = 0;
  private profiler: Profiler | null = null;

  private constructor(
    factStore: FactStore,
    eventStore: EventStore,
    timerManager: TimerManager,
    ruleManager: RuleManager,
    traceCollector: TraceCollector,
    auditLog: AuditLogService | null,
    config: RuleEngineConfig
  ) {
    this.factStore = factStore;
    this.eventStore = eventStore;
    this.timerManager = timerManager;
    this.ruleManager = ruleManager;
    this.traceCollector = traceCollector;
    this.auditLog = auditLog;
    this.conditionEvaluator = new ConditionEvaluator();

    this.config = {
      name: config.name ?? 'rule-engine',
      maxConcurrency: config.maxConcurrency ?? 10,
      debounceMs: config.debounceMs ?? 0,
      services: config.services ?? {}
    };

    this.services = new Map(Object.entries(this.config.services));
    this.validator = new RuleInputValidator();

    this.actionExecutor = new ActionExecutor(
      this.factStore,
      this.timerManager,
      (topic, event) => this.handleInternalEvent(topic, event),
      this.services
    );

    this.setupTimerHandler();
  }

  /**
   * Vytvoří a spustí novou instanci RuleEngine.
   */
  static async start(config: RuleEngineConfig = {}): Promise<RuleEngine> {
    const factStoreConfig = config.name ? { name: `${config.name}-facts` } : {};
    const eventStoreConfig = config.name ? { name: `${config.name}-events` } : {};

    const factStore = await FactStore.start(factStoreConfig);
    const eventStore = await EventStore.start(eventStoreConfig);
    const timerManager = await TimerManager.start(
      config.timerPersistence
        ? {
            adapter: config.timerPersistence.adapter,
            ...(config.timerPersistence.checkIntervalMs !== undefined && { checkIntervalMs: config.timerPersistence.checkIntervalMs }),
          }
        : {}
    );
    const ruleManager = await RuleManager.start();
    const traceCollector = await TraceCollector.start({
      enabled: config.tracing?.enabled ?? false,
      maxEntries: config.tracing?.maxEntries ?? 10_000
    });

    // Nastavení persistence, pokud je nakonfigurována
    if (config.persistence) {
      const options: RulePersistenceOptions = {};
      if (config.persistence.key !== undefined) {
        options.key = config.persistence.key;
      }
      if (config.persistence.schemaVersion !== undefined) {
        options.schemaVersion = config.persistence.schemaVersion;
      }
      const persistence = new RulePersistence(config.persistence.adapter, options);
      ruleManager.setPersistence(persistence);
      await ruleManager.restore();
    }

    let auditLog: AuditLogService | null = null;
    if (config.audit) {
      auditLog = await AuditLogService.start(config.audit.adapter, {
        ...(config.audit.retentionMs !== undefined && { retentionMs: config.audit.retentionMs }),
        ...(config.audit.batchSize !== undefined && { batchSize: config.audit.batchSize }),
        ...(config.audit.flushIntervalMs !== undefined && { flushIntervalMs: config.audit.flushIntervalMs }),
        ...(config.audit.maxMemoryEntries !== undefined && { maxMemoryEntries: config.audit.maxMemoryEntries }),
      });
    }

    const engine = new RuleEngine(factStore, eventStore, timerManager, ruleManager, traceCollector, auditLog, config);
    engine.running = true;

    engine.auditLog?.record('engine_started', {
      name: engine.config.name,
      rulesCount: ruleManager.size,
    });

    return engine;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                          SPRÁVA PRAVIDEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validuje pravidlo bez registrace (dry-run).
   */
  validateRule(input: unknown): ValidationResult {
    return this.validator.validate(input);
  }

  /**
   * Registruje nové pravidlo.
   *
   * Vstup je před registrací validován. Pokud validace selže, throwne
   * {@link RuleValidationError} se seznamem nalezených chyb.
   *
   * @param options.skipValidation - Přeskočí validaci pro důvěryhodné zdroje
   *   (např. DSL builder produkuje typově bezpečný výstup).
   */
  registerRule(input: RuleInput, options?: { skipValidation?: boolean }): Rule {
    this.ensureRunning();

    if (!options?.skipValidation) {
      const result = this.validator.validate(input);
      if (!result.valid) {
        throw new RuleValidationError('Rule validation failed', result.errors);
      }
    }

    const rule = this.ruleManager.register(input);

    this.auditLog?.record('rule_registered', {
      trigger: rule.trigger,
      conditionsCount: rule.conditions.length,
      actionsCount: rule.actions.length,
    }, {
      ruleId: rule.id,
      ruleName: rule.name,
    });

    return rule;
  }

  /**
   * Odregistruje pravidlo.
   */
  unregisterRule(ruleId: string): boolean {
    this.ensureRunning();
    const rule = this.ruleManager.get(ruleId);
    const removed = this.ruleManager.unregister(ruleId);

    if (removed) {
      this.auditLog?.record('rule_unregistered', {}, {
        ruleId,
        ...(rule?.name !== undefined && { ruleName: rule.name }),
      });
    }

    return removed;
  }

  /**
   * Povolí pravidlo.
   */
  enableRule(ruleId: string): boolean {
    this.ensureRunning();
    const enabled = this.ruleManager.enable(ruleId);

    if (enabled) {
      const rule = this.ruleManager.get(ruleId);
      this.auditLog?.record('rule_enabled', {}, {
        ruleId,
        ...(rule?.name !== undefined && { ruleName: rule.name }),
      });
    }

    return enabled;
  }

  /**
   * Zakáže pravidlo.
   */
  disableRule(ruleId: string): boolean {
    this.ensureRunning();
    const disabled = this.ruleManager.disable(ruleId);

    if (disabled) {
      const rule = this.ruleManager.get(ruleId);
      this.auditLog?.record('rule_disabled', {}, {
        ruleId,
        ...(rule?.name !== undefined && { ruleName: rule.name }),
      });
    }

    return disabled;
  }

  /**
   * Získá pravidlo podle ID.
   */
  getRule(ruleId: string): Rule | undefined {
    return this.ruleManager.get(ruleId);
  }

  /**
   * Vrátí všechna registrovaná pravidla.
   */
  getRules(): Rule[] {
    return this.ruleManager.getAll();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                           SPRÁVA FAKTŮ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Nastaví fakt a spustí vyhodnocení relevantních pravidel.
   */
  async setFact(key: string, value: unknown): Promise<Fact> {
    this.ensureRunning();
    const previousValue = this.factStore.get(key)?.value;
    const fact = this.factStore.set(key, value, 'api');

    this.traceCollector.record('fact_changed', {
      key: fact.key,
      previousValue,
      newValue: fact.value,
      source: fact.source
    });

    const auditType = previousValue === undefined ? 'fact_created' : 'fact_updated';
    this.auditLog?.record(auditType, {
      key: fact.key,
      value: fact.value,
      ...(previousValue !== undefined && { previousValue }),
    });

    await this.processTrigger({ type: 'fact', data: fact });
    return fact;
  }

  /**
   * Získá hodnotu faktu.
   */
  getFact(key: string): unknown | undefined {
    return this.factStore.get(key)?.value;
  }

  /**
   * Získá celý fakt (včetně metadat).
   */
  getFactFull(key: string): Fact | undefined {
    return this.factStore.get(key);
  }

  /**
   * Smaže fakt.
   */
  deleteFact(key: string): boolean {
    this.ensureRunning();
    const existing = this.factStore.get(key);
    const deleted = this.factStore.delete(key);

    if (deleted) {
      this.auditLog?.record('fact_deleted', {
        key,
        lastValue: existing?.value,
      });
    }

    return deleted;
  }

  /**
   * Vyhledá fakty podle patternu.
   */
  queryFacts(pattern: string): Fact[] {
    return this.factStore.query(pattern);
  }

  /**
   * Vrátí všechny fakty.
   */
  getAllFacts(): Fact[] {
    return this.factStore.getAll();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                           EMITOVÁNÍ EVENTŮ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Emituje event a spustí vyhodnocení relevantních pravidel.
   */
  async emit(topic: string, data: Record<string, unknown> = {}): Promise<Event> {
    this.ensureRunning();

    const event: Event = {
      id: generateId(),
      topic,
      data,
      timestamp: Date.now(),
      source: 'api'
    };

    await this.handleInternalEvent(topic, event);
    return event;
  }

  /**
   * Emituje event s korelací.
   */
  async emitCorrelated(
    topic: string,
    data: Record<string, unknown>,
    correlationId: string,
    causationId?: string
  ): Promise<Event> {
    this.ensureRunning();

    const event: Event = {
      id: generateId(),
      topic,
      data,
      timestamp: Date.now(),
      correlationId,
      causationId,
      source: 'api'
    };

    await this.handleInternalEvent(topic, event);
    return event;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                              TIMERY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Nastaví timer.
   */
  async setTimer(config: {
    name: string;
    duration: string | number;
    onExpire: {
      topic: string;
      data: Record<string, unknown>;
    };
    repeat?: {
      interval: string | number;
      maxCount?: number;
    };
  }): Promise<Timer> {
    this.ensureRunning();
    const timer = await this.timerManager.setTimer(config);

    this.traceCollector.record('timer_set', {
      timerId: timer.id,
      timerName: timer.name,
      duration: config.duration,
      expiresAt: timer.expiresAt,
      onExpire: timer.onExpire,
      repeat: config.repeat
    }, {
      ...(timer.correlationId && { correlationId: timer.correlationId })
    });

    return timer;
  }

  /**
   * Zruší timer.
   */
  async cancelTimer(name: string): Promise<boolean> {
    this.ensureRunning();
    const timer = this.timerManager.getTimer(name);
    const cancelled = await this.timerManager.cancelTimer(name);

    if (cancelled && timer) {
      this.traceCollector.record('timer_cancelled', {
        timerId: timer.id,
        timerName: timer.name
      }, {
        ...(timer.correlationId && { correlationId: timer.correlationId })
      });
    }

    return cancelled;
  }

  /**
   * Získá timer.
   */
  getTimer(name: string): Timer | undefined {
    return this.timerManager.getTimer(name);
  }

  /**
   * Vrátí všechny aktivní timery.
   */
  getTimers(): Timer[] {
    return this.timerManager.getAll();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                           SUBSCRIBOVÁNÍ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribuje na eventy podle topic patternu.
   * Podporuje wildcardy: "order.*", "*"
   */
  subscribe(topicPattern: string, handler: EventHandler): Unsubscribe {
    const hasWildcard = topicPattern.includes('*');
    const targetMap = hasWildcard ? this.wildcardSubscribers : this.subscribers;

    let handlers = targetMap.get(topicPattern);
    if (!handlers) {
      handlers = new Set();
      targetMap.set(topicPattern, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        targetMap.delete(topicPattern);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                            STATISTIKY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vrátí statistiky enginu včetně volitelných tracing a profiling dat.
   */
  getStats(): EngineStats {
    const { totalEventsProcessed, totalRulesExecuted, totalProcessingTimeMs } = this.internals;

    const stats: EngineStats = {
      rulesCount: this.ruleManager.size,
      factsCount: this.factStore.size,
      timersCount: this.timerManager.size,
      eventsProcessed: totalEventsProcessed,
      rulesExecuted: totalRulesExecuted,
      avgProcessingTimeMs: totalRulesExecuted > 0
        ? totalProcessingTimeMs / totalRulesExecuted
        : 0
    };

    stats.tracing = {
      enabled: this.traceCollector.isEnabled(),
      entriesCount: this.traceCollector.getStats().entriesCount,
      maxEntries: this.traceCollector.getStats().maxEntries
    };

    if (this.profiler) {
      const summary = this.profiler.getSummary();
      stats.profiling = {
        totalRulesProfiled: summary.totalRulesProfiled,
        totalTriggers: summary.totalTriggers,
        totalExecutions: summary.totalExecutions,
        totalTimeMs: summary.totalTimeMs,
        avgRuleTimeMs: summary.avgRuleTimeMs,
        slowestRule: summary.slowestRule,
        hottestRule: summary.hottestRule
      };
    }

    if (this.auditLog) {
      stats.audit = this.auditLog.getStats();
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                              TRACING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Povolí debugging tracing.
   */
  enableTracing(): void {
    this.traceCollector.enable();
  }

  /**
   * Zakáže debugging tracing.
   */
  disableTracing(): void {
    this.traceCollector.disable();
  }

  /**
   * Zjistí, zda je tracing povolen.
   */
  isTracingEnabled(): boolean {
    return this.traceCollector.isEnabled();
  }

  /**
   * Vrátí TraceCollector pro přímý přístup k trace entries.
   */
  getTraceCollector(): TraceCollector {
    return this.traceCollector;
  }

  /**
   * Vrátí EventStore pro přímý přístup k eventům.
   * Primárně určeno pro debugging a history queries.
   */
  getEventStore(): EventStore {
    return this.eventStore;
  }

  /**
   * Vrátí FactStore pro přímý přístup k faktům.
   * Primárně určeno pro debugging a snapshots.
   */
  getFactStore(): FactStore {
    return this.factStore;
  }

  /**
   * Vrátí AuditLogService pro přímý přístup k audit záznamům.
   * Vrací null pokud není audit nakonfigurován.
   */
  getAuditLog(): AuditLogService | null {
    return this.auditLog;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                              PROFILING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Povolí performance profiling.
   * Profiler automaticky sleduje trace entries a agreguje statistiky.
   */
  enableProfiling(): Profiler {
    if (!this.profiler) {
      this.profiler = new Profiler(this.traceCollector);
    }
    return this.profiler;
  }

  /**
   * Zakáže performance profiling a uvolní profiler.
   */
  disableProfiling(): void {
    if (this.profiler) {
      this.profiler.stop();
      this.profiler = null;
    }
  }

  /**
   * Zjistí, zda je profiling povolen.
   */
  isProfilingEnabled(): boolean {
    return this.profiler !== null;
  }

  /**
   * Vrátí Profiler pro přímý přístup k profilovacím datům.
   * Vrací null pokud není profiling povolen.
   */
  getProfiler(): Profiler | null {
    return this.profiler;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                            LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Zastaví engine a uvolní všechny prostředky.
   */
  async stop(): Promise<void> {
    this.auditLog?.record('engine_stopped', {
      name: this.config.name,
      rulesCount: this.ruleManager.size,
      factsCount: this.factStore.size,
      eventsProcessed: this.internals.totalEventsProcessed,
      rulesExecuted: this.internals.totalRulesExecuted,
    });

    this.running = false;

    // Počkat na dokončení zpracování
    await this.processingQueue;

    // Finální uložení pravidel před ukončením
    await this.ruleManager.persist();

    // Zastavit profiler pokud běží
    if (this.profiler) {
      this.profiler.stop();
      this.profiler = null;
    }

    await this.timerManager.stop();
    await this.auditLog?.stop();
    this.subscribers.clear();
    this.wildcardSubscribers.clear();
  }

  /**
   * Kontroluje, zda engine běží.
   */
  get isRunning(): boolean {
    return this.running;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                         INTERNÍ METODY
  // ═══════════════════════════════════════════════════════════════════════════

  private setupTimerHandler(): void {
    this.timerManager.onExpire(async (timer: Timer) => {
      if (!this.running) return;

      this.traceCollector.record('timer_expired', {
        timerId: timer.id,
        timerName: timer.name,
        expiresAt: timer.expiresAt,
        onExpire: timer.onExpire
      }, {
        ...(timer.correlationId && { correlationId: timer.correlationId })
      });

      // Zpracovat pravidla s timer triggerem
      await this.processTrigger({ type: 'timer', data: timer });

      // Emitovat event nakonfigurovaný v timeru
      const event: Event = {
        id: generateId(),
        topic: timer.onExpire.topic,
        data: timer.onExpire.data,
        timestamp: Date.now(),
        correlationId: timer.correlationId,
        causationId: timer.id,
        source: 'timer'
      };

      await this.handleInternalEvent(event.topic, event);
    });
  }

  private async handleInternalEvent(topic: string, event: Event): Promise<void> {
    this.eventStore.store(event);
    this.internals.totalEventsProcessed++;

    this.traceCollector.record('event_emitted', {
      eventId: event.id,
      topic: event.topic,
      data: event.data,
      source: event.source
    }, {
      ...(event.correlationId && { correlationId: event.correlationId }),
      ...(event.causationId && { causationId: event.causationId })
    });

    this.auditLog?.record('event_emitted', {
      eventId: event.id,
      topic: event.topic,
      data: event.data,
    }, {
      source: event.source,
      ...(event.correlationId && { correlationId: event.correlationId }),
    });

    // Notifikovat subscribery
    await this.notifySubscribers(topic, event);

    // Zpracovat pravidla
    await this.processTrigger({ type: 'event', data: event });
  }

  private async notifySubscribers(topic: string, event: Event): Promise<void> {
    const handlers: EventHandler[] = [];

    // Přesné shody
    const exactHandlers = this.subscribers.get(topic);
    if (exactHandlers) {
      handlers.push(...exactHandlers);
    }

    // Wildcard shody
    for (const [pattern, patternHandlers] of this.wildcardSubscribers) {
      if (this.matchesTopicPattern(topic, pattern)) {
        handlers.push(...patternHandlers);
      }
    }

    // Paralelní volání handlerů
    await Promise.all(
      handlers.map(async handler => {
        try {
          await handler(event, topic);
        } catch (error) {
          console.error(`[${this.config.name}] Subscriber error for topic "${topic}":`, error);
        }
      })
    );
  }

  private matchesTopicPattern(topic: string, pattern: string): boolean {
    if (pattern === '*') return true;

    const patternParts = pattern.split('.');
    const topicParts = topic.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const topicPart = topicParts[i];

      if (patternPart === '*') {
        if (i === patternParts.length - 1) return true;
        continue;
      }

      if (patternPart !== topicPart) return false;
    }

    return patternParts.length === topicParts.length;
  }

  private async processTrigger(
    trigger: { type: 'fact' | 'event' | 'timer'; data: Fact | Event | Timer }
  ): Promise<void> {
    // Pokud jsme již uvnitř zpracování pravidla (např. emit_event v akci),
    // zpracujeme přímo bez čekání na frontu - předejdeme deadlocku
    if (this.processingDepth > 0) {
      await this.processTriggeredRules(trigger);
      return;
    }

    // Zřetězení zpracování pro zachování pořadí
    this.processingQueue = this.processingQueue.then(async () => {
      if (!this.running) return;
      await this.processTriggeredRules(trigger);
    });

    await this.processingQueue;
  }

  private async processTriggeredRules(
    trigger: { type: 'fact' | 'event' | 'timer'; data: Fact | Event | Timer }
  ): Promise<void> {
    if (!this.running) return;

    const rules = this.findMatchingRules(trigger);
    if (rules.length === 0) return;

    // Paralelní zpracování s limitem souběžnosti
    await this.processRulesWithConcurrencyLimit(rules, trigger);
  }

  private findMatchingRules(
    trigger: { type: 'fact' | 'event' | 'timer'; data: Fact | Event | Timer }
  ): Rule[] {
    switch (trigger.type) {
      case 'fact':
        return this.ruleManager.getByFactPattern((trigger.data as Fact).key);
      case 'event':
        return this.ruleManager.getByEventTopic((trigger.data as Event).topic);
      case 'timer':
        return this.ruleManager.getByTimerName((trigger.data as Timer).name);
      default:
        return [];
    }
  }

  private async processRulesWithConcurrencyLimit(
    rules: Rule[],
    trigger: { type: 'fact' | 'event' | 'timer'; data: Fact | Event | Timer }
  ): Promise<void> {
    const limit = this.config.maxConcurrency;
    const chunks: Rule[][] = [];

    for (let i = 0; i < rules.length; i += limit) {
      chunks.push(rules.slice(i, i + limit));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(rule => this.evaluateAndExecuteRule(rule, trigger))
      );
    }
  }

  private async evaluateAndExecuteRule(
    rule: Rule,
    trigger: { type: 'fact' | 'event' | 'timer'; data: Fact | Event | Timer }
  ): Promise<void> {
    const startTime = Date.now();
    const correlationId = this.extractCorrelationId(trigger);

    // Trace rule triggered
    const triggeredEntry = this.traceCollector.record('rule_triggered', {
      triggerType: trigger.type,
      triggerData: this.buildTriggerData(trigger)
    }, {
      ruleId: rule.id,
      ruleName: rule.name,
      ...(correlationId && { correlationId })
    });

    try {
      const triggerData = this.buildTriggerData(trigger);

      const evalContext: EvaluationContext = {
        trigger: {
          type: trigger.type,
          data: triggerData
        },
        facts: this.factStore,
        variables: new Map()
      };

      const evalOptions: EvaluationOptions = {
        onConditionEvaluated: (result) => {
          this.traceCollector.record('condition_evaluated', {
            conditionIndex: result.conditionIndex,
            source: result.source,
            operator: result.operator,
            actualValue: result.actualValue,
            expectedValue: result.expectedValue,
            passed: result.result
          }, {
            ruleId: rule.id,
            ruleName: rule.name,
            ...(correlationId && { correlationId }),
            ...(triggeredEntry?.id && { causationId: triggeredEntry.id }),
            durationMs: result.durationMs
          });
        }
      };

      const conditionsMet = this.conditionEvaluator.evaluateAll(rule.conditions, evalContext, evalOptions);
      if (!conditionsMet) {
        const skipDurationMs = Date.now() - startTime;
        this.traceCollector.record('rule_skipped', {
          reason: 'conditions_not_met'
        }, {
          ruleId: rule.id,
          ruleName: rule.name,
          ...(correlationId && { correlationId }),
          ...(triggeredEntry?.id && { causationId: triggeredEntry.id }),
          durationMs: skipDurationMs
        });

        this.auditLog?.record('rule_skipped', {
          reason: 'conditions_not_met',
          triggerType: trigger.type,
        }, {
          ruleId: rule.id,
          ruleName: rule.name,
          ...(correlationId && { correlationId }),
          durationMs: skipDurationMs,
        });

        return;
      }

      const execContext: ExecutionContext = {
        trigger: evalContext.trigger,
        facts: this.factStore,
        variables: new Map()
      };

      if (trigger.type === 'event') {
        const eventData = trigger.data as Event;
        if (eventData.correlationId) {
          execContext.correlationId = eventData.correlationId;
        }
        execContext.matchedEvents = [eventData];
      } else if (trigger.type === 'timer') {
        const timerData = trigger.data as Timer;
        if (timerData.correlationId) {
          execContext.correlationId = timerData.correlationId;
        }
      }

      const execOptions: ExecutionOptions = {
        onActionStarted: (info) => {
          this.traceCollector.record('action_started', {
            actionIndex: info.actionIndex,
            actionType: info.actionType,
            input: info.input
          }, {
            ruleId: rule.id,
            ruleName: rule.name,
            ...(correlationId && { correlationId }),
            ...(triggeredEntry?.id && { causationId: triggeredEntry.id })
          });
        },
        onActionCompleted: (info) => {
          this.traceCollector.record('action_completed', {
            actionIndex: info.actionIndex,
            actionType: info.actionType,
            output: info.output
          }, {
            ruleId: rule.id,
            ruleName: rule.name,
            ...(correlationId && { correlationId }),
            ...(triggeredEntry?.id && { causationId: triggeredEntry.id }),
            durationMs: info.durationMs
          });
        },
        onActionFailed: (info) => {
          this.traceCollector.record('action_failed', {
            actionIndex: info.actionIndex,
            actionType: info.actionType,
            error: info.error
          }, {
            ruleId: rule.id,
            ruleName: rule.name,
            ...(correlationId && { correlationId }),
            ...(triggeredEntry?.id && { causationId: triggeredEntry.id }),
            durationMs: info.durationMs
          });
        }
      };

      this.processingDepth++;
      try {
        await this.actionExecutor.execute(rule.actions, execContext, execOptions);
      } finally {
        this.processingDepth--;
      }

      const durationMs = Date.now() - startTime;
      this.internals.totalRulesExecuted++;
      this.internals.totalProcessingTimeMs += durationMs;

      this.traceCollector.record('rule_executed', {
        actionsCount: rule.actions.length
      }, {
        ruleId: rule.id,
        ruleName: rule.name,
        ...(correlationId && { correlationId }),
        ...(triggeredEntry?.id && { causationId: triggeredEntry.id }),
        durationMs
      });

      this.auditLog?.record('rule_executed', {
        actionsCount: rule.actions.length,
        triggerType: trigger.type,
      }, {
        ruleId: rule.id,
        ruleName: rule.name,
        ...(correlationId && { correlationId }),
        durationMs,
      });
    } catch (error) {
      // Unexpected errors outside ActionExecutor (e.g., context preparation)
      // Action-level failures are traced via onActionFailed callback
      console.error(
        `[${this.config.name}] Error executing rule "${rule.name}" (${rule.id}):`,
        error
      );

      this.auditLog?.record('rule_failed', {
        error: error instanceof Error ? error.message : String(error),
        triggerType: trigger.type,
      }, {
        ruleId: rule.id,
        ruleName: rule.name,
        ...(correlationId && { correlationId }),
        durationMs: Date.now() - startTime,
      });
    }
  }

  private extractCorrelationId(
    trigger: { type: 'fact' | 'event' | 'timer'; data: Fact | Event | Timer }
  ): string | undefined {
    if (trigger.type === 'event') {
      return (trigger.data as Event).correlationId;
    }
    if (trigger.type === 'timer') {
      return (trigger.data as Timer).correlationId;
    }
    return undefined;
  }

  private buildTriggerData(
    trigger: { type: 'fact' | 'event' | 'timer'; data: Fact | Event | Timer }
  ): Record<string, unknown> {
    switch (trigger.type) {
      case 'fact':
        return { fact: trigger.data };
      case 'event':
        return (trigger.data as Event).data;
      case 'timer': {
        const timer = trigger.data as Timer;
        return {
          timerId: timer.id,
          timerName: timer.name,
          expiresAt: timer.expiresAt,
          correlationId: timer.correlationId,
          ...timer.onExpire.data
        };
      }
      default:
        return {};
    }
  }

  private ensureRunning(): void {
    if (!this.running) {
      throw new Error(`RuleEngine "${this.config.name}" is not running`);
    }
  }
}
