/**
 * open-side-panel-gesture.test.ts
 *
 * Regression for EXT-OPENSIDEPANEL-GESTURE-LOST: the in-page panel's
 * "Open side panel" button sends OPEN_SIDE_PANEL, but the background handled it
 * inside handleMessageAsync's .then() continuation — one microtask past the
 * synchronous onMessage user-gesture window chrome.sidePanel.open() requires — so
 * the activation was lost and nothing opened. The fix calls sidePanel.open()
 * SYNCHRONOUSLY in the onMessage listener (handleMessage), after the security
 * gates and before the async dispatch. Asserted at the source level (background.ts
 * is not unit-importable), including ordering so the fast-path stays gated.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const background = readFileSync(resolve(here, '..', 'src/background.ts'), 'utf8');

describe('OPEN_SIDE_PANEL opens synchronously to preserve the user gesture', () => {
  it('has a synchronous sidePanel.open fast-path in the onMessage listener', () => {
    expect(background).toMatch(
      /msg\.type === 'OPEN_SIDE_PANEL'.*sender\.tab\?\.id.*chrome\.sidePanel/s,
    );
    expect(background).toMatch(/chrome\.sidePanel\.open\(\{ tabId: sender\.tab\.id \}\)/);
  });

  it('runs the fast-path after the allowlist gate and before the async dispatch', () => {
    const gateIdx = background.indexOf('isAllowlistedSender(sender, msg.type)');
    const syncIdx = background.indexOf("msg.type === 'OPEN_SIDE_PANEL' && sender.tab?.id");
    const asyncIdx = background.indexOf('handleMessageAsync(msg, sender)');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(syncIdx).toBeGreaterThan(gateIdx); // authorized before opening
    expect(asyncIdx).toBeGreaterThan(syncIdx); // synchronous, before the deferral
  });
});
