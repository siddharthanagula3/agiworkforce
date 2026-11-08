import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settleAutomationAttempt } from '@agiworkforce/types';
import type { AgentLoopOptions, AgentLoopStep } from '../src/features/computer-use/agentLoop';
import { BROWSER_TOOL_DEFINITIONS } from '../src/features/computer-use/browserToolDefinitions';
import {
  approvalRequirement,
  describeApprovalReason,
} from '../src/features/computer-use/approvalPolicy';
import { describeComputerUseAction } from '../src/features/computer-use/describeAction';

type CdpDriverModule = typeof import('../src/features/computer-use/cdpDriver');
type CloudAgentClientModule = typeof import('../src/features/computer-use/cloudAgentClient');
type PageWatchModule = typeof import('../src/features/browser-tools/pageWatch');
type AutomationAuditModule = typeof import('../src/features/observability/automationAudit');

const harness = vi.hoisted(() => ({
  signature: 'select|||flavor|Choose flavor' as string | null,
  getTargetSignature: vi.fn(),
  selectOption: vi.fn(),
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
  assertDestinationAllowlisted: vi.fn(async () => undefined),
  getTargetSignature: harness.getTargetSignature,
  selectOption: harness.selectOption,
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
  tabs: { get: vi.fn(async () => ({ id: 7, url: 'https://example.com/form' })) },
  runtime: { lastError: null },
});

const { runAgentLoop } = await import('../src/features/computer-use/agentLoop');

beforeEach(() => {
  harness.signature = 'select|||flavor|Choose flavor';
  harness.getTargetSignature.mockReset().mockImplementation(async () => harness.signature);
  harness.selectOption.mockReset().mockResolvedValue({
    selectedValue: 'b',
    selectedLabel: 'Beta',
    eventSource: 'dom',
    changed: true,
  });
  harness.getPageContent
    .mockReset()
    .mockResolvedValueOnce('URL: https://example.com/form\n[3] select "Choose flavor"')
    .mockResolvedValue('URL: https://example.com/form\nSelected: Beta');
  harness.callCloud.mockReset();
});

async function select(
  args: Record<string, unknown>,
  options: AgentLoopOptions = {},
): Promise<{ text: string; steps: AgentLoopStep[] }> {
  harness.callCloud
    .mockResolvedValueOnce({
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'select-call',
            type: 'function',
            function: {
              name: 'select_option',
              arguments: JSON.stringify(args),
            },
          },
        ],
      },
      isDone: false,
      tokensUsed: 1,
    })
    .mockResolvedValueOnce({
      message: { role: 'assistant', content: 'Selection checked.' },
      isDone: true,
      tokensUsed: 1,
    });
  const steps: AgentLoopStep[] = [];
  const result = await runAgentLoop('Choose Beta', 7, {
    ...options,
    maxSteps: 2,
    runId: 'select-run',
    onProgress: (step) => steps.push(step),
  });
  const message = result.history.find((item) => item.role === 'tool');
  expect(typeof message?.content).toBe('string');
  return { text: message?.content as string, steps };
}

describe('approved DOM dropdown selection', () => {
  it.each([
    { pageUrl: 'https://example.com/form', expected: { alwaysAsk: true, reason: 'selection' } },
    {
      pageUrl: 'https://chase.com/transfer',
      expected: { alwaysAsk: true, reason: 'sensitive_site', siteClass: 'banking' },
    },
    { pageUrl: null, expected: { alwaysAsk: true, reason: 'unidentified_input' } },
  ])(
    'classifies the page context before ordinary dropdown policy: $pageUrl',
    ({ pageUrl, expected }) => {
      const requirement = approvalRequirement({
        toolName: 'select_option',
        args: { index: 3, matchBy: 'label', option: 'Beta' },
        pageUrl,
        targetSignature: harness.signature,
      });
      expect(requirement).toEqual(expected);
      expect(describeApprovalReason(requirement)).not.toBeNull();
    },
  );

  it('keeps a declined permission dropdown from reaching the page', async () => {
    harness.signature = 'select|||memberRole|Member role';
    const approve = vi.fn(async () => false);
    const { text } = await select(
      { index: 3, matchBy: 'value', option: 'admin' },
      { onBeforeAction: approve },
    );
    expect(approve).toHaveBeenCalledWith('select_option', expect.any(Object), undefined, {
      alwaysAsk: true,
      reason: 'permission_change',
    });
    expect(harness.selectOption).not.toHaveBeenCalled();
    expect(text).toContain('skipped');
  });

  it('offers only the indexed, exact-choice contract and names the chosen option', () => {
    const tool = BROWSER_TOOL_DEFINITIONS.find((entry) => entry.function.name === 'select_option')!;
    expect(Object.keys(tool.function.parameters.properties)).toEqual([
      'index',
      'matchBy',
      'option',
    ]);
    expect(tool.function.parameters).toMatchObject({
      required: ['index', 'matchBy', 'option'],
      properties: { matchBy: { type: 'string', enum: ['value', 'label'] } },
      additionalProperties: false,
    });
    for (const keyword of ['oneOf', 'allOf', 'anyOf']) {
      expect(tool.function.parameters).not.toHaveProperty(keyword);
    }
    expect(
      describeComputerUseAction('select_option', { index: 3, matchBy: 'label', option: 'Beta' }),
    ).toBe('Choose option "Beta" in dropdown [3].');
    expect(
      describeComputerUseAction('select_option', { index: 3, matchBy: 'value', option: 'b' }),
    ).toBe('Choose value "b" in dropdown [3].');
  });

  it.each([
    { matchBy: 'value', option: 'b', expected: { value: 'b' } },
    { matchBy: 'label', option: 'Beta', expected: { label: 'Beta' } },
  ])(
    'executes the approved exact choice %j and verifies the page afterward',
    async ({ matchBy, option, expected }) => {
      const approval = vi.fn(async () => true);
      const args = { index: 3, matchBy, option };
      const { text, steps } = await select(args, { onBeforeAction: approval });
      expect(approval).toHaveBeenCalledWith('select_option', args, undefined, {
        alwaysAsk: true,
        reason: 'selection',
      });
      expect(harness.getTargetSignature).toHaveBeenCalledTimes(2);
      expect(harness.selectOption).toHaveBeenCalledExactlyOnceWith(
        7,
        3,
        expected,
        undefined,
        'select|||flavor|Choose flavor',
      );
      expect(harness.getPageContent).toHaveBeenCalledTimes(2);
      expect(harness.getPageContent.mock.invocationCallOrder[1]).toBeGreaterThan(
        harness.selectOption.mock.invocationCallOrder[0]!,
      );
      expect(text).toContain('Selected option "Beta" (value "b")');
      expect(text).toContain('DOM input/change events were sent');
      expect(text).toContain('not trusted native input');
      expect(text).toContain('Selected: Beta');
      expect(steps.find((step) => step.kind === 'tool_result')?.actionOutcome).toMatchObject({
        verification: { passed: true },
      });
    },
  );

  it('reports an unchanged selection without inventing new input events', async () => {
    harness.selectOption.mockResolvedValue({
      selectedValue: 'b',
      selectedLabel: 'Beta',
      eventSource: 'dom',
      changed: false,
    });
    const { text } = await select(
      { index: 3, matchBy: 'value', option: 'b' },
      { onBeforeAction: async () => true },
    );
    expect(text).toContain('already selected; no new input/change events were sent');
  });

  it('keeps an explicitly requested empty value distinct from a missing choice', async () => {
    harness.selectOption.mockResolvedValue({
      selectedValue: '',
      selectedLabel: 'None',
      eventSource: 'dom',
      changed: true,
    });
    const { text } = await select(
      { index: 3, matchBy: 'value', option: '' },
      { onBeforeAction: async () => true },
    );
    expect(harness.selectOption).toHaveBeenCalledExactlyOnceWith(
      7,
      3,
      { value: '' },
      undefined,
      'select|||flavor|Choose flavor',
    );
    expect(text).toContain('Selected option "None" (value "")');
  });

  it('refuses unattended selection even when there is no approval preference callback', async () => {
    const { text } = await select({ index: 3, matchBy: 'value', option: 'b' });
    expect(text).toContain('This run has no way to ask');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it('does not let a page-declared read tool override native selection approval', async () => {
    const legacyOptions = {
      maxSteps: 2,
      siteTools: [{ name: 'select_option', effect: 'read', source: 'imperative' }],
    };
    const { text } = await select({ index: 3, matchBy: 'value', option: 'b' }, legacyOptions);
    expect(text).toContain('This run has no way to ask');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it('does not execute after Skip', async () => {
    const { text } = await select(
      { index: 3, matchBy: 'value', option: 'b' },
      { onBeforeAction: async () => false },
    );
    expect(text).toContain('Action skipped');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it('refuses a dropdown replaced during approval', async () => {
    const { text } = await select(
      { index: 3, matchBy: 'value', option: 'b' },
      {
        onBeforeAction: async () => {
          harness.signature = 'select|||permission|Share permissions';
          return true;
        },
      },
    );
    expect(text).toContain('target changed while approval was pending');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it('refuses the same-looking dropdown after a single-page route change during approval', async () => {
    const tabsGet = (
      chrome.tabs.get as unknown as ReturnType<typeof vi.fn>
    ).getMockImplementation();
    try {
      const { text } = await select(
        { index: 3, matchBy: 'value', option: 'b' },
        {
          onBeforeAction: async () => {
            (chrome.tabs.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
              async () => ({ id: 7, url: 'https://example.com/settings/delete-account' }),
            );
            return true;
          },
        },
      );
      expect(text).toContain('target changed while approval was pending');
      expect(harness.selectOption).not.toHaveBeenCalled();
    } finally {
      (chrome.tabs.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(tabsGet!);
    }
  });

  it('refuses a target whose live signature cannot be read', async () => {
    harness.signature = null;
    const { text } = await select(
      { index: 3, matchBy: 'value', option: 'b' },
      { onBeforeAction: async () => true },
    );
    expect(text).toContain('dropdown target could not be identified');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it.each([
    { index: 4, value: '', label: 'Option 2' },
    { index: 3, value: 'b', label: 'Beta' },
    { index: 3, matchBy: 'value', option: 'b', selector: '#flavor' },
    { index: 3, script: 'document.querySelector("select").value="b"' },
    { index: 3.5, matchBy: 'value', option: 'b' },
    { index: 3, matchBy: 'guess', option: 'b' },
    { index: 3, matchBy: 'value', option: 7 },
    { index: 3, option: 'b' },
  ])('refuses malformed or broader arguments %j', async (args) => {
    const { text } = await select(args, { onBeforeAction: async () => true });
    expect(text).toContain('matchBy');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it.each([
    'The requested option is disabled.',
    'The exact option is ambiguous.',
    'The current target is not a connected select control.',
  ])('conveys driver refusal: %s', async (reason) => {
    harness.selectOption.mockRejectedValue(new Error(reason));
    const { text } = await select(
      { index: 3, matchBy: 'value', option: 'b' },
      { onBeforeAction: async () => true },
    );
    expect(text).toBe(`Tool error: ${reason}`);
    expect(harness.getPageContent).toHaveBeenCalledOnce();
  });
});
