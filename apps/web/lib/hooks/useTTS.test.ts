import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTTS } from './useTTS';

const toastMock = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const identity = vi.hoisted(() => ({
  generation: 0,
  session: null as null | {
    userId: string;
    sessionId: string;
    isCurrent: () => boolean;
    getToken: () => Promise<string | null>;
  },
}));
vi.mock('@/lib/identity/useSessionSnapshot', () => ({
  useSessionSnapshot: () => () => identity.session,
  useReadonlyIdentityLifetime: () => () => {
    const generation = identity.generation;
    return { isCurrent: () => generation === identity.generation };
  },
}));

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

const audioFixtureCleanups: Array<() => void> = [];
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
  toastMock.error.mockClear();
  identity.generation = 0;
  identity.session = null;
  installSpeechSynthesis();
  window.localStorage.clear();
});

afterEach(() => {
  audioFixtureCleanups.splice(0).forEach((close) => close());
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
        { deviceVoice: true },
      ),
    );

    expect(spoken[0]!.text).toBe('Result\nDone here\ncode block omitted.');
  });

  it('tracks start and completion from the active utterance', () => {
    const { result } = renderHook(() => useTTS());

    act(() => result.current.speak('Hello', { deviceVoice: true }));
    const utterance = spoken[0]!;
    act(() => utterance.onstart?.(undefined as never));
    expect(result.current.isSpeaking).toBe(true);

    act(() => utterance.onend?.(undefined as never));
    expect(result.current.isSpeaking).toBe(false);
  });

  it('switches directly to another response and ignores stale completion events', () => {
    const { result } = renderHook(() => useTTS());

    act(() => result.current.speak('First', { deviceVoice: true }));
    const first = spoken[0]!;
    act(() => first.onstart?.(undefined as never));

    act(() => result.current.speak('Second', { deviceVoice: true }));
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
    act(() => result.current.speak('hallo', { deviceVoice: true }));

    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.voice).toBe(BRUNO);
    expect(spoken[0]!.lang).toBe('de-DE');
  });

  it('leaves the browser default in place when nothing is selected', () => {
    const { result } = renderHook(() => useTTS());
    emitVoicesChanged([ALICE]);

    act(() => result.current.speak('hello', { deviceVoice: true }));

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
    act(() => chat.result.current.speak('hallo', { deviceVoice: true }));
    expect(spoken[0]!.voice).toBe(BRUNO);
  });

  it('clears back to the default', () => {
    const { result } = renderHook(() => useTTS());
    emitVoicesChanged([ALICE]);

    act(() => result.current.setVoiceUri(ALICE.voiceURI));
    act(() => result.current.setVoiceUri(null));
    act(() => result.current.speak('hello', { deviceVoice: true }));

    expect(result.current.voiceUri).toBeNull();
    expect(spoken[0]!.voice).toBeNull();
  });
});

describe('useTTS, missing voice', () => {
  it('still speaks when the stored voice is not installed here', () => {
    window.localStorage.setItem('agi:tts-voice-uri', 'urn:voice:not-on-this-device');
    available = [ALICE];

    const { result } = renderHook(() => useTTS());
    act(() => result.current.speak('hello', { deviceVoice: true }));

    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.voice).toBeNull();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function signedIn() {
  const generation = identity.generation;
  const getToken = vi.fn(async () => 'fixture-session-token');
  identity.session = {
    userId: 'fixture-user',
    sessionId: 'fixture-session',
    getToken,
    isCurrent: () => identity.generation === generation,
  };
  return getToken;
}

function installAudio(state: 'running' | 'suspended' = 'running') {
  const resume = deferred<void>();
  const decode = vi.fn(async () => ({}) as AudioBuffer);
  const sources: Array<{
    buffer: AudioBuffer | null;
    onended: (() => void) | null;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const context = {
    state,
    destination: {},
    decodeAudioData: decode,
    resume: vi.fn(() =>
      resume.promise.then(() => {
        context.state = 'running';
      }),
    ),
    createBufferSource: vi.fn(() => {
      const source = {
        buffer: null,
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    }),
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context;
      }
    },
  );
  // Each fixture closes its context so the production shared context is not
  // reused by the next fixture. No real audio is created.
  const close = () => {
    (context as { state: string }).state = 'closed';
  };
  audioFixtureCleanups.push(close);
  return { context, resume, decode, sources, close };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}

describe('useTTS, owner lifetime fixtures', () => {
  it('does not let a passive settings hook cancel another hook voice', () => {
    const speaker = renderHook(() => useTTS());
    const passive = renderHook(() => useTTS());
    act(() => speaker.result.current.speak('Owned', { deviceVoice: true }));
    const cancel = vi.mocked(window.speechSynthesis.cancel);
    cancel.mockClear();
    passive.unmount();
    expect(cancel).not.toHaveBeenCalled();
    speaker.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('retires the old device lease before replacement and ignores old cleanup', () => {
    const first = renderHook(() => useTTS());
    const second = renderHook(() => useTTS());
    act(() => first.result.current.speak('First', { deviceVoice: true }));
    const staleEnd = spoken[0]!.onend;
    act(() => second.result.current.speak('Second', { deviceVoice: true }));
    const cancel = vi.mocked(window.speechSynthesis.cancel);
    cancel.mockClear();
    act(() => staleEnd?.call(spoken[0]!, new Event('end') as SpeechSynthesisEvent));
    first.unmount();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('retires playing device speech on an observed identity render', () => {
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('Private', { deviceVoice: true }));
    const cancel = vi.mocked(window.speechSynthesis.cancel);
    cancel.mockClear();
    identity.generation += 1;
    hook.rerender();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isSpeaking).toBe(false);
  });

  it('rejects a retained callback after an observed scope round trip', () => {
    const hook = renderHook(({ scope }) => useTTS(scope), { initialProps: { scope: 'a' } });
    const oldSpeak = hook.result.current.speak;
    hook.rerender({ scope: 'b' });
    hook.rerender({ scope: 'a' });
    act(() => oldSpeak('Old content', { deviceVoice: true }));
    expect(spoken).toHaveLength(0);
  });

  it('preserves anonymous device speech without dispatching a managed request', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('Anonymous'));
    expect(spoken[0]!.text).toBe('Anonymous');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not acquire a token or dispatch after stop during resume', async () => {
    const token = signedIn();
    const audio = installAudio('suspended');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('Stopped'));
    act(() => hook.result.current.stop());
    audio.resume.resolve();
    await flush();
    expect(token).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
    audio.close();
  });

  it('pins bearer transport and stops an owned source on unmount without another chunk', async () => {
    signedIn();
    const audio = installAudio();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
    }));
    vi.stubGlobal('fetch', fetcher);
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('x'.repeat(4000)));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-session-token');
    expect(new Headers(init?.headers).has('x-csrf-token')).toBe(false);
    const source = audio.sources[0]!;
    expect(source.start).toHaveBeenCalledOnce();
    hook.unmount();
    await flush();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(init?.signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    audio.close();
  });

  it('tells the user when a later chunk of managed speech fails after the first one played', async () => {
    signedIn();
    const audio = installAudio();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
      .mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });
    vi.stubGlobal('fetch', fetcher);
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('x'.repeat(4000)));
    await flush();
    expect(toastMock.error).not.toHaveBeenCalled();
    act(() => audio.sources[0]!.onended?.());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isSpeaking).toBe(false);
    audio.close();
  });

  it('tells the user when device speech errors out, but not when it is cancelled', () => {
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('Hello', { deviceVoice: true }));
    const utterance = spoken[0]!;
    act(() => utterance.onerror?.({ error: 'canceled' } as SpeechSynthesisErrorEvent));
    expect(toastMock.error).not.toHaveBeenCalled();
    act(() => hook.result.current.speak('Again', { deviceVoice: true }));
    act(() => spoken[1]!.onerror?.({ error: 'audio-hardware' } as SpeechSynthesisErrorEvent));
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch or fallback after an owner change during token acquisition', async () => {
    signedIn();
    const token = deferred<string | null>();
    identity.session!.getToken = () => token.promise;
    const audio = installAudio();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('Original account'));
    identity.generation += 1;
    hook.rerender();
    token.resolve('old-session-token');
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
    audio.close();
  });
});

describe('useTTS, asynchronous boundary fixtures', () => {
  it.each(['body', 'decode'] as const)(
    'does not play or fallback after stop during %s',
    async (boundary) => {
      signedIn();
      const audio = installAudio();
      const body = deferred<ArrayBuffer>();
      const decoded = deferred<AudioBuffer>();
      if (boundary === 'decode') audio.decode.mockImplementation(() => decoded.promise);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          arrayBuffer: () =>
            boundary === 'body' ? body.promise : Promise.resolve(new ArrayBuffer(1)),
        })),
      );
      const hook = renderHook(() => useTTS());
      act(() => hook.result.current.speak('Delayed content'));
      await flush();
      act(() => hook.result.current.stop());
      body.resolve(new ArrayBuffer(1));
      decoded.resolve({} as AudioBuffer);
      await flush();
      expect(audio.sources).toHaveLength(0);
      expect(spoken).toHaveLength(0);
      expect(hook.result.current.isSpeaking).toBe(false);
      audio.close();
    },
  );

  it('preserves the same-owner first chunk device fallback', async () => {
    signedIn();
    const audio = installAudio();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('Fallback'));
    await flush();
    expect(spoken[0]!.text).toBe('Fallback');
    audio.close();
  });

  it('continues same-owner chunks then settles without device fallback', async () => {
    signedIn();
    const audio = installAudio();
    const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
    vi.stubGlobal('fetch', fetcher);
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('x'.repeat(4000)));
    await flush();
    act(() => audio.sources[0]!.onended?.());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    act(() => audio.sources[1]!.onended?.());
    await flush();
    expect(hook.result.current.isSpeaking).toBe(false);
    expect(spoken).toHaveLength(0);
    audio.close();
  });

  it('retires an already-playing server source when identity is observed changing', async () => {
    signedIn();
    const audio = installAudio();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
    );
    const hook = renderHook(() => useTTS());
    act(() => hook.result.current.speak('Playing'));
    await flush();
    identity.generation += 1;
    hook.rerender();
    await flush();
    expect(audio.sources[0]!.stop).toHaveBeenCalledOnce();
    expect(hook.result.current.isSpeaking).toBe(false);
    audio.close();
  });

  it('rejects a retained callback after an identity render', () => {
    const hook = renderHook(() => useTTS());
    const oldSpeak = hook.result.current.speak;
    identity.generation += 1;
    hook.rerender();
    act(() => oldSpeak('Old owner', { deviceVoice: true }));
    expect(spoken).toHaveLength(0);
  });
});

it('does not let a retained old-scope stop cancel replacement speech', () => {
  const hook = renderHook(({ scope }) => useTTS(scope), { initialProps: { scope: 'a' } });
  const oldStop = hook.result.current.stop;
  hook.rerender({ scope: 'b' });
  act(() => hook.result.current.speak('Replacement', { deviceVoice: true }));
  const cancel = vi.mocked(window.speechSynthesis.cancel);
  cancel.mockClear();
  act(() => oldStop());
  expect(cancel).not.toHaveBeenCalled();
});

it('does not claim or cancel unrelated browser speech already in progress', () => {
  Object.defineProperty(window.speechSynthesis, 'speaking', { value: true, configurable: true });
  const hook = renderHook(() => useTTS());
  act(() => hook.result.current.speak('Do not interrupt', { deviceVoice: true }));
  expect(spoken).toHaveLength(0);
  hook.unmount();
  expect(window.speechSynthesis.cancel).not.toHaveBeenCalled();
});

it('does not let an old identity stop cancel the new identity voice', () => {
  const hook = renderHook(() => useTTS());
  const oldStop = hook.result.current.stop;
  identity.generation += 1;
  hook.rerender();
  act(() => hook.result.current.speak('New identity', { deviceVoice: true }));
  const cancel = vi.mocked(window.speechSynthesis.cancel);
  cancel.mockClear();
  act(() => oldStop());
  expect(cancel).not.toHaveBeenCalled();
});

describe('useTTS, central content policy fixtures', () => {
  it('refuses before acquiring tokens, creating audio, or speaking device text', () => {
    const token = signedIn();
    const context = vi.fn();
    vi.stubGlobal('AudioContext', context);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const hook = renderHook(() => useTTS('code', false));
    act(() => hook.result.current.speak('Restricted'));
    act(() => hook.result.current.speak('Restricted', { deviceVoice: true }));
    act(() => hook.result.current.unlock());
    expect(token).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
  });

  it('retires playing speech and rejects retained handlers after Code policy narrows', () => {
    const hook = renderHook(({ allowed }) => useTTS('same-code', allowed), {
      initialProps: { allowed: true },
    });
    const staleSpeak = hook.result.current.speak;
    act(() => hook.result.current.speak('Earlier', { deviceVoice: true }));
    const cancel = vi.mocked(window.speechSynthesis.cancel);
    cancel.mockClear();
    hook.rerender({ allowed: false });
    expect(cancel).toHaveBeenCalledOnce();
    act(() => staleSpeak('Stale permission', { deviceVoice: true }));
    expect(spoken).toHaveLength(1);
    hook.rerender({ allowed: true });
    act(() => staleSpeak('Old generation', { deviceVoice: true }));
    expect(spoken).toHaveLength(1);
  });

  it('retires an active Chat operation when its current-row predicate changes', () => {
    let currentRowAllowed = true;
    const canSpeak = () => currentRowAllowed;
    const hook = renderHook(() => useTTS('chat'));
    act(() => hook.result.current.speak('Current row', { deviceVoice: true, canSpeak }));
    const cancel = vi.mocked(window.speechSynthesis.cancel);
    cancel.mockClear();
    currentRowAllowed = false;
    hook.rerender();
    expect(cancel).toHaveBeenCalledOnce();
    act(() => hook.result.current.speak('Stale row', { canSpeak }));
    expect(spoken).toHaveLength(1);
  });

  it('does not fetch or fall back when row policy narrows during resume', async () => {
    signedIn();
    const audio = installAudio('suspended');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    let currentRowAllowed = true;
    const hook = renderHook(() => useTTS('chat'));
    act(() => hook.result.current.speak('Current row', { canSpeak: () => currentRowAllowed }));
    currentRowAllowed = false;
    audio.resume.resolve();
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
    audio.close();
  });
});

it('does not let an old-policy stop cancel a replacement after a policy round trip', () => {
  const hook = renderHook(({ allowed }) => useTTS('code', allowed), {
    initialProps: { allowed: true },
  });
  const oldStop = hook.result.current.stop;
  hook.rerender({ allowed: false });
  hook.rerender({ allowed: true });
  act(() => hook.result.current.speak('Replacement', { deviceVoice: true }));
  const cancel = vi.mocked(window.speechSynthesis.cancel);
  cancel.mockClear();
  act(() => oldStop());
  expect(cancel).not.toHaveBeenCalled();
});
