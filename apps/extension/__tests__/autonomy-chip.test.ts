/**
 * autonomy-chip.test.ts — EXT-11.
 *
 * The panel had no visible autonomy control. The ask-before-acting gate existed
 * only as a checkbox inside the Computer Use tab, so from the composer there was
 * no way to see — let alone change — whether the agent would act in the browser
 * without asking.
 *
 * The chip reports `agi_cu_ask_before_acting`, which background.ts treats as
 * authoritative. It must never become a second source of truth.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

const panel = read('src/side_panel.ts');
const background = read('src/background.ts');

describe('autonomy chip', () => {
  it('exists in the composer bar', () => {
    expect(panel).toContain("id: 'sp-autonomy-chip'");
    expect(panel).toContain('composerBar.appendChild(autonomyChip)');
  });

  it('reads the same pref the authoritative gate reads', () => {
    // Two views of one value. A separate key would let the chip disagree with
    // the gate that actually decides whether an action runs.
    expect(panel).toContain("chrome.storage.local.get('agi_cu_ask_before_acting'");
    expect(background).toContain('agi_cu_ask_before_acting');
  });

  it('defaults to the safe state, matching background.ts', () => {
    // background.ts treats anything but an explicit `false` as ask-first, so an
    // unset pref must render as "Ask first" rather than "Full access".
    expect(panel).toContain('renderAutonomyChip(true)');
    expect(panel).toMatch(/agi_cu_ask_before_acting'\]\s*!==\s*false/);
    expect(background).toMatch(/agi_cu_ask_before_acting'\]\s*!==\s*false/);
  });

  it('labels both states and tints the permissive one as a warning', () => {
    expect(panel).toContain("'Ask first'");
    expect(panel).toContain("'Full access'");
    // The risky mode carries the warning colour, not the safe one.
    expect(panel).toContain(".sp-autonomy-chip[data-mode='full']");
    expect(panel).toContain('--agi-ext-warning-bg');
  });

  it('stays in sync with the Computer Use checkbox', () => {
    // Both write the same key; without this listener the chip would show a
    // stale mode after the checkbox changed it.
    expect(panel).toContain("changes['agi_cu_ask_before_acting']");
  });

  it('exposes the mode to assistive tech', () => {
    expect(panel).toContain("autonomyChip.setAttribute('aria-pressed'");
    expect(panel).toContain('Permission mode: ask before acting');
  });
});
