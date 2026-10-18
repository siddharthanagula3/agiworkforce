import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_READ_ALOUD_SETTINGS,
  READ_ALOUD_STORAGE_KEY,
  isReadAloudSupported,
  loadReadAloudSettings,
  parseReadAloudSettings,
  speakAloud,
  stopSpeaking,
} from '../src/features/read-aloud';

class FakeUtterance {
  rate = 1;
  voice: unknown = null;
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function fakeSynth(voices: Array<{ voiceURI: string; lang: string }> = []) {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
  } as unknown as SpeechSynthesis & {
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseReadAloudSettings', () => {
  it('falls back to defaults for anything unrecognised', () => {
    expect(parseReadAloudSettings(undefined)).toEqual(DEFAULT_READ_ALOUD_SETTINGS);
    expect(parseReadAloudSettings({ voiceURI: 4, rate: 9 })).toEqual(DEFAULT_READ_ALOUD_SETTINGS);
  });

  it('keeps a stored voice and an offered rate', () => {
    expect(parseReadAloudSettings({ voiceURI: 'Samantha', rate: 1.5 })).toEqual({
      voiceURI: 'Samantha',
      rate: 1.5,
    });
  });
});

describe('loadReadAloudSettings', () => {
  it('reads the stored settings', async () => {
    const get = vi.fn(async () => ({ [READ_ALOUD_STORAGE_KEY]: { voiceURI: 'v', rate: 2 } }));
    await expect(loadReadAloudSettings({ get } as never)).resolves.toEqual({
      voiceURI: 'v',
      rate: 2,
    });
  });

  it('uses defaults when storage is unavailable', async () => {
    const get = vi.fn(async () => {
      throw new Error('blocked');
    });
    await expect(loadReadAloudSettings({ get } as never)).resolves.toEqual(
      DEFAULT_READ_ALOUD_SETTINGS,
    );
  });
});

describe('isReadAloudSupported', () => {
  it('is false without speech synthesis and true with it', () => {
    expect(isReadAloudSupported({} as never)).toBe(false);
    expect(isReadAloudSupported({ speechSynthesis: fakeSynth() })).toBe(true);
  });
});

describe('speakAloud', () => {
  it('cancels earlier speech, applies the chosen voice and rate, then speaks', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const voice = { voiceURI: 'Samantha', lang: 'en-US' };
    const synth = fakeSynth([voice]);
    expect(speakAloud(' hello ', { voiceURI: 'Samantha', rate: 1.25 }, synth)).toBe(true);
    expect(synth.cancel).toHaveBeenCalledBefore(synth.speak);
    const utterance = synth.speak.mock.calls[0]![0] as FakeUtterance;
    expect(utterance.text).toBe('hello');
    expect(utterance.rate).toBe(1.25);
    expect(utterance.voice).toBe(voice);
    expect(utterance.lang).toBe('en-US');
  });

  it('speaks with the browser default voice when the stored one is gone', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const synth = fakeSynth([]);
    speakAloud('hi', { voiceURI: 'Missing', rate: 1 }, synth);
    expect((synth.speak.mock.calls[0]![0] as FakeUtterance).voice).toBeNull();
  });

  it('does nothing for empty text', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const synth = fakeSynth();
    expect(speakAloud('   ', DEFAULT_READ_ALOUD_SETTINGS, synth)).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('reports the end of speech', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const synth = fakeSynth();
    const onEnd = vi.fn();
    speakAloud('hi', DEFAULT_READ_ALOUD_SETTINGS, synth, onEnd);
    (synth.speak.mock.calls[0]![0] as FakeUtterance).onend?.();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});

describe('stopSpeaking', () => {
  it('cancels the queue', () => {
    const synth = fakeSynth();
    stopSpeaking(synth);
    expect(synth.cancel).toHaveBeenCalledOnce();
  });
});
