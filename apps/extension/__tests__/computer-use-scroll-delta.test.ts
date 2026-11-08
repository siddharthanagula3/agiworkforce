import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settleAutomationAttempt } from '@agiworkforce/types';
import type { AgentLoopOptions } from '../src/features/computer-use/agentLoop';

type CdpDriverModule = typeof import('../src/features/computer-use/cdpDriver');
type CloudAgentClientModule = typeof import('../src/features/computer-use/cloudAgentClient');
type PageWatchModule = typeof import('../src/features/browser-tools/pageWatch');
type AutomationAuditModule = typeof import('../src/features/observability/automationAudit');

const harness = vi.hoisted(() => ({
  scroll: vi.fn(),
  readScrollPosition: vi.fn(),
  settleScrollPosition: vi.fn(),
  getPageContent: vi.fn(),
  callCloud: vi.fn(),
}));

vi.mock('../src/features/computer-use/cdpDriver', async (importOriginal) => ({
  ...(await importOriginal<CdpDriverModule>()),
  ensureOnDetachListener: vi.fn(),
  registerActiveTab: vi.fn(),
  unregisterActiveTab: vi.fn(),
  waitForStable: vi.fn(async () => undefined),
  screenshot: vi.fn(async () => 'test-png'),
  keepPageFocused: vi.fn(async () => undefined),
  assertDestinationAllowlisted: vi.fn(async () => undefined),
  scroll: harness.scroll,
  readScrollPosition: harness.readScrollPosition,
  settleScrollPosition: harness.settleScrollPosition,
  getPageContent: harness.getPageContent,
}));
vi.mock('../src/features/computer-use/cloudAgentClient', async (importOriginal) => ({
  ...(await importOriginal<CloudAgentClientModule>()),
  resolveGatewayBase: vi.fn(async () => 'https://gateway.example.test'),
  getAuthToken: vi.fn(async () => 'test-token'),
  callCloud: harness.callCloud,
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

vi.stubGlobal('chrome', {
  tabs: { get: vi.fn(async () => ({ id: 7, url: 'http://127.0.0.1:8765/act.html' })) },
  runtime: { lastError: null },
});

const { runAgentLoop } = await import('../src/features/computer-use/agentLoop');

beforeEach(() => {
  harness.scroll.mockReset().mockResolvedValue(undefined);
  harness.readScrollPosition.mockReset().mockResolvedValue({ x: 0, y: 0 });
  harness.settleScrollPosition.mockReset().mockResolvedValue({ x: 0, y: 500 });
  harness.getPageContent.mockReset().mockResolvedValue('URL: http://127.0.0.1:8765/act.html');
  harness.callCloud.mockReset();
});

async function scroll(
  args: Record<string, unknown>,
  options: AgentLoopOptions = {},
): Promise<string> {
  harness.callCloud
    .mockResolvedValueOnce({
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'scroll-call',
            type: 'function',
            function: { name: 'scroll', arguments: JSON.stringify(args) },
          },
        ],
      },
      isDone: false,
      tokensUsed: 1,
    })
    .mockResolvedValueOnce({
      message: { role: 'assistant', content: 'Scrolled.' },
      isDone: true,
      tokensUsed: 1,
    });
  const result = await runAgentLoop('Scroll the page', 7, {
    ...options,
    maxSteps: 2,
    runId: 'scroll-run',
    onBeforeAction: async () => true,
  });
  const message = result.history.find((item) => item.role === 'tool');
  return String(message?.content ?? '');
}

describe('page scroll keeps a numeric distance', () => {
  it.each([
    { dy: 500, toSelector: '' },
    { dy: 500, toSelector: ' body ' },
  ])('scrolls by dy when toSelector is $toSelector', async (args) => {
    const text = await scroll(args);
    expect(harness.scroll).toHaveBeenCalledExactlyOnceWith(
      7,
      { dy: 500, dx: undefined, index: undefined },
      undefined,
    );
    expect(text).toContain('Scrolled by dx=0, dy=500px');
    expect(text).not.toContain('selector into view');
  });

  it('asks the driver to reveal a non-document element only when no distance was given', async () => {
    const text = await scroll({ toSelector: ' #mark ' });
    expect(harness.scroll).toHaveBeenCalledExactlyOnceWith(7, { toSelector: '#mark' }, undefined);
    expect(text).toContain('Scrolled selector into view: #mark');
  });

  it('does not query an empty selector when no distance was given', async () => {
    const text = await scroll({ toSelector: '   ' });
    expect(harness.scroll).not.toHaveBeenCalled();
    expect(text).toContain('scroll requires dx, dy or toSelector');
  });
});
