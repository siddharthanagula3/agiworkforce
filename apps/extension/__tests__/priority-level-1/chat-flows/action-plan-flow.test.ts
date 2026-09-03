import { describe, expect, test } from 'vitest';
import {
  ALLOWED_SHORTCUT_ACTION_TYPES,
  ORIGIN_EXTENSION_PAGE,
  shouldExecuteScheduledTask,
  validateShortcutActions,
} from '../../../src/background/policy';

describe('L1 Chat Flows - Action plan validation', () => {
  test('HAPPY_PATH: a well-formed multi-step plan is accepted', () => {
    const plan = [
      { type: 'navigate', value: 'https://example.com/apply' },
      { type: 'type', selector: '#name', value: 'Test Applicant' },
      { type: 'click', selector: 'button[type="submit"]' },
    ];
    expect(validateShortcutActions(plan as never)).toBe(true);
  });

  test('SECURITY: a plan with an unknown action type is rejected at save', () => {
    const plan = [
      { type: 'click', selector: '#ok' },
      { type: 'exfiltrate_cookies' }, // not on the allowlist
    ];
    expect(validateShortcutActions(plan as never)).toBe(false);
    expect(ALLOWED_SHORTCUT_ACTION_TYPES.has('exfiltrate_cookies')).toBe(false);
  });

  test('HAPPY_PATH: saved plan fires when its origin is still allowlisted', () => {
    const allowlist = new Set(['https://jobs.example.com']);
    expect(
      shouldExecuteScheduledTask({ createdByOrigin: 'https://jobs.example.com' }, allowlist),
    ).toBe(true);
    expect(shouldExecuteScheduledTask({ createdByOrigin: ORIGIN_EXTENSION_PAGE }, allowlist)).toBe(
      true,
    );
  });

  test('SECURITY: saved plan is suppressed once its origin leaves the allowlist', () => {
    const allowlist = new Set(['https://still-allowed.example.com']);
    expect(
      shouldExecuteScheduledTask({ createdByOrigin: 'https://revoked.example.com' }, allowlist),
    ).toBe(false);
  });
});
