import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { COMING_SOON_LABEL, SURFACE_STATUS } from '../../../lib/marketing-constants';

/**
 * PP-28 / CRIT-007: while `SURFACE_STATUS.mobile` says the app is unreleased,
 * no mobile-facing marketing or legal page may state or imply that it can be
 * installed today.
 *
 * These assertions are GATED on the registry, not on the words "coming soon".
 * The day mobile actually ships, `SURFACE_STATUS.mobile` moves off
 * `COMING_SOON_LABEL`, this suite stops policing download wording, and the
 * pages are free to advertise the real store listings — which is the outcome
 * we want. What it must never allow is the state the pages were in before:
 * a hero naming "iPhone & Android" with no status at all, and a terms-of-
 * service clause opening "The App is free to download and use." for an app
 * with zero `v-mobile-*` release tags.
 */
const MOBILE_DIR = join(__dirname, '..');

function readMobileFile(relativePath: string) {
  return readFileSync(join(MOBILE_DIR, relativePath), 'utf8');
}

const MOBILE_PAGE = 'page.tsx';
const MOBILE_LEGAL_PAGE = join('legal', 'page.tsx');

describe('mobile availability copy tracks the release-state registry', () => {
  it('states the registry status in the mobile hero rather than typing one', () => {
    const source = readMobileFile(MOBILE_PAGE);

    expect(
      source,
      'the /mobile hero must render SURFACE_STATUS.mobile so it cannot drift from /download and the nav',
    ).toContain('SURFACE_STATUS.mobile');
  });

  it('does not claim the app is installable while the registry says it is not', () => {
    if (SURFACE_STATUS.mobile !== COMING_SOON_LABEL) {
      // Mobile has shipped; download wording is now truthful and unpoliced.
      return;
    }

    const banned = [
      'The App is free to download and use.',
      'free to install and use',
      'Download on the App Store today',
    ];

    for (const file of [MOBILE_PAGE, MOBILE_LEGAL_PAGE]) {
      const source = readMobileFile(file);

      for (const phrase of banned) {
        // An unconditional occurrence is a claim. The same words are allowed
        // inside a branch that only renders once the registry reports a
        // release, so require the guard to be present when the phrase is.
        if (source.includes(phrase)) {
          expect(
            source,
            `${file} states "${phrase}" — it must be guarded by the release-state registry`,
          ).toContain('SURFACE_STATUS.mobile');
        }
      }
    }
  });

  it('gates the mobile legal in-app-purchase clause on the release-state registry', () => {
    const source = readMobileFile(MOBILE_LEGAL_PAGE);

    expect(
      source,
      'mobile legal must import the release-state registry instead of asserting availability',
    ).toContain('SURFACE_STATUS');
    expect(source).toContain('COMING_SOON_LABEL');
    expect(
      source,
      'the in-app-purchase clause must branch on release state, not state one outcome',
    ).toContain('MOBILE_UNRELEASED');
  });
});
