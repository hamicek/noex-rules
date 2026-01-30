import { clsx } from 'clsx';
import {
  GitCommitHorizontal,
  RotateCcw,
  Plus,
  Pencil,
  ToggleRight,
  ToggleLeft,
  Trash2,
} from 'lucide-react';
import type { RuleVersionEntry, RuleChangeType } from '../../types';
import { formatTimestamp, formatRelativeTime } from '../../lib/formatters';
import { CHANGE_TYPE_LABELS, CHANGE_TYPE_COLORS } from '../../lib/constants';

interface VersionTimelineProps {
  entries: RuleVersionEntry[];
  currentVersion: number;
  selectedVersion?: number;
  compareVersion?: number;
  onSelectVersion: (version: number) => void;
  onCompareVersion: (version: number) => void;
  onRollback: (version: number) => void;
}

const changeTypeIcons: Record<RuleChangeType, typeof GitCommitHorizontal> = {
  registered: Plus,
  updated: Pencil,
  enabled: ToggleRight,
  disabled: ToggleLeft,
  unregistered: Trash2,
  rolled_back: RotateCcw,
};

export function VersionTimeline({
  entries,
  currentVersion,
  selectedVersion,
  compareVersion,
  onSelectVersion,
  onCompareVersion,
  onRollback,
}: VersionTimelineProps) {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />

      <div className="space-y-1">
        {entries.map((entry) => {
          const Icon = changeTypeIcons[entry.changeType] ?? GitCommitHorizontal;
          const isCurrent = entry.version === currentVersion;
          const isSelected = entry.version === selectedVersion;
          const isCompare = entry.version === compareVersion;

          return (
            <div
              key={entry.version}
              className={clsx(
                'group relative flex items-start gap-4 rounded-lg py-3 pl-1 pr-3 transition-colors',
                isSelected
                  ? 'bg-primary-50 dark:bg-primary-950/20'
                  : isCompare
                    ? 'bg-amber-50 dark:bg-amber-950/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
              )}
            >
              {/* Icon dot */}
              <div
                className={clsx(
                  'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-white dark:bg-slate-900',
                  isCurrent
                    ? 'border-primary-500 dark:border-primary-400'
                    : 'border-slate-300 dark:border-slate-600',
                )}
              >
                <Icon
                  className={clsx(
                    'h-4 w-4',
                    isCurrent
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-slate-500 dark:text-slate-400',
                  )}
                />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    v{entry.version}
                  </span>
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      CHANGE_TYPE_COLORS[entry.changeType] ?? CHANGE_TYPE_COLORS.updated,
                    )}
                  >
                    {CHANGE_TYPE_LABELS[entry.changeType] ?? entry.changeType}
                  </span>
                  {isCurrent && (
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                      Current
                    </span>
                  )}
                  {isSelected && (
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                      Selected
                    </span>
                  )}
                  {isCompare && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Compare
                    </span>
                  )}
                </div>

                {entry.description && (
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    {entry.description}
                  </p>
                )}

                {entry.rolledBackFrom != null && (
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                    Rolled back from v{entry.rolledBackFrom}
                  </p>
                )}

                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                  <time title={formatTimestamp(entry.timestamp)}>
                    {formatRelativeTime(entry.timestamp)}
                  </time>
                </div>

                {/* Actions */}
                <div className="mt-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {!isSelected && (
                    <button
                      type="button"
                      onClick={() => onSelectVersion(entry.version)}
                      className="rounded px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/30"
                    >
                      View snapshot
                    </button>
                  )}
                  {!isCompare && selectedVersion != null && selectedVersion !== entry.version && (
                    <button
                      type="button"
                      onClick={() => onCompareVersion(entry.version)}
                      className="rounded px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                    >
                      Compare
                    </button>
                  )}
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => onRollback(entry.version)}
                      className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      Rollback
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
