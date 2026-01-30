import type { UseFormRegister, UseFormWatch } from 'react-hook-form';
import type { RuleFormData } from '../rules/RuleForm';
import { X } from 'lucide-react';
import { ACTION_TYPE_LABELS, LOG_LEVEL_LABELS } from '../../lib/constants';
import type { ActionType, LogLevel } from '../../types';

interface ActionRowProps {
  index: number;
  register: UseFormRegister<RuleFormData>;
  watch: UseFormWatch<RuleFormData>;
  onRemove: () => void;
}

const ACTION_TYPES: ActionType[] = [
  'set_fact',
  'delete_fact',
  'emit_event',
  'set_timer',
  'cancel_timer',
  'call_service',
  'log',
  'conditional',
];

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

const selectClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

function ActionFields({
  index,
  actionType,
  register,
}: {
  index: number;
  actionType: string;
  register: UseFormRegister<RuleFormData>;
}) {
  switch (actionType) {
    case 'set_fact':
      return (
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <input
            type="text"
            className={inputClass}
            placeholder="Fact key"
            {...register(`actions.${index}.key`)}
          />
          <input
            type="text"
            className={inputClass}
            placeholder="Value (JSON)"
            {...register(`actions.${index}.valueRaw`)}
          />
        </div>
      );
    case 'delete_fact':
      return (
        <input
          type="text"
          className={inputClass}
          placeholder="Fact key"
          {...register(`actions.${index}.key`)}
        />
      );
    case 'emit_event':
      return (
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <input
            type="text"
            className={inputClass}
            placeholder="Event topic"
            {...register(`actions.${index}.topic`)}
          />
          <input
            type="text"
            className={inputClass}
            placeholder='Data (JSON, e.g. {"amount": 100})'
            {...register(`actions.${index}.dataRaw`)}
          />
        </div>
      );
    case 'set_timer':
      return (
        <input
          type="text"
          className={inputClass}
          placeholder='Timer config (JSON, e.g. {"name":"t1","duration":"5m","topic":"timeout"})'
          {...register(`actions.${index}.timerRaw`)}
        />
      );
    case 'cancel_timer':
      return (
        <input
          type="text"
          className={inputClass}
          placeholder="Timer name"
          {...register(`actions.${index}.name`)}
        />
      );
    case 'call_service':
      return (
        <div className="grid flex-1 gap-2 sm:grid-cols-3">
          <input
            type="text"
            className={inputClass}
            placeholder="Service"
            {...register(`actions.${index}.service`)}
          />
          <input
            type="text"
            className={inputClass}
            placeholder="Method"
            {...register(`actions.${index}.method`)}
          />
          <input
            type="text"
            className={inputClass}
            placeholder='Args (JSON array, e.g. [1, "a"])'
            {...register(`actions.${index}.argsRaw`)}
          />
        </div>
      );
    case 'log':
      return (
        <div className="grid flex-1 gap-2 sm:grid-cols-[100px_1fr]">
          <select
            className={selectClass}
            {...register(`actions.${index}.level`)}
          >
            {LOG_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {LOG_LEVEL_LABELS[lvl]}
              </option>
            ))}
          </select>
          <input
            type="text"
            className={inputClass}
            placeholder="Log message"
            {...register(`actions.${index}.message`)}
          />
        </div>
      );
    case 'conditional':
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Conditional actions are best edited via the YAML editor.
        </p>
      );
    default:
      return null;
  }
}

export function ActionRow({
  index,
  register,
  watch,
  onRemove,
}: ActionRowProps) {
  const actionType = watch(`actions.${index}.type`);

  return (
    <div className="group space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="flex items-center gap-2">
        <select
          className={selectClass + ' max-w-[160px]'}
          {...register(`actions.${index}.type`)}
        >
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          title="Remove action"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ActionFields
        index={index}
        actionType={actionType}
        register={register}
      />
    </div>
  );
}
