import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOWNLOAD_COMPLETION_TIMEOUT_MS,
  formatDownloadRecord,
  listSessionDownloads,
  startBrowserToolDownload,
  waitForBrowserToolDownload,
  type DownloadRecord,
} from '../src/features/browser-tools/downloads';
import { settleAutomationAttempt } from '@agiworkforce/types';

type TabAuthorityModule = typeof import('../src/features/browser-tools/tabAuthority');
type SitePolicyStoreModule = typeof import('../src/features/site-policy/store');
type CdpDriverModule = typeof import('../src/features/computer-use/cdpDriver');
type CloudAgentClientModule = typeof import('../src/features/computer-use/cloudAgentClient');
type PageWatchModule = typeof import('../src/features/browser-tools/pageWatch');
type AutomationAuditModule = typeof import('../src/features/observability/automationAudit');

const harness = vi.hoisted(() => ({
  cloud: vi.fn(),
  nextId: 100,
  state: 'in_progress' as 'in_progress' | 'complete' | 'interrupted',
}));
vi.mock('../src/features/browser-tools/tabAuthority', async (importOriginal) => ({
  ...(await importOriginal<TabAuthorityModule>()),
  authorizeBrowserToolTab: vi.fn(async (tabId: number) => ({
    tabId,
    url: 'https://example.com/page',
    origin: 'https://example.com',
    profileId: null,
  })),
}));
vi.mock('../src/features/site-policy/store', async (importOriginal) => ({
  ...(await importOriginal<SitePolicyStoreModule>()),
  assertSiteAccess: vi.fn(async () => undefined),
}));
vi.mock('../src/features/computer-use/cdpDriver', async (importOriginal) => ({
  ...(await importOriginal<CdpDriverModule>()),
  ensureOnDetachListener: vi.fn(),
  registerActiveTab: vi.fn(),
  unregisterActiveTab: vi.fn(),
  waitForStable: vi.fn(async () => undefined),
  screenshot: vi.fn(async () => 'test-png'),
  getPageContent: vi.fn(async () => 'URL: https://example.com/page\nDownload sample.txt'),
}));
vi.mock('../src/features/computer-use/cloudAgentClient', async (importOriginal) => ({
  ...(await importOriginal<CloudAgentClientModule>()),
  resolveGatewayBase: vi.fn(async () => 'https://gateway.example.test'),
  callCloud: harness.cloud,
}));
vi.mock('../src/features/browser-tools/pageWatch', async (importOriginal) => ({
  ...(await importOriginal<PageWatchModule>()),
  startPageWatch: vi.fn(async () => undefined),
  stopPageWatch: vi.fn(async () => undefined),
}));
vi.mock('../src/features/observability/automationAudit', async (importOriginal) => ({
  ...(await importOriginal<AutomationAuditModule>()),
  recordAutomationAction: vi.fn(
    async (
      attempt: Parameters<typeof settleAutomationAttempt>[0],
      settlement: Parameters<typeof settleAutomationAttempt>[1],
    ) => settleAutomationAttempt(attempt, settlement),
  ),
}));

const { runAgentLoop } = await import('../src/features/computer-use/agentLoop');
let search: ReturnType<typeof vi.fn>;

function nativeItem(record: DownloadRecord, state = harness.state) {
  return {
    id: record.id,
    url: record.url,
    filename: '/Users/private/Downloads/sample.txt',
    state,
    bytesReceived: state === 'complete' ? 35 : 0,
    totalBytes: 35,
    ...(state === 'interrupted' ? { error: 'NETWORK_FAILED' } : {}),
  };
}

async function start(): Promise<DownloadRecord> {
  search.mockResolvedValueOnce([]);
  const record = await startBrowserToolDownload(7, '/sample.txt');
  await Promise.resolve();
  await Promise.resolve();
  search.mockImplementation(async () => [nativeItem(record)]);
  return record;
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.state = 'in_progress';
  harness.cloud.mockReset();
  search = vi.fn(async () => []);
  vi.stubGlobal('chrome', {
    tabs: { get: vi.fn(async () => ({ id: 7, url: 'https://example.com/page' })) },
    runtime: { lastError: null },
    storage: { session: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    downloads: { download: vi.fn(async () => ++harness.nextId), search },
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('owned Chrome download completion', () => {
  it('reads Chrome completion and exact bytes, with no local path in the formatted result', async () => {
    const record = await start();
    harness.state = 'complete';
    const assertCurrent = vi.fn(async () => undefined);
    const completed = await waitForBrowserToolDownload(record, { assertCurrent });
    expect(completed).toMatchObject({ state: 'complete', bytesReceived: 35, totalBytes: 35 });
    expect(assertCurrent.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(formatDownloadRecord(completed)).toBe('Downloaded sample.txt (35 bytes).');
    expect(formatDownloadRecord(completed)).not.toContain('/Users/');
  });

  it('polls the canonical ledger until Chrome reports completion', async () => {
    const record = await start();
    const result = waitForBrowserToolDownload(record, { assertCurrent: async () => undefined });
    await vi.advanceTimersByTimeAsync(100);
    harness.state = 'complete';
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ state: 'complete', bytesReceived: 35 });
    expect(search.mock.calls.length).toBeGreaterThan(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns an honest in-progress state at the wait deadline', async () => {
    const record = await start();
    const result = waitForBrowserToolDownload(record, {
      assertCurrent: async () => undefined,
      timeoutMs: 250,
    });
    await vi.advanceTimersByTimeAsync(250);
    expect((await result).state).toBe('in_progress');
    expect(formatDownloadRecord(await result)).toContain('still in progress');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stalled native search instead of waiting indefinitely', async () => {
    const record = await start();
    search.mockReturnValue(new Promise(() => {}));
    const result = waitForBrowserToolDownload(record, {
      assertCurrent: async () => undefined,
      timeoutMs: 250,
    });
    await vi.advanceTimersByTimeAsync(250);
    expect((await result).state).toBe('in_progress');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports interrupted download status instead of completion', async () => {
    const record = await start();
    harness.state = 'interrupted';
    const result = await waitForBrowserToolDownload(record, {
      assertCurrent: async () => undefined,
    });
    expect(result.state).toBe('interrupted');
    expect(formatDownloadRecord(result)).toContain('interrupted: NETWORK_FAILED');
  });

  it('checks Stop during a pending read and ignores late data', async () => {
    const record = await start();
    let complete!: (items: unknown[]) => void;
    search.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const controller = new AbortController();
    const stopped = new Error('The owning browser run stopped.');
    const result = waitForBrowserToolDownload(record, {
      assertCurrent: async () => undefined,
      signal: controller.signal,
    });
    const rejected = expect(result).rejects.toBe(stopped);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(stopped);
    await rejected;
    complete([nativeItem(record, 'complete')]);
    await vi.advanceTimersByTimeAsync(0);
    expect((await listSessionDownloads()).find((entry) => entry.id === record.id)?.state).toBe(
      'in_progress',
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks ownership during the polling delay and never starts another read after an account swap', async () => {
    const record = await start();
    let current = true;
    const result = waitForBrowserToolDownload(record, {
      assertCurrent: async () => {
        if (!current) throw new Error('The captured owner changed.');
      },
    });
    const rejected = expect(result).rejects.toThrow('captured owner changed');
    await vi.advanceTimersByTimeAsync(0);
    const reads = search.mock.calls.length;
    current = false;
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(search.mock.calls.length).toBe(reads);
  });

  it('refuses a record that was not captured from this download action', async () => {
    const record = await start();
    const reads = search.mock.calls.length;
    await expect(
      waitForBrowserToolDownload(
        { ...record, url: 'https://other.example/file' },
        {
          assertCurrent: async () => undefined,
        },
      ),
    ).rejects.toThrow('no longer belongs');
    expect(search.mock.calls.length).toBe(reads);
  });

  it('cannot extend the bounded read beyond its owner-defined maximum', async () => {
    const record = await start();
    await expect(
      waitForBrowserToolDownload(record, {
        assertCurrent: async () => undefined,
        timeoutMs: DOWNLOAD_COMPLETION_TIMEOUT_MS + 1,
      }),
    ).rejects.toThrow('allowed time budget');
  });

  it.each(['complete', 'interrupted', 'in_progress'] as const)(
    'gives the actual agent loop a truthful %s receipt and minimal provider data',
    async (state) => {
      harness.state = state;
      search.mockImplementation(async () => [
        nativeItem({ id: harness.nextId, url: 'https://example.com/sample.txt' } as DownloadRecord),
      ]);
      harness.cloud
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'download-call',
                type: 'function',
                function: { name: 'download_file', arguments: '{"url":"/sample.txt"}' },
              },
            ],
          },
          isDone: false,
          tokensUsed: 1,
        })
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: 'Download state checked.' },
          isDone: true,
          tokensUsed: 1,
        });
      const onProgress = vi.fn();
      const result = runAgentLoop('Download the sample file', 7, {
        runId: 'download-run',
        maxSteps: 2,
        onBeforeAction: async () => true,
        resolveOwnedCredential: async () => 'test-token',
        assertOwnership: async () => undefined,
        onProgress,
      });
      await vi.advanceTimersByTimeAsync(DOWNLOAD_COMPLETION_TIMEOUT_MS);
      const tool = (await result).history.find((message) => message.role === 'tool');
      expect(tool?.content).toContain(`Chrome download state: ${state}`);
      expect(tool?.content).toContain('Requested URL: https://example.com/sample.txt');
      expect(tool?.content).not.toContain('/Users/private');
      const receipt = onProgress.mock.calls.find(([step]) => step.kind === 'tool_result')?.[0]
        .actionOutcome;
      expect(receipt).toMatchObject({
        verified: state === 'complete',
        status: state === 'complete' ? 'succeeded' : 'failed',
      });
    },
  );
});
