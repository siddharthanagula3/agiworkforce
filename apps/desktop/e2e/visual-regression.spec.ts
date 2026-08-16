
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const baselinePath = path.resolve(
  import.meta.dirname,
  'visual-baselines',
  'desktop-cloud-sign-in.png',
);
const maximumDiffPixelRatio = 0.03;

test('Desktop cloud sign-in matches its reviewed pixel baseline', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to AGI Cloud' })).toBeVisible();
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

  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const actual = PNG.sync.read(fs.readFileSync(actualPath));

  expect(
    { width: actual.width, height: actual.height },
    'The rendered viewport dimensions changed; review and explicitly update the visual baseline.',
  ).toEqual({ width: baseline.width, height: baseline.height });

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.1 },
  );
  const totalPixels = baseline.width * baseline.height;
  const diffPixelRatio = diffPixels / totalPixels;

  if (diffPixelRatio > maximumDiffPixelRatio) {
    const diffPath = testInfo.outputPath('desktop-cloud-sign-in-diff.png');
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    await testInfo.attach('visual-diff', {
      path: diffPath,
      contentType: 'image/png',
    });
  }

  expect(
    diffPixelRatio,
    `${diffPixels}/${totalPixels} pixels differ from the reviewed baseline.`,
  ).toBeLessThanOrEqual(maximumDiffPixelRatio);
});
