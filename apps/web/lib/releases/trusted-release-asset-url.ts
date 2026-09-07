import {
  DEFAULT_DESKTOP_RELEASE_OWNER,
  DEFAULT_DESKTOP_RELEASE_REPO,
  resolveDesktopCloudReleaseRepository,
  resolveDesktopReleaseRepository,
} from './github-desktop-releases';

const EXTERNAL_URL_ALLOWED_HOSTS = new Set<string>([
  'downloads.agiworkforce.com',
  'cdn.agiworkforce.com',
  'github.com',
  'objects.githubusercontent.com',
]);

function trustedGitHubReleases(): ReadonlyArray<{ owner: string; repo: string }> {
  return [
    { owner: DEFAULT_DESKTOP_RELEASE_OWNER, repo: DEFAULT_DESKTOP_RELEASE_REPO },
    resolveDesktopReleaseRepository(),
    resolveDesktopCloudReleaseRepository(),
  ];
}

export function isTrustedReleaseAssetUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (!EXTERNAL_URL_ALLOWED_HOSTS.has(parsed.hostname)) return false;

  if (parsed.hostname === 'github.com') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 4) return false;
    const [owner, repo, kind] = segments;
    if (kind !== 'releases') return false;
    const ownerLower = owner?.toLowerCase() ?? '';
    const repoLower = repo?.toLowerCase() ?? '';
    return trustedGitHubReleases().some(
      (pair) => pair.owner.toLowerCase() === ownerLower && pair.repo.toLowerCase() === repoLower,
    );
  }

  return true;
}
