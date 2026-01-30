// @vitest-environment happy-dom

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, useFieldArray } from 'react-hook-form';
import { ActionBuilder } from '../components/actions/ActionBuilder';
import type { RuleFormData } from '../components/rules/RuleForm';

// ---------------------------------------------------------------------------
// Test wrapper — provides react-hook-form context
// ---------------------------------------------------------------------------

function TestWrapper({
  initialActions = [],
  error,
}: {
  initialActions?: RuleFormData['actions'];
  error?: string;
}) {
  const { register, watch, control } = useForm<RuleFormData>({
    defaultValues: {
      id: 'test',
      name: 'Test Rule',
      priority: 100,
      enabled: true,
      trigger: { type: 'fact' },
      conditions: [],
      actions: initialActions,
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'actions',
  });
  return (
    <ActionBuilder
      fields={fields}
      append={append}
      remove={remove}
      register={register}
      watch={watch}
      error={error}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionBuilder', () => {
  describe('empty state', () => {
    it('shows empty state message when no actions', () => {
      render(<TestWrapper />);
      expect(
        screen.getByText('At least one action is required'),
      ).toBeDefined();
    });

    it('renders title', () => {
      render(<TestWrapper />);
      expect(screen.getByText('Actions')).toBeDefined();
    });

    it('renders add button', () => {
      render(<TestWrapper />);
      expect(screen.getByText('Add action')).toBeDefined();
    });

    it('does not render count badge', () => {
      const { container } = render(<TestWrapper />);
      const badges = container.querySelectorAll('.rounded-full');
      expect(badges).toHaveLength(0);
    });
  });

  describe('with actions', () => {
    const twoActions: RuleFormData['actions'] = [
      { type: 'set_fact', key: 'status', valueRaw: '"active"' },
      { type: 'emit_event', topic: 'order.placed', dataRaw: '{}' },
    ];

    it('renders a row per action', () => {
      const { container } = render(
        <TestWrapper initialActions={twoActions} />,
      );
      const removeButtons = container.querySelectorAll(
        'button[title="Remove action"]',
      );
      expect(removeButtons).toHaveLength(2);
    });

    it('shows count badge with correct number', () => {
      render(<TestWrapper initialActions={twoActions} />);
      expect(screen.getByText('2')).toBeDefined();
    });

    it('does not show empty state message', () => {
      render(<TestWrapper initialActions={twoActions} />);
      expect(
        screen.queryByText('At least one action is required'),
      ).toBeNull();
    });

    it('renders action type selectors', () => {
      const { container } = render(
        <TestWrapper initialActions={twoActions} />,
      );
      const selects = container.querySelectorAll('select');
      expect(selects.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('error message', () => {
    it('displays error when provided', () => {
      render(<TestWrapper error="Actions validation failed" />);
      expect(
        screen.getByText('Actions validation failed'),
      ).toBeDefined();
    });

    it('does not display error when not provided', () => {
      render(<TestWrapper />);
      expect(
        screen.queryByText('Actions validation failed'),
      ).toBeNull();
    });
  });

  describe('adding actions', () => {
    it('adds a new row when add button is clicked', () => {
      const { container } = render(<TestWrapper />);
      fireEvent.click(screen.getByText('Add action'));
      expect(
        screen.queryByText('At least one action is required'),
      ).toBeNull();
      const removeButtons = container.querySelectorAll(
        'button[title="Remove action"]',
      );
      expect(removeButtons).toHaveLength(1);
    });

    it('adds multiple rows on repeated clicks', () => {
      const { container } = render(<TestWrapper />);
      const addButton = screen.getByText('Add action');
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      const removeButtons = container.querySelectorAll(
        'button[title="Remove action"]',
      );
      expect(removeButtons).toHaveLength(3);
    });
  });

  describe('removing actions', () => {
    it('removes a row when remove button is clicked', () => {
      const oneAction: RuleFormData['actions'] = [
        { type: 'log', level: 'info', message: 'test' },
      ];
      render(<TestWrapper initialActions={oneAction} />);
      const removeButton = screen.getByTitle('Remove action');
      fireEvent.click(removeButton);
      expect(
        screen.getByText('At least one action is required'),
      ).toBeDefined();
    });

    it('removes only the targeted row', () => {
      const threeActions: RuleFormData['actions'] = [
        { type: 'log', level: 'info', message: 'a' },
        { type: 'log', level: 'warn', message: 'b' },
        { type: 'log', level: 'error', message: 'c' },
      ];
      const { container } = render(
        <TestWrapper initialActions={threeActions} />,
      );
      const removeButtons = container.querySelectorAll(
        'button[title="Remove action"]',
      );
      expect(removeButtons).toHaveLength(3);
      fireEvent.click(removeButtons[0]);
      const remaining = container.querySelectorAll(
        'button[title="Remove action"]',
      );
      expect(remaining).toHaveLength(2);
    });
  });

  describe('action type fields', () => {
    it('renders key and value fields for set_fact action', () => {
      const { container } = render(
        <TestWrapper initialActions={[{ type: 'set_fact', key: '', valueRaw: '' }]} />,
      );
      const inputs = container.querySelectorAll('input[type="text"]');
      const placeholders = Array.from(inputs).map((i) =>
        i.getAttribute('placeholder'),
      );
      expect(placeholders).toContain('Fact key');
      expect(placeholders).toContain('Value (JSON)');
    });

    it('renders topic and data fields for emit_event action', () => {
      const { container } = render(
        <TestWrapper
          initialActions={[{ type: 'emit_event', topic: '', dataRaw: '' }]}
        />,
      );
      const inputs = container.querySelectorAll('input[type="text"]');
      const placeholders = Array.from(inputs).map((i) =>
        i.getAttribute('placeholder'),
      );
      expect(placeholders).toContain('Event topic');
    });

    it('renders conditional action info text', () => {
      render(
        <TestWrapper initialActions={[{ type: 'conditional' }]} />,
      );
      expect(
        screen.getByText(
          'Conditional actions are best edited via the YAML editor.',
        ),
      ).toBeDefined();
    });
  });
});
