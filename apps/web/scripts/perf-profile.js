#!/usr/bin/env node

/**
 * Performance Profiling Script
 *
 * Runs Lighthouse performance audit on the web app and generates a report.
 * Usage: node scripts/perf-profile.js [url] [output-dir]
 *
 * Default:
 * - URL: http://localhost:3000
 * - Output: ./perf-results
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_URL = process.env.PERF_TEST_URL || 'http://localhost:3000';
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'perf-results');
const OUTPUT_PATH = path.join(DEFAULT_OUTPUT_DIR, `lighthouse-${Date.now()}.json`);

// Create output directory if it doesn't exist
if (!fs.existsSync(DEFAULT_OUTPUT_DIR)) {
  fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
}

console.log('[Lighthouse] Starting performance audit...');
console.log(`  URL: ${DEFAULT_URL}`);
console.log(`  Output: ${OUTPUT_PATH}`);

const result = spawnSync('npx', [
  'lighthouse',
  DEFAULT_URL,
  '--output=json',
  '--output-path=' + OUTPUT_PATH,
  '--chrome-flags="--headless"',
  '--throttling-method=simulate',
  '--cpu-throttle-multiplier=1',
]);

if (result.error) {
  console.error('[Lighthouse] Error running audit:', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('[Lighthouse] Audit failed with exit code:', result.status);
  if (result.stderr) {
    console.error('[Lighthouse] stderr:', result.stderr.toString());
  }
  process.exit(1);
}

// Parse results and generate summary
try {
  const reportJson = fs.readFileSync(OUTPUT_PATH, 'utf8');
  const report = JSON.parse(reportJson);

  const scores = report.categories;
  const metrics = report.audits;

  // Format scores
  const formattedScores = Object.entries(scores)
    .map(([name, data]) => {
      const percentage = Math.round(data.score * 100);
      const status = percentage >= 90 ? '✅' : percentage >= 50 ? '⚠️' : '❌';
      return `  ${status} ${name.charAt(0).toUpperCase() + name.slice(1)}: ${percentage}`;
    })
    .join('\n');

  // Key metrics
  const keyMetrics = {
    'Largest Contentful Paint': metrics['largest-contentful-paint']?.numericValue,
    'First Input Delay': metrics['first-input-delay']?.numericValue,
    'Cumulative Layout Shift': metrics['cumulative-layout-shift']?.numericValue,
    'Total Blocking Time': metrics['total-blocking-time']?.numericValue,
    'Interaction to Next Paint': metrics['interaction-to-next-paint']?.numericValue,
  };

  console.log('\n[Lighthouse] Audit Complete\n');
  console.log('Scores:');
  console.log(formattedScores);
  console.log('\nKey Metrics:');
  Object.entries(keyMetrics).forEach(([name, value]) => {
    if (value !== undefined) {
      const unit = name.includes('Paint') || name.includes('Delay') ? 'ms' : 'score';
      console.log(`  ${name}: ${value.toFixed(2)} ${unit}`);
    }
  });

  console.log(`\nFull report saved to: ${OUTPUT_PATH}`);

  // Also generate a summary JSON
  const summaryPath = path.join(DEFAULT_OUTPUT_DIR, 'summary.json');
  const summary = {
    timestamp: new Date().toISOString(),
    url: DEFAULT_URL,
    scores,
    metrics: Object.fromEntries(Object.entries(keyMetrics).map(([k, v]) => [k, v?.toFixed(2)])),
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Summary saved to: ${summaryPath}`);
} catch (err) {
  console.error('[Lighthouse] Error parsing results:', err);
  process.exit(1);
}
