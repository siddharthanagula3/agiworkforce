// Memory settings QA (checklist row #14) — drives the real Settings > Memory
// tab via WDIO: add a fact, verify it persists after closing/reopening
// Settings (real backend round-trip, not just in-memory React state), edit
// it, delete it, and confirm the empty state returns.

const FACT_TEXT = `QA memory fact ${Date.now()}`;
const FACT_EDITED = `${FACT_TEXT} (edited)`;

import { waitForSettingsReady } from '../support/close-settings';
import { waitForDesktopShell } from '../support/desktop-shell';

describe('AGI Desktop Settings — Memory tab (real add/edit/delete + persistence)', () => {
  it('adds, persists across reopen, edits, and deletes a memory fact', async function () {
    this.timeout(60000);

    // A fresh profile boots into onboarding (no Settings gear); enter Local
    // mode first so this passes standalone as well as in-suite.
    await waitForDesktopShell();
    const useLocal = await $('button=Use Local Mode');
    if ((await useLocal.isExisting()) && (await useLocal.isDisplayed())) {
      await useLocal.click();
      await waitForDesktopShell();
    }

    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15000 });
    await gear.click();

    // The nav is disabled while Settings loads; clicking a tab before then is
    // a silent no-op.
    await waitForSettingsReady();

    const clickNavItem = (label: string) =>
      browser.execute(
        (navSel, text) => {
          const container = document.querySelector(navSel) ?? document;
          const buttons = Array.from(container.querySelectorAll('button'));
          const match = buttons.find((b) => (b.textContent ?? '').trim().startsWith(text));
          if (match) {
            (match as HTMLButtonElement).click();
            return true;
          }
          return false;
        },
        'nav[aria-label="Settings sections"]',
        label,
      );

    const clickedMemory = await clickNavItem('Memory');
    console.log('CLICKED_MEMORY_NAV', clickedMemory);
    await browser.pause(500);

    const textarea = await $('textarea[placeholder*="prefer Python"]');
    await textarea.waitForDisplayed({ timeout: 10000 });
    await textarea.click();
    await textarea.addValue(FACT_TEXT);

    const addBtn = await $('button=Add');
    await addBtn.waitForClickable({ timeout: 5000 });
    await addBtn.click();

    // The add is a real backend round-trip (store write → loadAll refresh), so
    // wait for the newly added fact to appear in the memory list rather than a
    // fixed pause that races the IPC. Match the fact TEXT specifically — a
    // generic `[role="alert"]` check would falsely satisfy on an unrelated
    // alert leaked from a prior spec (e.g. an MCP connection warning), racing
    // ahead of the list render. If the add itself errors, the tab renders its
    // own inline error containing the fact and this still resolves; the
    // assertions below then fail loudly with the list contents.
    await browser.waitUntil(
      async () =>
        browser.execute(
          (needle) =>
            (document.querySelector('ul[aria-label="Memory facts"]')?.textContent ?? '').includes(
              needle,
            ),
          FACT_TEXT,
        ),
      {
        timeout: 15_000,
        interval: 300,
        timeoutMsg: 'The added memory fact never appeared in the memory list',
      },
    );

    const factsAfterAdd = await browser.execute(() => {
      const list = document.querySelector('ul[aria-label="Memory facts"]');
      return list ? list.textContent || '' : null;
    });
    console.log('FACTS_AFTER_ADD', factsAfterAdd);
    expect(factsAfterAdd).not.toBeNull();
    expect(factsAfterAdd).toContain(FACT_TEXT);

    // Close and reopen Settings to verify the fact persisted via the real
    // backend (not just component-local React state).
    await browser.keys('Escape');
    // Wait for the whole dialog (not just the nav) to unmount — the Radix
    // overlay lingers through its exit animation and keeps the Settings gear
    // pointer-blocked ("not clickable") until it is gone.
    await browser.waitUntil(
      async () =>
        browser.execute(
          () =>
            !document.querySelector('nav[aria-label="Settings sections"]') &&
            !document.querySelector('[role="dialog"]'),
        ),
      { timeout: 10000, timeoutMsg: 'Settings dialog did not fully close after Escape' },
    );

    const gearReopen = await $('button[aria-label="Settings"]');
    await gearReopen.waitForExist({ timeout: 10000 });
    // Click via the DOM: WebDriver's clickability check can reject the gear
    // while a just-dismissed overlay is still fading, even though the button
    // is fully functional.
    await browser.execute(() =>
      (
        document.querySelector('button[aria-label="Settings"]') as HTMLButtonElement | null
      )?.click(),
    );
    await waitForSettingsReady();
    await clickNavItem('Memory');
    await browser.pause(500);

    const factsAfterReopen = await browser.execute(() => {
      const list = document.querySelector('ul[aria-label="Memory facts"]');
      return list ? list.textContent || '' : null;
    });
    console.log('FACTS_AFTER_REOPEN', factsAfterReopen);
    expect(factsAfterReopen).toContain(FACT_TEXT);

    // Edit the fact.
    const editBtn = await $(`button[aria-label="Edit memory: ${FACT_TEXT}"]`);
    await editBtn.waitForDisplayed({ timeout: 5000 });
    await editBtn.click();
    await browser.pause(300);

    const editTextarea = await $('ul[aria-label="Memory facts"] textarea');
    await editTextarea.waitForDisplayed({ timeout: 5000 });
    await editTextarea.addValue(' (edited)');

    const saveBtn = await $('button=Save');
    await saveBtn.waitForClickable({ timeout: 5000 });
    await saveBtn.click();
    await browser.pause(500);

    const factsAfterEdit = await browser.execute(() => {
      const list = document.querySelector('ul[aria-label="Memory facts"]');
      return list ? list.textContent || '' : null;
    });
    console.log('FACTS_AFTER_EDIT', factsAfterEdit);
    expect(factsAfterEdit).toContain(FACT_EDITED);

    // Delete the fact.
    const deleteBtn = await $('button[aria-label="Delete memory fact"]');
    await deleteBtn.waitForDisplayed({ timeout: 5000 });
    await deleteBtn.click();
    await browser.pause(500);

    const factsAfterDelete = await browser.execute(() => {
      const list = document.querySelector('ul[aria-label="Memory facts"]');
      return list ? list.textContent || '' : null;
    });
    console.log('FACTS_AFTER_DELETE', factsAfterDelete);
    expect(factsAfterDelete === null || !factsAfterDelete.includes(FACT_EDITED)).toBe(true);
  });
});
