import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The desktop app must not advertise itself.
 *
 * Observed on 2026-09-08 in the built Electron binary: the header read
 * "AGI Workforce · Web Chat" with a "Download Desktop App" link, to a user who
 * had already downloaded and opened the desktop app. The banner was gated on
 * `!isTauri`, and Electron is not Tauri.
 *
 * This is the same root cause as the Tasks readiness state, where `isTauri`
 * also stood in for "is the desktop app". Read from source rather than by
 * rendering because the condition is a build-host fact, not something a test
 * renderer can vary: `isTauri` and `isElectronHost` are module constants
 * resolved once from the real runtime.
 */
const APP_SOURCE = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
const DOWNLOAD_LINK = 'Download Desktop App';

describe('the download banner', () => {
  it('is still the only place that offers the download', () => {
    // If this fails the guard below is looking at the wrong block.
    expect(APP_SOURCE.split(DOWNLOAD_LINK).length - 1).toBe(1);
  });

  it('is hidden from both desktop hosts, not just Tauri', () => {
    const before = APP_SOURCE.slice(0, APP_SOURCE.indexOf(DOWNLOAD_LINK));
    const guard = before.slice(before.lastIndexOf('{!isTauri'));

    expect(
      guard,
      'The banner asks a browser visitor to download the desktop app. Electron is ' +
        'not Tauri, so a guard of `!isTauri` alone shows it inside the shipped ' +
        'desktop build. Exclude both hosts.',
    ).toContain('!isElectronHost');
  });
});
