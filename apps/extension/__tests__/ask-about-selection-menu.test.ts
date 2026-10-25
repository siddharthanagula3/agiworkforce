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

  it('quotes the selection in the composer and waits for the question instead of sending it', () => {
    const pending = {
      type: 'ask',
      text: '  The loaf costs 7.40  ',
      url: 'https://example.com/a',
      timestamp: Date.now(),
    };
    const remove = vi.fn(async () => undefined);
    const sendMessage = vi.fn();
    const input = document.createElement('textarea');
    input.id = 'sp-input';
    document.body.appendChild(input);
    const check = run<() => void>(
      `let composerContextNotice = null;\n${slice(
        panelSource,
        'async function attachPageForQuestion',
        'async function checkPendingContextHandoff',
      )}`,
      'checkPendingChat',
      {
        _ctx: {},
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

    check();

    expect(input.value).toBe('"The loaf costs 7.40"\n\n');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('agi_pending_chat');
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
