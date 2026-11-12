import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import { prepareSelectionContext } from '../src/features/side-panel/tabContext';

const backgroundSource = readFileSync(resolve(process.cwd(), 'src/background.ts'), 'utf8');
const panelSource = readFileSync(resolve(process.cwd(), 'src/side_panel.ts'), 'utf8');
const manifestCatalog = JSON.parse(
  readFileSync(resolve(process.cwd(), '_locales/en/messages.json'), 'utf8'),
) as Record<string, { message: string }>;

function slice(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  if (start < 0 || end < start) throw new Error(`${from} was not found`);
  return source.slice(start, end);
}

function run<T>(code: string, exported: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(`${code}\nreturn ${exported};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  // llm-guardrail-allow: executes repository-owned extension code inside this isolated test fixture.
  return new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as T;
}

describe('right-click Ask AGI about this page', () => {
  it('is offered on the page itself, next to Summarize this page', () => {
    const items = slice(backgroundSource, 'const CONTEXT_MENU_ITEMS', '];');
    expect(items).toContain("{ id: 'ask-page', title: t('menuAskAboutPage'), contexts: ['page'] }");
    expect(manifestCatalog['menuAskAboutPage']?.message).toBe('Ask AGI about this page');
  });

  it('opens the side panel for that tab with an ask-about-page request and sends nothing', () => {
    const set = vi.fn(async () => undefined);
    const open = vi.fn(async () => undefined);
    const handle = run<(info: Record<string, unknown>, tab: Record<string, unknown>) => void>(
      `${slice(backgroundSource, 'const pendingChatWindowStamp', 'const pendingEditableCaptures')}
       ${slice(backgroundSource, 'function handleContextMenuClick', 'chrome.contextMenus?.onClicked')}`,
      'handleContextMenuClick',
      {
        chrome: { storage: { session: { set } } },
        openAssistantPanel: open,
        logger: { warn: vi.fn() },
        createSelectionContextHandoff: vi.fn(),
        CONTEXT_HANDOFF_STORAGE_KEY: 'handoff',
        showNotification: vi.fn(),
        ensureTabGroup: vi.fn(),
      },
    );
    handle({ menuItemId: 'ask-page', pageUrl: 'https://example.com/a' }, { id: 4, windowId: 2 });
    expect(set).toHaveBeenCalledWith({
      agi_pending_chat: expect.objectContaining({
        type: 'ask-page',
        text: '',
        url: 'https://example.com/a',
        tabId: 4,
        windowId: 2,
      }),
    });
    expect(open).toHaveBeenCalledWith({ tabId: 4, windowId: 2 });
  });

  afterEach(() => document.body.replaceChildren());

  function harness(type = 'ask-page', delayStorage = false) {
    const pending = { type, text: '', url: 'https://example.com/a', timestamp: Date.now() };
    let stored: typeof pending | undefined = pending;
    const reads: Array<(result: Record<string, unknown>) => void> = [];
    const remove = vi.fn(async () => {
      stored = undefined;
    });
    const ctx = {
      managedCloudOwner: { accountId: 'owner-a', authIncarnation: 'session-a' },
      conversationId: 'conversation-a',
      conversationGeneration: 0,
      pendingPageContext: null as string | null,
      pendingPageContextSource: null as unknown,
      selectedModel: 'auto',
      workMode: 'chat',
      quickMode: false,
    };
    const input = document.createElement('textarea');
    input.id = 'sp-input';
    document.body.appendChild(input);
    const capture = {
      ok: true as const,
      text: 'Article text',
      source: { tabId: 4, url: 'https://example.com/a', title: 'A' },
    };
    type CaptureResult = typeof capture | { ok: false; reason: string };
    let resolveCapture: ((value: CaptureResult) => void) | undefined;
    let earlyAnswer: CaptureResult | undefined;
    const answerCapture = (value: CaptureResult): void => {
      if (resolveCapture) resolveCapture(value);
      else earlyAnswer = value;
    };
    const capturePageContext = vi.fn(
      () =>
        new Promise<CaptureResult>((resolve) => {
          resolveCapture = resolve;
          if (earlyAnswer) resolve(earlyAnswer);
        }),
    );
    const sendMessage = vi.fn(() => true);
    const canAdmitComposerMessage = vi.fn(() => true);
    const images: unknown[] = [];
    const api = run<{
      check: () => void;
      edit: () => void;
      notice: () => string | null;
      active: () => number;
    }>(
      `let composerContextNotice: string | null = null;
       let composerDraftRevision = 0;
       ${slice(panelSource, 'interface PendingComposerChat', 'async function checkPendingContextHandoff')}`,
      `{ check: checkPendingChat, edit: () => { composerDraftRevision += 1; },
         notice: () => composerContextNotice, active: () => pendingChatCaptures.size }`,
      {
        _ctx: ctx,
        document,
        editableRewrites: { cancel: vi.fn() },
        activePageQuery: async () => ({ active: true, currentWindow: true }),
        chrome: {
          runtime: {},
          storage: {
            session: {
              get: (_key: string, callback?: (result: Record<string, unknown>) => void) => {
                if (!callback) return Promise.resolve({ agi_pending_chat: stored });
                if (delayStorage) reads.push(callback);
                else callback({ agi_pending_chat: stored });
              },
              remove,
            },
          },
        },
        PENDING_CHAT_TTL_MS: 60_000,
        assistantHostWindowId: async () => 1,
        SLASH_COMMANDS: { '/summarize': { prompt: 'Summarize' } },
        sameManagedCloudOwner,
        pendingBrowserContextTabs: [],
        pendingDocuments: images,
        composerAttachmentIntakes: new Set(),
        composerVideoMode: false,
        composerSkill: null,
        pendingAttachmentCount: () => images.length,
        canAdmitComposerMessage,
        capturePageContext,
        updateAttachmentPreview: vi.fn(),
        updateContextButton: vi.fn(),
        sendMessage,
        pendingChatPrompt: (value: { text: string }) => value.text,
        replaceComposerText: vi.fn((element: HTMLTextAreaElement, text: string) => {
          element.value = text;
        }),
        autoResizeInput: vi.fn(),
        updateSendButton: vi.fn(),
      },
    );
    return {
      ...api,
      ctx,
      input,
      capture,
      capturePageContext,
      sendMessage,
      remove,
      canAdmitComposerMessage,
      images,
      resolve: (value = capture) => answerCapture(value),
      fail: () => answerCapture({ ok: false, reason: 'Page access refused.' }),
      flushStorage: () =>
        reads.splice(0).forEach((callback) => callback({ agi_pending_chat: stored })),
      stored: () => stored,
      replacePending: () => {
        stored = { ...pending, timestamp: pending.timestamp + 1 };
      },
    };
  }

  it('attaches a current page and waits for the question instead of sending', async () => {
    const h = harness();
    h.check();
    h.resolve();
    await vi.waitFor(() => expect(h.active()).toBe(0));
    expect(h.ctx.pendingPageContext).toBe('Article text');
    expect(h.ctx.pendingPageContextSource).toEqual(h.capture.source);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalledWith('agi_pending_chat');
    expect(document.activeElement).toBe(h.input);
  });

  it.each(['account', 'incarnation', 'conversation', 'draft'])(
    'ignores a stale %s invocation before the storage callback',
    async (change) => {
      const h = harness('summarize', true);
      h.check();
      if (change === 'account') h.ctx.managedCloudOwner.accountId = 'owner-b';
      if (change === 'incarnation') h.ctx.managedCloudOwner.authIncarnation = 'session-b';
      if (change === 'conversation') h.ctx.conversationGeneration += 1;
      if (change === 'draft') {
        h.input.value = 'New question';
        h.edit();
      }
      h.flushStorage();
      expect(h.capturePageContext).not.toHaveBeenCalled();
      expect(h.sendMessage).not.toHaveBeenCalled();
      expect(h.remove).not.toHaveBeenCalled();
    },
  );

  it.each(['account', 'incarnation', 'conversation', 'draft', 'edit-and-revert', 'attachment'])(
    'does not apply a capture after a %s change',
    async (change) => {
      const h = harness('summarize');
      h.check();
      if (change === 'account') h.ctx.managedCloudOwner.accountId = 'owner-b';
      if (change === 'incarnation') h.ctx.managedCloudOwner.authIncarnation = 'session-b';
      if (change === 'conversation') h.ctx.conversationId = 'conversation-b';
      if (change === 'draft') {
        h.input.value = 'New question';
        h.edit();
      }
      if (change === 'edit-and-revert') h.edit();
      if (change === 'attachment') h.images.push({ name: 'New attachment' });
      h.resolve();
      await vi.waitFor(() => expect(h.active()).toBe(0));
      expect(h.ctx.pendingPageContext).toBeNull();
      expect(h.sendMessage).not.toHaveBeenCalled();
      expect(h.remove).not.toHaveBeenCalled();
      expect(h.stored()).toBeDefined();
      expect(h.notice()).toBeNull();
    },
  );

  it('deduplicates overlapping capture checks in the same panel', async () => {
    const h = harness();
    h.check();
    h.check();
    expect(h.capturePageContext).toHaveBeenCalledOnce();
    h.resolve();
    await vi.waitFor(() => expect(h.active()).toBe(0));
    expect(h.remove).toHaveBeenCalledOnce();
  });

  it('transfers the intent and captured page to a draft when synchronous send admission refuses', async () => {
    const h = harness('summarize');
    h.sendMessage.mockImplementation(() => {
      h.ctx.conversationGeneration += 1;
      return false;
    });
    h.check();
    h.resolve();
    await vi.waitFor(() => expect(h.active()).toBe(0));
    expect(h.ctx.pendingPageContext).toBe('Article text');
    expect(h.input.value).toBe('Summarize');
    expect(h.remove).toHaveBeenCalledWith('agi_pending_chat');
    expect(h.stored()).toBeUndefined();
    expect(h.notice()).toContain('saved in your draft');
  });

  it.each(['ask-page', 'summarize'])(
    'preserves %s intent if readiness is lost during capture',
    async (type) => {
      const h = harness(type);
      h.check();
      h.canAdmitComposerMessage.mockReturnValue(false);
      h.resolve();
      await vi.waitFor(() => expect(h.active()).toBe(0));
      expect(h.ctx.pendingPageContext).toBeNull();
      expect(h.remove).not.toHaveBeenCalled();
      expect(h.sendMessage).not.toHaveBeenCalled();
      expect(h.notice()).toContain('chat is not ready');
    },
  );

  it('retains a refused capture request with an explicit reason', async () => {
    const h = harness('summarize');
    h.check();
    h.fail();
    await vi.waitFor(() => expect(h.active()).toBe(0));
    expect(h.notice()).toBe('Page access refused.');
    expect(h.ctx.pendingPageContext).toBeNull();
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('refuses to replace an existing draft or attachment', () => {
    const h = harness('summarize');
    h.input.value = 'Keep my question';
    h.images.push({ name: 'Keep my attachment' });
    h.check();
    expect(h.capturePageContext).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.input.value).toBe('Keep my question');
    expect(h.images).toHaveLength(1);
    expect(h.notice()).toContain('not applied');
  });

  it('leaves a different pending request found by the removal read untouched', async () => {
    const h = harness('summarize');
    h.check();
    h.replacePending();
    const replacement = h.stored();
    h.resolve();
    await vi.waitFor(() => expect(h.active()).toBe(0));
    expect(h.sendMessage).toHaveBeenCalledExactlyOnceWith('Summarize');
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.stored()).toBe(replacement);
  });

  it('sends the current summary and clears its pending request', async () => {
    const h = harness('summarize');
    h.check();
    h.resolve();
    await vi.waitFor(() => expect(h.active()).toBe(0));
    expect(h.sendMessage).toHaveBeenCalledExactlyOnceWith('Summarize');
    expect(h.remove).toHaveBeenCalledWith('agi_pending_chat');
  });
});

describe('selected-text Ask in the browser', () => {
  it('stages a browser selection without preparing a native handoff', () => {
    const set = vi.fn(async () => undefined);
    const handoff = vi.fn();
    const open = vi.fn(async () => undefined);
    const handle = run<(info: Record<string, unknown>, tab: Record<string, unknown>) => void>(
      `${slice(backgroundSource, 'const pendingChatWindowStamp', 'const pendingEditableCaptures')}
       ${slice(backgroundSource, 'function handleContextMenuClick', 'chrome.contextMenus?.onClicked')}`,
      'handleContextMenuClick',
      {
        chrome: { storage: { session: { set } } },
        openAssistantPanel: open,
        logger: { warn: vi.fn() },
        createSelectionContextHandoff: handoff,
        CONTEXT_HANDOFF_STORAGE_KEY: 'handoff',
        showNotification: vi.fn(),
        ensureTabGroup: vi.fn(),
      },
    );
    handle(
      {
        menuItemId: 'ask-agi-workforce',
        selectionText: 'Selected phrase',
        pageUrl: 'https://example.com/a',
      },
      { id: 4, windowId: 2 },
    );
    expect(set).toHaveBeenCalledWith({
      agi_pending_chat: expect.objectContaining({
        type: 'ask-selection',
        text: 'Selected phrase',
        tabId: 4,
        windowId: 2,
        url: 'https://example.com/a',
      }),
    });
    expect(handoff).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith({ tabId: 4, windowId: 2 });
  });

  function selectionHarness(url = 'https://example.com/a', blocked = false) {
    const input = document.createElement('textarea');
    input.id = 'sp-input';
    input.value = 'Keep my unsent question';
    document.body.appendChild(input);
    const pending = {
      type: 'ask-selection',
      text: `Selected phrase sk-ant-${'A'.repeat(60)}`,
      url: 'https://example.com/a',
      tabId: 4,
      timestamp: Date.now(),
    };
    const ctx = {
      managedCloudOwner: null,
      pendingPageContext: null as string | null,
      pendingPageContextSource: null,
      conversationGeneration: 1,
    };
    const sendMessage = vi.fn();
    const remove = vi.fn(async () => undefined);
    const api = run<{ check: () => void }>(
      `let composerContextNotice = null; let composerDraftRevision = 0; let pendingSelectionText = null; let pendingBrowserContextTabs = [];\n${slice(panelSource, 'interface PendingComposerChat', 'async function checkPendingContextHandoff')}`,
      '{ check: checkPendingChat }',
      {
        _ctx: ctx,
        document,
        sameManagedCloudOwner,
        pendingDocuments: [],
        composerAttachmentIntakes: new Set(),
        composerVideoMode: false,
        composerSkill: null,
        editableRewrites: { cancel: vi.fn() },
        chrome: {
          runtime: {},
          tabs: { get: async () => ({ id: 4, url }) },
          storage: {
            session: {
              get: (_key: string, callback: (result: unknown) => void) =>
                callback({ agi_pending_chat: pending }),
              remove,
            },
          },
        },
        prepareSelectionContext,
        isUserBlockedSite: async () => blocked,
        PENDING_CHAT_TTL_MS: 60_000,
        canAdmitComposerMessage: () => false,
        PAGE_CONTEXT_CHANGED_REASON: 'The page changed.',
        t: (_key: string, values: string[]) => values.join(' '),
        pageChipLabel: (value: string) => value,
        updateAttachmentPreview: vi.fn(),
        updateContextButton: vi.fn(),
        sendMessage,
      },
    );
    return { ...api, ctx, input, sendMessage, remove };
  }

  it('attaches redacted selection, preserves the draft and waits for Send even before message admission', async () => {
    const h = selectionHarness();
    h.check();
    await vi.waitFor(() => expect(h.ctx.pendingPageContext).toContain('Selected phrase'));
    expect(h.ctx.pendingPageContext).toContain('[REDACTED_ANTHROPIC_KEY]');
    expect(h.ctx.pendingPageContext).not.toContain('sk-ant-');
    expect(h.ctx.pendingPageContextSource).toMatchObject({
      tabId: 4,
      url: 'https://example.com/a',
    });
    expect(h.input.value).toBe('Keep my unsent question');
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalledWith('agi_pending_chat');
    h.input.remove();
  });

  it.each([
    ['https://different.example/', false],
    ['https://example.com/a', true],
  ])('refuses changed or blocked selection sources', async (url, blocked) => {
    const h = selectionHarness(url as string, blocked as boolean);
    h.check();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.ctx.pendingPageContext).toBeNull();
    expect(h.sendMessage).not.toHaveBeenCalled();
    h.input.remove();
  });
});
