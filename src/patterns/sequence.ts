import type { Event } from '../types/event.js';
import type { SequencePattern, EventMatcher } from '../types/temporal.js';
import { generateId } from '../utils/id-generator.js';
import { parseDuration } from '../utils/duration-parser.js';
import { matchesTopic, matchesFilter, getNestedValue } from '../utils/pattern-matcher.js';

/**
 * Stav instance sekvenčního vzoru.
 */
export type SequenceInstanceState = 'pending' | 'matching' | 'completed' | 'expired';

/**
 * Instance aktivního sekvenčního vzoru.
 * Každá instance sleduje průběh jedné konkrétní sekvence (např. pro jeden orderId).
 */
export interface SequenceInstance {
  readonly id: string;
  readonly pattern: SequencePattern;
  state: SequenceInstanceState;
  readonly matchedEvents: Event[];
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly groupKey?: string;
}

/**
 * Výsledek matchnuté sekvence.
 */
export interface SequenceMatch {
  readonly instanceId: string;
  readonly pattern: SequencePattern;
  readonly matchedEvents: readonly Event[];
  readonly groupKey?: string;
}

/**
 * Callback volaný při dokončení sekvence.
 */
export type SequenceMatchCallback = (match: SequenceMatch) => void | Promise<void>;

/**
 * Konfigurace pro SequenceMatcher.
 */
export interface SequenceMatcherConfig {
  /**
   * Callback volaný při úspěšném matchnutí sekvence.
   */
  onMatch?: SequenceMatchCallback;

  /**
   * Callback volaný při expiraci instance (timeout).
   */
  onExpire?: (instance: SequenceInstance) => void | Promise<void>;

  /**
   * Funkce pro získání aktuálního času.
   * Umožňuje testování s mock časem.
   */
  now?: () => number;
}

/**
 * Matcher pro sekvenční vzory.
 *
 * Sekvenční vzor definuje sérii událostí, které musí přijít v daném pořadí
 * v rámci časového okna. Podporuje:
 * - Groupování podle libovolného pole (groupBy)
 * - Striktní režim (žádné jiné eventy mezi)
 * - Filtrování eventů podle dat
 *
 * @example
 * ```typescript
 * const matcher = new SequenceMatcher({
 *   onMatch: (match) => console.log('Sequence matched:', match)
 * });
 *
 * const pattern: SequencePattern = {
 *   type: 'sequence',
 *   events: [
 *     { topic: 'order.created' },
 *     { topic: 'payment.received' }
 *   ],
 *   within: '5m',
 *   groupBy: 'orderId'
 * };
 *
 * matcher.addPattern('payment-flow', pattern);
 * await matcher.processEvent(event);
 * ```
 */
export class SequenceMatcher {
  private readonly instances: Map<string, SequenceInstance> = new Map();
  private readonly byPattern: Map<string, Set<string>> = new Map();
  private readonly byGroup: Map<string, Set<string>> = new Map();
  private readonly patterns: Map<string, SequencePattern> = new Map();

  private readonly onMatchCallback?: SequenceMatchCallback;
  private readonly onExpireCallback?: (instance: SequenceInstance) => void | Promise<void>;
  private readonly now: () => number;

  constructor(config: SequenceMatcherConfig = {}) {
    this.onMatchCallback = config.onMatch;
    this.onExpireCallback = config.onExpire;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Přidá pattern pro sledování.
   */
  addPattern(patternId: string, pattern: SequencePattern): void {
    if (pattern.type !== 'sequence') {
      throw new Error(`Expected sequence pattern, got: ${pattern.type}`);
    }
    if (pattern.events.length === 0) {
      throw new Error('Sequence pattern must have at least one event');
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
   * Vrací pole matchnutých sekvencí.
   */
  async processEvent(event: Event): Promise<SequenceMatch[]> {
    const matches: SequenceMatch[] = [];
    const now = this.now();

    for (const [patternId, pattern] of this.patterns) {
      const patternMatches = await this.processEventForPattern(event, patternId, pattern, now);
      matches.push(...patternMatches);
    }

    return matches;
  }

  /**
   * Zpracuje timeout instance.
   * Vrací true pokud instance existovala a byla expirována.
   */
  async handleTimeout(instanceId: string): Promise<boolean> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return false;
    }

    instance.state = 'expired';
    this.removeInstance(instanceId);

    if (this.onExpireCallback) {
      await this.onExpireCallback(instance);
    }

    return true;
  }

  /**
   * Vrátí všechny aktivní instance.
   */
  getActiveInstances(): readonly SequenceInstance[] {
    return [...this.instances.values()];
  }

  /**
   * Vrátí instance pro daný pattern.
   */
  getInstancesForPattern(patternId: string): readonly SequenceInstance[] {
    const instanceIds = this.byPattern.get(patternId);
    if (!instanceIds) return [];

    return [...instanceIds]
      .map(id => this.instances.get(id))
      .filter((inst): inst is SequenceInstance => inst !== undefined);
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

  private async processEventForPattern(
    event: Event,
    patternId: string,
    pattern: SequencePattern,
    now: number
  ): Promise<SequenceMatch[]> {
    const matches: SequenceMatch[] = [];
    const groupKey = pattern.groupBy ? this.extractGroupKey(event, pattern.groupBy) : undefined;

    // Zkontrolovat existující instance
    const existingInstances = this.findInstances(patternId, groupKey);

    for (const instance of existingInstances) {
      if (instance.state !== 'matching') continue;

      // Kontrola expirace
      if (now > instance.expiresAt) {
        instance.state = 'expired';
        this.removeInstance(instance.id);
        if (this.onExpireCallback) {
          await this.onExpireCallback(instance);
        }
        continue;
      }

      const match = await this.tryAdvanceInstance(event, instance, pattern);
      if (match) {
        matches.push(match);
      }
    }

    // Zkontrolovat, zda event může zahájit novou sekvenci
    const firstMatcher = pattern.events[0];
    if (firstMatcher && this.matchesEventMatcher(event, firstMatcher)) {
      const existingForGroup = groupKey
        ? this.findInstances(patternId, groupKey).filter(i => i.state === 'matching')
        : [];

      // Vytvořit novou instanci pouze pokud pro danou skupinu ještě žádná neexistuje
      if (existingForGroup.length === 0) {
        const match = await this.startNewInstance(event, patternId, pattern, groupKey, now);
        if (match) {
          matches.push(match);
        }
      }
    }

    return matches;
  }

  private async tryAdvanceInstance(
    event: Event,
    instance: SequenceInstance,
    pattern: SequencePattern
  ): Promise<SequenceMatch | undefined> {
    const nextIndex = instance.matchedEvents.length;
    const expectedMatcher = pattern.events[nextIndex];

    if (!expectedMatcher) return undefined;

    if (this.matchesEventMatcher(event, expectedMatcher)) {
      instance.matchedEvents.push(event);

      // Kontrola dokončení sekvence
      if (instance.matchedEvents.length === pattern.events.length) {
        instance.state = 'completed';
        const match: SequenceMatch = {
          instanceId: instance.id,
          pattern: instance.pattern,
          matchedEvents: [...instance.matchedEvents],
          groupKey: instance.groupKey
        };

        this.removeInstance(instance.id);

        if (this.onMatchCallback) {
          await this.onMatchCallback(match);
        }

        return match;
      }
    } else if (pattern.strict) {
      // V striktním režimu nevalidní event zruší celou sekvenci
      instance.state = 'expired';
      this.removeInstance(instance.id);

      if (this.onExpireCallback) {
        await this.onExpireCallback(instance);
      }
    }

    return undefined;
  }

  private async startNewInstance(
    event: Event,
    patternId: string,
    pattern: SequencePattern,
    groupKey: string | undefined,
    now: number
  ): Promise<SequenceMatch | undefined> {
    const windowMs = parseDuration(pattern.within);
    const instance: SequenceInstance = {
      id: generateId(),
      pattern,
      state: 'matching',
      matchedEvents: [event],
      startedAt: now,
      expiresAt: now + windowMs,
      groupKey
    };

    this.addInstance(patternId, instance);

    // Pokud je sekvence jednoprvková, ihned match
    if (pattern.events.length === 1) {
      instance.state = 'completed';
      const match: SequenceMatch = {
        instanceId: instance.id,
        pattern: instance.pattern,
        matchedEvents: [...instance.matchedEvents],
        groupKey: instance.groupKey
      };

      this.removeInstance(instance.id);

      if (this.onMatchCallback) {
        await this.onMatchCallback(match);
      }

      return match;
    }

    return undefined;
  }

  private addInstance(patternId: string, instance: SequenceInstance): void {
    this.instances.set(instance.id, instance);

    let patternInstances = this.byPattern.get(patternId);
    if (!patternInstances) {
      patternInstances = new Set();
      this.byPattern.set(patternId, patternInstances);
    }
    patternInstances.add(instance.id);

    if (instance.groupKey) {
      const fullKey = `${patternId}:${instance.groupKey}`;
      let groupInstances = this.byGroup.get(fullKey);
      if (!groupInstances) {
        groupInstances = new Set();
        this.byGroup.set(fullKey, groupInstances);
      }
      groupInstances.add(instance.id);
    }
  }

  private removeInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    this.instances.delete(instanceId);

    // Najít patternId pro tuto instanci
    for (const [patternId, instanceIds] of this.byPattern) {
      if (instanceIds.has(instanceId)) {
        instanceIds.delete(instanceId);
        break;
      }
    }

    if (instance.groupKey) {
      for (const [, groupInstances] of this.byGroup) {
        if (groupInstances.has(instanceId)) {
          groupInstances.delete(instanceId);
          break;
        }
      }
    }
  }

  private findInstances(patternId: string, groupKey?: string): SequenceInstance[] {
    if (groupKey) {
      const fullKey = `${patternId}:${groupKey}`;
      const instanceIds = this.byGroup.get(fullKey);
      if (!instanceIds) return [];

      return [...instanceIds]
        .map(id => this.instances.get(id))
        .filter((inst): inst is SequenceInstance => inst !== undefined);
    }

    const instanceIds = this.byPattern.get(patternId);
    if (!instanceIds) return [];

    return [...instanceIds]
      .map(id => this.instances.get(id))
      .filter((inst): inst is SequenceInstance => inst !== undefined);
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
export function eventMatchesMatcher(event: Event, matcher: EventMatcher): boolean {
  if (!matchesTopic(event.topic, matcher.topic)) {
    return false;
  }
  if (matcher.filter && !matchesFilter(event.data, matcher.filter)) {
    return false;
  }
  return true;
}

/**
 * Kontroluje, zda je sekvence kompletní.
 */
export function isSequenceComplete(
  matchedCount: number,
  pattern: SequencePattern
): boolean {
  return matchedCount >= pattern.events.length;
}

/**
 * Vrací index dalšího očekávaného matcheru v sekvenci.
 */
export function getNextMatcherIndex(matchedCount: number): number {
  return matchedCount;
}

/**
 * Kontroluje, zda instance expirovala.
 */
export function isInstanceExpired(expiresAt: number, now: number): boolean {
  return now > expiresAt;
}

/**
 * Vypočítá čas expirace pro novou instanci.
 */
export function calculateExpiresAt(startedAt: number, within: string | number): number {
  return startedAt + parseDuration(within);
}
