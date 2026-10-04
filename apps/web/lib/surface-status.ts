export const COMING_SOON_LABEL = 'Coming soon';
export const AVAILABLE_NOW_LABEL = 'Available now';

export const SURFACE_STATUS = {
  web: AVAILABLE_NOW_LABEL,
  desktop: COMING_SOON_LABEL,
  cli: COMING_SOON_LABEL,
  mobile: COMING_SOON_LABEL,
  vscode: COMING_SOON_LABEL,
  chrome: COMING_SOON_LABEL,
} as const;

export type SurfaceId = keyof typeof SURFACE_STATUS;
export type SurfaceStatusLabel = typeof AVAILABLE_NOW_LABEL | typeof COMING_SOON_LABEL;
export type SurfaceStatusMap = Readonly<Record<SurfaceId, SurfaceStatusLabel>>;
export type InstallableSurfaceId = Exclude<SurfaceId, 'web'>;

export interface SurfaceCta {
  readonly label: string;
  readonly href: string;
}

export const SURFACE_IDS: readonly SurfaceId[] = Object.freeze(
  Object.keys(SURFACE_STATUS) as SurfaceId[],
);

export const SURFACE_NAMES = {
  web: 'Web',
  desktop: 'Desktop',
  cli: 'CLI',
  mobile: 'Mobile',
  vscode: 'VS Code',
  chrome: 'Chrome',
} as const satisfies Record<SurfaceId, string>;

const DESKTOP_OPERATING_SYSTEMS = ['macOS', 'Windows', 'Linux'] as const;

export const SURFACE_PLATFORMS = {
  web: ['Web'],
  desktop: DESKTOP_OPERATING_SYSTEMS,
  cli: DESKTOP_OPERATING_SYSTEMS,
  mobile: ['iOS', 'Android'],
  vscode: DESKTOP_OPERATING_SYSTEMS,
  chrome: DESKTOP_OPERATING_SYSTEMS,
} as const satisfies Record<SurfaceId, readonly string[]>;

export const NOTIFY_CTA = {
  label: 'Get notified',
  href: '/download',
} as const;

const SURFACE_ACTIONS = {
  desktop: {
    href: '/download#desktop-downloads',
    releasedLabel: 'Get AGI Desktop',
    onNotifyList: false,
  },
  cli: { href: '/download#cli-downloads', releasedLabel: 'Get the CLI', onNotifyList: false },
  mobile: { href: '/mobile', releasedLabel: 'Get AGI Mobile', onNotifyList: true },
  vscode: { href: '/vscode-extension', releasedLabel: 'Get AGI in VS Code', onNotifyList: true },
  chrome: { href: '/chrome-extension', releasedLabel: 'Get AGI in Chrome', onNotifyList: true },
} as const satisfies Record<
  InstallableSurfaceId,
  { href: string; releasedLabel: string; onNotifyList: boolean }
>;

export function isReleased(
  surface: SurfaceId,
  statuses: SurfaceStatusMap = SURFACE_STATUS,
): boolean {
  return statuses[surface] === AVAILABLE_NOW_LABEL;
}

export function releasedSurfaces(statuses: SurfaceStatusMap = SURFACE_STATUS): SurfaceId[] {
  return SURFACE_IDS.filter((surface) => isReleased(surface, statuses));
}

export function unreleasedSurfaces(statuses: SurfaceStatusMap = SURFACE_STATUS): SurfaceId[] {
  return SURFACE_IDS.filter((surface) => !isReleased(surface, statuses));
}

export const RELEASED_SURFACES: readonly SurfaceId[] = Object.freeze(releasedSurfaces());
export const UNRELEASED_SURFACES: readonly SurfaceId[] = Object.freeze(unreleasedSurfaces());

export function releasedPlatforms(statuses: SurfaceStatusMap = SURFACE_STATUS): string[] {
  return [...new Set(releasedSurfaces(statuses).flatMap((surface) => SURFACE_PLATFORMS[surface]))];
}

export function joinSurfaceNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function statusSentence(surfaces: readonly SurfaceId[], status: SurfaceStatusLabel): string {
  if (surfaces.length === 0) return '';
  const names = joinSurfaceNames(surfaces.map((surface) => SURFACE_NAMES[surface]));
  return `${names} ${surfaces.length > 1 ? 'are' : 'is'} ${status.toLowerCase()}.`;
}

export function surfaceAvailabilitySummary(statuses: SurfaceStatusMap = SURFACE_STATUS): string {
  return [
    statusSentence(releasedSurfaces(statuses), AVAILABLE_NOW_LABEL),
    statusSentence(unreleasedSurfaces(statuses), COMING_SOON_LABEL),
  ]
    .filter(Boolean)
    .join(' ');
}

export function cliAvailabilityNote(statuses: SurfaceStatusMap = SURFACE_STATUS): string {
  return isReleased('cli', statuses) ? '' : `The ${statusSentence(['cli'], COMING_SOON_LABEL)}`;
}

export const CLI_AVAILABILITY_NOTE = cliAvailabilityNote();

export function surfaceCta(
  surface: InstallableSurfaceId,
  statuses: SurfaceStatusMap = SURFACE_STATUS,
): SurfaceCta {
  const action = SURFACE_ACTIONS[surface];
  if (isReleased(surface, statuses)) return { label: action.releasedLabel, href: action.href };
  if (action.onNotifyList) return NOTIFY_CTA;
  return { label: `Check ${SURFACE_NAMES[surface]} availability`, href: action.href };
}
