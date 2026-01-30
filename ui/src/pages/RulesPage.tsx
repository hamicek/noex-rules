import { PageLayout } from '../components/layout/PageLayout';
import { RuleTable } from '../components/rules/RuleTable';

export function RulesPage() {
  return (
    <PageLayout
      title="Rules"
      description="Manage registered rules"
    >
      <RuleTable />
    </PageLayout>
  );
}
