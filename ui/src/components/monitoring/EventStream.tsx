import { useState } from 'react';
import {
  Pause,
  Play,
  Trash2,
  Radio,
  Circle,
  ChevronDown,
  ChevronRight,
  Send,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEventStream } from '../../hooks/useEventStream';
import { SearchInput } from '../common/SearchInput';
import { EmptyState } from '../common/EmptyState';
import { formatTimestamp, formatJson } from '../../lib/formatters';
import { emitEvent } from '../../api/queries/events';
import type { EngineEvent } from '../../types';

export function EventStream() {
  const [patterns, setPatterns] = useState('*');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showEmit, setShowEmit] = useState(false);

  const parsedPatterns = patterns
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const { events, isConnected, isPaused, pause, resume, clear } =
    useEventStream({ patterns: parsedPatterns });

  const filtered = search
    ? events.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.topic.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          e.correlationId?.toLowerCase().includes(q) ||
          formatJson(e.data).toLowerCase().includes(q)
        );
      })
    : events;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-xs flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filter events by topic, source, data..."
          />
        </div>
        <PatternInput value={patterns} onChange={setPatterns} />
        <StreamControls
          isConnected={isConnected}
          isPaused={isPaused}
          eventCount={events.length}
          onPause={pause}
          onResume={resume}
          onClear={clear}
        />
        <button
          type="button"
          onClick={() => setShowEmit(!showEmit)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Send className="h-3.5 w-3.5" />
          Emit Event
        </button>
      </div>

      {showEmit && <EmitEventForm onClose={() => setShowEmit(false)} />}

      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No events match your filter' : 'No events yet'}
          description={
            search
              ? 'Try adjusting your search term'
              : isConnected
                ? 'Events will appear here in real-time as they are emitted'
                : 'Connect to the server to start receiving events'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Topic
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Source
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Correlation
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    expanded={expandedId === event.id}
                    onToggle={() =>
                      setExpandedId((prev) =>
                        prev === event.id ? null : event.id,
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PatternInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Patterns:
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:placeholder:text-slate-500"
        placeholder="e.g. order.*, *"
      />
    </div>
  );
}

function StreamControls({
  isConnected,
  isPaused,
  eventCount,
  onPause,
  onResume,
  onClear,
}: {
  isConnected: boolean;
  isPaused: boolean;
  eventCount: number;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          isConnected
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
        )}
      >
        {isConnected ? (
          <Radio className="h-3 w-3" />
        ) : (
          <Circle className="h-3 w-3" />
        )}
        {isConnected ? 'Live' : 'Disconnected'}
      </span>
      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {eventCount} events
      </span>
      <button
        type="button"
        onClick={isPaused ? onResume : onPause}
        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        title={isPaused ? 'Resume' : 'Pause'}
      >
        {isPaused ? (
          <Play className="h-4 w-4" />
        ) : (
          <Pause className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        title="Clear"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: EngineEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
        onClick={onToggle}
      >
        <td className="px-2 py-3 text-slate-400">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </td>
        <td className="px-4 py-3">
          <code className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {event.topic}
          </code>
        </td>
        <td className="px-4 py-3">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {event.source}
          </span>
        </td>
        <td className="px-4 py-3">
          {event.correlationId ? (
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {event.correlationId}
            </code>
          ) : (
            <span className="text-slate-400">{'\u2014'}</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
          {formatTimestamp(event.timestamp)}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-900/70">
          <td colSpan={5} className="px-4 py-3">
            <div className="space-y-2">
              <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  ID: <code className="text-slate-700 dark:text-slate-300">{event.id}</code>
                </span>
                {event.causationId && (
                  <span>
                    Causation:{' '}
                    <code className="text-slate-700 dark:text-slate-300">
                      {event.causationId}
                    </code>
                  </span>
                )}
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {JSON.stringify(event.data, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function EmitEventForm({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState('');
  const [dataStr, setDataStr] = useState('{}');
  const [jsonError, setJsonError] = useState('');

  const mutation = useMutation({
    mutationFn: (input: { topic: string; data?: unknown }) => emitEvent(input),
    onSuccess: (event) => {
      toast.success(`Event emitted: ${event.topic}`);
      onClose();
    },
    onError: () => {
      toast.error('Failed to emit event');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(dataStr);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON');
      return;
    }

    mutation.mutate({ topic: topic.trim(), data: parsedData });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
        Emit Test Event
      </h3>
      <div className="flex flex-wrap gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. order.created"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:placeholder:text-slate-500"
            required
          />
        </div>
        <div className="flex-[2]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Data (JSON)
          </label>
          <div className="relative">
            <input
              type="text"
              value={dataStr}
              onChange={(e) => {
                setDataStr(e.target.value);
                setJsonError('');
              }}
              className={clsx(
                'h-9 w-full rounded-lg border bg-white px-3 font-mono text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-1 dark:bg-slate-800 dark:placeholder:text-slate-500',
                jsonError
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500 dark:border-red-700'
                  : 'border-slate-200 focus:border-primary-500 focus:ring-primary-500 dark:border-slate-700',
              )}
            />
            {jsonError && (
              <p className="absolute -bottom-5 left-0 text-xs text-red-500">
                {jsonError}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={mutation.isPending || !topic.trim()}
            className="h-9 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Emitting...' : 'Emit'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
