import { test, expect } from '@playwright/test';
import { apiCall, signIn } from './qa-capability-harness';
import { ONBOARDING_USE_CASES } from '../features/onboarding/lib/use-cases';

const PREFERENCES_PATH = '/api/settings/preferences';
const GENERAL_NAMESPACE = 'general';

interface GeneralSnapshot {
  settings?: Record<string, unknown>;
}

async function readGeneralNamespace(page: import('@playwright/test').Page) {
  const result = await apiCall(page, `${PREFERENCES_PATH}?namespace=${GENERAL_NAMESPACE}`);
  expect(result.status).toBe(200);
  return (JSON.parse(result.body) as GeneralSnapshot).settings ?? {};
}

async function writeGeneralNamespace(
  page: import('@playwright/test').Page,
  value: Record<string, unknown>,
) {
  const result = await apiCall(page, PREFERENCES_PATH, {
    method: 'PUT',
    body: { namespace: GENERAL_NAMESPACE, value },
  });
  expect(result.status).toBe(200);
}

async function composerValue(page: import('@playwright/test').Page): Promise<string> {
  const composer = page.locator('[data-composer-textarea]');
  await expect(composer).toBeVisible();
  return composer.evaluate((el) => {
    const withValue = el as HTMLTextAreaElement;
    return withValue.value || el.textContent || '';
  });
}

test.describe('first-run onboarding', () => {
  let originalGeneral: Record<string, unknown> = {};

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    originalGeneral = await readGeneralNamespace(page);
    await writeGeneralNamespace(page, {});
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    await writeGeneralNamespace(page, originalGeneral);
    await page.close();
  });

  test('walks the two-step wizard, prefills the composer from a starter prompt, and gates the artifact notice', async ({
    page,
  }) => {
    await signIn(page);

    await page.goto('/welcome');
    await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible();

    const nameInput = page.getByLabel('Preferred name');
    await nameInput.click();
    await nameInput.fill('Onboarding E2E');
    await page.keyboard.press('Enter');

    await expect(
      page.getByRole('heading', { name: 'What do you want to do first?' }),
    ).toBeVisible();

    const chosenUseCase = ONBOARDING_USE_CASES[0]!;
    await page.getByRole('radio', { name: new RegExp(chosenUseCase.label) }).click();

    await expect(page.getByText('Start with one of these')).toBeVisible();
    const chosenPrompt = chosenUseCase.starterPrompts[0]!;
    await page.getByRole('button', { name: chosenPrompt }).click();

    await page.waitForURL('**/chat**');
    await expect(async () => {
      expect(await composerValue(page)).toContain(chosenPrompt);
    }).toPass();
    await page.waitForURL((url) => !url.search.includes('starterPrompt'));

    await page.goto('/welcome');
    await page.waitForURL('**/chat');

    const artifactsToggle = page.getByTitle('Artifacts');
    await artifactsToggle.click();

    const notice = page.getByText("Artifacts follow your conversation's privacy");
    await expect(notice).toBeVisible();

    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(notice).not.toBeVisible();

    await artifactsToggle.click();
    await artifactsToggle.click();
    await expect(notice).not.toBeVisible();
  });
});
