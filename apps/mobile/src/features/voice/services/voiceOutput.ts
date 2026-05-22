/**
 * On-device voice output service (TTS).
 *
 * Thin wrapper over services/tts.ts that adds voice companion helpers:
 * - auto-chunking for long responses (prevents iOS TTS timeout on long text)
 * - sentence-boundary segmentation for natural pauses
 *
 * Uses AVSpeechSynthesizer on iOS and Android TextToSpeech — both on-device.
 * Cloud TTS is NOT wired here.
 */

import * as TTS from './tts';
export type { TTSOptions, VoiceInfo } from './tts';

/** Maximum characters per TTS chunk to avoid platform speech engine cuts. */
const MAX_CHUNK_CHARS = 500;

/**
 * Speak `text` using the on-device TTS engine.
 * Long text is auto-chunked at sentence boundaries.
 */
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

/** Stop any in-progress TTS. */
export const stop = TTS.stop;

/** Returns true if TTS is currently speaking. */
export const isSpeaking = TTS.isSpeaking;

/** List available on-device voices. */
export const getAvailableVoices = TTS.getAvailableVoices;

/** List available English voices, quality-sorted. */
export const getEnglishVoices = TTS.getEnglishVoices;

/**
 * Split text at sentence boundaries, keeping chunks under MAX_CHUNK_CHARS.
 * Falls back to hard split at word boundary when no sentence boundary found.
 */
function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_CHUNK_CHARS) {
    const slice = remaining.slice(0, MAX_CHUNK_CHARS);
    // Find last sentence-ending punctuation
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
