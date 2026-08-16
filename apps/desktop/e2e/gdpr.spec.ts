import { test, expect, type Locator, type Page } from '@playwright/test';
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import { expectCloudShellReady, mockCloudApi } from './utils/mock-cloud-api';

async function gotoShell(page: Page): Promise<void> {
  await injectMockCloudAuth(page);
  await mockCloudApi(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectCloudShellReady(page);
}

const SECTION_LOAD_TIMEOUT = 30000;

async function openPrivacySettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(async () => {
    await dialog.getByRole('button', { name: 'Privacy', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Cloud data & privacy' })).toBeVisible({
      timeout: 10000,
    });
  }).toPass({ timeout: SECTION_LOAD_TIMEOUT });
  await expect(dialog.getByRole('heading', { name: 'Export Cloud account data' })).toBeVisible({
    timeout: SECTION_LOAD_TIMEOUT,
  });
  await expect(dialog.getByRole('heading', { name: 'Analytics & Privacy Settings' })).toBeVisible({
    timeout: SECTION_LOAD_TIMEOUT,
  });
  return dialog;
}

function consentToggle(dialog: Locator, title: string): Locator {
  return dialog
    .getByRole('heading', { name: title, exact: true })
    .locator('xpath=../..')
    .getByRole('button');
}

function collectionRow(dialog: Locator, label: string): Locator {
  return dialog.getByText(`${label}:`, { exact: true }).locator('xpath=../..');
}

async function readStoredConsent(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('privacy_consent'));
}

test.describe('GDPR privacy controls', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await gotoShell(page);
  });

  test('Privacy settings expose the access, portability and erasure controls', async ({ page }) => {
    const dialog = await openPrivacySettings(page);

    await expect(dialog.getByRole('button', { name: 'Export Cloud data' })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: 'Export Data', exact: true })).toBeEnabled();

    await expect(dialog.getByRole('button', { name: 'Delete Data', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('heading', { name: 'Account and deletion' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Manage Cloud privacy' })).toBeEnabled();

    await expect(dialog.getByRole('heading', { name: 'What Data Do We Collect?' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'What We Never Collect' })).toBeVisible();
    await expect(dialog.getByText('Chat messages or conversation history')).toBeVisible();
  });

  test('Article 20: exporting analytics data downloads a readable JSON payload', async ({
    page,
  }) => {
    const dialog = await openPrivacySettings(page);

    const downloadStarted = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export Data', exact: true }).click();
    const download = await downloadStarted;

    expect(download.suggestedFilename()).toMatch(/^analytics-export-\d+\.json$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    expect(payload).toHaveProperty('export_date');
    expect(payload).toHaveProperty('events');
    expect(payload).toHaveProperty('session_info');
  });

  test('consent is granular, recorded, and reflected in the collection disclosure', async ({
    page,
  }) => {
    const dialog = await openPrivacySettings(page);

    for (const title of ['Enable Analytics', 'Error Reporting', 'Performance Monitoring']) {
      await expect(consentToggle(dialog, title)).toBeVisible();
    }

    expect(await readStoredConsent(page)).toBeNull();
    await expect(collectionRow(dialog, 'Usage Events')).toHaveText(/^○/);

    await consentToggle(dialog, 'Enable Analytics').click();

    await expect(collectionRow(dialog, 'Usage Events')).toHaveText(/^✓/);
    await expect(collectionRow(dialog, 'Error Logs')).toHaveText(/^○/);
    await expect(dialog.getByText(/Consent version: /)).toBeVisible();

    const stored = JSON.parse((await readStoredConsent(page)) ?? '{}') as Record<string, unknown>;
    expect(stored['analytics_enabled']).toBe(true);
    expect(stored['error_reporting_enabled']).toBe(false);
    expect(stored['consent_date']).toEqual(expect.any(String));
  });

  test('a recorded consent choice is not reset by a reload', async ({ page }) => {
    const dialog = await openPrivacySettings(page);
    await consentToggle(dialog, 'Performance Monitoring').click();
    await expect(collectionRow(dialog, 'Performance Metrics')).toHaveText(/^✓/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectCloudShellReady(page);

    const consent = JSON.parse((await readStoredConsent(page)) ?? '{}') as Record<string, unknown>;
    expect(consent['performance_monitoring_enabled']).toBe(true);
    expect(consent['analytics_enabled']).toBe(false);

    const config = JSON.parse(
      (await page.evaluate(() => window.localStorage.getItem('analytics_config'))) ?? '{}',
    ) as Record<string, unknown>;
    expect(config['allowPerformanceMonitoring']).toBe(true);
    expect(config['enabled']).toBe(false);
  });

  test('Article 17: deletion is confirmed, warns it is irreversible, and can be cancelled', async ({
    page,
  }) => {
    const dialog = await openPrivacySettings(page);
    await consentToggle(dialog, 'Enable Analytics').click();
    expect(await readStoredConsent(page)).not.toBeNull();

    await dialog.getByRole('button', { name: 'Delete Data', exact: true }).click();

    const confirm = page.getByText('Delete All Analytics Data?');
    await expect(confirm).toBeVisible();
    await expect(page.getByText('This action cannot be undone.')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirm).toBeHidden();
    expect(await readStoredConsent(page)).not.toBeNull();
  });

  test('Article 17: confirming deletion erases the stored analytics record', async ({ page }) => {
    const dialog = await openPrivacySettings(page);
    await consentToggle(dialog, 'Enable Analytics').click();
    await expect(collectionRow(dialog, 'Usage Events')).toHaveText(/^✓/);

    await dialog.getByRole('button', { name: 'Delete Data', exact: true }).click();
    await page.getByRole('button', { name: 'Delete All Data', exact: true }).click();

    await expect(page.getByText('Delete All Analytics Data?')).toBeHidden();
    await expect(collectionRow(dialog, 'Usage Events')).toHaveText(/^○/);
    expect(await readStoredConsent(page)).toBeNull();
  });
});
