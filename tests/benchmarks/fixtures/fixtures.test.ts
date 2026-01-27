import { describe, it, expect } from 'vitest';
import {
  generateRule,
  generateRules,
  generateRulesWithMixedTriggers,
  generateRulesWithVaryingComplexity,
  generateRulesForTopic,
  generateRulesForFactPattern,
  OPERATORS,
  TOPICS,
  FACT_PATTERNS
} from './rule-generators.js';
import {
  generateEvent,
  generateEvents,
  generateEventSequence,
  generateEventsForTopic,
  generateCorrelatedEventGroups,
  generateTimeRangeEvents,
  generateHighFrequencyEvents,
  DEFAULT_TOPICS,
  SOURCES
} from './event-generators.js';
import {
  generateFact,
  generateFacts,
  generateFactsForDomain,
  generateHierarchicalFacts,
  generatePatternMatchingFacts,
  generateFactsWithVersionHistory,
  generateScalabilityFacts,
  DOMAINS,
  PROPERTIES
} from './fact-generators.js';

describe('Benchmark Fixtures', () => {
  describe('rule-generators', () => {
    it('generates a single rule with default options', () => {
      const rule = generateRule(0);

      expect(rule.id).toBe('rule_0');
      expect(rule.name).toBe('Generated Rule 0');
      expect(rule.trigger).toBeDefined();
      expect(rule.conditions).toHaveLength(3);
      expect(rule.actions).toHaveLength(2);
      expect(rule.enabled).toBe(true);
    });

    it('generates a rule with custom options', () => {
      const rule = generateRule(5, {
        conditionCount: 10,
        actionCount: 5,
        triggerType: 'fact',
        priority: 100,
        tags: ['custom', 'test']
      });

      expect(rule.conditions).toHaveLength(10);
      expect(rule.actions).toHaveLength(5);
      expect(rule.trigger.type).toBe('fact');
      expect(rule.priority).toBe(100);
      expect(rule.tags).toEqual(['custom', 'test']);
    });

    it('generates multiple rules', () => {
      const rules = generateRules(100);

      expect(rules).toHaveLength(100);
      expect(new Set(rules.map(r => r.id)).size).toBe(100);
    });

    it('generates rules with mixed triggers', () => {
      const rules = generateRulesWithMixedTriggers(20);
      const triggerTypes = new Set(rules.map(r => r.trigger.type));

      expect(triggerTypes.size).toBe(4);
      expect(triggerTypes).toContain('event');
      expect(triggerTypes).toContain('fact');
      expect(triggerTypes).toContain('timer');
      expect(triggerTypes).toContain('temporal');
    });

    it('generates rules with varying complexity', () => {
      const rules = generateRulesWithVaryingComplexity(10, 1, 20);

      expect(rules[0].conditions.length).toBeLessThanOrEqual(rules[9].conditions.length);
    });

    it('generates rules for specific topic', () => {
      const rules = generateRulesForTopic('order.created', 5);

      for (const rule of rules) {
        expect(rule.trigger).toEqual({ type: 'event', topic: 'order.created' });
      }
    });

    it('generates rules for specific fact pattern', () => {
      const rules = generateRulesForFactPattern('customer:*:status', 5);

      for (const rule of rules) {
        expect(rule.trigger).toEqual({ type: 'fact', pattern: 'customer:*:status' });
      }
    });

    it('exports operator and topic constants', () => {
      expect(OPERATORS).toContain('eq');
      expect(OPERATORS).toContain('matches');
      expect(TOPICS).toContain('order.created');
      expect(FACT_PATTERNS).toContain('customer:*:profile');
    });
  });

  describe('event-generators', () => {
    it('generates a single event with default options', () => {
      const event = generateEvent(0);

      expect(event.id).toBeDefined();
      expect(event.topic).toBeDefined();
      expect(event.data).toBeDefined();
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.source).toBeDefined();
    });

    it('generates a single event with custom options', () => {
      const event = generateEvent(0, {
        topic: 'custom.topic',
        source: 'test-source',
        correlationId: 'corr-123'
      });

      expect(event.topic).toBe('custom.topic');
      expect(event.source).toBe('test-source');
      expect(event.correlationId).toBe('corr-123');
    });

    it('generates multiple events', () => {
      const events = generateEvents(100);

      expect(events).toHaveLength(100);
      expect(new Set(events.map(e => e.id)).size).toBe(100);
    });

    it('generates event sequence in order', () => {
      const topics = ['step.one', 'step.two', 'step.three'];
      const events = generateEventSequence(topics);

      expect(events).toHaveLength(3);
      expect(events[0].topic).toBe('step.one');
      expect(events[1].topic).toBe('step.two');
      expect(events[2].topic).toBe('step.three');
      expect(events[0].timestamp).toBeLessThan(events[1].timestamp);
      expect(events[1].timestamp).toBeLessThan(events[2].timestamp);
    });

    it('generates events for specific topic', () => {
      const events = generateEventsForTopic('payment.completed', 10);

      for (const event of events) {
        expect(event.topic).toBe('payment.completed');
      }
    });

    it('generates correlated event groups', () => {
      const groups = generateCorrelatedEventGroups(5, 3, ['a', 'b', 'c']);

      expect(groups).toHaveLength(5);
      for (const group of groups) {
        expect(group).toHaveLength(3);
        const correlationId = group[0].correlationId;
        expect(correlationId).toBeDefined();
        for (const event of group) {
          expect(event.correlationId).toBe(correlationId);
        }
      }
    });

    it('generates time range events', () => {
      const start = Date.now() - 60000;
      const end = Date.now();
      const events = generateTimeRangeEvents(10, start, end);

      for (const event of events) {
        expect(event.timestamp).toBeGreaterThanOrEqual(start);
        expect(event.timestamp).toBeLessThanOrEqual(end);
      }
    });

    it('generates high frequency events', () => {
      const events = generateHighFrequencyEvents(100, 'fast.event', 10);

      expect(events).toHaveLength(100);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp - events[i - 1].timestamp).toBe(10);
      }
    });

    it('exports topic and source constants', () => {
      expect(DEFAULT_TOPICS).toContain('order.created');
      expect(SOURCES).toContain('api-gateway');
    });
  });

  describe('fact-generators', () => {
    it('generates a single fact', () => {
      const fact = generateFact('customer', 123, 'name');

      expect(fact.key).toBe('customer:123:name');
      expect(fact.value).toBeDefined();
      expect(fact.timestamp).toBeTypeOf('number');
      expect(fact.source).toBeDefined();
      expect(fact.version).toBe(1);
    });

    it('generates multiple facts', () => {
      const facts = generateFacts(100);

      expect(facts).toHaveLength(100);
      expect(new Set(facts.map(f => f.key)).size).toBe(100);
    });

    it('generates facts for specific domain', () => {
      const facts = generateFactsForDomain('customer', 10);

      for (const fact of facts) {
        expect(fact.key).toMatch(/^customer:/);
      }
    });

    it('generates hierarchical facts', () => {
      const facts = generateHierarchicalFacts(2, 3, ['value']);

      expect(facts.length).toBeGreaterThan(0);
      for (const fact of facts) {
        expect(fact.key).toMatch(/^root:/);
      }
    });

    it('generates pattern matching facts', () => {
      const patterns = ['customer:*:name', 'order:*:status'];
      const factMap = generatePatternMatchingFacts(patterns, 5);

      expect(factMap.size).toBe(2);
      expect(factMap.get('customer:*:name')).toHaveLength(5);
      expect(factMap.get('order:*:status')).toHaveLength(5);
    });

    it('generates facts with version history', () => {
      const facts = generateFactsWithVersionHistory('versioned:key', 5);

      expect(facts).toHaveLength(5);
      for (let i = 0; i < facts.length; i++) {
        expect(facts[i].version).toBe(i + 1);
      }
    });

    it('generates scalability facts for multiple scales', () => {
      const scales = [10, 100, 1000];
      const factMap = generateScalabilityFacts(scales);

      expect(factMap.size).toBe(3);
      expect(factMap.get(10)!.length).toBe(10);
      expect(factMap.get(100)!.length).toBe(100);
      expect(factMap.get(1000)!.length).toBe(1000);
    });

    it('exports domain and property constants', () => {
      expect(DOMAINS).toContain('customer');
      expect(DOMAINS).toContain('order');
      expect(PROPERTIES.customer).toContain('name');
    });
  });
});
