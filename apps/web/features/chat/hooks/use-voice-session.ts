'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type {
  LiveVoicePendingApproval,
  LiveVoiceToolDecision,
} from '@agiworkforce/cloud-contracts';
import { toast } from 'sonner';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import {
  useVoiceSessionStore,
  type VoiceRejoinOffer,
} from '@features/chat/stores/voice-session-store';
import { usePrefersReducedMotion } from '@features/support/hooks/usePrefersReducedMotion';
import { useChatStore } from '@shared/stores/web-chat-store';
import { getProviderModeForModel } from '@features/chat/lib/localByokHandoff';
import { conversationHoldsLocalTurns } from '@features/chat/lib/local-origin';
import {
  advanceVoiceCallClock,
  INITIAL_VOICE_CALL_CLOCK,
  isVoiceSessionActive,
  reportClientFailure,
  voiceCallClockRunning,
  voiceCallElapsedMs,
  VOICE_SESSION_EVENT,
  VOICE_SESSION_STATUS,
  type VoiceCallClock,
  type VoiceOrbLevelSource,
  type VoiceSessionState,
} from '@agiworkforce/unified-chat';
import {
  LIVE_SESSION_ENDPOINT,
  LIVE_SESSION_MESSAGE,
  LiveVoiceSession,
  LiveVoiceSessionError,
  isUsageLimitError,
  type VoiceAttachmentOutcome,
  readLiveSessionError,
  type LiveSessionClosed,
  type LiveTranscriptTurn,
  type LiveVoiceToolActivity,
  type LiveVoiceToolOutcome,
} from '@features/chat/lib/live-voice-session';
import type { LiveVoiceReasoning } from '@features/chat/lib/live-voices';

const MESSAGE = {
  sendFailed: 'That turn could not be sent. Try again.',
  mutedHint: 'Muted, tap the mic to talk',
} as const;

const REMOTE_CLOSE_REASONS_WITH_NOTICE = new Set(['expired', 'content', 'connection_lost']);
const EXTEND_LEAD_MS = 15_000;
const EXTEND_RETRY_MS = 10_000;
const FIRST_EXTENSION_BLOCK = 2;
const CALL_CLOCK_TICK_MS = 1_000;

interface SessionBudget {
  session: LiveVoiceSession;
  startedAtMs: number;
  ceilingSeconds: number;
  nextBlock: number;
}

type BlockExtension =
  | { ok: true; ceilingSeconds: number }
  | { ok: false; retry: boolean; notice: string; usageLimited: boolean };

export type { LiveTranscriptTurn as VoiceTranscriptTurn };

export interface UseVoiceSessionOptions {
  managed: boolean;
  turnActive: boolean;
  conversationId: string | null;
  onSend: (text: string) => boolean;
  onStartWorkTask?: (goal: string, conversationId: string, authority: RequestAuthority) => boolean;
  onEnsureConversation: (
    authority: RequestAuthority,
    bindConversation: (id: string) => void,
  ) => Promise<string | null>;
  onDiscardConversation?: ((conversationId: string) => void) | undefined;
  onTranscript: (
    conversationId: string,
    turn: LiveTranscriptTurn,
    authority: RequestAuthority,
  ) => void;
  onCaption?: ((turn: LiveTranscriptTurn) => void) | undefined;
}

export interface VoiceSessionController {
  state: VoiceSessionState;
  active: boolean;
  reducedMotion: boolean;
  deviceName: string;
  backendBusy: boolean;
  toolActivity: readonly LiveVoiceToolActivity[];
  toolApprovals: readonly LiveVoicePendingApproval[];
  toolOutcomes: readonly LiveVoiceToolOutcome[];
  audioLevel: VoiceOrbLevelSource;
  decideToolApproval: (callId: string, decision: LiveVoiceToolDecision) => void;
  cancelBackendWork: () => void;
  reconnecting: boolean;
  reconnectAttempt: number;
  reconnectMaxAttempts: number;
  mutedHint: string;
  enter: () => void;
  exit: () => void;
  toggleMute: () => void;
  pause: () => void;
  resume: () => void;
  paused: boolean;
  callElapsedMs: number;
  rejoinOffer: VoiceRejoinOffer | null;
  answerRejoin: (rejoin: boolean) => void;
  cancelPending: () => void;
  submitTyped: (text: string) => void;
  retry: () => void;
  resumePlayback: () => void;
  shareAttachment: (file: File) => void;
}

interface TranscriptSink {
  surface: object;
  managed: boolean;
  captureSession: () => SessionAuthority | null;
  conversationId: string | null;
  onStartWorkTask?:
    ((goal: string, conversationId: string, authority: RequestAuthority) => boolean) | undefined;
  onEnsureConversation: (
    authority: RequestAuthority,
    bindConversation: (id: string) => void,
  ) => Promise<string | null>;
  onDiscardConversation?: ((conversationId: string) => void) | undefined;
  onTranscript: (
    conversationId: string,
    turn: LiveTranscriptTurn,
    authority: RequestAuthority,
  ) => void;
  onCaption?: ((turn: LiveTranscriptTurn) => void) | undefined;
}

interface VoiceAttempt {
  sink: TranscriptSink;
  identity: SessionAuthority;
  authority: RequestAuthority;
  transcriptAuthority: RequestAuthority;
  conversationId: string | null;
  session: LiveVoiceSession | null;
  ended: boolean;
  finalizing: boolean;
}

const closingOwners = new Map<VoiceAttempt, LiveVoiceSession>();

const NAVIGATION_HANDOFF_MS = 5_000;
const PROVIDER_NOTICE_MS = 8_000;

export const RECONNECT_MAX_ATTEMPTS = 3;
export const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 8_000;
const RECONNECT_STABLE_MS = 30_000;
const UNRECOVERABLE_START_CODES = new Set([
  'microphone_denied',
  'microphone_unavailable',
  'unsupported',
]);

const voiceLevel: VoiceOrbLevelSource = {
  get current() {
    return controller.session?.level ?? 0;
  },
};

const controller = {
  owner: null as VoiceAttempt | null,
  session: null as LiveVoiceSession | null,
  starting: null as Promise<LiveVoiceSession> | null,
  sink: null as TranscriptSink | null,
  handoff: null as number | null,
  attempt: 0,
  reconnectTimer: null as number | null,
  stableTimer: null as number | null,
  budget: null as SessionBudget | null,
  budgetTimer: null as number | null,
  providerNoticeTimer: null as number | null,
  paused: false,
  clock: INITIAL_VOICE_CALL_CLOCK as VoiceCallClock,
};

/**
 * The element the live session plays through. The session owns it, so the
 * output picker reads it here rather than rendering one of its own.
 */
export const liveVoiceOutputRef: { current: HTMLAudioElement | null } = { current: null };

export interface VoiceReconnectState {
  readonly active: boolean;
  readonly attempt: number;
}

const NOT_RECONNECTING: VoiceReconnectState = { active: false, attempt: 0 };
let reconnectState: VoiceReconnectState = NOT_RECONNECTING;
const reconnectListeners = new Set<() => void>();

function publishReconnectState(next: VoiceReconnectState): void {
  reconnectState = next;
  reconnectListeners.forEach((listener) => listener());
}

function subscribeToReconnectState(listener: () => void): () => void {
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

function clearReconnectTimers(): void {
  if (controller.reconnectTimer !== null) window.clearTimeout(controller.reconnectTimer);
  if (controller.stableTimer !== null) window.clearTimeout(controller.stableTimer);
  controller.reconnectTimer = null;
  controller.stableTimer = null;
}

function stopVoiceReconnect(): void {
  clearReconnectTimers();
  controller.attempt = 0;
  if (reconnectState.active) publishReconnectState(NOT_RECONNECTING);
}

/**
 * One more bounded attempt, or false when the budget is spent. The budget is
 * what keeps a provider outage from re-reserving a live session on every drop.
 */
function scheduleVoiceReconnect(): boolean {
  if (controller.attempt >= RECONNECT_MAX_ATTEMPTS) return false;
  const owner = controller.owner;
  controller.attempt += 1;
  publishReconnectState({ active: true, attempt: controller.attempt });
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (controller.attempt - 1));
  if (controller.reconnectTimer !== null) window.clearTimeout(controller.reconnectTimer);
  controller.reconnectTimer = window.setTimeout(() => {
    controller.reconnectTimer = null;
    if (!owner || controller.owner !== owner || !owner.authority.isCurrent()) return;
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.retry });
  }, delay);
  return true;
}

/** The network coming back is better evidence than the remaining backoff. */
function retryVoiceReconnectNow(): void {
  if (
    !reconnectState.active ||
    controller.reconnectTimer === null ||
    !controller.owner?.authority.isCurrent()
  )
    return;
  window.clearTimeout(controller.reconnectTimer);
  controller.reconnectTimer = null;
  useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.retry });
}

function markVoiceReconnected(): void {
  if (controller.reconnectTimer !== null) window.clearTimeout(controller.reconnectTimer);
  controller.reconnectTimer = null;
  if (reconnectState.active) publishReconnectState(NOT_RECONNECTING);
  if (controller.attempt === 0) return;
  if (controller.stableTimer !== null) window.clearTimeout(controller.stableTimer);
  controller.stableTimer = window.setTimeout(() => {
    controller.stableTimer = null;
    controller.attempt = 0;
  }, RECONNECT_STABLE_MS);
}

async function readActiveVoiceSession(
  conversationId: string,
  authority: RequestAuthority,
): Promise<VoiceRejoinOffer | null> {
  try {
    const response = await authority.fetch(
      `${LIVE_SESSION_ENDPOINT}/active?conversationId=${encodeURIComponent(conversationId)}`,
      {},
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { session?: Record<string, unknown> | null };
    const record = body.session;
    if (!record || typeof record['startedAt'] !== 'string') return null;
    return {
      surface: typeof record['surface'] === 'string' ? record['surface'] : 'web',
      voice: typeof record['voice'] === 'string' ? record['voice'] : null,
      language: typeof record['language'] === 'string' ? record['language'] : null,
      pace: typeof record['pace'] === 'number' ? record['pace'] : null,
      startedAt: record['startedAt'],
    };
  } catch {
    return null;
  }
}

function settleSession(session: LiveVoiceSession, closed: LiveSessionClosed): Promise<void> {
  return session.settle(closed).catch((error: unknown) => {
    console.warn('[voice] The live session close was not recorded:', error);
    toast.error(
      'This voice session did not close cleanly, so it may keep counting toward your voice usage for a few more minutes.',
      { id: `voice-session-close-${session.sessionId}` },
    );
  });
}

function clearSessionBudget(): void {
  if (controller.budgetTimer !== null) window.clearTimeout(controller.budgetTimer);
  controller.budgetTimer = null;
  controller.budget = null;
}

function msUntilCeiling(budget: SessionBudget): number {
  return budget.startedAtMs + budget.ceilingSeconds * 1_000 - Date.now();
}

function scheduleBudget(budget: SessionBudget, delayMs: number, run: () => void): void {
  if (controller.budgetTimer !== null) window.clearTimeout(controller.budgetTimer);
  controller.budgetTimer = window.setTimeout(
    () => {
      controller.budgetTimer = null;
      if (controller.budget === budget && controller.session === budget.session) run();
    },
    Math.max(0, delayMs),
  );
}

function requestBlockExtension(session: LiveVoiceSession, block: number): Promise<BlockExtension> {
  return session
    .extend(block)
    .then(async (response): Promise<BlockExtension> => {
      if (!response.ok) {
        const error = await readLiveSessionError(response);
        return {
          ok: false,
          retry: response.status >= 500,
          notice: error.message,
          usageLimited: isUsageLimitError(error),
        };
      }
      const body = (await response.json()) as { ceilingSeconds?: unknown };
      return typeof body.ceilingSeconds === 'number'
        ? { ok: true, ceilingSeconds: body.ceilingSeconds }
        : {
            ok: false,
            retry: true,
            notice: LIVE_SESSION_MESSAGE.sessionEnded,
            usageLimited: false,
          };
    })
    .catch((): BlockExtension => ({
      ok: false,
      retry: true,
      notice: LIVE_SESSION_MESSAGE.connectionDropped,
      usageLimited: false,
    }));
}

function showVoiceNotice(message: string): void {
  useVoiceSessionStore.getState().setProviderNotice(message);
  if (controller.providerNoticeTimer !== null) window.clearTimeout(controller.providerNoticeTimer);
  controller.providerNoticeTimer = window.setTimeout(() => {
    controller.providerNoticeTimer = null;
    useVoiceSessionStore.getState().setProviderNotice(null);
  }, PROVIDER_NOTICE_MS);
}

export const VOICE_ATTACHMENT_MESSAGE: Readonly<Record<VoiceAttachmentOutcome, string>> = {
  shared: 'Shared with the assistant. Ask about it.',
  too_large:
    'That file is too large to share during a voice conversation. Attach it to a typed message instead.',
  unsupported: 'Voice can look at photos and PDFs.',
  unreadable: 'That file could not be read.',
  busy: 'Wait for the current action to finish, then share it.',
  unavailable: 'Start talking first, then share it.',
};

function endSessionAtLimit(notice: string, usageLimited: boolean): void {
  endLiveVoiceSession('usage_limit');
  const store = useVoiceSessionStore.getState();
  store.setUsageLimited(usageLimited);
  store.dispatch({ type: VOICE_SESSION_EVENT.fail, message: notice });
}

async function extendSessionBudget(budget: SessionBudget): Promise<void> {
  const result = await requestBlockExtension(budget.session, budget.nextBlock);
  if (controller.budget !== budget || controller.session !== budget.session) return;
  if (result.ok) {
    budget.ceilingSeconds = Math.max(budget.ceilingSeconds, result.ceilingSeconds);
    budget.nextBlock += 1;
    scheduleBudget(budget, msUntilCeiling(budget) - EXTEND_LEAD_MS, () => {
      void extendSessionBudget(budget);
    });
    return;
  }
  if (result.retry && msUntilCeiling(budget) > EXTEND_RETRY_MS) {
    scheduleBudget(budget, EXTEND_RETRY_MS, () => {
      void extendSessionBudget(budget);
    });
    return;
  }
  scheduleBudget(budget, msUntilCeiling(budget), () =>
    endSessionAtLimit(result.notice, result.usageLimited),
  );
}

function trackSessionBudget(session: LiveVoiceSession): void {
  const budget: SessionBudget = {
    session,
    startedAtMs: Date.now(),
    ceilingSeconds: session.settlement.ceilingSeconds,
    nextBlock: FIRST_EXTENSION_BLOCK,
  };
  controller.budget = budget;
  scheduleBudget(budget, msUntilCeiling(budget) - EXTEND_LEAD_MS, () => {
    void extendSessionBudget(budget);
  });
}

function destinationIsCurrent(owner: VoiceAttempt): boolean {
  const sink = controller.sink;
  return Boolean(
    sink?.managed &&
    owner.identity.isCurrent() &&
    (sink.conversationId === owner.conversationId ||
      (sink.conversationId === null &&
        owner.sink.conversationId === null &&
        sink.surface === owner.sink.surface)),
  );
}

function originalConversationIsManaged(owner: VoiceAttempt): boolean {
  if (!owner.conversationId) return false;
  const chat = useChatStore.getState();
  const conversation = chat.conversations.find((entry) => entry.id === owner.conversationId);
  const mode = conversation?.model ? getProviderModeForModel(conversation.model) : null;
  const messages = chat.messagesByConversation[owner.conversationId] ?? [];
  return (
    Boolean(conversation) &&
    mode !== 'Local' &&
    mode !== 'DirectByok' &&
    !conversationHoldsLocalTurns(messages) &&
    !messages.some((message) => message.metadata?.privacyMode === 'byok')
  );
}

function deliverTranscript(owner: VoiceAttempt, turn: LiveTranscriptTurn): void {
  const foreground = !owner.ended && owner.authority.isCurrent();
  if (!foreground && !(owner.finalizing && turn.final)) return;
  if (!owner.conversationId || !owner.transcriptAuthority.isCurrent()) return;
  if (foreground) controller.sink?.onCaption?.(turn);
  owner.sink.onTranscript(owner.conversationId, turn, owner.transcriptAuthority);
}

function closeOwnedSession(owner: VoiceAttempt, session: LiveVoiceSession, reason?: string): void {
  owner.finalizing = true;
  closingOwners.set(owner, session);
  void session.close().then(
    (closed) => {
      owner.finalizing = false;
      closingOwners.delete(owner);
      return settleSession(session, reason ? { ...closed, reason } : closed);
    },
    () => {
      owner.finalizing = false;
      closingOwners.delete(owner);
    },
  );
}

export function endLiveVoiceSession(reason: string): void {
  const { session, starting, owner } = controller;
  controller.owner = null;
  if (controller.handoff !== null) window.clearTimeout(controller.handoff);
  controller.handoff = null;
  if (controller.providerNoticeTimer !== null) window.clearTimeout(controller.providerNoticeTimer);
  controller.providerNoticeTimer = null;
  if (owner) owner.ended = true;
  clearSessionBudget();
  controller.session = null;
  liveVoiceOutputRef.current = null;
  controller.starting = null;
  stopVoiceReconnect();
  useVoiceSessionStore.getState().setBackendBusy(false);
  useVoiceSessionStore.getState().setToolActivity([]);
  useVoiceSessionStore.getState().setToolApprovals([]);
  if (starting) void starting.catch(() => undefined);
  if (session && owner) closeOwnedSession(owner, session, reason);
  owner?.authority.retire();
}

export function exitVoiceSession(): void {
  controller.paused = false;
  useVoiceSessionStore.getState().setPaused(false);
  endLiveVoiceSession('close_requested');
  useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.exit });
}

export function keepVoiceSessionAcrossNavigation(): void {
  if (controller.handoff !== null) window.clearTimeout(controller.handoff);
  controller.handoff = window.setTimeout(() => {
    controller.handoff = null;
    exitVoiceSession();
  }, NAVIGATION_HANDOFF_MS);
}

export function releaseVoiceSessionOnPageExit(): void {
  if (controller.handoff !== null) return;
  exitVoiceSession();
}

function resumeVoiceSessionAfterNavigation(): void {
  if (controller.handoff === null) return;
  window.clearTimeout(controller.handoff);
  controller.handoff = null;
}

interface LiveVoiceStartSettings {
  voice: string;
  language: string | null;
  pace: number;
  reasoning: LiveVoiceReasoning;
}

function currentVoiceSettings(): LiveVoiceStartSettings {
  const { voice, language, pace, reasoning } = useVoiceSessionStore.getState();
  return { voice, language: language || null, pace, reasoning };
}

function startLiveVoiceSession(settings: LiveVoiceStartSettings): Promise<LiveVoiceSession> {
  if (controller.starting) return controller.starting;
  const previous = controller.owner;
  const sink = reconnectState.active && previous ? previous.sink : controller.sink;
  const identity = reconnectState.active && previous ? previous.identity : sink?.captureSession();
  if (!sink?.managed || !identity?.isCurrent()) {
    useVoiceSessionStore.getState().dispatch({
      type: VOICE_SESSION_EVENT.fail,
      message: 'Live voice requires a signed-in Cloud conversation.',
    });
    return Promise.reject(new DOMException('Managed voice owner is unavailable', 'AbortError'));
  }
  const store = useVoiceSessionStore.getState();
  const owner: VoiceAttempt = {
    sink,
    identity,
    authority: null as unknown as RequestAuthority,
    transcriptAuthority: null as unknown as RequestAuthority,
    conversationId:
      previous && reconnectState.active ? previous.conversationId : sink.conversationId,
    session: null,
    ended: false,
    finalizing: false,
  };
  owner.transcriptAuthority = createRequestAuthority(identity, () =>
    originalConversationIsManaged(owner),
  );
  owner.authority = createRequestAuthority(
    identity,
    () => controller.owner === owner && !owner.ended && destinationIsCurrent(owner),
  );
  controller.owner = owner;
  previous?.authority.retire();
  const current = () => owner.authority.isCurrent();
  const clearOwnedSession = () => {
    if (!current()) return false;
    clearSessionBudget();
    controller.session = null;
    liveVoiceOutputRef.current = null;
    store.setBackendBusy(false);
    return true;
  };
  const startedWithoutConversation = owner.conversationId === null;
  const operation = Promise.resolve()
    .then(async () => {
      owner.authority.assertCurrent();
      const conversationId =
        owner.conversationId ??
        (await sink.onEnsureConversation(owner.authority, (id) => {
          owner.authority.assertCurrent();
          if (owner.conversationId !== null && owner.conversationId !== id)
            throw new Error('Voice destination changed');
          owner.conversationId = id;
        }));
      owner.authority.assertCurrent();
      if (!conversationId) throw new Error('Voice conversation is unavailable');
      owner.conversationId = conversationId;
      return LiveVoiceSession.start({
        authority: owner.authority,
        voice: settings.voice,
        conversationId,
        memoryEnabled: useChatStore.getState().getMemoryEnabled(conversationId),
        language: settings.language,
        pace: settings.pace,
        reasoning: settings.reasoning,
        isMuted: () => useVoiceSessionStore.getState().session.muted,
        callbacks: {
          onStarted: () => {
            if (current()) store.dispatch({ type: VOICE_SESSION_EVENT.ready, listening: true });
          },
          onSpeaking: (speaking) => {
            if (current())
              store.dispatch({ type: VOICE_SESSION_EVENT.assistantSpeech, active: speaking });
          },
          onBackendBusy: (busy) => {
            if (current()) store.setBackendBusy(busy);
          },
          onToolActivity: (activity) => {
            if (current()) store.setToolActivity(activity);
          },
          onToolApprovals: (approvals) => {
            if (current()) store.setToolApprovals(approvals);
          },
          onToolResult: (outcome) => {
            if (current()) store.addToolOutcome(outcome);
          },
          ...(sink.onStartWorkTask
            ? {
                onStartWorkTask: (goal: string) =>
                  current() &&
                  owner.conversationId !== null &&
                  (sink.onStartWorkTask?.(goal, owner.conversationId, owner.authority) ?? false),
              }
            : {}),
          onTranscript: (turn) => deliverTranscript(owner, turn),
          onUsage: () => undefined,
          onClosed: (closed) => {
            if (!clearOwnedSession()) return;
            owner.ended = true;
            if (owner.session) void settleSession(owner.session, closed);
            if (controller.paused) return;
            store.dispatch(
              REMOTE_CLOSE_REASONS_WITH_NOTICE.has(closed.reason)
                ? { type: VOICE_SESSION_EVENT.fail, message: LIVE_SESSION_MESSAGE.sessionEnded }
                : { type: VOICE_SESSION_EVENT.exit },
            );
          },
          onError: (message) => {
            if (!clearOwnedSession()) return;
            owner.ended = true;
            stopVoiceReconnect();
            store.dispatch({ type: VOICE_SESSION_EVENT.fail, message });
          },
          onProviderError: () => {
            if (!current()) return;
            reportClientFailure({ failure: 'voice_provider_error', detail: 'rejected' });
            showVoiceNotice(LIVE_SESSION_MESSAGE.providerError);
          },
          onSources: (sources) => {
            if (current()) store.setSources(sources);
          },
          onPlaybackBlocked: () => {
            if (!current()) return;
            reportClientFailure({ failure: 'voice_audio_blocked', detail: 'permission_denied' });
            store.setPlaybackBlocked(true);
          },
          onConnectionLost: (message) => {
            if (!clearOwnedSession()) return;
            if (owner.session)
              void settleSession(owner.session, {
                reason: 'connection_lost',
                seconds: owner.session.lastUsageSeconds,
              });
            const retrying = scheduleVoiceReconnect();
            if (!retrying) stopVoiceReconnect();
            store.dispatch({
              type: VOICE_SESSION_EVENT.fail,
              message: retrying ? message : LIVE_SESSION_MESSAGE.reconnectFailed,
            });
          },
        },
      });
    })
    .then((session) => {
      owner.session = session;
      if (!current()) {
        closeOwnedSession(owner, session);
        throw new DOMException('Voice attempt retired', 'AbortError');
      }
      controller.starting = null;
      controller.session = session;
      liveVoiceOutputRef.current = session.outputElement;
      markVoiceReconnected();
      trackSessionBudget(session);
      return session;
    })
    .catch((error: unknown) => {
      if (!owner.session && startedWithoutConversation && owner.conversationId) {
        sink.onDiscardConversation?.(owner.conversationId);
        owner.conversationId = null;
      }
      if (controller.owner === owner) controller.starting = null;
      if (controller.owner !== owner || owner.ended || !destinationIsCurrent(owner)) throw error;
      controller.starting = null;
      const message =
        error instanceof LiveVoiceSessionError
          ? error.message
          : LIVE_SESSION_MESSAGE.connectionFailed;
      const usageLimited = isUsageLimitError(error);
      const recoverable =
        !usageLimited &&
        (!(error instanceof LiveVoiceSessionError) || !UNRECOVERABLE_START_CODES.has(error.code));
      if (!(reconnectState.active && recoverable && scheduleVoiceReconnect())) stopVoiceReconnect();
      store.setUsageLimited(usageLimited);
      store.dispatch({ type: VOICE_SESSION_EVENT.fail, message });
      throw error;
    });
  controller.starting = operation;
  return operation;
}

export function useVoiceSession({
  managed,
  turnActive,
  conversationId,
  onSend,
  onStartWorkTask,
  onEnsureConversation,
  onDiscardConversation,
  onTranscript,
  onCaption,
}: UseVoiceSessionOptions): VoiceSessionController {
  const state = useVoiceSessionStore((store) => store.session);
  const voice = useVoiceSessionStore((store) => store.voice);
  const language = useVoiceSessionStore((store) => store.language);
  const pace = useVoiceSessionStore((store) => store.pace);
  const backendBusy = useVoiceSessionStore((store) => store.backendBusy);
  const toolActivity = useVoiceSessionStore((store) => store.toolActivity);
  const toolOutcomes = useVoiceSessionStore((store) => store.toolOutcomes);
  const toolApprovals = useVoiceSessionStore((store) => store.toolApprovals);
  const paused = useVoiceSessionStore((store) => store.paused);
  const rejoinOffer = useVoiceSessionStore((store) => store.rejoinOffer);
  const dispatch = useVoiceSessionStore((store) => store.dispatch);
  const reducedMotion = usePrefersReducedMotion();
  const reconnect = useSyncExternalStore(
    subscribeToReconnectState,
    () => reconnectState,
    () => NOT_RECONNECTING,
  );
  const [deviceName, setDeviceName] = useState(() => controller.session?.microphoneLabel ?? '');
  const [callElapsedMs, setCallElapsedMs] = useState(() =>
    voiceCallElapsedMs(controller.clock, Date.now()),
  );

  const { status, muted } = state;
  const active = isVoiceSessionActive(status);
  const callEnded = status === VOICE_SESSION_STATUS.exited;
  const callRunning = voiceCallClockRunning(status, paused);

  const captureSession = useSessionSnapshot();
  const surface = useRef({});
  const sink = useRef<TranscriptSink>({
    surface: surface.current,
    managed,
    captureSession,
    conversationId,
    onStartWorkTask,
    onEnsureConversation,
    onDiscardConversation,
    onTranscript,
    onCaption,
  });
  sink.current = {
    surface: surface.current,
    managed,
    captureSession,
    conversationId,
    onStartWorkTask,
    onEnsureConversation,
    onDiscardConversation,
    onTranscript,
    onCaption,
  };
  controller.sink = sink.current;

  useEffect(() => {
    for (const [closing, session] of closingOwners) {
      if (!closing.identity.isCurrent()) session.dispose();
    }
    const owner = controller.owner;
    if (owner && !destinationIsCurrent(owner)) exitVoiceSession();
    if (!managed) useVoiceSessionStore.getState().setRejoinOffer(null);
  });

  useEffect(
    () =>
      useVoiceSessionStore.subscribe((next, previous) => {
        if (
          next.session !== previous.session &&
          next.session.status === VOICE_SESSION_STATUS.exited
        ) {
          endLiveVoiceSession('account_changed');
        }
      }),
    [],
  );

  useEffect(() => {
    resumeVoiceSessionAfterNavigation();
  }, []);

  useEffect(() => {
    const now = Date.now();
    controller.clock = callEnded
      ? INITIAL_VOICE_CALL_CLOCK
      : advanceVoiceCallClock(controller.clock, callRunning, now);
    setCallElapsedMs(voiceCallElapsedMs(controller.clock, now));
    if (!callRunning) return undefined;
    const timer = window.setInterval(
      () => setCallElapsedMs(voiceCallElapsedMs(controller.clock, Date.now())),
      CALL_CLOCK_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [callEnded, callRunning]);

  // The settings a session starts with are read once, so a later change
  // re-negotiates the open session below instead of restarting the connection.
  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.entering) return undefined;
    if (!managed) {
      dispatch({
        type: VOICE_SESSION_EVENT.fail,
        message: 'Live voice requires a Cloud conversation.',
      });
      return undefined;
    }
    let cancelled = false;
    const start = () =>
      startLiveVoiceSession(currentVoiceSettings()).then(
        (session) => {
          if (!cancelled) setDeviceName(session.microphoneLabel);
        },
        () => undefined,
      );
    const targetConversation = controller.sink?.conversationId ?? null;
    if (!targetConversation || controller.session || controller.starting || reconnectState.active) {
      void start();
    } else {
      const identity = captureSession();
      if (!identity || !managed) return undefined;
      const authority = createRequestAuthority(
        identity,
        () =>
          !cancelled &&
          controller.sink?.managed === true &&
          controller.sink.conversationId === targetConversation,
      );
      void readActiveVoiceSession(targetConversation, authority).then((offer) => {
        if (cancelled || !authority.isCurrent()) return;
        if (offer) useVoiceSessionStore.getState().setRejoinOffer(offer);
        else void start();
      });
    }
    return () => {
      cancelled = true;
      useVoiceSessionStore.getState().setRejoinOffer(null);
    };
  }, [status, managed, conversationId, captureSession, dispatch]);

  const answerRejoin = useCallback((rejoin: boolean) => {
    const store = useVoiceSessionStore.getState();
    const offer = store.rejoinOffer;
    if (!offer) return;
    store.setRejoinOffer(null);
    if (rejoin) {
      if (offer.voice) store.setVoice(offer.voice);
      if (offer.language !== null) store.setLanguage(offer.language);
      if (offer.pace !== null) store.setPace(offer.pace);
    }
    startLiveVoiceSession(currentVoiceSettings()).then(
      (session) => setDeviceName(session.microphoneLabel),
      () => undefined,
    );
  }, []);

  // A language or pace change reaches the running session without dropping the
  // utterance in flight; a voice change takes effect on the next session.
  useEffect(() => {
    if (!isVoiceSessionActive(status) || status === VOICE_SESSION_STATUS.entering) return undefined;
    void controller.session?.updateSettings({ voice, language: language || null, pace });
    return undefined;
  }, [status, voice, language, pace]);

  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.streaming || turnActive) return undefined;
    dispatch({ type: VOICE_SESSION_EVENT.replyComplete, spoken: false });
    return undefined;
  }, [status, turnActive, dispatch]);

  // A microphone granted after the refusal retries on its own, so the user does
  // not have to find the control again once the browser prompt is answered.
  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.error) return undefined;
    if (state.error !== LIVE_SESSION_MESSAGE.microphoneDenied) return undefined;
    const permissions = navigator.permissions;
    if (!permissions?.query) return undefined;
    let granted: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (granted?.state === 'granted') dispatch({ type: VOICE_SESSION_EVENT.retry });
    };
    void permissions.query({ name: 'microphone' as PermissionName }).then(
      (result) => {
        if (cancelled) return;
        granted = result;
        result.addEventListener('change', onChange);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      granted?.removeEventListener('change', onChange);
    };
  }, [status, state.error, dispatch]);

  useEffect(() => {
    if (!active) return undefined;
    const onPageHide = () => endLiveVoiceSession('page_hidden');
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', retryVoiceReconnectNow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', retryVoiceReconnectNow);
    };
  }, [active]);

  const enter = useCallback(() => {
    useVoiceInputStore.getState().cancelListening();
    dispatch({ type: VOICE_SESSION_EVENT.enter });
  }, [dispatch]);

  const exit = useCallback(() => exitVoiceSession(), []);

  const pause = useCallback(() => {
    if (controller.paused) return;
    controller.paused = true;
    useVoiceSessionStore.getState().setPaused(true);
    endLiveVoiceSession('paused');
    dispatch({ type: VOICE_SESSION_EVENT.mute });
  }, [dispatch]);

  const resume = useCallback(() => {
    if (!controller.paused) return;
    controller.paused = false;
    useVoiceSessionStore.getState().setPaused(false);
    dispatch({ type: VOICE_SESSION_EVENT.unmute });
    startLiveVoiceSession(currentVoiceSettings()).then(
      (session) => setDeviceName(session.microphoneLabel),
      () => undefined,
    );
  }, [dispatch]);

  const toggleMute = useCallback(() => {
    if (controller.paused) {
      resume();
      return;
    }
    const next = !muted;
    controller.session?.setMuted(next);
    dispatch({ type: next ? VOICE_SESSION_EVENT.mute : VOICE_SESSION_EVENT.unmute });
  }, [muted, dispatch, resume]);

  const cancelPending = useCallback(() => {
    dispatch({ type: VOICE_SESSION_EVENT.cancelUtterance });
  }, [dispatch]);

  const cancelBackendWork = useCallback(() => {
    controller.session?.cancelBackendWork();
  }, []);

  const shareAttachment = useCallback((file: File) => {
    const session = controller.session;
    if (!session) {
      showVoiceNotice(VOICE_ATTACHMENT_MESSAGE.unavailable);
      return;
    }
    void session.shareAttachment(file).then((outcome) => {
      if (controller.session !== session) return;
      showVoiceNotice(VOICE_ATTACHMENT_MESSAGE[outcome]);
    });
  }, []);

  const resumePlayback = useCallback(() => {
    const session = controller.session;
    if (!session) return;
    void session.resumePlayback().then((played) => {
      if (played && controller.session === session)
        useVoiceSessionStore.getState().setPlaybackBlocked(false);
    });
  }, []);

  const decideToolApproval = useCallback((callId: string, decision: LiveVoiceToolDecision) => {
    void controller.session?.decideToolApproval(callId, decision);
  }, []);

  const submitTyped = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      dispatch({ type: VOICE_SESSION_EVENT.typedSubmit });
      if (!onSend(trimmed)) {
        dispatch({ type: VOICE_SESSION_EVENT.fail, message: MESSAGE.sendFailed });
      }
    },
    [dispatch, onSend],
  );

  const retry = useCallback(() => {
    endLiveVoiceSession('retry');
    dispatch({ type: VOICE_SESSION_EVENT.retry });
  }, [dispatch]);

  return {
    state,
    active,
    reducedMotion,
    deviceName,
    backendBusy,
    toolActivity,
    toolOutcomes,
    audioLevel: voiceLevel,
    toolApprovals,
    decideToolApproval,
    cancelBackendWork,
    reconnecting: reconnect.active,
    reconnectAttempt: reconnect.attempt,
    reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS,
    mutedHint: MESSAGE.mutedHint,
    enter,
    exit,
    toggleMute,
    pause,
    resume,
    paused,
    callElapsedMs,
    rejoinOffer,
    answerRejoin,
    cancelPending,
    submitTyped,
    retry,
    resumePlayback,
    shareAttachment,
  };
}
