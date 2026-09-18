'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { getCsrfToken } from '@/lib/client/csrf';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
import { usePrefersReducedMotion } from '@features/support/hooks/usePrefersReducedMotion';
import {
  isVoiceSessionActive,
  VOICE_SESSION_EVENT,
  VOICE_SESSION_STATUS,
  type VoiceSessionState,
} from '@agiworkforce/unified-chat';
import {
  LIVE_SESSION_ENDPOINT,
  LIVE_SESSION_MESSAGE,
  LiveVoiceSession,
  LiveVoiceSessionError,
  type LiveSessionClosed,
  type LiveTranscriptTurn,
} from '@features/chat/lib/live-voice-session';

const MESSAGE = {
  sendFailed: 'That turn could not be sent. Try again.',
  mutedHint: 'Muted, tap the mic to talk',
} as const;

const CSRF_HEADER = 'x-csrf-token';
const REMOTE_CLOSE_REASONS_WITH_NOTICE = new Set(['expired', 'content', 'connection_lost']);

export type { LiveTranscriptTurn as VoiceTranscriptTurn };

export interface UseVoiceSessionOptions {
  turnActive: boolean;
  conversationId: string | null;
  onSend: (text: string) => boolean;
  onEnsureConversation: () => Promise<string | null>;
  onTranscript: (conversationId: string, turn: LiveTranscriptTurn) => void;
}

export interface VoiceSessionController {
  state: VoiceSessionState;
  active: boolean;
  reducedMotion: boolean;
  deviceName: string;
  backendBusy: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  reconnectMaxAttempts: number;
  mutedHint: string;
  enter: () => void;
  exit: () => void;
  toggleMute: () => void;
  cancelPending: () => void;
  submitTyped: (text: string) => void;
  retry: () => void;
}

interface TranscriptSink {
  conversationId: string | null;
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

const controller = {
  session: null as LiveVoiceSession | null,
  starting: null as Promise<LiveVoiceSession> | null,
  conversation: null as Promise<string | null> | null,
  sink: null as TranscriptSink | null,
  handoff: null as number | null,
  attempt: 0,
  reconnectTimer: null as number | null,
  stableTimer: null as number | null,
};

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
        }),
      }),
    )
    .then(() => undefined)
    .catch(() => undefined);
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
  controller.session = null;
  controller.starting = null;
  controller.conversation = null;
  stopVoiceReconnect();
  useVoiceSessionStore.getState().setBackendBusy(false);
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

function startLiveVoiceSession(voice: string): Promise<LiveVoiceSession> {
  const store = useVoiceSessionStore.getState();
  controller.starting ??= LiveVoiceSession.start({
    voice,
    conversationId: controller.sink?.conversationId ?? null,
    callbacks: {
      onStarted: () => store.dispatch({ type: VOICE_SESSION_EVENT.ready, listening: true }),
      onSpeaking: (speaking) =>
        store.dispatch({ type: VOICE_SESSION_EVENT.assistantSpeech, active: speaking }),
      onBackendBusy: store.setBackendBusy,
      onTranscript: deliverTranscript,
      onUsage: () => undefined,
      onClosed: (closed) => {
        const session = controller.session;
        controller.session = null;
        store.setBackendBusy(false);
        if (session) void settleSession(session, closed);
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
        controller.session = null;
        store.setBackendBusy(false);
        stopVoiceReconnect();
        store.dispatch({ type: VOICE_SESSION_EVENT.fail, message });
      },
      onConnectionLost: (message) => {
        const dropped = controller.session;
        controller.session = null;
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
  }).then(
    (session) => {
      controller.starting = null;
      controller.session = session;
      markVoiceReconnected();
      void ensureConversation();
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
  onEnsureConversation,
  onTranscript,
}: UseVoiceSessionOptions): VoiceSessionController {
  const state = useVoiceSessionStore((store) => store.session);
  const voice = useVoiceSessionStore((store) => store.voice);
  const backendBusy = useVoiceSessionStore((store) => store.backendBusy);
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

  controller.sink = { conversationId, onEnsureConversation, onTranscript };

  useEffect(() => {
    resumeVoiceSessionAfterNavigation();
  }, []);

  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.entering) return undefined;
    let cancelled = false;
    startLiveVoiceSession(voice).then(
      (session) => {
        if (!cancelled) setDeviceName(session.microphoneLabel);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [status, voice]);

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

  const toggleMute = useCallback(() => {
    const next = !muted;
    controller.session?.setMuted(next);
    dispatch({ type: next ? VOICE_SESSION_EVENT.mute : VOICE_SESSION_EVENT.unmute });
  }, [muted, dispatch]);

  const cancelPending = useCallback(() => {
    dispatch({ type: VOICE_SESSION_EVENT.cancelUtterance });
  }, [dispatch]);

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
    reconnecting: reconnect.active,
    reconnectAttempt: reconnect.attempt,
    reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS,
    mutedHint: MESSAGE.mutedHint,
    enter,
    exit,
    toggleMute,
    cancelPending,
    submitTyped,
    retry,
  };
}
