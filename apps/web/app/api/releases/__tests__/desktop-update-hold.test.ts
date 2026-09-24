import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_VERSION_HEADER } from '@agiworkforce/cloud-contracts';

const mocks = vi.hoisted(() => ({
  definitions: [] as unknown[],
  fetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@shared/utils/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/utils/env')>()),
  getOptionalEnv: (name: string) =>
    name.endsWith('_GITHUB_OWNER')
      ? 'siddharthanagula3'
      : name.endsWith('_GITHUB_REPO')
        ? 'agiworkforce'
        : undefined,
}));
vi.mock('@/lib/server/data-region', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/data-region')>()),
  managedCloudDataRegion: () => 'us-east-1',
}));
vi.mock('@/lib/feature-flags/flag-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/flag-store')>()),
  getActiveFlagDefinitions: async () => mocks.definitions,
  getSubjectOverrides: async () => [],
}));

import type { FlagDefinition, FlagDefinitionInput } from '@/lib/feature-flags/flag-definition';
import {
  DESKTOP_UPDATE_CAPABILITY,
  capabilityKillSwitchKey,
  killSwitchDefinition,
} from '@/lib/feature-flags/kill-switches';
import { versionDisableDefinition } from '@/lib/feature-flags/version-disable';

import { GET as getTauriUpdate } from '../[target]/[version]/route';
import { GET as getLatestCloudRelease } from '../desktop-cloud/latest/route';

const CLOUD_DMG_BASE =
  'https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cloud-desktop-1.3.0';

function stored(input: FlagDefinitionInput): FlagDefinition {
  return {
    ...input,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

function heldForEveryone(): FlagDefinition {
  return stored({
    ...killSwitchDefinition(capabilityKillSwitchKey(DESKTOP_UPDATE_CAPABILITY), 'updates'),
    killSwitch: true,
  });
}

function heldThrough(maxVersion: string): FlagDefinition {
  return stored(
    versionDisableDefinition({
      capability: 'desktop_update',
      surfaces: ['desktop'],
      minVersion: null,
      maxVersion,
      reason: 'The next build corrupts settings saved by this one.',
      incident: 'INC-77',
    }),
  );
}

function tauriCheck(version: string) {
  return getTauriUpdate(
    new Request(`https://agi.example/api/releases/linux-x86_64/${version}`) as never,
    { params: Promise.resolve({ target: 'linux-x86_64', version }) },
  );
}

function cloudCheck(installed?: string) {
  return getLatestCloudRelease(
    new Request('https://agi.example/api/releases/desktop-cloud/latest', {
      headers: installed ? { [CLIENT_VERSION_HEADER]: installed } : {},
    }) as never,
  );
}

function askedGitHub(): boolean {
  return mocks.fetch.mock.calls.some(([input]) => String(input).includes('api.github.com'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.definitions = [];
  mocks.fetch.mockImplementation(async () =>
    Response.json([
      {
        id: 30,
        tag_name: 'v-cloud-desktop-1.3.0',
        name: 'v-cloud-desktop-1.3.0',
        body: 'Notes',
        published_at: '2026-09-15T00:00:00Z',
        draft: false,
        prerelease: false,
        assets: [
          {
            id: 301,
            name: 'AGI-Cloud-1.3.0-arm64.dmg',
            browser_download_url: `${CLOUD_DMG_BASE}/AGI-Cloud-1.3.0-arm64.dmg`,
            content_type: 'application/octet-stream',
            size: 1024,
            state: 'uploaded',
          },
        ],
      },
    ]),
  );
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('the desktop update switch on the Tauri updater feed', () => {
  it('looks for a release while nothing is held', async () => {
    await tauriCheck('1.9.0');

    expect(askedGitHub()).toBe(true);
  });

  it('offers no update, without asking GitHub, while updates are held for everyone', async () => {
    mocks.definitions = [heldForEveryone()];

    const response = await tauriCheck('1.9.0');

    expect(response.status).toBe(204);
    expect(askedGitHub()).toBe(false);
  });

  it('holds only the builds the version range names', async () => {
    mocks.definitions = [heldThrough('1.9.0')];

    expect((await tauriCheck('1.9.0')).status).toBe(204);
    expect(askedGitHub()).toBe(false);

    await tauriCheck('1.9.5');
    expect(askedGitHub()).toBe(true);
  });
});

describe('the desktop update switch on the AGI Cloud feed', () => {
  it('answers that updates are held, uncached, while they are held for everyone', async () => {
    mocks.definitions = [heldForEveryone()];

    const response = await cloudCheck('1.2.0');

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'UPDATES_HELD' } });
    expect(askedGitHub()).toBe(false);
  });

  it('holds the installed version the app reports and serves every other one', async () => {
    mocks.definitions = [heldThrough('1.2.0')];

    expect((await cloudCheck('1.2.0')).status).toBe(503);

    const served = await cloudCheck('1.2.5');
    expect(served.status).toBe(200);
    expect(served.headers.get('vary')).toBe(CLIENT_VERSION_HEADER);
    expect(await served.json()).toMatchObject({ version: '1.3.0' });
  });
});
