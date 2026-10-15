import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
  'utf8',
);
const program = ts.createSourceFile('background.ts', source, ts.ScriptTarget.Latest, true);
const helper = program.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'assertComputerUseInputCleanupOwnership',
);
if (!helper) throw new Error('Production input cleanup authority was not found.');
const owner = { accountId: 'account-a', authIncarnation: 'session-a' };

function harness() {
  const controller = new AbortController();
  controller.abort(Object.assign(new Error('Stopped'), { reasonCode: 'user_stopped' }));
  const lease = {
    controller,
    authOwner: owner,
    tabId: 42,
    windowId: 1,
    tabIntentUrl: 'https://approved.example/form',
  };
  const state = {
    active: null as unknown,
    pending: null as unknown,
    owner,
    retired: false,
    url: lease.tabIntentUrl,
    granted: true,
    approved: true,
    activeTab: 42,
    onAuth: () => {},
  };
  const getAuth = vi.fn(async () => {
    state.onAuth();
    return { owner: state.owner, token: 'owned-token' };
  });
  const dependencies = {
    computerUseRuns: { getActive: () => state.active },
    computerUseStarts: { getPending: () => state.pending },
    getManagedCloudAuthContext: getAuth,
    isRetiredManagedCloudOwner: () => state.retired,
    sameManagedCloudOwner,
    chrome: {
      tabs: {
        get: async () => ({ url: state.url, windowId: 1 }),
        query: async () => [{ id: state.activeTab }],
      },
    },
    isOriginApprovedForAutomation: () => state.approved,
    hasBrowserControlConsent: async () => state.granted,
  };
  const compiled = ts.transpileModule(
    `let computerUseStartGeneration = 2;\n${helper!.getText(program)}\nreturn { run: lease => assertComputerUseInputCleanupOwnership(lease, 1), setGeneration: value => { computerUseStartGeneration = value; } };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const authority = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as { run: (lease: unknown) => Promise<void>; setGeneration: (value: number) => void };
  return { state, lease, getAuth, ...authority };
}

describe('host input cleanup authority', () => {
  it('allows only the original locally stopped account and tab with fresh identity and retained consent', async () => {
    const test = harness();
    await expect(test.run(test.lease)).resolves.toBeUndefined();
    expect(test.getAuth.mock.calls).toEqual([[true], [true]]);
  });

  it.each([
    'owner',
    'session',
    'retired',
    'successor',
    'pending',
    'site',
    'control',
    'url',
    'tab',
  ] as const)('refuses unsafe %s cleanup', async (unsafe) => {
    const test = harness();
    if (unsafe === 'owner')
      test.state.owner = { accountId: 'account-b', authIncarnation: 'session-b' };
    if (unsafe === 'session') test.state.owner = { ...owner, authIncarnation: 'session-b' };
    if (unsafe === 'retired') test.state.retired = true;
    if (unsafe === 'successor') test.state.active = {};
    if (unsafe === 'pending') test.state.pending = {};
    if (unsafe === 'site') test.state.approved = false;
    if (unsafe === 'control') test.state.granted = false;
    if (unsafe === 'url') test.state.url = 'https://approved.example/another';
    if (unsafe === 'tab') test.state.activeTab = 43;
    await expect(test.run(test.lease)).rejects.toThrow();
  });

  it('refuses a newer start generation arriving during identity verification', async () => {
    const test = harness();
    test.state.onAuth = () => test.setGeneration(3);
    await expect(test.run(test.lease)).rejects.toThrow('newer browser run');
  });
});
