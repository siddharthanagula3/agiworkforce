import { expect, test, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * The connector tool-permission panel is the one place a user chooses whether
 * a connector may act without asking, so its modal contract and its targets
 * matter. The QA account has no connected connectors, so nothing on this
 */
const CONNECTED = ['notion', 'github', 'slack'];
const STAMP = '2026-08-20T10:00:00.000Z';
const MIN_TARGET = 24;
const SETTINGS_CONNECTORS_PATH = '/settings/connections';
const PERMISSION_LABELS = ['Allow', 'Ask', 'Deny'] as const;
const DISCOVERED_TOOLS = ['search_pages', 'create_page'] as const;

async function stubConnectorRoutes(page: Page): Promise<void> {
  await page.route('**/api/connectors', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connectors: CONNECTED.map((connectorId, i) => ({
          id: `conn-${i}`,
          connectorId,
          toolConnectorId: connectorId,
          authType: 'oauth',
          connectedAt: STAMP,
          updatedAt: STAMP,
          source: 'user',
          health: 'connected',
        })),
        available: CONNECTED,
        setup: {},
      }),
    });
  });
  await page.route('**/api/connectors/custom*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connectors: [] }),
    });
  });
  await page.route('**/api/connectors/directory?*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        entries: [],
        total: 0,
        nextCursor: null,
        categories: [],
        stats: { totalRecords: 0, bootstrapComplete: true, lastSyncAt: STAMP },
      }),
    }),
  );
  await page.route('**/api/connectors/*/capabilities', async (route) => {
    const connectorId = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/').slice(-2)[0] ?? '',
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connectorId,
        connectorLabel: connectorId,
        source: 'oauth',
        generatedAt: Date.now(),
        protocolEra: 'modern',
        capabilityKeys: ['tools'],
        tasksSupported: false,
        tools: DISCOVERED_TOOLS.map((name) => ({ name, visibility: 'model', hasApp: false })),
        resources: [],
        resourceTemplates: [],
        prompts: [],
        apps: [],
        discoveryErrors: [],
      }),
    });
  });
  await page.route('**/api/connectors/permissions**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ permissions: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}

test.describe('connector tool permissions', () => {
  test.beforeEach(async ({ page }) => {
    await stubConnectorRoutes(page);
  });

  for (const [label, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ] as const) {
    test(`the panel honours the modal contract at ${label}`, async ({ page }) => {
      test.setTimeout(180_000);
      await signIn(page);
      await page.setViewportSize({ width, height });
      await page.goto(SETTINGS_CONNECTORS_PATH, { waitUntil: 'domcontentloaded' });

      const entry = page.getByRole('button', { name: 'Notion', exact: true }).first();
      await expect(
        entry,
        'the connectors section must list a connected connector before anything else can be asserted',
      ).toBeVisible({ timeout: 30_000 });
      await entry.click();

      const trigger = page.getByRole('button', { name: /Tool permissions/i }).first();
      await expect(trigger, 'a connected connector must offer tool permissions').toBeVisible({
        timeout: 15_000,
      });

      const opened = await page.locator('[role="dialog"]').count();
      await trigger.click();
      const panel = page.locator('[role="dialog"]').last();
      await expect(panel).toBeVisible({ timeout: 15_000 });

      for (const name of PERMISSION_LABELS) {
        await expect(
          panel.getByRole('button', { name }).first(),
          `the panel must offer ${name}`,
        ).toBeVisible();
      }
      const deny = panel.getByRole('button', { name: 'Deny' }).first();
      await deny.click();
      await expect(deny, 'the chosen verdict must be reflected back').toHaveAttribute(
        'aria-pressed',
        'true',
      );

      const contract = await panel.evaluate((root, min) => {
        const small: string[] = [];
        for (const el of root.querySelectorAll('button,[role="radio"],[role="tab"],a')) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 && r.height < 1) continue;
          if (r.width < min || r.height < min) {
            small.push(
              `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ` +
                `${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
        }
        const box = root.getBoundingClientRect();
        return {
          ariaModal: root.getAttribute('aria-modal'),
          labelled: Boolean(
            root.getAttribute('aria-label') ?? root.getAttribute('aria-labelledby'),
          ),
          overflows: box.right > window.innerWidth + 1 || box.bottom > window.innerHeight + 1,
          small,
        };
      }, MIN_TARGET);

      expect(contract.ariaModal, 'a modal panel must say so').toBe('true');
      expect(contract.labelled, 'a dialog needs an accessible name').toBe(true);
      expect(contract.overflows, `the panel must fit ${width}px`).toBe(false);
      expect(contract.small, 'every control needs a 24px target').toEqual([]);

      const permissionWrites: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/connectors/permissions')) {
          permissionWrites.push(request.method());
        }
      });
      await panel.getByRole('button', { name: /Reset all to default/ }).click();
      const confirmButton = page.getByRole('button', { name: 'Reset permissions' });
      await expect(confirmButton, 'resetting every verdict must ask first').toBeVisible({
        timeout: 10_000,
      });
      await confirmButton.click();
      await expect(confirmButton).toBeHidden({ timeout: 10_000 });
      await expect.poll(() => permissionWrites.includes('DELETE'), { timeout: 10_000 }).toBe(true);

      const beforeEscape = await page.locator('[role="dialog"]').count();
      await page.keyboard.press('Escape');
      await expect
        .poll(async () => page.locator('[role="dialog"]').count(), { timeout: 10_000 })
        .toBe(beforeEscape - 1);

      expect(
        await page.locator('[role="dialog"]').count(),
        'the settings modal underneath must stay open',
      ).toBe(opened);
      expect(
        await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
        'focus must return into the dialog underneath',
      ).toBe(true);
    });
  }
});
