import { expect, test } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

interface ComposerGeometry {
  cardHeight: number;
  rowHeight: number;
  rowClientWidth: number;
  rowScrollWidth: number;
  bottoms: number[];
  backdropFilter: string;
}

test('an existing chat keeps the resting composer on one line', async ({ page }) => {
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const conversationHref = await page
    .locator('a[href^="/chat/"]')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute('href'))
        .find((href) => href && /^\/chat\/[0-9a-f-]{36}$/.test(href)),
    );
  expect(conversationHref, 'the QA account needs at least one existing conversation').toBeTruthy();

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(conversationHref!, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const composer = page.locator('#chat-composer');
    await expect(composer).toBeVisible();

    const geometry: ComposerGeometry = await composer.evaluate((card) => {
      const row = card.querySelector<HTMLElement>('.chat-composer-row');
      const field = card.querySelector<HTMLElement>('.chat-composer-field');
      const leading = card.querySelector<HTMLElement>('.chat-composer-leading-end');
      const trailing = [...card.querySelectorAll<HTMLElement>('button')]
        .filter((button) => button.getBoundingClientRect().width > 0)
        .at(-1);
      if (!row || !field || !leading || !trailing) {
        throw new Error('composer controls did not render');
      }

      return {
        cardHeight: card.getBoundingClientRect().height,
        rowHeight: row.getBoundingClientRect().height,
        rowClientWidth: row.clientWidth,
        rowScrollWidth: row.scrollWidth,
        bottoms: [leading, field, trailing].map((node) => node.getBoundingClientRect().bottom),
        backdropFilter: getComputedStyle(card).backdropFilter,
      };
    });

    expect(
      geometry.cardHeight,
      `${viewport.name} composer should stay within the 48–52px parity band`,
    ).toBeGreaterThanOrEqual(48);
    expect(geometry.cardHeight).toBeLessThanOrEqual(52);
    expect(geometry.rowHeight).toBeLessThanOrEqual(38);
    expect(geometry.rowScrollWidth).toBeLessThanOrEqual(geometry.rowClientWidth + 1);
    expect(Math.max(...geometry.bottoms) - Math.min(...geometry.bottoms)).toBeLessThanOrEqual(1);
    expect(geometry.backdropFilter).toBe('none');
  }
});

test('composer options expose labelled groups without nested menus', async ({ page }) => {
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: /^Add attachments and tools/ }).click();
  const dialog = page.getByRole('dialog', { name: 'More composer options' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Skills', exact: true }).click();
  await dialog.getByRole('button', { name: 'Connectors', exact: true }).click();
  await dialog.getByRole('button', { name: 'Plugins', exact: true }).click();

  await expect(dialog.getByRole('group', { name: 'Skills' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Connectors' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Plugins' })).toBeVisible();
  await expect(dialog.locator('[role="menu"]')).toHaveCount(0);
});
