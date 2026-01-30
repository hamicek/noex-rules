import { useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutItem {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  label: string;
  items: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigation',
    items: [
      { keys: 'g d', description: 'Go to Dashboard' },
      { keys: 'g r', description: 'Go to Rules' },
      { keys: 'g n', description: 'Go to New Rule' },
      { keys: 'g g', description: 'Go to Groups' },
      { keys: 'g f', description: 'Go to Facts' },
      { keys: 'g e', description: 'Go to Events' },
      { keys: 'g t', description: 'Go to Timers' },
      { keys: 'g a', description: 'Go to Audit Log' },
      { keys: 'g s', description: 'Go to Settings' },
    ],
  },
  {
    label: 'General',
    items: [
      { keys: '?', description: 'Show keyboard shortcuts' },
      { keys: 'b', description: 'Toggle sidebar' },
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({
  open,
  onClose,
}: KeyboardShortcutsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Keyboard shortcuts
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between rounded-lg px-3 py-1.5"
                  >
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {shortcut.description}
                    </span>
                    <KeyCombo keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
          Press{' '}
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
            Esc
          </kbd>{' '}
          to close
        </p>
      </div>
    </div>
  );
}

function KeyCombo({ keys }: { keys: string }) {
  const parts = keys.split(' ');
  return (
    <kbd className="inline-flex gap-1">
      {parts.map((part, i) => (
        <span
          key={i}
          className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {part}
        </span>
      ))}
    </kbd>
  );
}
