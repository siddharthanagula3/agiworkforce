import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parseDesktopDeepLink } from '@agiworkforce/local-runtime-contract';

export const DEEP_LINK_QUEUE_LIMIT = 20;
export const DEEP_LINK_QUEUE_TTL_MS = 10 * 60_000;

export interface QueuedDeepLink {
  url: string;
  receivedAt: number;
}

/**
 * Adds a link behind the ones already waiting. A link already queued keeps its
 * first place, and past the limit the oldest is the one dropped, because the
 * newest is the one the user just clicked.
 */
export function enqueueDeepLink(
  queue: readonly QueuedDeepLink[],
  url: string,
  now: number,
): QueuedDeepLink[] {
  if (queue.some((entry) => entry.url === url)) return [...queue];
  return [...queue, { url, receivedAt: now }].slice(-DEEP_LINK_QUEUE_LIMIT);
}

/** A queue held over from the last run goes ahead of links that arrived since. */
export function mergeDeepLinkQueues(
  older: readonly QueuedDeepLink[],
  newer: readonly QueuedDeepLink[],
): QueuedDeepLink[] {
  return [...older, ...newer].reduce<QueuedDeepLink[]>(
    (queue, entry) => enqueueDeepLink(queue, entry.url, entry.receivedAt),
    [],
  );
}

export function freshDeepLinks(
  queue: readonly QueuedDeepLink[],
  now: number,
  ttlMs: number = DEEP_LINK_QUEUE_TTL_MS,
): QueuedDeepLink[] {
  return queue.filter((entry) => entry.receivedAt <= now && now - entry.receivedAt < ttlMs);
}

/**
 * Only links that name something to open are written to disk. A sign-in
 * callback carries a one-time nonce, and a nonce left in a file outlives the
 * sign-in it belonged to.
 */
export function persistableDeepLinks(queue: readonly QueuedDeepLink[]): QueuedDeepLink[] {
  return queue.filter((entry) => parseDesktopDeepLink(entry.url) !== null);
}

export function parseDeepLinkQueue(contents: string, now: number): QueuedDeepLink[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const entries = parsed.flatMap((entry): QueuedDeepLink[] => {
    if (!entry || typeof entry !== 'object') return [];
    const { url, receivedAt } = entry as Record<string, unknown>;
    if (typeof url !== 'string' || typeof receivedAt !== 'number') return [];
    return [{ url, receivedAt }];
  });
  return persistableDeepLinks(freshDeepLinks(entries, now)).slice(-DEEP_LINK_QUEUE_LIMIT);
}

export function loadDeepLinkQueue(filePath: string, now: number): QueuedDeepLink[] {
  try {
    return parseDeepLinkQueue(readFileSync(filePath, 'utf8'), now);
  } catch {
    return [];
  }
}

export function saveDeepLinkQueue(filePath: string, queue: readonly QueuedDeepLink[]): void {
  try {
    const kept = persistableDeepLinks(queue);
    if (kept.length === 0) rmSync(filePath, { force: true });
    else writeFileSync(filePath, `${JSON.stringify(kept)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.warn('[deep-link] could not persist the link queue:', error);
  }
}
