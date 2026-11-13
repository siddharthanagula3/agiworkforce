import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

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

function contextMenuHandler(dependencies: Record<string, unknown>) {
  return run<(info: Record<string, unknown>, tab: Record<string, unknown>) => void>(
    slice(backgroundSource, 'function handleContextMenuClick', 'chrome.contextMenus?.onClicked'),
    'handleContextMenuClick',
    {
      logger: { warn: vi.fn() },
      CONTEXT_HANDOFF_STORAGE_KEY: 'handoff',
      SEND_SELECTION_TO_DESKTOP_MENU_ID: 'send-selection-to-desktop',
      showNotification: vi.fn(),
      ensureTabGroup: vi.fn(),
      ...dependencies,
    },
  );
}

describe('right-click Ask AGI about a selection', () => {
  it('opens the side panel with the selection for a question instead of a Desktop handoff', () => {
    const set = vi.fn(async () => undefined);
    const open = vi.fn(async () => undefined);
    const createSelectionContextHandoff = vi.fn();
    const handle = contextMenuHandler({
      chrome: { storage: { session: { set } } },
      openAssistantPanel: open,
      createSelectionContextHandoff,
    });

    handle(
      {
        menuItemId: 'ask-agi-workforce',
        selectionText: 'The loaf costs 7.40',
        pageUrl: 'https://example.com/a',
      },
      { id: 4, windowId: 2 },
    );

    expect(set).toHaveBeenCalledWith({
      agi_pending_chat: expect.objectContaining({
        type: 'ask',
        text: 'The loaf costs 7.40',
        url: 'https://example.com/a',
        tabId: 4,
      }),
    });
    expect(open).toHaveBeenCalledWith({ tabId: 4, windowId: 2 });
    expect(createSelectionContextHandoff).not.toHaveBeenCalled();
  });

  it('keeps the Desktop handoff on its own item that shows only while Desktop is paired', () => {
    const items = slice(backgroundSource, 'const CONTEXT_MENU_ITEMS', '];');
    expect(items).toMatch(
      /id: SEND_SELECTION_TO_DESKTOP_MENU_ID,\s*title: t\('menuSendSelectionToDesktop'\),\s*contexts: \['selection'\],\s*visible: false,/,
    );
    expect(manifestCatalog['menuSendSelectionToDesktop']?.message).toBe(
      'Send selection to AGI Desktop',
    );

    const update = vi.fn();
    const setItem = vi.fn(async () => undefined);
    const setDesktopPaired = run<(paired: boolean) => void>(
      `${slice(backgroundSource, 'function setDesktopPaired', '/**')}\n${slice(
        backgroundSource,
        'function showDesktopSelectionMenu',
        'function handleContextMenuClick',
      )}`,
      'setDesktopPaired',
      {
        chrome: { contextMenus: { update }, runtime: {} },
        storageUtils: { setItem },
        DESKTOP_PAIRED_KEY: 'paired',
        SEND_SELECTION_TO_DESKTOP_MENU_ID: 'send-selection-to-desktop',
      },
    );
    setDesktopPaired(true);
    expect(update).toHaveBeenLastCalledWith(
      'send-selection-to-desktop',
      { visible: true },
      expect.any(Function),
    );
    setDesktopPaired(false);
    expect(update).toHaveBeenLastCalledWith(
      'send-selection-to-desktop',
      { visible: false },
      expect.any(Function),
    );

    const createSelectionContextHandoff = vi.fn(() => ({ tabId: 4 }));
    const set = vi.fn(async () => undefined);
    const handle = contextMenuHandler({
      chrome: { storage: { session: { set } } },
      openAssistantPanel: vi.fn(async () => undefined),
      createSelectionContextHandoff,
    });
    handle(
      { menuItemId: 'send-selection-to-desktop', selectionText: 'x', pageUrl: 'https://e.com' },
      { id: 4, windowId: 2 },
    );
    expect(createSelectionContextHandoff).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ handoff: { tabId: 4 } });
  });

  function pendingChatChecker(pending: Record<string, unknown>, ctx: Record<string, unknown>) {
    const remove = vi.fn(async () => undefined);
    const sendMessage = vi.fn();
    const check = run<() => void>(
      `let composerContextNotice = null;\nlet offeredSelectionKey = null;\nlet pendingSelectionText = null;\n${slice(
        panelSource,
        'async function attachPageForQuestion',
        'async function checkPendingContextHandoff',
      )}`,
      'checkPendingChat',
      {
        _ctx: ctx,
        chrome: {
          runtime: {},
          storage: {
            session: {
              get: (_key: string, callback: (result: Record<string, unknown>) => void) =>
                callback({ agi_pending_chat: pending }),
              remove,
            },
          },
        },
        PENDING_CHAT_TTL_MS: 60_000,
        SLASH_COMMANDS: { '/summarize': { prompt: 'Summarize' } },
        canAdmitComposerMessage: () => true,
        capturePageContext: vi.fn(),
        clearPendingPageContext: () => {
          ctx['pendingPageContext'] = null;
          ctx['pendingPageContextSource'] = null;
        },
        prepareSelectionContext: (selection: { text: string }, url: string) =>
          url.startsWith('https:') ? { text: selection.text.trim(), truncated: false } : null,
        pageChipLabel: (url: string) => new URL(url).hostname,
        t: (key: string, substitutions: string[] = []) => `${key}:${substitutions.join(',')}`,
        updateAttachmentPreview: vi.fn(),
        updateContextButton: vi.fn(),
        sendMessage,
        pendingChatPrompt: (value: { text: string }) => value.text,
        replaceComposerText: (target: HTMLTextAreaElement, text: string) => {
          target.focus();
          target.value = text;
        },
        autoResizeInput: vi.fn(),
        updateSendButton: vi.fn(),
      },
    );
    return { check, remove, sendMessage };
  }

  it('attaches the selection once as the context chip and leaves the composer for the question', () => {
    const input = document.createElement('textarea');
    input.id = 'sp-input';
    document.body.appendChild(input);
    const ctx: Record<string, unknown> = {
      pendingPageContext: null,
      pendingPageContextSource: null,
    };
    const { check, remove, sendMessage } = pendingChatChecker(
      {
        type: 'ask',
        text: '  The loaf costs 7.40  ',
        url: 'https://example.com/a',
        tabId: 4,
        timestamp: Date.now(),
      },
      ctx,
    );

    check();

    expect(input.value).toBe('');
    expect(ctx['pendingPageContext']).toBe('The loaf costs 7.40');
    expect(ctx['pendingPageContextSource']).toEqual({
      tabId: 4,
      url: 'https://example.com/a',
      title: 'spSelectionChipTitle:example.com',
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('agi_pending_chat');
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it('quotes the selection in the composer only when the page cannot carry a context chip', () => {
    const input = document.createElement('textarea');
    input.id = 'sp-input';
    document.body.appendChild(input);
    const ctx: Record<string, unknown> = {
      pendingPageContext: null,
      pendingPageContextSource: null,
    };
    const { check } = pendingChatChecker(
      { type: 'ask', text: 'local note', url: 'file:///a.txt', tabId: 4, timestamp: Date.now() },
      ctx,
    );

    check();

    expect(input.value).toBe('"local note"\n\n');
    expect(ctx['pendingPageContext']).toBeNull();
    input.remove();
  });

  it('shows a short preview of a long selection so the conversation stays in view', () => {
    expect(panelSource).toMatch(
      /\.sp-attachment-selection \.sp-attachment-doc-status \{[^}]*-webkit-line-clamp: 2;[^}]*overflow: hidden;/,
    );
  });
});
