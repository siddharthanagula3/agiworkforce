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
  '2026-09-27': { maturity: 'ga', surfaces: ['web'] },
  '2026-09-20': { maturity: 'ga', surfaces: ['web'] },
  '2026-09-15': { maturity: 'beta', surfaces: ['desktop'] },
  '2026-09-05': { maturity: 'ga', surfaces: ['web'] },
  '2026-07-31': { maturity: 'ga', surfaces: ['cli', 'desktop', 'web'] },
  '2026-07-03': { maturity: 'beta', surfaces: ['cli'] },
  '2026-06-24': {
    maturity: 'ga',
    surfaces: ['web', 'cli'],
  },
  '2026-05-08': { maturity: 'ga', surfaces: ['web'] },
  '2026-05-04': { maturity: 'beta', surfaces: ['cli'] },
  '2026-05-03': { maturity: 'beta', surfaces: ['cli'] },
  '2026-02 to 2026-05': { maturity: 'alpha', surfaces: ['desktop'] },
});

export const RELEASE_NOTES: readonly ReleaseNote[] = RELEASES.map((release) => {
  const state = RELEASE_STATE[release.date];
  if (!state) throw new Error(`No release state recorded for ${release.date}`);
  return { ...release, maturity: state.maturity, surfaces: state.surfaces };
});

export const RELEASE_STATE_DATES: readonly string[] = Object.keys(RELEASE_STATE);

export const FORTHCOMING: readonly { item: string; detail: string; target: string }[] = [
  { item: 'Mobile', detail: 'App Store + Play Store listings.', target: LAUNCH.shortLabel },
  {
    item: 'Chrome extension',
    detail: 'CWS submission once visual review clears.',
    target: LAUNCH.shortLabel,
  },
  {
    item: 'VS Code extension',
    detail: 'Marketplace listing planned for its release.',
    target: LAUNCH.shortLabel,
  },
];

export function isReleasedSurface(surface: DocPlatform): boolean {
  return RELEASED_DOC_PLATFORMS.includes(surface);
}

function surfaceLabels(surfaces: readonly DocPlatform[]): string {
  return surfaces.map((surface) => DOC_PLATFORM_LABELS[surface]).join(', ');
}

export function releaseStateLine(note: ReleaseNote): string {
  const released = note.surfaces.filter(isReleasedSurface);
  const unreleased = note.surfaces.filter((surface) => !isReleasedSurface(surface));
  return [
    released.length > 0 ? `${DOC_MATURITY_LABELS[note.maturity]} · ${surfaceLabels(released)}` : '',
    unreleased.length > 0 ? `Not yet released: ${surfaceLabels(unreleased)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function isGenerallyAvailable(note: ReleaseNote): boolean {
  return note.maturity === 'ga' && note.surfaces.some(isReleasedSurface);
}
