import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { PageLayout } from '../components/layout/PageLayout';
import { RuleTable } from '../components/rules/RuleTable';

export function RulesPage() {
  return (
    <PageLayout
      title="Rules"
      description="Manage registered rules"
      actions={
        <Link
          to="/rules/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          New Rule
        </Link>
      }
    >
      <RuleTable />
    </PageLayout>
  );
}
