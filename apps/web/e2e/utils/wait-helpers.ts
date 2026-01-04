import { Page } from '@playwright/test';

/**
 * Wait for the page URL to match a pattern or string
 * Useful for confirming navigation after checkout or redirects
 */
export async function waitForUrl(
  page: Page,
  pattern: RegExp | string,
  timeout: number = 10000,
): Promise<void> {
  try {
    if (typeof pattern === 'string') {
      // Wait for exact URL match
      await page.waitForURL(pattern, { timeout });
    } else {
      // Wait for URL matching regex pattern
      await page.waitForURL(pattern, { timeout });
    }
  } catch (error) {
    throw new Error(
      `URL did not match expected pattern within ${timeout}ms. Current URL: ${page.url()}`,
    );
  }
}

/**
 * Wait for network to be idle (no pending requests)
 * Useful after page interactions to ensure all data is loaded
 */
export async function waitForNetworkIdle(page: Page, timeout: number = 10000): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (error) {
    throw new Error(`Network did not reach idle state within ${timeout}ms`);
  }
}

/**
 * Poll a function until a condition is met
 * Uses exponential backoff to reduce request load
 *
 * @param fn - Async function to poll
 * @param condition - Function that returns true when condition is met
 * @param timeout - Total timeout in milliseconds
 * @param interval - Initial interval between polls in milliseconds (default: 1000ms)
 * @returns The result of fn when condition is met
 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  timeout: number = 30000,
  interval: number = 1000,
): Promise<T> {
  const startTime = Date.now();
  let lastError: Error | null = null;
  let currentInterval = interval;
  const maxInterval = Math.min(timeout / 4, 5000); // Cap max interval at 5 seconds or 1/4 of timeout

  while (Date.now() - startTime < timeout) {
    try {
      const result = await fn();

      if (condition(result)) {
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue polling on error
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, currentInterval));

    // Increase interval with exponential backoff
    currentInterval = Math.min(currentInterval * 1.5, maxInterval);
  }

  const elapsedTime = Date.now() - startTime;
  const errorMessage = lastError ? ` Last error: ${lastError.message}` : '';
  throw new Error(
    `Condition not met after ${elapsedTime}ms (timeout: ${timeout}ms).${errorMessage}`,
  );
}

/**
 * Wait for a specific element to be visible on the page
 * Useful for waiting for dynamic content to appear
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = 10000,
): Promise<void> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
  } catch (error) {
    throw new Error(`Element "${selector}" did not become visible within ${timeout}ms`);
  }
}

/**
 * Wait for a specific element to be hidden or removed
 */
export async function waitForElementHidden(
  page: Page,
  selector: string,
  timeout: number = 10000,
): Promise<void> {
  try {
    await page.waitForSelector(selector, { state: 'hidden', timeout });
  } catch (error) {
    throw new Error(`Element "${selector}" did not become hidden within ${timeout}ms`);
  }
}

/**
 * Wait for navigation to complete (useful after clicking links)
 */
export async function waitForNavigation(page: Page, timeout: number = 10000): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (error) {
    throw new Error(`Navigation did not complete within ${timeout}ms`);
  }
}

/**
 * Wait for a response from the network matching a predicate
 * Useful for confirming API calls were made
 */
export async function waitForResponse(
  page: Page,
  predicate: (response: any) => boolean,
  timeout: number = 10000,
): Promise<any> {
  const response = await page.waitForResponse((resp) => predicate(resp), { timeout });

  if (!response) {
    throw new Error(`No response matched predicate within ${timeout}ms`);
  }

  return response;
}

/**
 * Wait for a request from the network matching a predicate
 * Useful for confirming API calls are being made with correct parameters
 */
export async function waitForRequest(
  page: Page,
  predicate: (request: any) => boolean,
  timeout: number = 10000,
): Promise<any> {
  const request = await page.waitForRequest((req) => predicate(req), { timeout });

  if (!request) {
    throw new Error(`No request matched predicate within ${timeout}ms`);
  }

  return request;
}

/**
 * Wait for a function to complete within a timeout
 * Useful for waiting for async operations
 */
export async function waitForAsync<T>(fn: () => Promise<T>, timeout: number = 30000): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout),
  );

  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Create a delay/sleep function
 * Useful for waiting between actions
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
