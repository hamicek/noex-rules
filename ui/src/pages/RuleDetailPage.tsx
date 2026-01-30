import { useState, useCallback } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Code, Workflow, History, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { PageLayout } from '../components/layout/PageLayout';
import { RuleForm } from '../components/rules/RuleForm';
import { RuleYamlEditor } from '../components/rules/RuleYamlEditor';
import { RuleFlowView } from '../components/rules/RuleFlowView';
import { RuleVersionHistory } from '../components/rules/RuleVersionHistory';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { LoadingState } from '../components/common/LoadingState';
import { EmptyState } from '../components/common/EmptyState';
import {
  fetchRule,
  updateRule,
  deleteRule,
} from '../api/queries/rules';

type TabId = 'form' | 'yaml' | 'flow' | 'history';

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'form', label: 'Form', icon: FileText },
  { id: 'yaml', label: 'YAML', icon: Code },
  { id: 'flow', label: 'Flow', icon: Workflow },
  { id: 'history', label: 'History', icon: History },
];

export function RuleDetailPage() {
  const { ruleId } = useParams({ strict: false }) as { ruleId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('form');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    data: rule,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['rule', ruleId],
    queryFn: () => fetchRule(ruleId),
    enabled: !!ruleId,
  });

  const updateMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      updateRule(ruleId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule updated');
    },
    onError: (err: Error) => {
      toast.error(`Failed to update rule: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule deleted');
      navigate({ to: '/rules' });
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete rule: ${err.message}`);
    },
  });

  const handleSubmit = useCallback(
    (input: Record<string, unknown>) => {
      updateMutation.mutate(input);
    },
    [updateMutation],
  );

  const handleCancel = useCallback(() => {
    navigate({ to: '/rules' });
  }, [navigate]);

  if (isLoading) {
    return (
      <PageLayout title="Rule Detail">
        <LoadingState message="Loading rule..." />
      </PageLayout>
    );
  }

  if (error || !rule) {
    return (
      <PageLayout title="Rule Detail">
        <EmptyState
          title="Rule not found"
          description={`No rule with ID "${ruleId}"`}
          action={
            <button
              type="button"
              onClick={() => navigate({ to: '/rules' })}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Back to Rules
            </button>
          }
        />
      </PageLayout>
    );
  }

  function renderTabContent() {
    switch (activeTab) {
      case 'form':
        return (
          <RuleForm
            rule={rule!}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={updateMutation.isPending}
          />
        );
      case 'yaml':
        return (
          <RuleYamlEditor
            rule={rule!}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={updateMutation.isPending}
          />
        );
      case 'flow':
        return <RuleFlowView rule={rule!} />;
      case 'history':
        return (
          <RuleVersionHistory
            ruleId={rule!.id}
            currentVersion={rule!.version}
          />
        );
    }
  }

  return (
    <PageLayout
      title={rule.name}
      description={rule.description || `Rule ${rule.id} (v${rule.version})`}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: '/rules' })}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      }
    >
      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300',
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {renderTabContent()}

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete Rule"
        description={`Are you sure you want to delete "${rule.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setShowDeleteDialog(false);
          deleteMutation.mutate();
        }}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </PageLayout>
  );
}
