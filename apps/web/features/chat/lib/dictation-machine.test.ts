import { describe, expect, it } from 'vitest';
import {
  createWaveform,
  dictationReducer,
  isDictationActive,
  pushWaveformSample,
  readAnalyserLevel,
  waveformBarPercent,
  DICTATION_EVENT,
  DICTATION_INTENT,
  DICTATION_STATUS,
  INITIAL_DICTATION_STATE,
  WAVEFORM_BAR_COUNT,
  type DictationMachineState,
} from './dictation-machine';

function at(status: DictationMachineState['status']): DictationMachineState {
  return { ...INITIAL_DICTATION_STATE, status };
}

const FAILURE = 'microphone permission denied';

describe('dictationReducer', () => {
  it('starts idle with no intent and no error', () => {
    expect(INITIAL_DICTATION_STATE).toEqual({
      status: DICTATION_STATUS.idle,
      intent: null,
      error: null,
    });
  });

  it('moves idle to recording on start', () => {
    const next = dictationReducer(INITIAL_DICTATION_STATE, { type: DICTATION_EVENT.start });
    expect(next.status).toBe(DICTATION_STATUS.recording);
  });

  it('moves recording to transcribing and keeps the stop intent', () => {
    const next = dictationReducer(at(DICTATION_STATUS.recording), {
      type: DICTATION_EVENT.stop,
      intent: DICTATION_INTENT.send,
    });
    expect(next.status).toBe(DICTATION_STATUS.transcribing);
    expect(next.intent).toBe(DICTATION_INTENT.send);
  });

  it('moves transcribing back to idle on resolve', () => {
    const next = dictationReducer(
      { status: DICTATION_STATUS.transcribing, intent: DICTATION_INTENT.insert, error: null },
      { type: DICTATION_EVENT.resolve },
    );
    expect(next).toEqual(INITIAL_DICTATION_STATE);
  });

  it('records the failure message when capture fails', () => {
    const next = dictationReducer(at(DICTATION_STATUS.recording), {
      type: DICTATION_EVENT.fail,
      message: FAILURE,
    });
    expect(next.status).toBe(DICTATION_STATUS.error);
    expect(next.error).toBe(FAILURE);
  });

  it('records the failure message when transcription fails', () => {
    const next = dictationReducer(at(DICTATION_STATUS.transcribing), {
      type: DICTATION_EVENT.fail,
      message: FAILURE,
    });
    expect(next.status).toBe(DICTATION_STATUS.error);
    expect(next.error).toBe(FAILURE);
  });

  it('cancels from recording, transcribing and error alike', () => {
    for (const status of [
      DICTATION_STATUS.recording,
      DICTATION_STATUS.transcribing,
      DICTATION_STATUS.error,
    ]) {
      const next = dictationReducer(at(status), { type: DICTATION_EVENT.cancel });
      expect(next.status).toBe(DICTATION_STATUS.cancelled);
      expect(next.error).toBeNull();
    }
  });

  it('restarts from cancelled and from error', () => {
    for (const status of [DICTATION_STATUS.cancelled, DICTATION_STATUS.error]) {
      const next = dictationReducer(at(status), { type: DICTATION_EVENT.start });
      expect(next.status).toBe(DICTATION_STATUS.recording);
      expect(next.error).toBeNull();
    }
  });

  it('dismisses an error back to idle', () => {
    const next = dictationReducer(at(DICTATION_STATUS.error), { type: DICTATION_EVENT.dismiss });
    expect(next.status).toBe(DICTATION_STATUS.idle);
  });

  it('ignores a stop that arrives outside recording', () => {
    const state = at(DICTATION_STATUS.transcribing);
    expect(
      dictationReducer(state, { type: DICTATION_EVENT.stop, intent: DICTATION_INTENT.insert }),
    ).toBe(state);
  });

  it('ignores a start that arrives while already recording', () => {
    const state = at(DICTATION_STATUS.recording);
    expect(dictationReducer(state, { type: DICTATION_EVENT.start })).toBe(state);
  });

  it('ignores a failure reported after the run was cancelled', () => {
    const state = at(DICTATION_STATUS.cancelled);
    expect(dictationReducer(state, { type: DICTATION_EVENT.fail, message: FAILURE })).toBe(state);
  });

  it('treats recording, transcribing and error as the states that own the bar', () => {
    expect(isDictationActive(DICTATION_STATUS.recording)).toBe(true);
    expect(isDictationActive(DICTATION_STATUS.transcribing)).toBe(true);
    expect(isDictationActive(DICTATION_STATUS.error)).toBe(true);
    expect(isDictationActive(DICTATION_STATUS.idle)).toBe(false);
    expect(isDictationActive(DICTATION_STATUS.cancelled)).toBe(false);
  });
});

describe('waveform reducer', () => {
  it('starts full of silent bars so samples enter at the right edge', () => {
    const waveform = createWaveform();
    expect(waveform.bars).toHaveLength(WAVEFORM_BAR_COUNT);
    expect(waveform.bars.every((bar) => bar === 0)).toBe(true);
    expect(waveform.level).toBe(0);
  });

  it('appends the newest sample last and drops the oldest', () => {
    const waveform = pushWaveformSample(createWaveform(3), 0.5);
    expect(waveform.bars).toEqual([0, 0, 0.5]);
    expect(waveform.level).toBe(0.5);

    const next = pushWaveformSample(waveform, 0.25);
    expect(next.bars).toEqual([0, 0.5, 0.25]);
  });

  it('scrolls a full strip left one bar per sample', () => {
    let waveform = createWaveform(3);
    for (const sample of [0.1, 0.2, 0.3, 0.4]) {
      waveform = pushWaveformSample(waveform, sample);
    }
    expect(waveform.bars).toEqual([0.2, 0.3, 0.4]);
  });

  it('does not mutate the state it was given', () => {
    const waveform = createWaveform(2);
    const before = [...waveform.bars];
    pushWaveformSample(waveform, 1);
    expect(waveform.bars).toEqual(before);
  });

  it('clamps samples outside the level range', () => {
    expect(pushWaveformSample(createWaveform(1), 4).level).toBe(1);
    expect(pushWaveformSample(createWaveform(1), -2).level).toBe(0);
    expect(pushWaveformSample(createWaveform(1), Number.NaN).level).toBe(0);
  });

  it('reads silence as no level and a full-scale tone as the ceiling', () => {
    const silence = new Uint8Array(8).fill(128);
    expect(readAnalyserLevel(silence)).toBe(0);

    const loud = new Uint8Array(8).fill(255);
    expect(readAnalyserLevel(loud)).toBe(1);
  });

  it('reads an empty analyser buffer as silence', () => {
    expect(readAnalyserLevel(new Uint8Array(0))).toBe(0);
  });

  it('gives a silent bar a visible floor and a loud bar the full height', () => {
    expect(waveformBarPercent(0)).toBeGreaterThan(0);
    expect(waveformBarPercent(1)).toBe(100);
    expect(waveformBarPercent(0.5)).toBeGreaterThan(waveformBarPercent(0));
  });
});
