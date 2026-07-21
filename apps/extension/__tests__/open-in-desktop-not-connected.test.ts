/**
 * open-in-desktop-not-connected.test.ts
 *
 * Regression: OPEN_IN_DESKTOP fired sendNativeMessage fire-and-forget and always
 * returned success:true, so with the desktop app not running the hand-off
 * silently vanished and the panel showed success. It now checks
 * state.isNativeConnected and returns an actionable not-connected error first.
 * Source-level (background.ts is not unit-importable).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const background = readFileSync(resolve(here, '..', 'src/background.ts'), 'utf8');

describe('OPEN_IN_DESKTOP reports the not-connected case honestly', () => {
  it('guards on state.isNativeConnected before claiming success', () => {
    const caseIdx = background.indexOf("case 'OPEN_IN_DESKTOP':");
    expect(caseIdx).toBeGreaterThan(-1);
    const block = background.slice(caseIdx, caseIdx + 700);
    expect(block).toMatch(/if \(!state\.isNativeConnected\)/);
    expect(block).toMatch(/success: false/);
    expect(block).toMatch(/not connected/i);
    // the guard precedes the fire-and-forget send + success return
    expect(block.indexOf('!state.isNativeConnected')).toBeLessThan(
      block.indexOf('sendNativeMessage'),
    );
  });
});
