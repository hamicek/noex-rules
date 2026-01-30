import { PageLayout } from '../components/layout/PageLayout';
import { AuditTable } from '../components/audit/AuditTable';

export function AuditPage() {
  return (
    <PageLayout
      title="Audit Log"
      description="Searchable history of all engine operations with real-time streaming"
    >
      <AuditTable />
    </PageLayout>
  );
}
