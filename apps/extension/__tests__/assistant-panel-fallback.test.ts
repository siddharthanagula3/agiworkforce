import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activePageQuery,
  assistantWindowUrl,
  isAssistantWindowHost,
  openAssistantPanel,
  pageWindowQuery,
} from '../src/features/surface/assistantPanel';

const PANEL_URL = 'chrome-extension://ext/src/side_panel.html?host=window';

function stubChrome(options: { sidePanel: boolean; existingWindow?: number }) {
  const sidePanelOpen = vi.fn(async () => undefined);
  const create = vi.fn(async () => ({ id: 77 }));
  const update = vi.fn(async () => ({}));
  const chromeStub = {
    runtime: { getURL: (path: string) => `chrome-extension://ext/${path}` },
    ...(options.sidePanel ? { sidePanel: { open: sidePanelOpen } } : {}),
    windows: {
      getAll: vi.fn(async () =>
        options.existingWindow === undefined
          ? [{ id: 5, tabs: [{ url: 'https://news.example/' }] }]
          : [{ id: options.existingWindow, tabs: [{ url: PANEL_URL }] }],
      ),
      get: vi.fn(async (id: number) => ({ id, left: 100, top: 40, width: 1200, height: 900 })),
      getLastFocused: vi.fn(async () => ({ id: 3, left: 0, top: 0, width: 1000, height: 800 })),
      getCurrent: vi.fn(async () => ({ id: 9 })),
      create,
      update,
    },
  };
  vi.stubGlobal('chrome', chromeStub);
  return { sidePanelOpen, create, update, chromeStub };
}

afterEach(() => vi.unstubAllGlobals());

describe('opening the assistant in any Chromium browser', () => {
  it('opens Chrome’s side panel in the same tick, so the user gesture still counts', () => {
    const { sidePanelOpen, create } = stubChrome({ sidePanel: true });
    void openAssistantPanel({ tabId: 4, windowId: 2 });
    expect(sidePanelOpen).toHaveBeenCalledWith({ tabId: 4 });
    expect(create).not.toHaveBeenCalled();
  });

  it('opens a panel window beside the browser window where there is no side panel API', async () => {
    const { create } = stubChrome({ sidePanel: false });
    await openAssistantPanel({ tabId: 4, windowId: 2 });
    expect(create).toHaveBeenCalledWith({
      url: PANEL_URL,
      type: 'popup',
      width: 440,
      focused: true,
      left: 860,
      top: 40,
      height: 900,
    });
  });

  it('brings the open panel window forward instead of opening a second one', async () => {
    const { create, update } = stubChrome({ sidePanel: false, existingWindow: 12 });
    await openAssistantPanel({ windowId: 2 });
    expect(update).toHaveBeenCalledWith(12, { focused: true });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('which page the panel works on', () => {
  it('uses its own window in a side panel and the last browser window in a panel window', async () => {
    stubChrome({ sidePanel: false });
    expect(isAssistantWindowHost('')).toBe(false);
    expect(isAssistantWindowHost('?host=window')).toBe(true);
    expect(assistantWindowUrl()).toBe(PANEL_URL);
    vi.stubGlobal('location', { search: '' });
    expect(await activePageQuery()).toEqual({ active: true, currentWindow: true });
    vi.stubGlobal('location', { search: '?host=window' });
    expect(await activePageQuery()).toEqual({ active: true, windowId: 3 });
    expect(await pageWindowQuery()).toEqual({ windowId: 3 });
  });
});

describe('toolbar button without a side panel API', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/background.ts'), 'utf8');
  const start = source.indexOf('chrome.action?.onClicked?.addListener');
  const end = source.indexOf('\n});\n', start) + 4;

  function register(sidePanel: boolean) {
    let listener: ((tab: { windowId: number }) => void) | undefined;
    const open = vi.fn(async () => undefined);
    const compiled = ts.transpileModule(source.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    });
    // llm-guardrail-allow: executes repository-owned extension code inside this isolated test fixture.
    new Function(
      'chrome',
      'sidePanelAvailable',
      'openAssistantPanel',
      'logger',
      compiled.outputText,
    )(
      { action: { onClicked: { addListener: (fn: typeof listener) => (listener = fn) } } },
      () => sidePanel,
      open,
      { warn: vi.fn() },
    );
    return { click: (windowId: number) => listener?.({ windowId }), open };
  }

  it('opens the panel window from the toolbar when the browser has no side panel', () => {
    const toolbar = register(false);
    toolbar.click(6);
    expect(toolbar.open).toHaveBeenCalledWith({ windowId: 6 });
  });

  it('leaves the click to Chrome’s own side panel behaviour when it exists', () => {
    const toolbar = register(true);
    toolbar.click(6);
    expect(toolbar.open).not.toHaveBeenCalled();
  });
});
