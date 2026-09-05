export const DICTATION_STATUS = {
  idle: 'idle',
  recording: 'recording',
  transcribing: 'transcribing',
  error: 'error',
  cancelled: 'cancelled',
} as const;

export type DictationStatus = (typeof DICTATION_STATUS)[keyof typeof DICTATION_STATUS];

export const DICTATION_INTENT = {
  insert: 'insert',
  send: 'send',
} as const;

export type DictationIntent = (typeof DICTATION_INTENT)[keyof typeof DICTATION_INTENT];

export const DICTATION_EVENT = {
  start: 'start',
  stop: 'stop',
  resolve: 'resolve',
  fail: 'fail',
  cancel: 'cancel',
  dismiss: 'dismiss',
} as const;

export type DictationEvent =
  | { type: typeof DICTATION_EVENT.start }
  | { type: typeof DICTATION_EVENT.stop; intent: DictationIntent }
  | { type: typeof DICTATION_EVENT.resolve }
  | { type: typeof DICTATION_EVENT.fail; message: string }
  | { type: typeof DICTATION_EVENT.cancel }
  | { type: typeof DICTATION_EVENT.dismiss };

export interface DictationMachineState {
  readonly status: DictationStatus;
  readonly intent: DictationIntent | null;
  readonly error: string | null;
}

export const INITIAL_DICTATION_STATE: DictationMachineState = {
  status: DICTATION_STATUS.idle,
  intent: null,
  error: null,
};

const STARTABLE: readonly DictationStatus[] = [
  DICTATION_STATUS.idle,
  DICTATION_STATUS.cancelled,
  DICTATION_STATUS.error,
];

const FAILABLE: readonly DictationStatus[] = [
  DICTATION_STATUS.recording,
  DICTATION_STATUS.transcribing,
];

const CANCELLABLE: readonly DictationStatus[] = [
  DICTATION_STATUS.recording,
  DICTATION_STATUS.transcribing,
  DICTATION_STATUS.error,
];

const ACTIVE: readonly DictationStatus[] = [
  DICTATION_STATUS.recording,
  DICTATION_STATUS.transcribing,
  DICTATION_STATUS.error,
];

export function isDictationActive(status: DictationStatus): boolean {
  return ACTIVE.includes(status);
}

export function dictationReducer(
  state: DictationMachineState,
  event: DictationEvent,
): DictationMachineState {
  switch (event.type) {
    case DICTATION_EVENT.start:
      return STARTABLE.includes(state.status)
        ? { status: DICTATION_STATUS.recording, intent: null, error: null }
        : state;
    case DICTATION_EVENT.stop:
      return state.status === DICTATION_STATUS.recording
        ? { status: DICTATION_STATUS.transcribing, intent: event.intent, error: null }
        : state;
    case DICTATION_EVENT.resolve:
      return state.status === DICTATION_STATUS.transcribing
        ? { status: DICTATION_STATUS.idle, intent: null, error: null }
        : state;
    case DICTATION_EVENT.fail:
      return FAILABLE.includes(state.status)
        ? { status: DICTATION_STATUS.error, intent: state.intent, error: event.message }
        : state;
    case DICTATION_EVENT.cancel:
      return CANCELLABLE.includes(state.status)
        ? { status: DICTATION_STATUS.cancelled, intent: null, error: null }
        : state;
    case DICTATION_EVENT.dismiss:
      return state.status === DICTATION_STATUS.error
        ? { status: DICTATION_STATUS.idle, intent: null, error: null }
        : state;
    default:
      return state;
  }
}

export const WAVEFORM_BAR_COUNT = 160;
export const WAVEFORM_SAMPLE_INTERVAL_MS = 60;
export const ANALYSER_FFT_SIZE = 512;

const LEVEL_FLOOR = 0;
const LEVEL_CEILING = 1;
const LEVEL_GAIN = 3.2;
const SAMPLE_CENTRE = 128;
const SAMPLE_HALF_RANGE = 128;
const BAR_MIN_PERCENT = 8;
const BAR_MAX_PERCENT = 100;

export interface WaveformState {
  readonly bars: readonly number[];
  readonly level: number;
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return LEVEL_FLOOR;
  if (value < LEVEL_FLOOR) return LEVEL_FLOOR;
  if (value > LEVEL_CEILING) return LEVEL_CEILING;
  return value;
}

export function createWaveform(barCount: number = WAVEFORM_BAR_COUNT): WaveformState {
  return { bars: new Array<number>(Math.max(barCount, 0)).fill(LEVEL_FLOOR), level: LEVEL_FLOOR };
}

export function pushWaveformSample(state: WaveformState, sample: number): WaveformState {
  const level = clampLevel(sample);
  if (state.bars.length === 0) return { bars: state.bars, level };
  return { bars: [...state.bars.slice(1), level], level };
}

export function readAnalyserLevel(samples: Uint8Array): number {
  if (samples.length === 0) return LEVEL_FLOOR;
  let total = 0;
  for (const sample of samples) {
    const offset = (sample - SAMPLE_CENTRE) / SAMPLE_HALF_RANGE;
    total += offset * offset;
  }
  return clampLevel(Math.sqrt(total / samples.length) * LEVEL_GAIN);
}

export function waveformBarPercent(level: number): number {
  return BAR_MIN_PERCENT + clampLevel(level) * (BAR_MAX_PERCENT - BAR_MIN_PERCENT);
}
