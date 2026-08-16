import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { COMING_SOON_LABEL, SURFACE_STATUS } from '../../../lib/marketing-constants';

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
