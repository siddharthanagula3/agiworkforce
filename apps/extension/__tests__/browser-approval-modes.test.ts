/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  approvalRequirement,
  describeApprovalReason,
  readsWithoutActing,
  type ActionApprovalRequirement,
} from '../src/features/computer-use/approvalPolicy';
import {
  actionNeedsApproval,
  type BrowserPermissionMode,
} from '../src/features/computer-use/askBeforeActing';
import { asksInAutoMode } from '../src/features/computer-use/crucialActions';
import { describeComputerUseAction } from '../src/features/computer-use/describeAction';
import { APPROVAL_TIMEOUT_MS } from '../src/features/computer-use/agentLoop';
import { normalizeApprovedSiteOrigin } from '../src/features/options/site-allowlist';
import { isTrustedExtensionPageSender } from '../src/background/policy';
import {
  parseBrowserUploadBinding,
  parseBrowserUploadedFilesMetadata,
  sameBrowserUploadBinding,
} from '../src/features/computer-use/userFileUpload';

const extensionId = 'ldfbegeiejcnnmfjlapffgoolhfkamjk';
const PAGE = 'https://shop.example/cart';
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
  'utf8',
);
const program = ts.createSourceFile('background.ts', source, ts.ScriptTarget.Latest, true);
const declarations = new Map<string, ts.VariableDeclaration>();
function collect(node: ts.Node): void {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    ['approvedUploadFiles', 'onBeforeAction'].includes(node.name.text)
  )
    declarations.set(node.name.text, node);
  ts.forEachChild(node, collect);
}
collect(program);

type OnBeforeAction = (
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  requirement: ActionApprovalRequirement,
) => Promise<boolean>;

function harness(permissionMode: BrowserPermissionMode, siteApproved = true) {
  const pendingComputerUseApprovals = new Map<
    string,
    (message: unknown, sender: unknown) => void
  >();
  const sent: Array<{ type: string; requestId: string; canAllowForTask: boolean }> = [];
  const lease = {
    runId: 'run-a',
    generation: 1,
    tabId: 17,
    authOwner: { accountId: 'account-a', authIncarnation: 'session-a' },
    controller: new AbortController(),
  };
  const dependencies = {
    lease,
    chrome: {
      runtime: {
        id: extensionId,
        getURL: (path: string) => `chrome-extension://${extensionId}${path}`,
      },
      tabs: { get: async () => ({ url: PAGE }) },
    },
    pendingComputerUseApprovals,
    APPROVAL_TIMEOUT_MS,
    permissionMode,
    asksInAutoMode,
    allowedForTask: new Set<string>(),
    readsWithoutActing,
    actionNeedsApproval,
    normalizeApprovedSiteOrigin,
    originApprovedForBrowserControl: async () => siteApproved,
    computerUseRuns: { isCurrent: () => true },
    assertComputerUseOwnership: async () => 'owned-token',
    getTargetSignature: async () => null,
    parseBrowserUploadBinding,
    parseBrowserUploadedFilesMetadata,
    sameBrowserUploadBinding,
    isTrustedExtensionPageSender,
    broadcastComputerUseForCurrentRun: (_lease: unknown, message: unknown) =>
      sent.push(message as (typeof sent)[number]),
    describeComputerUseAction,
    describeApprovalReason,
    notifyBrowserTask: vi.fn(async () => true),
    notificationTarget: undefined,
  };
  const snippet = [...declarations.values()]
    .map((node) => `const ${node.getText(program)};`)
    .join('\n');
  const compiled = ts.transpileModule(`${snippet}\nreturn onBeforeAction;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const onBeforeAction = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as OnBeforeAction;

  const decide = (toolName: string, args: Record<string, unknown>, targetSignature?: string) =>
    onBeforeAction(
      toolName,
      args,
      lease.controller.signal,
      approvalRequirement({ toolName, args, pageUrl: PAGE, targetSignature }),
    );
  const answer = (allowed: boolean, forTask = false) => {
    const request = sent.at(-1)!;
    pendingComputerUseApprovals.get(request.requestId)?.(
      { type: 'AGI_CU_APPROVE_RESPONSE', requestId: request.requestId, allowed, forTask },
      { id: extensionId, url: `chrome-extension://${extensionId}/src/side_panel.html` },
    );
  };
  return { decide, answer, sent, pending: pendingComputerUseApprovals };
}

const SITE_TOOL = { name: 'save_draft', arguments: {} };

afterEach(() => {
  vi.useRealTimers();
});

describe('production browser approval honors the per-call contract in every mode', () => {
  it('Auto, the default, acts on ordinary steps without a prompt', async () => {
    const test = harness('auto');
    await expect(test.decide('navigate', { url: 'https://shop.example/help' })).resolves.toBe(true);
    await expect(test.decide('click', { index: 3 }, 'a|link|||Shipping details')).resolves.toBe(
      true,
    );
    await expect(test.decide('open_tab', { url: 'https://shop.example/jobs' })).resolves.toBe(true);
    expect(test.sent).toHaveLength(0);
  });

  it.each(['auto', 'ask', 'full'] as const)(
    '%s asks before a website-supplied tool runs and before a tab closes',
    async (mode) => {
      for (const [toolName, args] of [
        ['call_site_tool', SITE_TOOL],
        ['close_tab', { tabId: 7 }],
      ] as const) {
        const test = harness(mode);
        const decision = test.decide(toolName, args);
        await vi.waitFor(() => expect(test.sent).toHaveLength(1));
        expect(test.sent[0]).toMatchObject({
          type: 'AGI_CU_APPROVE_REQUEST',
          canAllowForTask: false,
        });
        test.answer(true);
        await expect(decision).resolves.toBe(true);
      }
    },
  );

  it.each(['auto', 'ask', 'full'] as const)(
    '%s asks before a crucial step such as sending',
    async (mode) => {
      const test = harness(mode);
      const decision = test.decide('click', { index: 7 }, 'button|button|submit||Send');
      await vi.waitFor(() => expect(test.sent).toHaveLength(1));
      test.answer(true);
      await expect(decision).resolves.toBe(true);
    },
  );

  it('Full access acts without asking on an approved site and still asks elsewhere', async () => {
    const approved = harness('full', true);
    await expect(approved.decide('navigate', { url: 'https://shop.example/help' })).resolves.toBe(
      true,
    );
    expect(approved.sent).toHaveLength(0);

    const unapproved = harness('full', false);
    const decision = unapproved.decide('navigate', { url: 'https://shop.example/help' });
    await vi.waitFor(() => expect(unapproved.sent).toHaveLength(1));
    unapproved.answer(true);
    await expect(decision).resolves.toBe(true);
  });

  it('does not run a website-supplied tool the user denied', async () => {
    const test = harness('auto');
    const decision = test.decide('call_site_tool', SITE_TOOL);
    await vi.waitFor(() => expect(test.sent).toHaveLength(1));
    test.answer(false);
    await expect(decision).resolves.toBe(false);
  });

  it('treats an unanswered request as denied when it expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const test = harness('auto');
    const decision = test.decide('close_tab', { tabId: 7 });
    await vi.waitFor(() => expect(test.sent).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS);
    await expect(decision).resolves.toBe(false);
    expect(test.pending.size).toBe(0);
  });

  it('never turns one site-tool approval into permission for the rest of the task', async () => {
    const test = harness('auto');
    const first = test.decide('call_site_tool', SITE_TOOL);
    await vi.waitFor(() => expect(test.sent).toHaveLength(1));
    test.answer(true, true);
    await expect(first).resolves.toBe(true);

    const second = test.decide('call_site_tool', SITE_TOOL);
    await vi.waitFor(() => expect(test.sent).toHaveLength(2));
    test.answer(false);
    await expect(second).resolves.toBe(false);
  });
});
