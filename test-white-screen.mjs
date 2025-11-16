#!/usr/bin/env node

/**
 * Automated White Screen Test
 *
 * Uses Playwright to verify the AGI Workforce app loads correctly in web mode.
 * This script:
 * 1. Launches a headless browser
 * 2. Navigates to the Vite dev server
 * 3. Checks for console errors
 * 4. Verifies key UI elements render
 * 5. Takes screenshots for visual verification
 * 6. Reports results
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const VITE_URL = 'http://localhost:5179';
const TIMEOUT = 30000;

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

async function testWhiteScreen() {
  const results = {
    timestamp: new Date().toISOString(),
    passed: false,
    errors: [],
    warnings: [],
    consoleErrors: [],
    elementsFound: {},
    screenshots: [],
  };

  let browser = null;
  let page = null;

  try {
    logStep('1', 'Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-gpu', '--no-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    page = await context.newPage();
    logSuccess('Browser launched');

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const errorText = msg.text();
        results.consoleErrors.push(errorText);
        logError(`Console error: ${errorText}`);
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      results.errors.push(error.message);
      logError(`Page error: ${error.message}`);
    });

    logStep('2', `Navigating to ${VITE_URL}...`);
    try {
      await page.goto(VITE_URL, {
        waitUntil: 'networkidle',
        timeout: TIMEOUT,
      });
      logSuccess('Page loaded');
    } catch (error) {
      throw new Error(`Failed to load page: ${error.message}`);
    }

    // Wait for React to mount
    logStep('3', 'Waiting for React app to mount...');
    await page.waitForTimeout(2000);

    // Check if page is blank (white screen)
    logStep('4', 'Checking for white screen...');
    const bodyText = await page.textContent('body');
    const hasContent = bodyText && bodyText.trim().length > 10;

    if (!hasContent) {
      results.errors.push('Page appears to be blank (white screen detected)');
      logError('WHITE SCREEN DETECTED - No content rendered');
    } else {
      logSuccess('Page has content');
    }

    // Check for root element
    logStep('5', 'Verifying root element...');
    const rootElement = await page.$('#root');
    if (rootElement) {
      logSuccess('Root element found');
      results.elementsFound.root = true;

      const rootContent = await rootElement.textContent();
      if (rootContent && rootContent.trim().length > 0) {
        logSuccess(`Root has content (${rootContent.length} chars)`);
      }
    } else {
      results.errors.push('Root element (#root) not found');
      logError('Root element missing');
    }

    // Check for key UI components
    logStep('6', 'Checking for key UI components...');

    const selectors = {
      devBanner: 'text=Web Development Mode',
      titleBar: '[class*="title"]',
      sidebar: '[class*="sidebar"]',
      mainContent: 'main',
      missionControl: 'text=Mission Control',
      chatInterface: '[class*="chat"]',
    };

    for (const [name, selector] of Object.entries(selectors)) {
      const element = await page.$(selector);
      results.elementsFound[name] = !!element;

      if (element) {
        logSuccess(`Found: ${name}`);
      } else {
        logWarning(`Not found: ${name}`);
      }
    }

    // Take screenshots
    logStep('7', 'Capturing screenshots...');

    const screenshotPath = join(process.cwd(), 'test-results');

    const fullPagePath = join(screenshotPath, 'fullpage.png');
    await page.screenshot({
      path: fullPagePath,
      fullPage: true,
    });
    results.screenshots.push(fullPagePath);
    logSuccess(`Full page: ${fullPagePath}`);

    const viewportPath = join(screenshotPath, 'viewport.png');
    await page.screenshot({
      path: viewportPath,
    });
    results.screenshots.push(viewportPath);
    logSuccess(`Viewport: ${viewportPath}`);

    // Check for runtime errors in window
    logStep('8', 'Checking for JavaScript errors...');
    const jsErrors = await page.evaluate(() => {
      // Check if window has error properties
      return {
        hasErrors: window.__hasRuntimeErrors || false,
        errorCount: window.__runtimeErrors?.length || 0,
      };
    });

    if (jsErrors.errorCount > 0) {
      results.warnings.push(`${jsErrors.errorCount} JavaScript runtime errors detected`);
      logWarning(`${jsErrors.errorCount} runtime errors found`);
    }

    // Final assessment
    logStep('9', 'Analyzing results...');

    const criticalElements = ['root', 'mainContent', 'devBanner'];
    const foundCritical = criticalElements.every((el) => results.elementsFound[el]);

    results.passed = results.errors.length === 0 && foundCritical && hasContent;

    if (results.passed) {
      logSuccess('ALL CHECKS PASSED - App is working!');
    } else {
      logError('TESTS FAILED - Issues detected');
    }
  } catch (error) {
    results.errors.push(error.message);
    logError(`Test failed: ${error.message}`);

    // Take error screenshot
    if (page) {
      try {
        const errorPath = join(process.cwd(), 'test-results', 'error.png');
        await page.screenshot({ path: errorPath });
        results.screenshots.push(errorPath);
        logWarning(`Error screenshot saved: ${errorPath}`);
      } catch (screenshotError) {
        logWarning(`Could not capture error screenshot: ${screenshotError.message}`);
      }
    }
  } finally {
    if (browser) {
      await browser.close();
      logSuccess('Browser closed');
    }
  }

  // Save detailed report
  logStep('10', 'Generating report...');
  const reportPath = join(process.cwd(), 'test-results', 'test-report.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  logSuccess(`Report saved: ${reportPath}`);

  // Print summary
  log('\n' + '='.repeat(60), 'bright');
  log('TEST SUMMARY', 'bright');
  log('='.repeat(60), 'bright');

  log(`\nStatus: ${results.passed ? 'PASSED ✓' : 'FAILED ✗'}`, results.passed ? 'green' : 'red');

  log(`\nElements Found:`);
  for (const [name, found] of Object.entries(results.elementsFound)) {
    log(`  ${found ? '✓' : '✗'} ${name}`, found ? 'green' : 'yellow');
  }

  if (results.errors.length > 0) {
    log(`\nErrors (${results.errors.length}):`, 'red');
    results.errors.forEach((err) => log(`  • ${err}`, 'red'));
  }

  if (results.warnings.length > 0) {
    log(`\nWarnings (${results.warnings.length}):`, 'yellow');
    results.warnings.forEach((warn) => log(`  • ${warn}`, 'yellow'));
  }

  if (results.consoleErrors.length > 0) {
    log(`\nConsole Errors (${results.consoleErrors.length}):`, 'red');
    results.consoleErrors.slice(0, 5).forEach((err) => log(`  • ${err}`, 'red'));
    if (results.consoleErrors.length > 5) {
      log(`  ... and ${results.consoleErrors.length - 5} more`, 'yellow');
    }
  }

  log(`\nScreenshots:`);
  results.screenshots.forEach((path) => log(`  • ${path}`, 'cyan'));

  log('\n' + '='.repeat(60) + '\n', 'bright');

  // Exit with appropriate code
  process.exit(results.passed ? 0 : 1);
}

// Run the test
log('\nAGI Workforce - White Screen Test', 'bright');
log('Starting automated verification...\n', 'cyan');

testWhiteScreen().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
