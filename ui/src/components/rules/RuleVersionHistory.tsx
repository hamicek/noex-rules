import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { History, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchRuleVersions,
  fetchRuleVersionDiff,
  rollbackRule,
} from '../../api/queries/versions';
import { VersionTimeline } from '../versions/VersionTimeline';
import { VersionDiff } from '../versions/VersionDiff';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';

interface RuleVersionHistoryProps {
  ruleId: string;
  currentVersion: number;
}

export function RuleVersionHistory({ ruleId, currentVersion }: RuleVersionHistoryProps) {
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<number | undefined>();
  const [compareVersion, setCompareVersion] = useState<number | undefined>();
  const [rollbackTarget, setRollbackTarget] = useState<number | undefined>();

  const {
    data: versionsResult,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['ruleVersions', ruleId],
    queryFn: () => fetchRuleVersions(ruleId, { limit: 100, order: 'desc' }),
  });

  const diffFrom = compareVersion ?? (selectedVersion != null ? selectedVersion - 1 : undefined);
  const diffTo = selectedVersion;
  const canDiff = diffFrom != null && diffTo != null && diffFrom > 0 && diffFrom !== diffTo;

  const { data: diff, isLoading: isDiffLoading } = useQuery({
    queryKey: ['ruleVersionDiff', ruleId, diffFrom, diffTo],
    queryFn: () => fetchRuleVersionDiff(ruleId, diffFrom!, diffTo!),
    enabled: canDiff,
  });

  const rollbackMutation = useMutation({
    mutationFn: (version: number) => rollbackRule(ruleId, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['ruleVersions', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setSelectedVersion(undefined);
      setCompareVersion(undefined);
      toast.success('Rule rolled back successfully');
    },
    onError: (err: Error) => {
      toast.error(`Rollback failed: ${err.message}`);
    },
  });

  const handleSelectVersion = useCallback((version: number) => {
    setSelectedVersion((prev) => (prev === version ? undefined : version));
    setCompareVersion(undefined);
  }, []);

  const handleCompareVersion = useCallback((version: number) => {
    setCompareVersion((prev) => (prev === version ? undefined : version));
  }, []);

  const handleRollback = useCallback((version: number) => {
    setRollbackTarget(version);
  }, []);

  const confirmRollback = useCallback(() => {
    if (rollbackTarget != null) {
      rollbackMutation.mutate(rollbackTarget);
      setRollbackTarget(undefined);
    }
  }, [rollbackTarget, rollbackMutation]);

  if (isLoading) {
    return <LoadingState message="Loading version history..." />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="Failed to load versions"
        description={error instanceof Error ? error.message : 'Unknown error'}
      />
    );
  }

  const entries = versionsResult?.entries ?? [];

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="No version history"
        description="Version history is not available for this rule. Versioning may not be configured on the server."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Timeline — left panel */}
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Version History
          </h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {versionsResult?.totalVersions ?? 0} versions
          </span>
        </div>
        <VersionTimeline
          entries={entries}
          currentVersion={currentVersion}
          selectedVersion={selectedVersion}
          compareVersion={compareVersion}
          onSelectVersion={handleSelectVersion}
          onCompareVersion={handleCompareVersion}
          onRollback={handleRollback}
        />
      </div>

      {/* Diff — right panel */}
      <div className="lg:col-span-3">
        {canDiff ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Changes
              </h3>
              {(selectedVersion != null || compareVersion != null) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVersion(undefined);
                    setCompareVersion(undefined);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Clear selection
                </button>
              )}
            </div>
            {isDiffLoading ? (
              <LoadingState message="Computing diff..." />
            ) : diff ? (
              <VersionDiff
                fromVersion={diff.fromVersion}
                toVersion={diff.toVersion}
                changes={diff.changes}
              />
            ) : (
              <EmptyState title="Diff unavailable" description="Could not compute the diff between selected versions." />
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<History className="h-10 w-10" />}
              title="Select a version"
              description="Click on a version in the timeline to view its snapshot and compare changes."
            />
          </div>
        )}
      </div>

      {/* Rollback confirmation */}
      <ConfirmDialog
        open={rollbackTarget != null}
        title="Rollback Rule"
        description={`Are you sure you want to rollback this rule to version ${rollbackTarget}? This will create a new version with the snapshot from v${rollbackTarget}.`}
        confirmLabel="Rollback"
        variant="danger"
        onConfirm={confirmRollback}
        onCancel={() => setRollbackTarget(undefined)}
      />
    </div>
  );
}
