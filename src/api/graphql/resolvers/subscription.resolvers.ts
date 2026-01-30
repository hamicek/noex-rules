import type { GraphQLContext } from '../context.js';
import type { Event } from '../../../types/event.js';
import type { AuditEntry, AuditCategory, AuditEventType } from '../../../audit/types.js';

// ─── Argument types ──────────────────────────────────────────────────────────

interface EngineEventArgs {
  patterns: string[];
}

interface AuditEventArgs {
  categories?: AuditCategory[];
  types?: AuditEventType[];
  ruleIds?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a simple push-based async iterable backed by a queue.
 *
 * Handlers push items into the queue; the consumer pulls them via
 * `for await`. Calling `close()` terminates the iterable and
 * runs all registered teardown callbacks.
 */
function createPushIterator<T>(): {
  iterator: AsyncIterableIterator<T>;
  push: (value: T) => void;
  close: () => void;
  onClose: (fn: () => void) => void;
} {
  const queue: T[] = [];
  const teardowns: Array<() => void> = [];
  let resolve: (() => void) | null = null;
  let closed = false;

  const iterator: AsyncIterableIterator<T> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next(): Promise<IteratorResult<T>> {
      while (!closed) {
        if (queue.length > 0) {
          return { value: queue.shift()!, done: false };
        }
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
      return { value: undefined as unknown as T, done: true };
    },
    return(): Promise<IteratorResult<T>> {
      close();
      return Promise.resolve({ value: undefined as unknown as T, done: true });
    },
  };

  function push(value: T): void {
    if (closed) return;
    queue.push(value);
    resolve?.();
    resolve = null;
  }

  function close(): void {
    if (closed) return;
    closed = true;
    for (const fn of teardowns) fn();
    teardowns.length = 0;
    resolve?.();
    resolve = null;
  }

  function onClose(fn: () => void): void {
    if (closed) {
      fn();
    } else {
      teardowns.push(fn);
    }
  }

  return { iterator, push, close, onClose };
}

/**
 * Returns true when the audit entry passes all supplied filter criteria.
 * Empty/undefined filter arrays are treated as "accept all".
 */
function matchesAuditFilter(entry: AuditEntry, args: AuditEventArgs): boolean {
  if (args.categories && args.categories.length > 0) {
    if (!args.categories.includes(entry.category)) return false;
  }
  if (args.types && args.types.length > 0) {
    if (!args.types.includes(entry.type)) return false;
  }
  if (args.ruleIds && args.ruleIds.length > 0) {
    if (!entry.ruleId || !args.ruleIds.includes(entry.ruleId)) return false;
  }
  return true;
}

// ─── Resolvers ───────────────────────────────────────────────────────────────

export const subscriptionResolvers = {
  Subscription: {
    engineEvent: {
      subscribe: (
        _: unknown,
        args: EngineEventArgs,
        ctx: GraphQLContext,
      ): AsyncIterableIterator<{ engineEvent: Event }> => {
        const patterns = args.patterns ?? ['*'];
        const { iterator, push, onClose } = createPushIterator<{ engineEvent: Event }>();

        const unsubscribers = patterns.map((pattern) =>
          ctx.engine.subscribe(pattern, (event: Event) => {
            push({ engineEvent: event });
          }),
        );

        onClose(() => {
          for (const unsub of unsubscribers) unsub();
        });

        return iterator;
      },
    },

    auditEvent: {
      subscribe: (
        _: unknown,
        args: AuditEventArgs,
        ctx: GraphQLContext,
      ): AsyncIterableIterator<{ auditEvent: AuditEntry }> => {
        const log = ctx.engine.getAuditLog();
        const { iterator, push, close, onClose } = createPushIterator<{ auditEvent: AuditEntry }>();

        if (!log) {
          // No audit subsystem — immediately close the stream.
          close();
          return iterator;
        }

        const unsub = log.subscribe((entry: AuditEntry) => {
          if (matchesAuditFilter(entry, args)) {
            push({ auditEvent: entry });
          }
        });

        onClose(unsub);

        return iterator;
      },
    },
  },
};
