import { useState, useCallback, useMemo } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useNavigate,
} from '@tanstack/react-router';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { KeyboardShortcutsDialog } from './components/common/KeyboardShortcutsDialog';
import { useHotkeys, type HotkeyBinding } from './hooks/useHotkeys';
import { DashboardPage } from './pages/DashboardPage';
import { RulesPage } from './pages/RulesPage';
import { RuleDetailPage } from './pages/RuleDetailPage';
import { RuleCreatePage } from './pages/RuleCreatePage';
import { GroupsPage } from './pages/GroupsPage';
import { FactsPage } from './pages/FactsPage';
import { TimersPage } from './pages/TimersPage';
import { EventsPage } from './pages/EventsPage';
import { AuditPage } from './pages/AuditPage';
import { SettingsPage } from './pages/SettingsPage';

function RootLayout() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarCollapsed((c) => !c), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  const goTo = useCallback(
    (path: string) => {
      setShortcutsOpen(false);
      navigate({ to: path });
    },
    [navigate],
  );

  const bindings = useMemo<HotkeyBinding[]>(
    () => [
      // Navigation (g + key)
      { keys: 'g d', handler: () => goTo('/') },
      { keys: 'g r', handler: () => goTo('/rules') },
      { keys: 'g n', handler: () => goTo('/rules/new') },
      { keys: 'g g', handler: () => goTo('/groups') },
      { keys: 'g f', handler: () => goTo('/facts') },
      { keys: 'g e', handler: () => goTo('/events') },
      { keys: 'g t', handler: () => goTo('/timers') },
      { keys: 'g a', handler: () => goTo('/audit') },
      { keys: 'g s', handler: () => goTo('/settings') },
      // General
      { keys: '?', handler: () => setShortcutsOpen((prev) => !prev) },
      { keys: 'b', handler: toggleSidebar },
    ],
    [goTo, toggleSidebar],
  );

  useHotkeys(bindings);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={closeMobileMenu}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onMenuOpen={() => setMobileMenuOpen(true)}
          onShortcutsOpen={openShortcuts}
        />
        <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />
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
  component: EventsPage,
});

const timersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/timers',
  component: TimersPage,
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit',
  component: AuditPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
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
