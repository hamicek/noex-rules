import { Activity, Server } from 'lucide-react';
import { clsx } from 'clsx';
import { useHealth } from '../../hooks/useEngineStats';
import { formatUptime } from '../../lib/formatters';
import { HEALTH_STATUS_BG, HEALTH_STATUS_COLORS } from '../../lib/constants';
import { LoadingState } from '../common/LoadingState';

export function EngineHealth() {
  const { data: health, isLoading, isError } = useHealth();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <LoadingState message="Connecting to engine..." />
      </div>
    );
  }

  if (isError || !health) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
            <Server className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Engine Unreachable
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">
              Cannot connect to the rule engine server
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
            <Activity className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {health.engine.name}
              </h3>
              <span className="flex items-center gap-1.5">
                <span
                  className={clsx(
                    'h-2 w-2 rounded-full',
                    HEALTH_STATUS_BG[health.status],
                  )}
                />
                <span
                  className={clsx(
                    'text-xs font-medium capitalize',
                    HEALTH_STATUS_COLORS[health.status],
                  )}
                >
                  {health.status}
                </span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              v{health.version} &middot; Uptime {formatUptime(health.uptime)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
