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
  const rootDepth = root.split(sep).filter((segment) => segment !== '').length;
  const candidateParts = candidate.split(sep).filter((segment) => segment !== '');

  return candidateParts.slice(rootDepth).join('/');
}

/**
 * Rejects roots that should never become a workspace regardless of what the
 * user picked in the dialog: network shares, and filesystem/user roots whose
 * grant would be indistinguishable from unrestricted access.
 */
export function isGrantableRoot(value: string, platform: PathPlatform, homeDir?: string): boolean {
  if (isUncPath(value)) return false;

  const segments = toComparableSegments(value, platform, defaultCaseSensitivity(platform));
  if (!segments) return false;

  const minimumDepth = platform === 'win32' ? 2 : 1;
  if (segments.length < minimumDepth) return false;

  if (homeDir) {
    const homeSegments = toComparableSegments(homeDir, platform, defaultCaseSensitivity(platform));
    if (homeSegments && segments.length === homeSegments.length) {
      const identical = homeSegments.every((segment, index) => segments[index] === segment);
      if (identical) return false;
    }
  }

  return true;
}
