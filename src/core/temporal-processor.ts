import type { Event } from '../types/event.js';
import type { Rule } from '../types/rule.js';
import type {
  TemporalPattern,
  SequencePattern,
  AbsencePattern,
  CountPattern,
  AggregatePattern,
  EventMatcher
} from '../types/temporal.js';
import { EventStore } from './event-store.js';
import { TimerManager } from './timer-manager.js';
import { generateId } from '../utils/id-generator.js';
import { parseDuration } from '../utils/duration-parser.js';
import { matchesTopic, matchesFilter, getNestedValue } from '../utils/pattern-matcher.js';

/**
 * Stav instance temporálního vzoru.
 */
export type PatternInstanceState = 'pending' | 'matching' | 'completed' | 'expired';

/**
 * Instance aktivního temporálního vzoru.
 * Každá instance sleduje průběh jednoho konkrétního vzoru (např. pro jeden orderId).
 */
export interface PatternInstance {
  id: string;
  ruleId: string;
  pattern: TemporalPattern;
  state: PatternInstanceState;
  matchedEvents: Event[];
  startedAt: number;
  expiresAt: number;
  groupKey?: string;
}

/**
 * Výsledek matchnutého temporálního vzoru.
 */
export interface PatternMatch {
  ruleId: string;
  instanceId: string;
  pattern: TemporalPattern;
  matchedEvents: Event[];
  groupKey?: string;
  aggregateValue?: number;
  count?: number;
}

type PatternMatchCallback = (match: PatternMatch) => void | Promise<void>;

export interface TemporalProcessorConfig {
  timerPrefix?: string;
}

/**
 * Processor pro temporální vzory (CEP - Complex Event Processing).
 *
 * Zpracovává čtyři typy vzorů:
 * - Sequence: eventy musí přijít v daném pořadí
 * - Absence: očekávaný event nepřišel do určité doby
 * - Count: počet výskytů eventu v časovém okně
 * - Aggregate: agregace hodnot v časovém okně
 */
export class TemporalProcessor {
  private readonly activePatterns: Map<string, PatternInstance> = new Map();
  private readonly byRule: Map<string, Set<string>> = new Map();
  private readonly byGroup: Map<string, Set<string>> = new Map();

  private readonly registeredRules: Map<string, Rule> = new Map();

  private readonly eventStore: EventStore;
  private readonly timerManager: TimerManager;
  private readonly config: Required<TemporalProcessorConfig>;

  private onMatchCallback?: PatternMatchCallback;

  constructor(
    eventStore: EventStore,
    timerManager: TimerManager,
    config: TemporalProcessorConfig = {}
  ) {
    this.eventStore = eventStore;
    this.timerManager = timerManager;
    this.config = {
      timerPrefix: config.timerPrefix ?? 'temporal'
    };
  }

  static async start(
    eventStore: EventStore,
    timerManager: TimerManager,
    config: TemporalProcessorConfig = {}
  ): Promise<TemporalProcessor> {
    return new TemporalProcessor(eventStore, timerManager, config);
  }

  /**
   * Nastaví callback pro notifikaci o matchnutém vzoru.
   */
  onMatch(callback: PatternMatchCallback): void {
    this.onMatchCallback = callback;
  }

  /**
   * Registruje pravidlo s temporálním vzorem.
   */
  registerRule(rule: Rule): void {
    if (rule.trigger.type !== 'temporal') {
      throw new Error(`Rule "${rule.id}" does not have a temporal trigger`);
    }
    this.registeredRules.set(rule.id, rule);
  }

  /**
   * Odregistruje pravidlo.
   */
  unregisterRule(ruleId: string): boolean {
    const existed = this.registeredRules.delete(ruleId);

    if (existed) {
      const instanceIds = this.byRule.get(ruleId);
      if (instanceIds) {
        for (const instanceId of instanceIds) {
          this.removeInstance(instanceId);
        }
        this.byRule.delete(ruleId);
      }
    }

    return existed;
  }

  /**
   * Zpracuje příchozí event.
   * Kontroluje všechny registrované temporální vzory.
   */
  async processEvent(event: Event): Promise<PatternMatch[]> {
    // Uložit event do store (pro Count a Aggregate patterny)
    this.eventStore.store(event);

    const matches: PatternMatch[] = [];

    for (const rule of this.registeredRules.values()) {
      if (!rule.enabled) continue;

      const pattern = (rule.trigger as { type: 'temporal'; pattern: TemporalPattern }).pattern;
      const patternMatches = await this.processEventForPattern(event, rule.id, pattern);
      matches.push(...patternMatches);
    }

    return matches;
  }

  /**
   * Zpracuje timeout instance (pro absence pattern).
   */
  async handleTimeout(instanceId: string): Promise<PatternMatch | undefined> {
    const instance = this.activePatterns.get(instanceId);
    if (!instance) return undefined;

    if (instance.pattern.type === 'absence') {
      instance.state = 'completed';
      const match: PatternMatch = {
        ruleId: instance.ruleId,
        instanceId: instance.id,
        pattern: instance.pattern,
        matchedEvents: instance.matchedEvents,
        groupKey: instance.groupKey
      };

      this.removeInstance(instanceId);

      if (this.onMatchCallback) {
        await this.onMatchCallback(match);
      }

      return match;
    }

    instance.state = 'expired';
    this.removeInstance(instanceId);
    return undefined;
  }

  /**
   * Vrátí všechny aktivní instance.
   */
  getActiveInstances(): PatternInstance[] {
    return [...this.activePatterns.values()];
  }

  /**
   * Vrátí instance pro dané pravidlo.
   */
  getInstancesForRule(ruleId: string): PatternInstance[] {
    const instanceIds = this.byRule.get(ruleId);
    if (!instanceIds) return [];

    return [...instanceIds]
      .map(id => this.activePatterns.get(id))
      .filter((inst): inst is PatternInstance => inst !== undefined);
  }

  /**
   * Počet aktivních instancí.
   */
  get size(): number {
    return this.activePatterns.size;
  }

  /**
   * Vyčistí všechny instance.
   */
  clear(): void {
    for (const instance of this.activePatterns.values()) {
      void this.timerManager.cancelTimer(this.getTimerName(instance.id));
    }
    this.activePatterns.clear();
    this.byRule.clear();
    this.byGroup.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    INTERNÍ METODY
  // ═══════════════════════════════════════════════════════════════════════════

  private async processEventForPattern(
    event: Event,
    ruleId: string,
    pattern: TemporalPattern
  ): Promise<PatternMatch[]> {
    switch (pattern.type) {
      case 'sequence':
        return this.processSequencePattern(event, ruleId, pattern);
      case 'absence':
        return this.processAbsencePattern(event, ruleId, pattern);
      case 'count':
        return this.processCountPattern(event, ruleId, pattern);
      case 'aggregate':
        return this.processAggregatePattern(event, ruleId, pattern);
      default:
        return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    SEQUENCE PATTERN
  // ═══════════════════════════════════════════════════════════════════════════

  private async processSequencePattern(
    event: Event,
    ruleId: string,
    pattern: SequencePattern
  ): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const groupKey = pattern.groupBy ? this.extractGroupKey(event, pattern.groupBy) : undefined;

    // Najít existující instance pro tento rule + group
    const existingInstances = this.findInstances(ruleId, groupKey);

    // Zkontrolovat existující instance
    for (const instance of existingInstances) {
      if (instance.state !== 'matching') continue;

      const nextIndex = instance.matchedEvents.length;
      const expectedMatcher = pattern.events[nextIndex];

      if (!expectedMatcher) continue;

      if (this.matchesEventMatcher(event, expectedMatcher)) {
        instance.matchedEvents.push(event);

        if (instance.matchedEvents.length === pattern.events.length) {
          instance.state = 'completed';
          matches.push({
            ruleId: instance.ruleId,
            instanceId: instance.id,
            pattern: instance.pattern,
            matchedEvents: instance.matchedEvents,
            groupKey: instance.groupKey
          });

          void this.timerManager.cancelTimer(this.getTimerName(instance.id));
          this.removeInstance(instance.id);

          if (this.onMatchCallback) {
            await this.onMatchCallback(matches[matches.length - 1]!);
          }
        }
      } else if (pattern.strict) {
        instance.state = 'expired';
        void this.timerManager.cancelTimer(this.getTimerName(instance.id));
        this.removeInstance(instance.id);
      }
    }

    // Zkontrolovat, zda event může zahájit novou sekvenci
    const firstMatcher = pattern.events[0];
    if (firstMatcher && this.matchesEventMatcher(event, firstMatcher)) {
      const existingForGroup = groupKey
        ? this.findInstances(ruleId, groupKey).filter(i => i.state === 'matching')
        : [];

      if (existingForGroup.length === 0) {
        const instance = this.createInstance(ruleId, pattern, groupKey);
        instance.matchedEvents.push(event);
        instance.state = 'matching';

        if (pattern.events.length === 1) {
          instance.state = 'completed';
          const match: PatternMatch = {
            ruleId: instance.ruleId,
            instanceId: instance.id,
            pattern: instance.pattern,
            matchedEvents: instance.matchedEvents,
            groupKey: instance.groupKey
          };
          matches.push(match);
          this.removeInstance(instance.id);

          if (this.onMatchCallback) {
            await this.onMatchCallback(match);
          }
        } else {
          await this.scheduleTimeout(instance.id, parseDuration(pattern.within));
        }
      }
    }

    return matches;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    ABSENCE PATTERN
  // ═══════════════════════════════════════════════════════════════════════════

  private async processAbsencePattern(
    event: Event,
    ruleId: string,
    pattern: AbsencePattern
  ): Promise<PatternMatch[]> {
    const groupKey = pattern.groupBy ? this.extractGroupKey(event, pattern.groupBy) : undefined;
    const existingInstances = this.findInstances(ruleId, groupKey);

    // Pokud přišel expected event, instance NEUSPĚLY
    for (const instance of existingInstances) {
      if (instance.state !== 'matching') continue;

      if (this.matchesEventMatcher(event, pattern.expected)) {
        instance.state = 'expired';
        void this.timerManager.cancelTimer(this.getTimerName(instance.id));
        this.removeInstance(instance.id);
      }
    }

    // Pokud přišel after event a nemáme aktivní instanci, vytvořit novou
    if (this.matchesEventMatcher(event, pattern.after)) {
      const activeForGroup = this.findInstances(ruleId, groupKey)
        .filter(i => i.state === 'matching');

      if (activeForGroup.length === 0) {
        const instance = this.createInstance(ruleId, pattern, groupKey);
        instance.matchedEvents.push(event);
        instance.state = 'matching';

        await this.scheduleTimeout(instance.id, parseDuration(pattern.within));
      }
    }

    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    COUNT PATTERN
  // ═══════════════════════════════════════════════════════════════════════════

  private async processCountPattern(
    event: Event,
    ruleId: string,
    pattern: CountPattern
  ): Promise<PatternMatch[]> {
    if (!this.matchesEventMatcher(event, pattern.event)) {
      return [];
    }

    const groupKey = pattern.groupBy ? this.extractGroupKey(event, pattern.groupBy) : undefined;
    const windowMs = parseDuration(pattern.window);
    const now = Date.now();

    const eventsInWindow = this.getEventsInWindow(
      pattern.event.topic,
      windowMs,
      pattern.event.filter,
      groupKey,
      pattern.groupBy
    );

    const count = eventsInWindow.length;
    const comparison = pattern.comparison ?? 'gte';

    let thresholdMet = false;
    switch (comparison) {
      case 'gte':
        thresholdMet = count >= pattern.threshold;
        break;
      case 'lte':
        thresholdMet = count <= pattern.threshold;
        break;
      case 'eq':
        thresholdMet = count === pattern.threshold;
        break;
    }

    if (thresholdMet) {
      const match: PatternMatch = {
        ruleId,
        instanceId: generateId(),
        pattern,
        matchedEvents: eventsInWindow,
        groupKey,
        count
      };

      if (this.onMatchCallback) {
        await this.onMatchCallback(match);
      }

      return [match];
    }

    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    AGGREGATE PATTERN
  // ═══════════════════════════════════════════════════════════════════════════

  private async processAggregatePattern(
    event: Event,
    ruleId: string,
    pattern: AggregatePattern
  ): Promise<PatternMatch[]> {
    if (!this.matchesEventMatcher(event, pattern.event)) {
      return [];
    }

    const groupKey = pattern.groupBy ? this.extractGroupKey(event, pattern.groupBy) : undefined;
    const windowMs = parseDuration(pattern.window);

    const eventsInWindow = this.getEventsInWindow(
      pattern.event.topic,
      windowMs,
      pattern.event.filter,
      groupKey,
      pattern.groupBy
    );

    // Pro count funkci počítáme eventy, pro ostatní potřebujeme číselné hodnoty
    let aggregateValue: number;

    if (pattern.function === 'count') {
      aggregateValue = eventsInWindow.length;
    } else {
      const values = eventsInWindow
        .map(e => getNestedValue(e.data, pattern.field))
        .filter((v): v is number => typeof v === 'number');

      if (values.length === 0) {
        return [];
      }

      switch (pattern.function) {
        case 'sum':
          aggregateValue = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          aggregateValue = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'min':
          aggregateValue = Math.min(...values);
          break;
        case 'max':
          aggregateValue = Math.max(...values);
          break;
      }
    }

    let thresholdMet = false;
    switch (pattern.comparison) {
      case 'gte':
        thresholdMet = aggregateValue >= pattern.threshold;
        break;
      case 'lte':
        thresholdMet = aggregateValue <= pattern.threshold;
        break;
      case 'eq':
        thresholdMet = aggregateValue === pattern.threshold;
        break;
    }

    if (thresholdMet) {
      const match: PatternMatch = {
        ruleId,
        instanceId: generateId(),
        pattern,
        matchedEvents: eventsInWindow,
        groupKey,
        aggregateValue,
        count: eventsInWindow.length
      };

      if (this.onMatchCallback) {
        await this.onMatchCallback(match);
      }

      return [match];
    }

    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    POMOCNÉ METODY
  // ═══════════════════════════════════════════════════════════════════════════

  private createInstance(
    ruleId: string,
    pattern: TemporalPattern,
    groupKey?: string
  ): PatternInstance {
    const windowMs = this.getPatternWindow(pattern);
    const now = Date.now();

    const instance: PatternInstance = {
      id: generateId(),
      ruleId,
      pattern,
      state: 'pending',
      matchedEvents: [],
      startedAt: now,
      expiresAt: now + windowMs,
      groupKey
    };

    this.activePatterns.set(instance.id, instance);

    let ruleInstances = this.byRule.get(ruleId);
    if (!ruleInstances) {
      ruleInstances = new Set();
      this.byRule.set(ruleId, ruleInstances);
    }
    ruleInstances.add(instance.id);

    if (groupKey) {
      const fullKey = `${ruleId}:${groupKey}`;
      let groupInstances = this.byGroup.get(fullKey);
      if (!groupInstances) {
        groupInstances = new Set();
        this.byGroup.set(fullKey, groupInstances);
      }
      groupInstances.add(instance.id);
    }

    return instance;
  }

  private removeInstance(instanceId: string): void {
    const instance = this.activePatterns.get(instanceId);
    if (!instance) return;

    this.activePatterns.delete(instanceId);

    const ruleInstances = this.byRule.get(instance.ruleId);
    if (ruleInstances) {
      ruleInstances.delete(instanceId);
      if (ruleInstances.size === 0) {
        this.byRule.delete(instance.ruleId);
      }
    }

    if (instance.groupKey) {
      const fullKey = `${instance.ruleId}:${instance.groupKey}`;
      const groupInstances = this.byGroup.get(fullKey);
      if (groupInstances) {
        groupInstances.delete(instanceId);
        if (groupInstances.size === 0) {
          this.byGroup.delete(fullKey);
        }
      }
    }
  }

  private findInstances(ruleId: string, groupKey?: string): PatternInstance[] {
    if (groupKey) {
      const fullKey = `${ruleId}:${groupKey}`;
      const instanceIds = this.byGroup.get(fullKey);
      if (!instanceIds) return [];

      return [...instanceIds]
        .map(id => this.activePatterns.get(id))
        .filter((inst): inst is PatternInstance => inst !== undefined);
    }

    const instanceIds = this.byRule.get(ruleId);
    if (!instanceIds) return [];

    return [...instanceIds]
      .map(id => this.activePatterns.get(id))
      .filter((inst): inst is PatternInstance => inst !== undefined);
  }

  private matchesEventMatcher(event: Event, matcher: EventMatcher): boolean {
    if (!matchesTopic(event.topic, matcher.topic)) {
      return false;
    }

    if (matcher.filter && !matchesFilter(event.data, matcher.filter)) {
      return false;
    }

    return true;
  }

  private extractGroupKey(event: Event, groupBy: string): string {
    const value = getNestedValue(event.data, groupBy);
    return String(value ?? '');
  }

  private getPatternWindow(pattern: TemporalPattern): number {
    switch (pattern.type) {
      case 'sequence':
        return parseDuration(pattern.within);
      case 'absence':
        return parseDuration(pattern.within);
      case 'count':
        return parseDuration(pattern.window);
      case 'aggregate':
        return parseDuration(pattern.window);
    }
  }

  private getTimerName(instanceId: string): string {
    return `${this.config.timerPrefix}:${instanceId}`;
  }

  private async scheduleTimeout(instanceId: string, durationMs: number): Promise<void> {
    await this.timerManager.setTimer({
      name: this.getTimerName(instanceId),
      duration: durationMs,
      onExpire: {
        topic: 'temporal.timeout',
        data: { instanceId }
      }
    });
  }

  private getEventsInWindow(
    topicPattern: string,
    windowMs: number,
    filter?: Record<string, unknown>,
    groupKey?: string,
    groupBy?: string
  ): Event[] {
    const now = Date.now();
    const from = now - windowMs;

    const allEvents = this.eventStore.getInTimeRange(topicPattern, from, now);

    return allEvents.filter(event => {
      if (filter && !matchesFilter(event.data, filter)) {
        return false;
      }

      if (groupKey && groupBy) {
        const eventGroupKey = this.extractGroupKey(event, groupBy);
        if (eventGroupKey !== groupKey) {
          return false;
        }
      }

      return true;
    });
  }
}
