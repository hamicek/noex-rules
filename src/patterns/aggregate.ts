import type { Event } from '../types/event.js';
import type { AggregatePattern, EventMatcher } from '../types/temporal.js';
import { generateId } from '../utils/id-generator.js';
import { parseDuration } from '../utils/duration-parser.js';
import { matchesTopic, matchesFilter, getNestedValue } from '../utils/pattern-matcher.js';

/**
 * Stav instance aggregate vzoru.
 */
export type AggregateInstanceState = 'active' | 'triggered' | 'expired';

/**
 * Instance aktivniho aggregate vzoru.
 * Kazda instance sleduje agregovanou hodnotu v casovem okne pro danou skupinu.
 */
export interface AggregateInstance {
  readonly id: string;
  readonly patternId: string;
  readonly pattern: AggregatePattern;
  state: AggregateInstanceState;
  readonly events: Event[];
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly groupKey: string | undefined;
}

/**
 * Vysledek matchnuteho aggregate vzoru.
 */
export interface AggregateMatch {
  readonly instanceId: string;
  readonly patternId: string;
  readonly pattern: AggregatePattern;
  readonly value: number;
  readonly events: readonly Event[];
  readonly groupKey: string | undefined;
}

/**
 * Callback volany pri splneni aggregate podmínky.
 */
export type AggregateMatchCallback = (match: AggregateMatch) => void | Promise<void>;

/**
 * Konfigurace pro AggregateMatcher.
 */
export interface AggregateMatcherConfig {
  /**
   * Callback volany pri splneni aggregate podminky.
   */
  onMatch?: AggregateMatchCallback;

  /**
   * Callback volany pri expiraci tumbling window.
   */
  onWindowExpire?: (instance: AggregateInstance) => void | Promise<void>;

  /**
   * Funkce pro ziskani aktualniho casu.
   * Umoznuje testovani s mock casem.
   */
  now?: () => number;
}

/**
 * Matcher pro aggregate vzory.
 *
 * Aggregate vzor sleduje hodnoty pole v eventech a aplikuje agregacni funkci
 * (sum, avg, min, max, count) v casovem okne. Triggeruje match kdyz vysledek
 * splni podminku (gte/lte/eq) vuci thresholdu.
 *
 * Podporuje dva rezimy:
 * - **Sliding window** (vychozi): Kontinualne sleduje poslednich N milisekund.
 *   Match se triggeruje ihned kdyz je podminka splnena.
 * - **Tumbling window**: Rozdeluje cas na fixni intervaly.
 *   Match se kontroluje na konci kazdeho intervalu.
 *
 * @example
 * ```typescript
 * const matcher = new AggregateMatcher({
 *   onMatch: (match) => console.log('Threshold reached:', match.value)
 * });
 *
 * const pattern: AggregatePattern = {
 *   type: 'aggregate',
 *   event: { topic: 'order.paid' },
 *   field: 'amount',
 *   function: 'sum',
 *   threshold: 10000,
 *   comparison: 'gte',
 *   window: '1h',
 *   groupBy: 'region'
 * };
 *
 * matcher.addPattern('revenue-spike', pattern);
 * await matcher.processEvent(event); // Triggers when sum >= 10000
 * ```
 */
export class AggregateMatcher {
  private readonly instances: Map<string, AggregateInstance> = new Map();
  private readonly byPattern: Map<string, Set<string>> = new Map();
  private readonly byGroup: Map<string, string> = new Map(); // groupKey → instanceId
  private readonly patterns: Map<string, AggregatePattern> = new Map();

  private readonly onMatchCallback: AggregateMatchCallback | undefined;
  private readonly onWindowExpireCallback: ((instance: AggregateInstance) => void | Promise<void>) | undefined;
  private readonly now: () => number;

  constructor(config: AggregateMatcherConfig = {}) {
    this.onMatchCallback = config.onMatch;
    this.onWindowExpireCallback = config.onWindowExpire;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Prida pattern pro sledovani.
   */
  addPattern(patternId: string, pattern: AggregatePattern): void {
    if (pattern.type !== 'aggregate') {
      throw new Error(`Expected aggregate pattern, got: ${pattern.type}`);
    }
    if (!pattern.field || pattern.field.length === 0) {
      throw new Error('Field must be specified for aggregate pattern');
    }
    if (!isValidAggregateFunction(pattern.function)) {
      throw new Error(`Invalid aggregate function: ${pattern.function}`);
    }
    this.patterns.set(patternId, pattern);
    this.byPattern.set(patternId, new Set());
  }

  /**
   * Odebere pattern a vsechny jeho instance.
   */
  removePattern(patternId: string): boolean {
    const existed = this.patterns.delete(patternId);
    if (existed) {
      const instanceIds = this.byPattern.get(patternId);
      if (instanceIds) {
        for (const instanceId of instanceIds) {
          this.removeInstance(instanceId);
        }
        this.byPattern.delete(patternId);
      }
    }
    return existed;
  }

  /**
   * Zpracuje prichozi event.
   * Vraci pole matchnutych vzoru.
   */
  async processEvent(event: Event): Promise<AggregateMatch[]> {
    const matches: AggregateMatch[] = [];
    const now = this.now();

    for (const [patternId, pattern] of this.patterns) {
      if (!this.matchesEventMatcher(event, pattern.event)) {
        continue;
      }

      const groupKey = pattern.groupBy ? this.extractGroupKey(event, pattern.groupBy) : undefined;
      const windowMs = parseDuration(pattern.window);
      const isSlidingWindow = (pattern as AggregatePattern & { sliding?: boolean }).sliding !== false;

      if (isSlidingWindow) {
        const match = await this.processSlidingWindow(event, patternId, pattern, groupKey, windowMs, now);
        if (match) {
          matches.push(match);
        }
      } else {
        const match = await this.processTumblingWindow(event, patternId, pattern, groupKey, windowMs, now);
        if (match) {
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Zpracuje konec tumbling window.
   * Vola se kdyz uplyne casove okno.
   */
  async handleWindowEnd(instanceId: string): Promise<AggregateMatch | undefined> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return undefined;
    }

    if (instance.state !== 'active') {
      this.removeInstance(instanceId);
      return undefined;
    }

    const values = this.extractValues(instance.events, instance.pattern.field);
    const aggregatedValue = computeAggregate(values, instance.pattern.function);
    const matches = this.compareValue(aggregatedValue, instance.pattern.threshold, instance.pattern.comparison);

    if (matches) {
      instance.state = 'triggered';
      const match: AggregateMatch = {
        instanceId: instance.id,
        patternId: instance.patternId,
        pattern: instance.pattern,
        value: aggregatedValue,
        events: [...instance.events],
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

    if (this.onWindowExpireCallback) {
      await this.onWindowExpireCallback(instance);
    }

    return undefined;
  }

  /**
   * Vrati vsechny aktivni instance.
   */
  getActiveInstances(): readonly AggregateInstance[] {
    return [...this.instances.values()];
  }

  /**
   * Vrati instance pro dany pattern.
   */
  getInstancesForPattern(patternId: string): readonly AggregateInstance[] {
    const instanceIds = this.byPattern.get(patternId);
    if (!instanceIds) return [];

    return [...instanceIds]
      .map(id => this.instances.get(id))
      .filter((inst): inst is AggregateInstance => inst !== undefined);
  }

  /**
   * Vrati instanci podle ID.
   */
  getInstance(instanceId: string): AggregateInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Pocet aktivnich instanci.
   */
  get size(): number {
    return this.instances.size;
  }

  /**
   * Vycisti vsechny instance.
   */
  clear(): void {
    this.instances.clear();
    for (const [, set] of this.byPattern) {
      set.clear();
    }
    this.byGroup.clear();
  }

  /**
   * Vycisti vsechny pattern a instance.
   */
  reset(): void {
    this.clear();
    this.patterns.clear();
    this.byPattern.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    INTERNI METODY
  // ═══════════════════════════════════════════════════════════════════════════

  private async processSlidingWindow(
    event: Event,
    patternId: string,
    pattern: AggregatePattern,
    groupKey: string | undefined,
    windowMs: number,
    now: number
  ): Promise<AggregateMatch | undefined> {
    const fullGroupKey = this.makeFullGroupKey(patternId, groupKey);
    let instance = this.findInstanceByGroup(fullGroupKey);

    if (!instance) {
      instance = this.createInstance(patternId, pattern, groupKey, now, windowMs);
      this.addInstance(instance, fullGroupKey);
    }

    instance.events.push(event);

    const windowStart = now - windowMs;
    this.pruneEvents(instance, windowStart);

    const values = this.extractValues(instance.events, pattern.field);
    const aggregatedValue = computeAggregate(values, pattern.function);

    if (this.compareValue(aggregatedValue, pattern.threshold, pattern.comparison)) {
      instance.state = 'triggered';
      const match: AggregateMatch = {
        instanceId: instance.id,
        patternId: instance.patternId,
        pattern: instance.pattern,
        value: aggregatedValue,
        events: [...instance.events],
        groupKey: instance.groupKey
      };

      if (this.onMatchCallback) {
        await this.onMatchCallback(match);
      }

      instance.state = 'active';

      return match;
    }

    return undefined;
  }

  private async processTumblingWindow(
    event: Event,
    patternId: string,
    pattern: AggregatePattern,
    groupKey: string | undefined,
    windowMs: number,
    now: number
  ): Promise<AggregateMatch | undefined> {
    const fullGroupKey = this.makeFullGroupKey(patternId, groupKey);
    let instance = this.findInstanceByGroup(fullGroupKey);

    if (instance && now > instance.windowEnd) {
      await this.handleWindowEnd(instance.id);
      instance = undefined;
    }

    if (!instance) {
      const windowStart = this.calculateTumblingWindowStart(now, windowMs);
      instance = {
        id: generateId(),
        patternId,
        pattern,
        state: 'active',
        events: [],
        windowStart,
        windowEnd: windowStart + windowMs,
        groupKey
      };
      this.addInstance(instance, fullGroupKey);
    }

    instance.events.push(event);

    return undefined;
  }

  private createInstance(
    patternId: string,
    pattern: AggregatePattern,
    groupKey: string | undefined,
    now: number,
    windowMs: number
  ): AggregateInstance {
    return {
      id: generateId(),
      patternId,
      pattern,
      state: 'active',
      events: [],
      windowStart: now - windowMs,
      windowEnd: now,
      groupKey
    };
  }

  private addInstance(instance: AggregateInstance, fullGroupKey: string): void {
    this.instances.set(instance.id, instance);

    let patternInstances = this.byPattern.get(instance.patternId);
    if (!patternInstances) {
      patternInstances = new Set();
      this.byPattern.set(instance.patternId, patternInstances);
    }
    patternInstances.add(instance.id);

    this.byGroup.set(fullGroupKey, instance.id);
  }

  private removeInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    this.instances.delete(instanceId);

    const patternInstances = this.byPattern.get(instance.patternId);
    if (patternInstances) {
      patternInstances.delete(instanceId);
    }

    const fullGroupKey = this.makeFullGroupKey(instance.patternId, instance.groupKey);
    if (this.byGroup.get(fullGroupKey) === instanceId) {
      this.byGroup.delete(fullGroupKey);
    }
  }

  private findInstanceByGroup(fullGroupKey: string): AggregateInstance | undefined {
    const instanceId = this.byGroup.get(fullGroupKey);
    if (!instanceId) return undefined;
    return this.instances.get(instanceId);
  }

  private makeFullGroupKey(patternId: string, groupKey: string | undefined): string {
    return groupKey ? `${patternId}:${groupKey}` : patternId;
  }

  private calculateTumblingWindowStart(now: number, windowMs: number): number {
    return Math.floor(now / windowMs) * windowMs;
  }

  private pruneEvents(instance: AggregateInstance, windowStart: number): void {
    while (instance.events.length > 0 && instance.events[0]!.timestamp < windowStart) {
      instance.events.shift();
    }
  }

  private compareValue(value: number, threshold: number, comparison: 'gte' | 'lte' | 'eq'): boolean {
    switch (comparison) {
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
    }
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

  private extractValues(events: readonly Event[], field: string): number[] {
    return events
      .map(e => getNestedValue(e.data, field))
      .filter((v): v is number => typeof v === 'number');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                    PURE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validni agregacni funkce.
 */
export const AGGREGATE_FUNCTIONS = ['sum', 'avg', 'min', 'max', 'count'] as const;
export type AggregateFunction = typeof AGGREGATE_FUNCTIONS[number];

/**
 * Kontroluje, zda je funkce validni agregacni funkce.
 */
export function isValidAggregateFunction(fn: string): fn is AggregateFunction {
  return AGGREGATE_FUNCTIONS.includes(fn as AggregateFunction);
}

/**
 * Vypocita agregovanu hodnotu z pole cisel.
 */
export function computeAggregate(values: readonly number[], fn: AggregateFunction): number {
  if (fn === 'count') {
    return values.length;
  }

  if (values.length === 0) {
    switch (fn) {
      case 'sum': return 0;
      case 'avg': return 0;
      case 'min': return Infinity;
      case 'max': return -Infinity;
    }
  }

  switch (fn) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
  }
}

/**
 * Kontroluje, zda event matchuje matcher.
 */
export function eventMatchesAggregateMatcher(event: Event, matcher: EventMatcher): boolean {
  if (!matchesTopic(event.topic, matcher.topic)) {
    return false;
  }
  if (matcher.filter && !matchesFilter(event.data, matcher.filter)) {
    return false;
  }
  return true;
}

/**
 * Porovná hodnotu s prahem.
 */
export function compareAggregateThreshold(
  value: number,
  threshold: number,
  comparison: 'gte' | 'lte' | 'eq'
): boolean {
  switch (comparison) {
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
  }
}

/**
 * Extrahuje numericke hodnoty z pole eventu.
 */
export function extractNumericValues(events: readonly Event[], field: string): number[] {
  return events
    .map(e => getNestedValue(e.data, field))
    .filter((v): v is number => typeof v === 'number');
}

/**
 * Vypocita zacatek tumbling window pro dany cas.
 */
export function calculateAggregateTumblingWindowStart(timestamp: number, windowMs: number): number {
  return Math.floor(timestamp / windowMs) * windowMs;
}

/**
 * Kontroluje, zda timestamp patri do daneho okna.
 */
export function isInAggregateWindow(timestamp: number, windowStart: number, windowEnd: number): boolean {
  return timestamp >= windowStart && timestamp < windowEnd;
}

/**
 * Filtruje eventy v danem casovem okne.
 */
export function filterEventsInAggregateWindow(events: readonly Event[], windowStart: number, windowEnd: number): Event[] {
  return events.filter(e => e.timestamp >= windowStart && e.timestamp < windowEnd);
}
