import { LAUNCH } from '@/lib/marketing-constants';
import { RELEASES, type Release } from '@/lib/changelog-entries';
import {
  DOC_MATURITY_LABELS,
  DOC_PLATFORM_LABELS,
  RELEASED_DOC_PLATFORMS,
  type DocMaturity,
  type DocPlatform,
} from '@/lib/support/doc-metadata';

export interface ReleaseNote extends Release {
  maturity: DocMaturity;
  surfaces: readonly DocPlatform[];
}

interface ReleaseState {
  maturity: DocMaturity;
  surfaces: readonly DocPlatform[];
}

/**
 * Maturity is authored per release rather than derived: a surface being
 * published does not make every capability in that release generally available.
 */
const RELEASE_STATE: Readonly<Record<string, ReleaseState>> = Object.freeze({
  '2026-09-15': { maturity: 'beta', surfaces: ['desktop'] },
  '2026-09-05': { maturity: 'ga', surfaces: ['web'] },
  '2026-07-31': { maturity: 'ga', surfaces: ['cli', 'desktop', 'web'] },
  '2026-07-03': { maturity: 'beta', surfaces: ['desktop'] },
  '2026-06-24': {
    maturity: 'ga',
    surfaces: ['web', 'desktop', 'cli', 'mobile', 'vscode', 'chrome'],
  },
  '2026-05-08': { maturity: 'ga', surfaces: ['web'] },
  '2026-05-04': { maturity: 'ga', surfaces: ['cli'] },
  '2026-05-03': { maturity: 'beta', surfaces: ['cli'] },
  '2026-02 to 2026-05': { maturity: 'alpha', surfaces: ['desktop'] },
});

export const RELEASE_NOTES: readonly ReleaseNote[] = RELEASES.map((release) => {
  const state = RELEASE_STATE[release.date];
  if (!state) throw new Error(`No release state recorded for ${release.date}`);
  return { ...release, maturity: state.maturity, surfaces: state.surfaces };
});

export const RELEASE_STATE_DATES: readonly string[] = Object.keys(RELEASE_STATE);

export const FORTHCOMING: readonly { item: string; detail: string; quarter: string }[] = [
  { item: 'Mobile', detail: 'App Store + Play Store listings.', quarter: LAUNCH.shortLabel },
  {
    item: 'Chrome extension',
    detail: 'CWS submission once visual review clears.',
    quarter: LAUNCH.shortLabel,
  },
  {
    item: 'VS Code extension',
    detail: 'Marketplace listing planned for public launch.',
    quarter: LAUNCH.shortLabel,
  },
];

export function releaseStateLine(note: ReleaseNote): string {
  const surfaces = note.surfaces.map((surface) => DOC_PLATFORM_LABELS[surface]).join(', ');
  return `${DOC_MATURITY_LABELS[note.maturity]} · ${surfaces}`;
}

export function isReleasedSurface(surface: DocPlatform): boolean {
  return RELEASED_DOC_PLATFORMS.includes(surface);
}
