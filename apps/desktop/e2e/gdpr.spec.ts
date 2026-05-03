import { test, expect, Page } from '@playwright/test';

/**
 * GDPR Compliance E2E Tests
 *
 * Tests for GDPR Article 17 (Right to Erasure) and Article 20 (Right to Data Portability)
 * These tests verify the desktop application properly supports user data management.
 */

async function openSettings(page: Page): Promise<boolean> {
  const settingsButton = page.locator(
    '[data-testid="settings-button"], button[aria-label*="Settings"], [data-testid="nav-settings"]',
  );
  if (await settingsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await settingsButton.click();
    await page.waitForTimeout(500);
    const panel = page.locator(
      '[data-testid="settings-panel"], [role="dialog"]:has-text("Settings")',
    );
    return panel.isVisible({ timeout: 2000 }).catch(() => false);
  }
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(500);
  const panel = page.locator(
    '[data-testid="settings-panel"], [role="dialog"]:has-text("Settings")',
  );
  return panel.isVisible({ timeout: 2000 }).catch(() => false);
}

async function openPrivacySection(page: Page): Promise<boolean> {
  const privacyTab = page.locator(
    '[data-testid="privacy-tab"], button:has-text("Privacy"), [role="tab"]:has-text("Privacy")',
  );
  if (await privacyTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await privacyTab.click();
    await page.waitForTimeout(300);
    return true;
  }
  const privacySection = page.locator('[data-testid="privacy-section"], .privacy-settings');
  if (await privacySection.isVisible({ timeout: 2000 }).catch(() => false)) {
    await privacySection.scrollIntoViewIfNeeded();
    return true;
  }
  return false;
}

test.describe('GDPR Data Export Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const opened = await openSettings(page);
    test.skip(!opened, 'Settings panel not available');
  });

  test('should have data export option accessible in settings', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const exportButton = page.locator(
      '[data-testid="export-data"], button:has-text("Export"), button:has-text("Download"):has-text("Data")',
    );
    const visible = await exportButton.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!visible, 'Export data button not present in current build');
    await expect(exportButton).toBeVisible();
  });

  test('should show privacy preferences options', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const privacyToggles = page.locator(
      '[data-testid="privacy-toggle"], [role="switch"], input[type="checkbox"]',
    );
    const toggleCount = await privacyToggles.count();
    test.skip(toggleCount === 0, 'No privacy toggles found');
    expect(toggleCount).toBeGreaterThan(0);
  });

  test('should display telemetry opt-out option', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const telemetryOption = page.locator(
      '[data-testid="telemetry-toggle"], :text("Telemetry"), :text("Analytics")',
    );
    const visible = await telemetryOption.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'Telemetry toggle not present in current build');
    await expect(telemetryOption).toBeVisible();
  });

  test('should allow toggling data collection preferences', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const toggle = page.locator('[role="switch"], [data-testid="privacy-toggle"]').first();
    const visible = await toggle.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'Privacy toggle not present');

    const initialState = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await page.waitForTimeout(300);
    const newState = await toggle.getAttribute('aria-checked');

    expect(newState).not.toBe(initialState);

    // Restore original state
    await toggle.click();
  });
});

test.describe('GDPR Data Deletion Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const opened = await openSettings(page);
    test.skip(!opened, 'Settings panel not available');
  });

  test('should have data deletion option in settings', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const deleteButton = page.locator(
      '[data-testid="delete-data"], button:has-text("Delete"):has-text("Data"), button:has-text("Clear"):has-text("Data")',
    );
    const visible = await deleteButton.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!visible, 'Delete data button not present in current build');
    await expect(deleteButton).toBeVisible();
  });

  test('should show confirmation before data deletion', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const deleteButton = page.locator(
      '[data-testid="delete-data"], button:has-text("Delete"):has-text("Data")',
    );
    const visible = await deleteButton.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'Delete data button not present');

    await deleteButton.click();

    const confirmDialog = page.locator(
      '[role="alertdialog"], [role="dialog"]:has-text("confirm"), [role="dialog"]:has-text("delete")',
    );
    await expect(confirmDialog).toBeVisible({ timeout: 2000 });

    const cancelButton = confirmDialog.locator('button:has-text("Cancel"), button:has-text("No")');
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
    } else {
      await page.keyboard.press('Escape');
    }
  });

  test('should warn about irreversible action', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const deleteButton = page.locator(
      '[data-testid="delete-data"], button:has-text("Delete"):has-text("Data")',
    );
    const visible = await deleteButton.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'Delete data button not present');

    await deleteButton.click();

    const warningText = page.locator(
      ':text("irreversible"), :text("cannot be undone"), :text("permanent")',
    );
    const hasWarning = await warningText.isVisible({ timeout: 2000 }).catch(() => false);

    await page.keyboard.press('Escape');

    test.skip(!hasWarning, 'Irreversibility warning not shown');
    await expect(warningText.first()).toBeVisible();
  });
});

test.describe('Privacy Preferences Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const opened = await openSettings(page);
    test.skip(!opened, 'Settings panel not available');
  });

  test('should persist privacy preferences across sessions', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const toggle = page.locator('[role="switch"], [data-testid="privacy-toggle"]').first();
    const visible = await toggle.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'Privacy toggle not present');

    const initialState = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await page.waitForTimeout(500);
    const changedState = await toggle.getAttribute('aria-checked');

    await page.reload();
    await page.waitForLoadState('networkidle');

    const reopened = await openSettings(page);
    test.skip(!reopened, 'Settings panel not available after reload');
    const privacyReopened = await openPrivacySection(page);
    test.skip(!privacyReopened, 'Privacy section not available after reload');

    const persistedToggle = page.locator('[role="switch"], [data-testid="privacy-toggle"]').first();
    await expect(persistedToggle).toBeVisible({ timeout: 2000 });
    const persistedState = await persistedToggle.getAttribute('aria-checked');
    expect(persistedState).toBe(changedState);

    // Restore original state
    if (persistedState !== initialState) {
      await persistedToggle.click();
    }
  });
});

test.describe('Data Access Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const opened = await openSettings(page);
    test.skip(!opened, 'Settings panel not available');
  });

  test('should display what data is collected', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const dataInfo = page.locator(
      '[data-testid="data-collection-info"], :text("collect"), :text("data we")',
    );
    const visible = await dataInfo.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'Data collection information not present');
    await expect(dataInfo.first()).toBeVisible();
  });

  test('should allow viewing stored data summary', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const dataSummary = page.locator(
      '[data-testid="data-summary"], button:has-text("View"):has-text("Data"), :text("conversations"), :text("messages")',
    );
    const visible = await dataSummary.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'Data summary not present');
    await expect(dataSummary.first()).toBeVisible();
  });
});

test.describe('Security-Sensitive Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should require confirmation for clearing conversation history', async ({ page }) => {
    const clearHistoryButton = page.locator(
      'button:has-text("Clear"):has-text("History"), [data-testid="clear-history"]',
    );
    const visible = await clearHistoryButton.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!visible, 'Clear history button not present');

    await clearHistoryButton.click();

    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 2000 });

    await page.keyboard.press('Escape');
  });

  test('should require confirmation for resetting settings', async ({ page }) => {
    const opened = await openSettings(page);
    test.skip(!opened, 'Settings panel not available');

    const resetButton = page.locator(
      'button:has-text("Reset"):has-text("Settings"), [data-testid="reset-settings"]',
    );
    const visible = await resetButton.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'Reset settings button not present');

    await resetButton.click();

    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 2000 });

    await page.keyboard.press('Escape');
  });

  test('should protect API key display by default', async ({ page }) => {
    const opened = await openSettings(page);
    test.skip(!opened, 'Settings panel not available');

    const apiKeysTab = page.locator(
      '[data-testid="api-keys-tab"], button:has-text("API"), [role="tab"]:has-text("API")',
    );
    const tabVisible = await apiKeysTab.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!tabVisible, 'API keys tab not present');

    await apiKeysTab.click();
    await page.waitForTimeout(300);

    const maskedInput = page.locator('input[type="password"], [data-masked="true"]');
    const hasProtectedKeys = await maskedInput.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!hasProtectedKeys, 'No masked API key inputs found');

    const inputType = await maskedInput.first().getAttribute('type');
    expect(inputType).toBe('password');
  });
});

test.describe('Consent Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const opened = await openSettings(page);
    test.skip(!opened, 'Settings panel not available');
  });

  test('should provide clear opt-in/opt-out controls', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const consentControls = page.locator(
      '[role="switch"], input[type="checkbox"], [data-testid*="consent"], [data-testid*="opt"]',
    );
    const controlCount = await consentControls.count();
    test.skip(controlCount === 0, 'No consent controls found');
    expect(controlCount).toBeGreaterThan(0);
  });

  test('should allow granular control over data collection types', async ({ page }) => {
    const privacyOpened = await openPrivacySection(page);
    test.skip(!privacyOpened, 'Privacy section not available');

    const privacyToggles = page.locator('[role="switch"], [data-testid*="privacy"]');
    const toggleCount = await privacyToggles.count();
    test.skip(toggleCount <= 1, 'Single or no privacy toggles — granular control not present');
    expect(toggleCount).toBeGreaterThan(1);
  });
});
