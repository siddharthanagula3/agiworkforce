'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LANE_CAP, QueueFullError, type QueuedCommand } from '@agiworkforce/client-runtime/queue';
import {
  DesktopRuntimeError,
  messageKindForDeveloperSessionEvent,
  type DeveloperAgentMode,
  type DeveloperApprovalDecision,
  type DeveloperReasoningEffort,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import type { DeveloperMessage } from '@agiworkforce/types/protocol';
import {
  answerDeveloperApproval,
  answerDeveloperUserInput,
  interruptDeveloperTurn,
  onDeveloperSessionEvent,
  readDeveloperSession,
  startDeveloperTurn,
  steerDeveloperTurn,
  takeOverDeveloperThread,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import {
  EMPTY_LOCAL_TURN,
  LOCAL_CODE_COPY,
  localTurnChanges,
  localTurnIsRunning,
  type LocalApproval,
  type LocalQuestion,
  type LocalQueuedMessage,
  type LocalTurnChanges,
  type LocalToolRun,
  type LocalTurn,
} from '../local-code';
import { localSessionMemory, newLocalSessionMemory } from '../local-session-memory';

export type { LocalApproval, LocalQuestion } from '../local-code';

export interface LocalTurnOptions {
  model?: string;
  agentMode?: DeveloperAgentMode;
  reasoningEffort?: DeveloperReasoningEffort;
  maxTurns?: number;
}

export interface LocalMessage {
  text: string;
  images: string[];
  contextFiles: string[];
}

/**
 * How a send ended. `declined` is the user saying no to Bypass permissions in
 * the shell's own dialog: nothing was sent and nothing was queued, so whoever
 * asked for the send still holds the message.
 */
export type LocalSendOutcome = 'started' | 'held' | 'declined';

export interface LocalSessionState {
  messages: DeveloperMessage[];
  truncated: boolean;
  turn: LocalTurn;
  /** What the latest turn changed, kept after the turn itself is folded into the transcript. */
  changes: LocalTurnChanges | null;
  approvals: LocalApproval[];
  questions: LocalQuestion[];
  queued: LocalQueuedMessage[];
  queuePaused: boolean;
  loading: boolean;
  sending: boolean;
  stopping: boolean;
  error: string | null;
  contextTokens: number | null;
  notice: string | null;
  /**
   * Set when a turn was refused because another program is writing the
   * session: the sentence naming that program. The unsent message waits at the
   * head of the queue.
   */
  heldBy: string | null;
  /** Take the session from that program, then send what was waiting. */
  takeOver: () => Promise<void>;
  /** How many times the user has declined Bypass permissions in this session's panel. */
  bypassDeclines: number;
  send: (message: string | LocalMessage, options?: LocalTurnOptions) => Promise<LocalSendOutcome>;
  steer: (message: LocalMessage) => Promise<void>;
  enqueue: (message: LocalMessage) => void;
  updateQueued: (id: string, text: string) => void;
  removeQueued: (id: string) => void;
  sendQueuedNow: (id: string) => Promise<void>;
  /**
   * Take every queued message back into the composer, oldest first, ahead of
   * `draft`. Null when nothing is queued, or when a queued message carries
   * pictures, which the composer holds as files and cannot take back.
   */
  recallQueued: (draft: string) => { text: string; contextFiles: string[] } | null;
  stop: () => Promise<void>;
  decideApproval: (
    approval: LocalApproval,
    decision: DeveloperApprovalDecision,
    note?: string,
  ) => Promise<void>;
  /** Answer a question, or pass null to skip it, which the agent reads as no answer. */
  answerQuestion: (question: LocalQuestion, answer: string | null) => Promise<void>;
  /** Read the stored transcript again, as after a rewind cut it short. */
  reload: () => Promise<void>;
}

function asMessage(message: string | LocalMessage): LocalMessage {
  return typeof message === 'string' ? { text: message, images: [], contextFiles: [] } : message;
}

function isEmpty(message: LocalMessage): boolean {
  return message.text.trim() === '' && message.images.length === 0;
}

/** A send that failed clears the turn it opened, never one the CLI is running. */
function withoutLiveTurn(current: LocalTurn): LocalTurn {
  return current.turnId === null ? EMPTY_LOCAL_TURN : current;
}

const QUEUE_ORIGIN = 'local-code';

function queuedCommand(message: LocalMessage) {
  return {
    value: message.text,
    mode: 'prompt' as const,
    origin: { kind: QUEUE_ORIGIN, images: message.images, contextFiles: message.contextFiles },
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function queuedMessage(command: QueuedCommand): LocalQueuedMessage {
  return {
    id: command.id,
    text: typeof command.value === 'string' ? command.value : '',
    images: stringList(command.origin?.['images']),
    contextFiles: stringList(command.origin?.['contextFiles']),
  };
}

/**
 * One local coding session: its stored transcript, the turn in flight and the
 * follow-ups waiting for it.
 *
 * The turn outlives the request that starts it, so the reply, the tool rows and
 * any approval arrive over the runtime event stream rather than in that
 * promise. When a turn ends the transcript is read again and the live turn is
 * dropped, so the reply is shown once rather than twice. A follow-up is either
 * steered into the running turn or queued for the next one; a steer the CLI
 * refuses is queued, so nothing typed is ever lost.
 */
export function useLocalSession(
  session: LocalDeveloperSession | null,
  options: LocalTurnOptions = {},
): LocalSessionState {
  const [messages, setMessages] = useState<DeveloperMessage[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [turn, setTurn] = useState<LocalTurn>(EMPTY_LOCAL_TURN);
  const [changes, setChanges] = useState<LocalTurnChanges | null>(null);
  const [approvals, setApprovals] = useState<LocalApproval[]>([]);
  const [questions, setQuestions] = useState<LocalQuestion[]>([]);
  const [queuePaused, setQueuePausedState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [heldBy, setHeldBy] = useState<string | null>(null);
  const [bypassDeclines, setBypassDeclines] = useState(0);
  const turnRef = useRef<LocalTurn>(EMPTY_LOCAL_TURN);
  const optionsRef = useRef<LocalTurnOptions>(options);
  const sentSteersRef = useRef<{ turnId: string | null; messages: LocalMessage[] }>({
    turnId: null,
    messages: [],
  });

  const loadsRef = useRef(0);
  const sendingRef = useRef(false);

  turnRef.current = turn;
  optionsRef.current = options;

  const rootId = session?.rootId ?? null;
  const threadId = session?.id ?? null;
  const memory = useMemo(
    () => (rootId && threadId ? localSessionMemory(rootId, threadId) : newLocalSessionMemory()),
    [rootId, threadId],
  );
  const queue = memory.queue;
  const pauseQueue = useCallback(
    (paused: boolean) => {
      memory.paused = paused;
      setQueuePausedState(paused);
    },
    [memory],
  );
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const queued = useMemo(() => snapshot.map(queuedMessage), [snapshot]);

  const load = useCallback(async (): Promise<{ turnRunning: boolean } | null> => {
    loadsRef.current += 1;
    const request = loadsRef.current;
    if (!rootId || !threadId) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const transcript = await readDeveloperSession(rootId, threadId);
      if (request !== loadsRef.current) return null;
      setMessages(transcript.messages);
      setTruncated(transcript.truncated);
      setError(null);
      const active = transcript.activeTurn;
      if (active) {
        setTurn((current) =>
          current.turnId === null
            ? { ...EMPTY_LOCAL_TURN, turnId: active.turnId, reply: active.partialResponse }
            : current,
        );
        setApprovals(active.approvals.map((approval) => ({ ...approval, turnId: active.turnId })));
        setQuestions(active.questions.map((question) => ({ ...question, turnId: active.turnId })));
      }
      return { turnRunning: active !== null };
    } catch (cause: unknown) {
      if (request === loadsRef.current) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.readFailed));
      }
      return null;
    } finally {
      if (request === loadsRef.current) setLoading(false);
    }
  }, [rootId, threadId]);

  useEffect(() => {
    setMessages([]);
    setTruncated(false);
    setTurn(EMPTY_LOCAL_TURN);
    setChanges(null);
    setApprovals([]);
    setQuestions([]);
    setQueuePausedState(memory.paused);
    setError(null);
    setContextTokens(null);
    setNotice(null);
    setHeldBy(null);
    // Follow-ups kept from an earlier visit were waiting on a turn. If none is
    // running now, nothing will send them, so they wait for the user.
    void load().then((read) => {
      if (read && !read.turnRunning && memory.queue.size() > 0) pauseQueue(true);
    });
  }, [load, memory, pauseQueue]);

  const reload = useCallback(async () => {
    setChanges(null);
    await load();
  }, [load]);

  const enqueueFirst = useCallback(
    (messages: LocalMessage[]) => {
      const waiting =
        queue.laneSize('next') + messages.length <= LANE_CAP ? queue.dequeueAll() : [];
      try {
        for (const message of messages) queue.enqueue(queuedCommand(message));
        for (const command of waiting) queue.enqueue(command);
        return true;
      } catch (cause: unknown) {
        if (!(cause instanceof QueueFullError)) throw cause;
        setNotice(LOCAL_CODE_COPY.queueFull);
        return false;
      }
    },
    [queue],
  );

  const send = useCallback(
    async (
      input: string | LocalMessage,
      turnOptions: LocalTurnOptions = optionsRef.current,
    ): Promise<LocalSendOutcome> => {
      const message = asMessage(input);
      if (!rootId || !threadId || isEmpty(message)) return 'held';
      // A second send while one is starting, or while a turn runs, must not
      // start over the first: it would drop the live turn id and with it Stop.
      if (sendingRef.current || localTurnIsRunning(turnRef.current)) {
        if (enqueueFirst([message])) setNotice(LOCAL_CODE_COPY.sentWhileBusyQueued);
        return 'held';
      }
      sendingRef.current = true;
      setSending(true);
      setError(null);
      setNotice(null);
      setHeldBy(null);
      pauseQueue(false);
      setChanges(null);
      setTurn({ ...EMPTY_LOCAL_TURN, prompt: message.text });
      try {
        const { turnId } = await startDeveloperTurn({
          rootId,
          threadId,
          text: message.text,
          ...(turnOptions.model ? { model: turnOptions.model } : {}),
          ...(turnOptions.agentMode ? { agentMode: turnOptions.agentMode } : {}),
          ...(turnOptions.reasoningEffort ? { reasoningEffort: turnOptions.reasoningEffort } : {}),
          ...(turnOptions.maxTurns ? { maxTurns: turnOptions.maxTurns } : {}),
          ...(message.contextFiles.length > 0 ? { contextFiles: message.contextFiles } : {}),
          ...(message.images.length > 0 ? { images: message.images } : {}),
        });
        turnRef.current = { ...turnRef.current, turnId, outcome: null };
        setTurn((current) => ({ ...current, turnId }));
        return 'started';
      } catch (cause: unknown) {
        if (
          turnOptions.agentMode === 'bypass' &&
          cause instanceof DesktopRuntimeError &&
          cause.code === 'cancelled'
        ) {
          setTurn(withoutLiveTurn);
          setBypassDeclines((count) => count + 1);
          return 'declined';
        }
        const held = cause instanceof DesktopRuntimeError && cause.code === 'thread-held';
        if (held) setHeldBy(toUserMessage(cause, LOCAL_CODE_COPY.heldByAnotherProgram));
        else setError(toUserMessage(cause, LOCAL_CODE_COPY.turnFailed));
        setTurn(withoutLiveTurn);
        if (enqueueFirst([message])) {
          pauseQueue(true);
          if (!held) setNotice(LOCAL_CODE_COPY.unsentQueued);
        }
        return 'held';
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [rootId, threadId, enqueueFirst, pauseQueue],
  );

  const sendFromQueue = useCallback(
    async (message: LocalMessage) => {
      if ((await send(message)) !== 'declined') return;
      if (enqueueFirst([message])) {
        pauseQueue(true);
        setNotice(LOCAL_CODE_COPY.unsentQueued);
      }
    },
    [send, enqueueFirst, pauseQueue],
  );

  const sendNextQueued = useCallback(() => {
    const next = queue.dequeue();
    if (next) void sendFromQueue(queuedMessage(next));
  }, [queue, sendFromQueue]);

  const takeOver = useCallback(async () => {
    if (!rootId || !threadId) return;
    try {
      await takeOverDeveloperThread(rootId, threadId);
      setHeldBy(null);
      setError(null);
      sendNextQueued();
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.takeOverFailed));
    }
  }, [rootId, threadId, sendNextQueued]);

  const enqueueMessage = useCallback(
    (message: LocalMessage) => {
      try {
        queue.enqueue(queuedCommand(message));
        return true;
      } catch (cause: unknown) {
        if (!(cause instanceof QueueFullError)) throw cause;
        setNotice(LOCAL_CODE_COPY.queueFull);
        return false;
      }
    },
    [queue],
  );

  const returnUnsentSteers = useCallback(
    (turnId: string, unsent: number) => {
      const sent = sentSteersRef.current;
      const back = sent.turnId === turnId ? sent.messages.slice(-unsent) : [];
      if (back.length === 0) return;
      if (!enqueueFirst(back)) return;
      setTurn((current) =>
        current.turnId === turnId
          ? { ...current, steered: current.steered.slice(0, -back.length) }
          : current,
      );
      setNotice(LOCAL_CODE_COPY.steersReturned(back.length));
    },
    [enqueueFirst],
  );

  useEffect(() => {
    if (!rootId || !threadId) return;
    return onDeveloperSessionEvent((eventRootId, event) => {
      if (eventRootId !== rootId) return;
      if (event.type === 'runtime-stopped') {
        setError(LOCAL_CODE_COPY.runtimeStopped);
        setApprovals([]);
        setQuestions([]);
        setTurn((current) => (current.outcome ? current : { ...current, outcome: 'failed' }));
        if (queue.size() > 0) pauseQueue(true);
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
          const queuedTool = current.tools.some((tool) => tool.toolCallId === event.toolCallId);
          return {
            ...current,
            tools: queuedTool
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
        const diff = { unifiedDiff: event.unifiedDiff, paths: event.paths };
        setChanges(localTurnChanges(diff, turnRef.current.tools));
        setTurn((current) => ({ ...current, diff }));
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
        const approval: LocalApproval = {
          turnId: event.turnId,
          requestId: event.requestId,
          kind: event.kind,
          summary: event.summary,
          detail: event.detail,
          command: event.command,
          riskLevel: event.riskLevel,
          reversible: event.reversible,
          ...(event.proposedCommandPrefix
            ? { proposedCommandPrefix: event.proposedCommandPrefix }
            : {}),
          ...(event.question ? { question: event.question } : {}),
        };
        setApprovals((current) =>
          current.some((pending) => pending.requestId === approval.requestId)
            ? current
            : [...current, approval],
        );
        return;
      }
      if (kind === 'approval' && event.type === 'approval-answered') {
        setApprovals((current) =>
          current.filter((pending) => pending.requestId !== event.requestId),
        );
        return;
      }
      if (kind === 'approval' && event.type === 'user-input-requested') {
        const question: LocalQuestion = {
          turnId: event.turnId,
          requestId: event.requestId,
          question: event.question,
        };
        setQuestions((current) =>
          current.some((pending) => pending.requestId === question.requestId)
            ? current
            : [...current, question],
        );
        return;
      }
      if (kind === 'approval' && event.type === 'user-input-answered') {
        setQuestions((current) =>
          current.filter((pending) => pending.requestId !== event.requestId),
        );
        return;
      }
      if (kind === 'status' && event.type === 'turn-finished') {
        setApprovals([]);
        setQuestions([]);
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
        if (event.unsentSteers) returnUnsentSteers(event.turnId, event.unsentSteers);
        if (event.outcome !== 'completed') {
          if (queue.size() > 0) pauseQueue(true);
          return;
        }
        void load().then(() => {
          if (turnRef.current.turnId !== event.turnId) return;
          setTurn(EMPTY_LOCAL_TURN);
          sendNextQueued();
        });
      }
    });
  }, [rootId, threadId, load, queue, pauseQueue, returnUnsentSteers, sendNextQueued]);

  const enqueue = useCallback(
    (message: LocalMessage) => {
      if (!isEmpty(message)) enqueueMessage(message);
    },
    [enqueueMessage],
  );

  const steer = useCallback(
    async (message: LocalMessage) => {
      const turnId = turnRef.current.turnId;
      if (!rootId || !threadId || isEmpty(message)) return;
      if (!turnId || !localTurnIsRunning(turnRef.current)) {
        await send(message);
        return;
      }
      if (message.contextFiles.length > 0) {
        if (enqueueMessage(message)) setNotice(LOCAL_CODE_COPY.filesQueued);
        return;
      }
      try {
        await steerDeveloperTurn({
          rootId,
          threadId,
          turnId,
          text: message.text,
          ...(message.images.length > 0 ? { images: message.images } : {}),
        });
        setNotice(null);
        const sent = sentSteersRef.current;
        sentSteersRef.current = {
          turnId,
          messages: sent.turnId === turnId ? [...sent.messages, message] : [message],
        };
        setTurn((current) =>
          current.turnId === turnId
            ? { ...current, steered: [...current.steered, message.text] }
            : current,
        );
      } catch (cause: unknown) {
        if (enqueueMessage(message)) {
          setNotice(
            `${LOCAL_CODE_COPY.steerQueued} ${toUserMessage(cause, LOCAL_CODE_COPY.turnFailed)}`,
          );
        }
      }
    },
    [rootId, threadId, send, enqueueMessage],
  );

  const updateQueued = useCallback(
    (id: string, text: string) => {
      queue.update(id, text);
    },
    [queue],
  );

  const removeQueued = useCallback(
    (id: string) => {
      queue.dequeueAllMatching((command) => command.id === id);
    },
    [queue],
  );

  const sendQueuedNow = useCallback(
    async (id: string) => {
      const [command] = queue.dequeueAllMatching((candidate) => candidate.id === id);
      if (!command) return;
      const item = queuedMessage(command);
      if (localTurnIsRunning(turnRef.current)) {
        await steer(item);
        return;
      }
      await sendFromQueue(item);
    },
    [queue, sendFromQueue, steer],
  );

  const recallQueued = useCallback(
    (draft: string) => {
      const waiting = queue.getSnapshot().map(queuedMessage);
      if (waiting.length === 0 || waiting.some((item) => item.images.length > 0)) return null;
      const popped = queue.popAllEditable(draft, draft.length);
      if (!popped) return null;
      return {
        text: popped.text,
        contextFiles: [...new Set(waiting.flatMap((item) => item.contextFiles))],
      };
    },
    [queue],
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
      if (queue.size() > 0) pauseQueue(true);
    } finally {
      setStopping(false);
    }
  }, [rootId, threadId, queue, pauseQueue]);

  const decideApproval = useCallback(
    async (approval: LocalApproval, decision: DeveloperApprovalDecision, note?: string) => {
      if (!rootId || !threadId) return;
      const commandPrefix =
        decision === 'always_allow_command' ? (approval.proposedCommandPrefix ?? null) : null;
      try {
        await answerDeveloperApproval({
          rootId,
          threadId,
          turnId: approval.turnId,
          requestId: approval.requestId,
          decision,
          ...(commandPrefix ? { commandPrefix } : {}),
          ...(note ? { note } : {}),
        });
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.turnFailed));
      }
    },
    [rootId, threadId],
  );

  const answerQuestion = useCallback(
    async (question: LocalQuestion, answer: string | null) => {
      if (!rootId || !threadId) return;
      try {
        await answerDeveloperUserInput({
          rootId,
          threadId,
          turnId: question.turnId,
          requestId: question.requestId,
          answer,
        });
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.turnFailed));
      }
    },
    [rootId, threadId],
  );

  return {
    messages,
    truncated,
    turn,
    changes,
    approvals,
    questions,
    queued,
    queuePaused,
    loading,
    sending,
    stopping,
    error,
    contextTokens,
    notice,
    heldBy,
    takeOver,
    bypassDeclines,
    send,
    steer,
    enqueue,
    updateQueued,
    removeQueued,
    sendQueuedNow,
    recallQueued,
    stop,
    decideApproval,
    answerQuestion,
    reload,
  };
}
