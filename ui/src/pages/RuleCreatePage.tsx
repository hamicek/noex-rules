import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Code } from 'lucide-react';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { PageLayout } from '../components/layout/PageLayout';
import { RuleForm } from '../components/rules/RuleForm';
import { RuleYamlEditor } from '../components/rules/RuleYamlEditor';
import { createRule } from '../api/queries/rules';

type TabId = 'form' | 'yaml';

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'form', label: 'Form', icon: FileText },
  { id: 'yaml', label: 'YAML', icon: Code },
];

export function RuleCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('form');

  const createMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => createRule(input),
    onSuccess: (rule) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule created');
      navigate({ to: '/rules/$ruleId', params: { ruleId: rule.id } });
    },
    onError: (err: Error) => {
      toast.error(`Failed to create rule: ${err.message}`);
    },
  });

  const handleSubmit = useCallback(
    (input: Record<string, unknown>) => {
      createMutation.mutate(input);
    },
    [createMutation],
  );

  const handleCancel = useCallback(() => {
    navigate({ to: '/rules' });
  }, [navigate]);

  return (
    <PageLayout
      title="Create Rule"
      description="Define a new rule with trigger, conditions, and actions"
      actions={
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
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

      {activeTab === 'form' ? (
        <RuleForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={createMutation.isPending}
        />
      ) : (
        <RuleYamlEditor
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={createMutation.isPending}
          isCreate
        />
      )}
    </PageLayout>
  );
}
