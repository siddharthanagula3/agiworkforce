import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  compareToBaseline,
  describeComparison,
  dominantColor,
  fillWith,
} from './utils/visual-diff';

const baselinePath = path.resolve(
  import.meta.dirname,
  'visual-baselines',
  'desktop-cloud-sign-in.png',
);

function readBaseline(): PNG {
  return PNG.sync.read(fs.readFileSync(baselinePath));
}

test('Desktop cloud sign-in matches its reviewed pixel baseline', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
  await page.addStyleTag({
    content: '* { caret-color: transparent !important; }',
  });

  const actualPath = testInfo.outputPath('desktop-cloud-sign-in-actual.png');
  await page.screenshot({
    path: actualPath,
    fullPage: true,
    animations: 'disabled',
  });

  if (process.env['UPDATE_VISUAL_BASELINES'] === '1') {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.copyFileSync(actualPath, baselinePath);
  }

  expect(
    fs.existsSync(baselinePath),
    `Missing reviewed visual baseline: ${baselinePath}. Regenerate it locally with UPDATE_VISUAL_BASELINES=1 and review the PNG before committing.`,
  ).toBe(true);

  const baseline = readBaseline();
  const actual = PNG.sync.read(fs.readFileSync(actualPath));

  expect(
    { width: actual.width, height: actual.height },
    'The rendered viewport dimensions changed; review and explicitly update the visual baseline.',
  ).toEqual({ width: baseline.width, height: baseline.height });

  const comparison = compareToBaseline(baseline, actual);

  if (!comparison.withinBudget) {
    const diffPath = testInfo.outputPath('desktop-cloud-sign-in-diff.png');
    fs.writeFileSync(diffPath, PNG.sync.write(comparison.diff));
    await testInfo.attach('visual-diff', {
      path: diffPath,
      contentType: 'image/png',
    });
    // The reviewed baseline can only be refreshed from a render produced by the
    // environment the gate runs in, so ship the exact bytes with the report.
    await testInfo.attach('visual-actual', {
      path: actualPath,
      contentType: 'image/png',
    });
  }

  expect(comparison.withinBudget, describeComparison(comparison)).toBe(true);
});

test('The visual budget rejects a render that lost every element on the page', () => {
  const baseline = readBaseline();
  const erased = fillWith(baseline.width, baseline.height, dominantColor(baseline));
  const comparison = compareToBaseline(baseline, erased);

  expect(comparison.diffPixels).toBeGreaterThan(0);
  expect(
    comparison.withinBudget,
    `A page stripped back to bare background must never pass. ${describeComparison(comparison)}`,
  ).toBe(false);
});
