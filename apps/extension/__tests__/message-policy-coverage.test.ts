import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  DOM_MUTATION_MESSAGE_TYPES,
  EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
  MESSAGE_POLICY,
  isTrustedExtensionPageSender,
} from '../src/background/policy';

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
      'WEBMCP_TOOLS_CHANGED',
      'IN_PAGE_PROMPT',
      'OPEN_SIDE_PANEL',
    ]) {
      expect(MESSAGE_POLICY[type]?.senderClass).toBe('allowlisted-tab');
    }
  });
});

function executableDispatcher() {
  const source = ts.createSourceFile(
    'background.ts',
    backgroundSource,
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations = ['senderTabAllowedToMutate', 'dispatchAuthorizedMessage'].map((name) => {
    const node = source.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    );
    if (!node) throw new Error(`Missing background function ${name}`);
    return node.getText(source);
  });
  const handleMessageAsync = vi.fn(async () => ({ success: true }));
  const code = ts.transpileModule(declarations.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const dispatch = runInNewContext(`${code}\ndispatchAuthorizedMessage;`, {
    EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
    DOM_MUTATION_MESSAGE_TYPES,
    isTrustedExtensionPageSender,
    handleMessageAsync,
    chrome: {
      runtime: { id: 'extension-test', getURL: () => 'chrome-extension://extension-test/' },
    },
    logger: { warn: vi.fn(), error: vi.fn() },
    originOfUrl: (url: string) => new URL(url).origin,
  }) as (message: unknown, sender: unknown, response: (value: unknown) => void) => boolean;
  return { dispatch, handleMessageAsync };
}

function elementMessage(type: string, tabId: number | undefined) {
  return type === 'FILL_FIELDS'
    ? { type, tabId, fields: [{ selector: '#name', value: 'Ada' }] }
    : { type, tabId, query: 'name' };
}

describe('element messages enforce the actual background target gate', () => {
  it.each(['FIND_ELEMENTS', 'FILL_FIELDS'])(
    'rejects a foreign tab for %s before dispatch',
    (type) => {
      const { dispatch, handleMessageAsync } = executableDispatcher();
      const response = vi.fn();
      expect(
        dispatch(
          elementMessage(type, 99),
          { tab: { id: 10, url: 'https://approved.example/' } },
          response,
        ),
      ).toBe(false);
      expect(response).toHaveBeenCalledWith({
        success: false,
        error: 'Cross-tab DOM mutation is not allowed.',
      });
      expect(handleMessageAsync).not.toHaveBeenCalled();
    },
  );
  it.each(['FIND_ELEMENTS', 'FILL_FIELDS'])(
    'admits %s with its sender tab or an implicit target',
    async (type) => {
      for (const tabId of [10, undefined]) {
        const { dispatch, handleMessageAsync } = executableDispatcher();
        const response = vi.fn();
        const sender = { tab: { id: 10, url: 'https://approved.example/' } };
        const message = elementMessage(type, tabId);
        expect(dispatch(message, sender, response)).toBe(true);
        expect(handleMessageAsync).toHaveBeenCalledWith(message, sender);
        await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ success: true }));
      }
    },
  );
});
