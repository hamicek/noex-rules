import { describe, it, expect } from 'vitest';
import { eventGoal, EventGoalBuilder } from '../../../../src/dsl/query/event-goal-builder';

describe('eventGoal', () => {
  describe('factory function', () => {
    it('returns an EventGoalBuilder instance', () => {
      const builder = eventGoal('order.completed');
      expect(builder).toBeInstanceOf(EventGoalBuilder);
    });

    it('throws on empty string', () => {
      expect(() => eventGoal('')).toThrow('eventGoal() topic must be a non-empty string');
    });

    it('throws on non-string argument', () => {
      expect(() => eventGoal(42 as unknown as string)).toThrow(
        'eventGoal() topic must be a non-empty string',
      );
    });

    it('throws on undefined argument', () => {
      expect(() => eventGoal(undefined as unknown as string)).toThrow(
        'eventGoal() topic must be a non-empty string',
      );
    });

    it('throws on null argument', () => {
      expect(() => eventGoal(null as unknown as string)).toThrow(
        'eventGoal() topic must be a non-empty string',
      );
    });
  });

  describe('build()', () => {
    it('builds an event goal', () => {
      const goal = eventGoal('order.completed').build();

      expect(goal).toEqual({
        type: 'event',
        topic: 'order.completed',
      });
    });

    it('preserves dotted topic names', () => {
      const goal = eventGoal('namespace.subsystem.event').build();

      expect(goal).toEqual({
        type: 'event',
        topic: 'namespace.subsystem.event',
      });
    });

    it('preserves simple topic names', () => {
      const goal = eventGoal('alert').build();

      expect(goal).toEqual({
        type: 'event',
        topic: 'alert',
      });
    });
  });

  describe('GoalBuilder interface', () => {
    it('has a build() method returning a Goal', () => {
      const builder = eventGoal('test');
      expect(typeof builder.build).toBe('function');

      const goal = builder.build();
      expect(goal.type).toBe('event');
    });

    it('can be detected via "build" in builder', () => {
      const builder = eventGoal('test');
      expect('build' in builder).toBe(true);
    });
  });

  describe('immutability', () => {
    it('produces independent goals on repeated build() calls', () => {
      const builder = eventGoal('topic.a');
      const goal1 = builder.build();
      const goal2 = builder.build();

      expect(goal1).toEqual(goal2);
      expect(goal1).not.toBe(goal2);
    });
  });
});
