import { PageLayout } from '../components/layout/PageLayout';
import { FactTable } from '../components/facts/FactTable';

export function FactsPage() {
  return (
    <PageLayout
      title="Facts"
      description="Browse and edit working memory"
    >
      <FactTable />
    </PageLayout>
  );
}
