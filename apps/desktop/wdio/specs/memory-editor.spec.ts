// Memory settings QA (checklist row #14) — drives the real Settings > Memory
// tab via WDIO: add a fact, verify it persists after closing/reopening
// Settings (real backend round-trip, not just in-memory React state), edit
// it, delete it, and confirm the empty state returns.

const FACT_TEXT = `QA memory fact ${Date.now()}`;
const FACT_EDITED = `${FACT_TEXT} (edited)`;

describe('AGI Desktop Settings — Memory tab (real add/edit/delete + persistence)', () => {
  it('adds, persists across reopen, edits, and deletes a memory fact', async function () {
    this.timeout(60000);

    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15000 });
    await gear.click();

    const nav = await $('nav[aria-label="Settings sections"]');
    await nav.waitForDisplayed({ timeout: 10000 });

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
    await browser.pause(500);

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
    await browser.waitUntil(
      async () => !(await $('nav[aria-label="Settings sections"]').isExisting()),
      { timeout: 10000, timeoutMsg: 'Settings dialog did not close after Escape' },
    );
    await browser.pause(500);

    const gearReopen = await $('button[aria-label="Settings"]');
    await gearReopen.waitForClickable({ timeout: 10000 });
    await gearReopen.click();
    await $('nav[aria-label="Settings sections"]').waitForDisplayed({ timeout: 15000 });
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
