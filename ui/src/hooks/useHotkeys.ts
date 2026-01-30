import { useEffect, useRef } from 'react';

export interface HotkeyBinding {
  /** Key or key sequence, e.g. 'g d', '?', 'b' */
  keys: string;
  handler: () => void;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

/**
 * Registers global keyboard shortcuts with support for two-key sequences.
 *
 * Sequences like 'g d' work by storing the first key press and matching
 * the second within a 1500ms window. Single-key bindings fire immediately.
 * All bindings are suppressed when focus is on an editable element or when
 * Ctrl/Meta/Alt modifiers are held.
 */
export function useHotkeys(bindings: HotkeyBinding[]) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const pendingRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key;
      const current = bindingsRef.current;

      // Attempt sequence completion when a prefix key is pending
      if (pendingRef.current !== null) {
        const combo = `${pendingRef.current} ${key}`;
        pendingRef.current = null;
        clearTimeout(timeoutRef.current);

        const match = current.find((b) => b.keys === combo);
        if (match) {
          event.preventDefault();
          match.handler();
          return;
        }
        // No sequence match — fall through to single-key check
      }

      // Single-key bindings (keys without a space separator)
      const singleMatch = current.find(
        (b) => b.keys === key && !b.keys.includes(' '),
      );
      if (singleMatch) {
        event.preventDefault();
        singleMatch.handler();
        return;
      }

      // Check if this key starts a multi-key sequence
      const isPrefix = current.some((b) => b.keys.startsWith(key + ' '));
      if (isPrefix) {
        pendingRef.current = key;
        timeoutRef.current = setTimeout(() => {
          pendingRef.current = null;
        }, 1500);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeoutRef.current);
    };
  }, []);
}
