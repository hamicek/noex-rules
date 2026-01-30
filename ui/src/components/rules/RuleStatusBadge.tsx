import { clsx } from 'clsx';

interface RuleStatusBadgeProps {
  enabled: boolean;
}

export function RuleStatusBadge({ enabled }: RuleStatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        enabled
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      )}
    >
      <span
        className={clsx(
          'h-1.5 w-1.5 rounded-full',
          enabled ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500',
        )}
      />
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}
