import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEEP_LINK_QUEUE_LIMIT,
  DEEP_LINK_QUEUE_TTL_MS,
  enqueueDeepLink,
  freshDeepLinks,
  loadDeepLinkQueue,
  mergeDeepLinkQueues,
  parseDeepLinkQueue,
  saveDeepLinkQueue,
} from '../deepLinkQueue';

const CHAT_A = 'agiworkforce-cloud://chat/a';
const CHAT_B = 'agiworkforce-cloud://chat/b';
const SSO = 'agiworkforce-cloud://sso-callback?rotating_token_nonce=nonce-abc123';

function tempQueueFile(): string {
  return path.join(mkdtempSync(path.join(os.tmpdir(), 'agi-deep-links-')), 'queue.json');
}

describe('deep-link queue', () => {
  it('keeps arrival order and the first place of a repeated link', () => {
    let queue = enqueueDeepLink([], CHAT_A, 1);
    queue = enqueueDeepLink(queue, CHAT_B, 2);
    queue = enqueueDeepLink(queue, CHAT_A, 3);

    expect(queue.map((entry) => entry.url)).toEqual([CHAT_A, CHAT_B]);
  });

  it('drops the oldest link past the limit', () => {
    let queue = enqueueDeepLink([], CHAT_A, 0);
    for (let index = 0; index < DEEP_LINK_QUEUE_LIMIT; index += 1) {
      queue = enqueueDeepLink(queue, `agiworkforce-cloud://chat/${index}`, index + 1);
    }

    expect(queue).toHaveLength(DEEP_LINK_QUEUE_LIMIT);
    expect(queue.map((entry) => entry.url)).not.toContain(CHAT_A);
  });

  it('lets a link expire', () => {
    const queue = [
      { url: CHAT_A, receivedAt: 0 },
      { url: CHAT_B, receivedAt: DEEP_LINK_QUEUE_TTL_MS },
    ];

    expect(freshDeepLinks(queue, DEEP_LINK_QUEUE_TTL_MS + 1).map((entry) => entry.url)).toEqual([
      CHAT_B,
    ]);
  });

  it('survives a relaunch in order, and leaves the sign-in nonce off the disk', () => {
    const file = tempQueueFile();
    let queue = enqueueDeepLink([], SSO, 1_000);
    queue = enqueueDeepLink(queue, CHAT_A, 1_001);
    queue = enqueueDeepLink(queue, CHAT_B, 1_002);

    saveDeepLinkQueue(file, queue);

    expect(readFileSync(file, 'utf8')).not.toContain('nonce-abc123');
    expect(loadDeepLinkQueue(file, 2_000).map((entry) => entry.url)).toEqual([CHAT_A, CHAT_B]);
    expect(loadDeepLinkQueue(file, 1_000 + DEEP_LINK_QUEUE_TTL_MS + 5)).toEqual([]);
  });

  it('puts held links ahead of ones that arrived during this launch', () => {
    const merged = mergeDeepLinkQueues(
      [{ url: CHAT_A, receivedAt: 1 }],
      [
        { url: CHAT_B, receivedAt: 5 },
        { url: CHAT_A, receivedAt: 6 },
      ],
    );

    expect(merged.map((entry) => entry.url)).toEqual([CHAT_A, CHAT_B]);
  });

  it('holds a link whose id cannot be decoded without throwing, and never writes it down', () => {
    const file = tempQueueFile();
    const malformed = 'agiworkforce-cloud://chat/%';
    let queue = enqueueDeepLink([], malformed, 1_000);
    queue = enqueueDeepLink(queue, CHAT_A, 1_001);

    expect(() => saveDeepLinkQueue(file, queue)).not.toThrow();
    expect(readFileSync(file, 'utf8')).not.toContain(malformed);
    expect(loadDeepLinkQueue(file, 2_000).map((entry) => entry.url)).toEqual([CHAT_A]);
    expect(
      parseDeepLinkQueue(JSON.stringify([{ url: malformed, receivedAt: 1_000 }]), 2_000),
    ).toEqual([]);
  });

  it('removes the file once nothing is waiting, and reads a damaged file as empty', () => {
    const file = tempQueueFile();
    saveDeepLinkQueue(file, enqueueDeepLink([], CHAT_A, 1));
    saveDeepLinkQueue(file, []);
    expect(existsSync(file)).toBe(false);
    expect(loadDeepLinkQueue(file, 2)).toEqual([]);
  });
});
