import { describe, expect, it } from 'vitest';

import {
  RUNTIME_NOTE_COWORK_ONLY,
  RUNTIME_NOTE_NOT_INSPECTED,
  RUNTIME_NOTE_SOURCE_UNKNOWN,
} from '../constants';
import {
  displayVersion,
  installedVersion,
  marketplaceDirectoryEntry,
  neutralizeCopy,
  parseInstallCommandTarget,
  publicOnlyDirectoryEntry,
  publisherFor,
  shaFromInstalledVersion,
  slugify,
  vendorHomepage,
} from '../entries';
import { EMPTY_COMPONENTS, inspectionKey } from '../inspection';
import type { PluginInspectionRecord } from '../types';
import { fetchedMarketplace, LOCATION, SHA } from './fixtures';

const NOW = '2026-09-06T10:00:00.000Z';
const FIRST_SEEN = '2026-09-01T00:00:00.000Z';

const PLUGIN = {
  name: 'adobe-for-creativity',
  description: 'Adobe tools.',
  author: { name: 'Adobe', url: 'https://adobe.com' },
  category: 'design',
  homepage: 'https://github.com/adobe/skills/tree/main/plugins/creative-cloud/adobe-for-creativity',
  source: {
    source: 'git-subdir',
    url: 'https://github.com/adobe/skills.git',
    path: LOCATION.path!,
    ref: 'main',
    sha: SHA,
  },
};

const INSPECTION: PluginInspectionRecord = {
  key: inspectionKey(LOCATION),
  treeSha: SHA,
  inspectedAt: NOW,
  version: '1.4.0',
  description: 'From plugin.json',
  components: {
    ...EMPTY_COMPONENTS,
    skills: ['background-removal'],
    skillPaths: ['skills/background-removal/SKILL.md'],
    mcpServers: [{ name: 'adobe', transport: 'http' }],
  },
};

const CARD = {
  slug: 'adobe-for-creativity',
  name: 'Adobe for Creativity',
  description: 'Public card copy.',
  verified: true,
  installs: 1200,
  worksWith: ['claude-code' as const],
};

describe('version helpers', () => {
  it('prefers a declared semver, otherwise pins the short sha onto the fallback', () => {
    expect(displayVersion('1.2.3', SHA)).toBe('1.2.3');
    expect(displayVersion('v1', SHA)).toBe('0.0.0+sha.1307e2c');
    expect(displayVersion(null, null)).toBe('0.0.0');
  });

  it('round-trips the full sha through the installed version build metadata', () => {
    const pinned = installedVersion('0.0.0+sha.1307e2c', SHA);
    expect(pinned).toBe(`0.0.0+sha.${SHA}`);
    expect(shaFromInstalledVersion(pinned)).toBe(SHA);
    expect(installedVersion('1.4.0', SHA)).toBe(`1.4.0+sha.${SHA}`);
    expect(shaFromInstalledVersion('1.4.0')).toBeNull();
  });

  it('slugifies publisher names and parses install command targets', () => {
    expect(slugify('42Crunch, Inc.')).toBe('42crunch-inc');
    expect(
      parseInstallCommandTarget('claude plugin install superpowers@claude-plugins-official'),
    ).toEqual({
      pluginName: 'superpowers',
      marketplaceName: 'claude-plugins-official',
    });
    expect(parseInstallCommandTarget(null)).toBeNull();
  });
});

describe('marketplaceDirectoryEntry', () => {
  it('builds a verified, web-installable entry from manifest, inspection and card', () => {
    const entry = marketplaceDirectoryEntry({
      plugin: PLUGIN,
      marketplace: fetchedMarketplace([PLUGIN]),
      location: LOCATION,
      inspection: INSPECTION,
      card: CARD,
      firstSeenAt: FIRST_SEEN,
      now: NOW,
    });
    expect(entry).toMatchObject({
      id: 'adobe-for-creativity',
      slug: 'adobe-for-creativity',
      name: 'Adobe for Creativity',
      version: '1.4.0',
      description: 'Adobe tools.',
      category: 'design',
      publisher: { id: 'adobe', name: 'Adobe', kind: 'partner', url: 'https://adobe.com' },
      source: 'marketplace',
      status: 'published',
      webInstallable: true,
      declaredSkills: ['background-removal'],
      capabilities: ['mcp'],
      installCount: 1200,
      createdAt: FIRST_SEEN,
      updatedAt: NOW,
      sourceFacet: 'marketplace',
      verified: true,
      installs: 1200,
      worksWith: ['claude-code', 'web'],
      repositoryUrl: 'https://github.com/adobe/skills',
      installCommand: 'claude plugin install adobe-for-creativity@claude-plugins-official',
      runtime: { webInstallable: true, inspected: true, note: null },
      sourceLocation: LOCATION,
    });
    expect(entry.marketplace).toMatchObject({ name: 'claude-plugins-official' });
  });

  it('carries the inspected tree sha onto a ref-only source and falls back to owner as publisher', () => {
    const plugin = { name: 'agent-sdk-dev', description: 'Kit', source: './plugins/agent-sdk-dev' };
    const location = {
      repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
      ref: 'main',
      sha: null,
      path: 'plugins/agent-sdk-dev',
    };
    const entry = marketplaceDirectoryEntry({
      plugin,
      marketplace: fetchedMarketplace([plugin]),
      location,
      inspection: { ...INSPECTION, key: inspectionKey(location), version: null },
      card: null,
      firstSeenAt: FIRST_SEEN,
      now: NOW,
    });
    expect(entry.sourceLocation?.sha).toBe(SHA);
    expect(entry.version).toBe('0.0.0+sha.1307e2c');
    expect(entry.publisher).toMatchObject({ id: 'anthropic', name: 'Anthropic' });
    expect(entry.installs).toBeNull();
    expect(entry.installCount).toBeUndefined();
    expect(entry.worksWith).toEqual(['claude-code', 'web']);
  });

  it('blocks an uninspected plugin with the not-inspected note and keeps declared skills', () => {
    const entry = marketplaceDirectoryEntry({
      plugin: { ...PLUGIN, skills: ['./skills/vectorize'] },
      marketplace: fetchedMarketplace([PLUGIN]),
      location: LOCATION,
      inspection: null,
      card: null,
      firstSeenAt: FIRST_SEEN,
      now: NOW,
    });
    expect(entry.runtime.note).toBe(RUNTIME_NOTE_NOT_INSPECTED);
    expect(entry.webInstallable).toBe(false);
    expect(entry.declaredSkills).toEqual(['vectorize']);
    expect(entry.worksWith).toEqual(['claude-code']);
  });

  it('blocks a plugin whose source is not a github repository', () => {
    const entry = marketplaceDirectoryEntry({
      plugin: PLUGIN,
      marketplace: fetchedMarketplace([PLUGIN]),
      location: null,
      inspection: null,
      card: null,
      firstSeenAt: FIRST_SEEN,
      now: NOW,
    });
    expect(entry.runtime.note).toBe(RUNTIME_NOTE_SOURCE_UNKNOWN);
    expect(entry.repositoryUrl).toBeNull();
  });
});

describe('publicOnlyDirectoryEntry', () => {
  it('files a Cowork-only listing under the partner facet', () => {
    const entry = publicOnlyDirectoryEntry({
      card: { ...CARD, slug: 'sales', name: 'Sales', worksWith: ['cowork'], installs: null },
      detail: null,
      firstSeenAt: FIRST_SEEN,
      now: NOW,
    });
    expect(entry).toMatchObject({
      id: 'sales',
      sourceFacet: 'partner',
      verified: true,
      worksWith: ['cowork'],
      webInstallable: false,
      installCommand: null,
      marketplace: null,
      homepageUrl: null,
      publisher: { id: 'partner', name: 'Partner', kind: 'partner', url: null },
    });
    expect(entry.runtime.note).toBe(RUNTIME_NOTE_COWORK_ONLY);
    expect(entry.installCount).toBeUndefined();
  });

  it('keeps a Claude Code listing outside the manifest in the marketplace facet with its command', () => {
    const entry = publicOnlyDirectoryEntry({
      card: { ...CARD, slug: 'searchfit-seo' },
      detail: {
        installCommand: 'claude plugin install searchfit-seo@claude-plugins-official',
        repositoryUrl: 'https://github.com/searchfit/seo',
      },
      firstSeenAt: FIRST_SEEN,
      now: NOW,
    });
    expect(entry).toMatchObject({
      sourceFacet: 'marketplace',
      installCommand: 'claude plugin install searchfit-seo@claude-plugins-official',
      repositoryUrl: 'https://github.com/searchfit/seo',
      homepageUrl: 'https://github.com/searchfit/seo',
      installCount: 1200,
      publisher: {
        id: 'searchfit',
        name: 'searchfit',
        kind: 'partner',
        url: 'https://github.com/searchfit/seo',
      },
    });
    expect(entry.marketplace).toMatchObject({
      name: 'claude-plugins-official',
      repositoryUrl: null,
    });
    expect(entry.runtime.note).toBe(RUNTIME_NOTE_SOURCE_UNKNOWN);
  });
});

describe('publisherFor and neutralizeCopy', () => {
  const marketplace = fetchedMarketplace([]);

  it('keeps the marketplace owner as a third party and names vendor authors as partners', () => {
    expect(
      publisherFor({ ...PLUGIN, author: { name: 'Anthropic' } }, marketplace, LOCATION),
    ).toEqual({ id: 'anthropic', name: 'Anthropic', kind: 'third-party', url: null });
    expect(publisherFor(PLUGIN, marketplace, LOCATION)).toMatchObject({
      name: 'Adobe',
      kind: 'partner',
    });
  });

  it('falls back to the repository owner, the external folder or the marketplace owner', () => {
    const noAuthor = { name: 'adlc', description: 'x', source: PLUGIN.source };
    expect(
      publisherFor(noAuthor, marketplace, {
        ...LOCATION,
        repositoryUrl: 'https://github.com/SalesforceAIResearch/adlc',
      }),
    ).toEqual({
      id: 'salesforceairesearch',
      name: 'SalesforceAIResearch',
      kind: 'partner',
      url: 'https://github.com/SalesforceAIResearch/adlc',
    });
    const inMarketplace = {
      repositoryUrl: marketplace.source.repositoryUrl,
      ref: 'main',
      sha: null,
    };
    expect(
      publisherFor(noAuthor, marketplace, { ...inMarketplace, path: 'external_plugins/asana' }),
    ).toEqual({
      id: 'partner',
      name: 'Partner',
      kind: 'partner',
      url: null,
    });
    expect(
      publisherFor(noAuthor, marketplace, { ...inMarketplace, path: 'plugins/agent-sdk-dev' }),
    ).toMatchObject({
      name: 'Anthropic',
      kind: 'third-party',
    });
    expect(publisherFor(noAuthor, marketplace, null)).toMatchObject({ name: 'Partner' });
  });

  it('replaces assistant brand names and dashes in copy', () => {
    const emDash = String.fromCodePoint(0x2014);
    expect(
      neutralizeCopy(`Connects Claude Code to Asana ${emDash} works in Claude Cowork and ChatGPT.`),
    ).toBe('Connects the assistant to Asana, works in the assistant and the assistant.');
    const entry = marketplaceDirectoryEntry({
      plugin: { ...PLUGIN, description: 'Built for Claude Code users.' },
      marketplace,
      location: LOCATION,
      inspection: null,
      card: null,
      firstSeenAt: FIRST_SEEN,
      now: NOW,
    });
    expect(entry.description).toBe('Built for the assistant users.');
    expect(entry.homepageUrl).toBe(PLUGIN.homepage);
  });
});

describe('vendorHomepage', () => {
  it('keeps vendor links and drops links into the public directory host', () => {
    expect(vendorHomepage('https://adobe.com/creative')).toBe('https://adobe.com/creative');
    expect(vendorHomepage('https://claude.com/cwc-makers')).toBeNull();
    expect(vendorHomepage('not a url')).toBeNull();
    expect(vendorHomepage(undefined)).toBeNull();
  });
});
