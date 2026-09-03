import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTENSION_PAGE_ONLY_MESSAGE_TYPES, MESSAGE_POLICY } from '../src/background/policy';

const backgroundSource = readFileSync(resolve(process.cwd(), 'src/background.ts'), 'utf8');

function readDispatcherBody(): string {
  const start = backgroundSource.indexOf('async function handleMessageAsync(');
  expect(start).toBeGreaterThan(-1);
  const end = backgroundSource.indexOf('\n}\n', start);
  expect(end).toBeGreaterThan(start);
  return backgroundSource.slice(start, end);
}

function handledMessageTypes(): string[] {
  const body = readDispatcherBody();
  const types = [...body.matchAll(/^ {4}case '([A-Z_]+)'/gm)].map((match) => match[1] as string);
  return [...new Set(types)];
}

describe('MESSAGE_POLICY covers every dispatched message type', () => {
  it('finds the dispatcher cases (guards against the regex silently matching nothing)', () => {
    const handled = handledMessageTypes();
    expect(handled.length).toBeGreaterThan(40);
    expect(handled).toContain('CHAT_MESSAGE');
  });

  it('has an explicit entry for every handled type, no silent default inheritance', () => {
    const missing = handledMessageTypes().filter((type) => !Object.hasOwn(MESSAGE_POLICY, type));
    expect(missing).toEqual([]);
  });
});

describe('handlers with no content-script sender are extension-page-only', () => {
  it('gates the memory store (read and write)', () => {
    for (const type of ['LIST_MEMORIES', 'ADD_MEMORY', 'UPDATE_MEMORY', 'DELETE_MEMORY']) {
      expect(EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(type)).toBe(true);
    }
  });

  it('gates quick mode and the tab-group commands', () => {
    for (const type of [
      'GET_QUICK_MODE',
      'SET_QUICK_MODE',
      'GET_TAB_GROUP_STATE',
      'ADD_TAB_TO_GROUP',
      'REMOVE_TAB_FROM_GROUP',
    ]) {
      expect(EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(type)).toBe(true);
    }
  });

  it('gates account-backed conversation mirroring (enqueue and delete)', () => {
    for (const type of ['SYNC_CONVERSATION', 'DELETE_CLOUD_CONVERSATION']) {
      expect(EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(type)).toBe(true);
    }
  });

  it('gates the native-bridge control messages', () => {
    for (const type of ['QUEUE_MESSAGE', 'RECONNECT_NATIVE']) {
      expect(EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(type)).toBe(true);
    }
  });

  it('leaves the content-script senders reachable from an allowlisted tab', () => {
    for (const type of [
      'TAB_READY',
      'SYNC_PAGE_CONTEXT',
      'GET_CONNECTION_STATUS',
      'CAPTURE_SCREENSHOT',
      'NLWEB_DETECTED',
      'NLWEB_PROBE',
      'WEBMCP_TOOLS_CHANGED',
      'IN_PAGE_PROMPT',
      'OPEN_SIDE_PANEL',
    ]) {
      expect(MESSAGE_POLICY[type]?.senderClass).toBe('allowlisted-tab');
    }
  });
});
