import { createHash } from 'node:crypto';
import { z } from 'zod';
import { isPluginId } from '@agiworkforce/types';
import {
  CLAUDE_CLI_INSTALL_COMMAND,
  CLAUDE_MARKETPLACE_MANIFEST_PATH,
  GITHUB_HOST,
  GITHUB_RAW_BASE_URL,
  OFFICIAL_MARKETPLACE_NAME,
  OFFICIAL_MARKETPLACE_REF,
  OFFICIAL_MARKETPLACE_REPOSITORY_URL,
  PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS,
  GITHUB_API_USER_AGENT,
} from './constants';
import type { PluginSourceLocation } from './types';

const GIT_SUFFIX = /\.git$/;
const RELATIVE_PREFIX = /^\.\//;
const TRAILING_SLASH = /\/+$/;
const GITHUB_REPO_PATH = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

const SOURCE_KIND_GITHUB = 'github';

const GitSourceSchema = z
  .object({
    source: z.string(),
    url: z.string().optional(),
    repo: z.string().optional(),
    path: z.string().optional(),
    ref: z.string().optional(),
    sha: z.string().optional(),
  })
  .passthrough();

const AuthorSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

export const ClaudeMarketplacePluginSchema = z
  .object({
    name: z.string().refine(isPluginId),
    description: z.string().optional(),
    version: z.string().optional(),
    author: AuthorSchema.optional(),
    category: z.string().optional(),
    homepage: z.string().optional(),
    source: z.union([z.string(), GitSourceSchema]),
    skills: z.array(z.string()).optional(),
    lspServers: z.record(z.string(), z.unknown()).optional(),
    displayName: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    strict: z.boolean().optional(),
  })
  .passthrough();

export const ClaudeMarketplaceManifestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    owner: z
      .object({ name: z.string().optional(), email: z.string().optional() })
      .passthrough()
      .optional(),
    renames: z.record(z.string(), z.string()).optional(),
    plugins: z.array(z.unknown()),
  })
  .passthrough();

export type ClaudeMarketplacePlugin = z.infer<typeof ClaudeMarketplacePluginSchema>;
export type ClaudeMarketplaceGitSource = z.infer<typeof GitSourceSchema>;

export interface ClaudeMarketplaceManifest {
  name: string;
  description: string | null;
  ownerName: string | null;
  renames: Record<string, string>;
  plugins: ClaudeMarketplacePlugin[];
  skipped: string[];
}

export interface ClaudeMarketplaceSource {
  name: string;
  repositoryUrl: string;
  ref: string;
}

export interface FetchedClaudeMarketplace {
  source: ClaudeMarketplaceSource;
  manifest: ClaudeMarketplaceManifest;
  manifestUrl: string;
  contentHash: string;
}

export const OFFICIAL_MARKETPLACE_SOURCE: ClaudeMarketplaceSource = {
  name: OFFICIAL_MARKETPLACE_NAME,
  repositoryUrl: OFFICIAL_MARKETPLACE_REPOSITORY_URL,
  ref: OFFICIAL_MARKETPLACE_REF,
};

export const DIRECTORY_MARKETPLACES: readonly ClaudeMarketplaceSource[] = [
  OFFICIAL_MARKETPLACE_SOURCE,
];

export function isDirectoryMarketplaceRepository(
  repositoryUrl: string,
  marketplaces: readonly ClaudeMarketplaceSource[] = DIRECTORY_MARKETPLACES,
): boolean {
  const normalized = normalizeRepositoryUrl(repositoryUrl)?.toLowerCase();
  if (!normalized) return false;
  return marketplaces.some(
    (marketplace) =>
      normalizeRepositoryUrl(marketplace.repositoryUrl)?.toLowerCase() === normalized,
  );
}

export class ClaudeMarketplaceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeMarketplaceFetchError';
  }
}

export function parseGithubRepository(url: string): { owner: string; repo: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== GITHUB_HOST) return null;
  const match = GITHUB_REPO_PATH.exec(parsed.pathname);
  if (!match?.[1] || !match[2]) return null;
  return { owner: match[1], repo: match[2] };
}

export function normalizeRepositoryUrl(url: string): string | null {
  const parsed = parseGithubRepository(url);
  if (!parsed) return null;
  return `https://${GITHUB_HOST}/${parsed.owner}/${parsed.repo}`;
}

function normalizePath(path: string | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim().replace(RELATIVE_PREFIX, '').replace(TRAILING_SLASH, '');
  return trimmed.length > 0 ? trimmed : null;
}

export function resolvePluginSource(
  source: string | ClaudeMarketplaceGitSource,
  marketplace: ClaudeMarketplaceSource,
): PluginSourceLocation | null {
  if (typeof source === 'string') {
    if (/^[a-z]+:/i.test(source)) return null;
    return {
      repositoryUrl: marketplace.repositoryUrl,
      ref: marketplace.ref,
      sha: null,
      path: normalizePath(source),
    };
  }
  const repositoryUrl =
    source.source === SOURCE_KIND_GITHUB && source.repo
      ? normalizeRepositoryUrl(`https://${GITHUB_HOST}/${source.repo}`)
      : source.url
        ? normalizeRepositoryUrl(source.url.replace(GIT_SUFFIX, ''))
        : null;
  if (!repositoryUrl) return null;
  return {
    repositoryUrl,
    ref: source.ref?.trim() || null,
    sha: source.sha?.trim() || null,
    path: normalizePath(source.path),
  };
}

export function marketplaceInstallCommand(pluginName: string, marketplaceName: string): string {
  return `${CLAUDE_CLI_INSTALL_COMMAND} ${pluginName}@${marketplaceName}`;
}

export function buildMarketplaceManifestUrl(marketplace: ClaudeMarketplaceSource): string | null {
  const parsed = parseGithubRepository(marketplace.repositoryUrl);
  if (!parsed) return null;
  return `${GITHUB_RAW_BASE_URL}/${parsed.owner}/${parsed.repo}/${marketplace.ref}/${CLAUDE_MARKETPLACE_MANIFEST_PATH}`;
}

export function parseClaudeMarketplaceManifest(json: unknown): ClaudeMarketplaceManifest {
  const parsed = ClaudeMarketplaceManifestSchema.parse(json);
  const plugins: ClaudeMarketplacePlugin[] = [];
  const skipped: string[] = [];
  for (const raw of parsed.plugins) {
    const plugin = ClaudeMarketplacePluginSchema.safeParse(raw);
    if (plugin.success) {
      plugins.push(plugin.data);
      continue;
    }
    const name =
      raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string'
        ? (raw as { name: string }).name
        : String(plugins.length + skipped.length);
    skipped.push(name);
  }
  return {
    name: parsed.name,
    description: parsed.description ?? null,
    ownerName: parsed.owner?.name ?? null,
    renames: parsed.renames ?? {},
    plugins,
    skipped,
  };
}

export type DirectoryFetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchClaudeMarketplace(
  marketplace: ClaudeMarketplaceSource,
  fetchImpl: DirectoryFetch = fetch,
): Promise<FetchedClaudeMarketplace> {
  const manifestUrl = buildMarketplaceManifestUrl(marketplace);
  if (!manifestUrl) {
    throw new ClaudeMarketplaceFetchError(
      `${marketplace.name} is not hosted on a public ${GITHUB_HOST} repository.`,
    );
  }
  const response = await fetchImpl(manifestUrl, {
    headers: { 'User-Agent': GITHUB_API_USER_AGENT },
    signal: AbortSignal.timeout(PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new ClaudeMarketplaceFetchError(
      `${marketplace.name} manifest fetch failed (${response.status}).`,
    );
  }
  const rawText = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new ClaudeMarketplaceFetchError(`${marketplace.name} manifest is not valid JSON.`);
  }
  let manifest: ClaudeMarketplaceManifest;
  try {
    manifest = parseClaudeMarketplaceManifest(json);
  } catch (error) {
    throw new ClaudeMarketplaceFetchError(
      `${marketplace.name} manifest does not match the Claude marketplace format: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return {
    source: marketplace,
    manifest,
    manifestUrl,
    contentHash: createHash('sha256').update(rawText).digest('hex'),
  };
}
