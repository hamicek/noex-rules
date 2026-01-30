import { useCallback, useEffect, useRef, useState } from 'react';
import { getServerUrl } from '../api/client';
import { MAX_EVENT_STREAM_SIZE } from '../lib/constants';
import type { EngineEvent } from '../types';

export interface UseEventStreamOptions {
  patterns?: string[];
  enabled?: boolean;
  maxSize?: number;
}

export interface UseEventStreamResult {
  events: EngineEvent[];
  isConnected: boolean;
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
  clear: () => void;
}

export function useEventStream(
  options: UseEventStreamOptions = {},
): UseEventStreamResult {
  const {
    patterns = ['*'],
    enabled = true,
    maxSize = MAX_EVENT_STREAM_SIZE,
  } = options;

  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const pausedRef = useRef(false);
  const bufferRef = useRef<EngineEvent[]>([]);

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
    const patternsParam = patterns.join(',');
    const url = `${serverUrl}/stream/events?patterns=${encodeURIComponent(patternsParam)}`;

    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => {
      setIsConnected(true);
    };

    source.onmessage = (e) => {
      try {
        const event: EngineEvent = JSON.parse(e.data);
        if (pausedRef.current) {
          bufferRef.current.push(event);
          if (bufferRef.current.length > maxSize) {
            bufferRef.current = bufferRef.current.slice(-maxSize);
          }
        } else {
          setEvents((prev) => {
            const next = [event, ...prev];
            return next.length > maxSize ? next.slice(0, maxSize) : next;
          });
        }
      } catch {
        // Ignore non-JSON messages (heartbeats, comments)
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
  }, [enabled, patterns.join(','), maxSize]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    bufferRef.current = [];
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    const buffered = bufferRef.current;
    bufferRef.current = [];
    setIsPaused(false);

    if (buffered.length > 0) {
      setEvents((prev) => {
        const next = [...buffered.reverse(), ...prev];
        return next.length > maxSize ? next.slice(0, maxSize) : next;
      });
    }
  }, [maxSize]);

  const clear = useCallback(() => {
    setEvents([]);
    bufferRef.current = [];
  }, []);

  return { events, isConnected, isPaused, pause, resume, clear };
}
