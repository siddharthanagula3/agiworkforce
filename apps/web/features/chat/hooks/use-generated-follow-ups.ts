'use client';

import { useEffect, useRef, useState } from 'react';
import { addCsrfHeaders } from '@/lib/client/csrf';

const NO_SUGGESTIONS: readonly string[] = [];

/**
 * Ask the server for the follow-ups grounded in one answer, at most once per
 * turn. The server caches its own result on the message, so a reload
 * costs a read rather than a second generation; the ref below keeps a single
 * mounted transcript from asking twice for the same turn.
 */
export function useGeneratedFollowUps(params: {
  conversationId: string | null | undefined;
  messageId: string | undefined;
  enabled: boolean;
  cached?: readonly string[] | undefined;
}): { suggestions: readonly string[]; pending: boolean } {
  const { conversationId, messageId, enabled, cached } = params;
  const [suggestions, setSuggestions] = useState<readonly string[]>(cached ?? NO_SUGGESTIONS);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    setSuggestions(cached ?? NO_SUGGESTIONS);
  }, [cached, messageId]);

  useEffect(() => {
    if (!enabled || !conversationId || !messageId) return;
    if (cached) return;
    if (requestedRef.current === messageId) return;
    requestedRef.current = messageId;
    setPendingMessageId(messageId);

    const controller = new AbortController();
    let settled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/follow-ups`,
          {
            method: 'POST',
            headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
            signal: controller.signal,
          },
        );
        if (!response.ok) return;
        const body = (await response.json()) as { suggestions?: unknown };
        const next = Array.isArray(body.suggestions)
          ? body.suggestions.filter((entry): entry is string => typeof entry === 'string')
          : [];
        if (next.length > 0) setSuggestions(next);
      } catch {
        // The static matcher still renders; a failed nicety must not surface
        // as an error over an answer the reader already has.
      } finally {
        settled = true;
        if (!controller.signal.aborted) setPendingMessageId(null);
      }
    })();

    return () => {
      controller.abort();
      if (settled) return;
      if (requestedRef.current === messageId) requestedRef.current = null;
      setPendingMessageId(null);
    };
  }, [cached, conversationId, enabled, messageId]);

  return {
    suggestions,
    pending: enabled && messageId !== undefined && pendingMessageId === messageId,
  };
}
