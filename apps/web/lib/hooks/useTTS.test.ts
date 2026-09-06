import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTTS } from './useTTS';

class FakeVoice {
  constructor(
    public name: string,
    public lang: string,
    public voiceURI: string,
  ) {}
  default = false;
  localService = true;
}

const ALICE = new FakeVoice('Alice', 'en-GB', 'urn:voice:alice') as unknown as SpeechSynthesisVoice;
const BRUNO = new FakeVoice('Bruno', 'de-DE', 'urn:voice:bruno') as unknown as SpeechSynthesisVoice;

let listeners: Record<string, Array<() => void>>;
let spoken: SpeechSynthesisUtterance[];
let available: SpeechSynthesisVoice[];

function installSpeechSynthesis() {
  listeners = {};
  spoken = [];
  available = [];

  const synth = {
    getVoices: () => available,
    speak: (utterance: SpeechSynthesisUtterance) => spoken.push(utterance),
    cancel: vi.fn(),
    addEventListener: (event: string, handler: () => void) => {
      (listeners[event] ??= []).push(handler);
    },
    removeEventListener: (event: string, handler: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
    },
  };

  vi.stubGlobal('speechSynthesis', synth);
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });

  class Utterance {
    voice: SpeechSynthesisVoice | null = null;
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: Utterance,
    configurable: true,
  });
}

function emitVoicesChanged(next: SpeechSynthesisVoice[]) {
  available = next;
  act(() => {
    (listeners['voiceschanged'] ?? []).forEach((handler) => handler());
  });
}

beforeEach(() => {
  installSpeechSynthesis();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('useTTS, speech content and state', () => {
  it('primes the synthesiser silently so a later reply can play on iOS', () => {
    const { result } = renderHook(() => useTTS());
    act(() => result.current.unlock());
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.volume).toBe(0);
  });

  it('reads clean prose instead of Markdown syntax or raw code', () => {
    const { result } = renderHook(() => useTTS());

    act(() =>
      result.current.speak(
        '## Result\n**Done** [here](https://example.com)\n```ts\nsecret();\n```',
      ),
    );

    expect(spoken[0]!.text).toBe('Result\nDone here\ncode block omitted.');
  });

  it('tracks start and completion from the active utterance', () => {
    const { result } = renderHook(() => useTTS());

    act(() => result.current.speak('Hello'));
    const utterance = spoken[0]!;
    act(() => utterance.onstart?.(undefined as never));
    expect(result.current.isSpeaking).toBe(true);

    act(() => utterance.onend?.(undefined as never));
    expect(result.current.isSpeaking).toBe(false);
  });

  it('switches directly to another response and ignores stale completion events', () => {
    const { result } = renderHook(() => useTTS());

    act(() => result.current.speak('First'));
    const first = spoken[0]!;
    act(() => first.onstart?.(undefined as never));

    act(() => result.current.speak('Second'));
    const second = spoken[1]!;
    expect(second.text).toBe('Second');
    act(() => second.onstart?.(undefined as never));
    act(() => first.onend?.(undefined as never));

    expect(result.current.isSpeaking).toBe(true);
  });
});

describe('useTTS, voice enumeration', () => {
  it('picks up voices that arrive after mount', () => {
    const { result } = renderHook(() => useTTS());
    expect(result.current.voices).toEqual([]);

    emitVoicesChanged([ALICE, BRUNO]);

    expect(result.current.voices).toHaveLength(2);
  });

  it('reports voices already present at mount', () => {
    available = [ALICE];
    const { result } = renderHook(() => useTTS());

    expect(result.current.voices).toEqual([ALICE]);
  });
});

describe('useTTS, voice selection', () => {
  it('speaks in the selected voice and matches its language', () => {
    const { result } = renderHook(() => useTTS());
    emitVoicesChanged([ALICE, BRUNO]);

    act(() => result.current.setVoiceUri(BRUNO.voiceURI));
    act(() => result.current.speak('hallo'));

    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.voice).toBe(BRUNO);
    expect(spoken[0]!.lang).toBe('de-DE');
  });

  it('leaves the browser default in place when nothing is selected', () => {
    const { result } = renderHook(() => useTTS());
    emitVoicesChanged([ALICE]);

    act(() => result.current.speak('hello'));

    expect(spoken[0]!.voice).toBeNull();
  });

  it('persists the choice across remounts', () => {
    const first = renderHook(() => useTTS());
    emitVoicesChanged([ALICE, BRUNO]);
    act(() => first.result.current.setVoiceUri(ALICE.voiceURI));
    first.unmount();

    available = [ALICE, BRUNO];
    const second = renderHook(() => useTTS());
    expect(second.result.current.voiceUri).toBe(ALICE.voiceURI);
  });

  it('applies a voice picked in settings to a chat instance already mounted', () => {
    const chat = renderHook(() => useTTS());
    const settings = renderHook(() => useTTS());
    emitVoicesChanged([ALICE, BRUNO]);

    act(() => settings.result.current.setVoiceUri(BRUNO.voiceURI));

    expect(chat.result.current.voiceUri).toBe(BRUNO.voiceURI);
    act(() => chat.result.current.speak('hallo'));
    expect(spoken[0]!.voice).toBe(BRUNO);
  });

  it('clears back to the default', () => {
    const { result } = renderHook(() => useTTS());
    emitVoicesChanged([ALICE]);

    act(() => result.current.setVoiceUri(ALICE.voiceURI));
    act(() => result.current.setVoiceUri(null));
    act(() => result.current.speak('hello'));

    expect(result.current.voiceUri).toBeNull();
    expect(spoken[0]!.voice).toBeNull();
  });
});

describe('useTTS, missing voice', () => {
  it('still speaks when the stored voice is not installed here', () => {
    window.localStorage.setItem('agi:tts-voice-uri', 'urn:voice:not-on-this-device');
    available = [ALICE];

    const { result } = renderHook(() => useTTS());
    act(() => result.current.speak('hello'));

    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.voice).toBeNull();
  });
});
