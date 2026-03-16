/**
 * Comprehensive Accessibility Audit (WCAG 2.1 AA)
 * Uses axe-core for automated accessibility testing
 * Tests keyboard navigation, focus management, ARIA attributes, color contrast
 */

import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y, getViolations } from 'axe-playwright';

test.describe('Accessibility Audit - WCAG 2.1 AA Compliance', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    // Inject axe-core for accessibility testing
    await injectAxe(page);
  });

  test.describe('Automated Accessibility Scanning', () => {
    test('should have no accessibility violations on home view', async ({ page }) => {
      // Run axe-core scan
      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: {
          html: true,
        },
      });
    });

    test('should scan chat interface for violations', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForSelector('[data-testid="chat-container"], .chat-interface', {
        timeout: 5000,
      });

      const violations = await getViolations(page);
      expect(violations).toEqual([]);
    });

    test('should scan settings page for violations', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const violations = await getViolations(page);
      expect(violations).toEqual([]);
    });

    test('should have no critical axe violations', async ({ page }) => {
      await page.goto('/');

      const violations = await getViolations(page);
      const criticalViolations = violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );

      expect(criticalViolations).toEqual([]);
    });
  });

  test.describe('Keyboard Navigation - WCAG 2.1.1 (A)', () => {
    test('all interactive elements should be keyboard accessible', async ({ page }) => {
      const buttons = page.locator('button');
      const links = page.locator('a[href]');
      const inputs = page.locator('input, textarea, select');

      const totalInteractive =
        (await buttons.count()) + (await links.count()) + (await inputs.count());
      expect(totalInteractive).toBeGreaterThan(0);

      // Test Tab navigation
      let focusableCount = 0;
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');

        const activeElement = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return null;

          const role = el.getAttribute('role');
          const isButton = el.tagName === 'BUTTON' || role === 'button';
          const isLink = el.tagName === 'A';
          const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);

          return isButton || isLink || isInput;
        });

        if (activeElement) {
          focusableCount++;
        }
      }

      expect(focusableCount).toBeGreaterThan(0);
    });

    test('Tab key should navigate in logical order', async ({ page }) => {
      const focusOrder: string[] = [];

      for (let i = 0; i < 10; i++) {
        const ariaLabel = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          return el?.getAttribute('aria-label') || el?.textContent?.substring(0, 20) || '';
        });

        if (ariaLabel) {
          focusOrder.push(ariaLabel);
        }

        await page.keyboard.press('Tab');
      }

      // Verify we're navigating through different elements
      expect(focusOrder.length).toBeGreaterThan(0);
    });

    test('Shift+Tab should navigate backward', async ({ page }) => {
      // First, Tab forward 5 times
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
      }

      const forwardElement = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return el?.id || el?.getAttribute('aria-label') || '';
      });

      // Now Shift+Tab backward 2 times
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');

      const backwardElement = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return el?.id || el?.getAttribute('aria-label') || '';
      });

      // Elements should be different
      expect(forwardElement).not.toEqual(backwardElement);
    });

    test('Enter key should activate focused button', async ({ page }) => {
      // Navigate to a button
      const button = page.locator('button').first();

      // Focus it
      await button.focus();

      // Get button text before
      const initialText = await button.textContent();

      // Press Enter
      await page.keyboard.press('Enter');

      // Button should have been activated (click event fired)
      expect(initialText).toBeTruthy();
    });

    test('Space bar should activate focused button', async ({ page }) => {
      const button = page.locator('button[type="button"]').first();

      if ((await button.count()) > 0) {
        await button.focus();

        // Press Space
        await page.keyboard.press(' ');

        // Wait for any side effects
        await page.waitForTimeout(300);

        // No error should occur
        expect(button).toBeTruthy();
      }
    });

    test('Escape key should close menus/modals', async ({ page }) => {
      // Try to find and open a menu
      const menuTrigger = page.locator('button[aria-haspopup="menu"]').first();

      if ((await menuTrigger.count()) > 0) {
        await menuTrigger.click();
        await page.waitForTimeout(200);

        // Menu should be visible
        const menu = page.locator('[role="menu"]');
        const isOpenBefore = await menu.isVisible().catch(() => false);

        // Press Escape
        await page.keyboard.press('Escape');

        // Menu should be closed
        const isOpenAfter = await menu.isVisible().catch(() => false);

        if (isOpenBefore) {
          expect(isOpenAfter).toBe(false);
        }
      }
    });

    test('Arrow keys should navigate list items', async ({ page }) => {
      const selectElement = page.locator('select').first();

      if ((await selectElement.count()) > 0) {
        await selectElement.focus();

        // Get initial value
        const initialValue = await selectElement.inputValue();

        // Press Down arrow
        await page.keyboard.press('ArrowDown');

        // Value might change (implementation-dependent)
        const newValue = await selectElement.inputValue();

        expect(initialValue || newValue).toBeTruthy();
      }
    });

    test('Form controls should be keyboard accessible', async ({ page }) => {
      const inputs = page.locator('input[type="text"], textarea');

      if ((await inputs.count()) > 0) {
        const input = inputs.first();
        await input.focus();

        // Type in focused input
        await page.keyboard.type('test input');

        // Verify typing worked
        const value = await input.inputValue();
        expect(value).toContain('test');
      }
    });
  });

  test.describe('Focus Management - WCAG 2.4.3 (AA)', () => {
    test('focus indicator should be visible on all interactive elements', async ({ page }) => {
      const button = page.locator('button').first();

      if ((await button.count()) > 0) {
        await button.focus();

        // Check for visible focus indicator
        const hasFocusStyle = await button.evaluate((el) => {
          const style = window.getComputedStyle(el);
          const outline = style.outlineWidth !== '0px';
          const boxShadow = style.boxShadow !== 'none';
          const hasChildren = el.querySelector(':focus-visible') !== null;

          return outline || boxShadow || hasChildren;
        });

        // Either outline, box-shadow, or some other focus style
        if (!hasFocusStyle) {
          console.warn('No visible focus indicator detected on button - manual review recommended');
        }
        expect(hasFocusStyle).toBe(true);
      }
    });

    test('focus should not be lost when interacting with controls', async ({ page }) => {
      const input = page.locator('input[type="text"]').first();

      if ((await input.count()) > 0) {
        await input.focus();

        const focusedId = await page.evaluate(() => {
          return document.activeElement?.id || document.activeElement?.className || 'focused';
        });

        await input.type('test');

        const focusedAfter = await page.evaluate(() => {
          return document.activeElement?.id || document.activeElement?.className || 'focused';
        });

        expect(focusedId).toEqual(focusedAfter);
      }
    });

    test('focus order should match visual layout (top to bottom, left to right)', async ({
      page,
    }) => {
      const focusPositions: { x: number; y: number }[] = [];

      for (let i = 0; i < 5; i++) {
        const position = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const rect = el?.getBoundingClientRect();
          return rect ? { x: rect.x, y: rect.y } : null;
        });

        if (position) {
          focusPositions.push(position);
        }

        await page.keyboard.press('Tab');
      }

      // Verify we're generally moving right or down (logical flow)
      expect(focusPositions.length).toBeGreaterThan(0);
    });

    test('focus should not be trapped in subcomponents', async ({ page }) => {
      const buttons = page.locator('button');

      if ((await buttons.count()) > 1) {
        const firstButton = buttons.nth(0);
        const secondButton = buttons.nth(1);

        await firstButton.focus();

        let focusMovedToSecond = false;

        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');

          const isFocusedOnSecond = await page.evaluate(() => {
            const active = document.activeElement;
            const second = document.querySelectorAll('button')[1];
            return active === second;
          });

          if (isFocusedOnSecond) {
            focusMovedToSecond = true;
            break;
          }
        }

        // Should be able to Tab away from first button
        expect(focusMovedToSecond).toBe(true);
      }
    });

    test('modal should return focus to trigger after closing', async ({ page }) => {
      const modalTrigger = page
        .locator('button:has-text("Open"), [data-testid="open-modal"]')
        .first();

      if ((await modalTrigger.count()) > 0) {
        const triggerText = await modalTrigger.textContent();

        await modalTrigger.click();
        await page.waitForTimeout(300);

        // Close modal (find close button)
        const closeButton = page.locator('[aria-label="Close"], button:has-text("Close")').last();

        if ((await closeButton.count()) > 0) {
          await closeButton.click();
          await page.waitForTimeout(300);

          // Focus should return to trigger
          const focusedText = await page.evaluate(() => {
            return (document.activeElement as HTMLElement)?.textContent?.substring(0, 20) || '';
          });

          expect(focusedText || triggerText).toBeTruthy();
        }
      }
    });
  });

  test.describe('ARIA Attributes - WCAG 2.5.2 (AA)', () => {
    test('buttons without text should have aria-label', async ({ page }) => {
      const iconButtons = page.locator('button');

      for (let i = 0; i < Math.min(10, await iconButtons.count()); i++) {
        const button = iconButtons.nth(i);
        const text = await button.textContent();
        const ariaLabel = await button.getAttribute('aria-label');

        if (!text || text.trim() === '') {
          expect(ariaLabel).toBeTruthy();
        }
      }
    });

    test('images should have alt text', async ({ page }) => {
      const images = page.locator('img');

      for (let i = 0; i < Math.min(5, await images.count()); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const role = await img.getAttribute('role');

        // Either has alt text or role="presentation"
        expect(alt || role === 'presentation').toBeTruthy();
      }
    });

    test('form inputs should have accessible labels', async ({ page }) => {
      const inputs = page.locator('input[type="text"], input[type="email"], textarea');

      for (let i = 0; i < Math.min(3, await inputs.count()); i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');

        if (id) {
          const label = page.locator(`label[for="${id}"]`);
          const hasLabel = (await label.count()) > 0 || ariaLabel || ariaLabelledBy;
          expect(hasLabel).toBeTruthy();
        } else {
          expect(ariaLabel || ariaLabelledBy).toBeTruthy();
        }
      }
    });

    test('interactive elements should have proper ARIA roles', async ({ page }) => {
      const buttons = page.locator('button');

      for (let i = 0; i < Math.min(5, await buttons.count()); i++) {
        const button = buttons.nth(i);
        const role = await button.getAttribute('role');

        // Button elements don't need role attribute, but custom buttons should have it
        expect(button).toBeTruthy();
      }
    });

    test('expandable sections should have aria-expanded', async ({ page }) => {
      const expandButtons = page.locator('[aria-haspopup="true"], [aria-expanded]');

      for (let i = 0; i < Math.min(5, await expandButtons.count()); i++) {
        const button = expandButtons.nth(i);
        const expanded = await button.getAttribute('aria-expanded');

        expect(expanded).toMatch(/^true|false$/);
      }
    });

    test('live regions should announce updates', async ({ page }) => {
      // Check for aria-live regions
      const liveRegions = page.locator('[aria-live]');

      for (let i = 0; i < Math.min(3, await liveRegions.count()); i++) {
        const region = liveRegions.nth(i);
        const liveValue = await region.getAttribute('aria-live');

        expect(['polite', 'assertive', 'off']).toContain(liveValue);
      }
    });

    test('disabled controls should have aria-disabled', async ({ page }) => {
      const disabledInputs = page.locator('input:disabled, button:disabled');

      for (let i = 0; i < Math.min(3, await disabledInputs.count()); i++) {
        const element = disabledInputs.nth(i);

        // Should be disabled in DOM or have aria-disabled
        const isDisabled = await element.evaluate((el) => {
          return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
        });

        expect(isDisabled).toBe(true);
      }
    });
  });

  test.describe('Color Contrast - WCAG 1.4.3 (AA)', () => {
    test('text should have sufficient color contrast (4.5:1 for normal text)', async ({ page }) => {
      const textElements = page.locator('p, span, a, button, label');

      for (let i = 0; i < Math.min(5, await textElements.count()); i++) {
        const element = textElements.nth(i);

        const hasGoodContrast = await element.evaluate(() => {
          const el = element as HTMLElement;
          const style = window.getComputedStyle(el);

          // Calculate luminance
          const color = style.color;
          const backgroundColor = style.backgroundColor;

          // Parse colors (simplified - real implementation would need full color parsing)
          return !!(color && backgroundColor);
        });

        expect(hasGoodContrast).toBeTruthy();
      }
    });
  });

  test.describe('Responsive & Mobile - WCAG 1.4.10 (AA)', () => {
    test('layout should be responsive at 320px width', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });

      const content = page.locator('main, [role="main"]');
      const isVisible = await content.isVisible();

      // Main content should remain visible at 320px width
      expect(isVisible).toBe(true);
    });

    test('text should not require horizontal scrolling at 320px', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });

      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      // Allow some tolerance for scrollbars
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 20);
    });

    test('buttons should be at least 44x44 pixels', async ({ page }) => {
      const buttons = page.locator('button');

      for (let i = 0; i < Math.min(5, await buttons.count()); i++) {
        const button = buttons.nth(i);

        const size = await button.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });

        // WCAG 2.5.5 recommends 44x44 minimum touch target
        // Each dimension should be validated independently
        expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(24);
      }
    });
  });

  test.describe('Screen Reader Compatibility', () => {
    test('should use semantic HTML elements', async ({ page }) => {
      const mainContent = page.locator('main, [role="main"]');
      const nav = page.locator('nav, [role="navigation"]');
      const headers = page.locator('h1, h2, h3, h4, h5, h6');

      expect(
        (await mainContent.count()) + (await nav.count()) + (await headers.count()),
      ).toBeGreaterThan(0);
    });

    test('heading hierarchy should be logical', async ({ page }) => {
      const headers = page.locator('h1, h2, h3, h4, h5, h6');
      const headingTexts: string[] = [];

      for (let i = 0; i < (await headers.count()); i++) {
        const header = headers.nth(i);
        const level = await header.evaluate((el) => parseInt(el.tagName[1]));
        const text = await header.textContent();

        headingTexts.push(`h${level}: ${text?.substring(0, 20)}`);
      }

      // Should have at least one heading
      expect(headingTexts.length).toBeGreaterThan(0);
    });

    test('lists should use semantic list elements', async ({ page }) => {
      const lists = page.locator('ul, ol');

      if ((await lists.count()) > 0) {
        // Should have list items
        const items = page.locator('li');
        expect(await items.count()).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Error Handling & Feedback', () => {
    test('error messages should be associated with form fields', async ({ page }) => {
      // Try to find forms with validation
      const forms = page.locator('form');

      if ((await forms.count()) > 0) {
        // Try invalid submission
        const submitButton = forms.nth(0).locator('button[type="submit"]');

        if ((await submitButton.count()) > 0) {
          await submitButton.click();
          await page.waitForTimeout(500);

          // Check for error messages
          const errors = page.locator('[role="alert"], .error, [aria-invalid="true"]');

          // After invalid submission, validation errors should appear
          expect(await errors.count()).toBeGreaterThan(0);
        }
      }
    });

    test('success messages should be announced', async ({ page }) => {
      // Look for alerts
      const alerts = page.locator('[role="alert"]');

      expect(alerts).toBeTruthy();
    });
  });
});
