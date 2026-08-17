import 'server-only';

import {
  fetchLatestDesktopRelease,
  isTrustedGitHubReleaseAssetUrl,
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

export interface CliReleaseAvailability {
  version: string;
  publishedAt: string;
  downloads: CliReleaseDownload[];
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

export async function fetchCliReleaseAvailability(): Promise<CliReleaseAvailability | null> {
  const release = await fetchLatestDesktopRelease('stable', { tagPrefix: CLI_RELEASE_TAG_PREFIX });
  if (!release) return null;

  const downloads = selectCliReleaseDownloads(release);
  if (downloads.length === 0) return null;

  return { version: release.version, publishedAt: release.publishedAt, downloads };
}
