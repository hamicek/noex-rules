import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Radio,
  Circle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { fetchAuditEntries } from '../../api/queries/audit';
import { useAuditStream } from '../../hooks/useAuditStream';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';
import {
  AuditFilters,
  type AuditFilterValues,
} from './AuditFilters';
import {
  formatTimestamp,
  formatMs,
} from '../../lib/formatters';
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_CATEGORY_COLORS,
  AUDIT_EVENT_TYPE_LABELS,
  POLLING_INTERVALS,
} from '../../lib/constants';
import { getServerUrl } from '../../api/client';
import type { AuditEntry, AuditQueryInput } from '../../types';

const PAGE_SIZE = 50;

const EMPTY_FILTERS: AuditFilterValues = {
  category: undefined,
  types: [],
  ruleId: '',
  source: '',
  correlationId: '',
};

export function AuditTable() {
  const [filters, setFilters] = useState<AuditFilterValues>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [streamEnabled, setStreamEnabled] = useState(false);

  const queryInput = useMemo((): AuditQueryInput => {
    const input: AuditQueryInput = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (filters.category) input.category = filters.category;
    if (filters.types.length > 0) input.types = filters.types;
    if (filters.ruleId) input.ruleId = filters.ruleId;
    if (filters.source) input.source = filters.source;
    if (filters.correlationId) input.correlationId = filters.correlationId;
    return input;
  }, [filters, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', queryInput],
    queryFn: () => fetchAuditEntries(queryInput),
    refetchInterval: POLLING_INTERVALS.audit,
  });

  const { entries: streamEntries, isConnected: streamConnected } =
    useAuditStream({
      enabled: streamEnabled,
      categories: filters.category ? [filters.category] : undefined,
      types: filters.types.length > 0 ? filters.types : undefined,
    });

  const handleFilterChange = useCallback((next: AuditFilterValues) => {
    setFilters(next);
    setPage(0);
  }, []);

  const handleReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(0);
  }, []);

  const totalPages = data ? Math.ceil(data.totalCount / PAGE_SIZE) : 0;

  const handleExport = (format: 'json' | 'csv') => {
    const serverUrl = getServerUrl();
    const params = new URLSearchParams({ format });
    if (filters.category) params.set('category', filters.category);
    if (filters.types.length > 0) params.set('types', filters.types.join(','));
    if (filters.ruleId) params.set('ruleId', filters.ruleId);
    if (filters.source) params.set('source', filters.source);

    window.open(`${serverUrl}/audit/export?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <AuditFilters
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStreamEnabled(!streamEnabled)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              streamEnabled && streamConnected
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : streamEnabled
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
            )}
          >
            {streamEnabled ? (
              <Radio className="h-3 w-3" />
            ) : (
              <Circle className="h-3 w-3" />
            )}
            {streamEnabled
              ? streamConnected
                ? 'Live'
                : 'Connecting...'
              : 'Live off'}
          </button>
          {streamEnabled && streamEntries.length > 0 && (
            <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              +{streamEntries.length} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Export:
          </span>
          <button
            type="button"
            onClick={() => handleExport('json')}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Download className="h-3 w-3" />
            JSON
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
      </div>

      {streamEnabled && streamEntries.length > 0 && (
        <StreamBanner entries={streamEntries} expandedId={expandedId} onToggle={setExpandedId} />
      )}

      {isLoading ? (
        <LoadingState message="Loading audit entries..." />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          title="No audit entries found"
          description="Adjust your filters or wait for engine activity"
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Category
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Type
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Summary
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Source
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.entries.map((entry) => (
                  <AuditRow
                    key={entry.id}
                    entry={entry}
                    expanded={expandedId === entry.id}
                    onToggle={() =>
                      setExpandedId((prev) =>
                        prev === entry.id ? null : entry.id,
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={data.totalCount}
            queryTimeMs={data.queryTimeMs}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function StreamBanner({
  entries,
  expandedId,
  onToggle,
}: {
  entries: AuditEntry[];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
}) {
  const recent = entries.slice(0, 10);

  return (
    <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="border-b border-emerald-200/50 px-4 py-2 dark:border-emerald-900/30">
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Real-time entries
        </span>
      </div>
      <table className="w-full min-w-[800px] text-left text-sm">
        <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/30">
          {recent.map((entry) => (
            <AuditRow
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() =>
                onToggle(expandedId === entry.id ? null : entry.id)
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const categoryColor =
    AUDIT_CATEGORY_COLORS[entry.category] ??
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

  return (
    <>
      <tr
        className="cursor-pointer bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
        onClick={onToggle}
      >
        <td className="px-2 py-3 text-slate-400">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
          {formatTimestamp(entry.timestamp)}
        </td>
        <td className="px-4 py-3">
          <span
            className={clsx(
              'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
              categoryColor,
            )}
          >
            {AUDIT_CATEGORY_LABELS[entry.category] ?? entry.category}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-slate-700 dark:text-slate-300">
            {AUDIT_EVENT_TYPE_LABELS[entry.type] ?? entry.type}
          </span>
        </td>
        <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
          {entry.summary}
        </td>
        <td className="px-4 py-3">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {entry.source}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {entry.durationMs != null ? formatMs(entry.durationMs) : '\u2014'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-900/70">
          <td colSpan={7} className="px-4 py-3">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  ID:{' '}
                  <code className="text-slate-700 dark:text-slate-300">
                    {entry.id}
                  </code>
                </span>
                {entry.ruleId && (
                  <span>
                    Rule:{' '}
                    <code className="text-slate-700 dark:text-slate-300">
                      {entry.ruleName ?? entry.ruleId}
                    </code>
                  </span>
                )}
                {entry.correlationId && (
                  <span>
                    Correlation:{' '}
                    <code className="text-slate-700 dark:text-slate-300">
                      {entry.correlationId}
                    </code>
                  </span>
                )}
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Pagination({
  page,
  totalPages,
  totalCount,
  queryTimeMs,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  queryTimeMs: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {totalCount} entries ({formatMs(queryTimeMs)})
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
          {page + 1} / {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
