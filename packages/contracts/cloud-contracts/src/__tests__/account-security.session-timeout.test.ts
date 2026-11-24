import { describe, expect, it } from 'vitest';
import {
  SESSION_TIMEOUT_MINUTES,
  SESSION_TIMEOUT_OFF,
  formatSessionTimeout,
  isSessionTimeoutMinutes,
  resolveSessionTimeout,
  sessionTimeoutSettingsPatch,
} from '../account-security';

describe('session timeout contract', () => {
  it('lists Never first and every choice as a valid value', () => {
    expect(SESSION_TIMEOUT_MINUTES[0]).toBe(SESSION_TIMEOUT_OFF);
    for (const minutes of SESSION_TIMEOUT_MINUTES) {
      expect(isSessionTimeoutMinutes(minutes)).toBe(true);
    }
  });

  it.each([null, '60', 10, 2000, 30.5, -1, false])('rejects %j', (value) => {
    expect(isSessionTimeoutMinutes(value)).toBe(false);
  });

  it.each([
    [0, 'Never'],
    [15, '15 minutes'],
    [60, '1 hour'],
    [120, '2 hours'],
    [90, '1 hour 30 minutes'],
    [45, '45 minutes'],
    [1440, '24 hours'],
  ])('shows %i as %s', (minutes, label) => {
    expect(formatSessionTimeout(minutes)).toBe(label);
  });

  it('never writes 0 to session_timeout so bundles that read it as minutes keep their limit', () => {
    for (const minutes of SESSION_TIMEOUT_MINUTES) {
      expect(sessionTimeoutSettingsPatch(minutes).session_timeout).not.toBe(0);
    }
    expect(sessionTimeoutSettingsPatch(SESSION_TIMEOUT_OFF)).toEqual({ session_timeout_off: true });
    expect(sessionTimeoutSettingsPatch(30)).toEqual({
      session_timeout: 30,
      session_timeout_off: false,
    });
  });

  it('resolves the flag over the stored limit, and unset or invalid as Never', () => {
    expect(resolveSessionTimeout({ session_timeout: 60, session_timeout_off: true })).toBe(0);
    expect(resolveSessionTimeout({ session_timeout: 60, session_timeout_off: false })).toBe(60);
    expect(resolveSessionTimeout({ session_timeout: 60 })).toBe(60);
    expect(resolveSessionTimeout({})).toBe(0);
    expect(resolveSessionTimeout({ session_timeout: 0 })).toBe(0);
    expect(resolveSessionTimeout({ session_timeout: 7 })).toBe(0);
  });
});
