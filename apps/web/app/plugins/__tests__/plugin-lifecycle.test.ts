import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  PluginLifecycleError,
  applyPluginUpdate,
  deprecatePluginVersion,
  diffPluginVersionRecords,
  listPluginUpdateOffers,
  publishPluginVersion,
  rollbackPlugin,
  suspendPluginVersion,
  type PluginVersionRecord,
  type PluginVersionStatus,
} from '@/lib/services/plugin-lifecycle';

const PLUGIN_ID = 'research-pack';
const ADMIN = 'user_admin';

interface VersionFixture {
  version: string;
  status: PluginVersionStatus;
  permissions?: string[];
  declaredSkills?: string[];
  changelog?: string;
  publishedAt?: string;
}

interface WorldState {
  entryVersion: string;
  entryStatus: string;
  versions: VersionFixture[];
  installations: { userId: string; version: string; enabled: boolean }[];
  events: { action: string; version: string; reason: string | null; actor: string }[];
}

function versionRow(fixture: VersionFixture) {
  return {
    plugin_id: PLUGIN_ID,
    version: fixture.version,
    status: fixture.status,
    manifest_url: null,
    sha256: null,
    declared_skills: fixture.declaredSkills ?? [],
    permissions: fixture.permissions ?? [],
    changelog: fixture.changelog ?? '',
    lifecycle_reason: null,
    published_at: fixture.publishedAt ?? '2026-09-01T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

// A small model of the four tables the lifecycle touches, so an assertion about
// rollback is about what the rows end up saying rather than which SQL ran.
function world(state: WorldState): { db: DatabaseAdapter; state: WorldState } {
  const find = (version: string) => state.versions.find((row) => row.version === version);

  const run = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> => {
    if (sql.includes('from public.plugin_registry_versions') && sql.includes('and version = $2')) {
      const found = find(String(params[1]));
      return found ? [versionRow(found)] : [];
    }
    if (sql.includes("status = 'published' and version <> $2")) {
      const candidates = state.versions
        .filter((row) => row.status === 'published' && row.version !== String(params[1]))
        .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''));
      const newest = candidates[candidates.length - 1];
      return newest ? [versionRow(newest)] : [];
    }
    if (sql.includes('from public.plugin_registry_versions') && sql.includes('order by coalesce')) {
      return state.versions.map(versionRow);
    }
    if (sql.includes('select version from public.plugin_registry_entries')) {
      return [{ version: state.entryVersion }];
    }
    if (sql.includes('insert into public.plugin_registry_versions')) {
      const version = String(params[1]);
      const next: VersionFixture = {
        version,
        status: 'published',
        declaredSkills: JSON.parse(String(params[4])) as string[],
        permissions: JSON.parse(String(params[5])) as string[],
        changelog: String(params[6]),
        publishedAt: `2026-09-1${state.versions.length}T00:00:00.000Z`,
      };
      state.versions = [...state.versions.filter((row) => row.version !== version), next];
      return [versionRow(next)];
    }
    if (sql.includes('update public.plugin_registry_versions')) {
      const version = String(params[1]);
      const found = find(version);
      if (found) found.status = String(params[2]) as PluginVersionStatus;
      return found ? [versionRow(found)] : [];
    }
    if (sql.includes('update public.plugin_registry_entries')) {
      state.entryVersion = String(params[1]);
      state.entryStatus = String(params[2]);
      return [];
    }
    if (sql.includes('update public.plugin_installations') && sql.includes('enabled = false')) {
      const stopped = state.installations.filter(
        (row) => row.version === String(params[1]) && row.enabled,
      );
      for (const row of stopped) row.enabled = false;
      return stopped.map(() => ({ id: 'installation' }));
    }
    if (
      sql.includes('update public.plugin_installations') &&
      sql.includes('installed_version = $3')
    ) {
      const moved = state.installations.filter((row) => row.version === String(params[1]));
      for (const row of moved) row.version = String(params[2]);
      return moved.map(() => ({ id: 'installation' }));
    }
    if (sql.includes('insert into public.plugin_registry_lifecycle_events')) {
      state.events.push({
        action: String(params[2]),
        version: String(params[1]),
        reason: params[5] === null ? null : String(params[5]),
        actor: String(params[6]),
      });
      return [];
    }
    return [];
  };

  const db = {
    query: vi.fn(run),
    execute: vi.fn(run),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  };
  return { db: db as unknown as DatabaseAdapter, state };
}

function baseWorld(): WorldState {
  return {
    entryVersion: '1.1.0',
    entryStatus: 'published',
    versions: [
      { version: '1.0.0', status: 'published', publishedAt: '2026-09-01T00:00:00.000Z' },
      { version: '1.1.0', status: 'published', publishedAt: '2026-09-05T00:00:00.000Z' },
    ],
    installations: [{ userId: 'user_1', version: '1.1.0', enabled: true }],
    events: [],
  };
}

describe('plugin lifecycle admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes a version, repoints the entry and records who did it', async () => {
    const { db, state } = world(baseWorld());

    const published = await publishPluginVersion(db, {
      pluginId: PLUGIN_ID,
      version: '1.2.0',
      actorUserId: ADMIN,
      permissions: ['network'],
      changelog: 'Adds live source fetching.',
    });

    expect(published.status).toBe('published');
    expect(state.entryVersion).toBe('1.2.0');
    expect(state.entryStatus).toBe('published');
    expect(state.events).toContainEqual(
      expect.objectContaining({ action: 'publish', version: '1.2.0', actor: ADMIN }),
    );
  });

  it('deprecates a version with the reason a member is owed', async () => {
    const { db, state } = world(baseWorld());

    const deprecated = await deprecatePluginVersion(db, {
      pluginId: PLUGIN_ID,
      version: '1.0.0',
      reason: 'Superseded by 1.1.0.',
      actorUserId: ADMIN,
    });

    expect(deprecated.status).toBe('deprecated');
    expect(state.events).toContainEqual(
      expect.objectContaining({ action: 'deprecate', reason: 'Superseded by 1.1.0.' }),
    );
    // Only the current version moves the entry, and 1.0.0 is not it.
    expect(state.entryVersion).toBe('1.1.0');
  });

  it('suspends one version fleet-wide and stops the installs pinned to it', async () => {
    const { db, state } = world(baseWorld());

    const result = await suspendPluginVersion(db, {
      pluginId: PLUGIN_ID,
      version: '1.1.0',
      reason: 'Leaks the connector token into its logs.',
      actorUserId: ADMIN,
    });

    expect(result.version.status).toBe('suspended');
    expect(result.installationsStopped).toBe(1);
    expect(state.installations[0]?.enabled).toBe(false);
    // 1.0.0 is untouched: a suspension is per version, not per plugin.
    expect(state.versions.find((row) => row.version === '1.0.0')?.status).toBe('published');
    expect(state.entryStatus).toBe('deprecated');
  });

  it('rolls back to the last known-good version and moves the pinned installs with it', async () => {
    const { db, state } = world(baseWorld());
    await suspendPluginVersion(db, {
      pluginId: PLUGIN_ID,
      version: '1.1.0',
      reason: 'Leaks the connector token into its logs.',
      actorUserId: ADMIN,
    });

    const rolled = await rollbackPlugin(db, { pluginId: PLUGIN_ID, actorUserId: ADMIN });

    expect(rolled.restored.version).toBe('1.0.0');
    expect(rolled.from).toBe('1.1.0');
    expect(rolled.installationsMoved).toBe(1);
    expect(state.entryVersion).toBe('1.0.0');
    expect(state.entryStatus).toBe('published');
    expect(state.installations[0]?.version).toBe('1.0.0');
    expect(state.events.at(-1)).toMatchObject({ action: 'rollback', version: '1.0.0' });
  });

  it('refuses a rollback with nothing to roll back to', async () => {
    const { db } = world({
      ...baseWorld(),
      versions: [{ version: '1.1.0', status: 'published' }],
    });

    await expect(
      rollbackPlugin(db, { pluginId: PLUGIN_ID, actorUserId: ADMIN }),
    ).rejects.toBeInstanceOf(PluginLifecycleError);
  });

  it('refuses a transition the lifecycle does not allow', async () => {
    const { db } = world({
      ...baseWorld(),
      versions: [{ version: '1.1.0', status: 'draft' }],
    });

    await expect(
      deprecatePluginVersion(db, {
        pluginId: PLUGIN_ID,
        version: '1.1.0',
        reason: 'Never mind.',
        actorUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(PluginLifecycleError);
  });
});

describe('the update flow shows what changes before it applies', () => {
  function record(overrides: Partial<PluginVersionRecord>): PluginVersionRecord {
    return {
      pluginId: PLUGIN_ID,
      version: '1.0.0',
      status: 'published',
      manifestUrl: null,
      sha256: null,
      declaredSkills: [],
      permissions: [],
      changelog: '',
      lifecycleReason: null,
      publishedAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('names the permissions a new version adds and asks for review', () => {
    const diff = diffPluginVersionRecords(
      record({ version: '1.0.0', permissions: ['network'], declaredSkills: ['research'] }),
      record({
        version: '1.1.0',
        permissions: ['network', 'connectors'],
        declaredSkills: ['research', 'citations'],
        changelog: 'Adds citation formatting.',
      }),
    );

    expect(diff.from).toBe('1.0.0');
    expect(diff.to).toBe('1.1.0');
    expect(diff.addedPermissions).toEqual(['connectors']);
    expect(diff.removedPermissions).toEqual([]);
    expect(diff.addedSkills).toEqual(['citations']);
    expect(diff.changelog).toBe('Adds citation formatting.');
    expect(diff.requiresPermissionReview).toBe(true);
  });

  it('does not ask for review when a version only drops a permission', () => {
    const diff = diffPluginVersionRecords(
      record({ version: '1.0.0', permissions: ['network', 'connectors'] }),
      record({ version: '1.1.0', permissions: ['network'] }),
    );

    expect(diff.addedPermissions).toEqual([]);
    expect(diff.removedPermissions).toEqual(['connectors']);
    expect(diff.requiresPermissionReview).toBe(false);
  });

  it('offers an update for a newer version and for a pin that was stopped', async () => {
    const rows = [
      {
        plugin_id: PLUGIN_ID,
        installed_version: '1.0.0',
        installed_status: 'suspended',
        latest_version: '1.1.0',
      },
    ];
    const versions: Record<string, VersionFixture> = {
      '1.0.0': { version: '1.0.0', status: 'suspended', permissions: [] },
      '1.1.0': { version: '1.1.0', status: 'published', permissions: ['network'] },
    };
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('from public.plugin_installations installation')) return rows;
        if (sql.includes('and version = $2')) {
          const found = versions[String(params[1])];
          return found ? [versionRow(found)] : [];
        }
        return [];
      }),
      execute: vi.fn(),
      transaction: vi.fn(),
      withUser: vi.fn(),
      dispose: vi.fn(),
    } as unknown as DatabaseAdapter;

    const offers = await listPluginUpdateOffers(db, 'user_1');

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      pluginId: PLUGIN_ID,
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      installedVersionStopped: true,
    });
    expect(offers[0]?.diff.addedPermissions).toEqual(['network']);
  });
});

describe('applying an update moves one installation and nothing else', () => {
  function updateWorld(
    installedVersion: string,
    versions: Record<string, VersionFixture>,
  ): { db: DatabaseAdapter; writes: unknown[][] } {
    const writes: unknown[][] = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('select installed_version from public.plugin_installations')) {
          return installedVersion ? [{ installed_version: installedVersion }] : [];
        }
        if (sql.includes('and version = $2')) {
          const found = versions[String(params[1])];
          return found ? [versionRow(found)] : [];
        }
        return [];
      }),
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('update public.plugin_installations')) writes.push(params);
        return [];
      }),
      transaction: vi.fn(),
      withUser: vi.fn(),
      dispose: vi.fn(),
    } as unknown as DatabaseAdapter;
    return { db, writes };
  }

  const published = (version: string, permissions: string[] = []): VersionFixture => ({
    version,
    status: 'published',
    permissions,
  });

  it('repins the installation when nothing new is asked for', async () => {
    const { db, writes } = updateWorld('1.0.0', {
      '1.0.0': published('1.0.0', ['network']),
      '1.1.0': published('1.1.0', ['network']),
    });

    const applied = await applyPluginUpdate(db, {
      userId: 'user_1',
      pluginId: PLUGIN_ID,
      toVersion: '1.1.0',
    });

    expect(applied).toMatchObject({ fromVersion: '1.0.0', toVersion: '1.1.0', reEnabled: false });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(['user_1', PLUGIN_ID, '1.1.0', false]);
  });

  it('refuses a version that adds a permission the member has not approved', async () => {
    const { db, writes } = updateWorld('1.0.0', {
      '1.0.0': published('1.0.0', ['network']),
      '1.1.0': published('1.1.0', ['network', 'connectors']),
    });

    await expect(
      applyPluginUpdate(db, { userId: 'user_1', pluginId: PLUGIN_ID, toVersion: '1.1.0' }),
    ).rejects.toBeInstanceOf(PluginLifecycleError);
    expect(writes).toHaveLength(0);
  });

  it('applies the same update once the added permission is acknowledged', async () => {
    const { db, writes } = updateWorld('1.0.0', {
      '1.0.0': published('1.0.0', ['network']),
      '1.1.0': published('1.1.0', ['network', 'connectors']),
    });

    const applied = await applyPluginUpdate(db, {
      userId: 'user_1',
      pluginId: PLUGIN_ID,
      toVersion: '1.1.0',
      acknowledgedPermissions: ['connectors'],
    });

    expect(applied.diff.addedPermissions).toEqual(['connectors']);
    expect(writes).toHaveLength(1);
  });

  it('re-enables an install whose pinned version was suspended', async () => {
    const { db, writes } = updateWorld('1.0.0', {
      '1.0.0': { version: '1.0.0', status: 'suspended' },
      '1.1.0': published('1.1.0'),
    });

    const applied = await applyPluginUpdate(db, {
      userId: 'user_1',
      pluginId: PLUGIN_ID,
      toVersion: '1.1.0',
    });

    expect(applied.reEnabled).toBe(true);
    expect(writes[0]).toEqual(['user_1', PLUGIN_ID, '1.1.0', true]);
  });

  it('refuses to move onto a version that is not published', async () => {
    const { db, writes } = updateWorld('1.0.0', {
      '1.0.0': published('1.0.0'),
      '1.1.0': { version: '1.1.0', status: 'suspended' },
    });

    await expect(
      applyPluginUpdate(db, { userId: 'user_1', pluginId: PLUGIN_ID, toVersion: '1.1.0' }),
    ).rejects.toBeInstanceOf(PluginLifecycleError);
    expect(writes).toHaveLength(0);
  });

  it('refuses an update for a plugin the member has not installed', async () => {
    const { db } = updateWorld('', { '1.1.0': published('1.1.0') });

    await expect(
      applyPluginUpdate(db, { userId: 'user_1', pluginId: PLUGIN_ID, toVersion: '1.1.0' }),
    ).rejects.toBeInstanceOf(PluginLifecycleError);
  });
});
