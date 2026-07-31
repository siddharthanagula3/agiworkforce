#!/usr/bin/env node

/**
 * Blocking WCAG 2.1 A/AA audit for public Web routes.
 *
 * Start the Web app first, then run `pnpm a11y:audit`. CI supplies the
 * production server URL through A11Y_BASE_URL. Navigation failures and empty
 * audit runs fail closed so this command can never report a false green.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reportsDirectory = path.join(scriptDirectory, '../reports');
const baseUrl = (process.env['A11Y_BASE_URL'] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const colorSchemes = ['light', 'dark'];
const auditedPages = [
  { path: '/', name: 'Home' },
  { path: '/chat', name: 'Chat' },
  { path: '/pricing', name: 'Pricing' },
  { path: '/features/agents', name: 'Features - Agents' },
  { path: '/download', name: 'Download' },
];

function summarize(violations, passes) {
  return {
    totalViolations: violations.length,
    totalPasses: passes.length,
    critical: violations.filter((violation) => violation.impact === 'critical').length,
    serious: violations.filter((violation) => violation.impact === 'serious').length,
    moderate: violations.filter((violation) => violation.impact === 'moderate').length,
    minor: violations.filter((violation) => violation.impact === 'minor').length,
  };
}

async function auditPage(browser, pageDefinition, colorScheme) {
  const context = await browser.newContext({ colorScheme, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const url = new URL(pageDefinition.path, `${baseUrl}/`).toString();

  try {
    console.log(`Auditing ${pageDefinition.name} (${colorScheme}): ${url}`);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!response || !response.ok()) {
      throw new Error(`Navigation returned ${response?.status() ?? 'no response'}`);
    }
    await page.locator('body').waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      await document.fonts?.ready;
    });

    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    return {
      pageName: pageDefinition.name,
      colorScheme,
      url,
      timestamp: new Date().toISOString(),
      violations: results.violations,
      passes: results.passes,
      incomplete: results.incomplete,
      inapplicable: results.inapplicable,
      summary: summarize(results.violations, results.passes),
    };
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(reportsDirectory, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  const failures = [];

  try {
    for (const colorScheme of colorSchemes) {
      for (const pageDefinition of auditedPages) {
        try {
          const result = await auditPage(browser, pageDefinition, colorScheme);
          results.push(result);
          console.log(
            `  ${result.summary.totalViolations} violation(s), ${result.summary.totalPasses} pass(es)`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push({
            pageName: pageDefinition.name,
            path: pageDefinition.path,
            colorScheme,
            message,
          });
          console.error(`  Audit failed: ${message}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    baseUrl,
    generatedAt: new Date().toISOString(),
    wcagTags,
    colorSchemes,
    results,
    failures,
  };
  const reportPath = path.join(reportsDirectory, 'a11y-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const totalViolations = results.reduce(
    (total, result) => total + result.summary.totalViolations,
    0,
  );
  const expectedAudits = auditedPages.length * colorSchemes.length;
  console.log(
    `Audited ${results.length}/${expectedAudits} page/theme combinations; ${totalViolations} violation(s); ${failures.length} audit failure(s).`,
  );
  console.log(`Report: ${reportPath}`);

  if (results.length !== expectedAudits || failures.length > 0 || totalViolations > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
