import React, { useEffect, useRef, useState } from 'react';

export const STREAM_ANNOUNCE_INTERVAL_MS = 2000;

// A token is not a word. Announcing up to the last whitespace keeps a screen
// reader from reading half a word and then the same word again a moment later.
function wordBoundedDelta(source: string, from: number): string {
  const pending = source.slice(from);
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    if (/\s/.test(pending[i] ?? '')) return pending.slice(0, i + 1);
  }
  return '';
}

/**
 * The text a polite live region should carry for a message that is streaming.
 * Each tick announces only what arrived since the last one, so the reader hears
 * the answer once as it lands rather than the whole message on every token.
 */
export function useStreamAnnouncement(
  text: string,
  isStreaming: boolean,
  intervalMs: number = STREAM_ANNOUNCE_INTERVAL_MS,
): string {
  const [announcement, setAnnouncement] = useState('');
  const latestRef = useRef(text);
  const consumedRef = useRef(0);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    latestRef.current = text;
  }, [text]);

  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      const ready = wordBoundedDelta(latestRef.current, consumedRef.current);
      if (!ready.trim()) return;
      consumedRef.current += ready.length;
      setAnnouncement(ready.trim());
    }, intervalMs);
    return () => clearInterval(id);
  }, [isStreaming, intervalMs]);

  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (!wasStreamingRef.current) {
      consumedRef.current = latestRef.current.length;
      return;
    }
    wasStreamingRef.current = false;
    const tail = latestRef.current.slice(consumedRef.current).trim();
    consumedRef.current = latestRef.current.length;
    if (tail) setAnnouncement(tail);
  }, [isStreaming]);

  return announcement;
}

export interface StreamAnnouncerProps {
  /** The full text rendered so far, which the announcer reads the tail of. */
  text: string;
  isStreaming: boolean;
  announceIntervalMs?: number;
  children: React.ReactNode;
}

export function StreamAnnouncer({
  text,
  isStreaming,
  announceIntervalMs,
  children,
}: StreamAnnouncerProps) {
  const announcement = useStreamAnnouncement(text, isStreaming, announceIntervalMs);
  return (
    <>
      {children}
      <span
        data-testid="stream-announcer"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </span>
    </>
  );
}
