// @vitest-environment happy-dom

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, useFieldArray } from 'react-hook-form';
import { ConditionBuilder } from '../components/conditions/ConditionBuilder';
import type { RuleFormData } from '../components/rules/RuleForm';

// ---------------------------------------------------------------------------
// Test wrapper — provides react-hook-form context
// ---------------------------------------------------------------------------

function TestWrapper({
  initialConditions = [],
}: {
  initialConditions?: RuleFormData['conditions'];
}) {
  const { register, watch, control } = useForm<RuleFormData>({
    defaultValues: {
      id: 'test',
      name: 'Test Rule',
      priority: 100,
      enabled: true,
      trigger: { type: 'fact' },
      conditions: initialConditions,
      actions: [{ type: 'log' }],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'conditions',
  });
  return (
    <ConditionBuilder
      fields={fields}
      append={append}
      remove={remove}
      register={register}
      watch={watch}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConditionBuilder', () => {
  describe('empty state', () => {
    it('shows empty state message when no conditions', () => {
      render(<TestWrapper />);
      expect(
        screen.getByText('No conditions — rule fires on every trigger match'),
      ).toBeDefined();
    });

    it('renders title', () => {
      render(<TestWrapper />);
      expect(screen.getByText('Conditions')).toBeDefined();
    });

    it('renders add button', () => {
      render(<TestWrapper />);
      expect(screen.getByText('Add condition')).toBeDefined();
    });

    it('does not render count badge', () => {
      const { container } = render(<TestWrapper />);
      const badges = container.querySelectorAll('.rounded-full');
      expect(badges).toHaveLength(0);
    });
  });

  describe('with conditions', () => {
    const twoConditions: RuleFormData['conditions'] = [
      { source: { type: 'fact', pattern: 'user:*' }, operator: 'eq', valueRaw: '"gold"' },
      { source: { type: 'event', field: 'amount' }, operator: 'gt', valueRaw: '100' },
    ];

    it('renders a row per condition', () => {
      const { container } = render(
        <TestWrapper initialConditions={twoConditions} />,
      );
      const removeButtons = container.querySelectorAll(
        'button[title="Remove condition"]',
      );
      expect(removeButtons).toHaveLength(2);
    });

    it('shows count badge with correct number', () => {
      render(<TestWrapper initialConditions={twoConditions} />);
      expect(screen.getByText('2')).toBeDefined();
    });

    it('does not show empty state message', () => {
      render(<TestWrapper initialConditions={twoConditions} />);
      expect(
        screen.queryByText('No conditions — rule fires on every trigger match'),
      ).toBeNull();
    });
  });

  describe('adding conditions', () => {
    it('adds a new row when add button is clicked', () => {
      const { container } = render(<TestWrapper />);
      fireEvent.click(screen.getByText('Add condition'));
      expect(
        screen.queryByText('No conditions — rule fires on every trigger match'),
      ).toBeNull();
      const removeButtons = container.querySelectorAll(
        'button[title="Remove condition"]',
      );
      expect(removeButtons).toHaveLength(1);
    });

    it('adds multiple rows on repeated clicks', () => {
      const { container } = render(<TestWrapper />);
      const addButton = screen.getByText('Add condition');
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      const removeButtons = container.querySelectorAll(
        'button[title="Remove condition"]',
      );
      expect(removeButtons).toHaveLength(2);
    });
  });

  describe('removing conditions', () => {
    it('removes a row when remove button is clicked', () => {
      const oneCondition: RuleFormData['conditions'] = [
        { source: { type: 'fact', pattern: 'x' }, operator: 'eq', valueRaw: '1' },
      ];
      render(<TestWrapper initialConditions={oneCondition} />);
      const removeButton = screen.getByTitle('Remove condition');
      fireEvent.click(removeButton);
      expect(
        screen.getByText('No conditions — rule fires on every trigger match'),
      ).toBeDefined();
    });

    it('removes only the targeted row', () => {
      const threeConditions: RuleFormData['conditions'] = [
        { source: { type: 'fact', pattern: 'a' }, operator: 'eq', valueRaw: '1' },
        { source: { type: 'fact', pattern: 'b' }, operator: 'eq', valueRaw: '2' },
        { source: { type: 'fact', pattern: 'c' }, operator: 'eq', valueRaw: '3' },
      ];
      const { container } = render(
        <TestWrapper initialConditions={threeConditions} />,
      );
      const removeButtons = container.querySelectorAll(
        'button[title="Remove condition"]',
      );
      expect(removeButtons).toHaveLength(3);
      fireEvent.click(removeButtons[1]);
      const remaining = container.querySelectorAll(
        'button[title="Remove condition"]',
      );
      expect(remaining).toHaveLength(2);
    });
  });
});
