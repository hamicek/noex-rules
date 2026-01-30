import { X } from 'lucide-react';
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_EVENT_TYPE_LABELS,
} from '../../lib/constants';
import type { AuditCategory, AuditEventType } from '../../types';

export interface AuditFilterValues {
  category?: AuditCategory;
  types: AuditEventType[];
  ruleId: string;
  source: string;
  correlationId: string;
}

interface AuditFiltersProps {
  filters: AuditFilterValues;
  onChange: (filters: AuditFilterValues) => void;
  onReset: () => void;
}

const ALL_CATEGORIES = Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[];
const ALL_EVENT_TYPES = Object.keys(
  AUDIT_EVENT_TYPE_LABELS,
) as AuditEventType[];

export function AuditFilters({
  filters,
  onChange,
  onReset,
}: AuditFiltersProps) {
  const hasActiveFilters =
    filters.category !== undefined ||
    filters.types.length > 0 ||
    filters.ruleId !== '' ||
    filters.source !== '' ||
    filters.correlationId !== '';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Filters
        </h3>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap">
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Category
          </label>
          <select
            value={filters.category ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                category: e.target.value
                  ? (e.target.value as AuditCategory)
                  : undefined,
              })
            }
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">All categories</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {AUDIT_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Event Type
          </label>
          <select
            value={filters.types[0] ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                types: e.target.value
                  ? [e.target.value as AuditEventType]
                  : [],
              })
            }
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">All types</option>
            {ALL_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {AUDIT_EVENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Rule ID
          </label>
          <input
            type="text"
            value={filters.ruleId}
            onChange={(e) => onChange({ ...filters, ruleId: e.target.value })}
            placeholder="Filter by rule"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Source
          </label>
          <input
            type="text"
            value={filters.source}
            onChange={(e) => onChange({ ...filters, source: e.target.value })}
            placeholder="Filter by source"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Correlation ID
          </label>
          <input
            type="text"
            value={filters.correlationId}
            onChange={(e) =>
              onChange({ ...filters, correlationId: e.target.value })
            }
            placeholder="Correlation ID"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:placeholder:text-slate-500"
          />
        </div>
      </div>
    </div>
  );
}
