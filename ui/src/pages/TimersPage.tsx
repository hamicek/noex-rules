import { PageLayout } from '../components/layout/PageLayout';
import { TimerTable } from '../components/timers/TimerTable';

export function TimersPage() {
  return (
    <PageLayout
      title="Timers"
      description="Active timers with real-time countdown"
    >
      <TimerTable />
    </PageLayout>
  );
}
