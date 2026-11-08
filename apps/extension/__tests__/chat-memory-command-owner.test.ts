import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import type { MemoryCommandResult } from '../src/features/cloud-bridge/memoryClient';
import { UUID_PATTERN } from '../src/lib/uuid';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const functions = program.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      [
        'advanceConversationGeneration',
        'renderMemoryNotice',
        'memoryCommandKindHint',
        'runChatMemoryCommand',
      ].includes(node.name?.text ?? ''),
  )
  .map((node) => node.getText(program))
  .join('\n');

const OWNER = { accountId: 'account-a', authIncarnation: 'session-a' };
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const FORGET: MemoryCommandResult = {
  kind: 'forget',
  status: 'confirmation_required',
  message: 'Confirm forgetting',
  matches: [{ id: 'memory-a', content: 'Original memory' }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

interface Notice {
  text: string;
  confirmForget?: () => Promise<void>;
}

function harness() {
  const context = {
    managedCloudOwner: { ...OWNER } as ManagedCloudOwner | null,
    conversationId: 'local-conversation',
    conversationGeneration: 1,
    currentStreamId: 'stream-a' as string | null,
    activeProject: { id: PROJECT },
  };
  const persistence = { cloudSync: { conversationId: CONVERSATION } };
  const auth = vi.fn(async () => ({ token: 'initial-token', owner: { ...OWNER } }));
  const command = vi.fn(async (): Promise<MemoryCommandResult | null> => FORGET);
  const dependencies = {
    _ctx: context,
    activePersistenceEntry: persistence,
    sameManagedCloudOwner,
    getManagedCloudAuthContext: auth,
    runAccountMemoryCommand: command,
    UUID_PATTERN,
    composerVoiceInput: { reset: vi.fn() },
    resetReadAloud: vi.fn(),
    clearVoiceInputComposerNotice: vi.fn(),
    taskSiteGrants: { releaseTask: vi.fn(async () => undefined) },
    cancelComposerImageIntake: vi.fn(),
    t: (key: string) => key,
    tPlural: (key: string, count: number, values: string[]) =>
      `${key}:${count}:${values.join(' ')}`,
  };
  const compiled = ts.transpileModule(
    `let currentMemoryNotice = null;
     ${functions}
     return { runChatMemoryCommand, renderMemoryNotice, advanceConversationGeneration,
       getNotice: () => currentMemoryNotice };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: runs only repository-owned TypeScript functions in this isolated unit fixture.
  const api = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as {
    runChatMemoryCommand(
      message: string,
      streamId: string,
      owner: ManagedCloudOwner,
    ): Promise<unknown>;
    renderMemoryNotice(notice: Notice | null): void;
    advanceConversationGeneration(): void;
    getNotice(): Notice | null;
  };
  return {
    ...api,
    context,
    persistence,
    auth,
    command,
    run: () => api.runChatMemoryCommand('forget original memory', 'stream-a', OWNER),
  };
}

beforeEach(() => {
  document.body.innerHTML =
    '<div id="sp-memory-notice"><span id="sp-memory-notice-text"></span><button id="sp-memory-notice-forget"></button><button id="sp-memory-notice-keep"></button></div>';
});

describe('chat memory command ownership', () => {
  it('does not start authentication for an already replaced turn', async () => {
    const h = harness();
    h.context.currentStreamId = 'stream-b';
    await h.run();
    expect(h.auth).not.toHaveBeenCalled();
    expect(h.command).not.toHaveBeenCalled();
  });

  it('uses the source captured before authentication rather than a later cloud binding', async () => {
    const h = harness();
    const pending = deferred<{ token: string; owner: ManagedCloudOwner }>();
    h.auth.mockReturnValueOnce(pending.promise);
    const running = h.run();
    h.persistence.cloudSync.conversationId = '33333333-3333-4333-8333-333333333333';
    pending.resolve({ token: 'initial-token', owner: OWNER });
    await running;
    expect(h.command).toHaveBeenCalledWith('initial-token', {
      message: 'forget original memory',
      conversationId: CONVERSATION,
      projectId: PROJECT,
    });
  });

  it.each(['owner', 'session', 'conversation', 'generation', 'project', 'stream'])(
    'does not request memory when %s changes during authentication',
    async (changed) => {
      const h = harness();
      const pending = deferred<{ token: string; owner: ManagedCloudOwner }>();
      h.auth.mockReturnValueOnce(pending.promise);
      const running = h.run();
      if (changed === 'owner') h.context.managedCloudOwner = null;
      if (changed === 'session')
        h.context.managedCloudOwner = { ...OWNER, authIncarnation: 'session-b' };
      if (changed === 'conversation') h.context.conversationId = 'other-conversation';
      if (changed === 'generation') h.context.conversationGeneration += 1;
      if (changed === 'project') h.context.activeProject.id = 'other-project';
      if (changed === 'stream') h.context.currentStreamId = null;
      pending.resolve({ token: 'initial-token', owner: OWNER });
      await running;
      expect(h.command).not.toHaveBeenCalled();
      expect(h.getNotice()).toBeNull();
    },
  );

  it.each(['account', 'session'])(
    'rejects authentication for a different %s before the UI changes',
    async (changed) => {
      const h = harness();
      h.auth.mockResolvedValueOnce({
        token: 'other-token',
        owner: {
          ...OWNER,
          ...(changed === 'account'
            ? { accountId: 'account-b' }
            : { authIncarnation: 'session-b' }),
        },
      });
      await h.run();
      expect(h.command).not.toHaveBeenCalled();
    },
  );

  it.each(['success', 'failure'])('discards stale initial %s publication', async (outcome) => {
    const h = harness();
    const pending = deferred<MemoryCommandResult | null>();
    h.command.mockReturnValueOnce(pending.promise);
    const running = h.run();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.command).toHaveBeenCalledTimes(1);
    h.context.currentStreamId = null;
    if (outcome === 'success') pending.resolve(FORGET);
    else pending.reject(new Error('Old request failed'));
    await running;
    expect(h.getNotice()).toBeNull();
  });

  it('allows confirmation after stream completion with fresh matching-owner authentication', async () => {
    const h = harness();
    await h.run();
    h.context.currentStreamId = null;
    h.auth.mockResolvedValueOnce({ token: 'fresh-token', owner: OWNER });
    await h.getNotice()!.confirmForget!();
    expect(h.command).toHaveBeenLastCalledWith('fresh-token', {
      message: 'forget original memory',
      conversationId: CONVERSATION,
      projectId: PROJECT,
      confirmed: true,
    });
  });

  it('invalidates the visible notice on conversation generation changes', async () => {
    const h = harness();
    await h.run();
    const retained = h.getNotice()!.confirmForget!;
    h.advanceConversationGeneration();
    expect(h.getNotice()).toBeNull();
    expect(document.getElementById('sp-memory-notice')!.classList.contains('visible')).toBe(false);
    await retained();
    expect(h.command).toHaveBeenCalledTimes(1);
  });

  it.each(['dismiss', 'replace', 'owner'])(
    'does not confirm after %s during fresh authentication',
    async (changed) => {
      const h = harness();
      await h.run();
      const pending = deferred<{ token: string; owner: ManagedCloudOwner }>();
      h.auth.mockReturnValueOnce(pending.promise);
      const confirming = h.getNotice()!.confirmForget!();
      const replacement = { text: 'New notice' };
      if (changed === 'dismiss') h.renderMemoryNotice(null);
      if (changed === 'replace') h.renderMemoryNotice(replacement);
      if (changed === 'owner') h.context.managedCloudOwner = null;
      pending.resolve({ token: 'fresh-token', owner: OWNER });
      await confirming;
      expect(h.command).toHaveBeenCalledTimes(1);
      if (changed === 'replace') expect(h.getNotice()).toBe(replacement);
    },
  );

  it('clears only the current notice when fresh authentication has another session', async () => {
    const h = harness();
    await h.run();
    h.auth.mockResolvedValueOnce({
      token: 'other-token',
      owner: { ...OWNER, authIncarnation: 'other-session' },
    });
    await h.getNotice()!.confirmForget!();
    expect(h.command).toHaveBeenCalledTimes(1);
    expect(h.getNotice()).toBeNull();
  });

  it.each(['success', 'failure'])(
    'cannot replace a newer notice with confirmation %s',
    async (outcome) => {
      const h = harness();
      await h.run();
      const pending = deferred<MemoryCommandResult | null>();
      h.command.mockReturnValueOnce(pending.promise);
      const retained = h.getNotice()!.confirmForget!;
      const confirming = retained();
      await Promise.resolve();
      expect(h.command).toHaveBeenCalledTimes(2);
      await retained();
      expect(h.command).toHaveBeenCalledTimes(2);
      const replacement = { text: 'New notice' };
      h.renderMemoryNotice(replacement);
      if (outcome === 'success') pending.resolve({ ...FORGET, message: 'Forgotten', matches: [] });
      else pending.reject(new Error('Old confirmation failed'));
      await confirming;
      expect(h.getNotice()).toBe(replacement);
    },
  );
});
