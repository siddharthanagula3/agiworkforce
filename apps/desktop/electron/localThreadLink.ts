import { realpathSync } from 'node:fs';
import path from 'node:path';
import { DESKTOP_DEEP_LINK_SCHEME } from '@agiworkforce/local-runtime-contract';

/**
 * `agiworkforce-cloud://code/local/<threadId>?folder=<absolute path>`: the CLI's
 * hand-off of a session it is running into this app, as the same session on
 * the same folder rather than a copy.
 */
const LINK_HOST = 'code';
const LINK_PATH_PREFIX = '/local/';
const FOLDER_PARAM = 'folder';
const THREAD_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type LocalThreadLink =
  | { kind: 'not-local' }
  | { kind: 'invalid' }
  | { kind: 'open'; threadId: string; folder: string };

export function readLocalThreadLink(url: string): LocalThreadLink {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'not-local' };
  }
  if (parsed.protocol !== `${DESKTOP_DEEP_LINK_SCHEME}:` || parsed.host !== LINK_HOST) {
    return { kind: 'not-local' };
  }
  if (!parsed.pathname.startsWith(LINK_PATH_PREFIX)) return { kind: 'not-local' };
  let threadId: string;
  try {
    threadId = decodeURIComponent(parsed.pathname.slice(LINK_PATH_PREFIX.length));
  } catch {
    return { kind: 'invalid' };
  }
  const folder = parsed.searchParams.get(FOLDER_PARAM) ?? '';
  if (!THREAD_ID_PATTERN.test(threadId) || !path.isAbsolute(folder)) return { kind: 'invalid' };
  return { kind: 'open', threadId, folder };
}

/**
 * The approved folder a link names, or null. A link never adds a folder: it
 * can only reach one the user already let this app open.
 */
export function approvedRootFor(
  folder: string,
  roots: readonly { id: string; path: string }[],
  resolve: (target: string) => string = realpathSync,
): string | null {
  let resolved: string;
  try {
    resolved = resolve(folder);
  } catch {
    return null;
  }
  return roots.find((root) => root.path === resolved)?.id ?? null;
}
