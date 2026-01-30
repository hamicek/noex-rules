import { clsx } from 'clsx';
import { Minus, Plus, ArrowRight } from 'lucide-react';
import type { RuleFieldChange } from '../../types';

interface VersionDiffProps {
  fromVersion: number;
  toVersion: number;
  changes: RuleFieldChange[];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function isMultiline(value: unknown): boolean {
  const str = formatValue(value);
  return str.includes('\n') || str.length > 60;
}

export function VersionDiff({ fromVersion, toVersion, changes }: VersionDiffProps) {
  if (changes.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        No differences between v{fromVersion} and v{toVersion}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
          v{fromVersion}
        </span>
        <ArrowRight className="h-4 w-4" />
        <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          v{toVersion}
        </span>
        <span className="text-xs">
          {changes.length} {changes.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {changes.map((change) => {
          const multiline = isMultiline(change.oldValue) || isMultiline(change.newValue);

          return (
            <div key={change.field} className="p-4">
              <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                {change.field}
              </div>

              {multiline ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                      <Minus className="h-3 w-3" />
                      v{fromVersion}
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-red-800 dark:text-red-300">
                      {formatValue(change.oldValue)}
                    </pre>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Plus className="h-3 w-3" />
                      v{toVersion}
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-emerald-800 dark:text-emerald-300">
                      {formatValue(change.newValue)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 font-mono text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    <Minus className="h-3 w-3" />
                    {formatValue(change.oldValue)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 font-mono text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <Plus className="h-3 w-3" />
                    {formatValue(change.newValue)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
