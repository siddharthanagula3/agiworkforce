import 'server-only';

import {
  fetchLatestDesktopRelease,
  isTrustedGitHubReleaseAssetUrl,
  resolveDesktopReleaseRepository,
  type StableDesktopRelease,
} from './github-desktop-releases';

export const CLI_RELEASE_TAG_PREFIX = 'v-cli-';

export const CLI_RELEASE_PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-x64',
  'linux-arm64',
  'windows-x64',
  'windows-arm64',
] as const;

export type CliReleasePlatform = (typeof CLI_RELEASE_PLATFORMS)[number];

export interface CliReleaseDownload {
  platform: CliReleasePlatform;
  assetName: string;
  downloadUrl: string;
  sizeBytes: number | null;
}

export interface CliReleaseNotes {
  summary: string | null;
  url: string;
}

export interface CliReleaseAvailability {
  version: string;
  publishedAt: string;
  downloads: CliReleaseDownload[];
  releaseNotes: CliReleaseNotes;
}

const RELEASE_SUMMARY_MAX_CHARS = 280;
const RELEASE_SUMMARY_MAX_ITEMS = 3;

function plainReleaseLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+by @[\w-]+(?:\s+in\s+\S+)?\s*$/, '')
    .replace(/[`*_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeCliReleaseNotes(markdown: string | undefined): string | null {
  if (!markdown) return null;
  const items = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*#{1,6}\s/.test(line) && !/^\s*\*\*Full Changelog\*\*/i.test(line))
    .map(plainReleaseLine)
    .filter((line) => line.length > 0)
    .slice(0, RELEASE_SUMMARY_MAX_ITEMS);
  if (items.length === 0) return null;
  const summary = items.join('; ');
  if (summary.length <= RELEASE_SUMMARY_MAX_CHARS) return summary;
  const cut = summary.slice(0, RELEASE_SUMMARY_MAX_CHARS);
  const wordEnd = cut.lastIndexOf(' ');
  return `${cut.slice(0, wordEnd > 0 ? wordEnd : cut.length)}…`;
}

function cliReleaseNotes(release: StableDesktopRelease): CliReleaseNotes {
  const { owner, repo } = resolveDesktopReleaseRepository();
  return {
    summary: summarizeCliReleaseNotes(release.notes),
    url: `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(release.tagName)}`,
  };
}

const ARCHIVE_BASENAMES: Record<CliReleasePlatform, readonly string[]> = {
  'darwin-arm64': ['agiworkforce-darwin-arm64.tar.gz'],
  'darwin-x64': ['agiworkforce-darwin-x64.tar.gz'],
  'linux-x64': ['agiworkforce-linux-x64.tar.gz'],
  'linux-arm64': ['agiworkforce-linux-arm64.tar.gz'],
  'windows-x64': ['agiworkforce-windows-x64.zip', 'agiworkforce-win32-x64.zip'],
  'windows-arm64': ['agiworkforce-windows-arm64.zip', 'agiworkforce-win32-arm64.zip'],
};

export function selectCliReleaseDownloads(release: StableDesktopRelease): CliReleaseDownload[] {
  const downloads: CliReleaseDownload[] = [];

  for (const platform of CLI_RELEASE_PLATFORMS) {
    const asset = release.assets.find((candidate) =>
      ARCHIVE_BASENAMES[platform].includes(candidate.name),
    );
    if (!asset || !isTrustedGitHubReleaseAssetUrl(asset.browserDownloadUrl)) continue;
    downloads.push({
      platform,
      assetName: asset.name,
      downloadUrl: asset.browserDownloadUrl,
      sizeBytes: asset.size,
    });
  }

  return downloads;
}

const REACHABILITY_TTL_MS = 5 * 60 * 1000;
const REACHABILITY_TIMEOUT_MS = 6000;

const reachability = new Map<string, { publiclyRetrievable: boolean; checkedAt: number }>();

async function isPubliclyRetrievable(url: string): Promise<boolean> {
  const cached = reachability.get(url);
  if (cached && Date.now() - cached.checkedAt < REACHABILITY_TTL_MS) {
    return cached.publiclyRetrievable;
  }

  let publiclyRetrievable = false;
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(REACHABILITY_TIMEOUT_MS),
    });
    publiclyRetrievable = response.ok;
  } catch {
    publiclyRetrievable = false;
  }

  reachability.set(url, { publiclyRetrievable, checkedAt: Date.now() });
  return publiclyRetrievable;
}

export const CLI_SIGNED_MANIFEST_ASSETS = [
  'SHA256SUMS',
  'SHA256SUMS.sig',
  'SHA256SUMS.sigstore.json',
] as const;

function signedManifestUrls(release: StableDesktopRelease): string[] | null {
  const urls: string[] = [];
  for (const name of CLI_SIGNED_MANIFEST_ASSETS) {
    const asset = release.assets.find((candidate) => candidate.name === name);
    if (!asset || !isTrustedGitHubReleaseAssetUrl(asset.browserDownloadUrl)) return null;
    urls.push(asset.browserDownloadUrl);
  }
  return urls;
}

export async function fetchCliReleaseAvailability(): Promise<CliReleaseAvailability | null> {
  const release = await fetchLatestDesktopRelease('stable', { tagPrefix: CLI_RELEASE_TAG_PREFIX });
  if (!release) return null;

  const manifestUrls = signedManifestUrls(release);
  if (!manifestUrls) return null;

  const candidates = selectCliReleaseDownloads(release);
  if (candidates.length === 0) return null;

  const manifestReachable = await Promise.all(manifestUrls.map(isPubliclyRetrievable));
  if (!manifestReachable.every(Boolean)) return null;

  const reachable = await Promise.all(
    candidates.map(async (download) =>
      (await isPubliclyRetrievable(download.downloadUrl)) ? download : null,
    ),
  );
  const downloads = reachable.filter(
    (download): download is CliReleaseDownload => download !== null,
  );
  if (downloads.length === 0) return null;

  return {
    version: release.version,
    publishedAt: release.publishedAt,
    downloads,
    releaseNotes: cliReleaseNotes(release),
  };
}
