import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  parseBrowserUploadBinding,
  type BrowserUploadBinding,
} from '../src/features/computer-use/userFileUpload';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
let approval: ts.IfStatement | undefined;
function findApproval(node: ts.Node): void {
  if (
    ts.isIfStatement(node) &&
    node.expression.getText(program) === "m['type'] === 'AGI_CU_APPROVE_REQUEST'"
  )
    approval = node;
  ts.forEachChild(node, findApproval);
}
findApproval(program);
if (!approval) throw new Error('Production computer-use approval handler was not found');
const approvalBody = approval.thenStatement.getText(program);
let ancestor: ts.Node = approval;
while (!ts.isArrowFunction(ancestor)) ancestor = ancestor.parent;
if (!ts.isBlock(ancestor.body)) throw new Error('Approval listener body is not a block');
const prelude = ancestor.body.statements
  .filter(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some((declaration) =>
        ['m', 'runId', 'runGeneration'].includes(declaration.name.getText(program)),
      ),
  )
  .map((node) => node.getText(program))
  .join('\n');

const binding: BrowserUploadBinding = {
  requestId: 'upload-request',
  runId: 'cu_run_upload',
  runGeneration: 3,
  tabId: 7,
  tabUrl: 'https://example.com/form',
  targetSignature: 'input||file|resume|Resume',
  owner: { accountId: 'account-a', authIncarnation: 'session-a' },
};

function harness() {
  const context = { managedCloudOwner: binding.owner };
  let card:
    | {
        complete: (allowed: boolean, upload?: unknown[]) => void;
        options: { assertCurrent: () => Promise<void> };
      }
    | undefined;
  const send = vi.fn(async () => ({
    success: true,
    running: true,
    runId: binding.runId,
    runGeneration: binding.runGeneration,
    tabId: binding.tabId,
  }));
  const getTab = vi.fn(async () => ({ id: binding.tabId, url: binding.tabUrl }));
  const show = vi.fn((_tool, _description, complete, options) => {
    card = { complete, options };
  });
  const dependencies = {
    _ctx: context,
    sameManagedCloudOwner,
    parseBrowserUploadBinding,
    cuPanel: {
      ownsRun: () => true,
      noteRunActivity: vi.fn(),
      showApprovalCard: show,
      showHandoffBanner: vi.fn(),
    },
    switchTab: vi.fn(),
    chrome: { runtime: { sendMessage: send }, tabs: { get: getTab } },
  };
  const compiled = ts.transpileModule(`return (msg) => { ${prelude}\n${approvalBody} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const receive = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as (message: unknown) => void;
  const message = {
    type: 'AGI_CU_APPROVE_REQUEST',
    toolName: 'upload_file',
    description: 'Upload resume',
    requestId: binding.requestId,
    runId: binding.runId,
    runGeneration: binding.runGeneration,
    tabId: binding.tabId,
    uploadBinding: binding,
  };
  return { context, receive, message, show, send, getTab, card: () => card! };
}

describe('production upload approval listener', () => {
  it('checks the current background run and exact page before an upload', async () => {
    const test = harness();
    test.receive(test.message);
    await expect(test.card().options.assertCurrent()).resolves.toBeUndefined();
    expect(test.send).toHaveBeenCalledWith({ type: 'GET_COMPUTER_USE_STATE' });
    expect(test.getTab).toHaveBeenCalledWith(binding.tabId);
    test.getTab.mockResolvedValue({ id: binding.tabId, url: 'https://example.com/another-page' });
    await expect(test.card().options.assertCurrent()).rejects.toThrow('no longer bound');
  });

  it('refuses a forged binding before presenting a picker', () => {
    const test = harness();
    test.receive({ ...test.message, uploadBinding: { ...binding, tabId: 99 } });
    expect(test.show).not.toHaveBeenCalled();
    expect(test.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false, requestId: binding.requestId }),
    );
  });

  it('prevents inspection after the active account changes', async () => {
    const test = harness();
    test.receive(test.message);
    test.context.managedCloudOwner = { accountId: 'account-b', authIncarnation: 'session-b' };
    await expect(test.card().options.assertCurrent()).rejects.toThrow(
      'account or browser run changed',
    );
    expect(test.send).not.toHaveBeenCalled();
    expect(test.getTab).not.toHaveBeenCalled();
  });
});
