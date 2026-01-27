import type { Event } from '../types/event.js';
import type { AbsencePattern, EventMatcher } from '../types/temporal.js';
import { generateId } from '../utils/id-generator.js';
import { parseDuration } from '../utils/duration-parser.js';
import { matchesTopic, matchesFilter, getNestedValue } from '../utils/pattern-matcher.js';

/**
 * Stav instance absence vzoru.
 */
export type AbsenceInstanceState = 'pending' | 'waiting' | 'completed' | 'cancelled';

/**
 * Instance aktivního absence vzoru.
 * Každá instance sleduje, zda očekávaný event NEPŘIŠEL v daném časovém okně.
 */
export interface AbsenceInstance {
  readonly id: string;
  readonly pattern: AbsencePattern;
  state: AbsenceInstanceState;
  readonly triggerEvent: Event;
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly groupKey: string | undefined;
}

/**
 * Výsledek matchnuté absence (timeout bez očekávaného eventu).
 */
export interface AbsenceMatch {
  readonly instanceId: string;
  readonly pattern: AbsencePattern;
  readonly triggerEvent: Event;
  readonly groupKey: string | undefined;
}

/**
 * Callback volaný při úspěšném matchnutí absence (expected event nepřišel).
 */
export type AbsenceMatchCallback = (match: AbsenceMatch) => void | Promise<void>;

/**
 * Callback volaný při zrušení instance (expected event přišel).
 */
export type AbsenceCancelCallback = (instance: AbsenceInstance, cancellingEvent: Event) => void | Promise<void>;

/**
 * Konfigurace pro AbsenceMatcher.
 */
export interface AbsenceMatcherConfig {
  /**
   * Callback volaný při úspěšném matchnutí (timeout - expected event nepřišel).
   */
  onMatch?: AbsenceMatchCallback;

  /**
   * Callback volaný při zrušení instance (expected event přišel).
   */
  onCancel?: AbsenceCancelCallback;

  /**
   * Funkce pro získání aktuálního času.
   * Umožňuje testování s mock časem.
   */
  now?: () => number;
}

/**
 * Matcher pro absence vzory (negative patterns).
 *
 * Absence vzor detekuje situaci, kdy po spouštěcím eventu ("after")
 * NEPŘIJDE očekávaný event ("expected") v daném časovém okně.
 * Typický use-case: timeout platby, nedokončená registrace, etc.
 *
 * Workflow:
 * 1. Přijde "after" event → vytvoří se instance ve stavu "waiting"
 * 2a. Přijde "expected" event → instance se zruší (neúspěšná)
 * 2b. Uplyne časové okno → instance matchne (úspěšná absence)
 *
 * @example
 * ```typescript
 * const matcher = new AbsenceMatcher({
 *   onMatch: (match) => console.log('Payment timeout!', match)
 * });
 *
 * const pattern: AbsencePattern = {
 *   type: 'absence',
 *   after: { topic: 'order.created' },
 *   expected: { topic: 'payment.received' },
 *   within: '15m',
 *   groupBy: 'orderId'
 * };
 *
 * matcher.addPattern('payment-timeout', pattern);
 * await matcher.processEvent(orderCreatedEvent);
 * // Po 15 minutách bez payment.received zavolá onMatch
 * ```
 */
export class AbsenceMatcher {
  private readonly instances: Map<string, AbsenceInstance> = new Map();
  private readonly byPattern: Map<string, Set<string>> = new Map();
  private readonly byGroup: Map<string, Set<string>> = new Map();
  private readonly patterns: Map<string, AbsencePattern> = new Map();

  private readonly onMatchCallback: AbsenceMatchCallback | undefined;
  private readonly onCancelCallback: AbsenceCancelCallback | undefined;
  private readonly now: () => number;

  constructor(config: AbsenceMatcherConfig = {}) {
    this.onMatchCallback = config.onMatch;
    this.onCancelCallback = config.onCancel;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Přidá pattern pro sledování.
   */
  addPattern(patternId: string, pattern: AbsencePattern): void {
    if (pattern.type !== 'absence') {
      throw new Error(`Expected absence pattern, got: ${pattern.type}`);
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
   *
   * - Pokud event matchne "after" matcher, vytvoří novou instanci
   * - Pokud event matchne "expected" matcher aktivní instance, zruší ji
   *
   * Vrací pole zrušených instancí (pro diagnostiku).
   */
  async processEvent(event: Event): Promise<AbsenceInstance[]> {
    const cancelledInstances: AbsenceInstance[] = [];
    const now = this.now();

    for (const [patternId, pattern] of this.patterns) {
      const groupKey = pattern.groupBy ? this.extractGroupKey(event, pattern.groupBy) : undefined;

      // Kontrola existujících instancí - zda expected event přišel
      const existingInstances = this.findInstances(patternId, groupKey);
      for (const instance of existingInstances) {
        if (instance.state !== 'waiting') continue;

        // Kontrola expirace (pro případ že timeout ještě nebyl zavolán)
        if (now > instance.expiresAt) {
          instance.state = 'completed';
          this.removeInstance(instance.id);

          if (this.onMatchCallback) {
            await this.onMatchCallback({
              instanceId: instance.id,
              pattern: instance.pattern,
              triggerEvent: instance.triggerEvent,
              groupKey: instance.groupKey
            });
          }
          continue;
        }

        // Pokud přišel expected event, zrušit instanci
        if (this.matchesEventMatcher(event, pattern.expected)) {
          instance.state = 'cancelled';
          cancelledInstances.push(instance);
          this.removeInstance(instance.id);

          if (this.onCancelCallback) {
            await this.onCancelCallback(instance, event);
          }
        }
      }

      // Kontrola, zda event může zahájit novou instanci
      if (this.matchesEventMatcher(event, pattern.after)) {
        const activeForGroup = this.findInstances(patternId, groupKey)
          .filter(i => i.state === 'waiting');

        // Vytvořit novou instanci pouze pokud pro danou skupinu ještě žádná neexistuje
        if (activeForGroup.length === 0) {
          this.startNewInstance(event, patternId, pattern, groupKey, now);
        }
      }
    }

    return cancelledInstances;
  }

  /**
   * Zpracuje timeout instance.
   * Volá se když uplyne časové okno a expected event nepřišel.
   *
   * Vrací AbsenceMatch pokud instance existovala a byla úspěšně dokončena.
   */
  async handleTimeout(instanceId: string): Promise<AbsenceMatch | undefined> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return undefined;
    }

    if (instance.state !== 'waiting') {
      this.removeInstance(instanceId);
      return undefined;
    }

    instance.state = 'completed';
    const match: AbsenceMatch = {
      instanceId: instance.id,
      pattern: instance.pattern,
      triggerEvent: instance.triggerEvent,
      groupKey: instance.groupKey
    };

    this.removeInstance(instanceId);

    if (this.onMatchCallback) {
      await this.onMatchCallback(match);
    }

    return match;
  }

  /**
   * Vrátí všechny aktivní instance.
   */
  getActiveInstances(): readonly AbsenceInstance[] {
    return [...this.instances.values()];
  }

  /**
   * Vrátí instance pro daný pattern.
   */
  getInstancesForPattern(patternId: string): readonly AbsenceInstance[] {
    const instanceIds = this.byPattern.get(patternId);
    if (!instanceIds) return [];

    return [...instanceIds]
      .map(id => this.instances.get(id))
      .filter((inst): inst is AbsenceInstance => inst !== undefined);
  }

  /**
   * Vrátí instanci podle ID.
   */
  getInstance(instanceId: string): AbsenceInstance | undefined {
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

  private startNewInstance(
    event: Event,
    patternId: string,
    pattern: AbsencePattern,
    groupKey: string | undefined,
    now: number
  ): AbsenceInstance {
    const windowMs = parseDuration(pattern.within);
    const instance: AbsenceInstance = {
      id: generateId(),
      pattern,
      state: 'waiting',
      triggerEvent: event,
      startedAt: now,
      expiresAt: now + windowMs,
      groupKey
    };

    this.addInstance(patternId, instance);
    return instance;
  }

  private addInstance(patternId: string, instance: AbsenceInstance): void {
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

  private findInstances(patternId: string, groupKey?: string): AbsenceInstance[] {
    if (groupKey) {
      const fullKey = `${patternId}:${groupKey}`;
      const instanceIds = this.byGroup.get(fullKey);
      if (!instanceIds) return [];

      return [...instanceIds]
        .map(id => this.instances.get(id))
        .filter((inst): inst is AbsenceInstance => inst !== undefined);
    }

    const instanceIds = this.byPattern.get(patternId);
    if (!instanceIds) return [];

    return [...instanceIds]
      .map(id => this.instances.get(id))
      .filter((inst): inst is AbsenceInstance => inst !== undefined);
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
export function eventMatchesAbsenceMatcher(event: Event, matcher: EventMatcher): boolean {
  if (!matchesTopic(event.topic, matcher.topic)) {
    return false;
  }
  if (matcher.filter && !matchesFilter(event.data, matcher.filter)) {
    return false;
  }
  return true;
}

/**
 * Kontroluje, zda instance expirovala.
 */
export function isAbsenceInstanceExpired(expiresAt: number, now: number): boolean {
  return now > expiresAt;
}

/**
 * Vypočítá čas expirace pro novou instanci.
 */
export function calculateAbsenceExpiresAt(startedAt: number, within: string | number): number {
  return startedAt + parseDuration(within);
}

/**
 * Kontroluje, zda je instance ve stavu čekání.
 */
export function isAbsenceInstanceWaiting(instance: AbsenceInstance): boolean {
  return instance.state === 'waiting';
}
