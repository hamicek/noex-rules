import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardPage } from './pages/DashboardPage';
import { RulesPage } from './pages/RulesPage';
import { RuleDetailPage } from './pages/RuleDetailPage';
import { RuleCreatePage } from './pages/RuleCreatePage';
import { GroupsPage } from './pages/GroupsPage';
import { FactsPage } from './pages/FactsPage';
import { TimersPage } from './pages/TimersPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

function RootLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules',
  component: RulesPage,
});

const ruleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules/$ruleId',
  component: RuleDetailPage,
});

const ruleCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules/new',
  component: RuleCreatePage,
});

const groupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/groups',
  component: GroupsPage,
});

const factsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/facts',
  component: FactsPage,
});

const eventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/events',
  component: () => <PlaceholderPage title="Events" />,
});

const timersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/timers',
  component: TimersPage,
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit',
  component: () => <PlaceholderPage title="Audit Log" />,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: () => <PlaceholderPage title="Settings" />,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  rulesRoute,
  ruleCreateRoute,
  ruleDetailRoute,
  groupsRoute,
  factsRoute,
  eventsRoute,
  timersRoute,
  auditRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
