#!/usr/bin/env node

/**
 * Accessibility Audit Script
 * WCAG 2.1 AA Compliance Checker using axe-core
 *
 * Run with: pnpm a11y:audit
 * Requires: @axe-core/playwright, playwright, fs
 */

import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, '../reports');

// Ensure reports directory exists
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

async function auditPage(url, pageName) {
  console.log(`\n🔍 Auditing: ${pageName} (${url})`);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate with a reasonable timeout
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
      console.warn(`⚠️  Page load took longer than expected, proceeding with audit...`);
    });

    // Wait a bit for dynamic content to load
    await page.waitForTimeout(2000);

    // Run axe accessibility audit
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    await browser.close();

    return {
      pageName,
      url,
      timestamp: new Date().toISOString(),
      violations: results.violations,
      passes: results.passes,
      incomplete: results.incomplete,
      inapplicable: results.inapplicable,
      summary: {
        totalViolations: results.violations.length,
        totalPasses: results.passes.length,
        critical: results.violations.filter((v) => v.impact === 'critical').length,
        serious: results.violations.filter((v) => v.impact === 'serious').length,
        moderate: results.violations.filter((v) => v.impact === 'moderate').length,
        minor: results.violations.filter((v) => v.impact === 'minor').length,
      },
    };
  } catch (error) {
    await browser.close();
    console.error(`❌ Error auditing ${pageName}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting AGI Workforce Accessibility Audit (WCAG 2.1 AA)');
  console.log('='.repeat(60));

  // Pages to audit (update these based on your site structure)
  const pagesToAudit = [
    { url: 'http://localhost:3000/', name: 'Home' },
    { url: 'http://localhost:3000/chat', name: 'Chat' },
    { url: 'http://localhost:3000/pricing', name: 'Pricing' },
    { url: 'http://localhost:3000/features/agents', name: 'Features - Agents' },
    { url: 'http://localhost:3000/download', name: 'Download' },
  ];

  const allResults = [];

  for (const { url, name } of pagesToAudit) {
    try {
      const result = await auditPage(url, name);
      allResults.push(result);

      // Print summary for this page
      const { summary } = result;
      console.log(
        `  ✓ Results: ${summary.totalViolations} violations, ${summary.totalPasses} passes`,
      );
      if (summary.critical > 0) console.log(`    🔴 CRITICAL: ${summary.critical}`);
      if (summary.serious > 0) console.log(`    🟠 SERIOUS: ${summary.serious}`);
      if (summary.moderate > 0) console.log(`    🟡 MODERATE: ${summary.moderate}`);
      if (summary.minor > 0) console.log(`    🔵 MINOR: ${summary.minor}`);
    } catch (error) {
      console.error(`❌ Failed to audit ${name}`);
    }
  }

  // Save detailed JSON report
  const jsonReportPath = path.join(
    reportsDir,
    `a11y-report-${new Date().toISOString().split('T')[0]}.json`,
  );
  fs.writeFileSync(jsonReportPath, JSON.stringify(allResults, null, 2));
  console.log(`\n📄 Full report saved to: ${jsonReportPath}`);

  // Generate summary statistics
  const totalViolations = allResults.reduce((sum, r) => sum + r.summary.totalViolations, 0);
  const totalPasses = allResults.reduce((sum, r) => sum + r.summary.totalPasses, 0);
  const criticalIssues = allResults.reduce((sum, r) => sum + r.summary.critical, 0);

  console.log('\n📊 Overall Summary');
  console.log('='.repeat(60));
  console.log(`Total Pages Audited: ${allResults.length}`);
  console.log(`Total Violations: ${totalViolations}`);
  console.log(`Total Passes: ${totalPasses}`);
  console.log(`Critical Issues: ${criticalIssues}`);

  if (totalViolations === 0) {
    console.log('\n✅ WCAG 2.1 AA Compliant!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Accessibility violations found. See report for details.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
