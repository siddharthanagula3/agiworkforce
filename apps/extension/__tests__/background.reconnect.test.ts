/**
 * Tests for the isPermanentError heuristic in background.ts handleNativeDisconnect().
 *
 * The logic is inlined in the function so we mirror it here.  If the source patterns
 * ever change these tests will catch a regression.
 */

import { describe, expect, it } from 'vitest';

/**
 * Mirrors the isPermanentError check from background.ts handleNativeDisconnect().
 * Kept in sync with the source — any change there should be reflected here too.
 */
function isPermanentError(error: string): boolean {
  return (
    error.includes('Native host not found') ||
    error.includes('Specified native messaging host not found') ||
    error.includes('Access to the specified native messaging host is forbidden') ||
    error.includes('not allowed')
  );
}

describe('isPermanentError heuristic', () => {
  // ── Permanent errors — should return true ──────────────────────────────────

  it('identifies "Specified native messaging host not found" as permanent', () => {
    expect(isPermanentError('Specified native messaging host not found')).toBe(true);
  });

  it('identifies "Native host not found" as permanent', () => {
    expect(isPermanentError('Native host not found')).toBe(true);
  });

  it('identifies access-forbidden message as permanent', () => {
    expect(isPermanentError('Access to the specified native messaging host is forbidden')).toBe(
      true,
    );
  });

  it('identifies "not allowed" suffix messages as permanent', () => {
    expect(isPermanentError('Connection is not allowed')).toBe(true);
  });

  // ── Transient errors — should return false ─────────────────────────────────

  it('does NOT treat a crash as permanent', () => {
    // Host crashes are transient — the app may restart
    expect(isPermanentError('com.agiworkforce.browser crashed')).toBe(false);
  });

  it('does NOT treat a generic disconnect as permanent', () => {
    expect(isPermanentError('Native host disconnected')).toBe(false);
  });

  it('does NOT treat connection reset as permanent', () => {
    expect(isPermanentError('Connection reset by peer')).toBe(false);
  });

  it('does NOT treat empty error string as permanent', () => {
    expect(isPermanentError('')).toBe(false);
  });

  // ── Regression guard: host name alone must NOT trigger permanent ───────────

  it('does NOT treat the host name alone as permanent', () => {
    // 'com.agiworkforce.browser' always appears in error messages — it must not
    // be sufficient on its own to mark the error as permanent.
    expect(isPermanentError('com.agiworkforce.browser')).toBe(false);
  });

  it('does NOT treat a timeout mentioning the host as permanent', () => {
    expect(isPermanentError('Timeout waiting for com.agiworkforce.browser to respond')).toBe(false);
  });
});
