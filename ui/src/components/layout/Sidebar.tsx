import { useEffect, useRef, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  BookOpen,
  FolderTree,
  Database,
  Radio,
  Clock,
  ScrollText,
  Settings,
  PanelLeftClose,
  PanelLeft,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/rules', icon: BookOpen, label: 'Rules' },
  { to: '/groups', icon: FolderTree, label: 'Groups' },
  { to: '/facts', icon: Database, label: 'Facts' },
  { to: '/events', icon: Radio, label: 'Events' },
  { to: '/timers', icon: Clock, label: 'Timers' },
  { to: '/audit', icon: ScrollText, label: 'Audit Log' },
] as const;

const BOTTOM_ITEMS = [
  { to: '/settings', icon: Settings, label: 'Settings' },
] as const;

export interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Close mobile sidebar on route change
  const prevPathRef = useRef(currentPath);
  useEffect(() => {
    if (prevPathRef.current !== currentPath) {
      prevPathRef.current = currentPath;
      onMobileClose?.();
    }
  }, [currentPath, onMobileClose]);

  function renderNavItems(isCollapsed: boolean) {
    return (
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active =
            item.to === '/'
              ? currentPath === '/'
              : currentPath.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
                isCollapsed && 'justify-center px-0',
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        <div className="mt-auto">
          {BOTTOM_ITEMS.map((item) => {
            const active = currentPath.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
                  isCollapsed && 'justify-center px-0',
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'hidden h-screen flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex dark:border-slate-800 dark:bg-slate-900',
          collapsed ? 'w-16' : 'w-56',
        )}
      >
        <div className="flex h-14 items-center border-b border-slate-200 px-4 dark:border-slate-800">
          {!collapsed && (
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              noex-rules
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={clsx(
              'rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300',
              collapsed ? 'mx-auto' : 'ml-auto',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {renderNavItems(collapsed)}
      </aside>

      {/* Mobile sidebar overlay */}
      <div
        className={clsx(
          'fixed inset-0 z-40 md:hidden',
          mobileOpen ? '' : 'pointer-events-none',
        )}
      >
        {/* Backdrop */}
        <div
          className={clsx(
            'fixed inset-0 bg-slate-900/50 transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onMobileClose}
          aria-hidden="true"
        />

        {/* Sidebar panel */}
        <aside
          className={clsx(
            'relative flex h-full w-64 max-w-[calc(100%-3rem)] flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out dark:border-slate-800 dark:bg-slate-900',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              noex-rules
            </span>
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {renderNavItems(false)}
        </aside>
      </div>
    </>
  );
}
