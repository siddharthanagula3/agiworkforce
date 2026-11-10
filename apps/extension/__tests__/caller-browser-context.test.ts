import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ComputerUseRunCoordinator } from '../src/features/computer-use/runOwnership';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCallerBrowserContext,
  parseCallerBrowserContext,
  readCallerBrowserContext,
} from '../src/features/cloud-bridge/callerBrowserContext';

const original = {
  tabId: 17,
  windowId: 3,
  url: 'https://example.test/application',
  documentId: 'website-document',
};
const get = vi.fn();
const executeScript = vi.fn();
beforeEach(() => {
  get.mockReset().mockResolvedValue({ id: 17, windowId: 3, url: original.url, status: 'complete' });
  executeScript
    .mockReset()
    .mockResolvedValue([{ documentId: original.documentId, result: original.url }]);
  vi.stubGlobal('chrome', { tabs: { get }, scripting: { executeScript } });
});
afterEach(() => vi.unstubAllGlobals());

describe('caller browser context', () => {
  it('reads the exact original tab/window/document through the existing document bridge', async () => {
    expect(await readCallerBrowserContext(original, () => undefined)).toEqual(original);
    expect(get).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: original.tabId } }),
    );
  });
  it('captures Chrome window identity without inventing an unobserved document', async () => {
    expect(
      await captureCallerBrowserContext(
        { tabId: 17, url: original.url },
        undefined,
        () => undefined,
      ),
    ).toEqual({ tabId: 17, windowId: 3, url: original.url });
    expect(executeScript).not.toHaveBeenCalled();
  });
  it('refuses a window move after submission even when tab and URL remain the same', async () => {
    await expect(
      captureCallerBrowserContext(
        { tabId: 17, windowId: 99, url: original.url },
        undefined,
        () => undefined,
      ),
    ).rejects.toThrow('page changed');
  });
  it('captures and verifies document identity only when existing site access permits it', async () => {
    expect(
      await captureCallerBrowserContext(
        { tabId: 17, windowId: 3, url: original.url },
        undefined,
        () => undefined,
        true,
      ),
    ).toEqual(original);
    expect(executeScript).toHaveBeenCalledTimes(2);
  });
  it('refuses a reload between document capture and verification', async () => {
    executeScript
      .mockResolvedValueOnce([{ documentId: original.documentId, result: original.url }])
      .mockResolvedValueOnce([{ documentId: 'replacement', result: original.url }]);
    await expect(
      captureCallerBrowserContext(
        { tabId: 17, windowId: 3, url: original.url },
        undefined,
        () => undefined,
        true,
      ),
    ).rejects.toThrow('page changed');
  });
  it('copies the context before native reads yield', async () => {
    const input = { ...original };
    get.mockImplementationOnce(async () => {
      input.documentId = 'replacement';
      input.windowId = 99;
      return { id: 17, windowId: 3, url: original.url };
    });
    expect(await readCallerBrowserContext(input, () => undefined)).toEqual(original);
  });
  it.each([
    { id: 99 },
    { windowId: 99 },
    { url: 'https://other.example.test/' },
    { status: 'loading' },
  ])('refuses changed tab identity %j before document access', async (change) => {
    get.mockResolvedValueOnce({ id: 17, windowId: 3, url: original.url, ...change });
    await expect(readCallerBrowserContext(original, () => undefined)).rejects.toThrow(
      'page changed',
    );
    expect(executeScript).not.toHaveBeenCalled();
  });
  it('refuses a same-URL document replacement', async () => {
    executeScript.mockResolvedValueOnce([
      { documentId: 'replacement-document', result: original.url },
    ]);
    await expect(readCallerBrowserContext(original, () => undefined)).rejects.toThrow(
      'page changed',
    );
  });
  it('refuses a window move while document verification yields', async () => {
    get
      .mockResolvedValueOnce({ id: 17, windowId: 3, url: original.url })
      .mockResolvedValueOnce({ id: 17, windowId: 99, url: original.url });
    await expect(readCallerBrowserContext(original, () => undefined)).rejects.toThrow(
      'page changed',
    );
  });
  it('checks cancellation after native reads before document access', async () => {
    let current = true;
    get.mockImplementationOnce(async () => {
      current = false;
      return { id: 17, windowId: 3, url: original.url };
    });
    await expect(
      readCallerBrowserContext(original, () => {
        if (!current) throw new Error('retired');
      }),
    ).rejects.toThrow('retired');
    expect(executeScript).not.toHaveBeenCalled();
  });
  it.each([
    { ...original, tabId: -1 },
    { ...original, windowId: NaN },
    { ...original, url: 'chrome://settings' },
    { ...original, url: 'https://user:password@example.test/' },
    { ...original, documentId: '' },
    { ...original, documentId: 'invalid\nidentity' },
    { ...original, foreign: true },
  ])('refuses invalid saved context before native reads %j', async (value) => {
    expect(() => parseCallerBrowserContext(value)).toThrow();
    await expect(readCallerBrowserContext(value, () => undefined)).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
});

describe('native browser task completion context', () => {
  function completion() {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
      'utf8',
    );
    const program = ts.createSourceFile('background.ts', source, ts.ScriptTarget.Latest, true);
    let callback: ts.Expression | undefined;
    function find(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'completion' &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isPropertyAccessExpression(node.initializer.expression) &&
        node.initializer.expression.name.text === 'then'
      ) {
        const invocation = node.initializer.expression.expression;
        if (
          ts.isCallExpression(invocation) &&
          invocation.expression.getText(program) === 'runAgentLoop'
        )
          callback = node.initializer.arguments[0];
      }
      ts.forEachChild(node, find);
    }
    find(program);
    if (!callback) throw new Error('Native completion context callback not found');
    const computerUseRuns = new ComputerUseRunCoordinator();
    const lease = computerUseRuns.begin({
      runId: 'task-a',
      generation: 2,
      tabId: 17,
      windowId: 3,
      tabIntentUrl: original.url,
      authOwner: { accountId: 'account-a', authIncarnation: 'session-a' },
      credential: 'fixture',
    });
    computerUseRuns.setActionInFlight(lease, true);
    const transition = computerUseRuns.beginTabTransition(lease, 18);
    const url = 'https://example.test/jobs';
    computerUseRuns.commitTabTransition(lease, transition, url);
    computerUseRuns.setActionInFlight(lease, false);
    get.mockResolvedValue({ id: 18, windowId: 3, url, status: 'complete' });
    executeScript.mockResolvedValue([{ documentId: 'task-document', result: url }]);
    const assertComputerUseOwnership = vi.fn(async () => {
      computerUseRuns.assertCurrent(lease);
    });
    const compiled = ts.transpileModule(`return (${callback.getText(program)});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    });
    // llm-guardrail-allow: executes the native completion callback with isolated Chrome and credential dependencies.
    const run = new Function(
      'assertComputerUseOwnership',
      'captureCallerBrowserContext',
      'lease',
      'computerUseRuns',
      'callerTask',
      compiled.outputText,
    )(
      assertComputerUseOwnership,
      captureCallerBrowserContext,
      lease,
      computerUseRuns,
      undefined,
    ) as () => Promise<unknown>;
    return { run, computerUseRuns, lease, assertComputerUseOwnership, url };
  }

  it('captures the committed task tab document before releasing its lease', async () => {
    const h = completion();
    await expect(h.run()).resolves.toEqual({
      tabId: 18,
      windowId: 3,
      url: h.url,
      documentId: 'task-document',
    });
    expect(h.assertComputerUseOwnership).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 18 } }));
    expect(h.computerUseRuns.isCurrent(h.lease)).toBe(true);
  });

  it('does not return a context after cancellation during native document capture', async () => {
    const h = completion();
    executeScript.mockImplementationOnce(async () => {
      h.computerUseRuns.cancel('user_stopped', h.lease.runId);
      return [{ documentId: 'task-document', result: h.url }];
    });
    await expect(h.run()).rejects.toThrow();
    expect(h.assertComputerUseOwnership).toHaveBeenCalledTimes(1);
  });

  it('refuses a task page changed before the completion capture', async () => {
    const h = completion();
    get.mockResolvedValue({
      id: 18,
      windowId: 3,
      url: 'https://example.test/unrelated',
      status: 'complete',
    });
    await expect(h.run()).rejects.toThrow('page changed');
    expect(executeScript).not.toHaveBeenCalled();
  });
});
