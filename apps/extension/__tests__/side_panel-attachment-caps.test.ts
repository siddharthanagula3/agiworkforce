/**
 * The side-panel composer must not hold attachments the managed transport will
 * refuse to send. `executeChromeManagedChat` runs `assertAttachmentBudget`
 * (freeTrialClient) on the way out: at most MANAGED_CHAT_MAX_ATTACHMENTS images
 * totalling MANAGED_CHAT_MAX_ATTACHMENT_BYTES decoded bytes, each a base64 PNG,
 * JPEG, WebP or GIF. Anything the composer admits past that is discovered as a
 * failed turn *after* send, with the user's text already consumed.
 *
 * These tests drive the real listeners built by `buildUI()`, drop, paste, the
 * `+` menu file picker and the `+` menu screenshot, and read the resulting
 * attachments back out of the preview chips.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const chromeMock = vi.hoisted(() => {
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() });
  const area = {
    get: vi.fn(async () => ({})),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
  const mock = {
    screenshotDataUrl: '' as string,
    screenshotError: '' as string,
    runtime: {
      id: 'test-extension',
      onMessage: event(),
      onConnect: event(),
      connect: vi.fn(() => ({
        onMessage: event(),
        onDisconnect: event(),
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      })),
      sendMessage: vi.fn((message: { type?: string }, callback?: (response: unknown) => void) => {
        if (message?.type === 'CAPTURE_SCREENSHOT') {
          const response = mock.screenshotError
            ? { success: false, error: mock.screenshotError }
            : { success: true, data: mock.screenshotDataUrl };
          callback?.(response);
          return Promise.resolve(response);
        }
        return Promise.resolve({ success: true });
      }),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
      lastError: undefined,
    },
    storage: {
      local: area,
      session: { ...area, onChanged: event() },
      sync: area,
      onChanged: event(),
    },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
      create: vi.fn(),
      onActivated: event(),
      onUpdated: event(),
    },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    commands: { getAll: vi.fn(async () => []) },
    permissions: { contains: vi.fn(async () => true) },
    action: { onClicked: event() },
    sidePanel: { setPanelBehavior: vi.fn(async () => undefined) },
    i18n: { getMessage: vi.fn((key: string) => key) },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

import {
  createMultimodalUserContent,
  MANAGED_CHAT_MAX_ATTACHMENTS,
  MANAGED_CHAT_MAX_ATTACHMENT_BYTES,
  MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES,
} from '../src/features/cloud-bridge/freeTrialClient';
import '../src/side_panel';

function attachmentBar(): HTMLElement {
  const bar = document.getElementById('sp-attachment-bar');
  if (!bar) throw new Error('composer attachment bar was never built');
  return bar;
}

function pendingDataUrls(): string[] {
  return Array.from(attachmentBar().querySelectorAll<HTMLImageElement>('.sp-attachment-thumb')).map(
    (img) => img.getAttribute('src') ?? '',
  );
}

function noticeText(): string {
  return attachmentBar().querySelector('.sp-attachment-notice')?.textContent ?? '';
}

function imageFile(sizeBytes: number, type = 'image/png', name = 'shot.png'): File {
  return new File([new Uint8Array(sizeBytes).fill(65)], name, { type });
}

function dataUrlOfBytes(bytes: number, mime = 'image/png'): string {
  return `data:${mime};base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`;
}

function dropFiles(files: File[]): void {
  const shell = document.getElementById('sp-composer-shell') ?? attachmentBar().parentElement;
  if (!shell) throw new Error('composer shell was never built');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } });
  shell.dispatchEvent(event);
}

function pasteFiles(files: File[]): void {
  const input = document.getElementById('sp-input');
  if (!input) throw new Error('composer input was never built');
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    },
  });
  input.dispatchEvent(event);
}

function pickFiles(files: File[]): void {
  const input = document.getElementById('sp-attach-file-input') as HTMLInputElement | null;
  if (!input) throw new Error('composer file input was never built');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function captureScreenshot(dataUrl: string): void {
  chromeMock.screenshotDataUrl = dataUrl;
  const item = attachmentBar()
    .closest('#sp-composer-shell')
    ?.querySelector<HTMLElement>('.sp-attach-menu-item');
  const screenshotItem =
    item ?? document.querySelector<HTMLElement>('#sp-attach-menu .sp-attach-menu-item');
  if (!screenshotItem) throw new Error('screenshot menu item was never built');
  screenshotItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

async function expectPendingCount(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(pendingDataUrls()).toHaveLength(count);
  });
}

async function clearPending(): Promise<void> {
  dropFiles([imageFile(8, 'image/png', 'reset.png')]);
  await vi.waitFor(() => {
    expect(attachmentBar().querySelector('.sp-attachment-thumb')).not.toBeNull();
  });
  await vi.waitFor(async () => {
    let removeBtn = attachmentBar().querySelector<HTMLElement>('.sp-attachment-remove');
    while (removeBtn) {
      removeBtn.click();
      removeBtn = attachmentBar().querySelector<HTMLElement>('.sp-attachment-remove');
    }
    for (let settle = 0; settle < 2; settle += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(attachmentBar().querySelector('.sp-attachment-thumb')).toBeNull();
    }
  });
}

beforeEach(async () => {
  chromeMock.screenshotError = '';
  await clearPending();
  expect(pendingDataUrls()).toHaveLength(0);
  expect(noticeText()).toBe('');
});

describe('side panel composer attachment caps', () => {
  it('shows file-read progress while send is gated', async () => {
    pickFiles([imageFile(16, 'image/png', 'reading.png')]);

    expect(attachmentBar().textContent).toContain('spAttachmentAdding');
    await expectPendingCount(1);
    expect(noticeText()).toBe('');
  });

  it('shows an actionable screenshot capture failure', async () => {
    chromeMock.screenshotError = 'Capture unavailable';
    captureScreenshot('');

    await vi.waitFor(() => expect(noticeText()).toContain('Capture unavailable'));
    expect(pendingDataUrls()).toHaveLength(0);
  });

  it('stops dropped files at the transport count cap and says why', async () => {
    dropFiles(
      Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS + 3 }, (_, i) =>
        imageFile(16, 'image/png', `drop-${i}.png`),
      ),
    );

    await expectPendingCount(MANAGED_CHAT_MAX_ATTACHMENTS);
    expect(noticeText()).toContain(String(MANAGED_CHAT_MAX_ATTACHMENTS));
  });

  it('hands the send path a payload it accepts once the composer is full', async () => {
    dropFiles(
      Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS + 3 }, (_, i) =>
        imageFile(16, 'image/png', `drop-${i}.png`),
      ),
    );
    await expectPendingCount(MANAGED_CHAT_MAX_ATTACHMENTS);

    expect(() => createMultimodalUserContent('describe these', pendingDataUrls())).not.toThrow();
  });

  it('refuses a paste that would exceed the count cap', async () => {
    dropFiles(
      Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS }, (_, i) =>
        imageFile(16, 'image/png', `drop-${i}.png`),
      ),
    );
    await expectPendingCount(MANAGED_CHAT_MAX_ATTACHMENTS);

    pasteFiles([imageFile(16, 'image/png', 'pasted.png')]);

    await vi.waitFor(() => {
      expect(noticeText()).toContain(String(MANAGED_CHAT_MAX_ATTACHMENTS));
    });
    expect(pendingDataUrls()).toHaveLength(MANAGED_CHAT_MAX_ATTACHMENTS);
  });

  it('refuses a `+` menu pick that would exceed the count cap', async () => {
    dropFiles(
      Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS }, (_, i) =>
        imageFile(16, 'image/png', `drop-${i}.png`),
      ),
    );
    await expectPendingCount(MANAGED_CHAT_MAX_ATTACHMENTS);

    pickFiles([imageFile(16, 'image/png', 'picked.png')]);

    await vi.waitFor(() => {
      expect(noticeText()).toContain(String(MANAGED_CHAT_MAX_ATTACHMENTS));
    });
    expect(pendingDataUrls()).toHaveLength(MANAGED_CHAT_MAX_ATTACHMENTS);
  });

  it('accepts a file between the retired 10 MB literal and the canonical per-file cap', async () => {
    expect(MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES).toBeGreaterThan(10 * 1024 * 1024);

    dropFiles([imageFile(10 * 1024 * 1024 + 1, 'image/png', 'just-over-ten.png')]);

    await expectPendingCount(1);
    expect(noticeText()).toBe('');
  });

  it('still refuses a file above the canonical per-file cap', async () => {
    dropFiles([imageFile(MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES + 1, 'image/png', 'over-cap.png')]);

    await vi.waitFor(() => {
      expect(noticeText()).toContain('Each image must be under');
    });
    expect(pendingDataUrls()).toHaveLength(0);
  });

  it('rejects image types the transport cannot encode', async () => {
    dropFiles([imageFile(16, 'image/svg+xml', 'vector.svg')]);

    await vi.waitFor(() => {
      expect(noticeText()).toContain('PNG');
    });
    expect(pendingDataUrls()).toHaveLength(0);
  });

  it('keeps the `+` menu screenshot inside the request byte budget', async () => {
    const halfBudget = Math.floor(MANAGED_CHAT_MAX_ATTACHMENT_BYTES * 0.6);
    captureScreenshot(dataUrlOfBytes(halfBudget));
    await expectPendingCount(1);
    expect(noticeText()).toBe('');

    captureScreenshot(dataUrlOfBytes(halfBudget));

    expect(pendingDataUrls()).toHaveLength(1);
    expect(noticeText()).toContain('MB');
  });

  it('adds a Drawer capture to the composer instead of reporting a false success', async () => {
    chromeMock.screenshotDataUrl = dataUrlOfBytes(24);
    const drawerCapture = document.getElementById('sp-drawer-capture-btn');
    expect(drawerCapture).not.toBeNull();

    drawerCapture!.click();

    await expectPendingCount(1);
    expect(pendingDataUrls()[0]).toBe(chromeMock.screenshotDataUrl);
    expect(document.getElementById('sp-chat-panel')?.classList.contains('sp-tab-hidden')).toBe(
      false,
    );
    expect(document.getElementById('sp-input-area')?.style.display).toBe('');
  });
});
