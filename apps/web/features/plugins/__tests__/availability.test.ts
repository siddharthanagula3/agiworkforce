import { describe, expect, it } from 'vitest';
import type { PluginRegistryEntry } from '@agiworkforce/types';
import {
  AVAILABLE_NOW_LABEL,
  SURFACE_STATUS,
  cliAvailabilityNote,
  type SurfaceStatusMap,
} from '@/lib/surface-status';
import { PLUGIN_STATE_DESKTOP_AND_CLI } from '@/features/directory/constants';
import { pluginAvailabilityClaim, pluginCliInstallNote, pluginStatusLabel } from '../availability';

const RELEASED_CLI: SurfaceStatusMap = { ...SURFACE_STATUS, cli: AVAILABLE_NOW_LABEL };
const MAPS = [
  ['the real registry', SURFACE_STATUS],
  ['a simulated released CLI', RELEASED_CLI],
] as const;

function entry(overrides: Partial<PluginRegistryEntry> = {}): PluginRegistryEntry {
  return {
    id: 'github-automation',
    name: 'GitHub Automation',
    version: '1.0.0',
    description: 'Automate pull request reviews.',
    category: 'Developer',
    publisher: { id: 'agi', name: 'AGI', kind: 'first-party' },
    source: 'builtin',
    status: 'preview',
    webInstallable: false,
    declaredSkills: [],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: [],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const webPack = (id: string) => entry({ id, status: 'published', webInstallable: true });
const cliPack = (id: string) =>
  entry({
    id,
    status: 'published',
    distribution: { manifestUrl: 'https://example.com/plugin.json', sha256: null },
  });
const declaredPack = (id: string) => entry({ id });

const ok = (entries: PluginRegistryEntry[]) => ({ status: 'ok' as const, entries });

const WEB_TAIL = 'from the plugins section of Settings.';

describe('pluginAvailabilityClaim', () => {
  it.each(MAPS)('keeps the unavailable, empty and declared-only sentences under %s', (_, map) => {
    expect(pluginAvailabilityClaim({ status: 'unavailable' }, map)).toBe(
      'The registry is unreachable right now, so this page cannot say which packs are installable.',
    );
    expect(pluginAvailabilityClaim(ok([]), map)).toBe('The registry holds no packs yet.');
    expect(pluginAvailabilityClaim(ok([declaredPack('a')]), map)).toBe(
      'No pack is installable in this environment yet.',
    );
  });

  it.each(MAPS)('states an all-web registry in web terms under %s', (_, map) => {
    expect(pluginAvailabilityClaim(ok([webPack('a')]), map)).toBe(
      `The 1 pack in the registry installs on the web, ${WEB_TAIL}`,
    );
    expect(pluginAvailabilityClaim(ok([webPack('a'), webPack('b'), webPack('c')]), map)).toBe(
      `All 3 packs in the registry install on the web, ${WEB_TAIL}`,
    );
  });

  it.each(MAPS)(
    'counts web packs against the rows read and names the remainder under %s',
    (_, map) => {
      expect(pluginAvailabilityClaim(ok([webPack('a'), declaredPack('b')]), map)).toBe(
        `1 of 2 packs install on the web, ${WEB_TAIL} The other one is declared and not yet published.`,
      );
      expect(
        pluginAvailabilityClaim(
          ok([webPack('a'), declaredPack('b'), declaredPack('c'), declaredPack('d')]),
          map,
        ),
      ).toBe(
        `1 of 4 packs install on the web, ${WEB_TAIL} The other 3 are declared and not yet published.`,
      );
    },
  );

  it('puts CLI-published packs in their own sentence with the registry status word', () => {
    const entries = [webPack('a'), cliPack('b'), declaredPack('c')];
    expect(pluginAvailabilityClaim(ok(entries), SURFACE_STATUS)).toBe(
      `1 of 3 packs install on the web, ${WEB_TAIL} 1 more is published for the CLI, which is coming soon. The other one is declared and not yet published.`,
    );
    expect(pluginAvailabilityClaim(ok(entries), RELEASED_CLI)).toBe(
      `1 of 3 packs install on the web, ${WEB_TAIL} 1 more is published for the CLI. The other one is declared and not yet published.`,
    );
  });

  it('says no pack installs on the web when only the CLI has one', () => {
    const entries = [cliPack('a'), cliPack('b'), declaredPack('c')];
    expect(pluginAvailabilityClaim(ok(entries), SURFACE_STATUS)).toBe(
      'No pack installs on the web yet. 2 are published for the CLI, which is coming soon. The other one is declared and not yet published.',
    );
    expect(pluginAvailabilityClaim(ok([cliPack('a')]), RELEASED_CLI)).toBe(
      'No pack installs on the web yet. 1 is published for the CLI.',
    );
  });

  it.each(MAPS)('does not call deprecated, suspended or draft rows declared under %s', (_, map) => {
    expect(
      pluginAvailabilityClaim(ok([webPack('a'), entry({ id: 'b', status: 'deprecated' })]), map),
    ).toBe(`1 of 2 packs install on the web, ${WEB_TAIL} The other one is not installable.`);
    expect(
      pluginAvailabilityClaim(
        ok([
          webPack('a'),
          entry({ id: 'b', status: 'suspended' }),
          entry({ id: 'c', status: 'draft' }),
          declaredPack('d'),
        ]),
        map,
      ),
    ).toBe(`1 of 4 packs install on the web, ${WEB_TAIL} The other 3 are not installable.`);
  });

  it.each(MAPS)('never says installable today and always names the web under %s', (_, map) => {
    const catalogs = [
      ok([webPack('a'), cliPack('b'), declaredPack('c')]),
      ok([cliPack('a')]),
      ok([webPack('a'), webPack('b')]),
      ok([webPack('a'), entry({ id: 'b', status: 'suspended' })]),
    ];
    for (const catalog of catalogs) {
      const claim = pluginAvailabilityClaim(catalog, map);
      expect(claim).not.toMatch(/installable today/i);
      const clauses = claim.split(/[.;()]\s*/).filter(Boolean);
      for (const clause of clauses) {
        if (/\binstalls? on\b/.test(clause)) expect(clause).toMatch(/\bthe web\b/);
        if (/\b(CLI|Desktop)\b/.test(clause) && !map.cli.includes('Available')) {
          expect(clause).not.toMatch(/\b(today|released|available now)\b/i);
        }
      }
    }
  });
});

describe('pluginStatusLabel', () => {
  it('labels web-installable and CLI-published packs by surface', () => {
    expect(pluginStatusLabel(webPack('a'))).toBe('Available on Web');
    expect(pluginStatusLabel(cliPack('a'))).toBe('Published for the CLI');
    expect(pluginStatusLabel(cliPack('a'), { statuses: RELEASED_CLI })).toBe(
      'Installable from the CLI',
    );
  });

  it('never returns the bare word Installable', () => {
    const entries = [
      webPack('a'),
      cliPack('b'),
      declaredPack('c'),
      entry({ status: 'deprecated' }),
      entry({ status: 'suspended' }),
      entry({ status: 'draft' }),
      entry({ status: 'in_review' }),
    ];
    for (const [, map] of MAPS) {
      for (const e of entries) {
        expect(pluginStatusLabel(e, { statuses: map })).not.toBe('Installable');
      }
    }
  });

  it('labels every non-installable status', () => {
    expect(pluginStatusLabel(declaredPack('a'))).toBe('Declared: not installable yet');
    expect(pluginStatusLabel(entry({ status: 'deprecated' }))).toBe('Deprecated: do not install');
    expect(pluginStatusLabel(entry({ status: 'suspended' }))).toBe('Suspended: installs stopped');
    expect(pluginStatusLabel(entry({ status: 'draft' }))).toBe('Not offered yet');
    expect(pluginStatusLabel(entry({ status: 'in_review' }))).toBe('Not offered yet');
  });

  it('uses the desktop and CLI label for a declared pack that has a CLI command', () => {
    expect(pluginStatusLabel(declaredPack('a'), { cliCommand: 'agi plugin install a' })).toBe(
      PLUGIN_STATE_DESKTOP_AND_CLI,
    );
    expect(
      pluginStatusLabel(entry({ status: 'suspended' }), { cliCommand: 'agi plugin install a' }),
    ).toBe('Suspended: installs stopped');
  });
});

describe('pluginCliInstallNote', () => {
  it('carries the registry availability note while the CLI is unreleased', () => {
    const note = pluginCliInstallNote();
    expect(note).toContain(cliAvailabilityNote());
    expect(note).toBe('The command below is for the AGI CLI. The CLI is coming soon.');
  });

  it('drops the status clause once the registry releases the CLI', () => {
    const note = pluginCliInstallNote(RELEASED_CLI);
    expect(note).toBe('Install it with the AGI CLI, using the command below.');
    expect(note).not.toMatch(/coming soon/i);
  });
});
