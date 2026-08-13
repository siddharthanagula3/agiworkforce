/**
 * Canonical manual-update contract for the cloud-only Electron shell.
 *
 * AGI Cloud currently publishes a signed/notarized DMG, not an in-place
 * electron-updater feed. Both the Electron main process and the bundled
 * fallback renderer use these same endpoints so neither surface can claim an
 * automatic install that the release pipeline does not provide.
 */

export const DESKTOP_CLOUD_RELEASE_AVAILABILITY_URL =
  'https://agiworkforce.com/api/releases/desktop-cloud/latest';
export type DesktopCloudMacArchitecture = 'arm64' | 'x64';

export function desktopCloudInstallerDownloadUrl(
  architecture: DesktopCloudMacArchitecture,
): string {
  return `https://agiworkforce.com/api/download?platform=mac&app=cloud&arch=${architecture}`;
}

export interface DesktopCloudUpdateAvailability {
  available: boolean;
  currentVersion: string;
  version: string;
  publishedAt?: string;
  downloadUrl: string;
}

interface DesktopCloudReleasePayload {
  version: string;
  publishedAt?: string;
  platforms: { mac: true };
  architectures: { arm64: boolean; x64: boolean };
}

interface ParsedSemver {
  core: readonly [number, number, number];
  prerelease: readonly (number | string)[];
}

function parseSemver(value: string): ParsedSemver | null {
  const match = value
    .trim()
    .match(
      /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*))?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/,
    );
  if (!match) return null;

  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (core.some((part) => !Number.isSafeInteger(part))) return null;
  const prerelease = (match[4] ?? '')
    .split('.')
    .filter(Boolean)
    .map((identifier) => {
      const numeric = /^\d+$/.test(identifier) ? Number(identifier) : null;
      return numeric !== null && Number.isSafeInteger(numeric) ? numeric : identifier;
    });
  return { core, prerelease };
}

/** Compare semantic versions according to SemVer precedence rules. */
export function compareDesktopCloudVersions(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) {
    throw new Error('AGI Cloud received invalid release version metadata.');
  }

  for (let index = 0; index < a.core.length; index += 1) {
    const difference = a.core[index]! - b.core[index]!;
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === 'number' && typeof rightPart === 'string') return -1;
    if (typeof leftPart === 'string' && typeof rightPart === 'number') return 1;
    if (typeof leftPart === 'number' && typeof rightPart === 'number') {
      return leftPart > rightPart ? 1 : -1;
    }
    if (typeof leftPart === 'string' && typeof rightPart === 'string') {
      return leftPart > rightPart ? 1 : -1;
    }
  }
  return 0;
}

function parseReleasePayload(value: unknown): DesktopCloudReleasePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AGI Cloud received an invalid release response.');
  }
  const record = value as Record<string, unknown>;
  const platforms = record['platforms'];
  const architectures = record['architectures'];
  if (
    typeof record['version'] !== 'string' ||
    !parseSemver(record['version']) ||
    !platforms ||
    typeof platforms !== 'object' ||
    Array.isArray(platforms) ||
    (platforms as Record<string, unknown>)['mac'] !== true ||
    !architectures ||
    typeof architectures !== 'object' ||
    Array.isArray(architectures) ||
    typeof (architectures as Record<string, unknown>)['arm64'] !== 'boolean' ||
    typeof (architectures as Record<string, unknown>)['x64'] !== 'boolean'
  ) {
    throw new Error('AGI Cloud received incomplete release metadata.');
  }
  if (record['publishedAt'] !== undefined && typeof record['publishedAt'] !== 'string') {
    throw new Error('AGI Cloud received an invalid release date.');
  }
  return {
    version: record['version'],
    ...(typeof record['publishedAt'] === 'string' ? { publishedAt: record['publishedAt'] } : {}),
    platforms: { mac: true },
    architectures: {
      arm64: (architectures as Record<string, boolean>)['arm64']!,
      x64: (architectures as Record<string, boolean>)['x64']!,
    },
  };
}

/**
 * Check the published AGI Cloud release. A non-success response is an error,
 * not proof that the installed version is current.
 */
export async function checkDesktopCloudUpdate(
  currentVersion: string,
  architecture: DesktopCloudMacArchitecture,
  fetchImpl: typeof fetch = fetch,
): Promise<DesktopCloudUpdateAvailability> {
  if (!parseSemver(currentVersion)) {
    throw new Error('AGI Cloud could not determine the installed app version.');
  }

  const response = await fetchImpl(DESKTOP_CLOUD_RELEASE_AVAILABILITY_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`AGI Cloud update information is unavailable (${response.status}).`);
  }

  const release = parseReleasePayload(await response.json());
  const available = compareDesktopCloudVersions(release.version, currentVersion) > 0;
  if (available && !release.architectures[architecture]) {
    throw new Error(`No signed AGI Cloud ${architecture} installer is published for this update.`);
  }
  return {
    available,
    currentVersion,
    version: release.version,
    ...(release.publishedAt ? { publishedAt: release.publishedAt } : {}),
    downloadUrl: desktopCloudInstallerDownloadUrl(architecture),
  };
}
