import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { fetchFacts, deleteFact } from '../../api/queries/facts';
import { SearchInput } from '../common/SearchInput';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  formatRelativeTime,
  formatJson,
} from '../../lib/formatters';
import { POLLING_INTERVALS } from '../../lib/constants';
import type { Fact } from '../../types';
import { FactEditor } from './FactEditor';

type SortField = 'key' | 'timestamp' | 'source';
type SortDir = 'asc' | 'desc';

export function FactTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('key');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [deleteTarget, setDeleteTarget] = useState<Fact | null>(null);
  const [editTarget, setEditTarget] = useState<Fact | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: facts, isLoading } = useQuery({
    queryKey: ['facts'],
    queryFn: fetchFacts,
    refetchInterval: POLLING_INTERVALS.facts,
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteFact(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facts'] });
      toast.success('Fact deleted');
    },
    onError: () => {
      toast.error('Failed to delete fact');
    },
  });

  const filtered = useMemo(() => {
    if (!facts) return [];
    const q = search.toLowerCase();
    let result = q
      ? facts.filter(
          (f) =>
            f.key.toLowerCase().includes(q) ||
            f.source.toLowerCase().includes(q) ||
            formatJson(f.value).toLowerCase().includes(q),
        )
      : [...facts];

    result.sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case 'key':
          cmp = a.key.localeCompare(b.key);
          break;
        case 'timestamp':
          cmp = a.timestamp - b.timestamp;
          break;
        case 'source':
          cmp = a.source.localeCompare(b.source);
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [facts, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'key' || field === 'source' ? 'asc' : 'desc');
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading facts..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="max-w-xs flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filter facts by key, value, or source..."
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Set Fact
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            search
              ? 'No facts match your filter'
              : 'No facts in working memory'
          }
          description={
            search
              ? 'Try adjusting your search term'
              : 'Facts will appear here when set by rules or API'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  <SortButton
                    active={sortField === 'key'}
                    dir={sortDir}
                    onClick={() => toggleSort('key')}
                  >
                    Key
                  </SortButton>
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Value
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  <SortButton
                    active={sortField === 'source'}
                    dir={sortDir}
                    onClick={() => toggleSort('source')}
                  >
                    Source
                  </SortButton>
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Version
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  <SortButton
                    active={sortField === 'timestamp'}
                    dir={sortDir}
                    onClick={() => toggleSort('timestamp')}
                  >
                    Updated
                  </SortButton>
                </th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((fact) => (
                <tr
                  key={fact.key}
                  className="bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditTarget(fact)}
                      className="group/key text-left"
                    >
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800 group-hover/key:bg-primary-50 group-hover/key:text-primary-700 dark:bg-slate-800 dark:text-slate-200 dark:group-hover/key:bg-primary-950/50 dark:group-hover/key:text-primary-300">
                        {fact.key}
                      </code>
                    </button>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <code className="block truncate text-xs text-slate-600 dark:text-slate-400">
                      {formatJson(fact.value)}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {fact.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                    {fact.version}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {formatRelativeTime(fact.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(fact)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      title="Delete fact"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Fact"
        description={
          deleteTarget
            ? `Are you sure you want to delete fact "${deleteTarget.key}"?`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.key);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {(showCreate || editTarget) && (
        <FactEditor
          fact={editTarget ?? undefined}
          onClose={() => {
            setShowCreate(false);
            setEditTarget(null);
          }}
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
