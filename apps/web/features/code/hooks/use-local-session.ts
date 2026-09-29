'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  messageKindForDeveloperSessionEvent,
  type DeveloperAgentMode,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import type { DeveloperMessage } from '@agiworkforce/types/protocol';
import {
  answerDeveloperApproval,
  interruptDeveloperTurn,
  onDeveloperSessionEvent,
  readDeveloperSession,
  startDeveloperTurn,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import {
  EMPTY_LOCAL_TURN,
  LOCAL_CODE_COPY,
  type LocalToolRun,
  type LocalTurn,
} from '../local-code';

export interface LocalApproval {
  turnId: string;
  requestId: string;
  summary: string;
  detail: string;
  question?: { question: string; options: string[] };
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
  contextTokens: number | null;
  send: (
    text: string,
    model?: string,
    agentMode?: DeveloperAgentMode,
    maxTurns?: number,
  ) => Promise<void>;
  stop: () => Promise<void>;
  decideApproval: (approved: boolean, note?: string) => Promise<void>;
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
  const [contextTokens, setContextTokens] = useState<number | null>(null);
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
        setApproval(null);
        return;
      }
      if (event.threadId !== threadId) return;
      const kind = messageKindForDeveloperSessionEvent(event.type);

      if (kind === 'status' && event.type === 'turn-started') {
        setTurn((current) => ({ ...current, turnId: event.turnId, outcome: null, error: null }));
        return;
      }
      if (kind === 'text' && event.type === 'output-delta') {
        setTurn((current) => ({ ...current, reply: current.reply + event.delta }));
        return;
      }
      if (kind === 'tool_call' && event.type === 'tool-queued') {
        setTurn((current) => ({
          ...current,
          tools: [
            ...current.tools,
            {
              toolCallId: event.toolCallId,
              name: event.name,
              summary: event.name,
              output: '',
              isError: false,
              state: 'queued',
              command: null,
              files: [],
            },
          ],
        }));
        return;
      }
      if (kind === 'tool_call' && event.type === 'tool-started') {
        setTurn((current) => {
          const started: LocalToolRun = {
            toolCallId: event.toolCallId,
            name: event.name,
            summary: event.summary,
            output: '',
            isError: false,
            state: 'running',
            command: null,
            files: [],
          };
          const queued = current.tools.some((tool) => tool.toolCallId === event.toolCallId);
          return {
            ...current,
            tools: queued
              ? current.tools.map((tool) =>
                  tool.toolCallId === event.toolCallId
                    ? { ...tool, summary: event.summary, state: 'running' }
                    : tool,
                )
              : [...current.tools, started],
          };
        });
        return;
      }
      if (kind === 'tool_call' && event.type === 'command-started') {
        setTurn((current) => ({
          ...current,
          tools: current.tools.map((tool) =>
            tool.toolCallId === event.toolCallId ? { ...tool, command: event.command } : tool,
          ),
        }));
        return;
      }
      if (kind === 'tool_result' && event.type === 'file-changed') {
        setTurn((current) => ({
          ...current,
          tools: current.tools.map((tool) =>
            tool.toolCallId === event.toolCallId
              ? { ...tool, files: [...tool.files, { path: event.path, change: event.change }] }
              : tool,
          ),
        }));
        return;
      }
      if (kind === 'tool_result' && event.type === 'turn-diff') {
        setTurn((current) => ({
          ...current,
          diff: { unifiedDiff: event.unifiedDiff, paths: event.paths },
        }));
        return;
      }
      if (kind === 'tool_result' && event.type === 'tool-finished') {
        setTurn((current) => ({
          ...current,
          tools: current.tools.map((tool) =>
            tool.toolCallId === event.toolCallId
              ? { ...tool, output: event.output, isError: event.isError, state: 'finished' }
              : tool,
          ),
        }));
        return;
      }
      if (kind === 'approval' && event.type === 'approval-requested') {
        setApproval({
          turnId: event.turnId,
          requestId: event.requestId,
          summary: event.summary,
          detail: event.detail,
          ...(event.question ? { question: event.question } : {}),
        });
        return;
      }
      if (kind === 'approval' && event.type === 'approval-answered') {
        setApproval((current) => (current?.requestId === event.requestId ? null : current));
        return;
      }
      if (kind === 'status' && event.type === 'turn-finished') {
        setApproval(null);
        const used = event.inputTokens + event.outputTokens;
        if (used > 0) setContextTokens(used);
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
    async (text: string, model?: string, agentMode?: DeveloperAgentMode, maxTurns?: number) => {
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
          ...(agentMode ? { agentMode } : {}),
          ...(maxTurns ? { maxTurns } : {}),
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
      // The host dropped the turn before it could say so, so no interrupted
      // event will come; left running, the turn could never be stopped again.
      setTurn((current) =>
        current.turnId === turnId && !current.outcome
          ? { ...current, outcome: 'interrupted' }
          : current,
      );
    } finally {
      setStopping(false);
    }
  }, [rootId, threadId]);

  const decideApproval = useCallback(
    async (approved: boolean, note?: string) => {
      if (!rootId || !threadId || !approval) return;
      try {
        await answerDeveloperApproval({
          rootId,
          threadId,
          turnId: approval.turnId,
          requestId: approval.requestId,
          approved,
          ...(note ? { note } : {}),
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
    contextTokens,
    send,
    stop,
    decideApproval,
  };
}
