/**
 * Voice-related utility functions.
 */

/** Format a duration in milliseconds to a human-readable string (e.g., "1:23") */
export function formatVoiceDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Convert decibel metering value to a normalized 0-1 amplitude */
export function meteringToAmplitude(db: number): number {
  // Typical range: -160 dB (silence) to 0 dB (max)
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}
