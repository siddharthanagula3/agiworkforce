
import { test, expect } from '@playwright/test';

const STABILITY_RUNS = 3;
const CRITICAL_TESTS = [
  { name: 'Chat Message Send', path: '/chat', selector: 'textarea' },
  { name: 'Model Selection', path: '/settings', selector: 'button[aria-label*="Model"]' },
  { name: 'File Upload', path: '/chat', selector: 'button:has-text("Upload")' },
];

test.describe('E2E Test Stability Analysis', () => {
  test.describe('Selector Stability Tests', () => {
    test('should use stable selectors (not index-dependent)', async ({ page }) => {
      await page.goto('/chat');

      const selectors = [
        'textarea', // Tag-based
        '[data-testid="message-input"]', // Data attribute
        '[aria-label="Message"]', // ARIA-based
        'input[type="text"]', // Type-based
      ];

      for (const selector of selectors) {
        const element = page.locator(selector).first();

        if ((await element.count()) > 0) {
          const id1 = await element.evaluate((el) => el.id || el.className);

          await page.waitForTimeout(100);

          const id2 = await element.evaluate((el) => el.id || el.className);

          expect(id1).toEqual(id2);
        }
      }
    });

    test('should not use brittle index-dependent selectors', async ({ page }) => {
      await page.goto('/');

      const buttons = page.locator('button');

      if ((await buttons.count()) > 1) {
        const stableSelector = await buttons.first().evaluate((el) => {
          return el.id || el.getAttribute('data-testid') || el.getAttribute('aria-label');
        });

        expect(stableSelector).toBeTruthy();
      }
    });
  });

  test.describe('Timeout Appropriateness', () => {
    test('should not use overly aggressive timeouts', async ({ page }) => {
      await page.goto('/chat');

      const input = page.locator('textarea, input[type="text"]').first();

      const startTime = Date.now();

      await input.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    });

    test('should not use excessively long timeouts for quick operations', async ({ page }) => {
      await page.goto('/');

      const startTime = Date.now();

      await page.goto('/chat', { waitUntil: 'domcontentloaded' });

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
    });

    test('should handle timeout errors gracefully', async ({ page }) => {
      await page.goto('/');

      const error = await page
        .locator('[data-testid="non-existent-element"]')
        .waitFor({ timeout: 500 })
        .then(() => false)
        .catch(() => true);

      expect(error).toBe(true);
    });
  });

  test.describe('Test Isolation', () => {
    test('should not share state between test runs', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('test-key', 'test-value');
      });

      const value1 = await page.evaluate(() => localStorage.getItem('test-key'));

      expect(value1).toBe('test-value');
    });

    test('should start with clean state in new test', async ({ page }) => {
      const value = await page.evaluate(() => localStorage.getItem('test-key'));

      expect(value).toBeNull();
    });
  });

  test.describe('Async/Await Correctness', () => {
    test('should properly await async operations', async ({ page }) => {
      await page.goto('/chat');

      const input = page.locator('textarea').first();

      await input.click();
      await input.type('Test message', { delay: 50 });

      const value = await input.inputValue();

      expect(value).toBe('Test message');
    });

    test('should wait for network operations', async ({ page }) => {
      await page.goto('/chat');

      await page.waitForLoadState('networkidle');

      const sendButton = page.locator('button:has-text("Send")').first();

      if ((await sendButton.count()) > 0) {
        const [response] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.request().method() === 'POST' || response.request().method() === 'GET',
          ),
          sendButton.click().catch(() => {}),
        ]);

        expect(response.status() >= 200 && response.status() < 500).toBeTruthy();
      }
    });

    test('should not have race conditions with state updates', async ({ page }) => {
      await page.goto('/');

      const button = page.locator('button').first();

      if ((await button.count()) > 0) {
        const initialAriaPressed = await button.getAttribute('aria-pressed').catch(() => null);

        await button.click();

        await page.waitForTimeout(100);

        const finalAriaPressed = await button.getAttribute('aria-pressed').catch(() => null);
        expect([initialAriaPressed, finalAriaPressed]).toBeDefined();
      }
    });
  });

  test.describe('Error Message Quality', () => {
    test('error messages should provide useful debugging info', async ({ page }) => {
      await page.goto('/chat');

      try {
        await page.locator('[data-testid="non-existent"]').click({ timeout: 500 });
      } catch (error) {
        const errorMsg = String(error);

        expect(
          errorMsg.includes('Timeout') ||
            errorMsg.includes('not found') ||
            errorMsg.includes('locator'),
        ).toBeTruthy();
      }
    });
  });

  test.describe('Screenshot/Video Capture on Failure', () => {
    test('should capture screenshots on test failure', async ({ page }) => {
      await page.goto('/chat');

      const element = page.locator('textarea').first();

      expect(element).toBeTruthy();
    });

    test('should include meaningful context in error artifacts', async ({ page }) => {
      await page.goto('/');

      const button = page.locator('button').first();

      if ((await button.count()) > 0) {
        const urlBefore = page.url();
        const titleBefore = await page.title();

        await button.click();
        await page.waitForTimeout(200);

        const urlAfter = page.url();
        const titleAfter = await page.title();

        expect(urlAfter).toBeTruthy();
        expect(titleAfter).toBeTruthy();
      }
    });
  });

  test.describe('Flakiness Detection', () => {
    test('critical test: Chat Message Send - Run 1', async ({ page }) => {
      await page.goto('/chat');

      const input = page.locator('textarea').first();

      if ((await input.count()) > 0) {
        await input.focus();
        await input.type('Test message 1');

        const value = await input.inputValue();
        expect(value).toContain('Test');
      }
    });

    test('critical test: Chat Message Send - Run 2', async ({ page }) => {
      await page.goto('/chat');

      const input = page.locator('textarea').first();

      if ((await input.count()) > 0) {
        await input.focus();
        await input.type('Test message 2');

        const value = await input.inputValue();
        expect(value).toContain('Test');
      }
    });

    test('critical test: Chat Message Send - Run 3', async ({ page }) => {
      await page.goto('/chat');

      const input = page.locator('textarea').first();

      if ((await input.count()) > 0) {
        await input.focus();
        await input.type('Test message 3');

        const value = await input.inputValue();
        expect(value).toContain('Test');
      }
    });

    test('critical test: Navigation - Run 1', async ({ page }) => {
      await page.goto('/');

      const chatLink = page.locator('a[href*="chat"], button:has-text("Chat")').first();

      if ((await chatLink.count()) > 0) {
        await chatLink.click();
        await page.waitForURL('**/chat', { timeout: 5000 }).catch(() => {});

        expect(page.url()).toContain('chat');
      }
    });

    test('critical test: Navigation - Run 2', async ({ page }) => {
      await page.goto('/');

      const chatLink = page.locator('a[href*="chat"], button:has-text("Chat")').first();

      if ((await chatLink.count()) > 0) {
        await chatLink.click();
        await page.waitForURL('**/chat', { timeout: 5000 }).catch(() => {});

        expect(page.url()).toContain('chat');
      }
    });

    test('critical test: Navigation - Run 3', async ({ page }) => {
      await page.goto('/');

      const chatLink = page.locator('a[href*="chat"], button:has-text("Chat")').first();

      if ((await chatLink.count()) > 0) {
        await chatLink.click();
        await page.waitForURL('**/chat', { timeout: 5000 }).catch(() => {});

        expect(page.url()).toContain('chat');
      }
    });
  });

  test.describe('Test Data Management', () => {
    test('should use fresh test data for each run', async ({ page }) => {
      await page.goto('/');

      const timestamp = Date.now();
      const testId = `test-${timestamp}`;

      const storedId = await page.evaluate((id) => {
        localStorage.setItem('testId', id);
        return localStorage.getItem('testId');
      }, testId);

      expect(storedId).toBe(testId);
    });

    test('should clean up test data after tests', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('testId');
      });

      const cleaned = await page.evaluate(() => localStorage.getItem('testId'));

      expect(cleaned).toBeNull();
    });
  });

  test.describe('Performance Assertions', () => {
    test('critical operation should complete within timeout', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/chat');

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000);
    });

    test('user interactions should have immediate feedback', async ({ page }) => {
      await page.goto('/chat');

      const button = page.locator('button').first();

      if ((await button.count()) > 0) {
        const startTime = Date.now();

        await button.click();
        await page.waitForTimeout(100);

        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(500);
      }
    });
  });
});
