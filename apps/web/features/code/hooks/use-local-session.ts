'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LANE_CAP, QueueFullError, type QueuedCommand } from '@agiworkforce/client-runtime/queue';
import {
  DesktopRuntimeError,
  DEVELOPER_SESSION_MAX_FRAME_BYTES,
  messageKindForDeveloperSessionEvent,
  type DeveloperAgentMode,
  type DeveloperSessionEvent,
  type DeveloperApprovalDecision,
  type DeveloperReasoningEffort,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import type { DeveloperChildTask, DeveloperMessage } from '@agiworkforce/types/protocol';
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
  childTasks: DeveloperChildTask[];
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
  const [childTasks, setChildTasks] = useState<DeveloperChildTask[]>([]);
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

  const replayRef = useRef<{
    turnId: string | null;
    nextDeltaIndex?: number;
    nextEventSequence?: number;
    lastLiveEventSequence?: number;
  }>({ turnId: null });
  const bufferedEventsRef = useRef<DeveloperSessionEvent[] | null>(null);
  const bufferedBytesRef = useRef(0);
  const overflowedRef = useRef(false);
  const dispatchEventRef = useRef<(event: DeveloperSessionEvent) => void>(() => undefined);
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

  const load = useCallback(
    async function readCurrentSession(): Promise<{ turnRunning: boolean } | null> {
      loadsRef.current += 1;
      const request = loadsRef.current;
      if (!rootId || !threadId) {
        setLoading(false);
        return null;
      }
      setLoading(true);
      const turnAtRead = turnRef.current.turnId;
      bufferedEventsRef.current ??= [];
      try {
        const transcript = await readDeveloperSession(rootId, threadId);
        if (request !== loadsRef.current || overflowedRef.current) return null;
        setMessages(transcript.messages);
        setChildTasks(transcript.childTasks ?? []);
        setTruncated(transcript.truncated);
        setError(null);
        const active = transcript.activeTurn;
        const newerLocalTurn =
          turnRef.current.turnId !== null && turnRef.current.turnId !== turnAtRead;
        if (active && !newerLocalTurn) {
          const replay = replayRef.current;
          const snapshotBehind =
            replay.turnId === active.turnId &&
            replay.nextDeltaIndex !== undefined &&
            active.nextDeltaIndex !== undefined &&
            active.nextDeltaIndex < replay.nextDeltaIndex;
          if (!snapshotBehind) {
            replayRef.current = {
              turnId: active.turnId,
              ...(replay.turnId === active.turnId && replay.lastLiveEventSequence !== undefined
                ? { lastLiveEventSequence: replay.lastLiveEventSequence }
                : {}),
              ...(active.nextDeltaIndex === undefined
                ? {}
                : { nextDeltaIndex: active.nextDeltaIndex }),
              ...(active.nextEventSequence === undefined
                ? {}
                : { nextEventSequence: active.nextEventSequence }),
            };
            const previous = turnRef.current;
            const next = {
              ...(previous.turnId === active.turnId ? previous : EMPTY_LOCAL_TURN),
              turnId: active.turnId,
              reply: active.partialResponse,
            };
            turnRef.current = next;
            setTurn(next);
          }
          setApprovals(
            active.approvals.map((approval) => ({ ...approval, turnId: active.turnId })),
          );
          setQuestions(
            active.questions.map((question) => ({ ...question, turnId: active.turnId })),
          );
        }
        if (!active && !newerLocalTurn) {
          setApprovals([]);
          setQuestions([]);
          const storedTurn = turnRef.current.turnId;
          if (
            storedTurn &&
            turnRef.current.outcome === null &&
            transcript.messages.some(
              (message) => message.role === 'assistant' && message.turnId === storedTurn,
            )
          ) {
            turnRef.current = EMPTY_LOCAL_TURN;
            setTurn(EMPTY_LOCAL_TURN);
          }
        }
        return { turnRunning: active != null || newerLocalTurn };
      } catch (cause: unknown) {
        if (request === loadsRef.current) {
          setError(toUserMessage(cause, LOCAL_CODE_COPY.readFailed));
        }
        return null;
      } finally {
        if (request === loadsRef.current) {
          setLoading(false);
          const buffered = bufferedEventsRef.current ?? [];
          bufferedEventsRef.current = null;
          bufferedBytesRef.current = 0;
          if (overflowedRef.current) {
            overflowedRef.current = false;
            void readCurrentSession();
          } else {
            for (const event of buffered) dispatchEventRef.current(event);
          }
        }
      }
    },
    [rootId, threadId],
  );

  useEffect(() => {
    replayRef.current = { turnId: null };
    bufferedEventsRef.current = null;
    bufferedBytesRef.current = 0;
    overflowedRef.current = false;
    turnRef.current = EMPTY_LOCAL_TURN;
    setMessages([]);
    setChildTasks([]);
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
    return () => {
      loadsRef.current += 1;
      bufferedEventsRef.current = null;
    };
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
    const dispatch = (event: DeveloperSessionEvent) => {
      if (event.type === 'runtime-stopped') {
        overflowedRef.current = false;
        bufferedBytesRef.current = 0;
        loadsRef.current += 1;
        bufferedEventsRef.current = null;
        setLoading(false);
        turnRef.current = { ...turnRef.current, outcome: turnRef.current.outcome ?? 'failed' };
        setError(LOCAL_CODE_COPY.runtimeStopped);
        setApprovals([]);
        setQuestions([]);
        setTurn((current) => (current.outcome ? current : { ...current, outcome: 'failed' }));
        if (queue.size() > 0) pauseQueue(true);
        return;
      }
      if (event.threadId !== threadId) return;
      const kind = messageKindForDeveloperSessionEvent(event.type);
      if (
        'turnId' in event &&
        turnRef.current.turnId === event.turnId &&
        turnRef.current.outcome !== null
      )
        return;
      if ('turnId' in event && event.type !== 'turn-started') {
        const currentId = replayRef.current.turnId ?? turnRef.current.turnId;
        if (currentId !== null && currentId !== event.turnId) return;
      }

      if (event.sequence !== undefined) {
        const replay = replayRef.current;
        if (
          replay.lastLiveEventSequence !== undefined &&
          event.sequence <= replay.lastLiveEventSequence
        )
          return;
        replayRef.current = {
          ...replay,
          lastLiveEventSequence: event.sequence,
          nextEventSequence: Math.max(replay.nextEventSequence ?? 0, event.sequence + 1),
        };
      }

      if (kind === 'status' && event.type === 'turn-started') {
        if (replayRef.current.turnId !== event.turnId) {
          replayRef.current = { turnId: event.turnId, nextDeltaIndex: 0, nextEventSequence: 0 };
        }
        setApprovals((current) => current.filter((approval) => approval.turnId === event.turnId));
        setQuestions((current) => current.filter((question) => question.turnId === event.turnId));
        setTurn((current) => {
          const next = {
            ...(current.turnId === event.turnId || current.turnId === null
              ? current
              : EMPTY_LOCAL_TURN),
            turnId: event.turnId,
            outcome: null,
            failure: null,
          };
          turnRef.current = next;
          return next;
        });
        return;
      }
      if (kind === 'text' && event.type === 'output-delta') {
        const replay = replayRef.current;
        if (event.index !== undefined) {
          const expected = replay.nextDeltaIndex ?? 0;
          if (event.index < expected) return;
          if (event.index > expected) {
            void load();
            return;
          }
          replayRef.current = { ...replay, turnId: event.turnId, nextDeltaIndex: event.index + 1 };
        }
        setTurn((current) => ({
          ...current,
          turnId: event.turnId,
          reply: current.reply + event.delta,
        }));
        return;
      }
      if (kind === 'tool_call' && event.type === 'tool-queued') {
        setTurn((current) => ({
          ...current,
          tools: current.tools.some((tool) => tool.toolCallId === event.toolCallId)
            ? current.tools
            : [
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
        turnRef.current = {
          ...turnRef.current,
          outcome: event.outcome,
          reply: event.response || turnRef.current.reply,
          failure: event.failure,
        };
        setApprovals([]);
        setQuestions([]);
        const used = event.inputTokens + event.outputTokens;
        if (used > 0) setContextTokens(used);
        setTurn((current) => ({
          ...current,
          outcome: event.outcome,
          reply: event.response || current.reply,
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
        void load().then((read) => {
          if (!read || read.turnRunning || turnRef.current.turnId !== event.turnId) return;
          setTurn(EMPTY_LOCAL_TURN);
          sendNextQueued();
        });
      }
    };
    const receive = (event: DeveloperSessionEvent) => {
      if (bufferedEventsRef.current !== null && event.type !== 'runtime-stopped') {
        if (overflowedRef.current) return;
        const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
        if (bufferedBytesRef.current + bytes > DEVELOPER_SESSION_MAX_FRAME_BYTES) {
          overflowedRef.current = true;
          bufferedEventsRef.current = [];
          bufferedBytesRef.current = 0;
          setNotice(LOCAL_CODE_COPY.activityReloaded);
          return;
        }
        bufferedBytesRef.current += bytes;
        bufferedEventsRef.current.push(event);
        return;
      }
      dispatch(event);
    };
    dispatchEventRef.current = receive;
    return onDeveloperSessionEvent((eventRootId, event) => {
      if (eventRootId !== rootId) return;
      if (event.type !== 'runtime-stopped' && event.threadId !== threadId) return;
      receive(event);
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
    childTasks,
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
