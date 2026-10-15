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
  it.each(['https://example.com/form', 'https://chase.com/transfer', null])(
    'always asks on %s regardless of autonomy or target metadata',
    (pageUrl) => {
      const requirement = approvalRequirement({
        toolName: 'select_option',
        args: { index: 3, label: 'Beta' },
        pageUrl,
        targetSignature: harness.signature,
      });
      expect(requirement).toEqual({ alwaysAsk: true, reason: 'selection' });
      expect(describeApprovalReason(requirement)).toContain('may submit a form');
    },
  );

  it('offers only the indexed, exact-choice contract and names the chosen option', () => {
    const tool = BROWSER_TOOL_DEFINITIONS.find((entry) => entry.function.name === 'select_option')!;
    expect(Object.keys(tool.function.parameters.properties)).toEqual(['index', 'value', 'label']);
    expect(tool.function.parameters).toMatchObject({
      required: ['index'],
      additionalProperties: false,
    });
    for (const keyword of ['oneOf', 'allOf', 'anyOf']) {
      expect(tool.function.parameters).not.toHaveProperty(keyword);
    }
    expect(describeComputerUseAction('select_option', { index: 3, label: 'Beta' })).toBe(
      'Choose option "Beta" in dropdown [3].',
    );
    expect(describeComputerUseAction('select_option', { index: 3, value: 'b' })).toBe(
      'Choose value "b" in dropdown [3].',
    );
  });

  it.each([{ value: 'b' }, { label: 'Beta' }])(
    'executes the approved exact choice %j and verifies the page afterward',
    async (choice) => {
      const approval = vi.fn(async () => true);
      const { text, steps } = await select({ index: 3, ...choice }, { onBeforeAction: approval });
      expect(approval).toHaveBeenCalledWith('select_option', { index: 3, ...choice }, undefined, {
        alwaysAsk: true,
        reason: 'selection',
      });
      expect(harness.getTargetSignature).toHaveBeenCalledTimes(2);
      expect(harness.selectOption).toHaveBeenCalledExactlyOnceWith(
        7,
        3,
        choice,
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
    const { text } = await select({ index: 3, value: 'b' }, { onBeforeAction: async () => true });
    expect(text).toContain('already selected; no new input/change events were sent');
  });

  it('refuses unattended selection even when there is no approval preference callback', async () => {
    const { text } = await select({ index: 3, value: 'b' });
    expect(text).toContain('This run has no way to ask');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it('does not let a page-declared read tool override native selection approval', async () => {
    const { text } = await select(
      { index: 3, value: 'b' },
      {
        siteTools: [{ name: 'select_option', effect: 'read', source: 'imperative' }],
      },
    );
    expect(text).toContain('This run has no way to ask');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it('does not execute after Skip', async () => {
    const { text } = await select({ index: 3, value: 'b' }, { onBeforeAction: async () => false });
    expect(text).toContain('Action skipped');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it('refuses a dropdown replaced during approval', async () => {
    const { text } = await select(
      { index: 3, value: 'b' },
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

  it('refuses a target whose live signature cannot be read', async () => {
    harness.signature = null;
    const { text } = await select({ index: 3, value: 'b' }, { onBeforeAction: async () => true });
    expect(text).toContain('dropdown target could not be identified');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it.each([
    { index: 3, value: 'b', label: 'Beta' },
    { index: 3, value: 'b', selector: '#flavor' },
    { index: 3, script: 'document.querySelector("select").value="b"' },
    { index: 3.5, value: 'b' },
    { index: 3, value: 7 },
  ])('refuses malformed or broader arguments %j', async (args) => {
    const { text } = await select(args, { onBeforeAction: async () => true });
    expect(text).toContain('exactly one string value or label');
    expect(harness.selectOption).not.toHaveBeenCalled();
  });

  it.each([
    'The requested option is disabled.',
    'The exact option is ambiguous.',
    'The current target is not a connected select control.',
  ])('conveys driver refusal: %s', async (reason) => {
    harness.selectOption.mockRejectedValue(new Error(reason));
    const { text } = await select({ index: 3, value: 'b' }, { onBeforeAction: async () => true });
    expect(text).toBe(`Tool error: ${reason}`);
    expect(harness.getPageContent).toHaveBeenCalledOnce();
  });
});
