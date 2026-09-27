import { type BrowserWindow, clipboard, ClipboardItem } from 'electron';
import type { BrowserChatHandoff } from './browser/bridgeServer';
import { focusPageComposer } from './composerFocus';
import { takeCaptureBackFromClipboard } from './screenshot';

const COMPOSER_SETTLE_MS = 250;
const CLIPBOARD_RESTORE_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectionDraft(text: string, url: string): string {
  const quoted = text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
  return `${quoted}\n\nSource: ${url}\n\n`;
}

async function pasteImage(win: BrowserWindow, png: Buffer): Promise<void> {
  const priorText = clipboard.readText();
  await clipboard.write([
    new ClipboardItem({
      'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }),
    }),
  ]);
  try {
    win.webContents.paste();
    await delay(CLIPBOARD_RESTORE_MS);
  } finally {
    takeCaptureBackFromClipboard(priorText);
  }
}

export async function deliverBrowserHandoff(
  win: BrowserWindow | null,
  handoff: BrowserChatHandoff,
): Promise<void> {
  if (!win || win.isDestroyed()) {
    throw new Error('AGI Cloud has no window open. Open it, then try again.');
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.focus();
  await delay(COMPOSER_SETTLE_MS);
  if (win.isDestroyed() || !(await focusPageComposer(win))) {
    throw new Error('No chat is open in AGI Cloud. Open a chat there, then try again.');
  }
  if (handoff.kind === 'selection') {
    await win.webContents.insertText(selectionDraft(handoff.text, handoff.url));
    return;
  }
  await pasteImage(win, handoff.png);
}
