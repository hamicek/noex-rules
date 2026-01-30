import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { clsx } from 'clsx';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-3 py-16 text-center',
        className,
      )}
    >
      <div className="text-slate-300 dark:text-slate-600">
        {icon ?? <Inbox className="h-10 w-10" />}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {title}
        </p>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
