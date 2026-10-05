import { expect, test } from '@playwright/test';

import { scanPublicTypography } from './lib/public-typography';
import { evaluatePublicTextContrast } from './lib/public-text-contrast';

const WHITE_CANVAS = { r: 255, g: 255, b: 255, a: 1 };

test('contrast uses the 7:1 floor for small text and resets between samples', async ({ page }) => {
  await page.setContent(`
    <style>body { background: white; color: #767676; font: 16px Arial; }</style>
    <p style="font-size:14px">small grey text</p>
    <p>body grey text</p>
  `);
  const first = await page.evaluate(scanPublicTypography, { pageType: 'marketing' as const });
  const failed = evaluatePublicTextContrast(first.samples, WHITE_CANVAS);
  expect(failed.unmeasured).toEqual([]);
  expect(failed.coverage.measured).toBe(2);
  expect(failed.findings.map((finding) => finding.text)).toEqual(['small grey text']);
  expect(failed.findings[0]?.minimum).toBe(7);

  await page.setContent(`
    <style>body { background: white; color: #595959; font: 14px Arial; }</style>
    <p>corrected small text</p>
  `);
  const second = await page.evaluate(scanPublicTypography, { pageType: 'marketing' as const });
  const corrected = evaluatePublicTextContrast(second.samples, WHITE_CANVAS);
  expect(corrected.findings).toEqual([]);
  expect(corrected.unmeasured).toEqual([]);
  expect(corrected.coverage).toEqual({ eligible: 1, measured: 1 });
});

test('modern colour and translucent backgrounds resolve through the browser', async ({ page }) => {
  await page.setContent(`
    <style>
      body { background: rgb(249,248,246); font: 16px Arial; }
      section { background: oklab(0.968429 -0.00252065 -0.00629514 / 0.3); }
      .good { color: color(srgb 0.1 0.1 0.1); }
      .bad { color: rgb(214,218,224); }
    </style>
    <section><p class="good">modern readable text</p><p class="bad">modern unreadable text</p></section>
  `);
  const measured = await page.evaluate(scanPublicTypography, { pageType: 'marketing' as const });
  const report = evaluatePublicTextContrast(measured.samples, WHITE_CANVAS);
  expect(report.unmeasured).toEqual([]);
  expect(report.coverage.measured).toBe(2);
  expect(report.findings.map((finding) => finding.text)).toEqual(['modern unreadable text']);
});

test('a gradient is unmeasured while an opaque child surface remains measurable', async ({
  page,
}) => {
  await page.setContent(`
    <style>
      body { background: white; font: 16px Arial; }
      section { background: linear-gradient(white,black); color: black; }
      .opaque { background: white; }
    </style>
    <section><p>gradient background text</p><p class="opaque">opaque child text</p></section>
  `);
  const measured = await page.evaluate(scanPublicTypography, { pageType: 'marketing' as const });
  const report = evaluatePublicTextContrast(measured.samples, WHITE_CANVAS);
  expect(report.unmeasured.map((finding) => finding.text)).toEqual(['gradient background text']);
  expect(report.coverage).toEqual({ eligible: 2, measured: 1 });
  expect(report.findings).toEqual([]);
});

test('opacity is a finding and cannot become a skipped clean result', async ({ page }) => {
  await page.setContent(`
    <style>body { background: white; color: black; font: 16px Arial; }</style>
    <section style="opacity:.2"><p>group opacity text</p></section>
    <p style="color:rgba(0,0,0,.2)">alpha text</p>
  `);
  const measured = await page.evaluate(scanPublicTypography, { pageType: 'marketing' as const });
  const report = evaluatePublicTextContrast(measured.samples, WHITE_CANVAS);
  expect(report.findings.filter((finding) => finding.kind === 'text-opacity')).toHaveLength(2);
  expect(
    report.findings.some((finding) => finding.kind === 'contrast' && finding.text === 'alpha text'),
  ).toBe(true);
  expect(report.unmeasured.map((finding) => finding.text)).toEqual(['group opacity text']);
});

test('a hidden ancestor background cannot make visible child text appear readable', async ({
  page,
}) => {
  await page.setContent(`
    <style>
      body { background: white; font: 16px Arial; }
      section { visibility: hidden; background: black; }
      span { visibility: visible; color: white; }
    </style>
    <section><span>visible white text</span></section>
  `);
  const measured = await page.evaluate(scanPublicTypography, { pageType: 'marketing' as const });
  const report = evaluatePublicTextContrast(measured.samples, WHITE_CANVAS);
  expect(report.unmeasured).toEqual([]);
  expect(report.findings.map((finding) => finding.kind)).toEqual(['contrast']);
  expect(report.findings[0]?.ratio).toBe(1);
});

test('contrast retains every defect beyond the old sample caps', async ({ page }) => {
  await page.setContent(`
    <style>body { background: white; color: #eeeeee; font: 16px Arial; }</style>
    ${Array.from({ length: 84 }, (_, index) => `<p>unreadable ${index}</p>`).join('')}
  `);
  const measured = await page.evaluate(scanPublicTypography, { pageType: 'marketing' as const });
  const report = evaluatePublicTextContrast(measured.samples, WHITE_CANVAS);
  expect(report.findings).toHaveLength(84);
  expect(report.coverage).toEqual({ eligible: 84, measured: 84 });
});

test('empty inputs and unresolved canvases fail the contrast instrument', () => {
  expect(() => evaluatePublicTextContrast([], WHITE_CANVAS)).toThrow('No painted text');
  expect(() => evaluatePublicTextContrast([], { ...WHITE_CANVAS, a: 0.5 })).toThrow('opaque');
  expect(() => evaluatePublicTextContrast([], { ...WHITE_CANVAS, r: Number.NaN })).toThrow(
    'opaque',
  );
});
