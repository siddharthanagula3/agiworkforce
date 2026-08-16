
import * as TTS from './tts';
export type { TTSOptions, VoiceInfo } from './tts';

const MAX_CHUNK_CHARS = 500;

export async function speak(text: string, options?: TTS.TTSOptions): Promise<void> {
  const chunks = chunkText(text.trim());
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await TTS.speak(chunks[i], {
      ...options,
      onDone: isLast ? options?.onDone : undefined,
      onStopped: isLast ? options?.onStopped : undefined,
    });
  }
}

export const stop = TTS.stop;

export const isSpeaking = TTS.isSpeaking;

export const getAvailableVoices = TTS.getAvailableVoices;

export const getEnglishVoices = TTS.getEnglishVoices;

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_CHUNK_CHARS) {
    const slice = remaining.slice(0, MAX_CHUNK_CHARS);
    const lastSentence = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('.\n'),
    );
    const splitAt = lastSentence > 0 ? lastSentence + 2 : slice.lastIndexOf(' ');
    const cutAt = splitAt > 0 ? splitAt : MAX_CHUNK_CHARS;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
