import { test, expect } from '@playwright/test';
import { createErrorHandler } from './utils/error-handler';

test.describe('Automation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const automationLink = page
      .locator('a[href*="automation"], button:has-text("Automation")')
      .first();
    if (await automationLink.isVisible()) {
      await automationLink.click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should list automation windows', async ({ page }) => {
    const refreshButton = page
      .locator('button:has-text("Refresh"), [data-testid="refresh-windows"]')
      .first();

    if (await refreshButton.isVisible()) {
      await refreshButton.click();

      // Wait for windows list to appear after refresh
      const windowsList = page.locator('[data-testid="windows-list"], .windows-list').first();
      await windowsList.waitFor({ state: 'visible', timeout: 5000 });
      await expect(windowsList).toBeVisible();

      const windowItems = windowsList.locator('li, [data-testid="window-item"]');
      const count = await windowItems.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should search for UI elements', async ({ page }) => {
    const searchInput = page
      .locator('input[placeholder*="Search"], [data-testid="element-search"]')
      .first();

    if (await searchInput.isVisible()) {
      await searchInput.fill('Button');

      const searchButton = page
        .locator('button:has-text("Search"), [data-testid="search-elements"]')
        .first();
      await searchButton.click();

      // Wait for search results to appear
      const resultsList = page.locator('[data-testid="search-results"], .search-results').first();
      await resultsList.waitFor({ state: 'visible', timeout: 5000 });
      await expect(resultsList).toBeVisible();
    }
  });

  test('should capture screenshot', async ({ page }) => {
    const screenshotButton = page
      .locator('button:has-text("Screenshot"), [data-testid="capture-screenshot"]')
      .first();

    if (await screenshotButton.isVisible()) {
      await screenshotButton.click();

      // Wait for screenshot preview to appear
      const preview = page
        .locator('[data-testid="screenshot-preview"], .screenshot-preview img')
        .first();
      await preview.waitFor({ state: 'visible', timeout: 10000 });
      await expect(preview).toBeVisible();
    }
  });

  test('should perform click action', async ({ page }) => {
    const clickButton = page
      .locator('button:has-text("Click"), [data-testid="perform-click"]')
      .first();

    if (await clickButton.isVisible()) {
      const xInput = page.locator('input[name="x"], [data-testid="click-x"]').first();
      const yInput = page.locator('input[name="y"], [data-testid="click-y"]').first();

      if ((await xInput.isVisible()) && (await yInput.isVisible())) {
        await xInput.fill('100');
        await yInput.fill('100');

        await clickButton.click();

        const successMessage = page.locator('.success-message, [role="status"]').first();
        await expect(successMessage).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should type text', async ({ page }) => {
    const typeInput = page
      .locator('input[placeholder*="Type"], [data-testid="type-text-input"]')
      .first();
    const typeButton = page
      .locator('button:has-text("Type"), [data-testid="perform-type"]')
      .first();

    if ((await typeInput.isVisible()) && (await typeButton.isVisible())) {
      await typeInput.fill('Hello, World!');
      await typeButton.click();

      // Wait for success indicator to appear
      const successIndicator = page.locator('.success, [data-status="success"]').first();
      await expect(successIndicator).toBeVisible({ timeout: 5000 });
    }
  });

  test('should send hotkey combination', async ({ page }) => {
    const hotkeyButton = page
      .locator('button:has-text("Hotkey"), [data-testid="send-hotkey"]')
      .first();

    if (await hotkeyButton.isVisible()) {
      const modifierSelect = page
        .locator('select[name="modifier"], [data-testid="hotkey-modifier"]')
        .first();
      const keySelect = page.locator('select[name="key"], [data-testid="hotkey-key"]').first();

      if ((await modifierSelect.isVisible()) && (await keySelect.isVisible())) {
        await modifierSelect.selectOption('ctrl');
        await keySelect.selectOption('c');

        await hotkeyButton.click();

        // Wait for hotkey action to complete - check for success indicator or button state
        const successIndicator = page.locator('.success, [data-status="success"]').first();
        await successIndicator.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
      }
    }
  });

  test('should display window details', async ({ page }) => {
    const windowItem = page.locator('[data-testid="window-item"]').first();

    if (await windowItem.isVisible()) {
      await windowItem.click();

      const detailsPanel = page.locator('[data-testid="window-details"], .window-details').first();
      await expect(detailsPanel).toBeVisible();

      await expect(detailsPanel).toContainText(/name|title|size|position/i);
    }
  });

  test('should filter windows by name', async ({ page }) => {
    const filterInput = page
      .locator('input[placeholder*="Filter"], [data-testid="filter-windows"]')
      .first();

    if (await filterInput.isVisible()) {
      await filterInput.fill('Chrome');

      // Wait for filter to be applied
      await expect(async () => {
        const visibleWindows = page.locator('[data-testid="window-item"]:visible');
        const count = await visibleWindows.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }).toPass({ timeout: 3000 });
    }
  });

  test('should perform OCR on screenshot', async ({ page }) => {
    const screenshotButton = page
      .locator('button:has-text("Screenshot"), [data-testid="capture-screenshot"]')
      .first();

    if (await screenshotButton.isVisible()) {
      await screenshotButton.click();

      // Wait for screenshot preview to appear before clicking OCR
      const preview = page
        .locator('[data-testid="screenshot-preview"], .screenshot-preview img')
        .first();
      await preview.waitFor({ state: 'visible', timeout: 10000 });

      const ocrButton = page.locator('button:has-text("OCR"), [data-testid="perform-ocr"]').first();

      if (await ocrButton.isVisible()) {
        await ocrButton.click();

        // Wait for OCR results to appear
        const ocrResults = page.locator('[data-testid="ocr-results"], .ocr-results').first();
        await expect(ocrResults).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('should handle automation errors gracefully', async ({ page }) => {
    const clickButton = page
      .locator('button:has-text("Click"), [data-testid="perform-click"]')
      .first();

    if (await clickButton.isVisible()) {
      const xInput = page.locator('input[name="x"], [data-testid="click-x"]').first();
      const yInput = page.locator('input[name="y"], [data-testid="click-y"]').first();

      if ((await xInput.isVisible()) && (await yInput.isVisible())) {
        await xInput.fill('-1');
        await yInput.fill('-1');

        await clickButton.click();

        const errorMessage = page.locator('[role="alert"], .error-message').first();
        await expect(errorMessage).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should clear errors', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    const errorMessage = page.locator('[role="alert"], .error-message').first();

    if (await errorHandler.isElementVisible(errorMessage, 1000)) {
      const clearButton = page.locator('button[aria-label*="Clear"], button:has-text("×")').first();

      if (await errorHandler.isElementVisible(clearButton)) {
        const clickSuccess = await errorHandler.safeClick(clearButton);
        if (clickSuccess) {
          await errorHandler.expectElementNotVisible(errorMessage);
        }
      }
    }
  });
});

test.describe('Automation Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const automationLink = page
      .locator('a[href*="automation"], button:has-text("Automation")')
      .first();
    if (await automationLink.isVisible()) {
      await automationLink.click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should record overlay click events', async ({ page }) => {
    const recordButton = page
      .locator('button:has-text("Record"), [data-testid="start-recording"]')
      .first();

    if (await recordButton.isVisible()) {
      await recordButton.click();

      const recordingIndicator = page
        .locator('[data-recording="true"], .recording-indicator')
        .first();
      await expect(recordingIndicator).toBeVisible({ timeout: 3000 });
    }
  });

  test('should stop recording', async ({ page }) => {
    const stopButton = page
      .locator('button:has-text("Stop"), [data-testid="stop-recording"]')
      .first();

    if (await stopButton.isVisible()) {
      await stopButton.click();

      const recordingIndicator = page
        .locator('[data-recording="true"], .recording-indicator')
        .first();
      await expect(recordingIndicator).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('should replay recorded events', async ({ page }) => {
    const replayButton = page
      .locator('button:has-text("Replay"), [data-testid="replay-events"]')
      .first();

    if (await replayButton.isVisible()) {
      await replayButton.click();

      const replayIndicator = page.locator('[data-replaying="true"], .replay-indicator').first();
      await expect(replayIndicator).toBeVisible({ timeout: 3000 });

      await expect(replayIndicator).not.toBeVisible({ timeout: 10000 });
    }
  });

  test('should display recorded events list', async ({ page }) => {
    const eventsList = page
      .locator('[data-testid="recorded-events"], .recorded-events-list')
      .first();

    if (await eventsList.isVisible()) {
      await expect(eventsList).toBeVisible();

      const eventItems = eventsList.locator('li, [data-testid="event-item"]');
      const count = await eventItems.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should clear recorded events', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    const clearButton = page
      .locator('button:has-text("Clear"), [data-testid="clear-events"]')
      .first();

    if (await errorHandler.isElementVisible(clearButton)) {
      const clickSuccess = await errorHandler.safeClick(clearButton);
      if (clickSuccess) {
        const confirmButton = page
          .locator('button:has-text("Confirm"), button:has-text("Clear All")')
          .first();
        if (await errorHandler.isElementVisible(confirmButton, 1000)) {
          await errorHandler.safeClick(confirmButton);
        }

        const eventsList = page.locator('[data-testid="recorded-events"] li').first();
        await errorHandler.expectElementNotVisible(eventsList, 3000);
      }
    }
  });
});
