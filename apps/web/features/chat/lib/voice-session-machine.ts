export const VOICE_SESSION_STATUS = {
  exited: 'exited',
  entering: 'entering',
  listening: 'listening',
  transcribing: 'transcribing',
  sending: 'sending',
  streaming: 'streaming',
  speaking: 'speaking',
  muted: 'muted',
  error: 'error',
} as const;

export type VoiceSessionStatus = (typeof VOICE_SESSION_STATUS)[keyof typeof VOICE_SESSION_STATUS];

export const VOICE_SESSION_EVENT = {
  enter: 'enter',
  ready: 'ready',
  speechEnd: 'speechEnd',
  transcribed: 'transcribed',
  cancelUtterance: 'cancelUtterance',
  commitUtterance: 'commitUtterance',
  typedSubmit: 'typedSubmit',
  replyComplete: 'replyComplete',
  playbackComplete: 'playbackComplete',
  bargeIn: 'bargeIn',
  mute: 'mute',
  unmute: 'unmute',
  fail: 'fail',
  retry: 'retry',
  exit: 'exit',
} as const;

export type VoiceSessionEvent =
  | { type: typeof VOICE_SESSION_EVENT.enter }
  | { type: typeof VOICE_SESSION_EVENT.ready; listening: boolean }
  | { type: typeof VOICE_SESSION_EVENT.speechEnd }
  | { type: typeof VOICE_SESSION_EVENT.transcribed; text: string }
  | { type: typeof VOICE_SESSION_EVENT.cancelUtterance }
  | { type: typeof VOICE_SESSION_EVENT.commitUtterance }
  | { type: typeof VOICE_SESSION_EVENT.typedSubmit }
  | { type: typeof VOICE_SESSION_EVENT.replyComplete; spoken: boolean }
  | { type: typeof VOICE_SESSION_EVENT.playbackComplete }
  | { type: typeof VOICE_SESSION_EVENT.bargeIn }
  | { type: typeof VOICE_SESSION_EVENT.mute }
  | { type: typeof VOICE_SESSION_EVENT.unmute }
  | { type: typeof VOICE_SESSION_EVENT.fail; message: string }
  | { type: typeof VOICE_SESSION_EVENT.retry }
  | { type: typeof VOICE_SESSION_EVENT.exit };

export interface VoiceSessionState {
  readonly status: VoiceSessionStatus;
  readonly muted: boolean;
  readonly pendingUtterance: string | null;
  readonly error: string | null;
}

export const INITIAL_VOICE_SESSION_STATE: VoiceSessionState = {
  status: VOICE_SESSION_STATUS.exited,
  muted: false,
  pendingUtterance: null,
  error: null,
};

const TURN_IN_FLIGHT: readonly VoiceSessionStatus[] = [
  VOICE_SESSION_STATUS.streaming,
  VOICE_SESSION_STATUS.speaking,
];

const SUBMITTABLE: readonly VoiceSessionStatus[] = [
  VOICE_SESSION_STATUS.listening,
  VOICE_SESSION_STATUS.muted,
  VOICE_SESSION_STATUS.transcribing,
  VOICE_SESSION_STATUS.sending,
  VOICE_SESSION_STATUS.speaking,
  VOICE_SESSION_STATUS.error,
];

export function isVoiceSessionActive(status: VoiceSessionStatus): boolean {
  return status !== VOICE_SESSION_STATUS.exited;
}

function resumeStatus(muted: boolean): VoiceSessionStatus {
  return muted ? VOICE_SESSION_STATUS.muted : VOICE_SESSION_STATUS.listening;
}

function resume(state: VoiceSessionState): VoiceSessionState {
  return {
    status: resumeStatus(state.muted),
    muted: state.muted,
    pendingUtterance: null,
    error: null,
  };
}

export function voiceSessionReducer(
  state: VoiceSessionState,
  event: VoiceSessionEvent,
): VoiceSessionState {
  switch (event.type) {
    case VOICE_SESSION_EVENT.exit:
      return INITIAL_VOICE_SESSION_STATE;

    case VOICE_SESSION_EVENT.enter:
      return state.status === VOICE_SESSION_STATUS.exited
        ? { ...INITIAL_VOICE_SESSION_STATE, status: VOICE_SESSION_STATUS.entering }
        : state;

    case VOICE_SESSION_EVENT.ready:
      return state.status === VOICE_SESSION_STATUS.entering
        ? {
            status: resumeStatus(!event.listening),
            muted: !event.listening,
            pendingUtterance: null,
            error: null,
          }
        : state;

    case VOICE_SESSION_EVENT.speechEnd:
      return state.status === VOICE_SESSION_STATUS.listening
        ? { ...state, status: VOICE_SESSION_STATUS.transcribing }
        : state;

    case VOICE_SESSION_EVENT.transcribed:
      if (state.status !== VOICE_SESSION_STATUS.transcribing) return state;
      return event.text.trim()
        ? { ...state, status: VOICE_SESSION_STATUS.sending, pendingUtterance: event.text }
        : resume(state);

    case VOICE_SESSION_EVENT.cancelUtterance:
      return state.status === VOICE_SESSION_STATUS.sending ? resume(state) : state;

    case VOICE_SESSION_EVENT.commitUtterance:
      return state.status === VOICE_SESSION_STATUS.sending
        ? { ...state, status: VOICE_SESSION_STATUS.streaming, pendingUtterance: null }
        : state;

    case VOICE_SESSION_EVENT.typedSubmit:
      return SUBMITTABLE.includes(state.status)
        ? {
            status: VOICE_SESSION_STATUS.streaming,
            muted: state.muted,
            pendingUtterance: null,
            error: null,
          }
        : state;

    case VOICE_SESSION_EVENT.replyComplete:
      if (state.status !== VOICE_SESSION_STATUS.streaming) return state;
      return event.spoken ? { ...state, status: VOICE_SESSION_STATUS.speaking } : resume(state);

    case VOICE_SESSION_EVENT.playbackComplete:
      return state.status === VOICE_SESSION_STATUS.speaking ? resume(state) : state;

    case VOICE_SESSION_EVENT.bargeIn:
      return state.status === VOICE_SESSION_STATUS.speaking
        ? {
            status: VOICE_SESSION_STATUS.listening,
            muted: false,
            pendingUtterance: null,
            error: null,
          }
        : state;

    case VOICE_SESSION_EVENT.mute:
      if (!isVoiceSessionActive(state.status) || state.muted) return state;
      if (TURN_IN_FLIGHT.includes(state.status)) return { ...state, muted: true };
      return { ...state, status: VOICE_SESSION_STATUS.muted, muted: true, pendingUtterance: null };

    case VOICE_SESSION_EVENT.unmute:
      if (!isVoiceSessionActive(state.status) || !state.muted) return state;
      return state.status === VOICE_SESSION_STATUS.muted
        ? { ...state, status: VOICE_SESSION_STATUS.listening, muted: false }
        : { ...state, muted: false };

    case VOICE_SESSION_EVENT.fail:
      return isVoiceSessionActive(state.status)
        ? {
            status: VOICE_SESSION_STATUS.error,
            muted: state.muted,
            pendingUtterance: null,
            error: event.message,
          }
        : state;

    case VOICE_SESSION_EVENT.retry:
      return state.status === VOICE_SESSION_STATUS.error
        ? { ...INITIAL_VOICE_SESSION_STATE, status: VOICE_SESSION_STATUS.entering }
        : state;

    default:
      return state;
  }
}

export const ORB_STATE = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  muted: 'muted',
} as const;

export type OrbState = (typeof ORB_STATE)[keyof typeof ORB_STATE];

const STATUS_ORB_STATE: Readonly<Record<VoiceSessionStatus, OrbState>> = {
  [VOICE_SESSION_STATUS.exited]: ORB_STATE.idle,
  [VOICE_SESSION_STATUS.entering]: ORB_STATE.idle,
  [VOICE_SESSION_STATUS.error]: ORB_STATE.idle,
  [VOICE_SESSION_STATUS.listening]: ORB_STATE.listening,
  [VOICE_SESSION_STATUS.transcribing]: ORB_STATE.thinking,
  [VOICE_SESSION_STATUS.sending]: ORB_STATE.thinking,
  [VOICE_SESSION_STATUS.streaming]: ORB_STATE.thinking,
  [VOICE_SESSION_STATUS.speaking]: ORB_STATE.speaking,
  [VOICE_SESSION_STATUS.muted]: ORB_STATE.muted,
};

export function orbStateForStatus(status: VoiceSessionStatus): OrbState {
  return STATUS_ORB_STATE[status];
}

export const ORB_STATE_LABEL: Readonly<Record<OrbState, string>> = {
  [ORB_STATE.idle]: '',
  [ORB_STATE.listening]: 'Listening',
  [ORB_STATE.thinking]: 'Thinking',
  [ORB_STATE.speaking]: 'Speaking',
  [ORB_STATE.muted]: 'Muted',
};

export function orbStateLabel(status: VoiceSessionStatus): string {
  return ORB_STATE_LABEL[orbStateForStatus(status)];
}

export const SPEECH_LEVEL_THRESHOLD = 0.12;
export const SILENCE_LEVEL_THRESHOLD = 0.07;
export const SILENCE_WINDOW_MS = 1_200;
export const MIN_UTTERANCE_MS = 250;
export const UTTERANCE_CANCEL_WINDOW_MS = 2_500;
export const BARGE_IN_LEVEL_THRESHOLD = 0.3;
export const BARGE_IN_SAMPLE_COUNT = 4;
export const ORB_CANVAS_SIZE = 204;
export const ORB_SPHERE_SIZE = 80;
export const ORB_FOCUS_SCALE = 2;
export const ORB_GROW_IN_MS = 4_000;
export const ORB_SEED_SIZE = 8;
export const PLAYBACK_START_TIMEOUT_MS = 2_000;

export interface SpeechWindowState {
  readonly speechStartedAt: number | null;
  readonly lastVoiceAt: number | null;
}

export const INITIAL_SPEECH_WINDOW: SpeechWindowState = {
  speechStartedAt: null,
  lastVoiceAt: null,
};

export interface SpeechWindowResult {
  readonly state: SpeechWindowState;
  readonly ended: boolean;
}

export function advanceSpeechWindow(
  state: SpeechWindowState,
  level: number,
  now: number,
): SpeechWindowResult {
  if (level >= SPEECH_LEVEL_THRESHOLD) {
    return {
      state: { speechStartedAt: state.speechStartedAt ?? now, lastVoiceAt: now },
      ended: false,
    };
  }

  const { speechStartedAt, lastVoiceAt } = state;
  if (speechStartedAt === null || lastVoiceAt === null) return { state, ended: false };
  if (level >= SILENCE_LEVEL_THRESHOLD) return { state, ended: false };
  if (now - lastVoiceAt < SILENCE_WINDOW_MS) return { state, ended: false };

  return {
    state: INITIAL_SPEECH_WINDOW,
    ended: lastVoiceAt - speechStartedAt >= MIN_UTTERANCE_MS,
  };
}

export interface BargeInResult {
  readonly consecutive: number;
  readonly triggered: boolean;
}

export function advanceBargeIn(consecutive: number, level: number): BargeInResult {
  if (level < BARGE_IN_LEVEL_THRESHOLD) return { consecutive: 0, triggered: false };
  const next = consecutive + 1;
  return {
    consecutive: next >= BARGE_IN_SAMPLE_COUNT ? 0 : next,
    triggered: next >= BARGE_IN_SAMPLE_COUNT,
  };
}
