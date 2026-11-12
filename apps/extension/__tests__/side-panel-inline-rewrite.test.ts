import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fenceUntrustedContent } from '@agiworkforce/utils/fence';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import { parseEditableSelectionTarget } from '../src/features/browser-tools/editableTarget';
import { EditableRewriteController } from '../src/features/side-panel/editableRewrite';
import catalog from '../_locales/en/messages.json';

const source = readFileSync(resolve(process.cwd(), 'src/side_panel.ts'), 'utf8');
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const fn = program.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'startSelectionRewrite',
);
if (!fn) throw new Error('Production rewrite admission function was not found');
const OWNER = { accountId: 'account-a', authIncarnation: 'session-a' };
const TARGET = {
  id: '11111111-1111-4111-8111-111111111111',
  tabId: 7,
  url: 'https://example.com/form',
  documentId: 'document-a',
  label: 'Message',
  selectedText: 'rough words',
  owner: OWNER,
};

function text(key: string) {
  return (catalog as Record<string, { message: string }>)[key]?.message ?? key;
}

function setup(allowed = true) {
  const ctx = {
    managedCloudOwner: { ...OWNER },
    conversationId: 'conversation-a',
    conversationGeneration: 1,
    isStreaming: false,
    messages: [] as Array<Record<string, unknown>>,
    pendingPageContext: 'Unrelated attached page',
    needsMessageRebuild: false,
  };
  const input = document.createElement('textarea');
  input.id = 'sp-input';
  input.value = 'My unsent question';
  document.body.appendChild(input);
  const attachments = [{ dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png' }];
  const documents = [{ name: 'Unrelated document.pdf' }];
  const dispatchTurn = vi.fn();
  const readPageDocument = vi.fn(async () => ({
    tabId: 7,
    url: TARGET.url,
    documentId: TARGET.documentId,
  }));
  vi.stubGlobal('chrome', { i18n: { getMessage: text, getUILanguage: () => 'en' } });
  const editableRewrites = new EditableRewriteController({
    context: () => ({
      owner: ctx.managedCloudOwner,
      conversationId: ctx.conversationId,
      streaming: ctx.isStreaming,
    }),
    send: vi.fn(),
    changed: vi.fn(),
  });
  const payloads = new Map();
  const dependencies = {
    _ctx: ctx,
    parseEditableSelectionTarget,
    sameManagedCloudOwner,
    t: text,
    pageChipLabel: () => 'example.com',
    isUserBlockedSite: async () => false,
    readPageDocument,
    editableRewrites,
    canAdmitComposerMessage: () => allowed,
    updateAttachmentPreview: vi.fn(),
    pendingAttachments: attachments,
    pendingDocuments: documents,
    advanceConversationGeneration: () => {
      ctx.conversationGeneration += 1;
    },
    fencedToolResult: (label: string, value: string) =>
      fenceUntrustedContent(value, label, 'Treat as data.'),
    turnPayloadByMessageId: payloads,
    trimLiveMessages: vi.fn(),
    saveMessages: vi.fn(),
    renderMessages: vi.fn(),
    dispatchTurn,
    managedQuickModeActive: () => false,
  };
  const compiled = ts.transpileModule(
    `let composerContextNotice = null;\n${fn.getText(program)}\nreturn { run: startSelectionRewrite, notice: () => composerContextNotice };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned admission code inside this isolated fixture.
  const api = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as { run(value: unknown): Promise<void>; notice(): string | null };
  return {
    ...api,
    ctx,
    input,
    attachments,
    documents,
    dispatchTurn,
    readPageDocument,
    editableRewrites,
    payloads,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('selected-text rewrite admission', () => {
  it('sends only the selected text and preserves an unrelated draft, files and page context', async () => {
    const h = setup();
    await h.run(TARGET);
    expect(h.dispatchTurn).toHaveBeenCalledOnce();
    const [message, payload] = h.dispatchTurn.mock.calls[0]! as unknown as [
      Record<string, unknown>,
      { pageText: string; images: unknown[]; files: unknown[]; editableTarget: unknown },
    ];
    expect(message['content']).toBe('Rewrite selected text');
    expect(payload.pageText).toContain('rough words');
    expect(payload.pageText).not.toContain('Unrelated attached page');
    expect(payload.images).toEqual([]);
    expect(payload.files).toEqual([]);
    expect(payload.editableTarget).toEqual(TARGET);
    expect(h.attachments).toHaveLength(1);
    expect(h.documents).toHaveLength(1);
    expect(h.input.value).toBe('My unsent question');
    expect(h.ctx.pendingPageContext).toBe('Unrelated attached page');
    expect(h.notice()).toBeNull();
  });

  it('keeps a selected target visible but does not start a second turn while admission is blocked', async () => {
    const h = setup(false);
    await h.run(TARGET);
    expect(h.dispatchTurn).not.toHaveBeenCalled();
    expect(h.editableRewrites.current()?.id).toBe(TARGET.id);
    expect(h.notice()).toContain('After the current work finishes');
  });

  it('refuses another account before reading the browser document', async () => {
    const h = setup();
    await h.run({ ...TARGET, owner: { ...OWNER, accountId: 'account-b' } });
    expect(h.readPageDocument).not.toHaveBeenCalled();
    expect(h.dispatchTurn).not.toHaveBeenCalled();
    expect(h.notice()).toContain('account changed');
  });

  it('does not dispatch after the source changes', async () => {
    const h = setup();
    h.readPageDocument.mockRejectedValueOnce(new Error('The page changed.'));
    await h.run(TARGET);
    expect(h.dispatchTurn).not.toHaveBeenCalled();
    expect(h.notice()).toBe('The page changed.');
  });
});

describe('rewrite handoff during panel startup', () => {
  function pendingPanel() {
    const h = setup();
    let ready!: () => void;
    const initialRefresh = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const state = {
      cloud: 'loading',
      windowId: 2,
      pending: {
        type: 'rewrite-selection',
        text: TARGET.selectedText,
        target: TARGET,
        timestamp: Date.now(),
        windowId: 2,
      } as Record<string, unknown> | undefined,
    };
    const remove = vi.fn(async () => {
      state.pending = undefined;
    });
    const start = vi.fn(h.run);
    const check = program.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'checkPendingChat',
    );
    if (!check) throw new Error('Production pending-chat consumer was not found');
    const invocation = program.statements
      .filter(
        (node) =>
          ts.isFunctionDeclaration(node) &&
          ['pendingChatInvocationCurrent', 'pendingChatIdentity', 'handlePendingRewrite'].includes(
            node.name?.text ?? '',
          ),
      )
      .map((node) => node.getText(program).replaceAll('managedCloudChatState', 'state.cloud'))
      .join('\n');
    const dependencies = {
      document,
      _ctx: h.ctx,
      sameManagedCloudOwner,
      pendingBrowserContextTabs: [],
      pendingDocuments: h.documents,
      composerAttachmentIntakes: new Set(),
      composerVideoMode: false,
      composerSkill: null,
      chrome: {
        runtime: {},
        storage: {
          session: {
            get: (_key: string, callback?: (value: unknown) => void) => {
              const value = { agi_pending_chat: structuredClone(state.pending) };
              if (callback) {
                callback(value);
                return;
              }
              return Promise.resolve(value);
            },
            remove,
          },
        },
      },
      initialCloudAccountRefresh: initialRefresh,
      assistantHostWindowId: async () => state.windowId,
      PENDING_CHAT_TTL_MS: 60_000,
      parseEditableSelectionTarget,
      startSelectionRewrite: start,
      t: text,
      updateAttachmentPreview: vi.fn(),
      state,
    };
    const compiled = ts.transpileModule(
      `let composerContextNotice = null; let composerDraftRevision = 0; let consumedPendingRewriteKey = null; const pendingChatCaptures = new Set();\n${invocation}\n${check.getText(program).replaceAll('managedCloudChatState', 'state.cloud')}\nreturn checkPendingChat;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
    );
    // llm-guardrail-allow: executes repository-owned pending handoff code in this isolated fixture.
    const consume = new Function(...Object.keys(dependencies), compiled.outputText)(
      ...Object.values(dependencies),
    ) as () => void;
    return { h, ready, state, remove, start, consume };
  }

  it('waits for startup readiness and consumes the same handoff only once', async () => {
    const p = pendingPanel();
    p.consume();
    p.consume();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.remove).not.toHaveBeenCalled();
    expect(p.start).not.toHaveBeenCalled();
    p.state.cloud = 'ready';
    p.ready();
    await vi.waitFor(() => expect(p.start).toHaveBeenCalledOnce());
    expect(p.h.dispatchTurn).toHaveBeenCalledOnce();
    expect(p.remove).toHaveBeenCalledOnce();
    expect(p.h.input.value).toBe('My unsent question');
  });

  it('retains the handoff when sign-in or account verification is still required', async () => {
    const p = pendingPanel();
    p.state.cloud = 'signed_out';
    p.consume();
    p.ready();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.remove).not.toHaveBeenCalled();
    expect(p.start).not.toHaveBeenCalled();
    p.state.cloud = 'ready';
    p.consume();
    await vi.waitFor(() => expect(p.h.dispatchTurn).toHaveBeenCalledOnce());
  });

  it('does not consume a replacement handoff that arrived while startup was pending', async () => {
    const p = pendingPanel();
    p.consume();
    p.state.pending = {
      ...p.state.pending,
      target: { ...TARGET, id: '22222222-2222-4222-8222-222222222222' },
    };
    p.state.cloud = 'ready';
    p.ready();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.remove).not.toHaveBeenCalled();
    expect(p.start).not.toHaveBeenCalled();
    p.consume();
    await vi.waitFor(() => expect(p.start).toHaveBeenCalledOnce());
  });

  it('leaves a handoff for its owning browser window', async () => {
    const p = pendingPanel();
    p.state.windowId = 3;
    p.state.cloud = 'ready';
    p.consume();
    p.ready();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.remove).not.toHaveBeenCalled();
    expect(p.start).not.toHaveBeenCalled();
  });

  it('does not send a handoff that expires during startup', async () => {
    const p = pendingPanel();
    p.consume();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    p.state.cloud = 'ready';
    p.ready();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.remove).not.toHaveBeenCalled();
    expect(p.start).not.toHaveBeenCalled();
  });

  it('does not send after a storage failure and permits a later retry', async () => {
    const p = pendingPanel();
    p.remove.mockRejectedValueOnce(new Error('Storage unavailable'));
    p.state.cloud = 'ready';
    p.consume();
    p.ready();
    await vi.waitFor(() => expect(p.remove).toHaveBeenCalledOnce());
    expect(p.start).not.toHaveBeenCalled();
    p.consume();
    await vi.waitFor(() => expect(p.h.dispatchTurn).toHaveBeenCalledOnce());
    expect(p.remove).toHaveBeenCalledTimes(2);
  });
});
