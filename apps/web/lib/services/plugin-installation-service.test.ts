import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getNeonDbMock, getPluginRegistryEntryMock } = vi.hoisted(() => ({
  getNeonDbMock: vi.fn(),
  getPluginRegistryEntryMock: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
vi.mock('./plugin-registry-service', () => ({
  getPluginRegistryEntry: getPluginRegistryEntryMock,
}));

import { generateKeyPairSync, sign as signPayload } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { PluginRegistryEntry } from '@agiworkforce/types';
import { pluginSignaturePayload } from '@agiworkforce/client-runtime/plugins';
import {
  approvePendingPluginPermissions,
  countPluginInstallations,
  getPluginInstallationSettings,
  installWebPlugin,
  listEnabledPluginIds,
  listPluginPermissionReviews,
  setWebPluginEnabled,
  uninstallWebPlugin,
  updatePluginInstallationSettings,
} from './plugin-installation-service';
import { verifyPluginPackage } from './plugin-marketplace-service';

const ARTIFACT_SHA256 = 'b'.repeat(64);
const OTHER_SHA256 = 'c'.repeat(64);

function publisherKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const publisher = publisherKeys();
const stranger = publisherKeys();

const signedIntegrity = {
  sha256: ARTIFACT_SHA256,
  signature: signPayload(
    null,
    Buffer.from(
      pluginSignaturePayload({
        pluginId: 'research-pack',
        version: '1.0.0',
        sha256: ARTIFACT_SHA256,
      }),
      'utf8',
    ),
    publisher.privateKey,
  ).toString('base64'),
  signatureAlgorithm: 'ed25519' as const,
};

/** Anything not shipped inside the build: the signing and scanning gates apply. */
function signedEntry(overrides: Partial<PluginRegistryEntry> = {}) {
  return {
    entry: registryEntry({
      permissions: ['network'],
      source: 'marketplace',
      publisher: { id: 'acme', name: 'Acme', kind: 'third-party', url: null },
      integrity: signedIntegrity,
      distribution: { manifestUrl: 'https://example.test/plugin.json', sha256: ARTIFACT_SHA256 },
      ...overrides,
    }),
    manifest: { name: 'research-pack', version: '1.0.0', description: '', skills: [] },
  };
}

/** The shape the five shipped packs really have: embedded manifest, no artifact. */
function builtinEntry(overrides: Partial<PluginRegistryEntry> = {}) {
  return {
    entry: registryEntry({
      permissions: ['network'],
      source: 'builtin',
      publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
      integrity: { sha256: null, signature: null, signatureAlgorithm: null },
      distribution: null,
      ...overrides,
    }),
    manifest: { name: 'research-pack', version: '1.0.0', description: '', skills: [] },
  };
}

function scanRow(verdict: 'pass' | 'review' | 'block') {
  return {
    content_hash: ARTIFACT_SHA256,
    plugin_key: 'research-pack',
    verdict,
    rules_version: 1,
    findings:
      verdict === 'pass'
        ? []
        : [{ ruleId: 'x', severity: 'block', message: 'm', path: 'p', line: 1, excerpt: 'e' }],
    scanned_at: '2026-09-17T00:00:00.000Z',
  };
}

type FakeDb = DatabaseAdapter & {
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
};

function installDatabase(options: {
  scan: ReturnType<typeof scanRow> | null;
  approved?: string[];
}): FakeDb {
  const query = vi.fn(async (sql: string) => {
    const text = String(sql).toLowerCase();
    if (text.includes('plugin_package_scans')) return options.scan ? [options.scan] : [];
    if (text.startsWith('select approved_permissions')) {
      return options.approved === undefined ? [] : [{ approved_permissions: options.approved }];
    }
    return [INSTALLATION_ROW];
  });
  return { query, execute: vi.fn().mockResolvedValue(0) } as unknown as FakeDb;
}

function insertCall(db: FakeDb): [string, unknown[]] | undefined {
  return db.query.mock.calls.find((call) =>
    String(call[0]).toLowerCase().includes('insert into public.plugin_installations'),
  ) as [string, unknown[]] | undefined;
}

function database(
  rows: unknown[],
): DatabaseAdapter & { query: ReturnType<typeof vi.fn>; execute: ReturnType<typeof vi.fn> } {
  const db = { query: vi.fn().mockResolvedValue(rows), execute: vi.fn().mockResolvedValue(0) };
  return db as unknown as DatabaseAdapter & {
    query: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
  };
}

function registryEntry(overrides: Partial<PluginRegistryEntry>): PluginRegistryEntry {
  return {
    id: 'research-pack',
    name: 'Research Pack',
    version: '1.0.0',
    description: 'Evidence synthesis.',
    category: 'Research',
    publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
    source: 'builtin',
    status: 'published',
    webInstallable: true,
    declaredSkills: ['literature-review'],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: [],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    homepageUrl: null,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

const INSTALLATION_ROW = {
  plugin_id: 'research-pack',
  installed_version: '1.0.0',
  enabled: true,
  installed_at: '2026-09-03T00:00:00.000Z',
  updated_at: '2026-09-03T00:00:00.000Z',
};

describe('countPluginInstallations', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('maps grouped rows onto a plugin id -> count map', async () => {
    const db = database([
      { plugin_id: 'engineering-pack', install_count: '3' },
      { plugin_id: 'writing-pack', install_count: 1 },
    ]);
    const counts = await countPluginInstallations(db);
    expect(counts.get('engineering-pack')).toBe(3);
    expect(counts.get('writing-pack')).toBe(1);
    expect(counts.get('unknown-pack')).toBeUndefined();
  });

  it('never selects or returns a user id, only a plugin id and a count', async () => {
    const db = database([{ plugin_id: 'engineering-pack', install_count: 1 }]);
    await countPluginInstallations(db);
    const sql = String(db.query.mock.calls[0]?.[0]);
    expect(sql.toLowerCase()).not.toContain('user_id');
    expect(sql.toLowerCase()).toContain('group by plugin_id');
  });

  it('reflects an uninstall as a lower count on the next read', async () => {
    const db = database([
      { plugin_id: 'engineering-pack', install_count: 2 },
      { plugin_id: 'writing-pack', install_count: 1 },
    ]);
    const before = await countPluginInstallations(db);
    expect(before.get('engineering-pack')).toBe(2);

    db.query.mockResolvedValueOnce([{ plugin_id: 'writing-pack', install_count: 1 }]);
    const after = await countPluginInstallations(db);
    expect(after.get('engineering-pack')).toBeUndefined();
    expect(after.get('writing-pack')).toBe(1);
  });

  it('coerces a non-numeric count to zero rather than throwing', async () => {
    const db = database([{ plugin_id: 'engineering-pack', install_count: 'nope' as never }]);
    const counts = await countPluginInstallations(db);
    expect(counts.get('engineering-pack')).toBe(0);
  });

  it('returns an empty map when no plugin has ever been installed', async () => {
    const db = database([]);
    await expect(countPluginInstallations(db)).resolves.toEqual(new Map());
  });
});

describe('installWebPlugin', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
    getPluginRegistryEntryMock.mockReset();
    process.env['PLUGIN_SIGNING_PUBLIC_KEYS'] = publisher.publicKeyPem;
  });

  it('refuses a version an admin suspended, and says which reason stopped it', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(signedEntry());
    const db = installDatabase({ scan: scanRow('pass') });
    db.query.mockImplementation(async (sql: string) => {
      const text = String(sql).toLowerCase();
      if (text.includes('from public.plugin_registry_versions')) {
        return [{ status: 'suspended', lifecycle_reason: 'Leaks the connector token.' }];
      }
      if (text.includes('plugin_package_scans')) return [scanRow('pass')];
      return [INSTALLATION_ROW];
    });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).rejects.toThrow(
      /Leaks the connector token/,
    );
    expect(insertCall(db)).toBeUndefined();
  });

  it('installs a signed, scanned, web-installable entry', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(signedEntry());
    const db = installDatabase({ scan: scanRow('pass') });

    const installation = await installWebPlugin(db, 'user-1', 'research-pack');

    expect(installation).toEqual({
      pluginId: 'research-pack',
      installedVersion: '1.0.0',
      enabled: true,
      installedAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(insertCall(db)?.[1]).toEqual([
      'user-1',
      'research-pack',
      '1.0.0',
      JSON.stringify(['literature-review']),
      JSON.stringify(['network']),
    ]);
  });

  it('installs the first-party pack that ships with the build, unsigned and unscanned', async () => {
    delete process.env['PLUGIN_SIGNING_PUBLIC_KEYS'];
    getPluginRegistryEntryMock.mockResolvedValue(builtinEntry());
    const db = installDatabase({ scan: null });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).resolves.toMatchObject({
      pluginId: 'research-pack',
      enabled: true,
    });
    expect(
      db.query.mock.calls.some((call) => String(call[0]).includes('plugin_package_scans')),
    ).toBe(false);
    expect(insertCall(db)?.[1]?.[4]).toBe(JSON.stringify(['network']));
  });

  it('refuses a builtin entry whose publisher is not first-party', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(
      builtinEntry({ publisher: { id: 'acme', name: 'Acme', kind: 'third-party', url: null } }),
    );
    const db = installDatabase({ scan: scanRow('pass') });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).rejects.toMatchObject({
      refusal: 'hash_missing',
      statusCode: 409,
    });
    expect(insertCall(db)).toBeUndefined();
  });

  it('refuses a package whose digest does not match the signed one', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(
      signedEntry({ integrity: { ...signedIntegrity, sha256: OTHER_SHA256 } }),
    );
    const db = installDatabase({ scan: scanRow('pass') });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).rejects.toMatchObject({
      name: 'PluginPackageRefusedError',
      refusal: 'signature_invalid',
      statusCode: 409,
    });
    expect(insertCall(db)).toBeUndefined();
  });

  it('refuses a tampered artifact even when the registry row itself verifies', () => {
    const verdict = verifyPluginPackage(
      {
        pluginId: 'research-pack',
        version: '1.0.0',
        source: 'marketplace',
        publisherKind: 'third-party',
        sha256: ARTIFACT_SHA256,
        signature: signedIntegrity.signature,
        signatureAlgorithm: 'ed25519',
      },
      OTHER_SHA256,
    );
    expect(verdict).toMatchObject({ ok: false, code: 'hash_mismatch' });
    expect(verdict.reason).toContain('not match the checksum');
  });

  it('refuses an unsigned entry rather than treating a null signature as trusted', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(
      signedEntry({
        integrity: { sha256: ARTIFACT_SHA256, signature: null, signatureAlgorithm: null },
      }),
    );
    const db = installDatabase({ scan: scanRow('pass') });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).rejects.toMatchObject({
      refusal: 'signature_missing',
    });
    expect(insertCall(db)).toBeUndefined();
  });

  it('refuses a signature from a publisher this deployment does not trust', async () => {
    process.env['PLUGIN_SIGNING_PUBLIC_KEYS'] = stranger.publicKeyPem;
    getPluginRegistryEntryMock.mockResolvedValue(signedEntry());
    const db = installDatabase({ scan: scanRow('pass') });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).rejects.toMatchObject({
      refusal: 'signature_invalid',
    });
  });

  it('refuses a package that has never been scanned', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(signedEntry());
    const db = installDatabase({ scan: null });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).rejects.toMatchObject({
      refusal: 'scan_missing',
    });
    expect(insertCall(db)).toBeUndefined();
  });

  it('refuses a package the scanner blocked', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(signedEntry());
    const db = installDatabase({ scan: scanRow('block') });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).rejects.toMatchObject({
      refusal: 'scan_blocked',
    });
  });

  it('blocks an update that expands permissions and disables the installation', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(
      signedEntry({ permissions: ['network', 'shell'] }),
    );
    const db = installDatabase({ scan: scanRow('pass'), approved: ['network'] });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).rejects.toMatchObject({
      name: 'PluginPermissionReviewRequiredError',
      added: ['shell'],
    });
    expect(insertCall(db)).toBeUndefined();
    const disable = db.execute.mock.calls.find((call) =>
      String(call[0]).includes('review_required = true'),
    );
    expect(String(disable?.[0])).toContain('enabled = false');
    expect(disable?.[1]).toEqual(['user-1', 'research-pack', JSON.stringify(['network', 'shell'])]);
  });

  it('lets an update through when it gives up a permission instead of asking for one', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(signedEntry({ permissions: ['network'] }));
    const db = installDatabase({ scan: scanRow('pass'), approved: ['network', 'shell'] });

    await expect(installWebPlugin(db, 'user-1', 'research-pack')).resolves.toMatchObject({
      pluginId: 'research-pack',
    });
  });

  it('never approves a connector scope or authenticates an app on install', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(
      signedEntry({ requiredConnectors: ['github'], permissions: ['connectors'] }),
    );
    const db = installDatabase({ scan: scanRow('pass') });

    await installWebPlugin(db, 'user-1', 'research-pack');

    const written = [...db.query.mock.calls, ...db.execute.mock.calls]
      .map((call) => String(call[0]).toLowerCase())
      .filter((sql) => sql.includes('insert') || sql.includes('update') || sql.includes('delete'));
    for (const sql of written) {
      expect(sql).not.toContain('user_connectors');
      expect(sql).not.toContain('connector_oauth');
      expect(sql).not.toContain('connector_tool_permissions');
    }
    expect(insertCall(db)?.[1]?.[4]).toBe(JSON.stringify(['connectors']));
  });

  it('refuses a preview entry that is not web-installable', async () => {
    getPluginRegistryEntryMock.mockResolvedValue({
      entry: registryEntry({
        id: 'github-automation',
        status: 'preview',
        webInstallable: false,
      }),
      manifest: null,
    });
    const db = installDatabase({ scan: scanRow('pass') });

    const installation = await installWebPlugin(db, 'user-1', 'github-automation');

    expect(installation).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses an entry with no embedded manifest even if flagged web-installable', async () => {
    getPluginRegistryEntryMock.mockResolvedValue({ entry: registryEntry({}), manifest: null });
    const db = installDatabase({ scan: scanRow('pass') });

    const installation = await installWebPlugin(db, 'user-1', 'research-pack');

    expect(installation).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns null for an unknown plugin id without querying installations', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(null);
    const db = installDatabase({ scan: scanRow('pass') });

    const installation = await installWebPlugin(db, 'user-1', 'not-a-real-plugin');

    expect(installation).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('re-enables on a repeat install instead of creating a duplicate row', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(signedEntry());
    const db = installDatabase({ scan: scanRow('pass'), approved: ['network'] });

    await installWebPlugin(db, 'user-1', 'research-pack');

    const sql = String(insertCall(db)?.[0]).toLowerCase();
    expect(sql).toContain('on conflict (user_id, plugin_id) do update');
    expect(sql).toContain('enabled = true');
    expect(sql).toContain('review_required = false');
  });
});

describe('approvePendingPluginPermissions', () => {
  it('is the only way out of review, and only for a row actually in review', async () => {
    const db = database([INSTALLATION_ROW]);
    await approvePendingPluginPermissions(db, 'user-1', 'research-pack');
    const sql = String(db.query.mock.calls[0]?.[0]).toLowerCase();
    expect(sql).toContain('review_required = true');
    expect(sql).toContain('approved_permissions = coalesce(pending_permissions');
    expect(sql).toContain('enabled = true');
  });
});

describe('listPluginPermissionReviews', () => {
  it('reports what the update added over what the member approved', async () => {
    const db = database([
      {
        plugin_id: 'research-pack',
        approved_permissions: ['network'],
        pending_permissions: ['network', 'shell'],
      },
    ]);
    await expect(listPluginPermissionReviews(db, 'user-1')).resolves.toEqual([
      {
        pluginId: 'research-pack',
        approved: ['network'],
        pending: ['network', 'shell'],
        added: ['shell'],
        removed: [],
      },
    ]);
  });
});

describe('setWebPluginEnabled', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('disables an installed plugin', async () => {
    const db = database([{ ...INSTALLATION_ROW, enabled: false }]);

    const installation = await setWebPluginEnabled(db, 'user-1', 'research-pack', false);

    expect(installation?.enabled).toBe(false);
    expect(db.query.mock.calls[0]?.[1]).toEqual(['user-1', 'research-pack', false]);
  });

  it('returns null when the plugin was never installed', async () => {
    const db = database([]);

    const installation = await setWebPluginEnabled(db, 'user-1', 'research-pack', true);

    expect(installation).toBeNull();
  });
});

describe('uninstallWebPlugin', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('deletes the installation and reports success', async () => {
    const db = database([{ plugin_id: 'research-pack' }]);

    await expect(uninstallWebPlugin(db, 'user-1', 'research-pack')).resolves.toBe(true);
    expect(db.query.mock.calls[0]?.[1]).toEqual(['user-1', 'research-pack']);
  });

  it('reports failure when nothing was installed to remove', async () => {
    const db = database([]);

    await expect(uninstallWebPlugin(db, 'user-1', 'research-pack')).resolves.toBe(false);
  });
});

describe('listEnabledPluginIds', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('reflects the full install -> enable -> uninstall lifecycle', async () => {
    const db = database([{ plugin_id: 'research-pack' }]);
    await expect(listEnabledPluginIds(db, 'user-1')).resolves.toEqual(new Set(['research-pack']));

    db.query.mockResolvedValueOnce([]);
    await expect(listEnabledPluginIds(db, 'user-1')).resolves.toEqual(new Set());
  });

  it('only joins against published, web-installable registry rows', async () => {
    const db = database([]);
    await listEnabledPluginIds(db, 'user-1');
    const sql = String(db.query.mock.calls[0]?.[0]).toLowerCase();
    expect(sql).toContain("registry.status = 'published'");
    expect(sql).toContain('registry.web_installable = true');
  });

  it('drops an installation pinned to a version an admin suspended', async () => {
    const db = database([]);
    await listEnabledPluginIds(db, 'user-1');
    const sql = String(db.query.mock.calls[0]?.[0]).toLowerCase();
    expect(sql).toContain('plugin_registry_versions');
    expect(sql).toContain("coalesce(pinned.status, 'published') <> 'suspended'");
  });
});

describe('a registered marketplace can never enable a first-party pack', () => {
  it('ignores an own-marketplace install entirely when listing enabled packs', async () => {
    const db = database([]);
    db.query.mockResolvedValueOnce([{ plugin_id: 'engineering-pack' }]);

    await expect(listEnabledPluginIds(db, 'user-1')).resolves.toEqual(
      new Set(['engineering-pack']),
    );
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('reads only plugin_installations, never a marketplace table', async () => {
    const db = database([]);
    await listEnabledPluginIds(db, 'user-1');
    const sql = String(db.query.mock.calls[0]?.[0]).toLowerCase();
    expect(sql).toContain('public.plugin_installations');
    expect(sql).not.toContain('plugin_marketplace_installations');
    expect(sql).not.toContain('plugin_marketplace_sources');
  });
});

describe('getPluginInstallationSettings', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('returns null when the plugin is not installed', async () => {
    const db = database([]);
    await expect(
      getPluginInstallationSettings(db, 'user-1', 'engineering-pack'),
    ).resolves.toBeNull();
  });

  it('reports each required connector alongside its connect state', async () => {
    const db = database([]);
    db.query
      .mockResolvedValueOnce([
        {
          plugin_id: 'engineering-pack',
          enabled_skills: ['code-review'],
          custom_example_prompts: [],
          declared_skills: ['code-review', 'systematic-debugging'],
          required_connectors: ['github'],
          example_prompts: ['Review this pull request.'],
        },
      ])
      .mockResolvedValueOnce([{ connector_id: 'github' }]);

    const settings = await getPluginInstallationSettings(db, 'user-1', 'engineering-pack');

    expect(settings).toEqual({
      pluginId: 'engineering-pack',
      enabledSkills: ['code-review'],
      examplePrompts: ['Review this pull request.'],
      connectors: [{ connectorId: 'github', connected: true }],
      agents: [],
    });
  });

  it('prefers a custom example prompt override over the plugin defaults', async () => {
    const db = database([]);
    db.query
      .mockResolvedValueOnce([
        {
          plugin_id: 'writing-pack',
          enabled_skills: [],
          custom_example_prompts: ['Draft a memo about the launch.'],
          declared_skills: [],
          required_connectors: [],
          example_prompts: ['Draft a project brief.'],
        },
      ])
      .mockResolvedValueOnce([]);

    const settings = await getPluginInstallationSettings(db, 'user-1', 'writing-pack');
    expect(settings?.examplePrompts).toEqual(['Draft a memo about the launch.']);
  });
});

describe('updatePluginInstallationSettings', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('keeps only the skills the plugin actually declares', async () => {
    const db = database([]);
    db.query
      .mockResolvedValueOnce([{ declared_skills: ['code-review', 'systematic-debugging'] }])
      .mockResolvedValueOnce([
        {
          plugin_id: 'engineering-pack',
          enabled_skills: ['code-review'],
          custom_example_prompts: [],
          declared_skills: ['code-review', 'systematic-debugging'],
          required_connectors: [],
          example_prompts: [],
        },
      ])
      .mockResolvedValueOnce([]);

    await updatePluginInstallationSettings(db, 'user-1', 'engineering-pack', {
      enabledSkills: ['code-review', 'not-a-declared-skill'],
    });

    const params = db.execute.mock.calls[0]?.[1] as unknown[];
    expect(params?.[2]).toBe(JSON.stringify(['code-review']));
  });

  it('clears a custom example prompt override back to defaults with null', async () => {
    const db = database([]);
    db.query
      .mockResolvedValueOnce([{ declared_skills: [] }])
      .mockResolvedValueOnce([
        {
          plugin_id: 'writing-pack',
          enabled_skills: [],
          custom_example_prompts: [],
          declared_skills: [],
          required_connectors: [],
          example_prompts: ['Draft a project brief.'],
        },
      ])
      .mockResolvedValueOnce([]);

    await updatePluginInstallationSettings(db, 'user-1', 'writing-pack', {
      customExamplePrompts: null,
    });

    const params = db.execute.mock.calls[0]?.[1] as unknown[];
    expect(params?.[2]).toBeNull();
  });
});
