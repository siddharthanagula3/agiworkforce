import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useChatStore } from '@/stores/chatStore';
import { requestMicPermission } from '@/src/features/voice/services/voiceInput';
import {
  LIVE_VOICE_MESSAGE,
  liveVoiceUnavailableReason,
} from '@/src/features/voice/services/liveVoiceAvailability';
import type {
  LiveSessionClosed,
  LiveTranscriptTurn,
  LiveVoiceSession,
} from '@/src/features/voice/services/liveVoiceSession';
import {
  loadLiveVoiceModule,
  type LiveVoiceModule,
} from '@/src/features/voice/services/liveVoiceModule';

let liveVoice: LiveVoiceModule | null = null;

async function loadLiveVoice(): Promise<LiveVoiceModule> {
  liveVoice ??= await loadLiveVoiceModule();
  return liveVoice;
}

function startFailureMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'LiveVoiceSessionError') return error.message;
  return LIVE_VOICE_MESSAGE.connectionFailed;
}

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface LiveVoiceController {
  status: LiveVoiceStatus;
  muted: boolean;
  assistantSpeaking: boolean;
  backendBusy: boolean;
  interrupted: boolean;
  turns: LiveTranscriptTurn[];
  error: string | null;
  toggleMute: () => void;
  retry: () => void;
}

export interface UseLiveVoiceSessionOptions {
  active: boolean;
  conversationId: string | null;
  model: string;
  ensureConversation: () => Promise<string | null>;
  onEnded: (message: string | null) => void;
}

export function useLiveVoiceSession({
  active,
  conversationId,
  model,
  ensureConversation,
  onEnded,
}: UseLiveVoiceSessionOptions): LiveVoiceController {
  const appendVoiceTurn = useChatStore((s) => s.appendVoiceTurn);
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [backendBusy, setBackendBusy] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [turns, setTurns] = useState<LiveTranscriptTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const sessionRef = useRef<LiveVoiceSession | null>(null);
  const conversationRef = useRef<string | null>(conversationId);
  const ensureRef = useRef(ensureConversation);
  const endedRef = useRef(onEnded);
  const appendRef = useRef(appendVoiceTurn);
  const modelRef = useRef(model);

  conversationRef.current = conversationId ?? conversationRef.current;
  ensureRef.current = ensureConversation;
  endedRef.current = onEnded;
  appendRef.current = appendVoiceTurn;
  modelRef.current = model;

  const recordTurn = useCallback((turn: LiveTranscriptTurn) => {
    setTurns((previous) => {
      const index = previous.findIndex((entry) => entry.turnId === turn.turnId);
      if (index === -1) return [...previous, turn];
      const next = [...previous];
      next[index] = turn;
      return next;
    });
    if (!turn.final) return;
    const target = conversationRef.current;
    if (!target) return;
    appendRef.current(target, {
      id: turn.turnId,
      role: turn.role,
      content: turn.text,
      model: modelRef.current,
    });
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setStatus('connecting');
    setError(null);
    setTurns([]);
    setMuted(false);
    setInterrupted(false);

    const finish = (session: LiveVoiceSession, closed: LiveSessionClosed) => {
      void liveVoice?.settleLiveVoiceSession(session.sessionId, session.settlement, closed);
    };

    const run = async () => {
      const unavailable = liveVoiceUnavailableReason();
      if (unavailable) throw new Error(unavailable);
      const module = await loadLiveVoice();
      if (!(await requestMicPermission())) {
        throw new module.LiveVoiceSessionError(
          LIVE_VOICE_MESSAGE.microphoneDenied,
          'microphone_denied',
        );
      }
      conversationRef.current = (await ensureRef.current()) ?? conversationRef.current;
      return module.LiveVoiceSession.start({
        voice: null,
        conversationId: conversationRef.current,
        callbacks: {
          onStarted: () => {
            if (!cancelled) setStatus('live');
          },
          onAssistantSpeaking: (speaking) => {
            if (cancelled) return;
            setAssistantSpeaking(speaking);
            if (speaking) setInterrupted(false);
          },
          onBackendBusy: (busy) => {
            if (!cancelled) setBackendBusy(busy);
          },
          onTranscript: recordTurn,
          onInterrupted: () => {
            if (!cancelled) setInterrupted(true);
          },
          onUsage: () => undefined,
          onClosed: (closed) => {
            const session = sessionRef.current;
            sessionRef.current = null;
            if (session) finish(session, closed);
            if (cancelled) return;
            setStatus('idle');
            setBackendBusy(false);
            endedRef.current(
              closed.reason === 'close_requested' ? null : LIVE_VOICE_MESSAGE.sessionEnded,
            );
          },
          onError: (message) => {
            sessionRef.current = null;
            if (cancelled) return;
            setStatus('error');
            setBackendBusy(false);
            setError(message);
          },
        },
      });
    };

    run().then(
      (session) => {
        if (cancelled) {
          void session.close().then((closed) => finish(session, closed));
          return;
        }
        sessionRef.current = session;
      },
      (startError: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(startFailureMessage(startError));
      },
    );

    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' || cancelled) return;
      cancelled = true;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void session.close().then((closed) => finish(session, closed));
      setStatus('idle');
      setAssistantSpeaking(false);
      setBackendBusy(false);
      endedRef.current(LIVE_VOICE_MESSAGE.sessionEnded);
    });

    return () => {
      cancelled = true;
      appState.remove();
      const session = sessionRef.current;
      sessionRef.current = null;
      setStatus('idle');
      setAssistantSpeaking(false);
      setBackendBusy(false);
      if (session) void session.close().then((closed) => finish(session, closed));
    };
  }, [active, attempt, recordTurn]);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      sessionRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    status,
    muted,
    assistantSpeaking,
    backendBusy,
    interrupted,
    turns,
    error,
    toggleMute,
    retry,
  };
}
