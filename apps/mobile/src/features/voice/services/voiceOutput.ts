import * as TTS from './tts';
import { SERVER_SPEECH_MAX_CHARS, speakWithServer, stopServerSpeech } from './serverSpeech';
export type { TTSOptions, VoiceInfo } from './tts';

const MAX_CHUNK_CHARS = 500;

export interface VoiceOutputOptions extends TTS.TTSOptions {
  serverVoice?: boolean;
}

export async function speak(text: string, options?: VoiceOutputOptions): Promise<void> {
  const trimmed = text.trim();
  if (!options?.serverVoice) return speakOnDevice(trimmed, options);

  const outcome = await speakWithServer(chunkText(trimmed, SERVER_SPEECH_MAX_CHARS), {
    rate: options.rate ?? TTS.speechOptionsFromSettings().rate,
    onStart: options.onStart,
  });
  if (outcome.status === 'done') {
    options.onDone?.();
    return;
  }
  if (outcome.status === 'stopped') {
    options.onStopped?.();
    return;
  }
  console.warn('[voiceOutput] server read aloud failed, using device voice', outcome.error);
  return speakOnDevice(outcome.remaining.join(' '), options);
}

async function speakOnDevice(text: string, options?: TTS.TTSOptions): Promise<void> {
  const chunks = chunkText(text, MAX_CHUNK_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await TTS.speak(chunks[i], {
      ...options,
      onDone: isLast ? options?.onDone : undefined,
      onStopped: isLast ? options?.onStopped : undefined,
    });
  }
}

export async function stop(): Promise<void> {
  stopServerSpeech();
  await TTS.stop();
}

export const isSpeaking = TTS.isSpeaking;

export const getAvailableVoices = TTS.getAvailableVoices;

export const getEnglishVoices = TTS.getEnglishVoices;

export const speechOptionsFromSettings = TTS.speechOptionsFromSettings;

function chunkText(text: string, maxChars: number): string[] {
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
