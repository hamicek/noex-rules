import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Pencil, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import {
  fetchGroups,
  enableGroup,
  disableGroup,
  deleteGroup,
  createGroup,
  updateGroup,
} from '../../api/queries/groups';
import { RuleStatusBadge } from '../rules/RuleStatusBadge';
import { SearchInput } from '../common/SearchInput';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatRelativeTime } from '../../lib/formatters';
import { POLLING_INTERVALS } from '../../lib/constants';
import type { RuleGroup } from '../../types';
import { GroupFormDialog } from './GroupFormDialog';

type SortField = 'name' | 'rulesCount' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export function GroupTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [deleteTarget, setDeleteTarget] = useState<RuleGroup | null>(null);
  const [editTarget, setEditTarget] = useState<RuleGroup | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: groups, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: fetchGroups,
    refetchInterval: POLLING_INTERVALS.groups,
  });

  const toggleMutation = useMutation({
    mutationFn: (group: RuleGroup) =>
      group.enabled ? disableGroup(group.id) : enableGroup(group.id),
    onMutate: async (group) => {
      await queryClient.cancelQueries({ queryKey: ['groups'] });
      const previous = queryClient.getQueryData<RuleGroup[]>(['groups']);
      queryClient.setQueryData<RuleGroup[]>(['groups'], (old) =>
        old?.map((g) =>
          g.id === group.id ? { ...g, enabled: !g.enabled } : g,
        ),
      );
      return { previous };
    },
    onError: (_err, _group, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['groups'], context.previous);
      }
      toast.error('Failed to toggle group');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Group deleted');
    },
    onError: () => {
      toast.error('Failed to delete group');
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => createGroup(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      toast.success('Group created');
    },
    onError: () => {
      toast.error('Failed to create group');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Record<string, unknown>;
    }) => updateGroup(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setEditTarget(null);
      toast.success('Group updated');
    },
    onError: () => {
      toast.error('Failed to update group');
    },
  });

  const filtered = useMemo(() => {
    if (!groups) return [];
    const q = search.toLowerCase();
    let result = q
      ? groups.filter(
          (g) =>
            g.name.toLowerCase().includes(q) ||
            g.id.toLowerCase().includes(q) ||
            g.description?.toLowerCase().includes(q),
        )
      : [...groups];

    result.sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'rulesCount':
          cmp = a.rulesCount - b.rulesCount;
          break;
        case 'updatedAt':
          cmp = a.updatedAt - b.updatedAt;
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [groups, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading groups..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="max-w-xs flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filter groups..."
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          New Group
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            search ? 'No groups match your filter' : 'No groups created'
          }
          description={
            search
              ? 'Try adjusting your search term'
              : 'Create your first group to organize rules'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
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
                  Description
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  <SortButton
                    active={sortField === 'rulesCount'}
                    dir={sortDir}
                    onClick={() => toggleSort('rulesCount')}
                  >
                    Rules
                  </SortButton>
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  <SortButton
                    active={sortField === 'updatedAt'}
                    dir={sortDir}
                    onClick={() => toggleSort('updatedAt')}
                  >
                    Updated
                  </SortButton>
                </th>
                <th className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((group) => (
                <tr
                  key={group.id}
                  className="bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {group.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {group.id}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    <span className="line-clamp-1">
                      {group.description || '\u2014'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <RuleStatusBadge enabled={group.enabled} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                    {group.rulesCount}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {formatRelativeTime(group.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <ToggleSwitch
                        checked={group.enabled}
                        onChange={() => toggleMutation.mutate(group)}
                        disabled={toggleMutation.isPending}
                      />
                      <button
                        type="button"
                        onClick={() => setEditTarget(group)}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                        title="Edit group"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(group)}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        title="Delete group"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Group"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This group contains ${deleteTarget.rulesCount} rule(s).`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {showCreate && (
        <GroupFormDialog
          onSubmit={(data) => createMutation.mutate(data)}
          onClose={() => setShowCreate(false)}
          isPending={createMutation.isPending}
        />
      )}

      {editTarget && (
        <GroupFormDialog
          group={editTarget}
          onSubmit={(data) =>
            updateMutation.mutate({ id: editTarget.id, input: data })
          }
          onClose={() => setEditTarget(null)}
          isPending={updateMutation.isPending}
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

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700',
      )}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}
