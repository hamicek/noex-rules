import { useState, useCallback } from 'react';
import {
  Server,
  Palette,
  Monitor,
  Moon,
  Sun,
  Bell,
  BellOff,
  RotateCcw,
  Check,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { PageLayout } from '../components/layout/PageLayout';
import { useTheme } from '../hooks/useTheme';
import { useSettings, type RuleDetailView } from '../hooks/useSettings';
import { useServerConnection } from '../hooks/useServerConnection';
import { getServerUrl, setServerUrl } from '../api/client';

const RULE_VIEW_OPTIONS: { value: RuleDetailView; label: string; description: string }[] = [
  { value: 'form', label: 'Form', description: 'Structured form editor with field-level controls' },
  { value: 'yaml', label: 'YAML', description: 'Text-based YAML editor with syntax highlighting' },
  { value: 'flow', label: 'Flow', description: 'Visual flow diagram of trigger, conditions, and actions' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { settings, update, reset } = useSettings();
  const { status } = useServerConnection();

  const [serverUrlInput, setServerUrlInput] = useState(() => getServerUrl());
  const [serverUrlDirty, setServerUrlDirty] = useState(false);

  const handleServerUrlChange = useCallback((value: string) => {
    setServerUrlInput(value);
    setServerUrlDirty(value !== getServerUrl());
  }, []);

  const handleServerUrlSave = useCallback(() => {
    const trimmed = serverUrlInput.trim().replace(/\/+$/, '');
    setServerUrl(trimmed);
    setServerUrlInput(trimmed);
    setServerUrlDirty(false);
    toast.success('Server URL updated — reload to apply to all connections');
  }, [serverUrlInput]);

  const handleReset = useCallback(() => {
    reset();
    setTheme('light');
    toast.success('Settings restored to defaults');
  }, [reset, setTheme]);

  return (
    <PageLayout
      title="Settings"
      description="Configure the GUI application"
      actions={
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to defaults
        </button>
      }
    >
      <div className="space-y-6">
        <SettingsSection
          icon={<Server className="h-5 w-5" />}
          title="Server connection"
          description="API endpoint for the rule engine server"
        >
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="url"
                  value={serverUrlInput}
                  onChange={(e) => handleServerUrlChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && serverUrlDirty) handleServerUrlSave();
                  }}
                  placeholder="http://localhost:3000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-primary-400 dark:focus:ring-primary-400"
                />
              </div>
              <button
                type="button"
                onClick={handleServerUrlSave}
                disabled={!serverUrlDirty}
                className={clsx(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  serverUrlDirty
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
                )}
              >
                <Check className="h-4 w-4" />
                Save
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={clsx(
                  'inline-flex h-2 w-2 rounded-full',
                  status === 'connected' && 'bg-emerald-500',
                  status === 'connecting' && 'bg-amber-500',
                  status === 'disconnected' && 'bg-red-500',
                )}
              />
              <span className="capitalize text-slate-600 dark:text-slate-400">
                {status}
              </span>
              {status === 'connected' && getServerUrl() && (
                <a
                  href={`${getServerUrl()}/documentation`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  API docs
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={<Palette className="h-5 w-5" />}
          title="Theme"
          description="Choose a color scheme for the interface"
        >
          <div className="flex gap-3">
            <ThemeOption
              active={theme === 'light'}
              onClick={() => setTheme('light')}
              icon={<Sun className="h-5 w-5" />}
              label="Light"
            />
            <ThemeOption
              active={theme === 'dark'}
              onClick={() => setTheme('dark')}
              icon={<Moon className="h-5 w-5" />}
              label="Dark"
            />
          </div>
        </SettingsSection>

        <SettingsSection
          icon={<Monitor className="h-5 w-5" />}
          title="Display"
          description="Default views and pagination"
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Default rule detail view
              </label>
              <div className="grid grid-cols-3 gap-3">
                {RULE_VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update({ defaultRuleView: option.value })}
                    className={clsx(
                      'rounded-lg border p-3 text-left transition-colors',
                      settings.defaultRuleView === option.value
                        ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500 dark:border-primary-400 dark:bg-primary-950/30 dark:ring-primary-400'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600',
                    )}
                  >
                    <span
                      className={clsx(
                        'block text-sm font-medium',
                        settings.defaultRuleView === option.value
                          ? 'text-primary-700 dark:text-primary-300'
                          : 'text-slate-900 dark:text-slate-100',
                      )}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="pageSize"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Items per page
              </label>
              <select
                id="pageSize"
                value={settings.pageSize}
                onChange={(e) => update({ pageSize: Number(e.target.value) })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-primary-400 dark:focus:ring-primary-400"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={
            settings.notificationsEnabled ? (
              <Bell className="h-5 w-5" />
            ) : (
              <BellOff className="h-5 w-5" />
            )
          }
          title="Notifications"
          description="Toast notifications for rule engine events"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Rule execution notifications
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Show toast messages when rules are triggered, facts change, or errors occur
              </p>
            </div>
            <ToggleSwitch
              checked={settings.notificationsEnabled}
              onChange={(checked) => update({ notificationsEnabled: checked })}
              label="Enable notifications"
            />
          </div>
        </SettingsSection>
      </div>
    </PageLayout>
  );
}

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-slate-500 dark:text-slate-400">{icon}</span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function ThemeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2.5 rounded-lg border px-5 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500 dark:border-primary-400 dark:bg-primary-950/30 dark:text-primary-300 dark:ring-primary-400'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
        checked ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600',
      )}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
