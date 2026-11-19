import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@clerk/expo';
import {
  captureLiveVoiceAuthority,
  type LiveVoiceAuthority,
} from '@/src/features/voice/services/liveVoiceAuthority';
import { subscribeCloudAccountEpochChange } from '@/src/features/auth/services/cloudAccountSession';
import type {
  LiveVoicePendingApproval,
  LiveVoiceToolDecision,
} from '@agiworkforce/cloud-contracts';
import { isLiveVoice } from '@agiworkforce/types/live-voices';
import { useChatStore } from '@/stores/chatStore';
import { getConversationMessageStore } from '@/stores/chat/conversationRepository';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import { getRemoteChatDisabledReason } from '@/services/remoteChatGate';
import { useSettingsStore } from '@/stores/settingsStore';
import { requestMicrophoneOnlyPermission } from '@/src/features/voice/services/voiceInput';
import {
  applyAudioRoute,
  audioRouteNotAppliedMessage,
  audioRouteSwitchingSupported,
} from '@/src/features/voice/services/audioRoute';
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
const RECONNECT_STABLE_MS = 30_000;
const TOOL_OUTCOME_LIMIT = 3;
const EXTEND_LEAD_MS = 15_000;
const EXTEND_RETRY_MS = 10_000;
const FIRST_EXTENSION_BLOCK = 2;

export interface LiveVoiceController {
  status: LiveVoiceStatus;
  reconnecting: boolean;
  muted: boolean;
  assistantSpeaking: boolean;
  backendBusy: boolean;
  interrupted: boolean;
  turns: LiveTranscriptTurn[];
  error: string | null;
  routeNotice: string | null;
  approvals: readonly LiveVoicePendingApproval[];
  toolActivity: readonly LiveVoiceToolActivity[];
  toolOutcomes: readonly LiveVoiceToolOutcome[];
  decideToolApproval: (callId: string, decision: LiveVoiceToolDecision) => void;
  toggleMute: () => void;
  cancelBackendWork: () => void;
  retry: () => void;
}

export interface UseLiveVoiceSessionOptions {
  executionMode: 'cloud' | 'local';
  active: boolean;
  conversationId: string | null;
  model: string;
  ensureConversation: () => Promise<string | null>;
  onEnded: (message: string | null) => void;
  onStartWorkTask?: (goal: string) => boolean;
}

export function useLiveVoiceSession({
  executionMode,
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
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<readonly LiveVoicePendingApproval[]>([]);
  const [toolActivity, setToolActivity] = useState<readonly LiveVoiceToolActivity[]>([]);
  const [toolOutcomes, setToolOutcomes] = useState<readonly LiveVoiceToolOutcome[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutedRef = useRef(false);
  const sessionRef = useRef<LiveVoiceSession | null>(null);
  const attemptRef = useRef<object | null>(null);
  const authorityRef = useRef<LiveVoiceAuthority | null>(null);
  const destinationRef = useRef({ conversationId, executionMode });
  destinationRef.current = { conversationId, executionMode };
  const { session: identitySession } = useSession();
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const bindingRef = useRef({ model, ensureConversation, onStartWorkTask });
  bindingRef.current = { model, ensureConversation, onStartWorkTask };
  const offersWorkTask = onStartWorkTask !== undefined;
  const callBindingRef = useRef<{
    identity: typeof identitySession;
    conversationId: string | null;
    binding: typeof bindingRef.current;
  } | null>(null);

  useEffect(() => {
    if (!active) {
      callBindingRef.current = null;
      reconnectsRef.current = 0;
      return undefined;
    }
    const existing = callBindingRef.current;
    if (
      executionMode !== 'cloud' ||
      !identitySession ||
      !conversationId ||
      (existing &&
        (existing.identity !== identitySession || existing.conversationId !== conversationId))
    ) {
      setStatus('idle');
      endedRef.current(LIVE_VOICE_MESSAGE.sessionEnded);
      return undefined;
    }
    callBindingRef.current ??= {
      identity: identitySession,
      conversationId,
      binding: bindingRef.current,
    };
    let cancelled = false;
    let terminal = false;
    let finalizing = false;
    const attemptOwner = {};
    attemptRef.current = attemptOwner;
    const binding = callBindingRef.current.binding;
    let target = conversationId;
    let ownedSession: LiveVoiceSession | null = null;
    const originalManaged = () => {
      if (!target) return false;
      const original = getConversationMessageStore(target)
        .getState()
        .conversations.find((entry) => entry.id === target);
      return Boolean(original && executionModeForConversation(original) === 'cloud');
    };
    const destinationCurrent = () =>
      destinationRef.current.executionMode === 'cloud' &&
      destinationRef.current.conversationId === target;
    const authority = captureLiveVoiceAuthority(
      () =>
        !cancelled &&
        !terminal &&
        attemptRef.current === attemptOwner &&
        destinationCurrent() &&
        originalManaged() &&
        !getRemoteChatDisabledReason(),
    );
    if (!authority) {
      setStatus('error');
      setError(LIVE_VOICE_MESSAGE.connectionFailed);
      return undefined;
    }
    authorityRef.current = authority;
    const current = () => authority.isCurrent();
    const recordTurn = (turn: LiveTranscriptTurn) => {
      const foreground =
        !cancelled && !terminal && attemptRef.current === attemptOwner && current();
      if (!foreground && !(finalizing && turn.final)) return;
      if (!target || !authority.isIdentityCurrent() || !originalManaged()) return;
      if (foreground) {
        setTurns((previous) => {
          const index = previous.findIndex((entry) => entry.turnId === turn.turnId);
          if (index === -1) return [...previous, turn];
          const next = [...previous];
          next[index] = turn;
          return next;
        });
      }
      if (turn.final)
        appendVoiceTurn(target, {
          id: turn.turnId,
          role: turn.role,
          content: turn.text,
          model: binding.model,
        });
    };
    setStatus('connecting');
    setError(null);
    setRouteNotice(null);
    if (reconnectsRef.current === 0) {
      setTurns([]);
      setToolOutcomes([]);
    }
    mutedRef.current = false;
    setMuted(false);
    setInterrupted(false);
    setApprovals([]);
    setToolActivity([]);

    const finish = (session: LiveVoiceSession, closed: LiveSessionClosed) => {
      void session.settle(closed);
    };
    const closeOwned = (session: LiveVoiceSession) => {
      finalizing = true;
      void session.close().then(
        (closed) => {
          finalizing = false;
          finish(session, closed);
        },
        () => {
          finalizing = false;
        },
      );
    };

    let budgetTimer: ReturnType<typeof setTimeout> | null = null;
    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleBudget = (delayMs: number, run: () => void) => {
      if (budgetTimer) clearTimeout(budgetTimer);
      budgetTimer = setTimeout(run, Math.max(0, delayMs));
    };
    const trackBudget = (session: LiveVoiceSession) => {
      const startedAt = Date.now();
      let ceilingSeconds = session.settlement.ceilingSeconds;
      let block = FIRST_EXTENSION_BLOCK;
      const msLeft = () => startedAt + ceilingSeconds * 1_000 - Date.now();
      const endAtLimit = (message: string) => {
        if (!current() || sessionRef.current !== session) return;
        sessionRef.current = null;
        closeOwned(session);
        setStatus('idle');
        setAssistantSpeaking(false);
        setBackendBusy(false);
        setApprovals([]);
        setToolActivity([]);
        endedRef.current(message);
      };
      const extend = async () => {
        if (!current() || sessionRef.current !== session) return;
        const result = await session.extend(block);
        if (!current() || sessionRef.current !== session) return;
        if (result.ok) {
          ceilingSeconds = Math.max(ceilingSeconds, result.ceilingSeconds);
          block += 1;
          scheduleBudget(msLeft() - EXTEND_LEAD_MS, () => void extend());
          return;
        }
        if (result.retry && msLeft() > EXTEND_RETRY_MS) {
          scheduleBudget(EXTEND_RETRY_MS, () => void extend());
          return;
        }
        scheduleBudget(msLeft(), () => endAtLimit(result.message));
      };
      scheduleBudget(msLeft() - EXTEND_LEAD_MS, () => void extend());
    };

    const run = async () => {
      authority.assertCurrent();
      const unavailable = liveVoiceUnavailableReason();
      if (unavailable) throw new Error(unavailable);
      const module = await loadLiveVoice();
      authority.assertCurrent();
      const permission = await requestMicrophoneOnlyPermission();
      authority.assertCurrent();
      if (!permission) {
        throw new module.LiveVoiceSessionError(
          LIVE_VOICE_MESSAGE.microphoneDenied,
          'microphone_denied',
        );
      }
      const requestedRoute = activeAudioRoute();
      if (!applyAudioRoute(requestedRoute) && audioRouteSwitchingSupported()) {
        setRouteNotice(audioRouteNotAppliedMessage(requestedRoute));
      }
      const ensured = target ?? (await binding.ensureConversation());
      authority.assertCurrent();
      if (!ensured) throw new Error('Voice conversation is unavailable');
      target = ensured;
      authority.assertCurrent();
      const chosenVoice = useSettingsStore.getState().liveVoice;
      return module.LiveVoiceSession.start({
        authority,
        voice: isLiveVoice(chosenVoice) ? chosenVoice : null,
        conversationId: target,
        language: activeSpeechLanguage()?.split('-')[0]?.trim().toLowerCase() || null,
        isMuted: () => mutedRef.current,
        callbacks: {
          onStarted: () => {
            if (!current()) return;
            if (stableTimer) clearTimeout(stableTimer);
            stableTimer = setTimeout(() => {
              if (current()) reconnectsRef.current = 0;
            }, RECONNECT_STABLE_MS);
            setReconnecting(false);
            setStatus('live');
          },
          onAssistantSpeaking: (speaking) => {
            if (!current()) return;
            setAssistantSpeaking(speaking);
            if (speaking) setInterrupted(false);
          },
          onBackendBusy: (busy) => {
            if (current()) setBackendBusy(busy);
          },
          onToolActivity: (activities) => {
            if (current()) setToolActivity(activities);
          },
          onToolApprovals: (pending) => {
            if (current()) setApprovals(pending);
          },
          onToolResult: (outcome) => {
            if (!current()) return;
            setToolOutcomes((previous) =>
              [...previous.filter((entry) => entry.callId !== outcome.callId), outcome].slice(
                -TOOL_OUTCOME_LIMIT,
              ),
            );
          },
          onTranscript: recordTurn,
          onInterrupted: () => {
            if (current()) setInterrupted(true);
          },
          onUsage: () => undefined,
          ...(offersWorkTask
            ? {
                onStartWorkTask: (goal: string) =>
                  current() && (binding.onStartWorkTask?.(goal) ?? false),
              }
            : {}),
          onClosed: (closed) => {
            if (!current()) return;
            terminal = true;
            if (sessionRef.current === ownedSession) sessionRef.current = null;
            if (ownedSession) finish(ownedSession, closed);
            setStatus('idle');
            setBackendBusy(false);
            setApprovals([]);
            setToolActivity([]);
            endedRef.current(
              closed.reason === 'close_requested' ? null : LIVE_VOICE_MESSAGE.sessionEnded,
            );
          },
          onProviderError: () => {
            if (current()) setError(LIVE_VOICE_MESSAGE.providerError);
          },
          onError: (message) => {
            if (!current()) return;
            terminal = true;
            if (sessionRef.current === ownedSession) sessionRef.current = null;
            setStatus('error');
            setReconnecting(false);
            setBackendBusy(false);
            setApprovals([]);
            setToolActivity([]);
            setError(message);
          },
          onConnectionLost: (message) => {
            if (!current()) return;
            if (stableTimer) clearTimeout(stableTimer);
            if (sessionRef.current === ownedSession) sessionRef.current = null;
            if (ownedSession) {
              finish(ownedSession, {
                reason: 'connection_lost',
                seconds: ownedSession.lastUsageSeconds,
              });
            }
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
              () => {
                if (current()) setAttempt((value) => value + 1);
              },
              RECONNECT_BASE_MS * 2 ** (reconnectsRef.current - 1),
            );
          },
        },
      });
    };

    run().then(
      (session) => {
        ownedSession = session;
        if (!current()) {
          closeOwned(session);
          return;
        }
        sessionRef.current = session;
        trackBudget(session);
      },
      (startError: unknown) => {
        if (!current()) return;
        setStatus('error');
        setError(startFailureMessage(startError));
      },
    );

    const retire = () => {
      if (cancelled) {
        if (!authority.isIdentityCurrent()) ownedSession?.dispose();
        return;
      }
      cancelled = true;
      if (stableTimer) clearTimeout(stableTimer);
      if (budgetTimer) clearTimeout(budgetTimer);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      if (sessionRef.current === ownedSession) sessionRef.current = null;
      if (ownedSession) closeOwned(ownedSession);
      authority.retire();
    };
    const accountSubscription = subscribeCloudAccountEpochChange(() => {
      if (authority.isIdentityCurrent()) return;
      retire();
      setStatus('idle');
      setTurns([]);
      setToolOutcomes([]);
      setApprovals([]);
      setToolActivity([]);
      setBackendBusy(false);
      endedRef.current(LIVE_VOICE_MESSAGE.sessionEnded);
    });
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background' || cancelled) return;
      retire();
      setStatus('idle');
      setAssistantSpeaking(false);
      setBackendBusy(false);
      setApprovals([]);
      setToolActivity([]);
      endedRef.current(LIVE_VOICE_MESSAGE.sessionEnded);
    });

    return () => {
      retire();
      if (authorityRef.current === authority) authorityRef.current = null;
      accountSubscription();
      appState.remove();
      setStatus('idle');
      setAssistantSpeaking(false);
      setBackendBusy(false);
      setApprovals([]);
      setToolActivity([]);
    };
  }, [
    active,
    attempt,
    executionMode,
    conversationId,
    identitySession,
    offersWorkTask,
    appendVoiceTurn,
  ]);

  useEffect(() => {
    if (
      (status === 'connecting' || status === 'live') &&
      authorityRef.current &&
      !authorityRef.current.isCurrent()
    ) {
      setStatus('idle');
      endedRef.current(LIVE_VOICE_MESSAGE.sessionEnded);
    }
  }, [
    status,
    active,
    attempt,
    executionMode,
    conversationId,
    identitySession,
    offersWorkTask,
    appendVoiceTurn,
  ]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    sessionRef.current?.setMuted(next);
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
    routeNotice,
    approvals,
    toolActivity,
    toolOutcomes,
    decideToolApproval,
    toggleMute,
    cancelBackendWork,
    retry,
  };
}
