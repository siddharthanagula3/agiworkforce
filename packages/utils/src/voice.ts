/**
 * Shared voice utilities for the AGI Workforce platform.
 *
 * Platform-agnostic helper functions for voice input that can be used
 * across desktop, mobile, and extension surfaces.
 *
 * @module voice
 * @packageDocumentation
 */

/**
 * Format a transcription duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 *
 * @example
 * ```typescript
 * formatTranscriptionDuration(500);   // "0.5s"
 * formatTranscriptionDuration(2300);  // "2.3s"
 * formatTranscriptionDuration(65000); // "1m 5s"
 * formatTranscriptionDuration(0);     // "0s"
 * ```
 */
export function formatTranscriptionDuration(ms: number): string {
  if (ms <= 0) return '0s';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  // For short durations, show one decimal place
  if (ms < 10000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return `${totalSeconds}s`;
}

/**
 * Check whether the current environment supports any voice input API.
 *
 * Returns `true` if at least one of the following is available:
 * - Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 * - MediaRecorder (for recording audio blobs to send to a backend)
 *
 * Note: This only checks browser/web APIs. Desktop (Tauri) and mobile (expo-av)
 * have their own platform-specific availability checks.
 *
 * @returns Whether voice input is supported in the current browser environment
 */
export function isVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false;

  const w = window as typeof globalThis & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };

  const hasSpeechRecognition =
    typeof w.SpeechRecognition !== 'undefined' || typeof w.webkitSpeechRecognition !== 'undefined';

  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';

  return hasSpeechRecognition || hasMediaRecorder;
}

/**
 * Normalize a raw transcription string.
 *
 * Applies minimal, safe transformations that are appropriate across all providers:
 * - Trims leading/trailing whitespace
 * - Capitalizes the first character
 * - Ensures the text ends with a sentence-ending punctuation mark
 * - Collapses multiple spaces into one
 *
 * This does NOT remove filler words or apply AI cleanup — those are
 * platform-specific post-processing steps handled in each surface.
 *
 * @param text - Raw transcription text
 * @returns Normalized transcription text
 *
 * @example
 * ```typescript
 * normalizeTranscription("  hello world  ");    // "Hello world."
 * normalizeTranscription("what time is it?");   // "What time is it?"
 * normalizeTranscription("sounds good!");       // "Sounds good!"
 * normalizeTranscription("");                   // ""
 * ```
 */
export function normalizeTranscription(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';

  // Capitalize the first character
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  // Ensure the text ends with sentence-ending punctuation
  const lastChar = capitalized.charAt(capitalized.length - 1);
  if (/[.!?]/.test(lastChar)) {
    return capitalized;
  }

  return `${capitalized}.`;
}
