import { Construction } from 'lucide-react';
import { PageLayout } from '../components/layout/PageLayout';
import { EmptyState } from '../components/common/EmptyState';

interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <PageLayout title={title}>
      <EmptyState
        icon={<Construction className="h-10 w-10" />}
        title="Coming soon"
        description={`The ${title} page is under construction.`}
      />
    </PageLayout>
  );
}
