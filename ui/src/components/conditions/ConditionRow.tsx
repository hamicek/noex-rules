import type { UseFormRegister, UseFormWatch } from 'react-hook-form';
import type { RuleFormData } from '../rules/RuleForm';
import { X } from 'lucide-react';
import {
  CONDITION_SOURCE_TYPE_LABELS,
  CONDITION_OPERATOR_LABELS,
  UNARY_OPERATORS,
} from '../../lib/constants';
import type { ConditionSourceType, ConditionOperator } from '../../types';

interface ConditionRowProps {
  index: number;
  register: UseFormRegister<RuleFormData>;
  watch: UseFormWatch<RuleFormData>;
  onRemove: () => void;
}

const SOURCE_TYPES: ConditionSourceType[] = [
  'fact',
  'event',
  'context',
  'lookup',
  'baseline',
];

const OPERATORS: ConditionOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'contains',
  'not_contains',
  'matches',
  'exists',
  'not_exists',
];

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

const selectClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

function sourceDetailField(type: string): { name: string; placeholder: string } | null {
  switch (type) {
    case 'fact':
      return { name: 'pattern', placeholder: 'Fact pattern (e.g. user:*:score)' };
    case 'event':
      return { name: 'field', placeholder: 'Event field path (e.g. data.amount)' };
    case 'context':
      return { name: 'key', placeholder: 'Context key' };
    case 'lookup':
      return { name: 'name', placeholder: 'Lookup name' };
    case 'baseline':
      return { name: 'metric', placeholder: 'Metric name' };
    default:
      return null;
  }
}

export function ConditionRow({
  index,
  register,
  watch,
  onRemove,
}: ConditionRowProps) {
  const sourceType = watch(`conditions.${index}.source.type`);
  const operator = watch(`conditions.${index}.operator`);
  const detail = sourceDetailField(sourceType);
  const isUnary = UNARY_OPERATORS.has(operator);

  return (
    <div className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="grid flex-1 gap-2 sm:grid-cols-[140px_1fr_130px_1fr]">
        <select
          className={selectClass}
          {...register(`conditions.${index}.source.type`)}
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONDITION_SOURCE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        {detail && (
          <input
            type="text"
            className={inputClass}
            placeholder={detail.placeholder}
            {...register(
              `conditions.${index}.source.${detail.name}` as `conditions.${number}.source.pattern`,
            )}
          />
        )}
        {!detail && <div />}

        <select
          className={selectClass}
          {...register(`conditions.${index}.operator`)}
        >
          {OPERATORS.map((op) => (
            <option key={op} value={op}>
              {CONDITION_OPERATOR_LABELS[op]}
            </option>
          ))}
        </select>

        {!isUnary && (
          <input
            type="text"
            className={inputClass}
            placeholder="Value (JSON)"
            {...register(`conditions.${index}.valueRaw`)}
          />
        )}
        {isUnary && <div />}
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="mt-1 shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
        title="Remove condition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
