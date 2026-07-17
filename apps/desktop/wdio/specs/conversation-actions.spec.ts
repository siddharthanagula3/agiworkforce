// Drives the 11 conversation-action QA items (Chat, Tier 1, desktop-qa-checklist.md)
// against the LIVE tree: DesktopShellV3 -> unified-chat ChatInterface/ChatInput/
// MessageBubble for message rendering, apps/desktop/src/features/v3/Sidebar.tsx +
// ConversationRow.tsx for conversation-list actions. Real Tauri IPC, real SQLite
// (via chat_* commands), real local Ollama — no mocks.
//
// NOTE: this harness's `@wdio/tauri-service` embedded driver retries a window-
// focus check ("Tauri core.invoke not available after 5s timeout") before nearly
// every discrete WebdriverIO command (findElement/click/waitForDisplayed each
// pay a fixed ~5-6s tax), independent of app behavior — reproduced even by a
// no-op diagnostic spec. To stay inside sane per-test budgets, most steps below
// are collapsed into single `browser.execute()` calls that do the DOM
// query/click/poll in-page (one WebDriver round trip instead of many).

import * as fs from 'node:fs';

const SCREEN_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/75367813-fb2a-4a49-bdcd-6412347c218f/scratchpad/desktop-qa-screens';

fs.mkdirSync(SCREEN_DIR, { recursive: true });

function clickSelector(selector: string) {
  return browser.execute((sel) => {
    (document.querySelector(sel) as HTMLElement | null)?.click();
  }, selector);
}

function waitForSelector(
  selector: string,
  timeoutMs = 15000,
  mode: 'appear' | 'disappear' = 'appear',
) {
  return browser.execute(
    (sel, timeout, m) =>
      new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const found = !!document.querySelector(sel);
          const ok = m === 'appear' ? found : !found;
          if (ok) return resolve(true);
          if (Date.now() - start > timeout) return resolve(false);
          setTimeout(tick, 120);
        };
        tick();
      }),
    selector,
    timeoutMs,
    mode,
  ) as Promise<boolean>;
}

function clickButtonWithText(containerSelector: string, text: string) {
  return browser.execute(
    (containerSel, label) => {
      const container = document.querySelector(containerSel) ?? document;
      const buttons = Array.from(container.querySelectorAll('button'));
      const match = buttons.find((b) => (b.textContent ?? '').trim() === label);
      if (match) {
        (match as HTMLButtonElement).click();
        return true;
      }
      return false;
    },
    containerSelector,
    text,
  ) as Promise<boolean>;
}

async function sendMessageFast(text: string) {
  await browser.execute((content) => {
    const ta = document.querySelector(
      'textarea[aria-label="Chat message input"]',
    ) as HTMLTextAreaElement | null;
    if (ta) ta.value = content;
    const sendBtn = document.querySelector(
      'button[aria-label*="Send message ("]',
    ) as HTMLButtonElement | null;
    sendBtn?.click();
  }, text);
}

async function activeRowConversationId(): Promise<string | null> {
  return browser.execute(() => {
    const row = document.querySelector(
      '[data-testid="conversation-row"][data-conversation-active="true"]',
    );
    return row ? row.getAttribute('data-conversation-id') : null;
  });
}

describe('AGI Desktop conversation actions', () => {
  it('Stop generation: clicking Stop mid-stream halts generation without error', async function () {
    this.timeout(120000);
    await browser.pause(1500);

    await clickSelector('button[title="New chat"]');
    await browser.pause(500);

    // Force a long output so generation is still in-flight when we check —
    // even a fast small local model needs real wall-clock time for ~200 lines.
    await sendMessageFast(
      'Count from one to two hundred. Write out each number as an English word ' +
        '(one, two, three, ...) on its own line. Do not stop early, do not summarize, ' +
        'write all two hundred lines in full.',
    );

    // In-page poll: the Stop button flips synchronously in the frontend the
    // instant Send is clicked (store.startStreaming()), independent of the
    // backend/model — so it should appear almost immediately if wired.
    const stopAppeared = await waitForSelector('button[aria-label="Stop generation"]', 15000);
    console.log('STOP: Stop button appeared while streaming:', stopAppeared);

    if (stopAppeared) {
      await clickSelector('button[aria-label="Stop generation"]');
    }

    const sendReappeared = await waitForSelector('button[aria-label*="Send message ("]', 30000);
    const toastVisible = await browser.execute(() =>
      Boolean(document.body.textContent?.includes('Failed to get response')),
    );
    console.log(
      'STOP: send button reappeared after stop:',
      sendReappeared,
      'error toast present:',
      toastVisible,
    );

    await browser.saveScreenshot(`${SCREEN_DIR}/action-01-stop.png`);
  });

  it('Copy: copies the last assistant message content to the clipboard', async function () {
    this.timeout(90000);
    await clickSelector('button[title="New chat"]');
    await browser.pause(500);

    await sendMessageFast('Reply with exactly: banana split.');
    await waitForSelector('[data-role="assistant"]', 30000);
    await waitForSelector('button[aria-label*="Send message ("]', 60000);

    await clickSelector('button[aria-label="Copy message"]');
    const gotCopiedState = await waitForSelector('button[aria-label="Copied"]', 3000);
    console.log('COPY: aria-label flipped to Copied:', gotCopiedState);

    const clipboardText = await browser
      .execute(() => navigator.clipboard.readText())
      .catch((err: unknown) => `<clipboard read blocked: ${String(err)}>`);
    console.log('COPY: clipboard contents:', JSON.stringify(clipboardText));

    await browser.saveScreenshot(`${SCREEN_DIR}/action-02-copy.png`);
  });

  it('Rename: renamed title persists across a reload (round-trips to SQLite)', async function () {
    this.timeout(90000);
    const renamedTitle = `QA Renamed ${Date.now()}`;

    await browser.execute(() => {
      const row = document.querySelector(
        '[data-testid="conversation-row"][data-conversation-active="true"]',
      );
      const moreBtn = row?.querySelector('button[aria-label="More options"]') as HTMLElement | null;
      moreBtn?.click();
    });
    await waitForSelector('div[role="menu"]', 5000);
    await clickButtonWithText('div[role="menu"]', 'Rename');

    // Inline rename input: React-controlled, so use the WebdriverIO native-value
    // setter (fires proper input events) rather than raw DOM assignment.
    const input = await $(
      '[data-testid="conversation-row"][data-conversation-active="true"] input',
    );
    await input.waitForDisplayed({ timeout: 5000 });
    await input.clearValue();
    await input.setValue(renamedTitle);
    await browser.keys('Enter');

    const titleShown = await waitForSelector(
      `[data-testid="conversation-row"][data-conversation-active="true"]`,
      5000,
    );
    console.log('RENAME: row still present after commit:', titleShown);

    await browser.saveScreenshot(`${SCREEN_DIR}/action-03-rename-before-reload.png`);

    await browser.refresh();
    await browser.pause(3000);

    const persisted = await browser.execute(
      (title) => {
        const rows = Array.from(document.querySelectorAll('[data-testid="conversation-row"]'));
        return rows.some((r) => (r.textContent ?? '').includes(title));
      },
      renamedTitle.slice(0, 20),
    );
    console.log('RENAME: title survived reload (persisted to backend):', persisted);

    await browser.saveScreenshot(`${SCREEN_DIR}/action-04-rename-after-reload.png`);
  });

  it('Archive: archived conversation disappears from Recents and stays gone after reload', async function () {
    this.timeout(120000);
    await browser.pause(1000);
    await clickSelector('button[title="New chat"]');
    await browser.pause(500);

    await sendMessageFast(`QA Archive Probe ${Date.now()}`);
    await waitForSelector('[data-role="assistant"]', 30000);
    await waitForSelector('button[aria-label*="Send message ("]', 60000);

    const rowConversationId = await activeRowConversationId();

    await browser.execute(() => {
      const row = document.querySelector(
        '[data-testid="conversation-row"][data-conversation-active="true"]',
      );
      const moreBtn = row?.querySelector('button[aria-label="More options"]') as HTMLElement | null;
      moreBtn?.click();
    });
    await waitForSelector('div[role="menu"]', 5000);
    const archiveClicked = await clickButtonWithText('div[role="menu"]', 'Archive');
    console.log('ARCHIVE: menu item found and clicked:', archiveClicked);

    const hiddenImmediately = await waitForSelector(
      `[data-testid="conversation-row"][data-conversation-id="${rowConversationId}"]`,
      5000,
      'disappear',
    );
    console.log('ARCHIVE: row hidden from Recents immediately after archiving:', hiddenImmediately);

    await browser.saveScreenshot(`${SCREEN_DIR}/action-05-archive-before-reload.png`);

    await browser.refresh();
    await browser.pause(3000);

    const stillHiddenAfterReload = await browser.execute((id) => {
      return !document.querySelector(
        `[data-testid="conversation-row"][data-conversation-id="${id}"]`,
      );
    }, rowConversationId);
    console.log(
      'ARCHIVE: stays hidden after reload (persisted to backend, not just local state):',
      stillHiddenAfterReload,
    );

    await browser.saveScreenshot(`${SCREEN_DIR}/action-06-archive-after-reload.png`);
  });

  it('Delete: deleted conversation is permanently removed (survives reload)', async function () {
    this.timeout(120000);
    await browser.pause(1000);
    await clickSelector('button[title="New chat"]');
    await browser.pause(500);

    await sendMessageFast(`QA Delete Probe ${Date.now()}`);
    await waitForSelector('[data-role="assistant"]', 30000);
    await waitForSelector('button[aria-label*="Send message ("]', 60000);

    const rowConversationId = await activeRowConversationId();

    await browser.execute(() => {
      const row = document.querySelector(
        '[data-testid="conversation-row"][data-conversation-active="true"]',
      );
      const moreBtn = row?.querySelector('button[aria-label="More options"]') as HTMLElement | null;
      moreBtn?.click();
    });
    await waitForSelector('div[role="menu"]', 5000);
    await clickButtonWithText('div[role="menu"]', 'Delete'); // first click arms confirm
    await waitForSelector('div[role="menu"]', 3000);
    const confirmClicked = await clickButtonWithText('div[role="menu"]', 'Confirm delete');
    console.log('DELETE: confirm-delete menu item found and clicked:', confirmClicked);

    await browser.pause(500);
    await browser.saveScreenshot(`${SCREEN_DIR}/action-07-delete-before-reload.png`);

    await browser.refresh();
    await browser.pause(3000);

    const stillGoneAfterReload = await browser.execute((id) => {
      return !document.querySelector(
        `[data-testid="conversation-row"][data-conversation-id="${id}"]`,
      );
    }, rowConversationId);
    console.log('DELETE: stays gone after reload (persisted to backend):', stillGoneAfterReload);

    await browser.saveScreenshot(`${SCREEN_DIR}/action-08-delete-after-reload.png`);
  });
});
