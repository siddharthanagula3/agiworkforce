import { expect, test, type Locator, type Page } from '@playwright/test';

import { mockAuthProvider } from './lib/mock-auth-provider';

const TRIGGER_NAME = 'Discuss Enterprise access';
const DIALOG_NAME = 'Discuss Enterprise access';
const EMAIL_LABEL = 'Email address';
const CONSENT_GROUP_NAME = 'What you are agreeing to';
const SUBMIT_NAME = 'Join waitlist';
const CLOSE_NAME = 'Close waitlist dialog';
const COOKIE_REGION_NAME = 'Cookie consent';
const COOKIE_DISMISS_LABEL = 'Close and reject non-essential cookies';

const SCROLLING_BODY = '.agi-ds-waitlist-body';

const MIN_CONTROL_HEIGHT_PX = 40;
const MAX_CONTROL_HEIGHT_PX = 64;
const READABLE_FIELDSET_WIDTH_PX = 280;
const NARROWEST_FIELDSET_WIDTH_PX = 240;
const LAYOUT_ROUNDING_PX = 1;
const FULLY_VISIBLE = { ratio: 1 };

interface DialogCase {
  readonly width: number;
  readonly height: number;
  readonly minFieldsetWidth: number;
}

const DESKTOP_MATRIX: readonly DialogCase[] = [
  { width: 1180, height: 757, minFieldsetWidth: READABLE_FIELDSET_WIDTH_PX },
  { width: 500, height: 757, minFieldsetWidth: READABLE_FIELDSET_WIDTH_PX },
  { width: 390, height: 844, minFieldsetWidth: READABLE_FIELDSET_WIDTH_PX },
  { width: 360, height: 740, minFieldsetWidth: READABLE_FIELDSET_WIDTH_PX },
  { width: 320, height: 568, minFieldsetWidth: NARROWEST_FIELDSET_WIDTH_PX },
];

const SMOKE_CASE: DialogCase = DESKTOP_MATRIX[0]!;
const SMOKE_ROUTES = ['/vscode-extension', '/mobile'] as const;

interface ScrollMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly contentWidth: number;
}

function scrollMetrics(target: Locator): Promise<ScrollMetrics> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      contentWidth:
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    };
  });
}

async function renderedBox(target: Locator, what: string) {
  const box = await target.boundingBox();
  if (!box) throw new Error(`${what} has no rendered box`);
  return box;
}

async function openEnterpriseDialog(page: Page, route: string, viewport: DialogCase) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await mockAuthProvider(page);
  await page.goto(route, { waitUntil: 'domcontentloaded' });

  // The banner only mounts after hydration, so dismissing it both proves the
  // trigger is interactive and removes a fixed overlay that can sit over the
  // hero call to action at phone widths.
  const cookieBanner = page.getByRole('region', { name: COOKIE_REGION_NAME });
  await cookieBanner.getByLabel(COOKIE_DISMISS_LABEL).click();
  await expect(cookieBanner).toBeHidden();

  const trigger = page.getByRole('button', { name: TRIGGER_NAME, exact: true }).first();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: DIALOG_NAME });
  await expect(dialog).toBeVisible();
  // The shell zooms in from 95%, so a box read mid-animation is 5% short.
  await dialog.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );

  return { trigger, dialog };
}

async function expectUsableEnterpriseDialog(page: Page, route: string, viewport: DialogCase) {
  const { trigger, dialog } = await openEnterpriseDialog(page, route, viewport);

  const body = dialog.locator(SCROLLING_BODY);
  const title = dialog.getByRole('heading', { name: DIALOG_NAME });
  const emailLabel = dialog.getByText(EMAIL_LABEL, { exact: true });
  const email = dialog.getByRole('textbox', { name: EMAIL_LABEL });
  const consent = dialog.getByRole('group', { name: CONSENT_GROUP_NAME });
  const submit = dialog.getByRole('button', { name: SUBMIT_NAME, exact: true });
  const close = dialog.getByRole('button', { name: CLOSE_NAME });

  await test.step('opens unscrolled with the title, email label and Close in view', async () => {
    await expect(email).toBeFocused();
    expect((await scrollMetrics(body)).scrollTop).toBe(0);
    expect((await scrollMetrics(dialog)).scrollTop).toBe(0);
    await expect(dialog).toBeInViewport(FULLY_VISIBLE);
    await expect(title).toBeInViewport(FULLY_VISIBLE);
    await expect(emailLabel).toBeInViewport(FULLY_VISIBLE);
    await expect(close).toBeInViewport(FULLY_VISIBLE);
  });

  await test.step('stacks the form in one column with normal-height controls', async () => {
    const flexDirection = await dialog
      .locator('form')
      .evaluate((form) => getComputedStyle(form).flexDirection);
    expect(flexDirection).toBe('column');

    const emailBox = await renderedBox(email, 'email input');
    expect(emailBox.height).toBeGreaterThanOrEqual(MIN_CONTROL_HEIGHT_PX);
    expect(emailBox.height).toBeLessThanOrEqual(MAX_CONTROL_HEIGHT_PX);

    const submitBox = await renderedBox(submit, 'submit button');
    expect(submitBox.height).toBeGreaterThanOrEqual(MIN_CONTROL_HEIGHT_PX);
    expect(submitBox.height).toBeLessThanOrEqual(MAX_CONTROL_HEIGHT_PX);
  });

  await test.step('gives the consent text the full column without sideways overflow', async () => {
    const shellMetrics = await scrollMetrics(dialog);
    const bodyMetrics = await scrollMetrics(body);
    expect(shellMetrics.scrollWidth).toBeLessThanOrEqual(shellMetrics.clientWidth);
    expect(bodyMetrics.scrollWidth).toBeLessThanOrEqual(bodyMetrics.clientWidth);

    const consentBox = await renderedBox(consent, 'consent fieldset');
    expect(Math.abs(consentBox.width - bodyMetrics.contentWidth)).toBeLessThanOrEqual(
      LAYOUT_ROUNDING_PX,
    );
    expect(consentBox.width).toBeGreaterThanOrEqual(viewport.minFieldsetWidth);
  });

  await test.step('scrolls only the body, leaving the title and Close in view', async () => {
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const shellMetrics = await scrollMetrics(dialog);
    const bodyMetrics = await scrollMetrics(body);
    expect(shellMetrics.scrollTop).toBe(0);
    expect(shellMetrics.scrollHeight).toBeLessThanOrEqual(shellMetrics.clientHeight);
    expect(
      Math.abs(bodyMetrics.scrollTop - (bodyMetrics.scrollHeight - bodyMetrics.clientHeight)),
    ).toBeLessThanOrEqual(LAYOUT_ROUNDING_PX);
    await expect(title).toBeInViewport(FULLY_VISIBLE);
    await expect(close).toBeInViewport(FULLY_VISIBLE);
  });

  await test.step('Escape closes the dialog and hands focus back to its trigger', async () => {
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test.describe('Enterprise enquiry dialog opens as a usable one-column form', () => {
  for (const viewport of DESKTOP_MATRIX) {
    test(`/desktop at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await expectUsableEnterpriseDialog(page, '/desktop', viewport);
    });
  }

  for (const route of SMOKE_ROUTES) {
    test(`${route} at ${SMOKE_CASE.width}x${SMOKE_CASE.height}`, async ({ page }) => {
      await expectUsableEnterpriseDialog(page, route, SMOKE_CASE);
    });
  }
});
