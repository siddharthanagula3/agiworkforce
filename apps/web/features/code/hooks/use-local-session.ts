'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalDeveloperSession } from '@agiworkforce/local-runtime-contract';
import type { DeveloperMessage } from '@agiworkforce/types/protocol';
import {
  answerDeveloperApproval,
  interruptDeveloperTurn,
  onDeveloperSessionEvent,
  readDeveloperSession,
  startDeveloperTurn,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { EMPTY_LOCAL_TURN, LOCAL_CODE_COPY, type LocalTurn } from '../local-code';

export interface LocalApproval {
  turnId: string;
  requestId: string;
  summary: string;
  detail: string;
}

export interface LocalSessionState {
  messages: DeveloperMessage[];
  truncated: boolean;
  turn: LocalTurn;
  approval: LocalApproval | null;
  loading: boolean;
  sending: boolean;
  stopping: boolean;
  error: string | null;
  send: (text: string, model?: string) => Promise<void>;
  stop: () => Promise<void>;
  decideApproval: (approved: boolean) => Promise<void>;
}

/**
 * One local coding session: its stored transcript, and the turn in flight.
 *
 * The turn outlives the request that starts it, so the reply, the tool rows and
 * any approval arrive over the runtime event stream rather than in that
 * promise. When a turn ends the transcript is read again and the live turn is
 * dropped, so the reply is shown once rather than twice.
 */
export function useLocalSession(session: LocalDeveloperSession | null): LocalSessionState {
  const [messages, setMessages] = useState<DeveloperMessage[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [turn, setTurn] = useState<LocalTurn>(EMPTY_LOCAL_TURN);
  const [approval, setApproval] = useState<LocalApproval | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnRef = useRef<LocalTurn>(EMPTY_LOCAL_TURN);

  turnRef.current = turn;

  const rootId = session?.rootId ?? null;
  const threadId = session?.id ?? null;

  const load = useCallback(async () => {
    if (!rootId || !threadId) return;
    setLoading(true);
    try {
      const transcript = await readDeveloperSession(rootId, threadId);
      setMessages(transcript.messages);
      setTruncated(transcript.truncated);
      setError(null);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.readFailed));
    } finally {
      setLoading(false);
    }
  }, [rootId, threadId]);

  useEffect(() => {
    setMessages([]);
    setTruncated(false);
    setTurn(EMPTY_LOCAL_TURN);
    setApproval(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!rootId || !threadId) return;
    return onDeveloperSessionEvent((eventRootId, event) => {
      if (eventRootId !== rootId) return;
      if (event.type === 'runtime-stopped') {
        setError(LOCAL_CODE_COPY.runtimeStopped);
        setTurn((current) => (current.outcome ? current : { ...current, outcome: 'failed' }));
        return;
      }
      if (event.threadId !== threadId) return;

      if (event.type === 'turn-started') {
        setTurn((current) => ({ ...current, turnId: event.turnId, outcome: null, error: null }));
        return;
      }
      if (event.type === 'output-delta') {
        setTurn((current) => ({ ...current, reply: current.reply + event.delta }));
        return;
      }
      if (event.type === 'tool-started') {
        setTurn((current) => ({
          ...current,
          tools: [
            ...current.tools,
            {
              toolCallId: event.toolCallId,
              name: event.name,
              summary: event.summary,
              output: '',
              isError: false,
            },
          ],
        }));
        return;
      }
      if (event.type === 'tool-finished') {
        setTurn((current) => ({
          ...current,
          tools: current.tools.map((tool) =>
            tool.toolCallId === event.toolCallId
              ? { ...tool, output: event.output, isError: event.isError }
              : tool,
          ),
        }));
        return;
      }
      if (event.type === 'approval-requested') {
        setApproval({
          turnId: event.turnId,
          requestId: event.requestId,
          summary: event.summary,
          detail: event.detail,
        });
        return;
      }
      if (event.type === 'approval-answered') {
        setApproval((current) => (current?.requestId === event.requestId ? null : current));
        return;
      }
      if (event.type === 'turn-finished') {
        setApproval(null);
        setTurn((current) => ({
          ...current,
          outcome: event.outcome,
          reply: current.reply === '' ? event.response : current.reply,
          failure: event.failure,
        }));
        // A completed turn is in the store, so the transcript is read again and
        // the live copy dropped. A turn that failed or was stopped is not: its
        // reply, its reason and its error exist only here, and clearing it
        // would leave the reader looking at a turn that silently vanished.
        if (event.outcome !== 'completed') return;
        void load().then(() => setTurn(EMPTY_LOCAL_TURN));
      }
    });
  }, [rootId, threadId, load]);

  const send = useCallback(
    async (text: string, model?: string) => {
      if (!rootId || !threadId || text.trim() === '') return;
      setSending(true);
      setError(null);
      setTurn({ ...EMPTY_LOCAL_TURN, prompt: text });
      try {
        const { turnId } = await startDeveloperTurn({
          rootId,
          threadId,
          text,
          ...(model ? { model } : {}),
        });
        setTurn((current) => ({ ...current, turnId }));
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.turnFailed));
        setTurn(EMPTY_LOCAL_TURN);
      } finally {
        setSending(false);
      }
    },
    [rootId, threadId],
  );

  const stop = useCallback(async () => {
    const turnId = turnRef.current.turnId;
    if (!rootId || !threadId || !turnId) return;
    setStopping(true);
    try {
      await interruptDeveloperTurn(rootId, threadId, turnId);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.turnFailed));
    } finally {
      setStopping(false);
    }
  }, [rootId, threadId]);

  const decideApproval = useCallback(
    async (approved: boolean) => {
      if (!rootId || !threadId || !approval) return;
      try {
        await answerDeveloperApproval({
          rootId,
          threadId,
          turnId: approval.turnId,
          requestId: approval.requestId,
          approved,
        });
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.turnFailed));
      }
    },
    [rootId, threadId, approval],
  );

  return {
    messages,
    truncated,
    turn,
    approval,
    loading,
    sending,
    stopping,
    error,
    send,
    stop,
    decideApproval,
  };
}
