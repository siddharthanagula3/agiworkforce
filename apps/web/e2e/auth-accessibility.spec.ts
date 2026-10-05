import { MOCK_PASSWORD_ACCOUNT, mockAuthProvider } from './lib/mock-auth-provider';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/login', '/signup'] as const;

const LARGE_TEXT_ROOT_PX = 32;
const MIN_TARGET_PX = 24;
const MIN_TOUCH_TARGET_PX = 44;
const TARGET_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
] as const;

async function openAuth(page: Page, route: string): Promise<void> {
  await mockAuthProvider(page);
  await page.goto(route, { waitUntil: 'load' });
  await expect(page.getByTestId('auth-layout')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  if (route === '/signup') {
    await expect(page.getByTestId('auth-signup-consent').getByRole('checkbox')).not.toBeChecked();
  }
}

// A link inside a running sentence (the consent label, an error message) is
// sized by its line of text; every other control stands alone and is measured.
async function shortStandaloneTargets(page: Page): Promise<string[]> {
  return page.getByTestId('auth-layout').evaluate((layout, minimum) => {
    const short: string[] = [];
    const controls = layout.querySelectorAll<HTMLElement>('button, a[href], summary, input');
    for (const control of controls) {
      if (control.closest('[aria-hidden="true"]')) continue;
      if (control.tagName === 'A' && control.closest('label, [role="alert"]')) continue;
      const checkbox = control instanceof HTMLInputElement && control.type === 'checkbox';
      const target = checkbox ? (control.closest('label') ?? control) : control;
      const box = target.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height >= minimum - 0.5) continue;
      const name =
        control.getAttribute('aria-label') ||
        control.textContent?.trim() ||
        control.getAttribute('name') ||
        control.tagName;
      short.push(`${name}: ${Math.round(box.height)}px`);
    }
    return short;
  }, MIN_TOUCH_TARGET_PX);
}

async function expectSeriousViolations(page: Page, label: string): Promise<void> {
  // @axe-core/playwright bundles its own Playwright types, which do not
  // structurally match this repo's. The other specs cast the same way.
  const results = await new AxeBuilder({ page: page as never })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(
    blocking.map((v) => `${v.impact}: ${v.id} (${v.nodes.length} nodes), ${v.help}`),
    label,
  ).toEqual([]);
}

test.describe('auth accessibility', () => {
  for (const route of ROUTES) {
    test(`${route} has no serious or critical axe violations`, async ({ page }) => {
      await openAuth(page, route);

      await expectSeriousViolations(page, `${route} accessibility`);
    });

    test(`${route} ties every field error to the field it is about`, async ({ page }) => {
      await openAuth(page, route);

      // On /signup the first thing that can fail is the consent box, and an
      // attempt without it must never reach the provider, so that is the field
      // this screen proves. The email field's wiring is the same component as
      // on /login, which proves it here against a real response.
      if (route === '/signup') {
        await page.getByLabel('Email address').fill(`unticked-${Date.now()}@example.invalid`);
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        const box = page.getByTestId('auth-signup-consent').getByRole('checkbox');
        await expect(page.getByTestId('auth-signup-consent').getByRole('alert')).toBeVisible();
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        const describedBy = await box.getAttribute('aria-describedby');
        expect(describedBy, 'the box points at its own message').toBeTruthy();
        for (const id of describedBy!.split(' ')) {
          await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
        }
        await expectSeriousViolations(page, `${route} accessibility after a refused attempt`);
        return;
      }

      await page.getByLabel('Email address').fill(`unknown-${Date.now()}@example.invalid`);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByTestId('auth-layout').getByRole('alert')).toBeVisible();

      const email = page.getByLabel('Email address');
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      const describedBy = await email.getAttribute('aria-describedby');
      expect(describedBy, 'the field points at its own error').toBeTruthy();
      await expect(page.locator(`[id="${describedBy}"]`)).toBeVisible();
    });

    test(`${route} keeps its controls usable at OS large-text sizes`, async ({ page }) => {
      await openAuth(page, route);
      await page.addStyleTag({ content: `html { font-size: ${LARGE_TEXT_ROOT_PX}px; }` });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'large text must not push the column sideways').toBeLessThanOrEqual(0);

      for (const name of ['Continue']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
    });

    for (const viewport of TARGET_VIEWPORTS) {
      test(`${route} gives every stand-alone control a ${MIN_TOUCH_TARGET_PX}px target at ${viewport.width} wide`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await openAuth(page, route);
        const details = page.getByTestId('auth-data-use-notice').locator('summary');
        if (await details.count()) await details.click();

        expect(await shortStandaloneTargets(page)).toEqual([]);
      });
    }

    test(`${route} announces the heading of the step it is on`, async ({ page }) => {
      await openAuth(page, route);

      const region = page.locator('section[aria-labelledby]').first();
      const labelledBy = await region.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      await expect(page.locator(`[id="${labelledBy}"]`)).toHaveRole('heading');
    });
  }

  test('fast provider readiness enables sign-in after hydration', async ({ page }) => {
    await mockAuthProvider(page, { loadDelayMs: 0 });
    await page.goto('/login', { waitUntil: 'load' });
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    await page.getByLabel('Email address').fill(MOCK_PASSWORD_ACCOUNT);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  });

  test('the password reveal control reports its own pressed state', async ({ page }) => {
    await openAuth(page, '/login');

    const firstScreenToggle = page.getByRole('button', { name: 'Show password' });
    await expect(firstScreenToggle).toHaveAttribute('aria-pressed', 'false');
    await firstScreenToggle.click();
    await expect(firstScreenToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');

    await page.getByLabel('Email address').fill(MOCK_PASSWORD_ACCOUNT);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();

    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
