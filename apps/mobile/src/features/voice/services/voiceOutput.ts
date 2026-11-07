import * as TTS from './tts';
import { SERVER_SPEECH_MAX_CHARS, startServerSpeech } from './serverSpeech';
import {
  isAccountScopedUiStateOwned,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { subscribeCloudAccountEpochChange } from '@/src/features/auth/services/cloudAccountSession';

export type { TTSOptions, VoiceInfo } from './tts';
export type VoiceOutputOutcome = TTS.SpeechOutcome;
export type VoiceOutputHandle = TTS.SpeechHandle;

const MAX_CHUNK_CHARS = 500;

export interface VoiceOutputOptions extends TTS.TTSOptions {
  serverVoice?: boolean;
}

export interface VoiceOutputOwner {
  readonly source: AccountScopedUiState | null;
  isCurrent: () => boolean;
  start: (text: string, options?: VoiceOutputOptions) => VoiceOutputHandle;
  stop: () => Promise<void>;
  dispose: () => Promise<void>;
}

let activeOperation: VoiceOutputHandle | null = null;

function notify(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch (error) {
    console.warn('[voiceOutput] speech callback failed', error);
  }
}

export function createVoiceOutputOwner(source: AccountScopedUiState | null): VoiceOutputOwner {
  const capturedSource: AccountScopedUiState | null = source
    ? source.scope === 'cloud'
      ? { scope: 'cloud', account: { ...source.account } }
      : { scope: 'local' }
    : null;
  let disposed = false;
  let ownedOperation: VoiceOutputHandle | null = null;
  const ownerCurrent = () => !disposed && isAccountScopedUiStateOwned(capturedSource);
  const stopOwned = () => ownedOperation?.stop() ?? Promise.resolve();

  return {
    source: capturedSource,
    isCurrent: ownerCurrent,
    stop: stopOwned,
    dispose: () => {
      disposed = true;
      return stopOwned();
    },
    start: (text, suppliedOptions = {}) => {
      const options = { ...suppliedOptions };
      let settled = false;
      let started = false;
      let stopTransport: (() => Promise<void>) | null = null;
      let stopping: Promise<void> | null = null;
      let unsubscribe: (() => void) | null = null;
      let resolveDone!: (outcome: VoiceOutputOutcome) => void;
      const done = new Promise<VoiceOutputOutcome>((resolve) => {
        resolveDone = resolve;
      });
      const current = () =>
        !settled && ownerCurrent() && activeOperation === handle && ownedOperation === handle;
      const notifyOutcome = (outcome: VoiceOutputOutcome) => {
        if (outcome.status === 'done') notify(options.onDone);
        else if (outcome.status === 'stopped') notify(options.onStopped);
        else notify(() => options.onError?.(outcome.error));
      };
      const retire = (outcome: VoiceOutputOutcome) => {
        if (settled) return false;
        settled = true;
        unsubscribe?.();
        unsubscribe = null;
        if (activeOperation === handle) activeOperation = null;
        if (ownedOperation === handle) ownedOperation = null;
        resolveDone(outcome);
        return true;
      };
      const finish = (outcome: VoiceOutputOutcome) => {
        if (retire(outcome)) notifyOutcome(outcome);
      };
      const handle: VoiceOutputHandle = {
        done,
        stop: () => {
          if (settled) return stopping ?? Promise.resolve();
          const stop = stopTransport;
          stopTransport = null;
          retire({ status: 'stopped' });
          stopping = stop?.() ?? Promise.resolve();
          void stopping.catch((error: unknown) => {
            console.warn('[voiceOutput] speech stop failed', error);
          });
          notifyOutcome({ status: 'stopped' });
          return stopping;
        },
      };
      if (!ownerCurrent() || (options.serverVoice && capturedSource?.scope !== 'cloud')) {
        void Promise.resolve().then(() => finish({ status: 'stopped' }));
        return handle;
      }
      const predecessor = activeOperation;
      activeOperation = handle;
      ownedOperation = handle;
      void predecessor?.stop();
      if (!current()) {
        finish({ status: 'stopped' });
        return handle;
      }
      if (capturedSource?.scope === 'cloud') {
        unsubscribe = subscribeCloudAccountEpochChange(() => {
          if (!ownerCurrent()) void handle.stop();
        });
      }
      const onStart = () => {
        if (!current() || started) return;
        started = true;
        notify(options.onStart);
      };
      void Promise.resolve().then(async () => {
        try {
          if (!current()) return finish({ status: 'stopped' });
          await TTS.preparePlayback();
          if (!current()) return finish({ status: 'stopped' });
          let remaining = text.trim();
          if (!remaining) return finish({ status: 'done' });
          if (options.serverVoice && capturedSource?.scope === 'cloud') {
            const server = startServerSpeech(chunkText(remaining, SERVER_SPEECH_MAX_CHARS), {
              account: capturedSource.account,
              isCurrent: current,
              rate: options.rate ?? TTS.speechOptionsFromSettings().rate,
              onStart,
            });
            stopTransport = server.stop;
            const outcome = await server.done;
            stopTransport = null;
            if (!current()) return finish({ status: 'stopped' });
            if (outcome.status !== 'failed') return finish(outcome);
            console.warn('[voiceOutput] server read aloud failed, using device voice', outcome.error);
            remaining = outcome.remaining.join(' ');
          }
          for (const chunk of chunkText(remaining, MAX_CHUNK_CHARS)) {
            if (!current()) return finish({ status: 'stopped' });
            const device = TTS.start(chunk, { ...options, onStart });
            stopTransport = device.stop;
            const outcome = await device.done;
            stopTransport = null;
            if (!current()) return finish({ status: 'stopped' });
            if (outcome.status !== 'done') return finish(outcome);
          }
          finish({ status: 'done' });
        } catch (error) {
          if (!current()) return finish({ status: 'stopped' });
          finish({
            status: 'failed',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
      return handle;
    },
  };
}

export async function isSpeaking(): Promise<boolean> {
  return activeOperation !== null;
}

export const getAvailableVoices = TTS.getAvailableVoices;
export const getEnglishVoices = TTS.getEnglishVoices;
export const speechOptionsFromSettings = TTS.speechOptionsFromSettings;

function chunkText(text: string, maxChars: number): string[] {
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const slice = remaining.slice(0, maxChars);
    const lastSentence = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('.\n'),
    );
    const splitAt = lastSentence > 0 ? lastSentence + 2 : slice.lastIndexOf(' ');
    const cutAt = splitAt > 0 ? splitAt : maxChars;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
