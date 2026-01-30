import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import type { RuleGroup } from '../../types';

interface GroupFormData {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface GroupFormDialogProps {
  group?: RuleGroup;
  onSubmit: (data: Record<string, unknown>) => void;
  onClose: () => void;
  isPending: boolean;
}

export function GroupFormDialog({
  group,
  onSubmit,
  onClose,
  isPending,
}: GroupFormDialogProps) {
  const isEdit = !!group;
  const backdropRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GroupFormData>({
    defaultValues: {
      id: group?.id ?? '',
      name: group?.name ?? '',
      description: group?.description ?? '',
      enabled: group?.enabled ?? true,
    },
  });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function onFormSubmit(data: GroupFormData) {
    if (isEdit) {
      onSubmit({
        name: data.name,
        description: data.description || undefined,
        enabled: data.enabled,
      });
    } else {
      onSubmit({
        id: data.id,
        name: data.name,
        description: data.description || undefined,
        enabled: data.enabled,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      <div className="relative mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {isEdit ? 'Edit Group' : 'New Group'}
        </h3>

        <form
          onSubmit={handleSubmit(onFormSubmit)}
          className="mt-4 space-y-4"
        >
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                ID
              </label>
              <input
                {...register('id', { required: 'ID is required' })}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="my-group"
              />
              {errors.id && (
                <p className="mt-1 text-xs text-red-600">{errors.id.message}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Name
            </label>
            <input
              {...register('name', { required: 'Name is required' })}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
              placeholder="My Group"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Description
            </label>
            <textarea
              {...register('description')}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
              placeholder="Optional description..."
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              {...register('enabled')}
              id="group-enabled"
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <label
              htmlFor="group-enabled"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              Enabled
            </label>
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
              disabled={isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending
                ? isEdit
                  ? 'Saving...'
                  : 'Creating...'
                : isEdit
                  ? 'Save'
                  : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
