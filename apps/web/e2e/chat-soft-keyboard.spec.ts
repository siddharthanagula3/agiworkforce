import { expect, test } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
const KEYBOARD_INSET = 336;

test.use({ viewport: PHONE_VIEWPORT });

test('an overlaying mobile keyboard keeps the transcript tail above the composer', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class TestVisualViewport extends EventTarget {
      height = 844;
      width = 390;
      offsetTop = 0;
      offsetLeft = 0;
      pageTop = 0;
      pageLeft = 0;
      scale = 1;

      cover(inset: number) {
        this.height = 844 - inset;
        this.dispatchEvent(new Event('resize'));
      }
    }

    const viewport = new TestVisualViewport();
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    Object.defineProperty(window, '__setTestKeyboardInset', {
      value: (inset: number) => viewport.cover(inset),
      configurable: true,
    });
  });

  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const conversationHref = await page
    .locator('a[href^="/chat/"]')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute('href'))
        .find((href) => href && /^\/chat\/[0-9a-f-]{36}$/.test(href)),
    );
  expect(conversationHref).toBeTruthy();

  await page.goto(conversationHref!, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('log', { name: 'Chat messages' })).toBeVisible();
  await page.evaluate((inset) => {
    const setInset = (window as Window & { __setTestKeyboardInset?: (value: number) => void })
      .__setTestKeyboardInset;
    if (!setInset) throw new Error('test visual viewport was not installed');
    setInset(inset);
  }, KEYBOARD_INSET);

  const transcript = page.getByTestId('chat-message-list');
  await expect(transcript).toHaveAttribute('data-soft-keyboard-inset', String(KEYBOARD_INSET));
  await expect(page.getByRole('log', { name: 'Chat messages' })).toHaveCSS(
    'height',
    /[1-9][0-9]*px/,
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const log = document.querySelector<HTMLElement>('[role="log"]');
        const composer = document.querySelector<HTMLElement>('.chat-composer-container');
        if (!log || !composer) return null;
        const logBox = log.getBoundingClientRect();
        const composerBox = composer.getBoundingClientRect();
        return {
          gap: Math.round(composerBox.top - logBox.bottom),
          remaining: Math.round(log.scrollHeight - log.scrollTop - log.clientHeight),
        };
      }),
    )
    .toEqual({ gap: 0, remaining: 0 });
});
