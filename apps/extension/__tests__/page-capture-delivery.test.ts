import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  captureAdmittedTab,
  deliverPageCapture,
  PAGE_CAPTURE_UNDELIVERED_TITLE,
} from '../src/features/background/page-capture';

const here = dirname(fileURLToPath(import.meta.url));

function harness(send: () => Promise<{ success?: boolean; error?: string } | undefined>) {
  const store = { actionCount: 7 };
  const notify = vi.fn();
  return {
    store,
    notify,
    run: () =>
      deliverPageCapture({
        send,
        readActionCount: async () => store.actionCount,
        writeActionCount: async (count) => {
          store.actionCount = count;
        },
        notify,
        sent: { title: 'Sent title', message: 'Sent message' },
      }),
  };
}

describe('capture_page only counts a capture the desktop actually received', () => {
  it('leaves the Actions stat untouched and warns when no native host is connected', async () => {
    const h = harness(async () => ({ success: false, error: 'Not connected to native host' }));

    await expect(h.run()).resolves.toBe(false);

    expect(h.store.actionCount).toBe(7);
    expect(h.notify).toHaveBeenCalledWith(
      PAGE_CAPTURE_UNDELIVERED_TITLE,
      expect.stringContaining('AGI Desktop is not connected'),
    );
  });

  it('leaves the stat untouched when the native send throws', async () => {
    const h = harness(async () => {
      throw new Error('port closed');
    });

    await expect(h.run()).resolves.toBe(false);

    expect(h.store.actionCount).toBe(7);
    expect(h.notify).toHaveBeenCalledWith(
      PAGE_CAPTURE_UNDELIVERED_TITLE,
      expect.stringContaining('port closed'),
    );
  });

  it('counts the capture and confirms it once the desktop confirms delivery', async () => {
    const h = harness(async () => ({ success: true }));

    await expect(h.run()).resolves.toBe(true);

    expect(h.store.actionCount).toBe(8);
    expect(h.notify).toHaveBeenCalledOnce();
    expect(h.notify).toHaveBeenCalledWith('Sent title', 'Sent message');
  });

  it('tells the user in the catalog that the shortcut sends a screenshot to Desktop', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(here, '..', '_locales/en/messages.json'), 'utf8'),
    ) as Record<string, { message: string }>;
    for (const key of ['obTourShortcutsText', 'optShortcutCapturePage', 'commandCapturePage']) {
      const words = catalog[key]!.message.replace(/\$[A-Z]+\$/g, '');
      expect(words, key).toMatch(/Desktop/);
      expect(words, key).not.toMatch(/attach|capture/i);
    }
    expect(catalog['pageCaptureSentMessage']!.message).toMatch(/Desktop/);
  });

  it('routes the capture_page command through the delivery gate, not fire-and-forget', () => {
    const background = readFileSync(resolve(here, '..', 'src/background.ts'), 'utf8');
    const captureFn = background.slice(
      background.indexOf('async function captureCurrentPage('),
      background.indexOf('async function handleChatMessage('),
    );

    expect(captureFn).toContain('deliverPageCapture(');
    expect(captureFn).not.toContain('sendNativeMessage(');
    expect(captureFn).not.toMatch(/actionCount: actionCount \+ 1/);
  });
});

describe('capture_page photographs only the tab it admitted', () => {
  const source = { id: 11, windowId: 2, url: 'https://approved.example/page' };
  const admitted = { id: 11, url: 'https://approved.example/page' };

  it('returns the pixels while the admitted tab stays showing', async () => {
    const capture = vi.fn(async () => 'data:image/png;base64,AAAA');

    await expect(
      captureAdmittedTab(source, { visibleTab: async () => admitted, capture }),
    ).resolves.toBe('data:image/png;base64,AAAA');
    expect(capture).toHaveBeenCalledWith(2);
  });

  it('does not capture when another tab took over during authorization', async () => {
    const capture = vi.fn(async () => 'data:image/png;base64,BBBB');

    await expect(
      captureAdmittedTab(source, {
        visibleTab: async () => ({ id: 12, url: 'https://other.example/' }),
        capture,
      }),
    ).resolves.toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  it('withholds the pixels when another tab took over while capturing', async () => {
    const showing = [admitted, { id: 12, url: 'https://other.example/' }];
    const capture = vi.fn(async () => 'data:image/png;base64,CCCC');

    await expect(
      captureAdmittedTab(source, { visibleTab: async () => showing.shift(), capture }),
    ).resolves.toBeNull();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('withholds the pixels when the admitted tab navigated elsewhere', async () => {
    const showing = [admitted, { id: 11, url: 'https://other.example/' }];

    await expect(
      captureAdmittedTab(source, {
        visibleTab: async () => showing.shift(),
        capture: async () => 'data:image/png;base64,DDDD',
      }),
    ).resolves.toBeNull();
  });

  it('does not capture when the window has no showing tab', async () => {
    const capture = vi.fn(async () => 'data:image/png;base64,EEEE');

    await expect(
      captureAdmittedTab(source, { visibleTab: async () => undefined, capture }),
    ).resolves.toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  it('lets a Chrome capture rejection through to the failure notice', async () => {
    await expect(
      captureAdmittedTab(source, {
        visibleTab: async () => admitted,
        capture: async () => {
          throw new Error('denied');
        },
      }),
    ).rejects.toThrow('denied');
  });

  it('routes the shortcut through the admitted-tab capture and tells the user when it is withheld', () => {
    const background = readFileSync(resolve(here, '..', 'src/background.ts'), 'utf8');
    const captureFn = background.slice(
      background.indexOf('async function captureCurrentPage('),
      background.indexOf('async function handleChatMessage('),
    );

    expect(captureFn).toContain('captureAdmittedTab(');
    expect(captureFn).toContain('PAGE_CAPTURE_TAB_CHANGED_MESSAGE');
    expect(captureFn.indexOf('captureAdmittedTab(')).toBeLessThan(
      captureFn.indexOf('deliverPageCapture('),
    );
  });
});

describe('page context is never silently missing', () => {
  const sidePanel = readFileSync(resolve(here, '..', 'src/side_panel.ts'), 'utf8');

  it('resolves a reason instead of null so a caller can say what went wrong', () => {
    const resultType = sidePanel.slice(
      sidePanel.indexOf('export type PageContextCapture'),
      sidePanel.indexOf('function describePageContextFailure'),
    );
    expect(resultType).toMatch(/ok: true;\s*text: string;/);
    expect(resultType).toMatch(/\|\s*\{ ok: false; reason: string \}/);
    const capture = sidePanel.slice(
      sidePanel.indexOf('async function capturePageContext('),
      sidePanel.indexOf('function requestStreamCancellation('),
    );
    expect(capture).not.toMatch(/resolve\(null\)/);
    expect(capture).toContain('describePageContextFailure(');
  });

  it('names a denied executeScript as a page Chrome blocks, not as a site-approval problem', () => {
    expect(sidePanel).toMatch(
      /function describePageContextFailure[\s\S]*cannot access[\s\S]*host permission[\s\S]*PAGE_CONTEXT_DENIED_REASON/,
    );
    expect(sidePanel).toContain('AGI does not have access to this site yet');
    expect(sidePanel).not.toContain('Add this site under Approved sites');
    expect(sidePanel).not.toContain('Site Allowlist in this panel');
  });

  it('sends a page Chrome blocks outright to different copy than a page awaiting site approval', () => {
    expect(sidePanel).toContain('PAGE_CONTEXT_BLOCKED_REASON');
    expect(sidePanel).toContain('does not let extensions read this page at all');
    const routing = sidePanel.slice(
      sidePanel.indexOf('function describePageContextFailure'),
      sidePanel.indexOf('}', sidePanel.indexOf('return `The page could not be read')),
    );
    expect(routing.indexOf('PAGE_CONTEXT_BLOCKED_REASON')).toBeLessThan(
      routing.indexOf('PAGE_CONTEXT_DENIED_REASON'),
    );
  });

  it('refuses a page-scoped command whose capture came from a different page than the one it was issued on', () => {
    const start = sidePanel.indexOf('function dispatchTurn(');
    const end = sidePanel.indexOf('function postTurn(', start);
    const slashSend = sidePanel.slice(start, end);
    expect(slashSend).toContain(
      'const pageAtAdmission = payload.browserSource ?? activePageSource',
    );
    expect(slashSend).toMatch(
      /pageContextStillDescribes\(pageAtAdmission, capture\.source\.tabId, capture\.source\.url\)/,
    );
    expect(slashSend).toContain('PAGE_CONTEXT_CHANGED_REASON');
  });

  it('asks for this site in the chat before refusing a page command for missing access', () => {
    const helper = sidePanel.slice(
      sidePanel.indexOf('async function capturePageContextWithSiteAccess('),
      sidePanel.indexOf('function readTabText('),
    );
    expect(helper).toContain('capture.reason !== PAGE_CONTEXT_DENIED_REASON');
    expect(helper).toContain("scope: SiteGrantScope = 'read'");
    expect(helper).toContain('requestBrowserSiteAccess(streamId, scope)');
    expect(helper).toContain('await access.release?.()');
  });

  it('refuses a context-requiring slash command rather than answering about nothing', () => {
    const start = sidePanel.indexOf('function dispatchTurn(');
    const slashSend = sidePanel.slice(start, sidePanel.indexOf('function postTurn(', start));
    expect(slashSend).toContain('if (!pageText)');
    expect(slashSend).toContain(
      'handleStreamError(streamId, capture.ok ? PAGE_CONTEXT_EMPTY_REASON : capture.reason)',
    );
  });

  it('shows the reason on the composer when the context chip fails', () => {
    const chipHandler = sidePanel.slice(
      sidePanel.indexOf('let capture = await capturePageContext();'),
      sidePanel.indexOf('composerBarStart.appendChild(contextBtn)'),
    );
    expect(chipHandler).toContain('composerContextNotice = capture.reason');
    expect(chipHandler).toContain('updateAttachmentPreview()');
    expect(sidePanel).toContain("id: 'sp-context-notice'");
  });

  it('does not capture the screen when the only destination is an unpaired Desktop', () => {
    const background = readFileSync(resolve(here, '..', 'src/background.ts'), 'utf8');
    const start = background.indexOf('async function captureCurrentPage()');
    expect(start).toBeGreaterThan(-1);
    const capture = background.slice(
      start,
      background.indexOf('chrome.tabs.captureVisibleTab', start),
    );
    expect(capture).toContain('if (!state.isNativeConnected)');
    expect(capture).toContain('PAGE_CAPTURE_UNAVAILABLE_MESSAGE');
  });
});
