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

const FENCE_LINE = /^[ \t]{0,3}(?:`{3,}|~{3,}).*$/gm;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK = /\[([^\]]+)\]\([^)]*\)/g;
const HEADING_MARK = /^[ \t]{0,3}#{1,6}[ \t]+/gm;
const QUOTE_MARK = /^[ \t]{0,3}>[ \t]?/gm;
const LIST_MARK = /^[ \t]*(?:[-*+]|\d{1,3}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm;
const TABLE_RULE = /^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|?)+[ \t]*$/gm;
const PAIRED_MARKS = /\*\*|__|~~|`+/g;
const OPENING_EMPHASIS = /(^|[\s(])[*_](?=\S)/g;
const CLOSING_EMPHASIS = /(?<=\S)[*_](?=[\s).,;:!?]|$)/g;

export function speakableText(markdown: string): string {
  return markdown
    .replace(FENCE_LINE, '')
    .replace(TABLE_RULE, '')
    .replace(IMAGE, '$1')
    .replace(LINK, '$1')
    .replace(HEADING_MARK, '')
    .replace(QUOTE_MARK, '')
    .replace(LIST_MARK, '')
    .replace(/\|/g, ' ')
    .replace(PAIRED_MARKS, '')
    .replace(OPENING_EMPHASIS, '$1')
    .replace(CLOSING_EMPHASIS, '')
    .replace(/[ \t]{2,}/g, ' ');
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
      const spoken = speakableText(ready).trim();
      if (spoken) setAnnouncement(spoken);
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
    const tail = speakableText(latestRef.current.slice(consumedRef.current)).trim();
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
  const [hasStreamed, setHasStreamed] = useState(isStreaming);
  if (isStreaming && !hasStreamed) setHasStreamed(true);
  return (
    <>
      {children}
      {hasStreamed && (
        <span
          data-testid="stream-announcer"
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </span>
      )}
    </>
  );
}
