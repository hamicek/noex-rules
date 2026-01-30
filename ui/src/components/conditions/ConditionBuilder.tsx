import type {
  UseFormRegister,
  UseFormWatch,
  UseFieldArrayReturn,
} from 'react-hook-form';
import type { RuleFormData } from '../rules/RuleForm';
import { ConditionRow } from './ConditionRow';
import { Plus, Filter } from 'lucide-react';

interface ConditionBuilderProps {
  fields: UseFieldArrayReturn<RuleFormData, 'conditions'>['fields'];
  append: UseFieldArrayReturn<RuleFormData, 'conditions'>['append'];
  remove: UseFieldArrayReturn<RuleFormData, 'conditions'>['remove'];
  register: UseFormRegister<RuleFormData>;
  watch: UseFormWatch<RuleFormData>;
}

export function ConditionBuilder({
  fields,
  append,
  remove,
  register,
  watch,
}: ConditionBuilderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Filter className="h-4 w-4" />
          Conditions
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
              source: { type: 'fact', pattern: '' },
              operator: 'eq',
              valueRaw: '',
            })
          }
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/30"
        >
          <Plus className="h-3.5 w-3.5" />
          Add condition
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No conditions — rule fires on every trigger match
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <ConditionRow
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
