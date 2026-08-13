/**
 * computer-use-default-ask.test.ts
 *
 * Trust-boundary P0 regression guard (THREAT_MODEL §3.14): autonomous CDP
 * browser control must DEFAULT to human-in-the-loop. An UNSET
 * `agi_cu_ask_before_acting` pref must be treated as ask-before-acting
 * (default-deny); allow-all "autopilot" is an explicit opt-out only.
 *
 * These are source-level invariants in the same spirit as the static checks in
 * security-fixes.test.ts (THREAT_MODEL §4) — a future flip back to
 * default-allow-all must fail CI, not ship silently on prompt-injectable pages.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

describe('computer-use default = ask-before-acting (trust-boundary P0)', () => {
  const background = read('src/background.ts');
  const panel = read('src/features/side-panel/computerUsePanel.ts');

  it('background treats an UNSET ask pref as ask-before-acting (default-deny)', () => {
    // The authoritative gate: `!== false` means unset AND true both gate; only an
    // explicit stored `false` (the autopilot opt-out) disables the approval gate.
    expect(background).toMatch(/agi_cu_ask_before_acting'\]\s*!==\s*false/);
  });

  it('background does NOT default to allow-all (the old `=== true` defect)', () => {
    expect(background).not.toMatch(/agi_cu_ask_before_acting'\]\s*===\s*true/);
  });

  it('side-panel ask checkbox defaults to ON (ask)', () => {
    expect(panel).toMatch(/askCheckbox\.checked\s*=\s*true/);
    expect(panel).not.toMatch(/askCheckbox\.checked\s*=\s*false/);
  });
});

describe('computer-use ask gate persists and rehydrates', () => {
  const panel = read('src/features/side-panel/computerUsePanel.ts');

  it('rehydrates the stored gate instead of always rendering the default', () => {
    // Before this, `askCheckbox.checked = true` was the only write in the file:
    // after an autopilot opt-out was persisted, reopening the panel showed
    // "Ask before acting" checked while background.ts ran with no gate.
    expect(panel).toMatch(/storage\?\.local\?\.get\('agi_cu_ask_before_acting'/);
    expect(panel).toMatch(
      /askCheckbox\.checked\s*=\s*items\?\.\['agi_cu_ask_before_acting'\]\s*!==\s*false/,
    );
  });

  it('writes the gate on toggle, not only when Run Autofill escalates', () => {
    expect(panel).toMatch(/askCheckbox\.addEventListener\('change'/);
    expect(panel).toMatch(/set\(\{\s*agi_cu_ask_before_acting:\s*next\s*\}\)/);
  });

  it('rolls the control back when the authoritative storage write fails', () => {
    expect(panel).toContain('askCheckbox.checked = !next');
    expect(panel).toContain('The previous setting is still active.');
  });

  it('rehydration still uses the default-deny rule, never a bare false assignment', () => {
    // Guards the same invariant as the block above: an unset pref must gate.
    expect(panel).not.toMatch(/askCheckbox\.checked\s*=\s*false/);
  });
});

describe('computer-use approval accessibility', () => {
  const panel = read('src/features/side-panel/computerUsePanel.ts');

  it('announces each pending approval and moves focus to its primary decision', () => {
    expect(panel).toContain("card.setAttribute('role', 'alertdialog')");
    expect(panel).toContain("card.setAttribute('aria-labelledby'");
    expect(panel).toContain("card.setAttribute('aria-describedby'");
    expect(panel).toContain('allowBtn.focus()');
  });

  it('does not strand focus when an approval is decided or expires', () => {
    expect(panel).toContain('if (shouldRestoreFocus) stopBtn.focus()');
    expect(panel).toContain("card.setAttribute('role', 'status')");
  });
});
