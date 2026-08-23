const REPO_OWNER = process.env['DESKTOP_GITHUB_OWNER'] || 'siddharthanagula3';
const REPO_NAME = process.env['DESKTOP_GITHUB_REPO'] || 'agiworkforce-desktop-app';
const CLOUD_REPO_OWNER = process.env['DESKTOP_CLOUD_GITHUB_OWNER'] || 'siddharthanagula3';
const CLOUD_REPO_NAME = process.env['DESKTOP_CLOUD_GITHUB_REPO'] || 'agiworkforce';

const EXTERNAL_URL_ALLOWED_HOSTS = new Set<string>([
  'downloads.agiworkforce.com',
  'cdn.agiworkforce.com',
  'github.com',
  'objects.githubusercontent.com',
]);

const TRUSTED_GITHUB_RELEASES: ReadonlyArray<{ owner: string; repo: string }> = [
  { owner: 'siddharthanagula3', repo: 'agiworkforce' },
  { owner: REPO_OWNER, repo: REPO_NAME },
  { owner: CLOUD_REPO_OWNER, repo: CLOUD_REPO_NAME },
];

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
    return TRUSTED_GITHUB_RELEASES.some(
      (pair) => pair.owner.toLowerCase() === ownerLower && pair.repo.toLowerCase() === repoLower,
    );
  }

  return true;
}
