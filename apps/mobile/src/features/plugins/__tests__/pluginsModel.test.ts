import {
  pluginPermissionsToAcknowledge,
  type PluginDirectoryEntryWire,
  type PluginInstallationWire,
} from '@agiworkforce/cloud-contracts';
import {
  PLUGIN_PERMISSIONS_COPY,
  addedPluginRows,
  addedPluginsCountLabel,
  indexInstallations,
  installedTilePlan,
  pluginTileLetter,
  pluginInstallPermissionsMessage,
  pluginCategories,
  pluginCompatibility,
  pluginIncludes,
  pluginRowControl,
  pluginShelfCategories,
  pluginStateLabel,
  pluginWorksWith,
  popularPlugins,
  recommendedPlugins,
  versionMoveSummary,
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

  it('lists the verified, installable plugins people install most, installed ones included', () => {
    expect(popularPlugins(entries).map((entry) => entry.id)).toEqual(['installed', 'b', 'a']);
  });

  it('shows at most six popular plugins, most installed first', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      pluginEntry({ id: `p${index}`, name: `P${index}`, installs: index + 1 }),
    );
    expect(popularPlugins(many).map((entry) => entry.id)).toEqual([
      'p8',
      'p7',
      'p6',
      'p5',
      'p4',
      'p3',
    ]);
  });

  it('picks the row control from the install state and what the phone can install', () => {
    expect(pluginRowControl(entries[0]!, undefined)).toBe('install');
    expect(pluginRowControl(entries[0]!, INSTALLATION)).toBe('more');
    expect(pluginRowControl(entries[4]!, undefined)).toBe('none');
    expect(pluginRowControl(pluginEntry({ status: 'preview' }), undefined)).toBe('none');
  });

  it('lists each permission under the permissions explanation', () => {
    expect(pluginInstallPermissionsMessage(['read mail', 'send mail'])).toBe(
      `${PLUGIN_PERMISSIONS_COPY}\n\n• read mail\n• send mail`,
    );
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
    expect(pluginCompatibility(pluginEntry({ webInstallable: false }))).toEqual({
      installable: false,
      warning: 'Runs in the Desktop app and the CLI. Cloud chats on this device cannot load it.',
    });
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
    expect(pluginCategories(entries, { design: 2 })).toEqual([
      { key: 'design', value: 'design', label: 'Design' },
      { key: 'productivity', value: 'Productivity', label: 'Productivity' },
    ]);
  });

  it('groups categories that differ only in case into one option', () => {
    const mixed = [
      pluginEntry({ id: 'a', category: 'Developer' }),
      pluginEntry({ id: 'b', category: 'developer' }),
      pluginEntry({ id: 'c', category: ' DEVELOPER ' }),
      pluginEntry({ id: 'd', category: 'data-analysis' }),
    ];
    expect(pluginCategories(mixed, { developer: 3, 'data-analysis': 1 })).toEqual([
      { key: 'data-analysis', value: 'data-analysis', label: 'Data analysis' },
      { key: 'developer', value: 'Developer', label: 'Developer' },
    ]);
  });

  it('picks the three largest categories that have at least three plugins for shelves', () => {
    expect(
      pluginShelfCategories({
        finance: 5,
        developer: 4,
        design: 3,
        writing: 2,
        'data-analysis': 9,
      }),
    ).toEqual([
      { key: 'data-analysis', value: 'data-analysis', label: 'Data analysis' },
      { key: 'finance', value: 'finance', label: 'Finance' },
      { key: 'developer', value: 'developer', label: 'Developer' },
    ]);
  });

  it('breaks shelf ties by label and skips blank or small categories', () => {
    expect(pluginShelfCategories({ b: 3, a: 3, ' ': 8, c: 2 }).map((option) => option.key)).toEqual(
      ['a', 'b'],
    );
    expect(pluginShelfCategories(undefined)).toEqual([]);
    expect(pluginShelfCategories({ finance: 2 })).toEqual([]);
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

  it('names the permissions a chosen version adds, and none when it adds none', () => {
    expect(versionMoveSummary('3.0.0', '2.0.0', ['send mail', 'read files'])).toBe(
      'Moves from 3.0.0 to 2.0.0. It also asks for: send mail, read files.',
    );
    expect(versionMoveSummary('3.0.0', '2.0.0', [])).toBe('Moves from 3.0.0 to 2.0.0.');
  });

  it('builds the directory query the web route validates', () => {
    expect(pluginDirectoryHref({})).toBe('/api/plugins');
    expect(
      pluginDirectoryHref({ search: ' mail ', category: 'Sales', sort: 'name', source: 'partner' }),
    ).toBe('/api/plugins?search=mail&category=Sales&source=partner&sort=name');
  });

  describe('installed tiles and the Added list', () => {
    const at = (pluginId: string, installedAt: string, enabled = true): PluginInstallationWire => ({
      pluginId,
      installedVersion: '1.0.0',
      enabled,
      installedAt,
      updatedAt: installedAt,
    });

    it('puts the five newest installations first and counts the rest', () => {
      const plan = installedTilePlan(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, index) =>
          at(id, `2026-10-0${index + 1}T00:00:00.000Z`),
        ),
      );
      expect(plan.tiles.map((tile) => tile.pluginId)).toEqual(['g', 'f', 'e', 'd', 'c']);
      expect(plan.overflow).toBe(2);
    });

    it('has no overflow at the limit and sorts a bad date last', () => {
      const plan = installedTilePlan([
        at('old', 'not a date'),
        at('new', '2026-10-02T00:00:00.000Z'),
      ]);
      expect(plan.tiles.map((tile) => tile.pluginId)).toEqual(['new', 'old']);
      expect(plan.overflow).toBe(0);
      expect(installedTilePlan([])).toEqual({ tiles: [], overflow: 0 });
    });

    it('takes the first letter of the name, as a capital', () => {
      expect(pluginTileLetter('docs kit')).toBe('D');
      expect(pluginTileLetter('  Mail')).toBe('M');
      expect(pluginTileLetter('')).toBe('?');
    });

    it('sorts the rows A to Z regardless of case, names Turned off and failed rows, and filters', () => {
      const installations = [
        at('zeta', '2026-10-01T00:00:00.000Z'),
        at('alpha', '2026-10-01T00:00:00.000Z', false),
        at('broken', '2026-10-01T00:00:00.000Z'),
        at('mid', '2026-10-01T00:00:00.000Z'),
      ];
      const details = new Map([
        [
          'zeta',
          { status: 'loaded' as const, entry: pluginEntry({ id: 'zeta', name: 'Zeta kit' }) },
        ],
        [
          'alpha',
          { status: 'loaded' as const, entry: pluginEntry({ id: 'alpha', name: 'alpha kit' }) },
        ],
        ['mid', { status: 'loaded' as const, entry: pluginEntry({ id: 'mid', name: 'Mid kit' }) }],
        ['broken', { status: 'failed' as const }],
      ]);
      expect(addedPluginRows(installations, details)).toEqual([
        { id: 'alpha', name: 'alpha kit', meta: 'Turned off' },
        { id: 'broken', name: 'broken', meta: 'Could not load' },
        { id: 'mid', name: 'Mid kit', meta: null },
        { id: 'zeta', name: 'Zeta kit', meta: null },
      ]);
      expect(addedPluginRows(installations, details, ' KIT ').map((row) => row.id)).toEqual([
        'alpha',
        'mid',
        'zeta',
      ]);
    });

    it('writes the count only when something is added', () => {
      expect(addedPluginsCountLabel(0)).toBeNull();
      expect(addedPluginsCountLabel(28)).toBe('28 added');
    });
  });
});
