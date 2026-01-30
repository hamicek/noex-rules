import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

interface TimerFormData {
  name: string;
  duration: string;
  topic: string;
  data: string;
  repeatInterval: string;
  repeatMaxCount: string;
}

interface TimerFormDialogProps {
  onSubmit: (data: Record<string, unknown>) => void;
  onClose: () => void;
  isPending: boolean;
}

export function TimerFormDialog({
  onSubmit,
  onClose,
  isPending,
}: TimerFormDialogProps) {
  const [dataError, setDataError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TimerFormData>({
    defaultValues: {
      name: '',
      duration: '15m',
      topic: '',
      data: '{}',
      repeatInterval: '',
      repeatMaxCount: '',
    },
  });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function onFormSubmit(form: TimerFormData) {
    setDataError(null);

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(form.data);
    } catch {
      setDataError('Invalid JSON');
      return;
    }

    const input: Record<string, unknown> = {
      name: form.name,
      duration: form.duration,
      onExpire: {
        topic: form.topic,
        data: parsedData,
      },
    };

    if (form.repeatInterval.trim()) {
      input.repeat = {
        interval: form.repeatInterval,
        maxCount: form.repeatMaxCount
          ? parseInt(form.repeatMaxCount, 10)
          : undefined,
      };
    }

    onSubmit(input);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      <div className="relative mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          New Timer
        </h3>

        <form
          onSubmit={handleSubmit(onFormSubmit)}
          className="mt-4 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Name
              </label>
              <input
                {...register('name', { required: 'Name is required' })}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="session-timeout"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Duration
              </label>
              <input
                {...register('duration', { required: 'Duration is required' })}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="15m, 1h, 7d"
              />
              {errors.duration && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.duration.message}
                </p>
              )}
            </div>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              On Expire
            </legend>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
                  Topic
                </label>
                <input
                  {...register('topic', { required: 'Topic is required' })}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                  placeholder="session.expired"
                />
                {errors.topic && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.topic.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
                  Data (JSON)
                </label>
                <textarea
                  {...register('data')}
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                  placeholder="{}"
                />
                {dataError && (
                  <p className="mt-1 text-xs text-red-600">{dataError}</p>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Repeat (optional)
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
                  Interval
                </label>
                <input
                  {...register('repeatInterval')}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                  placeholder="5m"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
                  Max Count
                </label>
                <input
                  {...register('repeatMaxCount')}
                  type="number"
                  min="1"
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                  placeholder="unlimited"
                />
              </div>
            </div>
          </fieldset>

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
              disabled={isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
