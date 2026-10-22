import { expect, test, type Locator, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const INCIDENT_MESSAGE =
  'AGI is having a problem right now, and some requests may fail. We are working on it.';

const INCIDENT_FEED = {
  notices: [
    {
      id: 'incident:product',
      kind: 'incident',
      tone: 'danger',
      scope: 'product',
      message: INCIDENT_MESSAGE,
      href: '/status',
      linkLabel: 'Status',
    },
  ],
};

const WAITLIST_STATUS = {
  joinedPlans: [],
  upgradeGateEnabled: true,
  accessGranted: false,
  noticeEmail: null,
};

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const NARROW_SHELL_MAX_WIDTH = 768;
const UPGRADE_DIALOG = 'Upgrade your plan';
const WAITLIST_DIALOG = /Basic (upgrade )?waitlist/;

const THEMES = ['light', 'dark'] as const;
const THEME_STORAGE_KEY = 'theme';
const SETTLE_MS = 1_200;

interface MenuCase {
  name: string;
  route: string;
  trigger: (page: Page) => Locator;
  panel: string;
  item: string;
  typed?: string;
}

const MENUS: readonly MenuCase[] = [
  {
    name: 'composer slash commands',
    route: '/chat',
    trigger: (page) => page.getByRole('textbox', { name: /message input/i }).first(),
    panel: '[role="listbox"][aria-label="Slash command suggestions"]',
    item: '[role="option"]',
    typed: '/',
  },
  {
    name: 'library new menu',
    route: '/chat/library',
    trigger: (page) => page.getByRole('button', { name: 'New', exact: true }).first(),
    panel: '[role="menu"]',
    item: '[role="menuitem"]',
  },
  {
    name: 'library sort menu',
    route: '/chat/library',
    trigger: (page) => page.getByRole('button', { name: /^Sort by / }).first(),
    panel: '[role="menu"][aria-label="Sort the library"]',
    item: '[role="menuitemradio"], [role="menuitem"]',
  },
  {
    name: 'library row menu',
    route: '/chat/library',
    trigger: (page) => page.getByRole('button', { name: /^Actions for / }).first(),
    panel: '[role="menu"]',
    item: '[role="menuitem"]',
  },
  {
    name: 'project card menu',
    route: '/chat/projects',
    trigger: (page) => page.getByRole('button', { name: 'Project options' }).first(),
    panel: '[role="menu"]',
    item: '[role="menuitem"]',
  },
  {
    name: 'schedule card menu',
    route: '/chat/schedules',
    trigger: (page) => page.getByRole('button', { name: /^More actions for / }).first(),
    panel: '[role="menu"]',
    item: '[role="menuitem"]',
  },
];

interface Measurement {
  found: boolean;
  covered: boolean;
  covering: string | null;
  overlapsBand: boolean;
}

async function measureFirstItem(page: Page, menu: MenuCase): Promise<Measurement> {
  return page.evaluate(
    ({ panelSelector, itemSelector, incident }) => {
      const panel = Array.from(document.querySelectorAll<HTMLElement>(panelSelector)).find(
        (candidate) => candidate.getBoundingClientRect().height > 0,
      );
      const item = panel?.querySelector<HTMLElement>(itemSelector);
      if (!item) return { found: false, covered: false, covering: null, overlapsBand: false };
      const rect = item.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const notice = Array.from(document.querySelectorAll<HTMLElement>('[role="alert"]')).find(
        (candidate) => candidate.textContent?.includes(incident),
      );
      const band = notice?.getBoundingClientRect();
      const overlapsBand = Boolean(
        band &&
        band.bottom > rect.top &&
        band.top < rect.bottom &&
        band.right > rect.left &&
        band.left < rect.right,
      );
      return {
        found: true,
        covered: !top || !item.contains(top),
        covering: top ? `${top.tagName}.${String(top.className).slice(0, 90)}` : null,
        overlapsBand,
      };
    },
    { panelSelector: menu.panel, itemSelector: menu.item, incident: INCIDENT_MESSAGE },
  );
}

interface DialogMeasurement {
  found: boolean;
  outside: string[];
  overlapsBand: number;
}

async function measureDialogControls(dialog: Locator): Promise<DialogMeasurement> {
  return dialog.evaluate((element, incident) => {
    const controls = Array.from(
      element.querySelectorAll<HTMLElement>('button, a[href], input, [role="button"]'),
    ).filter((control) => {
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const close = controls.find((control) =>
      /^Close/.test(control.getAttribute('aria-label') ?? ''),
    );
    const measured = [...new Set([controls[0], close].filter(Boolean) as HTMLElement[])];
    if (measured.length === 0) return { found: false, outside: [], overlapsBand: 0 };
    const band = Array.from(document.querySelectorAll<HTMLElement>('[role="alert"]'))
      .find((candidate) => candidate.textContent?.includes(incident))
      ?.getBoundingClientRect();
    const outside: string[] = [];
    let overlapsBand = 0;
    for (const control of measured) {
      const rect = control.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!top || !element.contains(top)) {
        outside.push(
          `${control.getAttribute('aria-label') ?? control.textContent?.trim()} <- ${
            top ? `${top.tagName}.${String(top.className).slice(0, 90)}` : 'nothing'
          }`,
        );
      }
      if (
        band &&
        band.bottom > rect.top &&
        band.top < rect.bottom &&
        band.right > rect.left &&
        band.left < rect.right
      ) {
        overlapsBand += 1;
      }
    }
    return { found: true, outside, overlapsBand };
  }, INCIDENT_MESSAGE);
}

async function openUpgradeDialog(page: Page, width: number): Promise<void> {
  if (width <= NARROW_SHELL_MAX_WIDTH) {
    await page
      .getByRole('button', { name: /Open navigation|Toggle sidebar/ })
      .first()
      .click();
  }
  await page
    .getByRole('button', { name: /^Account menu for/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Upgrade', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: UPGRADE_DIALOG }),
    'the upgrade dialog did not open; the QA account must be on Free for the account menu to offer Upgrade',
  ).toBeVisible();
  await page.waitForTimeout(SETTLE_MS / 2);
}

async function openMenu(page: Page, menu: MenuCase): Promise<void> {
  const trigger = menu.trigger(page);
  await expect(
    trigger,
    `${menu.name}: the trigger is missing, so the account fixture this spec needs is gone`,
  ).toBeVisible({ timeout: 20_000 });
  await trigger.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  if (menu.typed) {
    await trigger.click();
    await page.keyboard.type(menu.typed);
  } else {
    await trigger.click();
  }
  await page.waitForTimeout(SETTLE_MS / 2);
}

test.describe('in-page menus stay above the product notice band', () => {
  test.setTimeout(20 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  test('the first item of every in-page menu is the element under the pointer', async ({
    page,
  }) => {
    await page.route('**/api/status/notices', (route) => route.fulfill({ json: INCIDENT_FEED }));
    await signIn(page);

    const covered: string[] = [];
    const unmeasured: string[] = [];
    let overlapping = 0;

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const theme of THEMES) {
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript(
          (input: { key: string; theme: string }) => {
            try {
              window.localStorage.setItem(input.key, input.theme);
            } catch {
              return;
            }
          },
          { key: THEME_STORAGE_KEY, theme },
        );
        for (const menu of MENUS) {
          const label = `${menu.name} at ${viewport.width}px, ${theme}`;
          await page.goto(menu.route, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
          await expect(
            page.getByRole('alert').filter({ hasText: INCIDENT_MESSAGE }),
            `${label}: the stubbed incident never reached the notice band`,
          ).toBeVisible({ timeout: 20_000 });
          await openMenu(page, menu);

          const measured = await measureFirstItem(page, menu);
          if (!measured.found) {
            unmeasured.push(label);
            continue;
          }
          if (measured.overlapsBand) overlapping += 1;
          if (measured.covered) covered.push(`${label} <- ${measured.covering}`);
          await page.keyboard.press('Escape');
        }
      }
    }

    expect(unmeasured, `these menus did not open:\n${unmeasured.join('\n')}`).toEqual([]);
    expect(covered, `the notice band covers these menu items:\n${covered.join('\n')}`).toEqual([]);
    expect(
      overlapping,
      'no menu opened under the notice band, so this run proved nothing about the stacking',
    ).toBeGreaterThan(0);
  });
});

test.describe('dialogs stay above the product notice band', () => {
  test.setTimeout(10 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  test('the first control and the close control of the upgrade and waitlist dialogs are the elements under the pointer', async ({
    page,
  }) => {
    await page.route('**/api/status/notices', (route) => route.fulfill({ json: INCIDENT_FEED }));
    await page.route('**/api/waitlist', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: WAITLIST_STATUS })
        : route.fulfill({ json: { ok: true } }),
    );
    await signIn(page);

    const outside: string[] = [];
    const unmeasured: string[] = [];
    let overlapping = 0;

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const theme of THEMES) {
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript(
          (input: { key: string; theme: string }) => {
            try {
              window.localStorage.setItem(input.key, input.theme);
            } catch {
              return;
            }
          },
          { key: THEME_STORAGE_KEY, theme },
        );
        const label = `${viewport.width}px, ${theme}`;
        await page.goto('/chat', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
        await expect(
          page.getByRole('alert').filter({ hasText: INCIDENT_MESSAGE }),
          `${label}: the stubbed incident never reached the notice band`,
        ).toBeVisible({ timeout: 20_000 });

        await openUpgradeDialog(page, viewport.width);
        const upgrade = await measureDialogControls(
          page.getByRole('dialog', { name: UPGRADE_DIALOG }),
        );
        if (!upgrade.found) unmeasured.push(`upgrade dialog at ${label}`);
        outside.push(...upgrade.outside.map((entry) => `upgrade dialog at ${label}: ${entry}`));
        overlapping += upgrade.overlapsBand;

        await page.getByRole('button', { name: 'Join the Basic waitlist' }).click();
        const waitlistDialog = page.getByRole('dialog', { name: WAITLIST_DIALOG });
        await expect(waitlistDialog).toBeVisible();
        await page.waitForTimeout(SETTLE_MS / 2);
        const waitlist = await measureDialogControls(waitlistDialog);
        if (!waitlist.found) unmeasured.push(`waitlist dialog at ${label}`);
        outside.push(...waitlist.outside.map((entry) => `waitlist dialog at ${label}: ${entry}`));
        overlapping += waitlist.overlapsBand;
        await page.keyboard.press('Escape');
      }
    }

    expect(unmeasured, `these dialogs did not open:\n${unmeasured.join('\n')}`).toEqual([]);
    expect(outside, `the notice band covers these dialog controls:\n${outside.join('\n')}`).toEqual(
      [],
    );
    expect(
      overlapping,
      'no dialog control sat under the notice band, so this run proved nothing about the stacking',
    ).toBeGreaterThan(0);
  });
});
