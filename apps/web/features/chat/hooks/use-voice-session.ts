'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type {
  LiveVoicePendingApproval,
  LiveVoiceToolDecision,
} from '@agiworkforce/cloud-contracts';
import { getCsrfToken } from '@/lib/client/csrf';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import {
  useVoiceSessionStore,
  type VoiceRejoinOffer,
} from '@features/chat/stores/voice-session-store';
import { usePrefersReducedMotion } from '@features/support/hooks/usePrefersReducedMotion';
import {
  isVoiceSessionActive,
  VOICE_SESSION_EVENT,
  VOICE_SESSION_STATUS,
  type VoiceOrbLevelSource,
  type VoiceSessionState,
} from '@agiworkforce/unified-chat';
import {
  LIVE_SESSION_ENDPOINT,
  LIVE_SESSION_MESSAGE,
  LiveVoiceSession,
  LiveVoiceSessionError,
  readLiveSessionError,
  type LiveSessionClosed,
  type LiveTranscriptTurn,
  type LiveVoiceToolActivity,
  type LiveVoiceToolOutcome,
} from '@features/chat/lib/live-voice-session';

const MESSAGE = {
  sendFailed: 'That turn could not be sent. Try again.',
  mutedHint: 'Muted, tap the mic to talk',
} as const;

const CSRF_HEADER = 'x-csrf-token';
const REMOTE_CLOSE_REASONS_WITH_NOTICE = new Set(['expired', 'content', 'connection_lost']);
const EXTEND_LEAD_MS = 60_000;
const EXTEND_RETRY_MS = 10_000;
const FIRST_EXTENSION_BLOCK = 2;

interface SessionBudget {
  session: LiveVoiceSession;
  startedAtMs: number;
  ceilingSeconds: number;
  nextBlock: number;
}

type BlockExtension =
  { ok: true; ceilingSeconds: number } | { ok: false; retry: boolean; notice: string };

export type { LiveTranscriptTurn as VoiceTranscriptTurn };

export interface UseVoiceSessionOptions {
  turnActive: boolean;
  conversationId: string | null;
  onSend: (text: string) => boolean;
  onStartWorkTask?: (goal: string) => boolean;
  onEnsureConversation: () => Promise<string | null>;
  onTranscript: (conversationId: string, turn: LiveTranscriptTurn) => void;
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
  rejoinOffer: VoiceRejoinOffer | null;
  answerRejoin: (rejoin: boolean) => void;
  cancelPending: () => void;
  submitTyped: (text: string) => void;
  retry: () => void;
}

interface TranscriptSink {
  conversationId: string | null;
  onStartWorkTask?: ((goal: string) => boolean) | undefined;
  onEnsureConversation: () => Promise<string | null>;
  onTranscript: (conversationId: string, turn: LiveTranscriptTurn) => void;
}

const NAVIGATION_HANDOFF_MS = 5_000;

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
  session: null as LiveVoiceSession | null,
  starting: null as Promise<LiveVoiceSession> | null,
  conversation: null as Promise<string | null> | null,
  sink: null as TranscriptSink | null,
  handoff: null as number | null,
  attempt: 0,
  reconnectTimer: null as number | null,
  stableTimer: null as number | null,
  budget: null as SessionBudget | null,
  budgetTimer: null as number | null,
  paused: false,
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
  controller.attempt += 1;
  publishReconnectState({ active: true, attempt: controller.attempt });
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (controller.attempt - 1));
  if (controller.reconnectTimer !== null) window.clearTimeout(controller.reconnectTimer);
  controller.reconnectTimer = window.setTimeout(() => {
    controller.reconnectTimer = null;
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.retry });
  }, delay);
  return true;
}

/** The network coming back is better evidence than the remaining backoff. */
function retryVoiceReconnectNow(): void {
  if (!reconnectState.active || controller.reconnectTimer === null) return;
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

async function readActiveVoiceSession(conversationId: string): Promise<VoiceRejoinOffer | null> {
  try {
    const response = await fetch(
      `${LIVE_SESSION_ENDPOINT}/active?conversationId=${encodeURIComponent(conversationId)}`,
      { credentials: 'include' },
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
  return getCsrfToken()
    .then((token) =>
      fetch(`${LIVE_SESSION_ENDPOINT}/${encodeURIComponent(session.sessionId)}/close`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: token },
        body: JSON.stringify({
          seconds: closed.seconds ?? session.lastUsageSeconds ?? 0,
          reason: closed.reason,
          settlement: session.settlement,
          ...(session.lastTurnId ? { lastTurnId: session.lastTurnId } : {}),
        }),
      }),
    )
    .then(() => undefined)
    .catch(() => undefined);
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
  return getCsrfToken()
    .then((token) =>
      fetch(`${LIVE_SESSION_ENDPOINT}/${encodeURIComponent(session.sessionId)}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: token },
        body: JSON.stringify({ block, settlement: session.settlement }),
      }),
    )
    .then(async (response): Promise<BlockExtension> => {
      if (!response.ok) {
        const error = await readLiveSessionError(response);
        return { ok: false, retry: response.status >= 500, notice: error.message };
      }
      const body = (await response.json()) as { ceilingSeconds?: unknown };
      return typeof body.ceilingSeconds === 'number'
        ? { ok: true, ceilingSeconds: body.ceilingSeconds }
        : { ok: false, retry: true, notice: LIVE_SESSION_MESSAGE.sessionEnded };
    })
    .catch((): BlockExtension => ({
      ok: false,
      retry: true,
      notice: LIVE_SESSION_MESSAGE.connectionDropped,
    }));
}

function endSessionAtLimit(notice: string): void {
  endLiveVoiceSession('usage_limit');
  useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.fail, message: notice });
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
  scheduleBudget(budget, msUntilCeiling(budget), () => endSessionAtLimit(result.notice));
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

function ensureConversation(): Promise<string | null> {
  controller.conversation ??= (controller.sink?.onEnsureConversation() ?? Promise.resolve(null))
    .catch(() => null)
    .then((id) => id ?? controller.sink?.conversationId ?? null);
  return controller.conversation;
}

function deliverTranscript(turn: LiveTranscriptTurn): void {
  void ensureConversation().then((id) => {
    if (id) controller.sink?.onTranscript(id, turn);
  });
}

export function endLiveVoiceSession(reason: string): void {
  const { session, starting } = controller;
  clearSessionBudget();
  controller.session = null;
  liveVoiceOutputRef.current = null;
  controller.starting = null;
  controller.conversation = null;
  stopVoiceReconnect();
  useVoiceSessionStore.getState().setBackendBusy(false);
  useVoiceSessionStore.getState().setToolActivity([]);
  useVoiceSessionStore.getState().setToolApprovals([]);
  if (starting) {
    void starting.then(
      (started) => started.close().then((closed) => settleSession(started, { ...closed, reason })),
      () => undefined,
    );
  }
  if (session) {
    void session.close().then((closed) => settleSession(session, { ...closed, reason }));
  }
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
}

function currentVoiceSettings(): LiveVoiceStartSettings {
  const { voice, language, pace } = useVoiceSessionStore.getState();
  return { voice, language: language || null, pace };
}

function startLiveVoiceSession(settings: LiveVoiceStartSettings): Promise<LiveVoiceSession> {
  const store = useVoiceSessionStore.getState();
  // The conversation is settled before the offer, so the session the server
  // records is bound to exactly one conversation rather than to none.
  controller.starting ??= ensureConversation()
    .catch(() => null)
    .then((conversationId) =>
      LiveVoiceSession.start({
        voice: settings.voice,
        conversationId: conversationId ?? controller.sink?.conversationId ?? null,
        language: settings.language,
        pace: settings.pace,
        callbacks: {
          onStarted: () => store.dispatch({ type: VOICE_SESSION_EVENT.ready, listening: true }),
          onSpeaking: (speaking) =>
            store.dispatch({ type: VOICE_SESSION_EVENT.assistantSpeech, active: speaking }),
          onBackendBusy: store.setBackendBusy,
          onToolActivity: store.setToolActivity,
          onToolApprovals: store.setToolApprovals,
          onToolResult: store.addToolOutcome,
          ...(controller.sink?.onStartWorkTask
            ? {
                onStartWorkTask: (goal: string) =>
                  controller.sink?.onStartWorkTask?.(goal) ?? false,
              }
            : {}),
          onTranscript: deliverTranscript,
          onUsage: () => undefined,
          onClosed: (closed) => {
            const session = controller.session;
            clearSessionBudget();
            controller.session = null;
            liveVoiceOutputRef.current = null;
            store.setBackendBusy(false);
            if (session) void settleSession(session, closed);
            if (controller.paused) return;
            if (REMOTE_CLOSE_REASONS_WITH_NOTICE.has(closed.reason)) {
              store.dispatch({
                type: VOICE_SESSION_EVENT.fail,
                message: LIVE_SESSION_MESSAGE.sessionEnded,
              });
            } else {
              store.dispatch({ type: VOICE_SESSION_EVENT.exit });
            }
          },
          onError: (message) => {
            clearSessionBudget();
            controller.session = null;
            liveVoiceOutputRef.current = null;
            store.setBackendBusy(false);
            stopVoiceReconnect();
            store.dispatch({ type: VOICE_SESSION_EVENT.fail, message });
          },
          onConnectionLost: (message) => {
            const dropped = controller.session;
            clearSessionBudget();
            controller.session = null;
            liveVoiceOutputRef.current = null;
            store.setBackendBusy(false);
            if (dropped) {
              void settleSession(dropped, {
                reason: 'connection_lost',
                seconds: dropped.lastUsageSeconds,
              });
            }
            const retrying = scheduleVoiceReconnect();
            if (!retrying) stopVoiceReconnect();
            store.dispatch({
              type: VOICE_SESSION_EVENT.fail,
              message: retrying ? message : LIVE_SESSION_MESSAGE.reconnectFailed,
            });
          },
        },
      }),
    )
    .then(
      (session) => {
        controller.starting = null;
        controller.session = session;
        liveVoiceOutputRef.current = session.outputElement;
        markVoiceReconnected();
        trackSessionBudget(session);
        return session;
      },
      (error: unknown) => {
        controller.starting = null;
        const message =
          error instanceof LiveVoiceSessionError
            ? error.message
            : LIVE_SESSION_MESSAGE.connectionFailed;
        const recoverable =
          !(error instanceof LiveVoiceSessionError) || !UNRECOVERABLE_START_CODES.has(error.code);
        if (!(reconnectState.active && recoverable && scheduleVoiceReconnect())) {
          stopVoiceReconnect();
        }
        store.dispatch({ type: VOICE_SESSION_EVENT.fail, message });
        throw error;
      },
    );
  return controller.starting;
}

export function useVoiceSession({
  turnActive,
  conversationId,
  onSend,
  onStartWorkTask,
  onEnsureConversation,
  onTranscript,
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

  const { status, muted } = state;
  const active = isVoiceSessionActive(status);

  controller.sink = { conversationId, onStartWorkTask, onEnsureConversation, onTranscript };

  useEffect(() => {
    resumeVoiceSessionAfterNavigation();
  }, []);

  // The settings a session starts with are read once, so a later change
  // re-negotiates the open session below instead of restarting the connection.
  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.entering) return undefined;
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
      void readActiveVoiceSession(targetConversation).then((offer) => {
        if (cancelled) return;
        if (offer) useVoiceSessionStore.getState().setRejoinOffer(offer);
        else void start();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [status]);

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

  // A voice, language or pace change while the session is up re-negotiates it,
  // so a language switch lands without dropping the utterance in flight.
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
    rejoinOffer,
    answerRejoin,
    cancelPending,
    submitTyped,
    retry,
  };
}
