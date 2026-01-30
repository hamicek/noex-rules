import { PageLayout } from '../components/layout/PageLayout';
import { GroupTable } from '../components/groups/GroupTable';

export function GroupsPage() {
  return (
    <PageLayout
      title="Groups"
      description="Organize rules into logical groups"
    >
      <GroupTable />
    </PageLayout>
  );
}
