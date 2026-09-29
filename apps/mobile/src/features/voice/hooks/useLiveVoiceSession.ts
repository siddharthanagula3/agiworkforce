import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type {
  LiveVoicePendingApproval,
  LiveVoiceToolDecision,
} from '@agiworkforce/cloud-contracts';
import { isLiveVoice } from '@agiworkforce/types/live-voices';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { requestMicPermission } from '@/src/features/voice/services/voiceInput';
import { applyAudioRoute } from '@/src/features/voice/services/audioRoute';
import {
  activeAudioRoute,
  activeSpeechLanguage,
} from '@/src/features/voice/services/speechSettings';
import {
  LIVE_VOICE_MESSAGE,
  liveVoiceUnavailableReason,
} from '@/src/features/voice/services/liveVoiceAvailability';
import type {
  LiveSessionClosed,
  LiveTranscriptTurn,
  LiveVoiceSession,
  LiveVoiceToolActivity,
  LiveVoiceToolOutcome,
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

const RECONNECT_MAX_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1_000;
const TOOL_OUTCOME_LIMIT = 3;

export interface LiveVoiceController {
  status: LiveVoiceStatus;
  reconnecting: boolean;
  muted: boolean;
  assistantSpeaking: boolean;
  backendBusy: boolean;
  interrupted: boolean;
  turns: LiveTranscriptTurn[];
  error: string | null;
  approvals: readonly LiveVoicePendingApproval[];
  toolActivity: readonly LiveVoiceToolActivity[];
  toolOutcomes: readonly LiveVoiceToolOutcome[];
  decideToolApproval: (callId: string, decision: LiveVoiceToolDecision) => void;
  toggleMute: () => void;
  cancelBackendWork: () => void;
  retry: () => void;
}

export interface UseLiveVoiceSessionOptions {
  active: boolean;
  conversationId: string | null;
  model: string;
  ensureConversation: () => Promise<string | null>;
  onEnded: (message: string | null) => void;
  onStartWorkTask?: (goal: string) => boolean;
}

export function useLiveVoiceSession({
  active,
  conversationId,
  model,
  ensureConversation,
  onEnded,
  onStartWorkTask,
}: UseLiveVoiceSessionOptions): LiveVoiceController {
  const appendVoiceTurn = useChatStore((s) => s.appendVoiceTurn);
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [backendBusy, setBackendBusy] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [turns, setTurns] = useState<LiveTranscriptTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<readonly LiveVoicePendingApproval[]>([]);
  const [toolActivity, setToolActivity] = useState<readonly LiveVoiceToolActivity[]>([]);
  const [toolOutcomes, setToolOutcomes] = useState<readonly LiveVoiceToolOutcome[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionRef = useRef<LiveVoiceSession | null>(null);
  const conversationRef = useRef<string | null>(conversationId);
  const ensureRef = useRef(ensureConversation);
  const endedRef = useRef(onEnded);
  const appendRef = useRef(appendVoiceTurn);
  const modelRef = useRef(model);

  conversationRef.current = conversationId ?? conversationRef.current;
  ensureRef.current = ensureConversation;
  endedRef.current = onEnded;
  const startWorkTaskRef = useRef(onStartWorkTask);
  startWorkTaskRef.current = onStartWorkTask;
  const offersWorkTask = onStartWorkTask !== undefined;
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
    if (reconnectsRef.current === 0) {
      setTurns([]);
      setToolOutcomes([]);
    }
    setMuted(false);
    setInterrupted(false);
    setApprovals([]);
    setToolActivity([]);

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
      applyAudioRoute(activeAudioRoute());
      conversationRef.current = (await ensureRef.current()) ?? conversationRef.current;
      const chosenVoice = useSettingsStore.getState().liveVoice;
      return module.LiveVoiceSession.start({
        voice: isLiveVoice(chosenVoice) ? chosenVoice : null,
        conversationId: conversationRef.current,
        language: activeSpeechLanguage()?.split('-')[0]?.trim().toLowerCase() || null,
        callbacks: {
          onStarted: () => {
            if (cancelled) return;
            reconnectsRef.current = 0;
            setReconnecting(false);
            setStatus('live');
          },
          onAssistantSpeaking: (speaking) => {
            if (cancelled) return;
            setAssistantSpeaking(speaking);
            if (speaking) setInterrupted(false);
          },
          onBackendBusy: (busy) => {
            if (!cancelled) setBackendBusy(busy);
          },
          onToolActivity: (activities) => {
            if (!cancelled) setToolActivity(activities);
          },
          onToolApprovals: (pending) => {
            if (!cancelled) setApprovals(pending);
          },
          onToolResult: (outcome) => {
            if (cancelled) return;
            setToolOutcomes((previous) =>
              [...previous.filter((entry) => entry.callId !== outcome.callId), outcome].slice(
                -TOOL_OUTCOME_LIMIT,
              ),
            );
          },
          onTranscript: recordTurn,
          onInterrupted: () => {
            if (!cancelled) setInterrupted(true);
          },
          onUsage: () => undefined,
          ...(offersWorkTask
            ? {
                onStartWorkTask: (goal: string) =>
                  !cancelled && (startWorkTaskRef.current?.(goal) ?? false),
              }
            : {}),
          onClosed: (closed) => {
            const session = sessionRef.current;
            sessionRef.current = null;
            if (session) finish(session, closed);
            if (cancelled) return;
            setStatus('idle');
            setBackendBusy(false);
            setApprovals([]);
            setToolActivity([]);
            endedRef.current(
              closed.reason === 'close_requested' ? null : LIVE_VOICE_MESSAGE.sessionEnded,
            );
          },
          onError: (message) => {
            sessionRef.current = null;
            if (cancelled) return;
            setStatus('error');
            setReconnecting(false);
            setBackendBusy(false);
            setApprovals([]);
            setToolActivity([]);
            setError(message);
          },
          onConnectionLost: (message) => {
            const session = sessionRef.current;
            sessionRef.current = null;
            if (session) {
              finish(session, { reason: 'connection_lost', seconds: session.lastUsageSeconds });
            }
            if (cancelled) return;
            setBackendBusy(false);
            setApprovals([]);
            setToolActivity([]);
            if (reconnectsRef.current >= RECONNECT_MAX_ATTEMPTS) {
              setReconnecting(false);
              setStatus('error');
              setError(message);
              return;
            }
            reconnectsRef.current += 1;
            setReconnecting(true);
            setStatus('connecting');
            reconnectTimerRef.current = setTimeout(
              () => setAttempt((value) => value + 1),
              RECONNECT_BASE_MS * 2 ** (reconnectsRef.current - 1),
            );
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
      setApprovals([]);
      setToolActivity([]);
      endedRef.current(LIVE_VOICE_MESSAGE.sessionEnded);
    });

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      appState.remove();
      const session = sessionRef.current;
      sessionRef.current = null;
      setStatus('idle');
      setAssistantSpeaking(false);
      setBackendBusy(false);
      setApprovals([]);
      setToolActivity([]);
      if (session) void session.close().then((closed) => finish(session, closed));
    };
  }, [active, attempt, offersWorkTask, recordTurn]);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      sessionRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const cancelBackendWork = useCallback(() => {
    sessionRef.current?.cancelBackendWork();
  }, []);

  const decideToolApproval = useCallback((callId: string, decision: LiveVoiceToolDecision) => {
    void sessionRef.current?.decideToolApproval(callId, decision);
  }, []);

  return {
    status,
    reconnecting,
    muted,
    assistantSpeaking,
    backendBusy,
    interrupted,
    turns,
    error,
    approvals,
    toolActivity,
    toolOutcomes,
    decideToolApproval,
    toggleMute,
    cancelBackendWork,
    retry,
  };
}
