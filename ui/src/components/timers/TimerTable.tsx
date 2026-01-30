import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Trash2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { fetchTimers, cancelTimer, createTimer } from '../../api/queries/timers';
import { SearchInput } from '../common/SearchInput';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  formatCountdown,
  formatTimestamp,
  formatDuration,
} from '../../lib/formatters';
import { POLLING_INTERVALS } from '../../lib/constants';
import type { Timer } from '../../types';
import { TimerFormDialog } from './TimerFormDialog';

type SortField = 'name' | 'expiresAt';
type SortDir = 'asc' | 'desc';

export function TimerTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('expiresAt');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [cancelTarget, setCancelTarget] = useState<Timer | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [, setTick] = useState(0);

  // Tick every second for countdown rendering
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(interval);
  }, []);

  const { data: timers, isLoading } = useQuery({
    queryKey: ['timers'],
    queryFn: fetchTimers,
    refetchInterval: POLLING_INTERVALS.timers,
  });

  const cancelMutation = useMutation({
    mutationFn: (name: string) => cancelTimer(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timers'] });
      toast.success('Timer cancelled');
    },
    onError: () => {
      toast.error('Failed to cancel timer');
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => createTimer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timers'] });
      setShowCreate(false);
      toast.success('Timer created');
    },
    onError: () => {
      toast.error('Failed to create timer');
    },
  });

  const filtered = useMemo(() => {
    if (!timers) return [];
    const q = search.toLowerCase();
    let result = q
      ? timers.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.onExpire.topic.toLowerCase().includes(q) ||
            t.correlationId?.toLowerCase().includes(q),
        )
      : [...timers];

    result.sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'expiresAt':
          cmp = a.expiresAt - b.expiresAt;
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [timers, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'asc');
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading timers..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="max-w-xs flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filter timers..."
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          New Timer
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            search ? 'No timers match your filter' : 'No active timers'
          }
          description={
            search
              ? 'Try adjusting your search term'
              : 'Timers will appear here when created by rules or API'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  <SortButton
                    active={sortField === 'name'}
                    dir={sortDir}
                    onClick={() => toggleSort('name')}
                  >
                    Name
                  </SortButton>
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Countdown
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  <SortButton
                    active={sortField === 'expiresAt'}
                    dir={sortDir}
                    onClick={() => toggleSort('expiresAt')}
                  >
                    Expires At
                  </SortButton>
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  On Expire
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Repeat
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Correlation
                </th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((timer) => {
                const remaining = timer.expiresAt - Date.now();
                const isExpiring = remaining > 0 && remaining < 60_000;
                const isExpired = remaining <= 0;

                return (
                  <tr
                    key={timer.id}
                    className={clsx(
                      'transition-colors',
                      isExpired
                        ? 'bg-red-50 dark:bg-red-950/20'
                        : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50',
                    )}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {timer.name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums',
                          isExpired
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : isExpiring
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                        )}
                      >
                        {isExpiring && (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {formatCountdown(timer.expiresAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {formatTimestamp(timer.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {timer.onExpire.topic}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {timer.repeat ? (
                        <span>
                          every {formatDuration(timer.repeat.interval)}
                          {timer.repeat.maxCount != null && (
                            <span className="text-slate-400">
                              {' '}
                              (max {timer.repeat.maxCount})
                            </span>
                          )}
                        </span>
                      ) : (
                        '\u2014'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {timer.correlationId ? (
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {timer.correlationId}
                        </code>
                      ) : (
                        <span className="text-slate-400">{'\u2014'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setCancelTarget(timer)}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        title="Cancel timer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel Timer"
        description={
          cancelTarget
            ? `Are you sure you want to cancel timer "${cancelTarget.name}"?`
            : ''
        }
        confirmLabel="Cancel Timer"
        variant="danger"
        onConfirm={() => {
          if (cancelTarget) {
            cancelMutation.mutate(cancelTarget.name);
            setCancelTarget(null);
          }
        }}
        onCancel={() => setCancelTarget(null)}
      />

      {showCreate && (
        <TimerFormDialog
          onSubmit={(data) => createMutation.mutate(data)}
          onClose={() => setShowCreate(false)}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  );
}

function SortButton({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
    >
      {children}
      <ArrowUpDown
        className={clsx(
          'h-3.5 w-3.5 transition-opacity',
          active ? 'opacity-100' : 'opacity-30',
          active && dir === 'asc' && 'rotate-180',
        )}
      />
    </button>
  );
}
