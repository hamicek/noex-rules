import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowUpDown } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchRules, enableRule, disableRule } from '../../api/queries/rules';
import { RuleStatusBadge } from './RuleStatusBadge';
import { SearchInput } from '../common/SearchInput';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';
import { formatRelativeTime } from '../../lib/formatters';
import {
  TRIGGER_TYPE_LABELS,
  TRIGGER_TYPE_COLORS,
  POLLING_INTERVALS,
} from '../../lib/constants';
import type { Rule } from '../../types';

type SortField = 'name' | 'priority' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export function RuleTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: rules, isLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: fetchRules,
    refetchInterval: POLLING_INTERVALS.rules,
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: Rule) =>
      rule.enabled ? disableRule(rule.id) : enableRule(rule.id),
    onMutate: async (rule) => {
      await queryClient.cancelQueries({ queryKey: ['rules'] });
      const previous = queryClient.getQueryData<Rule[]>(['rules']);
      queryClient.setQueryData<Rule[]>(['rules'], (old) =>
        old?.map((r) =>
          r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
        ),
      );
      return { previous };
    },
    onError: (_err, _rule, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['rules'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });

  const filtered = useMemo(() => {
    if (!rules) return [];
    const q = search.toLowerCase();
    let result = q
      ? rules.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q) ||
            r.tags.some((t) => t.toLowerCase().includes(q)) ||
            r.trigger.type.toLowerCase().includes(q),
        )
      : [...rules];

    result.sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'priority':
          cmp = a.priority - b.priority;
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
  }, [rules, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading rules..." />;
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter rules..."
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No rules match your filter' : 'No rules registered'}
          description={
            search
              ? 'Try adjusting your search term'
              : 'Create your first rule to get started'
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
                  <SortButton
                    active={sortField === 'priority'}
                    dir={sortDir}
                    onClick={() => toggleSort('priority')}
                  >
                    Priority
                  </SortButton>
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Trigger
                </th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                  Tags
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
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((rule) => (
                <tr
                  key={rule.id}
                  className="bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to="/rules/$ruleId"
                      params={{ ruleId: rule.id }}
                      className="group/link block"
                    >
                      <p className="font-medium text-slate-900 group-hover/link:text-primary-600 dark:text-slate-100 dark:group-hover/link:text-primary-400">
                        {rule.name}
                      </p>
                      {rule.description && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {rule.description}
                        </p>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                    {rule.priority}
                  </td>
                  <td className="px-4 py-3">
                    <RuleStatusBadge enabled={rule.enabled} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        TRIGGER_TYPE_COLORS[rule.trigger.type] ??
                          'bg-slate-100 text-slate-600',
                      )}
                    >
                      {TRIGGER_TYPE_LABELS[rule.trigger.type] ??
                        rule.trigger.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {rule.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {formatRelativeTime(rule.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ToggleSwitch
                      checked={rule.enabled}
                      onChange={() => toggleMutation.mutate(rule)}
                      disabled={toggleMutation.isPending}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
