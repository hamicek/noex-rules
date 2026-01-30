import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { setFact } from '../../api/queries/facts';
import type { Fact } from '../../types';

interface FactEditorProps {
  fact?: Fact;
  onClose: () => void;
}

export function FactEditor({ fact, onClose }: FactEditorProps) {
  const isEdit = !!fact;
  const queryClient = useQueryClient();
  const [key, setKey] = useState(fact?.key ?? '');
  const [valueStr, setValueStr] = useState(
    fact ? JSON.stringify(fact.value, null, 2) : '',
  );
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: ({ k, v }: { k: string; v: unknown }) => setFact(k, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facts'] });
      onClose();
      toast.success(isEdit ? 'Fact updated' : 'Fact created');
    },
    onError: () => {
      toast.error('Failed to save fact');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setParseError(null);

    if (!key.trim()) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(valueStr);
    } catch {
      setParseError('Invalid JSON value');
      return;
    }

    mutation.mutate({ k: key, v: parsed });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      <div className="relative mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {isEdit ? 'Edit Fact' : 'Set Fact'}
        </h3>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Key
            </label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isEdit}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:disabled:bg-slate-800/50"
              placeholder="customer:123:tier"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Value (JSON)
            </label>
            <textarea
              value={valueStr}
              onChange={(e) => {
                setValueStr(e.target.value);
                setParseError(null);
              }}
              rows={6}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
              placeholder='{"tier": "gold", "since": "2024-01-01"}'
              required
            />
            {parseError && (
              <p className="mt-1 text-xs text-red-600">{parseError}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : isEdit ? 'Update' : 'Set'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
