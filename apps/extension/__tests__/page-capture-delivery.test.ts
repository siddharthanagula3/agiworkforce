import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
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

  it('counts the capture and stays silent once the desktop confirms delivery', async () => {
    const h = harness(async () => ({ success: true }));

    await expect(h.run()).resolves.toBe(true);

    expect(h.store.actionCount).toBe(8);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('routes the capture_page command through the delivery gate, not fire-and-forget', () => {
    const background = readFileSync(resolve(here, '..', 'src/background.ts'), 'utf8');
    const captureFn = background.slice(
      background.indexOf('async function captureCurrentPage('),
      background.indexOf('const MAX_PROBE_RESPONSE_BYTES'),
    );

    expect(captureFn).toContain('deliverPageCapture(');
    expect(captureFn).not.toContain('sendNativeMessage(');
    expect(captureFn).not.toMatch(/actionCount: actionCount \+ 1/);
  });
});

describe('page context is never silently missing', () => {
  const sidePanel = readFileSync(resolve(here, '..', 'src/side_panel.ts'), 'utf8');

  it('resolves a reason instead of null so a caller can say what went wrong', () => {
    expect(sidePanel).toContain(
      'export type PageContextCapture = { ok: true; text: string } | { ok: false; reason: string }',
    );
    const capture = sidePanel.slice(
      sidePanel.indexOf('async function capturePageContext()'),
      sidePanel.indexOf('const PAGE_CONTEXT_MAX_CHARS') > 0
        ? sidePanel.indexOf('interface SlashCommandMeta')
        : sidePanel.length,
    );
    expect(capture).not.toMatch(/resolve\(null\)/);
    expect(capture).toContain('describePageContextFailure(scriptFailure)');
  });

  it('names a denied executeScript as a site-approval problem the user can fix', () => {
    expect(sidePanel).toMatch(
      /function describePageContextFailure[\s\S]*cannot access[\s\S]*host permission[\s\S]*PAGE_CONTEXT_DENIED_REASON/,
    );
    expect(sidePanel).toContain('Add this site under Approved sites in the');
  });

  it('refuses a context-requiring slash command rather than answering about nothing', () => {
    const slashSend = sidePanel.slice(
      sidePanel.indexOf('capturePageContext()\n      .then((capture)'),
      sidePanel.indexOf('const history = selectModelHistory'),
    );
    expect(slashSend).toContain('if (!pageCtx)');
    expect(slashSend).toContain(
      'handleStreamError(streamId, capture.ok ? PAGE_CONTEXT_EMPTY_REASON : capture.reason)',
    );
  });

  it('shows the reason on the composer when the context chip fails', () => {
    const chipHandler = sidePanel.slice(
      sidePanel.indexOf('const capture = await capturePageContext();'),
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
