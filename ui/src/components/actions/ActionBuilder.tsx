import type {
  UseFormRegister,
  UseFormWatch,
  UseFieldArrayReturn,
} from 'react-hook-form';
import type { RuleFormData } from '../rules/RuleForm';
import { ActionRow } from './ActionRow';
import { Plus, Zap } from 'lucide-react';

interface ActionBuilderProps {
  fields: UseFieldArrayReturn<RuleFormData, 'actions'>['fields'];
  append: UseFieldArrayReturn<RuleFormData, 'actions'>['append'];
  remove: UseFieldArrayReturn<RuleFormData, 'actions'>['remove'];
  register: UseFormRegister<RuleFormData>;
  watch: UseFormWatch<RuleFormData>;
  error?: string;
}

export function ActionBuilder({
  fields,
  append,
  remove,
  register,
  watch,
  error,
}: ActionBuilderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Zap className="h-4 w-4" />
          Actions
          {fields.length > 0 && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {fields.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            append({
              type: 'set_fact',
              key: '',
              valueRaw: '',
            })
          }
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/30"
        >
          <Plus className="h-3.5 w-3.5" />
          Add action
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          At least one action is required
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <ActionRow
              key={field.id}
              index={index}
              register={register}
              watch={watch}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
