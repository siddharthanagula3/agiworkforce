/**
 * Browser profile management — isolated, agent-only Chromium profiles.
 *
 * Each profile lives at `~/.agiworkforce/browser/profiles/<name>` and is
 * launched as a persistent context (so cookies + local storage survive
 * across sessions, exactly like a regular browser profile).
 *
 * The `agiworkforce` profile (default) is **never** the user's daily
 * Chrome — that's the whole point. Mirrors OpenClaw's
 * `extensions/browser/src/browser/profiles.ts` design.
 */

import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { chromium, type BrowserContext, type Page, type LaunchOptions } from 'playwright-core';

import type { BrowserProfileInfo } from './types';

const DEFAULT_PROFILE_NAME = 'agiworkforce';

/**
 * Profile names must match this regex: 1-48 chars, alphanumerics plus
 * `_`, `.`, `-`. No path separators, no `..`, no whitespace, no shell
 * metacharacters. Names that fail validation are rejected with a
 * `BrowserProfileNameError` (code: `'invalid_profile_name'`).
 */
const PROFILE_NAME_RE = /^[a-zA-Z0-9_.-]{1,48}$/;

/**
 * Error thrown when a profile name fails validation in `resolveProfileDir`.
 * Code: `'invalid_profile_name'`.
 */
export class BrowserProfileNameError extends Error {
  override readonly name = 'BrowserProfileNameError';
  readonly code = 'invalid_profile_name' as const;
  constructor(
    readonly attemptedName: string,
    reason: string,
  ) {
    super(`Invalid browser profile name "${attemptedName}": ${reason}`);
  }
}

interface OpenProfile {
  name: string;
  userDataDir: string;
  context: BrowserContext;
  page: Page;
}

const open = new Map<string, OpenProfile>();

/**
 * Pattern that AGIWORKFORCE_BROWSER_PROFILE_ROOT must match.
 *
 * FIX (audit 2026-05-20, §8): the env-var override was previously read
 * with zero validation — an attacker who could write to the user's shell
 * profile could set this to `/etc` or `~/Library/Mail` and have the
 * profile machinery write into a directory the agent shouldn't own. The
 * audit also flagged the silent default ("no docs, no validation").
 *
 * Allowed values are *absolute* paths whose every component is safe
 * (alphanumerics + `_`, `-`, `.`, `/`) and that contain no parent
 * traversal segments. Relative paths and `..` are rejected with a
 * clear error so the operator can fix their shell config.
 */
const PROFILE_ROOT_ENV_VAR = 'AGIWORKFORCE_BROWSER_PROFILE_ROOT';

function isAcceptableProfileRoot(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  if (!p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p)) return false; // absolute on POSIX or Windows
  if (p.includes('\0')) return false;
  // Reject any `..` segment.
  const parts = p.split(/[\\/]/);
  if (parts.some((seg) => seg === '..')) return false;
  // Conservative charset: everything we expect from a config knob.
  return /^[A-Za-z0-9_.:\\/ -]+$/.test(p);
}

function profileRoot(): string {
  const env = process.env[PROFILE_ROOT_ENV_VAR];
  if (env) {
    if (!isAcceptableProfileRoot(env)) {
      throw new Error(
        `${PROFILE_ROOT_ENV_VAR} is not a safe absolute path: "${env}". ` +
          'Must be absolute, contain no `..`, and use only [A-Za-z0-9_.:/-].',
      );
    }
    return env;
  }
  return join(homedir(), '.agiworkforce', 'browser', 'profiles');
}

export function resolveProfileDir(name?: string): string {
  const profileName = name ?? DEFAULT_PROFILE_NAME;
  if (!PROFILE_NAME_RE.test(profileName)) {
    throw new BrowserProfileNameError(
      profileName,
      'must match /^[a-zA-Z0-9_.-]{1,48}$/ (no path separators, no whitespace, no `..`).',
    );
  }
  const root = resolve(profileRoot());
  const resolved = resolve(join(root, profileName));
  // Defense-in-depth: even though the regex blocks `..` and path
  // separators, double-check the resolved path stays strictly under root.
  const rel = relative(root, resolved);
  if (rel === '' || rel.startsWith('..')) {
    throw new BrowserProfileNameError(
      profileName,
      `resolves outside profile root (${root}); rel="${rel}".`,
    );
  }
  return resolved;
}

export async function listProfiles(): Promise<BrowserProfileInfo[]> {
  // Walk on-disk profile dirs without launching anything.
  const { readdir, stat } = await import('node:fs/promises');
  const root = profileRoot();
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const out: BrowserProfileInfo[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const dir = join(root, name);
    try {
      const st = await stat(dir);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    out.push({
      name,
      userDataDir: dir,
      active: open.has(name),
    });
  }
  return out;
}

export interface OpenProfileOptions {
  /** Override the bundled Chromium executable (e.g. system Chrome). */
  executablePath?: string;
  /** Headed by default for debugging — set true for CI. */
  headless?: boolean;
}

/**
 * Open or reuse a profile. Returns the active page (creating one if needed).
 * The profile name defaults to `agiworkforce` if omitted.
 */
export async function openProfile(name?: string, options: OpenProfileOptions = {}): Promise<Page> {
  const profileName = name ?? DEFAULT_PROFILE_NAME;
  const existing = open.get(profileName);
  if (existing) {
    return existing.page;
  }
  const userDataDir = resolveProfileDir(profileName);
  await mkdir(userDataDir, { recursive: true });

  const launchOptions: LaunchOptions = {
    headless: options.headless ?? false,
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
    args: ['--no-default-browser-check', '--no-first-run', '--disable-features=TranslateUI'],
  };

  // launchPersistentContext is the Playwright equivalent of "Chrome with a
  // persistent profile dir" — cookies, storage, etc. survive across runs.
  const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
  const pages = context.pages();
  const page = pages[0] ?? (await context.newPage());

  open.set(profileName, { name: profileName, userDataDir, context, page });
  return page;
}

export async function closeProfile(name?: string): Promise<void> {
  const profileName = name ?? DEFAULT_PROFILE_NAME;
  const entry = open.get(profileName);
  if (!entry) return;
  open.delete(profileName);
  await entry.context.close().catch(() => undefined);
}

export async function closeAllProfiles(): Promise<void> {
  const profiles = Array.from(open.keys());
  await Promise.all(profiles.map((name) => closeProfile(name)));
}
