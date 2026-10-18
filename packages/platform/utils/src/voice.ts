/**
 * Shared voice utilities for the AGI Workforce platform.
 *
 * Platform-agnostic helper functions for voice input that can be used
 * across desktop, mobile, and extension surfaces.
 *
 * @module voice
 * @packageDocumentation
 */

export const VOICE_COMMAND_PREFIXES = [
  'make this more formal',
  'make this more casual',
  'make this shorter',
  'make this longer',
  'make it more formal',
  'make it more casual',
  'make it shorter',
  'make it longer',
  'fix the grammar',
  'fix the spelling',
  'fix the punctuation',
  'translate to',
  'summarize this',
  'summarize the',
  'rewrite this',
  'rewrite the',
  'edit this',
  'edit the',
  'change the tone',
  'change the style',
  'make this',
  'make it',
  'fix this',
  'fix the',
  'more formal',
  'more casual',
  'shorter',
  'longer',
] as const;

const FILLER_WORD_PATTERN =
  /\b(you know|sort of|kind of|basically|literally|actually|um+|uh+|er+|like)\b,?\s*/gi;

export function detectVoiceCommand(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return VOICE_COMMAND_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function cleanupVoiceDictation(text: string): string {
  return text.replace(FILLER_WORD_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

export function meteringToAmplitude(db: number): number {
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}
