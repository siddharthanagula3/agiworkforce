describe('tab trap scope check', () => {
  it('checks if Tab moves focus from a non-composer button', async () => {
    await browser.pause(1000);
    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15000 });
    await browser.execute(() => {
      const el = document.querySelector('button[aria-label="Settings"]') as HTMLElement | null;
      el?.focus();
    });
    const before = await browser.execute(() => ({
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute('aria-label'),
    }));
    console.log('BEFORE_TAB_FROM_GEAR', JSON.stringify(before));

    await browser.keys('Tab');
    const after = await browser.execute(() => ({
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute('aria-label'),
    }));
    console.log('AFTER_TAB_FROM_GEAR', JSON.stringify(after));

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.click();
    await browser.keys(['Shift', 'Tab']);
    const afterShiftTab = await browser.execute(() => ({
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute('aria-label'),
    }));
    console.log('AFTER_SHIFT_TAB_FROM_COMPOSER', JSON.stringify(afterShiftTab));
  });
});
