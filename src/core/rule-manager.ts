import type { Rule, RuleInput } from '../types/rule.js';
import { matchesTopic, matchesFactPattern, matchesTimerPattern } from '../utils/pattern-matcher.js';

/**
 * Správa pravidel s indexací podle triggerů.
 *
 * TODO: Implementovat jako GenServer pro thread-safety.
 */
export class RuleManager {
  private rules: Map<string, Rule> = new Map();

  // Dvouúrovňová indexace pro optimální vyhledávání
  // Exact indexy - O(1) lookup
  private exactFactPatterns: Map<string, Set<string>> = new Map();
  private exactEventTopics: Map<string, Set<string>> = new Map();
  private exactTimerNames: Map<string, Set<string>> = new Map();

  // Wildcard indexy - O(k) scan kde k << n
  private wildcardFactPatterns: Map<string, Set<string>> = new Map();
  private wildcardEventTopics: Map<string, Set<string>> = new Map();
  private wildcardTimerNames: Map<string, Set<string>> = new Map();

  private byTags: Map<string, Set<string>> = new Map();
  private temporalRules: Set<string> = new Set();
  private nextVersion = 1;

  static async start(): Promise<RuleManager> {
    return new RuleManager();
  }

  /**
   * Registruje nové pravidlo.
   */
  register(input: RuleInput): Rule {
    const rule: Rule = {
      ...input,
      version: this.nextVersion++,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.rules.set(rule.id, rule);
    this.indexRule(rule);

    return rule;
  }

  /**
   * Odregistruje pravidlo.
   */
  unregister(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    this.unindexRule(rule);
    this.rules.delete(ruleId);
    this.temporalRules.delete(ruleId);

    return true;
  }

  /**
   * Povolí pravidlo.
   */
  enable(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = true;
    rule.updatedAt = Date.now();
    return true;
  }

  /**
   * Zakáže pravidlo.
   */
  disable(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = false;
    rule.updatedAt = Date.now();
    return true;
  }

  /**
   * Získá pravidlo podle ID.
   */
  get(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Vrátí pravidla podle fact patternu.
   * Optimalizováno: O(1) lookup pro exact match + O(k) scan pro wildcardy.
   */
  getByFactPattern(key: string): Rule[] {
    const results: Rule[] = [];

    // O(1) exact match lookup
    const exactRuleIds = this.exactFactPatterns.get(key);
    if (exactRuleIds) {
      for (const id of exactRuleIds) {
        const rule = this.rules.get(id);
        if (rule?.enabled) results.push(rule);
      }
    }

    // O(k) wildcard scan kde k << n
    for (const [pattern, ruleIds] of this.wildcardFactPatterns) {
      if (matchesFactPattern(key, pattern)) {
        for (const id of ruleIds) {
          const rule = this.rules.get(id);
          if (rule?.enabled) results.push(rule);
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vrátí pravidla podle event topicu.
   * Optimalizováno: O(1) lookup pro exact match + O(k) scan pro wildcardy.
   */
  getByEventTopic(topic: string): Rule[] {
    const results: Rule[] = [];

    // O(1) exact match lookup
    const exactRuleIds = this.exactEventTopics.get(topic);
    if (exactRuleIds) {
      for (const id of exactRuleIds) {
        const rule = this.rules.get(id);
        if (rule?.enabled) results.push(rule);
      }
    }

    // O(k) wildcard scan kde k << n
    for (const [pattern, ruleIds] of this.wildcardEventTopics) {
      if (matchesTopic(topic, pattern)) {
        for (const id of ruleIds) {
          const rule = this.rules.get(id);
          if (rule?.enabled) results.push(rule);
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vrátí pravidla podle timer jména.
   * Podporuje wildcardy: "payment-timeout:*" matchuje "payment-timeout:order123"
   * Optimalizováno: O(1) lookup pro exact match + O(k) scan pro wildcardy.
   */
  getByTimerName(name: string): Rule[] {
    const results: Rule[] = [];

    // O(1) exact match lookup
    const exactRuleIds = this.exactTimerNames.get(name);
    if (exactRuleIds) {
      for (const id of exactRuleIds) {
        const rule = this.rules.get(id);
        if (rule?.enabled) results.push(rule);
      }
    }

    // O(k) wildcard scan kde k << n
    for (const [pattern, ruleIds] of this.wildcardTimerNames) {
      if (matchesTimerPattern(name, pattern)) {
        for (const id of ruleIds) {
          const rule = this.rules.get(id);
          if (rule?.enabled) results.push(rule);
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vrátí všechna temporální pravidla.
   */
  getTemporalRules(): Rule[] {
    return [...this.temporalRules]
      .map(id => this.rules.get(id))
      .filter((r): r is Rule => r !== undefined && r.enabled);
  }

  /**
   * Vrátí všechna pravidla.
   */
  getAll(): Rule[] {
    return [...this.rules.values()];
  }

  /**
   * Počet pravidel.
   */
  get size(): number {
    return this.rules.size;
  }

  private indexRule(rule: Rule): void {
    switch (rule.trigger.type) {
      case 'fact': {
        const pattern = rule.trigger.pattern;
        const index = pattern.includes('*') ? this.wildcardFactPatterns : this.exactFactPatterns;
        this.addToIndex(index, pattern, rule.id);
        break;
      }
      case 'event': {
        const topic = rule.trigger.topic;
        const index = topic.includes('*') ? this.wildcardEventTopics : this.exactEventTopics;
        this.addToIndex(index, topic, rule.id);
        break;
      }
      case 'timer': {
        const name = rule.trigger.name;
        const index = name.includes('*') ? this.wildcardTimerNames : this.exactTimerNames;
        this.addToIndex(index, name, rule.id);
        break;
      }
      case 'temporal':
        this.temporalRules.add(rule.id);
        break;
    }

    for (const tag of rule.tags) {
      this.addToIndex(this.byTags, tag, rule.id);
    }
  }

  private unindexRule(rule: Rule): void {
    switch (rule.trigger.type) {
      case 'fact': {
        const pattern = rule.trigger.pattern;
        const index = pattern.includes('*') ? this.wildcardFactPatterns : this.exactFactPatterns;
        this.removeFromIndex(index, pattern, rule.id);
        break;
      }
      case 'event': {
        const topic = rule.trigger.topic;
        const index = topic.includes('*') ? this.wildcardEventTopics : this.exactEventTopics;
        this.removeFromIndex(index, topic, rule.id);
        break;
      }
      case 'timer': {
        const name = rule.trigger.name;
        const index = name.includes('*') ? this.wildcardTimerNames : this.exactTimerNames;
        this.removeFromIndex(index, name, rule.id);
        break;
      }
      case 'temporal':
        this.temporalRules.delete(rule.id);
        break;
    }

    for (const tag of rule.tags) {
      this.removeFromIndex(this.byTags, tag, rule.id);
    }
  }

  private addToIndex(index: Map<string, Set<string>>, key: string, ruleId: string): void {
    const set = index.get(key) ?? new Set();
    set.add(ruleId);
    index.set(key, set);
  }

  private removeFromIndex(index: Map<string, Set<string>>, key: string, ruleId: string): void {
    const set = index.get(key);
    if (set) {
      set.delete(ruleId);
      if (set.size === 0) {
        index.delete(key);
      }
    }
  }
}
