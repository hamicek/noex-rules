import {
  BookOpen,
  Database,
  Clock,
  Zap,
  CheckCircle2,
  Gauge,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useStats } from '../../hooks/useEngineStats';
import { formatNumber, formatMs } from '../../lib/formatters';
import { ErrorState } from '../common/ErrorState';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  iconBg: string;
  iconColor: string;
}

function StatCard({ icon, label, value, iconBg, iconColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            iconBg,
          )}
        >
          <div className={iconColor}>{icon}</div>
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {value}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function StatsCards() {
  const { data: stats, isLoading, isError, refetch } = useStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[76px] animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load stats"
        message="Could not fetch engine statistics."
        onRetry={() => refetch()}
        className="py-8"
      />
    );
  }

  const cards = [
    {
      icon: <BookOpen className="h-5 w-5" />,
      label: 'Rules',
      value: formatNumber(stats?.rulesCount ?? 0),
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      icon: <Database className="h-5 w-5" />,
      label: 'Facts',
      value: formatNumber(stats?.factsCount ?? 0),
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      icon: <Clock className="h-5 w-5" />,
      label: 'Active Timers',
      value: formatNumber(stats?.timersCount ?? 0),
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      icon: <Zap className="h-5 w-5" />,
      label: 'Events Processed',
      value: formatNumber(stats?.eventsProcessed ?? 0),
      iconBg: 'bg-purple-100 dark:bg-purple-900/40',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      icon: <CheckCircle2 className="h-5 w-5" />,
      label: 'Rules Executed',
      value: formatNumber(stats?.rulesExecuted ?? 0),
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/40',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
    },
    {
      icon: <Gauge className="h-5 w-5" />,
      label: 'Avg Latency',
      value: formatMs(stats?.avgProcessingTimeMs ?? 0),
      iconBg: 'bg-rose-100 dark:bg-rose-900/40',
      iconColor: 'text-rose-600 dark:text-rose-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  );
}
