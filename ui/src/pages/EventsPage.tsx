import { PageLayout } from '../components/layout/PageLayout';
import { EventStream } from '../components/monitoring/EventStream';

export function EventsPage() {
  return (
    <PageLayout
      title="Events"
      description="Real-time event stream with filtering and test emission"
    >
      <EventStream />
    </PageLayout>
  );
}
