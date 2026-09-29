import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { apiFetchBinary } from '@/services/api';

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
  rate?: number;
  onStart?: () => void;
}

export class ServerSpeechError extends Error {
  constructor(readonly status: number) {
    super(`Read aloud request failed with HTTP ${status}`);
    this.name = 'ServerSpeechError';
  }
}

let generation = 0;
let activeAbort: AbortController | null = null;
let activePlayer: AudioPlayer | null = null;
let activeFile: File | null = null;
let settleActive: (() => void) | null = null;

function releasePlayback(): void {
  activePlayer?.remove();
  activePlayer = null;
  const file = activeFile;
  activeFile = null;
  if (!file) return;
  try {
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('[serverSpeech] cache cleanup failed', error);
  }
}

export function stopServerSpeech(): void {
  generation += 1;
  activeAbort?.abort();
  activeAbort = null;
  activePlayer?.pause();
  releasePlayback();
  const settle = settleActive;
  settleActive = null;
  settle?.();
}

async function synthesize(text: string, speed: number, signal: AbortSignal): Promise<Uint8Array> {
  const response = await apiFetchBinary(
    SERVER_SPEECH_PATH,
    {
      method: 'POST',
      body: JSON.stringify({ text, speed: Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED) }),
      signal,
    },
    {
      headers: { 'Idempotency-Key': `read-aloud:${uuidv7()}` },
      timeout: SERVER_SPEECH_TIMEOUT_MS,
    },
  );
  if (!response.ok || response.bytes.byteLength === 0) {
    throw new ServerSpeechError(response.status);
  }
  return new Uint8Array(response.bytes);
}

function play(bytes: Uint8Array): Promise<boolean> {
  const file = new File(Paths.cache, `read-aloud-${uuidv7()}.mp3`);
  file.create({ overwrite: true });
  file.write(bytes);
  activeFile = file;
  const player = createAudioPlayer(file.uri);
  activePlayer = player;
  return new Promise<boolean>((resolve, reject) => {
    settleActive = () => resolve(false);
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.error) {
        settleActive = null;
        releasePlayback();
        reject(new Error(status.error));
        return;
      }
      if (!status.didJustFinish) return;
      settleActive = null;
      releasePlayback();
      resolve(true);
    });
    player.play();
  });
}

export async function speakWithServer(
  chunks: readonly string[],
  options: ServerSpeechOptions = {},
): Promise<ServerSpeechOutcome> {
  const token = generation;
  const speed = options.rate ?? 1;
  const abort = new AbortController();
  activeAbort = abort;
  let index = 0;
  let started = false;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    let pending: Promise<Uint8Array> | null =
      chunks.length > 0 ? synthesize(chunks[0], speed, abort.signal) : null;
    while (pending) {
      const bytes = await pending;
      if (token !== generation) return { status: 'stopped' };
      pending =
        index + 1 < chunks.length ? synthesize(chunks[index + 1], speed, abort.signal) : null;
      pending?.catch(() => undefined);
      if (!started) {
        started = true;
        options.onStart?.();
      }
      const finished = await play(bytes);
      if (!finished || token !== generation) return { status: 'stopped' };
      index += 1;
    }
    return { status: 'done' };
  } catch (error) {
    if (token !== generation) return { status: 'stopped' };
    releasePlayback();
    return {
      status: 'failed',
      remaining: chunks.slice(index),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  } finally {
    if (activeAbort === abort) activeAbort = null;
    abort.abort();
  }
}
