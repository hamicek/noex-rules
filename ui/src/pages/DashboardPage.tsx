import { PageLayout } from '../components/layout/PageLayout';
import { EngineHealth } from '../components/monitoring/EngineHealth';
import { StatsCards } from '../components/monitoring/StatsCards';

export function DashboardPage() {
  return (
    <PageLayout
      title="Dashboard"
      description="Engine overview and key metrics"
    >
      <div className="space-y-6">
        <EngineHealth />
        <StatsCards />
      </div>
    </PageLayout>
  );
}
