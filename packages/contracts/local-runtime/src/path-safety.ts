import { HOME_CREDENTIAL_PATHS } from './filesystem';

/**
 * Containment checks for workspace-scoped filesystem access.
 *
 * These operate on paths the caller has ALREADY resolved through `realpath`.
 * Resolving symlinks is the runtime's job and cannot be done here; this module
 * only answers whether one resolved absolute path lies inside another. Calling
 * it with an unresolved path re-opens the symlink escape it exists to close.
 *
 * `a.startsWith(b)` is not that answer: `/home/u/proj-secrets` starts with
 * `/home/u/proj` while lying entirely outside it. Comparison happens on
 * segment boundaries.
 */

export type PathPlatform = 'posix' | 'win32';

export interface ContainmentOptions {
  platform?: PathPlatform;
  /** macOS and Windows default to case-insensitive; override for case-sensitive volumes. */
  caseSensitive?: boolean;
}

const WINDOWS_DRIVE = /^[a-zA-Z]:$/;

function separator(platform: PathPlatform): string {
  return platform === 'win32' ? '\\' : '/';
}

function defaultCaseSensitivity(platform: PathPlatform): boolean {
  return platform === 'posix';
}

/**
 * The platform to assume when a caller names none.
 *
 * This contract is compiled by browser surfaces as well as Node ones, and the
 * chrome extension declares a `process` that carries only `env`. Reaching for
 * the ambient global made the whole package fail to typecheck there, and at
 * runtime a bare `process.platform` would throw rather than fall back. Read it
 * off `globalThis` so its absence is the posix default, which is what a
 * browser wants anyway.
 */
function hostPlatform(): PathPlatform {
  const runtime = (globalThis as { process?: { platform?: string } }).process;
  return runtime?.platform === 'win32' ? 'win32' : 'posix';
}

export function isUncPath(value: string): boolean {
  return value.startsWith('\\\\') || value.startsWith('//');
}

export function isAbsolutePath(value: string, platform: PathPlatform): boolean {
  if (platform === 'posix') return value.startsWith('/');
  if (isUncPath(value)) return true;
  if (!WINDOWS_DRIVE.test(value.slice(0, 2))) return false;
  const afterDrive = value[2];
  return afterDrive === '\\' || afterDrive === '/';
}

/**
 * Splits a resolved absolute path into comparable segments.
 *
 * Returns null when the input is not absolute, still contains traversal
 * segments, or embeds a NUL byte. Each of those means the caller skipped
 * resolution, and guessing on its behalf is how traversal bugs get written.
 */
export function toComparableSegments(
  value: string,
  platform: PathPlatform,
  caseSensitive: boolean,
): string[] | null {
  if (value.length === 0) return null;
  if (value.includes('\0')) return null;
  if (!isAbsolutePath(value, platform)) return null;

  const normalized = platform === 'win32' ? value.replace(/\//g, '\\') : value;
  const raw = normalized.split(separator(platform));
  const segments: string[] = [];

  for (const segment of raw) {
    if (segment === '') continue;
    if (segment === '.' || segment === '..') return null;
    segments.push(caseSensitive ? segment : segment.toLowerCase());
  }

  if (platform === 'win32' && !isUncPath(normalized)) {
    const drive = segments[0];
    if (!drive || !WINDOWS_DRIVE.test(drive)) return null;
  }

  return segments;
}

/**
 * True when `candidate` is `root` itself or lies beneath it.
 *
 * Both arguments must already be resolved absolute paths. Anything that fails
 * to parse is treated as outside, never as inside.
 */
export function isPathInside(
  root: string,
  candidate: string,
  options: ContainmentOptions = {},
): boolean {
  const platform = options.platform ?? hostPlatform();
  const caseSensitive = options.caseSensitive ?? defaultCaseSensitivity(platform);

  const rootSegments = toComparableSegments(root, platform, caseSensitive);
  const candidateSegments = toComparableSegments(candidate, platform, caseSensitive);

  if (!rootSegments || !candidateSegments) return false;
  if (rootSegments.length === 0) return false;
  if (candidateSegments.length < rootSegments.length) return false;

  return rootSegments.every((segment, index) => candidateSegments[index] === segment);
}

/**
 * The path of `candidate` relative to `root`, POSIX-separated, or null when
 * `candidate` is not inside `root`. The root itself maps to `''`.
 */
export function relativeWithinRoot(
  root: string,
  candidate: string,
  options: ContainmentOptions = {},
): string | null {
  const platform = options.platform ?? hostPlatform();
  if (!isPathInside(root, candidate, options)) return null;

  const sep = separator(platform);
  const split = (value: string): string[] =>
    (platform === 'win32' ? value.replace(/\//g, sep) : value)
      .split(sep)
      .filter((segment) => segment !== '');
  const rootDepth = split(root).length;
  const candidateParts = split(candidate);

  return candidateParts.slice(rootDepth).join('/');
}

/**
 * The macOS data volume, where everything a user writes really lives.
 * `/System/Volumes/Data/Users/me` and `/Users/me` are one folder, and a root
 * is judged without the prefix so that neither spelling gets past a rule the
 * other is held to.
 */
const DATA_VOLUME = ['system', 'volumes', 'data'];

/**
 * Folders that are the system's, or everybody's, by their path below the
 * filesystem root: approving one hands over far more than a project. A folder
 * inside one of them can still be a workspace.
 */
const SYSTEM_FOLDERS: Readonly<Record<PathPlatform, readonly string[]>> = {
  posix: [
    'users',
    'home',
    'root',
    'private',
    'private/var',
    'private/etc',
    'private/tmp',
    'var',
    'etc',
    'tmp',
    'usr',
    'bin',
    'sbin',
    'lib',
    'opt',
    'system',
    'system/volumes',
    'library',
    'applications',
    'volumes',
    'dev',
    'proc',
    'sys',
    'boot',
    'cores',
  ],
  win32: ['windows', 'program files', 'program files (x86)', 'programdata', 'users'],
};

function startsWith(segments: readonly string[], prefix: readonly string[]): boolean {
  return (
    segments.length >= prefix.length &&
    prefix.every((segment, index) => segments[index] === segment)
  );
}

/**
 * A resolved path as these rules compare it: without regard to case, since a
 * root is refused on either kind of volume, and without the data volume
 * prefix.
 */
function rootSegments(value: string, platform: PathPlatform): string[] | null {
  const segments = toComparableSegments(value, platform, false);
  if (!segments) return null;
  return platform === 'posix' && startsWith(segments, DATA_VOLUME)
    ? segments.slice(DATA_VOLUME.length)
    : segments;
}

/**
 * Rejects roots that should never become a workspace regardless of what the
 * user picked in the dialog: network shares, the filesystem root, a folder
 * that is the system's or holds every user's files, the home folder and
 * anything above it, and a folder that is, holds or sits inside one of the
 * places credentials are kept (`HOME_CREDENTIAL_PATHS`), such as `~/.ssh` or
 * `~/Library`. A grant on any of them would be indistinguishable from
 * unrestricted access, or would hand over the keys with the project.
 *
 * `value` and every entry of `homeDirs` must already be resolved. The home
 * folder is given under each spelling it has, since a link or a volume
 * prefix can give it more than one.
 */
export function isGrantableRoot(
  value: string,
  platform: PathPlatform,
  homeDirs: string | readonly string[] = [],
): boolean {
  if (isUncPath(value)) return false;

  const segments = rootSegments(value, platform);
  if (!segments) return false;

  const minimumDepth = platform === 'win32' ? 2 : 1;
  if (segments.length < minimumDepth) return false;

  const belowRoot = platform === 'win32' ? segments.slice(1) : segments;
  if (SYSTEM_FOLDERS[platform].some((folder) => folder === belowRoot.join('/'))) return false;

  const homes = (typeof homeDirs === 'string' ? [homeDirs] : homeDirs)
    .map((home) => rootSegments(home, platform))
    .filter((home): home is string[] => home !== null && home.length > 0);
  for (const home of homes) {
    if (startsWith(home, segments)) return false;
    for (const credential of HOME_CREDENTIAL_PATHS) {
      const kept = [...home, ...credential.toLowerCase().split('/')];
      if (startsWith(kept, segments) || startsWith(segments, kept)) return false;
    }
  }

  return true;
}
