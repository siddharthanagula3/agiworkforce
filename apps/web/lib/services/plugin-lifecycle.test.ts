import { generateKeyPairSync, sign as signPayload } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { pluginSignaturePayload } from '@agiworkforce/client-runtime/plugins';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { applyPluginUpdate, publishPluginVersion } from './plugin-lifecycle';
import {
  PLUGIN_SIGNING_PUBLIC_KEYS_ENV,
  PluginPackageRefusedError,
} from './plugin-marketplace-service';

const PLUGIN_ID = 'research-pack';
const SIGNED_DIGEST = 'a'.repeat(64);
const UNSIGNED_DIGEST = 'b'.repeat(64);

const publisher = generateKeyPairSync('ed25519');
const previousKeys = process.env[PLUGIN_SIGNING_PUBLIC_KEYS_ENV];
process.env[PLUGIN_SIGNING_PUBLIC_KEYS_ENV] = publisher.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();

afterAll(() => {
  if (previousKeys === undefined) delete process.env[PLUGIN_SIGNING_PUBLIC_KEYS_ENV];
  else process.env[PLUGIN_SIGNING_PUBLIC_KEYS_ENV] = previousKeys;
});

function signatureFor(version: string, sha256: string): string {
  return signPayload(
    null,
    Buffer.from(pluginSignaturePayload({ pluginId: PLUGIN_ID, version, sha256 }), 'utf8'),
    publisher.privateKey,
  ).toString('base64');
}

interface VersionRow {
  version: string;
  status: string;
  sha256: string | null;
  signature: string | null;
  signature_algorithm: string | null;
  permissions: string[];
  declared_skills: string[];
}

interface Installation {
  installedVersion: string;
  enabled: boolean;
  approvedPermissions: string[];
  reviewRequired: boolean;
}

interface World {
  source: string;
  publisherKind: string;
  entry: {
    version: string;
    sha256: string | null;
    signature: string | null;
    algorithm: string | null;
  };
  versions: VersionRow[];
  scans: Record<string, string>;
  installation: Installation;
}

function freshWorld(overrides: Partial<World> = {}): World {
  return {
    source: 'marketplace',
    publisherKind: 'third-party',
    entry: {
      version: '1.0.0',
      sha256: SIGNED_DIGEST,
      signature: signatureFor('1.0.0', SIGNED_DIGEST),
      algorithm: 'ed25519',
    },
    versions: [
      {
        version: '1.0.0',
        status: 'published',
        sha256: SIGNED_DIGEST,
        signature: signatureFor('1.0.0', SIGNED_DIGEST),
        signature_algorithm: 'ed25519',
        permissions: ['network'],
        declared_skills: ['research'],
      },
      {
        version: '1.1.0',
        status: 'published',
        sha256: SIGNED_DIGEST,
        signature: signatureFor('1.1.0', SIGNED_DIGEST),
        signature_algorithm: 'ed25519',
        permissions: ['network'],
        declared_skills: ['research'],
      },
    ],
    scans: { [SIGNED_DIGEST]: 'pass' },
    installation: {
      installedVersion: '1.0.0',
      enabled: true,
      approvedPermissions: ['network'],
      reviewRequired: false,
    },
    ...overrides,
  };
}

function versionRow(row: VersionRow) {
  return {
    plugin_id: PLUGIN_ID,
    version: row.version,
    status: row.status,
    manifest_url: null,
    sha256: row.sha256,
    signature: row.signature,
    signature_algorithm: row.signature_algorithm,
    declared_skills: row.declared_skills,
    permissions: row.permissions,
    changelog: '',
    lifecycle_reason: null,
    published_at: '2026-09-01T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

function adapterFor(world: World): DatabaseAdapter {
  const run = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> => {
    if (sql.includes('select source, publisher_kind')) {
      return [{ source: world.source, publisher_kind: world.publisherKind }];
    }
    if (sql.includes('from public.plugin_package_scans')) {
      const verdict = world.scans[String(params[0])];
      return verdict
        ? [
            {
              content_hash: String(params[0]),
              plugin_key: PLUGIN_ID,
              verdict,
              rules_version: 1,
              findings: [],
              scanned_at: '2026-09-01T00:00:00.000Z',
            },
          ]
        : [];
    }
    if (sql.includes('select installed_version, approved_permissions')) {
      return [
        {
          installed_version: world.installation.installedVersion,
          approved_permissions: world.installation.approvedPermissions,
        },
      ];
    }
    if (sql.includes('from public.plugin_registry_versions') && sql.includes('and version = $2')) {
      const found = world.versions.find((row) => row.version === String(params[1]));
      return found ? [versionRow(found)] : [];
    }
    if (sql.includes('insert into public.plugin_registry_versions')) {
      const next: VersionRow = {
        version: String(params[1]),
        status: 'published',
        sha256: params[3] as string | null,
        signature: params[4] as string | null,
        signature_algorithm: params[5] as string | null,
        declared_skills: JSON.parse(String(params[6])) as string[],
        permissions: JSON.parse(String(params[7])) as string[],
      };
      world.versions = [...world.versions.filter((row) => row.version !== next.version), next];
      return [versionRow(next)];
    }
    if (sql.includes('update public.plugin_registry_entries')) {
      world.entry = {
        version: String(params[1]),
        sha256: params[4] as string | null,
        signature: params[5] as string | null,
        algorithm: params[6] as string | null,
      };
      return [];
    }
    if (sql.includes('update public.plugin_installations')) {
      world.installation = {
        installedVersion: String(params[2]),
        enabled: world.installation.enabled || Boolean(params[3]),
        approvedPermissions: JSON.parse(String(params[4])) as string[],
        reviewRequired: false,
      };
      return [];
    }
    if (sql.includes('insert into public.plugin_registry_lifecycle_events')) return [];
    return [];
  };

  return {
    query: (sql: string, params?: unknown[]) => run(sql, params),
    execute: async (sql: string, params?: unknown[]) => {
      await run(sql, params);
    },
  } as unknown as DatabaseAdapter;
}

describe('moving an installation onto another published version', () => {
  let world: World;

  beforeEach(() => {
    world = freshWorld();
  });

  it('applies when the target carries a passing scan of its own signed digest', async () => {
    const applied = await applyPluginUpdate(adapterFor(world), {
      userId: 'user_1',
      pluginId: PLUGIN_ID,
      toVersion: '1.1.0',
    });

    expect(applied.toVersion).toBe('1.1.0');
    expect(world.installation.installedVersion).toBe('1.1.0');
  });

  it('refuses a target whose artifact was never scanned', async () => {
    world.versions[1]!.sha256 = UNSIGNED_DIGEST;
    world.versions[1]!.signature = signatureFor('1.1.0', UNSIGNED_DIGEST);

    await expect(
      applyPluginUpdate(adapterFor(world), {
        userId: 'user_1',
        pluginId: PLUGIN_ID,
        toVersion: '1.1.0',
      }),
    ).rejects.toBeInstanceOf(PluginPackageRefusedError);
    expect(world.installation.installedVersion).toBe('1.0.0');
  });

  it('refuses a target whose scan did not pass', async () => {
    world.scans[SIGNED_DIGEST] = 'block';

    await expect(
      applyPluginUpdate(adapterFor(world), {
        userId: 'user_1',
        pluginId: PLUGIN_ID,
        toVersion: '1.1.0',
      }),
    ).rejects.toBeInstanceOf(PluginPackageRefusedError);
    expect(world.installation.installedVersion).toBe('1.0.0');
  });

  it('refuses a target published without a signature', async () => {
    world.versions[1]!.signature = null;
    world.versions[1]!.signature_algorithm = null;

    await expect(
      applyPluginUpdate(adapterFor(world), {
        userId: 'user_1',
        pluginId: PLUGIN_ID,
        toVersion: '1.1.0',
      }),
    ).rejects.toBeInstanceOf(PluginPackageRefusedError);
    expect(world.installation.installedVersion).toBe('1.0.0');
  });

  it('asks again for a permission the installation runs but never approved', async () => {
    world.installation.approvedPermissions = [];
    world.installation.reviewRequired = true;

    await expect(
      applyPluginUpdate(adapterFor(world), {
        userId: 'user_1',
        pluginId: PLUGIN_ID,
        toVersion: '1.1.0',
      }),
    ).rejects.toThrow(/network/);
    expect(world.installation.installedVersion).toBe('1.0.0');
  });

  it('records the target permission set as approved once the member names it', async () => {
    world.versions[1]!.permissions = ['network', 'shell'];

    const applied = await applyPluginUpdate(adapterFor(world), {
      userId: 'user_1',
      pluginId: PLUGIN_ID,
      toVersion: '1.1.0',
      acknowledgedPermissions: ['shell'],
    });

    expect(applied.diff.addedPermissions).toEqual(['shell']);
    expect(world.installation.approvedPermissions).toEqual(['network', 'shell']);
    expect(world.installation.reviewRequired).toBe(false);
  });
});

describe('repointing the entry at a version', () => {
  it('moves the digest and the signature together', async () => {
    const world = freshWorld();
    const nextDigest = 'c'.repeat(64);

    await publishPluginVersion(adapterFor(world), {
      pluginId: PLUGIN_ID,
      version: '2.0.0',
      actorUserId: 'user_admin',
      sha256: nextDigest,
      signature: signatureFor('2.0.0', nextDigest),
      signatureAlgorithm: 'ed25519',
      permissions: ['network'],
    });

    expect(world.entry).toEqual({
      version: '2.0.0',
      sha256: nextDigest,
      signature: signatureFor('2.0.0', nextDigest),
      algorithm: 'ed25519',
    });
  });
});
