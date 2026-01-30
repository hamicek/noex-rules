import type { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import type { RuleFormData } from '../rules/RuleForm';
import { TRIGGER_TYPE_LABELS, TRIGGER_TYPE_COLORS } from '../../lib/constants';
import { clsx } from 'clsx';
import type { TriggerType } from '../../types';

interface TriggerSelectorProps {
  register: UseFormRegister<RuleFormData>;
  watch: UseFormWatch<RuleFormData>;
  setValue: UseFormSetValue<RuleFormData>;
}

const TRIGGER_TYPES: TriggerType[] = ['fact', 'event', 'timer', 'temporal'];

export function TriggerSelector({
  register,
  watch,
  setValue,
}: TriggerSelectorProps) {
  const triggerType = watch('trigger.type');

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Trigger Type
        </label>
        <div className="flex flex-wrap gap-2">
          {TRIGGER_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setValue('trigger.type', type, { shouldDirty: true })}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                triggerType === type
                  ? clsx(TRIGGER_TYPE_COLORS[type], 'ring-2 ring-offset-1 ring-current')
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
              )}
            >
              {TRIGGER_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {triggerType === 'fact' && (
        <div>
          <label
            htmlFor="trigger-pattern"
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Fact Pattern
          </label>
          <input
            id="trigger-pattern"
            type="text"
            placeholder="e.g. customer:*:tier"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            {...register('trigger.pattern')}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Glob pattern matching fact keys
          </p>
        </div>
      )}

      {triggerType === 'event' && (
        <div>
          <label
            htmlFor="trigger-topic"
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Event Topic
          </label>
          <input
            id="trigger-topic"
            type="text"
            placeholder="e.g. order.placed"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            {...register('trigger.topic')}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Event topic string to subscribe to
          </p>
        </div>
      )}

      {triggerType === 'timer' && (
        <div>
          <label
            htmlFor="trigger-name"
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Timer Name
          </label>
          <input
            id="trigger-name"
            type="text"
            placeholder="e.g. session-timeout"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            {...register('trigger.name')}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Name of the timer that triggers this rule
          </p>
        </div>
      )}

      {triggerType === 'temporal' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Temporal triggers use complex pattern definitions. Use the YAML
            editor for full temporal configuration.
          </p>
        </div>
      )}
    </div>
  );
}
