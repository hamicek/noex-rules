import { useState, useCallback, useEffect, useMemo } from 'react';
import { stringify as yamlStringify, parse as yamlParse } from 'yaml';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { Rule } from '../../types';

interface RuleYamlEditorProps {
  rule?: Rule;
  onSubmit: (input: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  isCreate?: boolean;
}

function ruleToYaml(rule: Rule): string {
  const obj: Record<string, unknown> = {
    id: rule.id,
    name: rule.name,
    ...(rule.description && { description: rule.description }),
    priority: rule.priority,
    enabled: rule.enabled,
    tags: rule.tags,
    ...(rule.groupId && { group: rule.groupId }),
    trigger: rule.trigger,
    conditions: rule.conditions,
    actions: rule.actions,
  };
  return yamlStringify(obj, { indent: 2, lineWidth: 120 });
}

const DEFAULT_YAML = `id: ""
name: ""
description: ""
priority: 0
enabled: true
tags: []
trigger:
  type: fact
  pattern: ""
conditions: []
actions:
  - type: set_fact
    key: ""
    value: null
`;

function parseYamlToInput(
  yaml: string,
  isCreate: boolean,
): { input: Record<string, unknown> | null; error: string | null } {
  try {
    const parsed = yamlParse(yaml);
    if (!parsed || typeof parsed !== 'object') {
      return { input: null, error: 'YAML must be an object' };
    }

    const { id, name, trigger, actions, ...rest } = parsed as Record<
      string,
      unknown
    >;

    if (!name || typeof name !== 'string') {
      return { input: null, error: 'Missing or invalid "name" field' };
    }
    if (!trigger || typeof trigger !== 'object') {
      return { input: null, error: 'Missing or invalid "trigger" field' };
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      return { input: null, error: 'At least one action is required' };
    }

    const input: Record<string, unknown> = {
      name,
      trigger,
      actions,
      ...rest,
    };

    if (isCreate) {
      if (!id || typeof id !== 'string') {
        return { input: null, error: 'Missing or invalid "id" field' };
      }
      input.id = id;
    }

    return { input, error: null };
  } catch (e) {
    return {
      input: null,
      error: e instanceof Error ? e.message : 'Invalid YAML',
    };
  }
}

export function RuleYamlEditor({
  rule,
  onSubmit,
  onCancel,
  isSubmitting,
  isCreate = false,
}: RuleYamlEditorProps) {
  const initialYaml = useMemo(
    () => (rule ? ruleToYaml(rule) : DEFAULT_YAML),
    [rule],
  );
  const [yaml, setYaml] = useState(initialYaml);
  const [validationError, setValidationError] = useState<string | null>(null);
  const isDirty = yaml !== initialYaml;

  useEffect(() => {
    const { error } = parseYamlToInput(yaml, isCreate);
    setValidationError(error);
  }, [yaml, isCreate]);

  const handleSubmit = useCallback(() => {
    const { input, error } = parseYamlToInput(yaml, isCreate);
    if (error || !input) {
      setValidationError(error ?? 'Invalid YAML');
      return;
    }
    onSubmit(input);
  }, [yaml, isCreate, onSubmit]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1">
        <textarea
          value={yaml}
          onChange={(e) => setYaml(e.target.value)}
          spellCheck={false}
          className="h-full w-full resize-none rounded-lg border border-slate-300 bg-slate-50 p-4 font-mono text-sm leading-relaxed text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          style={{ minHeight: '400px', tabSize: 2 }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const target = e.target as HTMLTextAreaElement;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const value = target.value;
              setYaml(value.substring(0, start) + '  ' + value.substring(end));
              requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = start + 2;
              });
            }
          }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {validationError ? (
            <>
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-red-600 dark:text-red-400">
                {validationError}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400">
                Valid YAML
              </span>
            </>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !!validationError ||
              (!isCreate && !isDirty)
            }
            className={clsx(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white',
              'bg-primary-600 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Save className="h-4 w-4" />
            {isCreate ? 'Create Rule' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
