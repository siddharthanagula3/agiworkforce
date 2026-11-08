import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  pageContextStillDescribes,
  type PageContextSource,
} from '../src/features/side-panel/chat-state';
import {
  getChromeSurfaceAvailability,
  isRestrictedPageUrl,
} from '../src/features/side-panel/surface-policy';

const sidePanelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

const navigationProgram = ts.createSourceFile(
  'side_panel.ts',
  sidePanelSource,
  ts.ScriptTarget.Latest,
  true,
);
const navigationFunctions = navigationProgram.statements.filter(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    [
      'clearPendingPageContext',
      'dropPageContextOnNavigation',
      'updateActivePage',
      'setBlockedState',
    ].includes(node.name?.text ?? ''),
);
if (navigationFunctions.length !== 4) throw new Error('Production navigation functions missing');

function navigationState(source: PageContextSource) {
  document.body.innerHTML = '<div id="sp-blocked"></div><textarea id="sp-input"></textarea>';
  const input = document.querySelector<HTMLTextAreaElement>('#sp-input')!;
  const contextButton = document.createElement('button');
  const context = {
    isConnected: false,
    pendingPageContext: 'Attached public text' as string | null,
    pendingPageContextSource: source as PageContextSource | null,
  };
  const updateAttachmentPreview = vi.fn();
  const dependencies = {
    document,
    _ctx: context,
    contextBtn: contextButton,
    pageContextStillDescribes,
    getChromeSurfaceAvailability,
    isRestrictedPageUrl,
    pageChipLabel: (url: string) => new URL(url).hostname,
    t: (key: string) => key,
    updateAttachmentPreview,
    updateContextButton: vi.fn(),
    updateAgentPageIndicator: vi.fn(),
    refreshComputerUseSiteHook: vi.fn(),
    updateSendButton: vi.fn(),
    updateEmptyStateActions: vi.fn(),
  };
  const compiled = ts.transpileModule(
    `let tabContextIntakeAbort = null;
     let pendingBrowserContextTabs = [];
     let activePageSource = null;
     let currentPageHostname = '';
     let composerContextNotice = null;
     const managedCloudChatState = 'ready';
     ${navigationFunctions.map((node) => node.getText(navigationProgram)).join('\n')}
     return updateActivePage;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned navigation functions in an isolated DOM fixture.
  const update = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as (url: string, tabId?: number) => void;
  return { update, context, input, contextButton, updateAttachmentPreview };
}

afterEach(() => document.body.replaceChildren());

function tabContextEvents(source: PageContextSource, tabs: readonly { tabId: number }[] = []) {
  const callbacks = new Map<string, ts.Node>();
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      for (const name of ['onUpdated', 'onRemoved']) {
        if (node.expression.getText(navigationProgram) === `chrome.tabs.${name}?.addListener`) {
          callbacks.set(name, node.arguments[0]!);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(navigationProgram);
  if (callbacks.size !== 2) throw new Error('Production tab lifecycle callbacks missing');
  const helpers = navigationProgram.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      ['clearPendingPageContext', 'attachedPageUsesTab'].includes(node.name?.text ?? ''),
  );
  const context = {
    pendingPageContext: 'Captured values' as string | null,
    pendingPageContextSource: source as PageContextSource | null,
  };
  const updateAttachmentPreview = vi.fn();
  const dependencies = {
    _ctx: context,
    editableRewrites: { invalidateTab: vi.fn() },
    taskSiteGrants: { releaseTab: vi.fn(async () => {}) },
    updateAttachmentPreview,
    updateContextButton: vi.fn(),
    refreshPageHostname: vi.fn(),
    t: (key: string) => key,
  };
  const compiled = ts.transpileModule(
    `let tabContextIntakeAbort = null;
     let pendingBrowserContextTabs = ${JSON.stringify(tabs)};
     let composerContextNotice = null;
     ${helpers.map((node) => node.getText(navigationProgram)).join('\n')}
     return {
       updated: ${callbacks.get('onUpdated')!.getText(navigationProgram)},
       removed: ${callbacks.get('onRemoved')!.getText(navigationProgram)},
       notice: () => composerContextNotice,
     };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned tab callbacks in an isolated fixture.
  const events = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as {
    updated(tabId: number, change: { url?: string; status?: 'loading' | 'complete' }): void;
    removed(tabId: number): void;
    notice(): string | null;
  };
  return { ...events, context, updateAttachmentPreview };
}

describe('captured tab document lifetime', () => {
  const live = { tabId: 7, url: 'https://example.org/', title: 'Example Domain' };

  it('drops a live snapshot when its source starts reloading at the same address', () => {
    const h = tabContextEvents(live);
    h.updated(7, { status: 'loading' });
    expect(h.context.pendingPageContext).toBeNull();
    expect(h.context.pendingPageContextSource).toBeNull();
    expect(h.notice()).toBe('spContextChipDropped');
    expect(h.updateAttachmentPreview).toHaveBeenCalledOnce();
  });

  it('drops a single explicitly chosen tab when that source navigates', () => {
    const h = tabContextEvents({ ...live, chosen: true });
    h.updated(7, { url: 'https://example.org/another' });
    expect(h.context.pendingPageContext).toBeNull();
    expect(h.notice()).toBe('spAttachedTabChanged');
  });

  it('drops a single chosen tab when the source closes', () => {
    const h = tabContextEvents({ ...live, chosen: true });
    h.removed(7);
    expect(h.context.pendingPageContext).toBeNull();
    expect(h.notice()).toBe('spAttachedTabClosed');
  });

  it('retains a public linked page across unrelated tab reloads and closures', () => {
    const source = { url: live.url, title: live.title, chosen: true };
    const h = tabContextEvents(source);
    h.updated(7, { status: 'loading' });
    h.removed(7);
    expect(h.context.pendingPageContext).toBe('Captured values');
    expect(h.context.pendingPageContextSource).toEqual(source);
    expect(h.updateAttachmentPreview).not.toHaveBeenCalled();
  });

  it('keeps a live source when another tab changes', () => {
    const h = tabContextEvents(live);
    h.updated(8, { status: 'loading' });
    h.removed(8);
    expect(h.context.pendingPageContextSource).toEqual(live);
  });

  it('invalidates a group when any selected source changes', () => {
    const h = tabContextEvents({ url: live.url, chosen: true }, [{ tabId: 7 }, { tabId: 8 }]);
    h.updated(8, { status: 'loading' });
    expect(h.context.pendingPageContext).toBeNull();
    expect(h.notice()).toBe('spAttachedTabChanged');
  });
});

describe('attached page context on protected browser pages', () => {
  it('retains an explicitly chosen public page while disabling current-page access', () => {
    const source = { url: 'https://example.org/', title: 'Example Domain', chosen: true };
    const h = navigationState(source);
    h.update('chrome-extension://test/src/options.html', 8);
    expect(h.context.pendingPageContext).toBe('Attached public text');
    expect(h.context.pendingPageContextSource).toEqual(source);
    expect(document.querySelector('#sp-blocked')?.classList.contains('visible')).toBe(true);
    expect(h.contextButton.disabled).toBe(true);
    expect(h.input.disabled).toBe(false);
  });

  it('removes a live-page snapshot and refreshes its preview on a protected-page switch', () => {
    const h = navigationState({ tabId: 7, url: 'https://example.org/', title: 'Example Domain' });
    h.update('chrome://extensions/', 8);
    expect(h.context.pendingPageContext).toBeNull();
    expect(h.context.pendingPageContextSource).toBeNull();
    expect(h.updateAttachmentPreview).toHaveBeenCalledOnce();
    expect(h.contextButton.disabled).toBe(true);
    expect(h.input.disabled).toBe(false);
  });
});

describe('Chrome side-panel surface ownership', () => {
  it('keeps Managed Cloud chat available when Desktop is disconnected', () => {
    expect(getChromeSurfaceAvailability({ nativeConnected: false, restrictedPage: false })).toEqual(
      { chat: true, pageContext: true, nativeTools: false },
    );
  });

  it('keeps chat available on restricted browser pages without claiming page context', () => {
    expect(getChromeSurfaceAvailability({ nativeConnected: false, restrictedPage: true })).toEqual({
      chat: true,
      pageContext: false,
      nativeTools: false,
    });
  });

  it('enables native browser mechanics independently of Managed Cloud chat', () => {
    expect(getChromeSurfaceAvailability({ nativeConnected: true, restrictedPage: false })).toEqual({
      chat: true,
      pageContext: true,
      nativeTools: true,
    });
  });

  it('uses the surface policy without disabling cloud chat for native status', () => {
    expect(sidePanelSource).toContain('getChromeSurfaceAvailability');
    expect(sidePanelSource).not.toContain('sendBtnEl.disabled = offline');
    expect(sidePanelSource).not.toContain('Start the AGI desktop app to enable chat');
  });

  it('shows an honest restricted-page notice while leaving Managed Cloud chat available', () => {
    const blockedStateStart = sidePanelSource.indexOf('function setBlockedState');
    const refreshStart = sidePanelSource.indexOf('function refreshPageHostname', blockedStateStart);
    const blockedStateSource = sidePanelSource.slice(blockedStateStart, refreshStart);

    expect(blockedStateSource).toContain("if (blocked) {\n    blockedEl.classList.add('visible')");
    expect(sidePanelSource).toContain("role: 'status'");
    expect(sidePanelSource).toContain('Chrome does not let extensions read or automate this page.');
  });

  it('cancels active cloud work before owner, new-chat, temporary-end, current-archive and current-delete transitions', () => {
    expect(sidePanelSource.match(/cancelCurrentManagedStream\(false\)/g)).toHaveLength(5);
    expect(sidePanelSource).toContain('requestStreamCancellation(streamId)');
  });

  it('claims stream ownership before asynchronous page capture begins', () => {
    const branchStart = sidePanelSource.indexOf('if (slashCmd?.captureContext)');
    expect(
      sidePanelSource.indexOf('const streamId = beginManagedStream(_ctx.quickMode)', branchStart),
    ).toBeLessThan(sidePanelSource.indexOf('capturePageContext()', branchStart));
    expect(sidePanelSource).not.toContain('stream-${Date.now()}');
  });
});

describe('isRestrictedPageUrl', () => {
  it('flags every page Chrome refuses to let extensions read', () => {
    for (const url of [
      'chrome://version',
      'chrome://newtab/',
      'chrome-extension://abc/src/side_panel.html',
      'chrome-untrusted://new-tab-page/',
      'devtools://devtools/bundled/inspector.html',
      'edge://settings',
      'about:blank',
      'view-source:https://example.com/',
      'file:///Users/me/report.html',
      'data:text/html,hi',
      'https://chromewebstore.google.com/detail/agi/abcdefghijklmnop',
      'https://chrome.google.com/webstore/detail/agi/abcdefghijklmnop',
    ]) {
      expect(isRestrictedPageUrl(url), url).toBe(true);
    }
  });

  it('leaves ordinary sites, an empty url and the web app alone', () => {
    for (const url of [
      '',
      'https://example.com/article',
      'http://localhost:3000/',
      'https://agiworkforce.com/chat',
    ]) {
      expect(isRestrictedPageUrl(url), url).toBe(false);
    }
  });
});
