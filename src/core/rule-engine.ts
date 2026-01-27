import type { Fact } from '../types/fact.js';
import type { Event } from '../types/event.js';
import type { Timer } from '../types/timer.js';
import type { Rule, RuleInput } from '../types/rule.js';
import type { RuleEngineConfig, EngineStats } from '../types/index.js';
import { FactStore, type FactStoreConfig } from './fact-store.js';
import { EventStore, type EventStoreConfig } from './event-store.js';
import { TimerManager, type TimerManagerConfig } from './timer-manager.js';
import { RuleManager } from './rule-manager.js';
import { ConditionEvaluator, type EvaluationContext } from '../evaluation/condition-evaluator.js';
import { ActionExecutor, type ExecutionContext } from '../evaluation/action-executor.js';
import { generateId } from '../utils/id-generator.js';

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
  private readonly config: Required<Omit<RuleEngineConfig, 'persistence'>>;
  private readonly services: Map<string, unknown>;

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

  private constructor(
    factStore: FactStore,
    eventStore: EventStore,
    timerManager: TimerManager,
    ruleManager: RuleManager,
    config: RuleEngineConfig
  ) {
    this.factStore = factStore;
    this.eventStore = eventStore;
    this.timerManager = timerManager;
    this.ruleManager = ruleManager;
    this.conditionEvaluator = new ConditionEvaluator();

    this.config = {
      name: config.name ?? 'rule-engine',
      maxConcurrency: config.maxConcurrency ?? 10,
      debounceMs: config.debounceMs ?? 0,
      services: config.services ?? {}
    };

    this.services = new Map(Object.entries(this.config.services));

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
    const timerManager = await TimerManager.start({});
    const ruleManager = await RuleManager.start();

    const engine = new RuleEngine(factStore, eventStore, timerManager, ruleManager, config);
    engine.running = true;

    return engine;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                          SPRÁVA PRAVIDEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Registruje nové pravidlo.
   */
  registerRule(input: RuleInput): Rule {
    this.ensureRunning();
    return this.ruleManager.register(input);
  }

  /**
   * Odregistruje pravidlo.
   */
  unregisterRule(ruleId: string): boolean {
    this.ensureRunning();
    return this.ruleManager.unregister(ruleId);
  }

  /**
   * Povolí pravidlo.
   */
  enableRule(ruleId: string): boolean {
    this.ensureRunning();
    return this.ruleManager.enable(ruleId);
  }

  /**
   * Zakáže pravidlo.
   */
  disableRule(ruleId: string): boolean {
    this.ensureRunning();
    return this.ruleManager.disable(ruleId);
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
    const fact = this.factStore.set(key, value, 'api');
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
    return this.factStore.delete(key);
  }

  /**
   * Vyhledá fakty podle patternu.
   */
  queryFacts(pattern: string): Fact[] {
    return this.factStore.query(pattern);
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
    return this.timerManager.setTimer(config);
  }

  /**
   * Zruší timer.
   */
  async cancelTimer(name: string): Promise<boolean> {
    this.ensureRunning();
    return this.timerManager.cancelTimer(name);
  }

  /**
   * Získá timer.
   */
  getTimer(name: string): Timer | undefined {
    return this.timerManager.getTimer(name);
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
   * Vrátí statistiky enginu.
   */
  getStats(): EngineStats {
    const { totalEventsProcessed, totalRulesExecuted, totalProcessingTimeMs } = this.internals;

    return {
      rulesCount: this.ruleManager.size,
      factsCount: this.factStore.size,
      timersCount: this.timerManager.size,
      eventsProcessed: totalEventsProcessed,
      rulesExecuted: totalRulesExecuted,
      avgProcessingTimeMs: totalRulesExecuted > 0
        ? totalProcessingTimeMs / totalRulesExecuted
        : 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                            LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Zastaví engine a uvolní všechny prostředky.
   */
  async stop(): Promise<void> {
    this.running = false;

    // Počkat na dokončení zpracování
    await this.processingQueue;

    await this.timerManager.stop();
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

      const conditionsMet = this.conditionEvaluator.evaluateAll(rule.conditions, evalContext);
      if (!conditionsMet) return;

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

      this.processingDepth++;
      try {
        await this.actionExecutor.execute(rule.actions, execContext);
      } finally {
        this.processingDepth--;
      }

      this.internals.totalRulesExecuted++;
      this.internals.totalProcessingTimeMs += Date.now() - startTime;
    } catch (error) {
      console.error(
        `[${this.config.name}] Error executing rule "${rule.name}" (${rule.id}):`,
        error
      );
    }
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
