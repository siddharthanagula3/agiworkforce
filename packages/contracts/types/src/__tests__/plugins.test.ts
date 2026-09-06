import { describe, expect, it } from 'vitest';

import {
  PLUGIN_CAPABILITIES,
  PLUGIN_MCP_TRANSPORTS,
  PLUGIN_PUBLISHER_KINDS,
  PLUGIN_REGISTRY_STATUSES,
  PLUGIN_SOURCE_KINDS,
  isPluginCapability,
  isPluginEntryInstallable,
  isPluginId,
  isPluginManifest,
  isPluginMcpTransport,
  isPluginRegistryStatus,
  isPluginSemver,
  isPluginSha256,
  isPluginSourceKind,
  type PluginManifest,
  type PluginRegistryEntry,
} from '../plugins';

const DIGEST = 'a'.repeat(64);

function entry(overrides: Partial<PluginRegistryEntry> = {}): PluginRegistryEntry {
  return {
    id: 'github-automation',
    name: 'GitHub Automation',
    version: '1.0.0',
    description: 'Automate pull request reviews.',
    category: 'Developer',
    publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
    source: 'builtin',
    status: 'preview',
    webInstallable: false,
    declaredSkills: ['Code Review'],
    requiredConnectors: ['github'],
    capabilities: ['mcp'],
    permissions: [],
    examplePrompts: [],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    homepageUrl: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('plugin registry enums', () => {
  it('enumerates every lifecycle status', () => {
    expect(PLUGIN_REGISTRY_STATUSES).toEqual(['preview', 'published', 'deprecated']);
    for (const status of PLUGIN_REGISTRY_STATUSES) {
      expect(isPluginRegistryStatus(status)).toBe(true);
    }
  });

  it('rejects unknown, empty, and non-string statuses', () => {
    for (const value of ['installed', '', null, undefined, 3, {}]) {
      expect(isPluginRegistryStatus(value)).toBe(false);
    }
  });

  it('names the three publisher kinds the directory shows', () => {
    expect(PLUGIN_PUBLISHER_KINDS).toEqual(['first-party', 'third-party', 'partner']);
  });

  it('enumerates the source kinds the plugin lists already display', () => {
    expect(PLUGIN_SOURCE_KINDS).toEqual(['builtin', 'marketplace', 'custom']);
    expect(isPluginSourceKind('marketplace')).toBe(true);
    expect(isPluginSourceKind('hosted')).toBe(false);
  });

  it('enumerates only the MCP transports the CLI loader can run', () => {
    expect(PLUGIN_MCP_TRANSPORTS).toEqual(['stdio', 'http', 'sse']);
    expect(isPluginMcpTransport('websocket')).toBe(false);
  });

  it('enumerates declared capabilities', () => {
    expect(PLUGIN_CAPABILITIES).toContain('filesystem-write');
    expect(isPluginCapability('shell')).toBe(true);
    expect(isPluginCapability('root')).toBe(false);
  });
});

describe('isPluginSemver', () => {
  it('accepts strict semantic versions including prerelease and build', () => {
    for (const version of ['0.0.1', '1.2.3', '1.0.0-beta.1', '1.0.0+build.5', '10.20.30']) {
      expect(isPluginSemver(version)).toBe(true);
    }
  });

  it('rejects loose or unorderable versions', () => {
    for (const version of ['latest', '1', '1.2', 'v1.2.3', '01.2.3', '', 1.2, null]) {
      expect(isPluginSemver(version)).toBe(false);
    }
  });
});

describe('isPluginSha256', () => {
  it('accepts a lowercase 64-char hex digest', () => {
    expect(isPluginSha256(DIGEST)).toBe(true);
  });

  it('rejects uppercase, prefixed, truncated, and non-string digests', () => {
    for (const value of ['A'.repeat(64), `sha256:${DIGEST}`, 'a'.repeat(63), '', null]) {
      expect(isPluginSha256(value)).toBe(false);
    }
  });
});

describe('isPluginId', () => {
  it('accepts ids that are safe as URL segments and install directory names', () => {
    for (const id of ['github-automation', 'a', 'pack.v2', 'pack_2']) {
      expect(isPluginId(id)).toBe(true);
    }
  });

  it('rejects traversal, separators, uppercase, and oversized ids', () => {
    for (const id of ['../evil', 'a/b', '.hidden', '-lead', 'Upper', '', 'a'.repeat(129), 7]) {
      expect(isPluginId(id)).toBe(false);
    }
  });
});

describe('isPluginManifest', () => {
  const manifest: PluginManifest = {
    name: 'github-automation',
    version: '1.0.0',
    commands: ['commands/review.md'],
    mcpServers: { gh: { transport: 'stdio', command: 'gh-mcp', args: [] } },
  };

  it('accepts a manifest the CLI loader would accept', () => {
    expect(isPluginManifest(manifest)).toBe(true);
  });

  it('tolerates unknown keys because the CLI preserves them via serde flatten', () => {
    expect(isPluginManifest({ ...manifest, marketplace: 'agi', extraThing: { a: 1 } })).toBe(true);
  });

  it('requires a non-empty name', () => {
    expect(isPluginManifest({ version: '1.0.0' })).toBe(false);
    expect(isPluginManifest({ name: '   ' })).toBe(false);
  });

  it('rejects a loose version, non-string path arrays, and bad transports', () => {
    expect(isPluginManifest({ name: 'p', version: 'latest' })).toBe(false);
    expect(isPluginManifest({ name: 'p', commands: ['ok', 3] })).toBe(false);
    expect(isPluginManifest({ name: 'p', skills: 'skills/SKILL.md' })).toBe(false);
    expect(isPluginManifest({ name: 'p', mcpServers: { s: { transport: 'grpc' } } })).toBe(false);
    expect(isPluginManifest({ name: 'p', mcpServers: { s: null } })).toBe(false);
  });

  it('rejects non-objects', () => {
    for (const value of [null, undefined, 'name', [], 7]) {
      expect(isPluginManifest(value)).toBe(false);
    }
  });
});

describe('isPluginEntryInstallable', () => {
  it('is false for a preview entry with no artifact', () => {
    expect(isPluginEntryInstallable(entry())).toBe(false);
  });

  it('is false when a row claims published but carries no distribution', () => {
    expect(isPluginEntryInstallable(entry({ status: 'published' }))).toBe(false);
  });

  it('is true only when published AND distributable', () => {
    expect(
      isPluginEntryInstallable(
        entry({
          status: 'published',
          distribution: { manifestUrl: 'https://example.com/p.json', sha256: DIGEST },
        }),
      ),
    ).toBe(true);
  });

  it('is false for a deprecated entry even with a live artifact', () => {
    expect(
      isPluginEntryInstallable(
        entry({
          status: 'deprecated',
          distribution: { manifestUrl: 'https://example.com/p.json', sha256: DIGEST },
        }),
      ),
    ).toBe(false);
  });
});

describe('registry entry shape', () => {
  it('models no download, rating, or install count', () => {
    const keys = Object.keys(entry());
    for (const forbidden of ['downloadCount', 'downloads', 'installs', 'rating', 'stars']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('carries unpopulated signature placeholders so signing can land without a break', () => {
    const integrity = entry().integrity;
    expect(integrity.signature).toBeNull();
    expect(integrity.signatureAlgorithm).toBeNull();
  });
});
