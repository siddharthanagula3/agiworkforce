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
      slice(backgroundSource, 'function handleContextMenuClick', 'chrome.contextMenus?.onClicked'),
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
      }),
    });
    expect(open).toHaveBeenCalledWith({ tabId: 4, windowId: 2 });
  });

  it('attaches the page to the composer and waits for the question instead of sending', async () => {
    const pending = {
      type: 'ask-page',
      text: '',
      url: 'https://example.com/a',
      timestamp: Date.now(),
    };
    const remove = vi.fn(async () => undefined);
    const ctx = { pendingPageContext: null as string | null, pendingPageContextSource: null };
    const sendMessage = vi.fn();
    const input = document.createElement('textarea');
    input.id = 'sp-input';
    document.body.appendChild(input);
    const capture = {
      ok: true,
      text: 'Article text',
      source: { tabId: 4, url: 'https://example.com/a', title: 'A' },
    };
    const api = run<{ check: () => void; context: () => typeof ctx }>(
      `let composerContextNotice = 'old';\n${slice(
        panelSource,
        'async function attachPageForQuestion',
        'async function checkPendingContextHandoff',
      )}`,
      '{ check: checkPendingChat, context: () => _ctx }',
      {
        _ctx: ctx,
        activePageQuery: async () => ({ active: true, currentWindow: true }),
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
        capturePageContext: vi.fn(async () => capture),
        updateAttachmentPreview: vi.fn(),
        updateContextButton: vi.fn(),
        sendMessage,
        pendingChatPrompt: (value: { text: string }) => value.text,
        replaceComposerText: vi.fn(),
        autoResizeInput: vi.fn(),
        updateSendButton: vi.fn(),
      },
    );
    api.check();
    await vi.waitFor(() => expect(api.context().pendingPageContext).toBe('Article text'));
    expect(api.context().pendingPageContextSource).toEqual(capture.source);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('agi_pending_chat');
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
