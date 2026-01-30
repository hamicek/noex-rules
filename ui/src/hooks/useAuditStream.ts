import { useCallback, useEffect, useRef, useState } from 'react';
import { getServerUrl } from '../api/client';
import type { AuditCategory, AuditEntry, AuditEventType } from '../types';

export interface UseAuditStreamOptions {
  categories?: AuditCategory[];
  types?: AuditEventType[];
  ruleIds?: string[];
  enabled?: boolean;
  maxSize?: number;
}

export interface UseAuditStreamResult {
  entries: AuditEntry[];
  isConnected: boolean;
  clear: () => void;
}

export function useAuditStream(
  options: UseAuditStreamOptions = {},
): UseAuditStreamResult {
  const {
    categories,
    types,
    ruleIds,
    enabled = true,
    maxSize = 200,
  } = options;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const filterKey = [
    categories?.join(',') ?? '',
    types?.join(',') ?? '',
    ruleIds?.join(',') ?? '',
  ].join('|');

  useEffect(() => {
    if (!enabled) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    const serverUrl = getServerUrl();
    const params = new URLSearchParams();
    if (categories?.length) params.set('categories', categories.join(','));
    if (types?.length) params.set('types', types.join(','));
    if (ruleIds?.length) params.set('ruleIds', ruleIds.join(','));

    const qs = params.toString();
    const url = `${serverUrl}/audit/stream${qs ? `?${qs}` : ''}`;

    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => {
      setIsConnected(true);
    };

    source.onmessage = (e) => {
      try {
        const entry: AuditEntry = JSON.parse(e.data);
        setEntries((prev) => {
          const next = [entry, ...prev];
          return next.length > maxSize ? next.slice(0, maxSize) : next;
        });
      } catch {
        // Ignore non-JSON messages
      }
    };

    source.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, filterKey, maxSize]);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, isConnected, clear };
}
