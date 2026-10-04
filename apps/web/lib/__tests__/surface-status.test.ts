import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CONSENT_PURPOSES } from '@/lib/consent-purposes';
import { BYOK_SURFACES, POSITIONING } from '@/lib/marketing-constants';
import { interpolateFacts } from '@/lib/support/agent/corpus';
import { DOC_PLATFORM_LABELS } from '@/lib/support/doc-metadata';
import {
  AVAILABLE_NOW_LABEL,
  CLI_AVAILABILITY_NOTE,
  COMING_SOON_LABEL,
  NOTIFY_CTA,
  RELEASED_SURFACES,
  SURFACE_IDS,
  SURFACE_NAMES,
  SURFACE_PLATFORMS,
  SURFACE_STATUS,
  UNRELEASED_SURFACES,
  cliAvailabilityNote,
  isReleased,
  releasedPlatforms,
  releasedSurfaces,
  surfaceAvailabilitySummary,
  surfaceCta,
  unreleasedSurfaces,
  type InstallableSurfaceId,
  type SurfaceStatusMap,
} from '@/lib/surface-status';

const WEB_ROOT = join(__dirname, '..', '..');

const ONLY_WEB_RELEASED: SurfaceStatusMap = {
  web: AVAILABLE_NOW_LABEL,
  desktop: COMING_SOON_LABEL,
  cli: COMING_SOON_LABEL,
  mobile: COMING_SOON_LABEL,
  vscode: COMING_SOON_LABEL,
  chrome: COMING_SOON_LABEL,
};
const CLI_RELEASED: SurfaceStatusMap = { ...ONLY_WEB_RELEASED, cli: AVAILABLE_NOW_LABEL };
const ALL_RELEASED = Object.fromEntries(
  SURFACE_IDS.map((surface) => [surface, AVAILABLE_NOW_LABEL]),
) as SurfaceStatusMap;

const INSTALLABLE_SURFACES = SURFACE_IDS.filter(
  (surface): surface is InstallableSurfaceId => surface !== 'web',
);

describe('release state read from the registry', () => {
  it('splits the six surfaces into released and unreleased with nothing left over', () => {
    expect([...RELEASED_SURFACES, ...UNRELEASED_SURFACES].sort()).toEqual([...SURFACE_IDS].sort());
    for (const surface of SURFACE_IDS) {
      expect(isReleased(surface)).toBe(SURFACE_STATUS[surface] === AVAILABLE_NOW_LABEL);
      expect(RELEASED_SURFACES.includes(surface)).toBe(isReleased(surface));
    }
  });

  it('moves a surface across the split when its status flips', () => {
    expect(isReleased('cli', ONLY_WEB_RELEASED)).toBe(false);
    expect(isReleased('cli', CLI_RELEASED)).toBe(true);
    expect(releasedSurfaces(ONLY_WEB_RELEASED)).toEqual(['web']);
    expect(releasedSurfaces(CLI_RELEASED)).toEqual(['web', 'cli']);
    expect(unreleasedSurfaces(CLI_RELEASED)).toEqual(['desktop', 'mobile', 'vscode', 'chrome']);
    expect(unreleasedSurfaces(ALL_RELEASED)).toEqual([]);
  });

  it('names every surface the way the help centre does', () => {
    expect(Object.keys(SURFACE_NAMES).sort()).toEqual([...SURFACE_IDS].sort());
    expect(SURFACE_NAMES).toEqual(DOC_PLATFORM_LABELS);
  });
});

describe('platforms of released surfaces', () => {
  it('lists a platform for every surface', () => {
    for (const surface of SURFACE_IDS) {
      expect(SURFACE_PLATFORMS[surface].length).toBeGreaterThan(0);
    }
  });

  it('adds a platform only when a surface that runs on it is released', () => {
    expect(releasedPlatforms(ONLY_WEB_RELEASED)).toEqual(['Web']);
    expect(releasedPlatforms(CLI_RELEASED)).toEqual(['Web', 'macOS', 'Windows', 'Linux']);
    expect(releasedPlatforms(ALL_RELEASED)).toEqual([
      'Web',
      'macOS',
      'Windows',
      'Linux',
      'iOS',
      'Android',
    ]);
  });
});

describe('availability wording', () => {
  it('states the CLI as coming soon until it is released, then says nothing', () => {
    expect(cliAvailabilityNote(ONLY_WEB_RELEASED)).toBe('The CLI is coming soon.');
    expect(cliAvailabilityNote(CLI_RELEASED)).toBe('');
    expect(CLI_AVAILABILITY_NOTE).toBe(cliAvailabilityNote(SURFACE_STATUS));
  });

  it('summarises both sides of the split and drops an empty side', () => {
    expect(surfaceAvailabilitySummary(ONLY_WEB_RELEASED)).toBe(
      'Web is available now. Desktop, CLI, Mobile, VS Code and Chrome are coming soon.',
    );
    expect(surfaceAvailabilitySummary(CLI_RELEASED)).toBe(
      'Web and CLI are available now. Desktop, Mobile, VS Code and Chrome are coming soon.',
    );
    expect(surfaceAvailabilitySummary(ALL_RELEASED)).toBe(
      'Web, Desktop, CLI, Mobile, VS Code and Chrome are available now.',
    );
  });
});

describe('the action offered for a surface', () => {
  it('sends an unreleased Desktop or CLI visitor to its live section on the download page', () => {
    expect(surfaceCta('desktop', ONLY_WEB_RELEASED)).toEqual({
      label: 'Check Desktop availability',
      href: '/download#desktop-downloads',
    });
    expect(surfaceCta('cli', ONLY_WEB_RELEASED)).toEqual({
      label: 'Check CLI availability',
      href: '/download#cli-downloads',
    });
  });

  it('points at download sections that exist', () => {
    const sections = {
      desktop: 'app/download/DesktopDownloadAvailability.tsx',
      cli: 'app/download/CliDownloadAvailability.tsx',
    } as const;
    for (const [surface, file] of Object.entries(sections) as [InstallableSurfaceId, string][]) {
      const anchor = surfaceCta(surface, ONLY_WEB_RELEASED).href.split('#')[1];
      expect(anchor).toBeTruthy();
      expect(readFileSync(join(WEB_ROOT, file), 'utf8')).toContain(`id="${anchor}"`);
    }
  });

  it('offers the notify list exactly where its consent text names the surface', () => {
    const consent = CONSENT_PURPOSES.find(
      (purpose) => purpose.id === 'platform_availability_waitlist',
    );
    expect(consent).toBeDefined();

    for (const surface of INSTALLABLE_SURFACES) {
      const offersNotifyList = surfaceCta(surface, ONLY_WEB_RELEASED) === NOTIFY_CTA;
      expect(offersNotifyList, surface).toBe(
        consent?.description.includes(SURFACE_NAMES[surface]) ?? false,
      );
    }
  });

  it('never tells a visitor to get a surface that is not released', () => {
    for (const surface of INSTALLABLE_SURFACES) {
      const unreleased = surfaceCta(surface, ONLY_WEB_RELEASED);
      expect(unreleased === NOTIFY_CTA || unreleased.label.startsWith('Check '), surface).toBe(
        true,
      );
      expect(surfaceCta(surface, ALL_RELEASED).label).toMatch(/^Get /);
    }
  });

  it('turns into a get action when the surface is released', () => {
    expect(surfaceCta('cli', CLI_RELEASED)).toEqual({
      label: 'Get the CLI',
      href: '/download#cli-downloads',
    });
    expect(surfaceCta('desktop', CLI_RELEASED).label).toBe('Check Desktop availability');
    expect(surfaceCta('mobile', ALL_RELEASED)).not.toBe(NOTIFY_CTA);
  });
});

describe('copy that reads the registry', () => {
  it('states the route boundary without calling the CLI released', () => {
    expect(POSITIONING.routeBoundary).not.toMatch(/released CLI/i);
    expect(POSITIONING.routeBoundary).toContain(
      [
        'The CLI supports Local and BYOK.',
        CLI_AVAILABILITY_NOTE,
        `VS Code BYOK is ${SURFACE_STATUS.vscode.toLowerCase()}.`,
      ]
        .filter(Boolean)
        .join(' '),
    );
  });

  it('keeps one BYOK surface list, with no released-only variant that can be empty', () => {
    expect(BYOK_SURFACES.label).toBe('CLI and VS Code');
    expect(BYOK_SURFACES).not.toHaveProperty('shipped');
    expect(readFileSync(join(WEB_ROOT, 'app/api-docs/page.tsx'), 'utf8')).toContain(
      '`BYOK on ${BYOK_SURFACES.label} never touches this gateway`',
    );
  });

  it('gives help articles availability tokens that follow the registry', () => {
    expect(interpolateFacts('{{AVAILABILITY.cli}}', 'probe')).toBe(CLI_AVAILABILITY_NOTE);
    expect(interpolateFacts('{{AVAILABILITY.summary}}', 'probe')).toBe(
      surfaceAvailabilitySummary(),
    );
    expect(interpolateFacts('{{POSITIONING.trustBoundary}}', 'probe')).toBe(
      POSITIONING.routeBoundary,
    );
  });
});
