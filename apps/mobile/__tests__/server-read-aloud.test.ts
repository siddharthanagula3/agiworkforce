jest.mock('@/services/api', () => ({ apiFetchBinary: jest.fn() }));
jest.mock('@/lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = `file:///cache/${String(parts[parts.length - 1])}`;
    }
    create() {
      this.exists = true;
    }
    write() {}
    delete() {
      this.exists = false;
    }
  }
  return { File, Paths: { cache: 'cache' } };
});

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/src/features/voice/services/speechSettings', () => ({
  speechSettings: () => ({ rate: 1.5, pitch: 1, language: 'en-US' }),
}));

import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { apiFetchBinary } from '@/services/api';
import * as VoiceOutput from '@/src/features/voice/services/voiceOutput';
import { preparePlayback } from '@/src/features/voice/services/tts';
import { captureAccountScopedUiState } from '@/src/features/auth/services/accountScopedUiState';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

type Status = { didJustFinish?: boolean; error?: string | null };
type MockPlayer = {
  emit: (event: string, payload: unknown) => void;
  addListener: jest.Mock;
  remove: jest.Mock;
};
type NativeCallbacks = {
  onStart: () => void;
  onDone: () => void;
  onStopped: () => void;
  onError: (error: Error) => void;
};
const fetchMock = apiFetchBinary as jest.Mock;
const playerMock = createAudioPlayer as jest.Mock;
const speechMock = Speech.speak as jest.Mock;
const stopMock = Speech.stop as jest.Mock;
const modeMock = setAudioModeAsync as jest.Mock;
const owners: VoiceOutput.VoiceOutputOwner[] = [];
const audio = {
  ok: true,
  status: 200,
  contentType: 'audio/mpeg',
  bytes: new Uint8Array([1, 2, 3]).buffer,
};

function owner(scope: 'local' | 'cloud' = 'cloud') {
  const result = VoiceOutput.createVoiceOutputOwner(captureAccountScopedUiState(scope));
  owners.push(result);
  return result;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

async function flushUntil(observed: () => boolean): Promise<void> {
  for (let index = 0; index < 100 && !observed(); index += 1) await Promise.resolve();
  expect(observed()).toBe(true);
}

async function waitForPlayer(count = 1): Promise<MockPlayer> {
  await flushUntil(() => playerMock.mock.results.length >= count);
  return playerMock.mock.results[count - 1].value as MockPlayer;
}

async function waitForNative(count = 1): Promise<NativeCallbacks> {
  await flushUntil(() => speechMock.mock.calls.length >= count);
  return speechMock.mock.calls[count - 1][1] as NativeCallbacks;
}

describe('owned read aloud', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    fetchMock.mockReset().mockResolvedValue(audio);
    modeMock.mockReset().mockResolvedValue(undefined);
    stopMock.mockReset().mockResolvedValue(undefined);
    speechMock.mockReset().mockImplementation((_text: string, callbacks: NativeCallbacks) => {
      callbacks.onStart();
      callbacks.onDone();
    });
  });

  afterEach(async () => {
    while (owners.length > 0) {
      await Promise.all(owners.splice(0).map((entry) => entry.dispose()));
    }
    await preparePlayback();
    jest.restoreAllMocks();
  });

  it('uses the speech route and captured account and completes once', async () => {
    const onDone = jest.fn();
    const onStart = jest.fn();
    const source = owner();
    const speaking = source.start('Hello there.', { serverVoice: true, onDone, onStart });
    const player = await waitForPlayer();
    player.emit('playbackStatusUpdate', { didJustFinish: true });
    await expect(speaking.done).resolves.toEqual({ status: 'done' });

    const [path, init, options] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/voice/speech');
    expect(JSON.parse(init.body)).toEqual({ text: 'Hello there.', speed: 1.5 });
    expect(options.accountEpoch).toEqual(source.source?.scope === 'cloud' && source.source.account);
    expect(options.headers['Idempotency-Key']).toMatch(/^read-aloud:[0-9a-f-]{36}$/);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(speechMock).not.toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalledTimes(1);
  });

  it('falls back only to unfinished text after a same-owner server failure', async () => {
    fetchMock.mockResolvedValueOnce(audio).mockRejectedValueOnce(new Error('unavailable'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const speaking = owner().start(`${'a'.repeat(3800)} tail`, { serverVoice: true });
    const player = await waitForPlayer();
    player.emit('playbackStatusUpdate', { didJustFinish: true });
    await expect(speaking.done).resolves.toEqual({ status: 'done' });
    expect(speechMock).toHaveBeenCalledTimes(1);
    expect(speechMock.mock.calls[0][0]).toBe('tail');
  });

  it('stops server playback with no device fallback or done callback', async () => {
    const onStopped = jest.fn();
    const onDone = jest.fn();
    const speaking = owner().start('Stop me.', { serverVoice: true, onStopped, onDone });
    const player = await waitForPlayer();
    await speaking.stop();
    await expect(speaking.done).resolves.toEqual({ status: 'stopped' });
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(speechMock).not.toHaveBeenCalled();
  });

  it('does not create playback if onStart stops its operation', async () => {
    const speaking = owner().start('Stop at start.', {
      serverVoice: true,
      onStart: () => {
        void speaking.stop();
      },
    });
    await expect(speaking.done).resolves.toEqual({ status: 'stopped' });
    expect(playerMock).not.toHaveBeenCalled();
    expect(speechMock).not.toHaveBeenCalled();
  });

  it('ignores an old player callback and stale owner cleanup after replacement', async () => {
    const oldOwner = owner();
    const first = oldOwner.start('First.', { serverVoice: true });
    const oldPlayer = await waitForPlayer();
    const staleListener = oldPlayer.addListener.mock.calls[0][1] as (status: Status) => void;
    const second = owner().start('Second.', { serverVoice: true });
    const newPlayer = await waitForPlayer(2);
    staleListener({ error: 'late failure' });
    staleListener({ didJustFinish: true });
    await oldOwner.dispose();
    await expect(first.done).resolves.toEqual({ status: 'stopped' });
    expect(newPlayer.remove).not.toHaveBeenCalled();
    await expect(VoiceOutput.isSpeaking()).resolves.toBe(true);
    newPlayer.emit('playbackStatusUpdate', { didJustFinish: true });
    await expect(second.done).resolves.toEqual({ status: 'done' });
  });

  it('does not send a first request after account retirement during audio setup', async () => {
    const setup = deferred<void>();
    modeMock.mockReturnValueOnce(setup.promise);
    const speaking = owner().start('Private text.', { serverVoice: true });
    await flushUntil(() => modeMock.mock.calls.length === 1);
    invalidateCloudAccount();
    setup.resolve();
    await expect(speaking.done).resolves.toEqual({ status: 'stopped' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speechMock).not.toHaveBeenCalled();
  });

  it('pins prefetches to one epoch and stops playback on an account switch', async () => {
    const next = deferred<typeof audio>();
    fetchMock.mockResolvedValueOnce(audio).mockReturnValueOnce(next.promise);
    const source = owner();
    const speaking = source.start('a'.repeat(7601), { serverVoice: true });
    const player = await waitForPlayer();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    activateCloudAccount('account-b');
    next.resolve(audio);
    await expect(speaking.done).resolves.toEqual({ status: 'stopped' });
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(speechMock).not.toHaveBeenCalled();
    for (const [, , options] of fetchMock.mock.calls) {
      expect(options.accountEpoch).toEqual(
        source.source?.scope === 'cloud' && source.source.account,
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats Cloud native speech and fallback as account-owned', async () => {
    speechMock.mockImplementation(() => undefined);
    fetchMock.mockRejectedValue(new Error('unavailable'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const speaking = owner().start('a'.repeat(1200), { serverVoice: true });
    const callbacks = await waitForNative();
    invalidateCloudAccount();
    callbacks.onDone();
    await expect(speaking.done).resolves.toEqual({ status: 'stopped' });
    expect(speechMock).toHaveBeenCalledTimes(1);
  });

  it('stops Cloud device-only speech on account change without using the server', async () => {
    speechMock.mockImplementation(() => undefined);
    const speaking = owner().start('a'.repeat(1200));
    const callbacks = await waitForNative();
    activateCloudAccount('account-b');
    callbacks.onDone();
    await expect(speaking.done).resolves.toEqual({ status: 'stopped' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speechMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a missing Cloud source instead of using device fallback', async () => {
    invalidateCloudAccount();
    const speaking = owner().start('Private text.', { serverVoice: true });
    await expect(speaking.done).resolves.toEqual({ status: 'stopped' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speechMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it('keeps Local speech on the existing native route', async () => {
    await expect(owner('local').start('Local only.').done).resolves.toEqual({ status: 'done' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speechMock).toHaveBeenCalledWith('Local only.', expect.any(Object));
  });

  it('does not let a Local owner opt into server speech', async () => {
    await expect(owner('local').start('Local only.', { serverVoice: true }).done).resolves.toEqual({
      status: 'stopped',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speechMock).not.toHaveBeenCalled();
  });

  it('stops the full device chunk loop when any native chunk reports stopped', async () => {
    speechMock.mockImplementation(() => undefined);
    const onStopped = jest.fn();
    const onDone = jest.fn();
    const speaking = owner('local').start('a'.repeat(1200), { onStopped, onDone });
    const callbacks = await waitForNative();
    callbacks.onStopped();
    callbacks.onDone();
    await expect(speaking.done).resolves.toEqual({ status: 'stopped' });
    expect(speechMock).toHaveBeenCalledTimes(1);
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('retires queued device starts before an awaited native stop resolves', async () => {
    const stopping = deferred<void>();
    stopMock.mockReturnValueOnce(stopping.promise);
    speechMock.mockImplementation(() => undefined);
    const first = owner('local').start('First.');
    await flushUntil(() => stopMock.mock.calls.length === 1);
    const second = owner('local').start('Second.');
    stopping.resolve();
    const callbacks = await waitForNative();
    expect(speechMock.mock.calls.map(([text]) => text)).toEqual(['Second.']);
    await expect(first.done).resolves.toEqual({ status: 'stopped' });
    callbacks.onDone();
    await expect(second.done).resolves.toEqual({ status: 'done' });
  });

  it('does not let a stale native callback finish replacement speech', async () => {
    speechMock.mockImplementation(() => undefined);
    const first = owner('local').start('First.');
    const oldCallbacks = await waitForNative();
    const second = owner('local').start('Second.');
    const newCallbacks = await waitForNative(2);
    oldCallbacks.onDone();
    oldCallbacks.onError(new Error('late error'));
    await expect(first.done).resolves.toEqual({ status: 'stopped' });
    await expect(VoiceOutput.isSpeaking()).resolves.toBe(true);
    newCallbacks.onDone();
    await expect(second.done).resolves.toEqual({ status: 'done' });
  });

  it('keeps Stop terminal and permits a new attempt after native Stop rejects', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    speechMock.mockImplementation(() => undefined);
    const onStopped = jest.fn();
    const first = owner('local').start('First.', { onStopped });
    await waitForNative();
    stopMock.mockRejectedValueOnce(new Error('native stop failed'));
    await expect(first.stop()).rejects.toThrow('native stop failed');
    await expect(first.done).resolves.toEqual({ status: 'stopped' });
    expect(onStopped).toHaveBeenCalledTimes(1);

    speechMock.mockImplementation((_text: string, callbacks: NativeCallbacks) =>
      callbacks.onDone(),
    );
    const second = owner('local').start('Second.');
    await expect(second.done).resolves.toEqual({ status: 'done' });
    expect(speechMock.mock.calls.map(([text]) => text)).toEqual(['First.', 'Second.']);
  });

  it('settles even when a completion callback throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onDone = jest.fn(() => {
      throw new Error('caller failed');
    });
    await expect(owner('local').start('Hello.', { onDone }).done).resolves.toEqual({
      status: 'done',
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps a reentrant replacement started by an old stopped callback', async () => {
    speechMock.mockImplementation(() => undefined);
    let newest: VoiceOutput.VoiceOutputHandle | undefined;
    const first = owner('local').start('First.', {
      onStopped: () => {
        newest = owner('local').start('Newest.');
      },
    });
    await waitForNative();
    const second = owner('local').start('Second.');
    const callbacks = await waitForNative(2);
    expect(speechMock.mock.calls.map(([text]) => text)).toEqual(['First.', 'Newest.']);
    await expect(first.done).resolves.toEqual({ status: 'stopped' });
    await expect(second.done).resolves.toEqual({ status: 'stopped' });
    callbacks.onDone();
    await expect(newest?.done).resolves.toEqual({ status: 'done' });
  });
});
