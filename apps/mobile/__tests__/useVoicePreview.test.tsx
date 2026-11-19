import { act, renderHook } from '@testing-library/react-native';
import { useVoicePreview, VOICE_PREVIEW_TEXT } from '@/src/features/voice/hooks/useVoicePreview';
import {
  presetPreviewOptions,
  presetSpeakingStyleNote,
} from '@/src/features/voice/services/voicePresetSelection';
import { VOICE_PRESETS } from '@/src/features/voice/voicePresets';
import type {
  VoiceOutputHandle,
  VoiceOutputOutcome,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

function fakeOwner() {
  const finishers: Array<(outcome: VoiceOutputOutcome) => void> = [];
  const stops: jest.Mock[] = [];
  const start = jest.fn((): VoiceOutputHandle => {
    let resolve!: (outcome: VoiceOutputOutcome) => void;
    const done = new Promise<VoiceOutputOutcome>((r) => {
      resolve = r;
    });
    finishers.push(resolve);
    const stop = jest.fn(async () => resolve({ status: 'stopped' }));
    stops.push(stop);
    return { done, stop };
  });
  const owner = { start } as unknown as VoiceOutputOwner;
  return { owner, start, finishers, stops };
}

describe('useVoicePreview', () => {
  it('shows a preview as playing, then as stopped when it ends', async () => {
    const { owner, start, finishers } = fakeOwner();
    const { result } = renderHook(() => useVoicePreview(owner));

    act(() => result.current.toggle('v1', { voice: 'a', rate: 1, pitch: 1 }));
    expect(start).toHaveBeenCalledWith(VOICE_PREVIEW_TEXT, { voice: 'a', rate: 1, pitch: 1 });
    expect(result.current.playingKey).toBe('v1');

    await act(async () => {
      finishers[0]?.({ status: 'done' });
    });
    expect(result.current.playingKey).toBeNull();
  });

  it('stops the preview that is playing when it is pressed again', async () => {
    const { owner, start, stops } = fakeOwner();
    const { result } = renderHook(() => useVoicePreview(owner));

    act(() => result.current.toggle('v1', { rate: 1, pitch: 1 }));
    await act(async () => result.current.toggle('v1', { rate: 1, pitch: 1 }));

    expect(start).toHaveBeenCalledTimes(1);
    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(result.current.playingKey).toBeNull();
  });

  it('moves the playing mark to the voice pressed next, and stops on unmount', async () => {
    const { owner, stops } = fakeOwner();
    const { result, unmount } = renderHook(() => useVoicePreview(owner));

    act(() => result.current.toggle('v1', { rate: 1, pitch: 1 }));
    await act(async () => result.current.toggle('v2', { rate: 1, pitch: 1 }));
    expect(result.current.playingKey).toBe('v2');

    unmount();
    expect(stops[1]).toHaveBeenCalled();
  });
});

describe('preset preview and speaking style', () => {
  const aurora = VOICE_PRESETS[0]!;

  it('previews a preset with its own voice, speed and pitch', () => {
    const voices = [
      { identifier: 'v-samantha', name: 'Samantha', quality: 'Default', language: 'en-US' },
    ];

    expect(presetPreviewOptions(aurora, voices)).toEqual({
      voice: 'v-samantha',
      rate: aurora.rate,
      pitch: aurora.pitch,
    });
    expect(presetPreviewOptions(aurora, null)).toEqual({ rate: aurora.rate, pitch: aurora.pitch });
  });

  it('says what a preset does to speed and pitch', () => {
    expect(presetSpeakingStyleNote(aurora.id)).toBe(
      'Aurora sets speed 1.00x and pitch 1.05x. Change them in Voice settings.',
    );
    expect(presetSpeakingStyleNote(null)).toBeNull();
    expect(presetSpeakingStyleNote('missing')).toBeNull();
  });
});
