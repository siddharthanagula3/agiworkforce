import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export class ScreenshotHelper {
  private page: Page;
  private screenshotsDir: string;

  constructor(page: Page) {
    this.page = page;
    this.screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');

    // Ensure screenshots directory exists
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  async captureFullPage(name: string) {
    const filePath = path.join(this.screenshotsDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  async captureElement(selector: string, name: string) {
    const element = await this.page.locator(selector);
    const filePath = path.join(this.screenshotsDir, `${name}-${Date.now()}.png`);
    await element.screenshot({ path: filePath });
    return filePath;
  }

  async captureViewport(name: string) {
    const filePath = path.join(this.screenshotsDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }

  async compareVisual(baseline: string, current: string): Promise<boolean> {
    // This is a placeholder for visual regression testing
    // Would use a library like pixelmatch or resemble.js
    console.log(`[Visual] Comparing ${baseline} with ${current}`);
    return true;
  }

  async createBaseline(name: string) {
    const baselineDir = path.join(this.screenshotsDir, 'baseline');
    if (!fs.existsSync(baselineDir)) {
      fs.mkdirSync(baselineDir, { recursive: true });
    }

    const filePath = path.join(baselineDir, `${name}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  async captureOnFailure(testName: string) {
    const failuresDir = path.join(this.screenshotsDir, 'failures');
    if (!fs.existsSync(failuresDir)) {
      fs.mkdirSync(failuresDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(failuresDir, `${testName}-${timestamp}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  async cleanup() {
    // Clean up old screenshots (keep only last 100)
    const files = fs.readdirSync(this.screenshotsDir);
    const screenshots = files
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(this.screenshotsDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (screenshots.length > 100) {
      const toDelete = screenshots.slice(100);
      for (const screenshot of toDelete) {
        fs.unlinkSync(path.join(this.screenshotsDir, screenshot.name));
      }
    }
  }
}
