import { expect, test, type Locator, type Page } from '@playwright/test';
import { routeIsServed } from './route-availability';

const PROBE_ROUTE = '/dev/rich-blocks-probe';
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const TRANSCRIPT = '[role="log"][aria-label="Chat messages"]';
const WRITING_CARD = '[data-rich-block="writing"]';
const EMAIL_CARD = '[data-rich-block="email"]';
const CARD_HEADER = '[data-rich-block-header]';
const PIXEL_TOLERANCE = 1;
const SCROLL_INTO_CARD_PX = 240;
const SCROLL_SETTLE_MS = 150;
const COPIED_LABEL = 'Text copied';

interface Box {
  top: number;
  bottom: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
}

async function scrollTranscriptTo(page: Page, top: number): Promise<void> {
  await page.locator(TRANSCRIPT).evaluate((element, value) => {
    element.scrollTop = value;
  }, top);
  await page.waitForTimeout(SCROLL_SETTLE_MS);
}

async function openProbe(page: Page): Promise<boolean> {
  const response = await page.goto(PROBE_ROUTE);
  if (!(await routeIsServed(page, response))) return false;
  await expect(page.locator(WRITING_CARD)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return true;
}

for (const viewport of VIEWPORTS) {
  test.describe(`rich blocks at ${viewport.width}px`, () => {
    test.use({ viewport, reducedMotion: 'reduce' } as never);

    test('the writing header stays pinned while its block scrolls, then leaves with it', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      // llm-guardrail-allow: the dev probe answers 404 on a production build, so this is not a skipped check
      test.skip(!(await openProbe(page)), `${PROBE_ROUTE} is not served by this build`);

      const transcript = page.locator(TRANSCRIPT);
      const card = page.locator(WRITING_CARD);
      const header = card.locator(CARD_HEADER);
      const scroller = await boxOf(transcript);
      const scrollTop = await transcript.evaluate((element) => element.scrollTop);
      const cardStart = (await boxOf(card)).top - scroller.top + scrollTop;

      await scrollTranscriptTo(page, cardStart + SCROLL_INTO_CARD_PX);
      const scrolledCard = await boxOf(card);
      const pinned = await boxOf(header);
      expect(scrolledCard.top).toBeLessThan(scroller.top - SCROLL_INTO_CARD_PX / 2);
      expect(scrolledCard.bottom).toBeGreaterThan(scroller.bottom);
      expect(Math.abs(pinned.top - scroller.top)).toBeLessThanOrEqual(PIXEL_TOLERANCE);

      const topElement = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-rich-block-header]') !== null,
        { x: viewport.width / 2, y: pinned.top + (pinned.bottom - pinned.top) / 2 },
      );
      expect(topElement).toBe(true);

      await header.getByRole('button', { name: 'Copy this text' }).click();
      await expect(header.getByRole('button', { name: COPIED_LABEL })).toBeVisible();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied.startsWith('## AGI Workforce is live')).toBe(true);
      expect(copied).toContain('Paragraph 18 of the launch announcement.');
      expect(copied).not.toContain('Here is the announcement');
      expect(copied).not.toContain('Subject: We launched today');

      const cardEnd = cardStart + (scrolledCard.bottom - scrolledCard.top);
      await scrollTranscriptTo(page, cardEnd + PIXEL_TOLERANCE);
      const departed = await boxOf(header);
      expect(departed.bottom).toBeLessThanOrEqual(scroller.top + PIXEL_TOLERANCE);
    });

    test('expand opens the writing block in a larger editor', async ({ page }) => {
      // llm-guardrail-allow: the dev probe answers 404 on a production build, so this is not a skipped check
      test.skip(!(await openProbe(page)), `${PROBE_ROUTE} is not served by this build`);

      await page
        .locator(WRITING_CARD)
        .getByRole('button', { name: 'Open larger to read and edit' })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const editor = dialog.getByLabel('Edit text');
      await expect(editor).toHaveValue(/^## AGI Workforce is live/);
      const dialogBox = await boxOf(dialog);
      expect(dialogBox.bottom - dialogBox.top).toBeGreaterThan(viewport.height / 2);
      await dialog.getByRole('button', { name: 'Close expanded text' }).click();
      await expect(dialog).toBeHidden();
    });

    test('the email card is editable, opens the mail app and offers no Send', async ({ page }) => {
      // llm-guardrail-allow: the dev probe answers 404 on a production build, so this is not a skipped check
      test.skip(!(await openProbe(page)), `${PROBE_ROUTE} is not served by this build`);

      const card = page.locator(EMAIL_CARD);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByLabel('To')).toHaveValue('team@example.com');
      await expect(card.getByLabel('Cc')).toHaveValue('press@example.com');
      await expect(card.getByLabel('Subject')).toHaveValue('We launched today');
      await expect(card.getByRole('button', { name: /send/i })).toHaveCount(0);

      await card.getByLabel('Subject').fill('We shipped today');
      await expect(card.getByRole('link', { name: 'Open in mail app' })).toHaveAttribute(
        'href',
        /^mailto:team%40example\.com\?cc=press%40example\.com&subject=We%20shipped%20today&body=Hi%20team%2C%0D%0A/,
      );

      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(sideways).toBeLessThanOrEqual(0);
    });
  });
}
