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
