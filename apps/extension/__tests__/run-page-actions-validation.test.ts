/**
 * Defense-in-depth validation of RUN_PAGE_ACTIONS at content-script
 * entry-point (C-03 audit 2026-05-19; self-review #5 audit 2026-05-19).
 *
 * SAVE_SHORTCUT already rejects plans containing unknown action types at
 * save time. But shortcuts stored before that fix can still arrive at the
 * executor — `handleRunPageActions` re-validates with
 * validateShortcutActions and rejects the entire plan on any bad entry.
 *
 * Same applies to desktop-bridge-supplied plans forwarded via
 * `syncTabContextWithDesktop` (L-09 audit 2026-05-19).
 */

import { describe, expect, it } from 'vitest';
import { validateShortcutActions } from '../src/background/policy';

describe('handleRunPageActions / desktop-bridge plan validation', () => {
  it('accepts a plan of valid action types', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'navigate', value: 'https://example.com' },
        { id: '2', type: 'click', selector: '#submit' },
        { id: '3', type: 'wait_for_selector', selector: '#confirmed' },
      ] as never),
    ).toBe(true);
  });

  it('rejects a plan whose first action is unknown', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'evil_action' },
        { id: '2', type: 'click' },
      ] as never),
    ).toBe(false);
  });

  it('rejects a plan whose LAST action is unknown', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'click' },
        { id: '2', type: 'type', value: 'hi' },
        { id: '3', type: 'inject_xss' },
      ] as never),
    ).toBe(false);
  });

  it('rejects a plan with one valid + one bad action — fail-closed semantics', () => {
    // The PRE-fix behavior was to skip unknown actions and run the valid
    // ones; that was the partial-execute risk. Now: the whole plan
    // is rejected.
    expect(
      validateShortcutActions([
        { id: 'safe', type: 'get_page_info' },
        { id: 'bad', type: 'unknown' },
      ] as never),
    ).toBe(false);
  });

  it('accepts a desktop-bridge plan that uses browser-tool passthroughs', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'screenshot' },
        { id: '2', type: 'wait', delay: 500 },
        { id: '3', type: 'click' },
      ] as never),
    ).toBe(true);
  });

  it('rejects an empty-string action type', () => {
    expect(validateShortcutActions([{ id: '1', type: '' }] as never)).toBe(false);
  });
});
