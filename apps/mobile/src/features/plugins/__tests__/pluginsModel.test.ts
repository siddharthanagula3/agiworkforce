import {
  pluginPermissionsToAcknowledge,
  type PluginDirectoryEntryWire,
  type PluginInstallationWire,
} from '@agiworkforce/cloud-contracts';
import {
  featuredPlugins,
  indexInstallations,
  pluginCategories,
  pluginCompatibility,
  pluginIncludes,
  pluginStateLabel,
  pluginWorksWith,
  recommendedPlugins,
  versionSwitchSummary,
} from '../pluginsModel';
import { pluginDirectoryHref } from '../service';

function pluginEntry(overrides: Partial<PluginDirectoryEntryWire>): PluginDirectoryEntryWire {
  return {
    id: 'plugin',
    name: 'Plugin',
    version: '1.0.0',
    description: 'Does a thing',
    category: 'Productivity',
    publisher: { id: 'agi', name: 'AGI Workforce', kind: 'first-party' },
    status: 'published',
    webInstallable: true,
    declaredSkills: [],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: [],
    verified: true,
    installs: 10,
    worksWith: ['web'],
    ...overrides,
  };
}

const INSTALLATION: PluginInstallationWire = {
  pluginId: 'installed',
  installedVersion: '1.0.0',
  enabled: false,
  installedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('plugins model', () => {
  const entries = [
    pluginEntry({ id: 'a', name: 'Alpha', installs: 5 }),
    pluginEntry({ id: 'b', name: 'Beta', installs: 50 }),
    pluginEntry({ id: 'installed', name: 'Mine', installs: 99 }),
    pluginEntry({ id: 'unverified', name: 'Wild', verified: false, installs: 500 }),
    pluginEntry({ id: 'desktop', name: 'Desk', webInstallable: false, installs: 400 }),
    pluginEntry({ id: 'mail', name: 'Mail', installs: 0, requiredConnectors: ['gmail'] }),
  ];
  const installed = indexInstallations([INSTALLATION]);

  it('features verified, installable plugins people install, most installed first', () => {
    expect(featuredPlugins(entries, installed).map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('recommends plugins that use a connector the person already connected', () => {
    expect(
      recommendedPlugins(entries, installed, new Set(['gmail']), new Set()).map(
        (entry) => entry.id,
      ),
    ).toEqual(['mail']);
    expect(recommendedPlugins(entries, installed, new Set(), new Set())).toEqual([]);
  });

  it('explains why a plugin cannot install on mobile', () => {
    expect(pluginCompatibility(pluginEntry({})).installable).toBe(true);
    expect(pluginCompatibility(pluginEntry({ webInstallable: false })).warning).toMatch(/Desktop/);
    expect(pluginCompatibility(pluginEntry({ status: 'preview' }))).toEqual({
      installable: false,
      warning: 'Coming later. This plugin is not published yet.',
    });
  });

  it('labels install state and works-with surfaces', () => {
    expect(pluginStateLabel(entries[2]!, INSTALLATION)).toBe('Turned off');
    expect(pluginStateLabel(entries[4]!, undefined)).toBe('Desktop and CLI');
    expect(pluginWorksWith(pluginEntry({ worksWith: ['web', 'claude-code'] }))).toEqual([
      'Web',
      'CLI',
    ]);
  });

  it('merges declared and inspected skills into one includes list', () => {
    const entry = pluginEntry({
      declaredSkills: ['triage'],
      runtime: {
        webInstallable: true,
        inspected: true,
        note: null,
        components: {
          skills: ['triage', 'reply'],
          commands: 2,
          agents: ['helper'],
          hooks: false,
          mcpServers: [{ name: 'mail', transport: 'http' }],
          lspServers: [],
        },
      },
    });
    expect(pluginIncludes(entry)).toEqual({
      skills: ['triage', 'reply'],
      agents: ['helper'],
      commands: 2,
      mcpServers: ['mail'],
      hooks: false,
    });
  });

  it('lists categories from stats and entries', () => {
    expect(pluginCategories(entries, { Design: 2 })).toEqual(['Design', 'Productivity']);
  });

  it('acknowledges only the permissions a version adds', () => {
    expect(
      pluginPermissionsToAcknowledge(
        {
          installedVersion: '1.0.0',
          approvedPermissions: ['read mail'],
          versions: [
            {
              version: '2.0.0',
              publishedAt: null,
              changelog: '',
              permissions: ['read mail', 'send mail'],
              declaredSkills: [],
            },
          ],
        },
        '2.0.0',
      ),
    ).toEqual(['send mail']);
  });

  it('summarises what an update changes', () => {
    expect(
      versionSwitchSummary({
        pluginId: 'a',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        installedVersionStopped: false,
        diff: {
          pluginId: 'a',
          from: '1.0.0',
          to: '1.1.0',
          changelog: '',
          addedSkills: ['reply'],
          removedSkills: [],
          addedPermissions: ['send mail'],
          removedPermissions: [],
          requiresPermissionReview: true,
        },
      }),
    ).toBe('Moves from 1.0.0 to 1.1.0. It also asks for: send mail. It adds these skills: reply.');
  });

  it('builds the directory query the web route validates', () => {
    expect(pluginDirectoryHref({})).toBe('/api/plugins');
    expect(
      pluginDirectoryHref({ search: ' mail ', category: 'Sales', sort: 'name', source: 'partner' }),
    ).toBe('/api/plugins?search=mail&category=Sales&source=partner&sort=name');
  });
});
