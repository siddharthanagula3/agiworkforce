import 'server-only';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getOptionalEnv } from '@/utils/env';

export const DESKTOP_RELEASE_PLATFORMS = [
  'darwin-aarch64',
  'darwin-x86_64',
  'darwin-universal',
  'windows-x86_64',
  'linux-x86_64',
] as const;

export type DesktopReleasePlatform = (typeof DESKTOP_RELEASE_PLATFORMS)[number];
export type DesktopDownloadPlatform = 'mac' | 'windows' | 'linux';

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:');
const githubAssetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  browser_download_url: httpsUrlSchema,
  content_type: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  state: z.string().optional(),
});
const githubReleaseSchema = z.object({
  id: z.number().int().positive(),
  tag_name: z.string().min(1),
  name: z.string().nullable().optional(),
  body: z.string().nullable(),
  published_at: z.string().datetime().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(githubAssetSchema),
});
const githubReleaseListSchema = z.array(githubReleaseSchema);

type GitHubAssetPayload = z.infer<typeof githubAssetSchema>;

export interface DesktopReleaseAsset {
  id: number;
  name: string;
  browserDownloadUrl: string;
  size: number | null;
}

export interface StableDesktopRelease {
  id: number;
  tagName: string;
  version: string;
  notes: string;
  publishedAt: string;
  assets: DesktopReleaseAsset[];
}

export interface SignedDesktopUpdaterAsset {
  binary: DesktopReleaseAsset;
  signature: DesktopReleaseAsset;
}

interface FetchDesktopReleaseOptions {
  owner?: string;
  repo?: string;
  revalidateSeconds?: number;
}

const DESKTOP_TAG_PATTERN = /^v-desktop-(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SEMVER_PATTERN = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_RELEASE_PAGES = 10;

function toAsset(asset: GitHubAssetPayload): DesktopReleaseAsset {
  return {
    id: asset.id,
    name: asset.name,
    browserDownloadUrl: asset.browser_download_url,
    size: asset.size ?? null,
  };
}

export function parseSemanticVersion(version: string): [number, number, number] | null {
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemanticVersions(left: string, right: string): number | null {
  const parsedLeft = parseSemanticVersion(left);
  const parsedRight = parseSemanticVersion(right);
  if (!parsedLeft || !parsedRight) return null;

  for (let index = 0; index < parsedLeft.length; index += 1) {
    const difference = parsedLeft[index]! - parsedRight[index]!;
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function selectLatestStableDesktopRelease(payload: unknown): StableDesktopRelease | null {
  const parsed = githubReleaseListSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, 'GitHub desktop release payload is invalid');
    return null;
  }

  const candidates = parsed.data.flatMap((release) => {
    if (release.draft || release.prerelease || !release.published_at) return [];
    const tagMatch = DESKTOP_TAG_PATTERN.exec(release.tag_name);
    if (!tagMatch) return [];

    return [
      {
        id: release.id,
        tagName: release.tag_name,
        version: `${tagMatch[1]}.${tagMatch[2]}.${tagMatch[3]}`,
        notes: release.body ?? '',
        publishedAt: release.published_at,
        assets: release.assets.map(toAsset),
      },
    ];
  });

  candidates.sort((left, right) => compareSemanticVersions(right.version, left.version) ?? 0);
  return candidates[0] ?? null;
}

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AGI-Workforce-Desktop-Releases',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = getOptionalEnv('GITHUB_TOKEN');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function fetchLatestStableDesktopRelease(
  options: FetchDesktopReleaseOptions = {},
): Promise<StableDesktopRelease | null> {
  const owner = options.owner ?? getOptionalEnv('DESKTOP_GITHUB_OWNER');
  const repo = options.repo ?? getOptionalEnv('DESKTOP_GITHUB_REPO');
  if (!owner || !repo) {
    logger.warn('Desktop release GitHub repository is not configured');
    return null;
  }

  try {
    const releases: unknown[] = [];
    for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=${page}`,
        {
          headers: githubHeaders(),
          next: { revalidate: options.revalidateSeconds ?? 300 },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        logger.warn({ status: response.status }, 'GitHub desktop release request failed');
        return null;
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        return selectLatestStableDesktopRelease(payload);
      }
      releases.push(...payload);

      const hasNextPage = response.headers.get('link')?.includes('rel="next"') ?? false;
      if (!hasNextPage) return selectLatestStableDesktopRelease(releases);
      if (page === MAX_RELEASE_PAGES) {
        logger.warn(
          { owner, repo, maxPages: MAX_RELEASE_PAGES },
          'GitHub desktop release pagination exceeded safety limit',
        );
        return null;
      }
    }

    return null;
  } catch (error) {
    logger.warn({ error }, 'GitHub desktop release request failed');
    return null;
  }
}

function hasX64Marker(name: string): boolean {
  return /(?:x86_64|x64|amd64)/i.test(name);
}

function isTrustedGitHubReleaseAssetUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      /^\/[^/]+\/[^/]+\/releases\/download\//.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function updaterBinaryMatches(platform: DesktopReleasePlatform, name: string): boolean {
  if (name.endsWith('.sig')) return false;
  switch (platform) {
    case 'darwin-aarch64':
      return name.endsWith('.app.tar.gz') && /(?:aarch64|arm64|universal)/i.test(name);
    case 'darwin-x86_64':
      return name.endsWith('.app.tar.gz') && (hasX64Marker(name) || /universal/i.test(name));
    case 'darwin-universal':
      return name.endsWith('.app.tar.gz') && /universal/i.test(name);
    case 'windows-x86_64':
      return name.endsWith('.nsis.zip') && hasX64Marker(name);
    case 'linux-x86_64':
      return name.endsWith('.AppImage') && hasX64Marker(name);
  }
}

export function selectSignedDesktopUpdaterAsset(
  release: StableDesktopRelease,
  platform: DesktopReleasePlatform,
): SignedDesktopUpdaterAsset | null {
  const binary = release.assets.find((asset) => updaterBinaryMatches(platform, asset.name));
  if (!binary) return null;
  const signature = release.assets.find((asset) => asset.name === `${binary.name}.sig`);
  if (
    !signature ||
    !isTrustedGitHubReleaseAssetUrl(binary.browserDownloadUrl) ||
    !isTrustedGitHubReleaseAssetUrl(signature.browserDownloadUrl)
  ) {
    return null;
  }
  return { binary, signature };
}

export async function fetchDesktopAssetSignature(
  signatureAsset: DesktopReleaseAsset,
): Promise<string | null> {
  if (!isTrustedGitHubReleaseAssetUrl(signatureAsset.browserDownloadUrl)) {
    logger.warn(
      { assetName: signatureAsset.name },
      'Desktop signature URL is outside the trusted GitHub release boundary',
    );
    return null;
  }
  try {
    const response = await fetch(signatureAsset.browserDownloadUrl, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const signature = (await response.text()).trim();
    return signature.length > 0 ? signature : null;
  } catch (error) {
    logger.warn({ error, assetName: signatureAsset.name }, 'Desktop signature request failed');
    return null;
  }
}

export function selectDesktopInstallerAsset(
  release: StableDesktopRelease,
  platform: DesktopDownloadPlatform,
): DesktopReleaseAsset | null {
  const candidates: ReadonlyArray<(name: string) => boolean> =
    platform === 'mac'
      ? [(name) => name.endsWith('.dmg'), (name) => name.endsWith('.app.tar.gz')]
      : platform === 'windows'
        ? [
            (name) => name.endsWith('.exe'),
            (name) => name.endsWith('.msi'),
            (name) => name.endsWith('.nsis.zip'),
          ]
        : [(name) => name.endsWith('.AppImage'), (name) => name.endsWith('.deb')];

  for (const matches of candidates) {
    const asset = release.assets.find((candidate) => matches(candidate.name));
    if (asset) return asset;
  }
  return null;
}
