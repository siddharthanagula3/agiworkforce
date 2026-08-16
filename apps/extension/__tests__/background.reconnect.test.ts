
import { describe, expect, it } from 'vitest';

function isPermanentError(error: string): boolean {
  return (
    error.includes('Native host not found') ||
    error.includes('Specified native messaging host not found') ||
    error.includes('Access to the specified native messaging host is forbidden') ||
    error.includes('not allowed')
  );
}

describe('isPermanentError heuristic', () => {

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

  it('does NOT treat a crash as permanent', () => {
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

  it('does NOT treat the host name alone as permanent', () => {
    expect(isPermanentError('com.agiworkforce.browser')).toBe(false);
  });

  it('does NOT treat a timeout mentioning the host as permanent', () => {
    expect(isPermanentError('Timeout waiting for com.agiworkforce.browser to respond')).toBe(false);
  });
});
