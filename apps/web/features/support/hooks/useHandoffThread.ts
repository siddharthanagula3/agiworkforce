'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SupportHandoffMessageView,
  SupportHandoffSendResult,
  SupportHandoffThreadPage,
} from '../lib/contract';

export interface HandoffThreadState {
  messages: SupportHandoffMessageView[];
  status: string | null;
  loading: boolean;
  sending: boolean;
  sendError: string | null;
  loadError: string | null;
  send: (body: string) => void;
  clearSendError: () => void;
}

export interface UseHandoffThreadOptions {
  sessionId: string | null;
  pollIntervalMs: number;
  load: (sessionId: string, after: number) => Promise<SupportHandoffThreadPage | null>;
  send: (sessionId: string, body: string) => Promise<SupportHandoffSendResult>;
}

function mergeMessages(
  current: SupportHandoffMessageView[],
  incoming: SupportHandoffMessageView[],
): SupportHandoffMessageView[] {
  if (incoming.length === 0) return current;
  const bySeq = new Map(current.map((message) => [message.seq, message]));
  for (const message of incoming) bySeq.set(message.seq, message);
  return [...bySeq.values()].sort((left, right) => left.seq - right.seq);
}

/**
 * Both sides of a live handoff read the same append-only message list, so the
 * cursor, the merge and the failure states live here once and the two surfaces
 * differ only in which routes they hand in and how they draw a turn.
 */
export function useHandoffThread(options: UseHandoffThreadOptions): HandoffThreadState {
  const { sessionId, pollIntervalMs, load, send } = options;
  const [messages, setMessages] = useState<SupportHandoffMessageView[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const cursor = useRef(0);
  const mounted = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    cursor.current = 0;
    setMessages([]);
    setStatus(null);
    setSendError(null);
    setLoadError(null);
  }, [sessionId]);

  const pull = useCallback(async (id: string) => {
    const page = await loadRef.current(id, cursor.current);
    if (!mounted.current) return;
    if (!page) {
      setLoadError('The conversation could not be read just now. Still trying.');
      return;
    }
    cursor.current = page.nextAfter;
    setStatus(page.status);
    setLoadError(null);
    setMessages((current) => mergeMessages(current, page.messages));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    void pull(sessionId).finally(() => {
      if (!cancelled && mounted.current) setLoading(false);
    });

    const interval = Math.max(1000, pollIntervalMs);
    const timer = window.setInterval(() => {
      void pull(sessionId);
    }, interval);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, pollIntervalMs, pull]);

  const submit = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!sessionId || trimmed.length === 0) return;
      setSending(true);
      setSendError(null);
      void sendRef.current(sessionId, trimmed).then((result) => {
        if (!mounted.current) return;
        setSending(false);
        if (!result.ok) {
          setSendError(result.message);
          return;
        }
        cursor.current = Math.max(cursor.current, result.message.seq);
        setMessages((current) => mergeMessages(current, [result.message]));
      });
    },
    [sessionId],
  );

  const clearSendError = useCallback(() => setSendError(null), []);

  return {
    messages,
    status,
    loading,
    sending,
    sendError,
    loadError,
    send: submit,
    clearSendError,
  };
}
