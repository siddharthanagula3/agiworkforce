import type { Page, Response } from '@playwright/test';

const NOT_FOUND_HEADING = /^404$/;

export async function routeIsServed(page: Page, response: Response | null): Promise<boolean> {
  if (response?.status() === 404) return false;
  return (await page.locator('h1', { hasText: NOT_FOUND_HEADING }).count()) === 0;
}
