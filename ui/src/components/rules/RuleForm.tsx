import { useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Save, X as XIcon, Tag } from 'lucide-react';
import { TriggerSelector } from '../triggers/TriggerSelector';
import { ConditionBuilder } from '../conditions/ConditionBuilder';
import { ActionBuilder } from '../actions/ActionBuilder';
import { fetchGroups } from '../../api/queries/groups';
import type {
  Rule,
  RuleCondition,
  RuleAction,
  TriggerType,
  ConditionSourceType,
  ConditionOperator,
  ActionType,
  LogLevel,
} from '../../types';
import { UNARY_OPERATORS } from '../../lib/constants';

// --- Zod schema ---

const triggerSchema = z.object({
  type: z.enum(['fact', 'event', 'timer', 'temporal']),
  pattern: z.string().optional(),
  topic: z.string().optional(),
  name: z.string().optional(),
});

const conditionFormSchema = z.object({
  source: z.object({
    type: z.enum(['fact', 'event', 'context', 'lookup', 'baseline']),
    pattern: z.string().optional(),
    field: z.string().optional(),
    key: z.string().optional(),
    name: z.string().optional(),
    metric: z.string().optional(),
  }),
  operator: z.string(),
  valueRaw: z.string().optional(),
});

const actionFormSchema = z.object({
  type: z.enum([
    'set_fact',
    'delete_fact',
    'emit_event',
    'set_timer',
    'cancel_timer',
    'call_service',
    'log',
    'conditional',
  ]),
  key: z.string().optional(),
  valueRaw: z.string().optional(),
  topic: z.string().optional(),
  dataRaw: z.string().optional(),
  timerRaw: z.string().optional(),
  name: z.string().optional(),
  service: z.string().optional(),
  method: z.string().optional(),
  argsRaw: z.string().optional(),
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  message: z.string().optional(),
});

const ruleFormSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priority: z.number().int(),
  enabled: z.boolean(),
  tags: z.string().optional(),
  group: z.string().optional(),
  trigger: triggerSchema,
  conditions: z.array(conditionFormSchema),
  actions: z.array(actionFormSchema).min(1, 'At least one action is required'),
});

export type RuleFormData = z.infer<typeof ruleFormSchema>;

// --- Helpers: form ↔ API ---

function ruleToFormData(rule: Rule): RuleFormData {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description ?? '',
    priority: rule.priority,
    enabled: rule.enabled,
    tags: rule.tags.join(', '),
    group: rule.groupId ?? '',
    trigger: {
      type: rule.trigger.type,
      pattern: rule.trigger.pattern ?? '',
      topic: rule.trigger.topic ?? '',
      name: rule.trigger.name ?? '',
    },
    conditions: rule.conditions.map((c) => ({
      source: {
        type: c.source.type as ConditionSourceType,
        pattern: c.source.pattern ?? '',
        field: c.source.field ?? '',
        key: c.source.key ?? '',
        name: c.source.name ?? '',
        metric: c.source.metric ?? '',
      },
      operator: c.operator,
      valueRaw: c.value !== undefined ? JSON.stringify(c.value) : '',
    })),
    actions: rule.actions.map((a) => ({
      type: a.type as ActionType,
      key: a.key ?? '',
      valueRaw: a.value !== undefined ? JSON.stringify(a.value) : '',
      topic: a.topic ?? '',
      dataRaw: a.data !== undefined ? JSON.stringify(a.data) : '',
      timerRaw: a.timer !== undefined ? JSON.stringify(a.timer) : '',
      name: a.name ?? '',
      service: a.service ?? '',
      method: a.method ?? '',
      argsRaw: a.args !== undefined ? JSON.stringify(a.args) : '',
      level: (a.level ?? 'info') as LogLevel,
      message: a.message ?? '',
    })),
  };
}

function safeJsonParse(raw: string | undefined): unknown | undefined {
  if (!raw || raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function formDataToInput(
  data: RuleFormData,
  isCreate: boolean,
): Record<string, unknown> {
  const tags = data.tags
    ? data.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const trigger: Record<string, unknown> = { type: data.trigger.type };
  if (data.trigger.type === 'fact') trigger.pattern = data.trigger.pattern;
  if (data.trigger.type === 'event') trigger.topic = data.trigger.topic;
  if (data.trigger.type === 'timer') trigger.name = data.trigger.name;

  const conditions: RuleCondition[] = data.conditions.map((c) => {
    const source: Record<string, unknown> = { type: c.source.type };
    if (c.source.type === 'fact' && c.source.pattern)
      source.pattern = c.source.pattern;
    if (c.source.type === 'event' && c.source.field)
      source.field = c.source.field;
    if (c.source.type === 'context' && c.source.key) source.key = c.source.key;
    if (c.source.type === 'lookup' && c.source.name)
      source.name = c.source.name;
    if (c.source.type === 'baseline' && c.source.metric)
      source.metric = c.source.metric;

    const cond: Record<string, unknown> = {
      source,
      operator: c.operator,
    };
    if (!UNARY_OPERATORS.has(c.operator)) {
      cond.value = safeJsonParse(c.valueRaw);
    }
    return cond as unknown as RuleCondition;
  });

  const actions: RuleAction[] = data.actions.map((a) => {
    const action: Record<string, unknown> = { type: a.type };
    switch (a.type) {
      case 'set_fact':
        action.key = a.key;
        action.value = safeJsonParse(a.valueRaw);
        break;
      case 'delete_fact':
        action.key = a.key;
        break;
      case 'emit_event':
        action.topic = a.topic;
        action.data = safeJsonParse(a.dataRaw);
        break;
      case 'set_timer':
        action.timer = safeJsonParse(a.timerRaw);
        break;
      case 'cancel_timer':
        action.name = a.name;
        break;
      case 'call_service':
        action.service = a.service;
        action.method = a.method;
        action.args = safeJsonParse(a.argsRaw);
        break;
      case 'log':
        action.level = a.level;
        action.message = a.message;
        break;
    }
    return action as unknown as RuleAction;
  });

  const input: Record<string, unknown> = {
    name: data.name,
    description: data.description || undefined,
    priority: data.priority,
    enabled: data.enabled,
    tags,
    group: data.group || undefined,
    trigger,
    conditions,
    actions,
  };

  if (isCreate) {
    input.id = data.id;
  }

  return input;
}

// --- Component ---

interface RuleFormProps {
  rule?: Rule;
  onSubmit: (input: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function RuleForm({
  rule,
  onSubmit,
  onCancel,
  isSubmitting,
}: RuleFormProps) {
  const isCreate = !rule;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<RuleFormData>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: rule
      ? ruleToFormData(rule)
      : {
          id: '',
          name: '',
          description: '',
          priority: 0,
          enabled: true,
          tags: '',
          group: '',
          trigger: { type: 'fact' as TriggerType, pattern: '', topic: '', name: '' },
          conditions: [],
          actions: [{ type: 'set_fact' as ActionType, key: '', valueRaw: '' }],
        },
  });

  const conditionArray = useFieldArray({ control, name: 'conditions' });
  const actionArray = useFieldArray({ control, name: 'actions' });

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: fetchGroups,
  });

  const [tagInput, setTagInput] = useState('');
  const tagsValue = watch('tags') ?? '';
  const currentTags = tagsValue
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed || currentTags.includes(trimmed)) return;
      const next = [...currentTags, trimmed].join(', ');
      setValue('tags', next, { shouldDirty: true });
      setTagInput('');
    },
    [currentTags, setValue],
  );

  const removeTag = useCallback(
    (tag: string) => {
      const next = currentTags.filter((t) => t !== tag).join(', ');
      setValue('tags', next, { shouldDirty: true });
    },
    [currentTags, setValue],
  );

  const onFormSubmit = handleSubmit((data: RuleFormData) => {
    onSubmit(formDataToInput(data, isCreate));
  });

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

  const selectClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

  return (
    <form onSubmit={onFormSubmit} className="space-y-8">
      {/* Metadata */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Metadata
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="rule-id"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              ID
            </label>
            <input
              id="rule-id"
              type="text"
              className={inputClass}
              placeholder="unique-rule-id"
              disabled={!isCreate}
              {...register('id')}
            />
            {errors.id && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.id.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="rule-name"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Name
            </label>
            <input
              id="rule-name"
              type="text"
              className={inputClass}
              placeholder="Rule name"
              {...register('name')}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.name.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="rule-description"
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Description
          </label>
          <textarea
            id="rule-description"
            rows={2}
            className={inputClass + ' resize-none'}
            placeholder="Optional description"
            {...register('description')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="rule-priority"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Priority
            </label>
            <input
              id="rule-priority"
              type="number"
              className={inputClass}
              {...register('priority')}
            />
          </div>
          <div>
            <label
              htmlFor="rule-group"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Group
            </label>
            <select
              id="rule-group"
              className={selectClass}
              {...register('group')}
            >
              <option value="">No group</option>
              {groups?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-700"
                {...register('enabled')}
              />
              Enabled
            </label>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Tags
          </label>
          {currentTags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {currentTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            className={inputClass}
            placeholder="Type a tag and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            onBlur={() => {
              if (tagInput.trim()) addTag(tagInput);
            }}
          />
        </div>
      </section>

      {/* Trigger */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Trigger
        </h3>
        <TriggerSelector register={register} watch={watch} setValue={setValue} />
      </section>

      {/* Conditions */}
      <section>
        <ConditionBuilder
          fields={conditionArray.fields}
          append={conditionArray.append}
          remove={conditionArray.remove}
          register={register}
          watch={watch}
        />
      </section>

      {/* Actions */}
      <section>
        <ActionBuilder
          fields={actionArray.fields}
          append={actionArray.append}
          remove={actionArray.remove}
          register={register}
          watch={watch}
          error={errors.actions?.root?.message ?? errors.actions?.message}
        />
      </section>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || (!isCreate && !isDirty)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isCreate ? 'Create Rule' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
