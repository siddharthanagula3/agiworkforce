import type { PluginDirectoryEntry, PluginSourceLocation } from '../types';
import { EMPTY_COMPONENTS } from '../inspection';
import type { FetchedClaudeMarketplace } from '../official-marketplace';
import { OFFICIAL_MARKETPLACE_SOURCE } from '../official-marketplace';

export const SHA = '1307e2c03b9cd20c49872be8cbdfda7ee9aa8c7e';
export const CONTENT_HASH = 'a'.repeat(64);

export function cardHtml(
  slug: string,
  options: { name?: string; installs?: string; verified?: boolean; worksWith?: string[] } = {},
): string {
  const worksWith = (options.worksWith ?? ['Claude Code'])
    .map((label) => `<div fs-list-field="works-with">${label}</div>`)
    .join('');
  const badge = options.verified ? '<div class="badge"><span>Anthropic verified</span></div>' : '';
  const installs = options.installs
    ? `<div class="stat"><span format-number="true">${options.installs}</span></div>`
    : '';
  return [
    '<div role="listitem" class="stories_cms_item w-dyn-item">',
    `<div class="u-display-none">${worksWith}</div>`,
    `<a href="/plugins/${slug}" class="connector_cms_pill">`,
    `<h3 fs-list-field="name">${options.name ?? slug}</h3>`,
    `<div><p class="caption">Description for ${slug} &amp; friends.</p></div>`,
    `${badge}${installs}`,
    '</a></div>',
  ].join('');
}

export function listingHtml(cards: string[], pageParam = 'cc61befa_page'): string {
  return `<html><body><a href="?${pageParam}=2">2</a>${cards.join('')}</body></html>`;
}

export function fetchedMarketplace(
  plugins: FetchedClaudeMarketplace['manifest']['plugins'],
  overrides: Partial<FetchedClaudeMarketplace> = {},
): FetchedClaudeMarketplace {
  return {
    source: OFFICIAL_MARKETPLACE_SOURCE,
    manifest: {
      name: OFFICIAL_MARKETPLACE_SOURCE.name,
      description: null,
      ownerName: 'Anthropic',
      renames: {},
      plugins,
      skipped: [],
    },
    manifestUrl:
      'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json',
    contentHash: CONTENT_HASH,
    ...overrides,
  };
}

export const LOCATION: PluginSourceLocation = {
  repositoryUrl: 'https://github.com/adobe/skills',
  ref: 'main',
  sha: SHA,
  path: 'plugins/creative-cloud/adobe-for-creativity',
};

export function directoryEntry(
  overrides: Partial<PluginDirectoryEntry> = {},
): PluginDirectoryEntry {
  return {
    id: 'adobe-for-creativity',
    slug: 'adobe-for-creativity',
    name: 'Adobe for Creativity',
    version: '0.0.0+sha.1307e2c',
    description: 'Adobe tools.',
    category: 'design',
    publisher: { id: 'adobe', name: 'Adobe', kind: 'partner', url: null },
    source: 'marketplace',
    status: 'published',
    webInstallable: true,
    declaredSkills: ['background-removal'],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: [],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    homepageUrl: 'https://github.com/adobe/skills',
    installCount: 120,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    sourceFacet: 'marketplace',
    verified: true,
    installs: 120,
    worksWith: ['claude-code', 'web'],
    repositoryUrl: 'https://github.com/adobe/skills',
    marketplace: {
      name: OFFICIAL_MARKETPLACE_SOURCE.name,
      repositoryUrl: OFFICIAL_MARKETPLACE_SOURCE.repositoryUrl,
      manifestUrl: null,
      contentHash: CONTENT_HASH,
    },
    installCommand: 'claude plugin install adobe-for-creativity@claude-plugins-official',
    runtime: {
      webInstallable: true,
      inspected: true,
      components: {
        ...EMPTY_COMPONENTS,
        skills: ['background-removal'],
        skillPaths: ['skills/background-removal/SKILL.md'],
      },
      note: null,
    },
    sourceLocation: LOCATION,
    ...overrides,
  };
}
