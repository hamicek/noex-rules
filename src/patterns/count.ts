import type { Event } from '../types/event.js';
import type { CountPattern, EventMatcher } from '../types/temporal.js';
import { generateId } from '../utils/id-generator.js';
import { parseDuration } from '../utils/duration-parser.js';
import { matchesTopic, matchesFilter, getNestedValue } from '../utils/pattern-matcher.js';

/**
 * Stav instance count vzoru.
 */
export type CountInstanceState = 'active' | 'triggered' | 'expired';

/**
 * Instance aktivního count vzoru.
 * Každá instance sleduje počet eventů v časovém okně pro danou skupinu.
 */
export interface CountInstance {
  readonly id: string;
  readonly patternId: string;
  readonly pattern: CountPattern;
  state: CountInstanceState;
  readonly events: Event[];
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly groupKey?: string;
}

/**
 * Výsledek matchnutého count vzoru.
 */
export interface CountMatch {
  readonly instanceId: string;
  readonly patternId: string;
  readonly pattern: CountPattern;
  readonly count: number;
  readonly events: readonly Event[];
  readonly groupKey?: string;
}

/**
 * Callback volaný při splnění count podmínky.
 */
export type CountMatchCallback = (match: CountMatch) => void | Promise<void>;

/**
 * Konfigurace pro CountMatcher.
 */
export interface CountMatcherConfig {
  /**
   * Callback volaný při splnění count podmínky.
   */
  onMatch?: CountMatchCallback;

  /**
   * Callback volaný při expiraci tumbling window.
   */
  onWindowExpire?: (instance: CountInstance) => void | Promise<void>;

  /**
   * Funkce pro získání aktuálního času.
   * Umožňuje testování s mock časem.
   */
  now?: () => number;
}

/**
 * Matcher pro count vzory.
 *
 * Count vzor sleduje počet výskytů eventu v časovém okně a triggeruje
 * match když počet splní podmínku (gte/lte/eq) vůči thresholdu.
 *
 * Podporuje dva režimy:
 * - **Sliding window** (sliding: true): Kontinuálně sleduje posledních N milisekund.
 *   Match se triggeruje ihned když je podmínka splněna.
 * - **Tumbling window** (sliding: false): Rozděluje čas na fixní intervaly.
 *   Match se kontroluje na konci každého intervalu.
 *
 * @example
 * ```typescript
 * const matcher = new CountMatcher({
 *   onMatch: (match) => console.log('Threshold reached:', match.count)
 * });
 *
 * const pattern: CountPattern = {
 *   type: 'count',
 *   event: { topic: 'login.failed' },
 *   threshold: 3,
 *   comparison: 'gte',
 *   window: '5m',
 *   groupBy: 'userId',
 *   sliding: true
 * };
 *
 * matcher.addPattern('brute-force', pattern);
 * await matcher.processEvent(event); // Triggers when 3+ failures in 5 min
 * ```
 */
export class CountMatcher {
  private readonly instances: Map<string, CountInstance> = new Map();
  private readonly byPattern: Map<string, Set<string>> = new Map();
  private readonly byGroup: Map<string, string> = new Map(); // groupKey → instanceId
  private readonly patterns: Map<string, CountPattern> = new Map();

  private readonly onMatchCallback?: CountMatchCallback;
  private readonly onWindowExpireCallback?: (instance: CountInstance) => void | Promise<void>;
  private readonly now: () => number;

  constructor(config: CountMatcherConfig = {}) {
    this.onMatchCallback = config.onMatch;
    this.onWindowExpireCallback = config.onWindowExpire;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Přidá pattern pro sledování.
   */
  addPattern(patternId: string, pattern: CountPattern): void {
    if (pattern.type !== 'count') {
      throw new Error(`Expected count pattern, got: ${pattern.type}`);
    }
    if (pattern.threshold < 0) {
      throw new Error('Threshold must be non-negative');
    }
    this.patterns.set(patternId, pattern);
    this.byPattern.set(patternId, new Set());
  }

  /**
   * Odebere pattern a všechny jeho instance.
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
   * Zpracuje příchozí event.
   * Vrací pole matchnutých vzorů.
   */
  async processEvent(event: Event): Promise<CountMatch[]> {
    const matches: CountMatch[] = [];
    const now = this.now();

    for (const [patternId, pattern] of this.patterns) {
      // Kontrola, zda event matchuje pattern
      if (!this.matchesEventMatcher(event, pattern.event)) {
        continue;
      }

      const groupKey = pattern.groupBy ? this.extractGroupKey(event, pattern.groupBy) : undefined;
      const windowMs = parseDuration(pattern.window);

      if (pattern.sliding !== false) {
        // Sliding window - kontinuální sledování
        const match = await this.processSlidingWindow(event, patternId, pattern, groupKey, windowMs, now);
        if (match) {
          matches.push(match);
        }
      } else {
        // Tumbling window - fixní intervaly
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
   * Volá se když uplyne časové okno.
   */
  async handleWindowEnd(instanceId: string): Promise<CountMatch | undefined> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return undefined;
    }

    if (instance.state !== 'active') {
      this.removeInstance(instanceId);
      return undefined;
    }

    const count = instance.events.length;
    const pattern = instance.pattern;
    const matches = this.compareCount(count, pattern.threshold, pattern.comparison);

    if (matches) {
      instance.state = 'triggered';
      const match: CountMatch = {
        instanceId: instance.id,
        patternId: instance.patternId,
        pattern: instance.pattern,
        count,
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
   * Vrátí všechny aktivní instance.
   */
  getActiveInstances(): readonly CountInstance[] {
    return [...this.instances.values()];
  }

  /**
   * Vrátí instance pro daný pattern.
   */
  getInstancesForPattern(patternId: string): readonly CountInstance[] {
    const instanceIds = this.byPattern.get(patternId);
    if (!instanceIds) return [];

    return [...instanceIds]
      .map(id => this.instances.get(id))
      .filter((inst): inst is CountInstance => inst !== undefined);
  }

  /**
   * Vrátí instanci podle ID.
   */
  getInstance(instanceId: string): CountInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Počet aktivních instancí.
   */
  get size(): number {
    return this.instances.size;
  }

  /**
   * Vyčistí všechny instance.
   */
  clear(): void {
    this.instances.clear();
    for (const [, set] of this.byPattern) {
      set.clear();
    }
    this.byGroup.clear();
  }

  /**
   * Vyčistí všechny pattern a instance.
   */
  reset(): void {
    this.clear();
    this.patterns.clear();
    this.byPattern.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    INTERNÍ METODY
  // ═══════════════════════════════════════════════════════════════════════════

  private async processSlidingWindow(
    event: Event,
    patternId: string,
    pattern: CountPattern,
    groupKey: string | undefined,
    windowMs: number,
    now: number
  ): Promise<CountMatch | undefined> {
    const fullGroupKey = this.makeFullGroupKey(patternId, groupKey);
    let instance = this.findInstanceByGroup(fullGroupKey);

    if (!instance) {
      // Vytvořit novou instanci
      instance = this.createInstance(patternId, pattern, groupKey, now, windowMs);
      this.addInstance(instance, fullGroupKey);
    }

    // Přidat event
    instance.events.push(event);

    // Odstranit eventy mimo okno
    const windowStart = now - windowMs;
    this.pruneEvents(instance, windowStart);

    // Kontrola threshold
    const count = instance.events.length;
    if (this.compareCount(count, pattern.threshold, pattern.comparison)) {
      instance.state = 'triggered';
      const match: CountMatch = {
        instanceId: instance.id,
        patternId: instance.patternId,
        pattern: instance.pattern,
        count,
        events: [...instance.events],
        groupKey: instance.groupKey
      };

      // Pro sliding window neresetujeme instanci, jen zavoláme callback
      // Instance pokračuje v sledování dalších eventů
      if (this.onMatchCallback) {
        await this.onMatchCallback(match);
      }

      // Reset stavu pro další potenciální match
      instance.state = 'active';

      return match;
    }

    return undefined;
  }

  private async processTumblingWindow(
    event: Event,
    patternId: string,
    pattern: CountPattern,
    groupKey: string | undefined,
    windowMs: number,
    now: number
  ): Promise<CountMatch | undefined> {
    const fullGroupKey = this.makeFullGroupKey(patternId, groupKey);
    let instance = this.findInstanceByGroup(fullGroupKey);

    // Kontrola, zda aktuální okno expiroalo
    if (instance && now > instance.windowEnd) {
      // Zpracovat konec předchozího okna
      const match = await this.handleWindowEnd(instance.id);
      instance = undefined;
      // Pokračujeme s novým oknem
      if (match) {
        // Nevracíme match zde, protože to bylo pro předchozí okno
        // Nový event patří do nového okna
      }
    }

    if (!instance) {
      // Vytvořit novou instanci pro nové okno
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

    // Přidat event
    instance.events.push(event);

    // Pro tumbling window nekontrolujeme threshold hned
    // Match se kontroluje až na konci okna (handleWindowEnd)
    return undefined;
  }

  private createInstance(
    patternId: string,
    pattern: CountPattern,
    groupKey: string | undefined,
    now: number,
    windowMs: number
  ): CountInstance {
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

  private addInstance(instance: CountInstance, fullGroupKey: string): void {
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

  private findInstanceByGroup(fullGroupKey: string): CountInstance | undefined {
    const instanceId = this.byGroup.get(fullGroupKey);
    if (!instanceId) return undefined;
    return this.instances.get(instanceId);
  }

  private makeFullGroupKey(patternId: string, groupKey: string | undefined): string {
    return groupKey ? `${patternId}:${groupKey}` : patternId;
  }

  private calculateTumblingWindowStart(now: number, windowMs: number): number {
    // Zarovnat na hranici okna
    return Math.floor(now / windowMs) * windowMs;
  }

  private pruneEvents(instance: CountInstance, windowStart: number): void {
    // Odstranit eventy starší než window start
    while (instance.events.length > 0 && instance.events[0].timestamp < windowStart) {
      instance.events.shift();
    }
  }

  private compareCount(count: number, threshold: number, comparison: 'gte' | 'lte' | 'eq'): boolean {
    switch (comparison) {
      case 'gte': return count >= threshold;
      case 'lte': return count <= threshold;
      case 'eq': return count === threshold;
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
}

// ═══════════════════════════════════════════════════════════════════════════
//                    PURE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kontroluje, zda event matchuje matcher.
 */
export function eventMatchesCountMatcher(event: Event, matcher: EventMatcher): boolean {
  if (!matchesTopic(event.topic, matcher.topic)) {
    return false;
  }
  if (matcher.filter && !matchesFilter(event.data, matcher.filter)) {
    return false;
  }
  return true;
}

/**
 * Porovná počet s prahem.
 */
export function compareCountThreshold(
  count: number,
  threshold: number,
  comparison: 'gte' | 'lte' | 'eq'
): boolean {
  switch (comparison) {
    case 'gte': return count >= threshold;
    case 'lte': return count <= threshold;
    case 'eq': return count === threshold;
  }
}

/**
 * Vypočítá začátek tumbling window pro daný čas.
 */
export function calculateTumblingWindowStart(timestamp: number, windowMs: number): number {
  return Math.floor(timestamp / windowMs) * windowMs;
}

/**
 * Kontroluje, zda timestamp patří do daného okna.
 */
export function isInWindow(timestamp: number, windowStart: number, windowEnd: number): boolean {
  return timestamp >= windowStart && timestamp < windowEnd;
}

/**
 * Filtruje eventy v daném časovém okně.
 */
export function filterEventsInWindow(events: readonly Event[], windowStart: number, windowEnd: number): Event[] {
  return events.filter(e => e.timestamp >= windowStart && e.timestamp < windowEnd);
}
