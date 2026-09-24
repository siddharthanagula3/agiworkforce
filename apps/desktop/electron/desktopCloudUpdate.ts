import type { HostUpdateAvailability } from '@agiworkforce/local-runtime-contract';
import { platformRequestHeaders } from '../src/lib/platformHeaders';

export const DESKTOP_CLOUD_RELEASE_AVAILABILITY_URL =
  'https://agiworkforce.com/api/releases/desktop-cloud/latest';

/** The published channel this shell belongs to, and the download it asks for. */
export const DESKTOP_CLOUD_RELEASE_CHANNEL = 'cloud';

export type DesktopCloudMacArchitecture = 'arm64' | 'x64';

export function desktopCloudInstallerDownloadUrl(
  architecture: DesktopCloudMacArchitecture,
): string {
  return `https://agiworkforce.com/api/download?platform=mac&app=${DESKTOP_CLOUD_RELEASE_CHANNEL}&arch=${architecture}`;
}

export type DesktopCloudUpdateAvailability = HostUpdateAvailability;

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

export async function checkDesktopCloudUpdate(
  currentVersion: string,
  architecture: DesktopCloudMacArchitecture,
  fetchImpl: typeof fetch = fetch,
): Promise<DesktopCloudUpdateAvailability> {
  if (!parseSemver(currentVersion)) {
    throw new Error('AGI Cloud could not determine the installed app version.');
  }

  // Whatever the network, a proxy or the runtime has to say about a failed
  // request is written for a developer reading a console. This is shown in a
  // dialog, so the reason is this app's own sentence and the original stays in
  // the log where it belongs.
  let response: Response;
  try {
    response = await fetchImpl(DESKTOP_CLOUD_RELEASE_AVAILABILITY_URL, {
      method: 'GET',
      headers: { Accept: 'application/json', ...platformRequestHeaders(currentVersion) },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.warn('[desktop-cloud-update] release check failed:', error);
    throw new Error(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'AGI Cloud could not reach the update service in time.'
        : 'AGI Cloud could not reach the update service. Check your connection and try again.',
    );
  }
  // A 404 from this endpoint is the honest answer to "is there a newer
  // build?" before any release has been published: the route looks for a
  // tagged GitHub release carrying a signed .dmg and says "No cloud desktop
  // release is published" when it finds none. That is not a failure, and
  // throwing on it put an unhandled 'agi:check-update' error in the log on
  // every single launch. Every other status still throws, because those do
  // mean the check itself did not work.
  if (response.status === 404) {
    return { available: false, currentVersion, version: currentVersion, downloadUrl: '' };
  }
  if (!response.ok) {
    throw new Error(`AGI Cloud update information is unavailable (${response.status}).`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    // A captive portal or a proxy answers 200 with a login page, and the JSON
    // parser's complaint about a `<` was reaching the update dialog verbatim.
    console.warn('[desktop-cloud-update] release response was not JSON:', error);
    throw new Error('AGI Cloud received an invalid release response.');
  }

  const release = parseReleasePayload(payload);
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

export interface DesktopUpdatePrompt {
  readonly type: 'info' | 'error';
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: readonly string[];
  readonly downloadButton: number | null;
}

/**
 * What the reader is shown for each of the three states a check can end in.
 * Held here beside the check so a state cannot be added without an answer for
 * what it says, and so the wording is readable without an Electron dialog.
 */
export function desktopUpdatePrompt(
  outcome: DesktopCloudUpdateAvailability | { readonly failure: string },
): DesktopUpdatePrompt {
  if ('failure' in outcome) {
    return {
      type: 'error',
      title: 'Couldn’t check for updates',
      message: 'AGI Cloud update information is currently unavailable.',
      detail: outcome.failure,
      buttons: ['OK'],
      downloadButton: null,
    };
  }
  if (!outcome.available) {
    return {
      type: 'info',
      title: 'AGI Cloud is up to date',
      message: 'You have the latest AGI Cloud version.',
      detail: `Installed: ${outcome.currentVersion}\nLatest published: ${outcome.version}`,
      buttons: ['OK'],
      downloadButton: null,
    };
  }
  return {
    type: 'info',
    title: 'AGI Cloud update available',
    message: `AGI Cloud ${outcome.version} is available.`,
    detail:
      `You have ${outcome.currentVersion}. Download the signed and notarized macOS installer, ` +
      'then replace AGI Cloud in Applications. This opens your browser and does not install automatically.',
    buttons: ['Download Installer', 'Later'],
    downloadButton: 0,
  };
}
