jest.mock('@/services/api', () => ({
  apiFetchBinary: jest.fn(),
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
  speak: jest.fn().mockImplementation((_text: string, opts?: { onDone?: () => void }) => {
    opts?.onDone?.();
  }),
  stop: jest.fn().mockResolvedValue(undefined),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/src/features/voice/services/speechSettings', () => ({
  speechSettings: () => ({ rate: 1.5, pitch: 1, language: 'en-US' }),
}));

import * as Speech from 'expo-speech';
import { createAudioPlayer } from 'expo-audio';
import { apiFetchBinary } from '@/services/api';
import * as VoiceOutput from '@/src/features/voice/services/voiceOutput';

type MockPlayer = { emit: (event: string, payload: unknown) => void; remove: jest.Mock };

const fetchMock = apiFetchBinary as jest.Mock;
const playerMock = createAudioPlayer as jest.Mock;

async function waitForPlayer(count = 1): Promise<MockPlayer> {
  for (let i = 0; i < 50 && playerMock.mock.results.length < count; i++) {
    await Promise.resolve();
  }
  return playerMock.mock.results[count - 1].value as MockPlayer;
}

describe('server read aloud', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('speaks through the registry speech route and reports completion', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      contentType: 'audio/mpeg',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    });
    const onDone = jest.fn();
    const onStart = jest.fn();

    const speaking = VoiceOutput.speak('Hello there.', { serverVoice: true, onDone, onStart });
    const player = await waitForPlayer();
    player.emit('playbackStatusUpdate', { didJustFinish: true, error: null });
    await speaking;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init, options] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/voice/speech');
    expect(JSON.parse(init.body)).toEqual({ text: 'Hello there.', speed: 1.5 });
    expect(options.headers['Idempotency-Key']).toMatch(/^read-aloud:[0-9a-f-]{36}$/);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
  });

  it('falls back to the device voice when the server cannot speak', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      contentType: 'application/json',
      bytes: new ArrayBuffer(0),
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onDone = jest.fn();

    await VoiceOutput.speak('Fallback text.', { serverVoice: true, onDone });

    expect(Speech.speak).toHaveBeenCalledWith('Fallback text.', expect.any(Object));
    expect(onDone).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('stops server playback and reports it as stopped', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      contentType: 'audio/mpeg',
      bytes: new Uint8Array([1]).buffer,
    });
    const onStopped = jest.fn();
    const onDone = jest.fn();

    const speaking = VoiceOutput.speak('Stop me.', { serverVoice: true, onStopped, onDone });
    const player = await waitForPlayer();
    await VoiceOutput.stop();
    await speaking;

    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('keeps Local Mode speech on the device', async () => {
    await VoiceOutput.speak('Local only.');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith('Local only.', expect.any(Object));
  });
});
