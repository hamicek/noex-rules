import { Menu, Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';
import { useServerConnection } from '../../hooks/useServerConnection';
import { useTheme } from '../../hooks/useTheme';

export interface HeaderProps {
  onMenuOpen?: () => void;
}

export function Header({ onMenuOpen }: HeaderProps) {
  const { status } = useServerConnection();
  const { theme, toggle } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenuOpen}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 md:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            status === 'connected' &&
              'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
            status === 'connecting' &&
              'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
            status === 'disconnected' &&
              'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
          )}
        >
          {status === 'disconnected' ? (
            <WifiOff className="h-3.5 w-3.5" />
          ) : (
            <Wifi className="h-3.5 w-3.5" />
          )}
          <span className="capitalize">{status}</span>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label={
            theme === 'dark'
              ? 'Switch to light mode'
              : 'Switch to dark mode'
          }
        >
          {theme === 'dark' ? (
            <Sun className="h-4.5 w-4.5" />
          ) : (
            <Moon className="h-4.5 w-4.5" />
          )}
        </button>
      </div>
    </header>
  );
}
