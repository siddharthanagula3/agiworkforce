import { describe, expect, it, vi } from 'vitest';

import {
  buildMarketplaceManifestUrl,
  ClaudeMarketplaceFetchError,
  fetchClaudeMarketplace,
  isDirectoryMarketplaceRepository,
  marketplaceInstallCommand,
  normalizeRepositoryUrl,
  OFFICIAL_MARKETPLACE_SOURCE,
  parseClaudeMarketplaceManifest,
  parseGithubRepository,
  resolvePluginSource,
} from '../official-marketplace';

const MANIFEST = {
  name: 'claude-plugins-official',
  owner: { name: 'Anthropic' },
  renames: { adlc: 'agentforce-adlc' },
  plugins: [
    {
      name: 'agent-sdk-dev',
      description: 'Development kit',
      source: './plugins/agent-sdk-dev',
      category: 'development',
    },
    {
      name: 'adobe-for-creativity',
      description: 'Adobe tools',
      author: { name: 'Adobe' },
      source: {
        source: 'git-subdir',
        url: 'https://github.com/adobe/skills.git',
        path: 'plugins/creative-cloud/adobe-for-creativity',
        ref: 'main',
        sha: '1307e2c03b9cd20c49872be8cbdfda7ee9aa8c7e',
      },
    },
    {
      name: 'github-hosted',
      description: 'Uses the github source kind',
      source: { source: 'github', repo: 'obra/superpowers', ref: 'v1' },
    },
    { name: 'Bad Name With Spaces', description: 'rejected', source: './x' },
    { name: 'remote-string', description: 'rejected source', source: 'https://example.com' },
  ],
};

describe('parseClaudeMarketplaceManifest', () => {
  it('keeps well-formed plugins and reports the malformed ones by name', () => {
    const manifest = parseClaudeMarketplaceManifest(MANIFEST);
    expect(manifest.name).toBe('claude-plugins-official');
    expect(manifest.ownerName).toBe('Anthropic');
    expect(manifest.renames).toEqual({ adlc: 'agentforce-adlc' });
    expect(manifest.plugins.map((plugin) => plugin.name)).toEqual([
      'agent-sdk-dev',
      'adobe-for-creativity',
      'github-hosted',
      'remote-string',
    ]);
    expect(manifest.skipped).toEqual(['Bad Name With Spaces']);
  });

  it('rejects a manifest without a plugins array', () => {
    expect(() => parseClaudeMarketplaceManifest({ name: 'x' })).toThrow();
  });
});

describe('resolvePluginSource', () => {
  it('resolves a relative source against the marketplace repository', () => {
    expect(resolvePluginSource('./plugins/agent-sdk-dev', OFFICIAL_MARKETPLACE_SOURCE)).toEqual({
      repositoryUrl: OFFICIAL_MARKETPLACE_SOURCE.repositoryUrl,
      ref: OFFICIAL_MARKETPLACE_SOURCE.ref,
      sha: null,
      path: 'plugins/agent-sdk-dev',
    });
  });

  it('resolves a git-subdir source with its pinned sha and path', () => {
    const plugin = parseClaudeMarketplaceManifest(MANIFEST).plugins[1]!;
    expect(resolvePluginSource(plugin.source, OFFICIAL_MARKETPLACE_SOURCE)).toEqual({
      repositoryUrl: 'https://github.com/adobe/skills',
      ref: 'main',
      sha: '1307e2c03b9cd20c49872be8cbdfda7ee9aa8c7e',
      path: 'plugins/creative-cloud/adobe-for-creativity',
    });
  });

  it('resolves the github source kind from its repo slug', () => {
    const plugin = parseClaudeMarketplaceManifest(MANIFEST).plugins[2]!;
    expect(resolvePluginSource(plugin.source, OFFICIAL_MARKETPLACE_SOURCE)).toEqual({
      repositoryUrl: 'https://github.com/obra/superpowers',
      ref: 'v1',
      sha: null,
      path: null,
    });
  });

  it('returns null for a remote string source and for a non-github url', () => {
    expect(resolvePluginSource('https://example.com/x', OFFICIAL_MARKETPLACE_SOURCE)).toBeNull();
    expect(
      resolvePluginSource(
        { source: 'url', url: 'https://gitlab.com/a/b.git' },
        OFFICIAL_MARKETPLACE_SOURCE,
      ),
    ).toBeNull();
  });
});

describe('repository helpers', () => {
  it('parses and normalizes github repository urls', () => {
    expect(parseGithubRepository('https://github.com/Adobe/skills.git/')).toEqual({
      owner: 'Adobe',
      repo: 'skills',
    });
    expect(normalizeRepositoryUrl('https://github.com/adobe/skills.git')).toBe(
      'https://github.com/adobe/skills',
    );
    expect(normalizeRepositoryUrl('http://github.com/adobe/skills')).toBeNull();
    expect(normalizeRepositoryUrl('https://github.com/adobe')).toBeNull();
  });

  it('recognises directory marketplace repositories case-insensitively', () => {
    expect(
      isDirectoryMarketplaceRepository('https://github.com/Anthropics/claude-plugins-official.git'),
    ).toBe(true);
    expect(isDirectoryMarketplaceRepository('https://github.com/acme/marketplace')).toBe(false);
  });

  it('builds the raw manifest url and the CLI install command', () => {
    expect(buildMarketplaceManifestUrl(OFFICIAL_MARKETPLACE_SOURCE)).toBe(
      'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json',
    );
    expect(marketplaceInstallCommand('code-review', 'claude-plugins-official')).toBe(
      'claude plugin install code-review@claude-plugins-official',
    );
  });
});

describe('fetchClaudeMarketplace', () => {
  it('returns the parsed manifest with a content hash', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(MANIFEST), { status: 200 }));
    const fetched = await fetchClaudeMarketplace(OFFICIAL_MARKETPLACE_SOURCE, fetchImpl);
    expect(fetched.manifest.plugins).toHaveLength(4);
    expect(fetched.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fetched.manifestUrl).toContain('claude-plugins-official/main/.claude-plugin');
  });

  it('raises a fetch error on a non-2xx response and on invalid json', async () => {
    await expect(
      fetchClaudeMarketplace(
        OFFICIAL_MARKETPLACE_SOURCE,
        async () => new Response('', { status: 404 }),
      ),
    ).rejects.toBeInstanceOf(ClaudeMarketplaceFetchError);
    await expect(
      fetchClaudeMarketplace(
        OFFICIAL_MARKETPLACE_SOURCE,
        async () => new Response('{', { status: 200 }),
      ),
    ).rejects.toBeInstanceOf(ClaudeMarketplaceFetchError);
  });
});
