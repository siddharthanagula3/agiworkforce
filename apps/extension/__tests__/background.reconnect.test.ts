/**
 * The classifier under test is the one the worker ships: a local copy passed
 * here for months while `handleNativeDisconnect` used a different string set.
 */
import { describe, expect, it } from 'vitest';

import { isPermanentNativeDisconnect } from '../src/features/native-bridge/reconnect';

describe('isPermanentNativeDisconnect heuristic', () => {
  it('identifies "Specified native messaging host not found" as permanent', () => {
    expect(isPermanentNativeDisconnect('Specified native messaging host not found')).toBe(true);
  });

  it('identifies "Native host not found" as permanent', () => {
    expect(isPermanentNativeDisconnect('Native host not found')).toBe(true);
  });

  it('identifies access-forbidden message as permanent', () => {
    expect(
      isPermanentNativeDisconnect('Access to the specified native messaging host is forbidden'),
    ).toBe(true);
  });

  it('identifies "not allowed" suffix messages as permanent', () => {
    expect(isPermanentNativeDisconnect('Connection is not allowed')).toBe(true);
  });

  it('does NOT treat a crash as permanent', () => {
    expect(isPermanentNativeDisconnect('com.agiworkforce.browser crashed')).toBe(false);
  });

  it('does NOT treat a generic disconnect as permanent', () => {
    expect(isPermanentNativeDisconnect('Native host disconnected')).toBe(false);
  });

  it('does NOT treat connection reset as permanent', () => {
    expect(isPermanentNativeDisconnect('Connection reset by peer')).toBe(false);
  });

  it('does NOT treat empty error string as permanent', () => {
    expect(isPermanentNativeDisconnect('')).toBe(false);
  });

  it('does NOT treat the host name alone as permanent', () => {
    expect(isPermanentNativeDisconnect('com.agiworkforce.browser')).toBe(false);
  });

  it('does NOT treat a timeout mentioning the host as permanent', () => {
    expect(
      isPermanentNativeDisconnect('Timeout waiting for com.agiworkforce.browser to respond'),
    ).toBe(false);
  });
});
