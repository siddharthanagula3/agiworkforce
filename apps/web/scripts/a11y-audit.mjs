#!/usr/bin/env node

import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reportsDirectory = path.join(scriptDirectory, '../reports');
const baseUrl = (process.env['A11Y_BASE_URL'] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const colorSchemes = ['light', 'dark'];

// This runner has no session, so every entry must be reachable signed out: proxy.ts sends
// /chat, /library, /schedules, /settings, /billing and /admin to /login, and a redirected
// audit silently reports the login wall under the requested route's name. The list is shared
// with /accessibility so the published scope cannot drift from what is actually scanned.
export const auditedPages = JSON.parse(
  fs.readFileSync(path.join(scriptDirectory, '../lib/a11y/audited-routes.json'), 'utf8'),
);

export function findUnexpectedRedirect(requestedUrl, landedUrl) {
  const requestedPath = new URL(requestedUrl).pathname.replace(/\/+$/, '') || '/';
  const landedPath = new URL(landedUrl).pathname.replace(/\/+$/, '') || '/';
  return requestedPath === landedPath ? null : landedPath;
}

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

/** @returns {Promise<Record<string, unknown>>} */
export async function auditPage(browser, pageDefinition, colorScheme) {
  const context = await browser.newContext({ colorScheme, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const url = new URL(pageDefinition.path, `${baseUrl}/`).toString();

  try {
    console.log(`Auditing ${pageDefinition.name} (${colorScheme}): ${url}`);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!response || !response.ok()) {
      throw new Error(`Navigation returned ${response?.status() ?? 'no response'}`);
    }
    const redirectedTo = findUnexpectedRedirect(url, page.url());
    if (redirectedTo) {
      throw new Error(
        `Navigation redirected to ${redirectedTo}; ${pageDefinition.path} was never audited`,
      );
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

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
