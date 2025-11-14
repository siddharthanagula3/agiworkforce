import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

/**
 * Visual regression comparison result
 */
export interface ComparisonResult {
  match: boolean;
  diffPixels: number;
  totalPixels: number;
  similarity: number;
  diffImagePath?: string;
}

/**
 * Screenshot capture and visual regression testing utility
 * Provides utilities for capturing screenshots and comparing them using pixel-level analysis
 */
export class ScreenshotHelper {
  private page: Page;
  private screenshotsDir: string;
  private baselineDir: string;
  private diffsDir: string;
  private failuresDir: string;
  private threshold: number;

  /**
   * Initialize ScreenshotHelper
   * @param page - Playwright page instance
   * @param threshold - Pixel difference threshold for matching (0.0-1.0), default 0.1 (10%)
   */
  constructor(page: Page, threshold: number = 0.1) {
    this.page = page;
    this.threshold = threshold;
    this.screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');
    this.baselineDir = path.join(this.screenshotsDir, 'baseline');
    this.diffsDir = path.join(this.screenshotsDir, 'diffs');
    this.failuresDir = path.join(this.screenshotsDir, 'failures');

    // Ensure all directories exist
    [this.screenshotsDir, this.baselineDir, this.diffsDir, this.failuresDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Capture full page screenshot
   * @param name - Screenshot name
   * @returns Path to captured screenshot
   */
  async captureFullPage(name: string): Promise<string> {
    const filePath = path.join(this.screenshotsDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  /**
   * Capture specific element screenshot
   * @param selector - CSS selector for element
   * @param name - Screenshot name
   * @returns Path to captured screenshot
   */
  async captureElement(selector: string, name: string): Promise<string> {
    const element = await this.page.locator(selector);
    const filePath = path.join(this.screenshotsDir, `${name}-${Date.now()}.png`);
    await element.screenshot({ path: filePath });
    return filePath;
  }

  /**
   * Capture viewport screenshot
   * @param name - Screenshot name
   * @returns Path to captured screenshot
   */
  async captureViewport(name: string): Promise<string> {
    const filePath = path.join(this.screenshotsDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }

  /**
   * Load PNG image from file path
   * @param filePath - Path to PNG file
   * @returns Parsed PNG image data
   * @throws Error if file not found or invalid format
   */
  private loadPNGImage(filePath: string): Promise<PNG> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        reject(new Error(`Screenshot file not found: ${filePath}`));
        return;
      }

      const file = fs.createReadStream(filePath);
      const png = new PNG();

      png.parse(file, (err, data) => {
        if (err) {
          reject(new Error(`Failed to parse PNG file ${filePath}: ${err.message}`));
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Generate diff image from comparison
   * @param baseline - Baseline PNG image
   * @param current - Current PNG image
   * @param diffPixels - Number of different pixels detected
   * @param outputPath - Where to save diff image
   */
  private generateDiffImage(
    baseline: PNG,
    current: PNG,
    diffPixels: number,
    outputPath: string,
  ): void {
    const width = Math.max(baseline.width, current.width);
    const height = Math.max(baseline.height, current.height);
    const diff = new PNG({ width, height });

    // Create pixelmatch comparison image (white = same, red = different)
    pixelmatch(baseline.data, current.data, diff.data, baseline.width, baseline.height, {
      threshold: 0.1,
    });

    const file = fs.createWriteStream(outputPath);
    diff.pack().pipe(file);
  }

  /**
   * Compare visual similarity between baseline and current screenshots
   * Uses pixel-level comparison with configurable threshold
   *
   * @param baselineName - Name of baseline screenshot (without extension)
   * @param currentPath - Full path to current screenshot
   * @returns Comparison result with similarity percentage and optional diff image
   * @throws Error if baseline or current file not found
   */
  async compareVisual(baselineName: string, currentPath: string): Promise<ComparisonResult> {
    const baselinePath = path.join(this.baselineDir, `${baselineName}.png`);

    // Validate files exist
    if (!fs.existsSync(baselinePath)) {
      throw new Error(
        `Baseline screenshot not found: ${baselinePath}. Create baseline with createBaseline() first.`,
      );
    }

    if (!fs.existsSync(currentPath)) {
      throw new Error(`Current screenshot not found: ${currentPath}`);
    }

    try {
      // Load PNG images
      const baseline = await this.loadPNGImage(baselinePath);
      const current = await this.loadPNGImage(currentPath);

      // Validate dimensions match
      if (baseline.width !== current.width || baseline.height !== current.height) {
        console.warn(
          `[Visual Regression] Screenshot dimensions mismatch: ` +
            `baseline ${baseline.width}x${baseline.height}, ` +
            `current ${current.width}x${current.height}`,
        );
      }

      const width = Math.min(baseline.width, current.width);
      const height = Math.min(baseline.height, current.height);
      const totalPixels = width * height;

      // Compare using pixelmatch
      const diffPixels = pixelmatch(baseline.data, current.data, null, width, height, {
        threshold: 0.1,
      });
      const similarity = ((totalPixels - diffPixels) / totalPixels) * 100;
      const match = diffPixels <= totalPixels * this.threshold;

      // Generate diff image if mismatch
      let diffImagePath: string | undefined;
      if (!match) {
        const timestamp = new Date().getTime();
        diffImagePath = path.join(this.diffsDir, `${baselineName}-diff-${timestamp}.png`);
        this.generateDiffImage(baseline, current, diffPixels, diffImagePath);
      }

      const result: ComparisonResult = {
        match,
        diffPixels,
        totalPixels,
        similarity: Math.round(similarity * 100) / 100,
        diffImagePath,
      };

      // Log comparison result
      console.log(
        `[Visual Regression] ${baselineName}: ` +
          `${result.similarity}% similarity, ` +
          `${diffPixels} different pixels${result.diffImagePath ? `, diff saved to ${result.diffImagePath}` : ''}`,
      );

      return result;
    } catch (error) {
      throw new Error(
        `Failed to compare visual regression: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create baseline screenshot for future comparisons
   * @param name - Baseline name (screenshot will be saved as baseline/{name}.png)
   * @returns Path to baseline screenshot
   */
  async createBaseline(name: string): Promise<string> {
    const filePath = path.join(this.baselineDir, `${name}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    console.log(`[Visual Baseline] Created baseline: ${filePath}`);
    return filePath;
  }

  /**
   * Capture screenshot on test failure for debugging
   * @param testName - Name of the test that failed
   * @returns Path to failure screenshot
   */
  async captureOnFailure(testName: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(this.failuresDir, `${testName}-${timestamp}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    console.log(`[Visual Failure] Captured failure screenshot: ${filePath}`);
    return filePath;
  }

  /**
   * Clean up old screenshots, keeping only the most recent
   * @param maxScreenshots - Maximum screenshots to keep (default: 100)
   */
  async cleanup(maxScreenshots: number = 100): Promise<void> {
    const cleanupDir = async (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir);
      const screenshots = files
        .filter((f) => f.endsWith('.png'))
        .map((f) => ({
          name: f,
          time: fs.statSync(path.join(dir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      if (screenshots.length > maxScreenshots) {
        const toDelete = screenshots.slice(maxScreenshots);
        for (const screenshot of toDelete) {
          fs.unlinkSync(path.join(dir, screenshot.name));
        }
        console.log(`[Visual Cleanup] Deleted ${toDelete.length} old screenshots from ${dir}`);
      }
    };

    // Clean up different directories
    await cleanupDir(this.screenshotsDir);
    await cleanupDir(this.diffsDir);
    await cleanupDir(this.failuresDir);
  }

  /**
   * Update baseline with current screenshot (use when visual changes are intentional)
   * @param name - Baseline name
   * @param currentPath - Path to current screenshot to use as new baseline
   */
  async updateBaseline(name: string, currentPath: string): Promise<string> {
    const baselinePath = path.join(this.baselineDir, `${name}.png`);

    if (!fs.existsSync(currentPath)) {
      throw new Error(`Current screenshot not found: ${currentPath}`);
    }

    fs.copyFileSync(currentPath, baselinePath);
    console.log(`[Visual Baseline] Updated baseline: ${baselinePath}`);
    return baselinePath;
  }
}
