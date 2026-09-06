import {
  isPluginSemver,
  type PluginCapability,
  type PluginPublisher,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
import {
  BRAND_NAME_PATTERN,
  BRAND_NAME_REPLACEMENT,
  CLAUDE_CLI_INSTALL_COMMAND,
  DASH_PATTERN,
  DASH_REPLACEMENT,
  MARKETPLACE_EXTERNAL_PLUGINS_DIRECTORY,
  OFFICIAL_MARKETPLACE_NAME,
  PARTNER_PUBLISHER_ID,
  PARTNER_PUBLISHER_NAME,
  PLUGIN_CAPABILITY_MCP,
  PLUGIN_CAPABILITY_SHELL,
  PLUGIN_DIRECTORY_FALLBACK_VERSION,
  PLUGIN_DIRECTORY_MAX_DESCRIPTION_CHARS,
  PLUGIN_DIRECTORY_SHA_VERSION_PREFIX,
  PLUGIN_DIRECTORY_SHORT_SHA_LENGTH,
  PLUGIN_DIRECTORY_UNCATEGORIZED,
  PUBLIC_DIRECTORY_URL,
  PUBLISHER_KIND_PARTNER,
  PUBLISHER_KIND_THIRD_PARTY,
  SOURCE_FACET_MARKETPLACE,
  SOURCE_FACET_PARTNER,
  WORKS_WITH_CLAUDE_CODE,
  WORKS_WITH_WEB,
} from './constants';
import { EMPTY_COMPONENTS, runtimeFitFor } from './inspection';
import {
  marketplaceInstallCommand,
  parseGithubRepository,
  type ClaudeMarketplacePlugin,
  type FetchedClaudeMarketplace,
} from './official-marketplace';
import type {
  PluginDirectoryEntry,
  PluginInspectionRecord,
  PluginRuntimeComponents,
  PluginSourceLocation,
  PluginWorksWith,
  PublicDirectoryCard,
  PublicDirectoryDetail,
} from './types';

const STATUS_PUBLISHED = 'published';
const SOURCE_KIND_MARKETPLACE = 'marketplace';
const NON_SLUG_CHARACTERS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const WHITESPACE = /\s+/g;
const INSTALL_COMMAND_TARGET = new RegExp(`^${CLAUDE_CLI_INSTALL_COMMAND}\\s+([^@\\s]+)@(\\S+)`);
const VERSION_BUILD_SEPARATOR = '+';

export function slugify(value: string): string {
  const slug = value.toLowerCase().replace(NON_SLUG_CHARACTERS, '-').replace(EDGE_DASHES, '');
  return slug.length > 0 ? slug : PARTNER_PUBLISHER_ID;
}

export function neutralizeCopy(value: string): string {
  return value
    .replace(DASH_PATTERN, DASH_REPLACEMENT)
    .replace(BRAND_NAME_PATTERN, BRAND_NAME_REPLACEMENT)
    .replace(WHITESPACE, ' ')
    .trim();
}

export function displayVersion(declared: string | null | undefined, sha: string | null): string {
  if (declared && isPluginSemver(declared)) return declared;
  if (!sha) return PLUGIN_DIRECTORY_FALLBACK_VERSION;
  return `${PLUGIN_DIRECTORY_FALLBACK_VERSION}${VERSION_BUILD_SEPARATOR}${PLUGIN_DIRECTORY_SHA_VERSION_PREFIX}${sha.slice(0, PLUGIN_DIRECTORY_SHORT_SHA_LENGTH)}`;
}

export function installedVersion(version: string, sha: string): string {
  const base = version.split(VERSION_BUILD_SEPARATOR)[0] ?? '';
  const semver = isPluginSemver(base) ? base : PLUGIN_DIRECTORY_FALLBACK_VERSION;
  return `${semver}${VERSION_BUILD_SEPARATOR}${PLUGIN_DIRECTORY_SHA_VERSION_PREFIX}${sha}`;
}

export function shaFromInstalledVersion(version: string): string | null {
  const build = version.split(VERSION_BUILD_SEPARATOR)[1];
  if (!build || !build.startsWith(PLUGIN_DIRECTORY_SHA_VERSION_PREFIX)) return null;
  const sha = build.slice(PLUGIN_DIRECTORY_SHA_VERSION_PREFIX.length);
  return sha.length > 0 ? sha : null;
}

export function parseInstallCommandTarget(
  command: string | null,
): { pluginName: string; marketplaceName: string } | null {
  if (!command) return null;
  const match = INSTALL_COMMAND_TARGET.exec(command.trim());
  if (!match?.[1] || !match[2]) return null;
  return { pluginName: match[1], marketplaceName: match[2] };
}

function clampDescription(value: string): string {
  return neutralizeCopy(value).slice(0, PLUGIN_DIRECTORY_MAX_DESCRIPTION_CHARS);
}

const PUBLIC_DIRECTORY_HOST = new URL(PUBLIC_DIRECTORY_URL).hostname.toLowerCase();

export function vendorHomepage(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).hostname.toLowerCase() === PUBLIC_DIRECTORY_HOST ? null : trimmed;
  } catch {
    return null;
  }
}

function capabilitiesFor(components: PluginRuntimeComponents): PluginCapability[] {
  const capabilities: PluginCapability[] = [];
  if (components.mcpServers.length > 0) capabilities.push(PLUGIN_CAPABILITY_MCP);
  if (components.hooks || components.lspServers.length > 0) {
    capabilities.push(PLUGIN_CAPABILITY_SHELL);
  }
  return capabilities;
}

function lastSegment(path: string): string {
  const segments = path.replace(/\/+$/, '').split('/');
  return segments[segments.length - 1] ?? path;
}

function worksWithFor(
  card: PublicDirectoryCard | null,
  webInstallable: boolean,
): PluginWorksWith[] {
  const values = new Set<PluginWorksWith>(card?.worksWith ?? []);
  values.add(WORKS_WITH_CLAUDE_CODE);
  if (webInstallable) values.add(WORKS_WITH_WEB);
  return [...values];
}

const PARTNER_PUBLISHER: PluginPublisher = {
  id: PARTNER_PUBLISHER_ID,
  name: PARTNER_PUBLISHER_NAME,
  kind: PUBLISHER_KIND_PARTNER,
  url: null,
};

function vendorPublisher(name: string, url: string | null): PluginPublisher {
  return { id: slugify(name), name, kind: PUBLISHER_KIND_PARTNER, url };
}

export function publisherFor(
  plugin: ClaudeMarketplacePlugin,
  marketplace: FetchedClaudeMarketplace,
  location: PluginSourceLocation | null,
): PluginPublisher {
  const ownerName = marketplace.manifest.ownerName?.trim() || marketplace.source.name;
  const authorName = plugin.author?.name?.trim();
  if (authorName) {
    const authorUrl = plugin.author?.url?.trim() || null;
    if (authorName.toLowerCase() === ownerName.toLowerCase()) {
      return {
        id: slugify(ownerName),
        name: ownerName,
        kind: PUBLISHER_KIND_THIRD_PARTY,
        url: authorUrl,
      };
    }
    return vendorPublisher(authorName, authorUrl);
  }
  const insideMarketplace =
    location !== null &&
    location.repositoryUrl.toLowerCase() === marketplace.source.repositoryUrl.toLowerCase();
  if (insideMarketplace) {
    const external = (location.path ?? '').startsWith(`${MARKETPLACE_EXTERNAL_PLUGINS_DIRECTORY}/`);
    return external
      ? PARTNER_PUBLISHER
      : { id: slugify(ownerName), name: ownerName, kind: PUBLISHER_KIND_THIRD_PARTY, url: null };
  }
  const repository = location ? parseGithubRepository(location.repositoryUrl) : null;
  return repository
    ? vendorPublisher(repository.owner, location!.repositoryUrl)
    : PARTNER_PUBLISHER;
}

const EMPTY_REGISTRY_FIELDS: Pick<
  PluginRegistryEntry,
  | 'requiredConnectors'
  | 'permissions'
  | 'examplePrompts'
  | 'versions'
  | 'distribution'
  | 'integrity'
> = {
  requiredConnectors: [],
  permissions: [],
  examplePrompts: [],
  versions: [],
  distribution: null,
  integrity: { sha256: null, signature: null, signatureAlgorithm: null },
};

export interface MarketplaceEntryInput {
  plugin: ClaudeMarketplacePlugin;
  marketplace: FetchedClaudeMarketplace;
  location: PluginSourceLocation | null;
  inspection: PluginInspectionRecord | null;
  card: PublicDirectoryCard | null;
  firstSeenAt: string;
  now: string;
}

export function marketplaceDirectoryEntry(input: MarketplaceEntryInput): PluginDirectoryEntry {
  const { plugin, marketplace, location, inspection, card } = input;
  const components = inspection?.components ?? {
    ...EMPTY_COMPONENTS,
    skills: (plugin.skills ?? []).map(lastSegment),
    lspServers: Object.keys(plugin.lspServers ?? {}),
  };
  const runtime = runtimeFitFor(components, {
    inspected: inspection !== null,
    coworkOnly: false,
    sourceKnown: location !== null,
  });
  const sha = location?.sha ?? inspection?.treeSha ?? null;
  const sourceLocation = location ? { ...location, sha } : null;
  const description = clampDescription(
    plugin.description ?? inspection?.description ?? card?.description ?? '',
  );
  const slug = card?.slug ?? plugin.name;
  return {
    ...EMPTY_REGISTRY_FIELDS,
    id: plugin.name,
    slug,
    name: plugin.displayName?.trim() || card?.name || plugin.name,
    version: displayVersion(plugin.version ?? inspection?.version, sha),
    description,
    category: plugin.category?.trim() || PLUGIN_DIRECTORY_UNCATEGORIZED,
    publisher: publisherFor(plugin, marketplace, location),
    source: SOURCE_KIND_MARKETPLACE,
    status: STATUS_PUBLISHED,
    webInstallable: runtime.webInstallable,
    declaredSkills: [...components.skills],
    capabilities: capabilitiesFor(components),
    homepageUrl: vendorHomepage(plugin.homepage) ?? location?.repositoryUrl ?? null,
    ...(card?.installs === null || card?.installs === undefined
      ? {}
      : { installCount: card.installs }),
    createdAt: input.firstSeenAt,
    updatedAt: input.now,
    sourceFacet: SOURCE_FACET_MARKETPLACE,
    verified: marketplace.source.name === OFFICIAL_MARKETPLACE_NAME || card?.verified === true,
    installs: card?.installs ?? null,
    worksWith: worksWithFor(card, runtime.webInstallable),
    repositoryUrl: location?.repositoryUrl ?? null,
    marketplace: {
      name: marketplace.source.name,
      repositoryUrl: marketplace.source.repositoryUrl,
      manifestUrl: marketplace.manifestUrl,
      contentHash: marketplace.contentHash,
    },
    installCommand: marketplaceInstallCommand(plugin.name, marketplace.source.name),
    runtime,
    sourceLocation,
  };
}

export interface PublicOnlyEntryInput {
  card: PublicDirectoryCard;
  detail: PublicDirectoryDetail | null;
  firstSeenAt: string;
  now: string;
}

export function publicOnlyDirectoryEntry(input: PublicOnlyEntryInput): PluginDirectoryEntry {
  const { card, detail } = input;
  const claudeCode = card.worksWith.includes(WORKS_WITH_CLAUDE_CODE);
  const runtime = runtimeFitFor(EMPTY_COMPONENTS, {
    inspected: false,
    coworkOnly: !claudeCode,
    sourceKnown: false,
  });
  const target = parseInstallCommandTarget(detail?.installCommand ?? null);
  const repository = detail?.repositoryUrl ? parseGithubRepository(detail.repositoryUrl) : null;
  return {
    ...EMPTY_REGISTRY_FIELDS,
    id: card.slug,
    slug: card.slug,
    name: card.name,
    version: PLUGIN_DIRECTORY_FALLBACK_VERSION,
    description: clampDescription(card.description),
    category: PLUGIN_DIRECTORY_UNCATEGORIZED,
    publisher: repository
      ? vendorPublisher(repository.owner, detail!.repositoryUrl)
      : PARTNER_PUBLISHER,
    source: SOURCE_KIND_MARKETPLACE,
    status: STATUS_PUBLISHED,
    webInstallable: false,
    declaredSkills: [],
    capabilities: [],
    homepageUrl: detail?.repositoryUrl ?? null,
    ...(card.installs === null ? {} : { installCount: card.installs }),
    createdAt: input.firstSeenAt,
    updatedAt: input.now,
    sourceFacet: claudeCode ? SOURCE_FACET_MARKETPLACE : SOURCE_FACET_PARTNER,
    verified: card.verified,
    installs: card.installs,
    worksWith: [...card.worksWith],
    repositoryUrl: detail?.repositoryUrl ?? null,
    marketplace: target
      ? { name: target.marketplaceName, repositoryUrl: null, manifestUrl: null, contentHash: null }
      : null,
    installCommand: detail?.installCommand ?? null,
    runtime,
    sourceLocation: null,
  };
}
