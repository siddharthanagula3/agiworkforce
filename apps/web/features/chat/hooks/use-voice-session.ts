'use client';

import { useCallback, useEffect, useState } from 'react';

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

const controller = {
  session: null as LiveVoiceSession | null,
  starting: null as Promise<LiveVoiceSession> | null,
  conversation: null as Promise<string | null> | null,
  sink: null as TranscriptSink | null,
  handoff: null as number | null,
};

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
        store.dispatch({ type: VOICE_SESSION_EVENT.fail, message });
      },
    },
  }).then(
    (session) => {
      controller.starting = null;
      controller.session = session;
      void ensureConversation();
      return session;
    },
    (error: unknown) => {
      controller.starting = null;
      store.dispatch({
        type: VOICE_SESSION_EVENT.fail,
        message:
          error instanceof LiveVoiceSessionError
            ? error.message
            : LIVE_SESSION_MESSAGE.connectionFailed,
      });
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

  useEffect(() => {
    if (!active) return undefined;
    const onPageHide = () => endLiveVoiceSession('page_hidden');
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
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
    mutedHint: MESSAGE.mutedHint,
    enter,
    exit,
    toggleMute,
    cancelPending,
    submitTyped,
    retry,
  };
}
