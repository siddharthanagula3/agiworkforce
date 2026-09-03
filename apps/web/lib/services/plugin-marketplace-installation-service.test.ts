import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getMarketplaceEntryForUserMock } = vi.hoisted(() => ({
  getMarketplaceEntryForUserMock: vi.fn(),
}));
vi.mock('@/lib/services/plugin-marketplace-service', () => ({
  getMarketplaceEntryForUser: getMarketplaceEntryForUserMock,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { PluginMarketplaceEntry } from '@agiworkforce/cloud-contracts';
import {
  getMarketplaceInstallationSettings,
  installMarketplaceEntry,
  listMarketplaceInstallations,
  setMarketplaceInstallationEnabled,
  uninstallMarketplaceEntry,
  updateMarketplaceInstallationSettings,
} from './plugin-marketplace-installation-service';

function database(
  rows: unknown[],
): DatabaseAdapter & { query: ReturnType<typeof vi.fn>; execute: ReturnType<typeof vi.fn> } {
  const db = { query: vi.fn().mockResolvedValue(rows), execute: vi.fn().mockResolvedValue(0) };
  return db as unknown as DatabaseAdapter & {
    query: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
  };
}

function entry(overrides: Partial<PluginMarketplaceEntry> = {}): PluginMarketplaceEntry {
  return {
    id: 'entry-1',
    sourceId: 'source-1',
    pluginKey: 'acme-support-bundle',
    name: 'Acme Support Bundle',
    description: 'Support triage.',
    version: '1.0.0',
    declaredSkills: ['code-review'],
    requiredConnectors: ['github'],
    agents: ['triage-agent'],
    examplePrompts: ['Summarize this ticket.'],
    permissions: [],
    contentHash: 'a'.repeat(64),
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

const INSTALLATION_ROW = {
  id: 'installation-1',
  entry_id: 'entry-1',
  source_id: 'source-1',
  plugin_key: 'acme-support-bundle',
  installed_version: '1.0.0',
  enabled: true,
  enabled_skills: ['code-review'],
  custom_example_prompts: null,
  installed_at: '2026-09-03T00:00:00.000Z',
  updated_at: '2026-09-03T00:00:00.000Z',
};

describe('installMarketplaceEntry', () => {
  beforeEach(() => getMarketplaceEntryForUserMock.mockReset());

  it('installs an entry the user owns through its source', async () => {
    getMarketplaceEntryForUserMock.mockResolvedValue(entry());
    const db = database([]);
    db.query
      .mockResolvedValueOnce([{ id: 'installation-1' }])
      .mockResolvedValueOnce([INSTALLATION_ROW]);

    const installation = await installMarketplaceEntry(db, 'user-1', 'entry-1');

    expect(installation).toEqual({
      id: 'installation-1',
      entryId: 'entry-1',
      sourceId: 'source-1',
      pluginKey: 'acme-support-bundle',
      installedVersion: '1.0.0',
      enabled: true,
      enabledSkills: ['code-review'],
      customExamplePrompts: null,
      installedAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(db.query.mock.calls[0]?.[1]).toEqual([
      'user-1',
      'entry-1',
      '1.0.0',
      JSON.stringify(['code-review']),
    ]);
  });

  it('refuses to install an entry the user does not own', async () => {
    getMarketplaceEntryForUserMock.mockResolvedValue(null);
    const db = database([]);

    const installation = await installMarketplaceEntry(db, 'user-1', 'entry-1');

    expect(installation).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('listMarketplaceInstallations', () => {
  it('maps every installed marketplace entry for the user', async () => {
    const db = database([INSTALLATION_ROW]);
    const installations = await listMarketplaceInstallations(db, 'user-1');
    expect(installations).toHaveLength(1);
    expect(installations[0]?.pluginKey).toBe('acme-support-bundle');
  });
});

describe('setMarketplaceInstallationEnabled', () => {
  it('disables an installation owned by the user', async () => {
    const db = database([{ ...INSTALLATION_ROW, enabled: false }]);
    const installation = await setMarketplaceInstallationEnabled(
      db,
      'user-1',
      'installation-1',
      false,
    );
    expect(installation?.enabled).toBe(false);
    expect(db.execute.mock.calls[0]?.[1]).toEqual(['installation-1', 'user-1', false]);
  });
});

describe('uninstallMarketplaceEntry', () => {
  it('deletes the installation and reports success', async () => {
    const db = database([{ id: 'installation-1' }]);
    await expect(uninstallMarketplaceEntry(db, 'user-1', 'installation-1')).resolves.toBe(true);
  });

  it('reports failure when nothing was installed to remove', async () => {
    const db = database([]);
    await expect(uninstallMarketplaceEntry(db, 'user-1', 'installation-1')).resolves.toBe(false);
  });
});

describe('getMarketplaceInstallationSettings', () => {
  it('returns null when the installation does not belong to the user', async () => {
    const db = database([]);
    await expect(
      getMarketplaceInstallationSettings(db, 'user-1', 'installation-1'),
    ).resolves.toBeNull();
  });

  it('reports declared agents and connector connect state', async () => {
    const db = database([]);
    db.query
      .mockResolvedValueOnce([
        {
          plugin_key: 'acme-support-bundle',
          enabled_skills: ['code-review'],
          custom_example_prompts: null,
          declared_skills: ['code-review'],
          required_connectors: ['github'],
          agents: ['triage-agent'],
          example_prompts: ['Summarize this ticket.'],
        },
      ])
      .mockResolvedValueOnce([{ connector_id: 'github' }]);

    const settings = await getMarketplaceInstallationSettings(db, 'user-1', 'installation-1');

    expect(settings).toEqual({
      pluginId: 'acme-support-bundle',
      enabledSkills: ['code-review'],
      examplePrompts: ['Summarize this ticket.'],
      connectors: [{ connectorId: 'github', connected: true }],
      agents: ['triage-agent'],
    });
  });
});

describe('updateMarketplaceInstallationSettings', () => {
  it('keeps only the skills the entry actually declares', async () => {
    const db = database([]);
    db.query
      .mockResolvedValueOnce([{ declared_skills: ['code-review'] }])
      .mockResolvedValueOnce([
        {
          plugin_key: 'acme-support-bundle',
          enabled_skills: ['code-review'],
          custom_example_prompts: null,
          declared_skills: ['code-review'],
          required_connectors: [],
          agents: [],
          example_prompts: [],
        },
      ])
      .mockResolvedValueOnce([]);

    await updateMarketplaceInstallationSettings(db, 'user-1', 'installation-1', {
      enabledSkills: ['code-review', 'not-declared'],
    });

    const params = db.execute.mock.calls[0]?.[1] as unknown[];
    expect(params?.[2]).toBe(JSON.stringify(['code-review']));
  });

  it('returns null for an installation the user does not own', async () => {
    const db = database([]);
    const result = await updateMarketplaceInstallationSettings(db, 'user-1', 'installation-1', {
      enabledSkills: [],
    });
    expect(result).toBeNull();
    expect(db.execute).not.toHaveBeenCalled();
  });
});
