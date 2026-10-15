/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTrustedExtensionPageSender } from '../src/background/policy';
import {
  browserFileChecksum,
  parseBrowserUploadBinding,
  parseBrowserUploadedFilesMetadata,
  resolveUploadedUserFiles,
  sameBrowserUploadBinding,
  type BrowserUploadBinding,
} from '../src/features/computer-use/userFileUpload';

type FreeTrialClientModule = typeof import('../src/features/cloud-bridge/freeTrialClient');

const auth = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<FreeTrialClientModule>()),
  getManagedCloudAuthContext: auth.get,
}));
const owner = { accountId: 'account-a', authIncarnation: 'session-a' };
const extensionId = 'ldfbegeiejcnnmfjlapffgoolhfkamjk';
const bytes = new TextEncoder().encode('synthetic selected upload');
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
    ['approvedUploadFiles', 'onBeforeAction', 'resolveUploadFile'].includes(node.name.text)
  )
    declarations.set(node.name.text, node);
  ts.forEachChild(node, collect);
}
collect(program);

function harness() {
  const state = {
    current: true,
    url: 'https://approved.example/upload',
    signature: 'input|file|file||Upload',
  };
  const listeners = new Set<(message: unknown, sender: unknown) => void>();
  const sent: Array<{ requestId: string; uploadBinding: BrowserUploadBinding }> = [];
  const lease = {
    runId: 'run-a',
    generation: 1,
    tabId: 17,
    authOwner: owner,
    controller: new AbortController(),
  };
  const chromeMock = {
    runtime: {
      id: extensionId,
      getURL: (path: string) => `chrome-extension://${extensionId}${path}`,
      onMessage: {
        addListener: (listener: (message: unknown, sender: unknown) => void) =>
          listeners.add(listener),
        removeListener: (listener: (message: unknown, sender: unknown) => void) =>
          listeners.delete(listener),
      },
    },
    tabs: { get: async () => ({ url: state.url }) },
  };
  const dependencies = {
    lease,
    chrome: chromeMock,
    askBeforeActing: false,
    computerUseRuns: { isCurrent: () => state.current },
    assertComputerUseOwnership: async () => {
      if (!state.current) throw new Error('Run ownership changed.');
      return 'owned-token';
    },
    getTargetSignature: async () => state.signature,
    parseBrowserUploadBinding,
    parseBrowserUploadedFilesMetadata,
    sameBrowserUploadBinding,
    resolveUploadedUserFiles,
    isTrustedExtensionPageSender,
    broadcastComputerUseForCurrentRun: (_lease: unknown, message: unknown) =>
      sent.push(message as (typeof sent)[number]),
    describeComputerUseAction: () => 'Upload selected user files.',
    describeApprovalReason: () => 'Always requires approval.',
  };
  const snippet = [...declarations.values()]
    .map((node) => `const ${node.getText(program)};`)
    .join('\n');
  const compiled = ts.transpileModule(`${snippet}\nreturn {onBeforeAction,resolveUploadFile};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const functions = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as {
    onBeforeAction: (
      tool: string,
      args: Record<string, unknown>,
      signal: AbortSignal,
      requirement: { alwaysAsk: boolean; reason: string },
    ) => Promise<boolean>;
    resolveUploadFile: (
      args: Record<string, unknown>,
    ) => ReturnType<typeof resolveUploadedUserFiles>;
  };
  const approve = async (args: Record<string, unknown>) => {
    const decision = functions.onBeforeAction('upload_file', args, lease.controller.signal, {
      alwaysAsk: true,
      reason: 'upload',
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const request = sent[0]!;
    const response = {
      type: 'AGI_CU_APPROVE_RESPONSE',
      requestId: request.requestId,
      runId: lease.runId,
      runGeneration: lease.generation,
      tabId: lease.tabId,
      allowed: true,
      uploadBinding: request.uploadBinding,
      upload: [
        {
          attachment: {
            id: '00000000-0000-4000-8000-000000000001',
            name: 'fixture.txt',
            mimeType: 'text/plain',
            byteCount: bytes.length,
            type: 'file',
            url: '/api/files/00000000-0000-4000-8000-000000000001',
          },
          checksumSha256: await browserFileChecksum(bytes),
        },
      ],
    };
    return { decision, response };
  };
  const respond = (response: unknown) => {
    for (const listener of listeners)
      listener(response, {
        id: extensionId,
        url: `chrome-extension://${extensionId}/src/side_panel.html`,
      });
  };
  return { ...functions, state, approve, respond, listeners, lease, sent };
}

beforeEach(() => {
  vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'http://localhost:3000');
  auth.get.mockReset().mockResolvedValue({ owner, token: 'owned-token' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(bytes)),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('production background browser upload approval', () => {
  it('requires the exact action object, consumes its file grant once, and resolves inspected bytes', async () => {
    const test = harness();
    const args = { index: 1 };
    const { decision, response } = await test.approve(args);
    test.respond(response);
    await expect(decision).resolves.toBe(true);
    await expect(test.resolveUploadFile({ index: 1 })).rejects.toThrow('exact action');
    expect((await test.resolveUploadFile(args)).files[0]?.bytes).toEqual(bytes);
    await expect(test.resolveUploadFile(args)).rejects.toThrow('exact action');
  });

  it('refuses cross-run approval metadata and arbitrary model file arguments', async () => {
    const test = harness();
    await expect(
      test.onBeforeAction(
        'upload_file',
        { index: 1, path: '/arbitrary/file' },
        test.lease.controller.signal,
        { alwaysAsk: true, reason: 'upload' },
      ),
    ).resolves.toBe(false);
    expect(test.sent).toHaveLength(0);
    const args = { index: 1 };
    const { decision, response } = await test.approve(args);
    test.respond({ ...response, runGeneration: 2 });
    await expect(decision).resolves.toBe(false);
    await expect(test.resolveUploadFile(args)).rejects.toThrow('exact action');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a changed page target before reading file bytes', async () => {
    const test = harness();
    const args = { index: 1 };
    const { decision, response } = await test.approve(args);
    test.respond(response);
    await decision;
    test.state.signature = 'input|other|file||Other upload';
    await expect(test.resolveUploadFile(args)).rejects.toThrow('target changed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores a late successful upload after the original approval was cancelled', async () => {
    const test = harness();
    const args = { index: 1 };
    const { decision, response } = await test.approve(args);
    const listener = [...test.listeners][0]!;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    test.lease.controller.abort(new DOMException('Approval cancelled', 'AbortError'));
    await expect(decision).rejects.toMatchObject({ name: 'AbortError' });
    listener(response, {
      id: extensionId,
      url: `chrome-extension://${extensionId}/src/side_panel.html`,
    });
    await expect(test.resolveUploadFile(args)).rejects.toThrow('exact action');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses an expired approval and never restores its grant after late success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const test = harness();
    const args = { index: 1 };
    const { decision, response } = await test.approve(args);
    const listener = [...test.listeners][0]!;
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(decision).resolves.toBe(false);
    listener(response, {
      id: extensionId,
      url: `chrome-extension://${extensionId}/src/side_panel.html`,
    });
    await expect(test.resolveUploadFile(args)).rejects.toThrow('exact action');
    expect(fetch).not.toHaveBeenCalled();
  });
});
