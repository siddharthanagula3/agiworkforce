import { afterEach, expect, it, vi } from 'vitest';
import * as driver from '../src/features/computer-use/cdpDriver';
import * as cloud from '../src/features/computer-use/cloudAgentClient';
import { runAgentLoop } from '../src/features/computer-use/agentLoop';
import {
  getPageWatch,
  startPageWatch,
  stopPageWatch,
} from '../src/features/browser-tools/pageWatch';
import {
  acquireDebugger,
  debuggerHoldCount,
  releaseDebugger,
} from '../src/features/computer-use/debuggerSession';

const tabId = 42;
const site = 'https://run.example';

afterEach(async () => {
  for (const owner of getPageWatch(tabId)?.owners ?? []) await stopPageWatch(tabId, owner);
  driver.unregisterActiveTab(tabId);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps successor guards and its watch when an overlapping cancelled run finally settles', async () => {
  const commands = vi.fn(
    (_t: unknown, _method: string, _params: unknown, callback: (r: unknown) => void) =>
      callback({ result: { value: { width: 800, height: 600 } } }),
  );
  const detach = vi.fn((_t: unknown, callback: () => void) => callback());
  vi.stubGlobal('chrome', {
    runtime: { lastError: null },
    tabs: { get: async (id: number) => ({ id, url: site + '/test' }) },
    permissions: { contains: async () => true },
    storage: {
      local: {
        get: async () => ({ agi_site_allowlist: [site], agi_cu_browser_control_consent: [site] }),
      },
    },
    debugger: {
      attach: (_t: unknown, _v: unknown, callback: () => void) => callback(),
      detach,
      sendCommand: commands,
      onDetach: { addListener: vi.fn() },
      onEvent: { addListener: vi.fn() },
    },
  });
  vi.spyOn(driver, 'waitForStable').mockResolvedValue();
  vi.spyOn(driver, 'screenshot').mockResolvedValue('synthetic-snapshot');
  vi.spyOn(driver, 'getPageContent').mockResolvedValue('Synthetic DOM observation');
  vi.spyOn(cloud, 'resolveGatewayBase').mockResolvedValue(site);

  let releaseOldCredential!: (credential: string) => void;
  const oldCredential = new Promise<string>((resolve) => {
    releaseOldCredential = resolve;
  });
  const oldCredentialRequested = vi.fn(() => oldCredential);
  const oldStop = new AbortController();
  let oldOwned = true;
  const oldRun = runAgentLoop('Old synthetic run', tabId, {
    runId: 'same-logical-run-id',
    signal: oldStop.signal,
    resolveOwnedCredential: oldCredentialRequested,
    assertOwnership: () => {
      if (!oldOwned) throw new Error('Old run retired');
    },
  }).catch((error) => error as Error);
  await vi.waitFor(() => expect(oldCredentialRequested).toHaveBeenCalled());
  await startPageWatch(tabId, 'user');

  let finishNew!: (reply: Awaited<ReturnType<typeof cloud.callCloud>>) => void;
  const newReply = new Promise<Awaited<ReturnType<typeof cloud.callCloud>>>((resolve) => {
    finishNew = resolve;
  });
  const callCloud = vi.spyOn(cloud, 'callCloud').mockReturnValue(newReply);
  oldOwned = false;
  oldStop.abort(new Error('Old run stopped'));
  let newOwned = true;
  const successor = runAgentLoop('New synthetic run', tabId, {
    runId: 'same-logical-run-id',
    resolveOwnedCredential: async () => 'synthetic-new-credential',
    assertOwnership: () => {
      if (!newOwned) throw new Error('Successor ownership refused');
    },
  });
  await vi.waitFor(() => expect(callCloud).toHaveBeenCalled());
  const overlappingOwners = getPageWatch(tabId)!.owners;
  expect(overlappingOwners).toHaveLength(3);
  expect(new Set(overlappingOwners).size).toBe(3);

  releaseOldCredential('synthetic-old-credential');
  expect(await oldRun).toBeInstanceOf(Error);
  expect(getPageWatch(tabId)!.owners).toHaveLength(2);
  expect(getPageWatch(tabId)!.owners).toContain('user');
  expect(detach).not.toHaveBeenCalled();

  newOwned = false;
  const sentBeforeRefusal = commands.mock.calls.length;
  await expect(driver.hover(tabId, { x: 10, y: 10 })).rejects.toThrow(
    'Successor ownership refused',
  );
  expect(commands).toHaveBeenCalledTimes(sentBeforeRefusal);
  newOwned = true;
  finishNew({
    message: { role: 'assistant', content: 'Synthetic run complete' },
    isDone: true,
    tokensUsed: 0,
  });
  expect((await successor).finalMessage).toBe('Synthetic run complete');
  expect(getPageWatch(tabId)!.owners).toEqual(['user']);
  expect(debuggerHoldCount(tabId)).toBe(1);
  await acquireDebugger(tabId);
  expect(debuggerHoldCount(tabId)).toBe(2);
  await releaseDebugger(tabId);
  expect(debuggerHoldCount(tabId)).toBe(1);
  expect(detach).not.toHaveBeenCalled();
  await stopPageWatch(tabId, 'user');
  expect(getPageWatch(tabId)).toBeNull();
  expect(detach).toHaveBeenCalled();
});
