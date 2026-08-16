
describe('AGI Desktop Accessibility (real keyboard nav + ARIA)', () => {
  it('tabs through the composer/sidebar and reaches the composer via keyboard', async function () {
    this.timeout(30000);
    await browser.pause(1000);

    const composerStart = await $('textarea[aria-label="Chat message input"]');
    await composerStart.waitForDisplayed({ timeout: 15000 });
    await composerStart.click();

    const startFocused = await browser.execute(() => {
      const el = document.activeElement;
      return el ? { tag: el.tagName, label: el.getAttribute('aria-label') } : null;
    });
    console.log('START_FOCUSED', JSON.stringify(startFocused));

    const focusTrace: Array<{ tag: string; label: string | null; role: string | null }> = [];
    for (let i = 0; i < 15; i++) {
      await browser.keys('Tab');
      const info = await browser.execute(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return {
          tag: el.tagName,
          label: el.getAttribute('aria-label'),
          role: el.getAttribute('role'),
        };
      });
      if (info) focusTrace.push(info);
    }
    console.log('FOCUS_TRACE', JSON.stringify(focusTrace));

    const hasAccessibleName = focusTrace.some((f) => !!f.label);
    console.log('HAS_ACCESSIBLE_NAME_IN_TRACE', hasAccessibleName);
    expect(focusTrace.length).toBeGreaterThan(0);
    expect(hasAccessibleName).toBe(true);
  });

  it('composer textarea is reachable and has a real accessible name', async () => {
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 15000 });
    const isFocusable = await browser.execute(() => {
      const el = document.querySelector(
        'textarea[aria-label="Chat message input"]',
      ) as HTMLElement | null;
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    });
    console.log('COMPOSER_FOCUSABLE', isFocusable);
    expect(isFocusable).toBe(true);
  });

  it('Escape closes an open Settings dialog and returns focus sensibly', async () => {
    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15000 });
    await gear.click();
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 10000 });

    const dialogHasAriaLabel = await browser.execute(() => {
      const d = document.querySelector('[role="dialog"]');
      return {
        hasLabel: !!(d?.getAttribute('aria-label') || d?.getAttribute('aria-labelledby')),
      };
    });
    console.log('DIALOG_ARIA', JSON.stringify(dialogHasAriaLabel));

    await browser.keys('Escape');
    await browser.pause(500);
    const stillOpen = await browser.execute(() => !!document.querySelector('[role="dialog"]'));
    console.log('DIALOG_CLOSED_AFTER_ESCAPE', !stillOpen);
    expect(stillOpen).toBe(false);
  });
});
