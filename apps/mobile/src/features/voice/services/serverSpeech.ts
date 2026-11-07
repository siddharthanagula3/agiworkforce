import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { apiFetchBinary } from '@/services/api';
import {
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

export const SERVER_SPEECH_PATH = '/api/voice/speech';
export const SERVER_SPEECH_MAX_CHARS = 3_800;
const SERVER_SPEECH_TIMEOUT_MS = 60_000;
const MIN_SPEED = 0.25;
const MAX_SPEED = 4;

export type ServerSpeechOutcome =
  | { status: 'done' }
  | { status: 'stopped' }
  | { status: 'failed'; remaining: string[]; error: Error };

export interface ServerSpeechOptions {
  account: CloudAccountEpoch;
  isCurrent: () => boolean;
  rate?: number;
  onStart?: () => void;
}

export interface ServerSpeechHandle {
  done: Promise<ServerSpeechOutcome>;
  stop: () => Promise<void>;
}

export class ServerSpeechError extends Error {
  constructor(readonly status: number) {
    super(`Read aloud request failed with HTTP ${status}`);
    this.name = 'ServerSpeechError';
  }
}

async function synthesize(
  text: string,
  speed: number,
  signal: AbortSignal,
  account: CloudAccountEpoch,
): Promise<Uint8Array> {
  const response = await apiFetchBinary(
    SERVER_SPEECH_PATH,
    {
      method: 'POST',
      body: JSON.stringify({ text, speed: Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED) }),
      signal,
    },
    {
      accountEpoch: account,
      headers: { 'Idempotency-Key': `read-aloud:${uuidv7()}` },
      timeout: SERVER_SPEECH_TIMEOUT_MS,
    },
  );
  if (!response.ok || response.bytes.byteLength === 0) {
    throw new ServerSpeechError(response.status);
  }
  return new Uint8Array(response.bytes);
}

function play(bytes: Uint8Array): { done: Promise<boolean>; stop: () => void } {
  const file = new File(Paths.cache, `read-aloud-${uuidv7()}.mp3`);
  let player: AudioPlayer | null = null;
  let subscription: { remove: () => void } | null = null;
  let settled = false;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    for (const cleanup of [
      () => subscription?.remove(),
      () => player?.pause(),
      () => player?.remove(),
      () => {
        if (file.exists) file.delete();
      },
    ]) {
      try {
        cleanup();
      } catch (error) {
        console.warn('[serverSpeech] playback cleanup failed', error);
      }
    }
  };
  let resolveDone!: (finished: boolean) => void;
  let rejectDone!: (error: Error) => void;
  const done = new Promise<boolean>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const finish = (finished: boolean, error?: Error) => {
    if (settled) return;
    settled = true;
    release();
    if (error) rejectDone(error);
    else resolveDone(finished);
  };
  try {
    file.create({ overwrite: true });
    file.write(bytes);
    player = createAudioPlayer(file.uri);
    subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.error) finish(false, new Error(status.error));
      else if (status.didJustFinish) finish(true);
    });
    if (settled) subscription.remove();
    else player.play();
  } catch (error) {
    finish(false, error instanceof Error ? error : new Error(String(error)));
  }
  return { done, stop: () => finish(false) };
}

export function startServerSpeech(
  chunks: readonly string[],
  options: ServerSpeechOptions,
): ServerSpeechHandle {
  const abort = new AbortController();
  let playback: ReturnType<typeof play> | null = null;
  let settled = false;
  let resolveDone!: (outcome: ServerSpeechOutcome) => void;
  const done = new Promise<ServerSpeechOutcome>((resolve) => {
    resolveDone = resolve;
  });
  const current = () =>
    !settled &&
    !abort.signal.aborted &&
    options.isCurrent() &&
    isCloudAccountEpochCurrent(options.account);
  const finish = (outcome: ServerSpeechOutcome) => {
    if (settled) return;
    settled = true;
    abort.abort();
    playback?.stop();
    playback = null;
    resolveDone(outcome);
  };
  const handle: ServerSpeechHandle = {
    done,
    stop: () => {
      finish({ status: 'stopped' });
      return Promise.resolve();
    },
  };
  void Promise.resolve().then(async () => {
    let index = 0;
    try {
      if (!current()) return finish({ status: 'stopped' });
      await setAudioModeAsync({ playsInSilentMode: true });
      if (!current()) return finish({ status: 'stopped' });
      const speed = options.rate ?? 1;
      let pending = chunks.length
        ? synthesize(chunks[0], speed, abort.signal, options.account)
        : null;
      while (pending) {
        const bytes = await pending;
        if (!current()) return finish({ status: 'stopped' });
        pending =
          index + 1 < chunks.length
            ? synthesize(chunks[index + 1], speed, abort.signal, options.account)
            : null;
        void pending?.catch(() => undefined);
        if (index === 0) options.onStart?.();
        if (!current()) return finish({ status: 'stopped' });
        playback = play(bytes);
        const finished = await playback.done;
        playback = null;
        if (!finished || !current()) return finish({ status: 'stopped' });
        index += 1;
      }
      finish({ status: 'done' });
    } catch (error) {
      if (!current()) return finish({ status: 'stopped' });
      finish({
        status: 'failed',
        remaining: chunks.slice(index),
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  });
  return handle;
}
