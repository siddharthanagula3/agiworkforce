import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  scanPublicComponentTypography,
  scanPublicStylesheetTypography,
} from './lib/public-typography-source';
import { getPublicRouteInventory } from './lib/public-route-inventory';

const BASELINE_FILE = path.join(__dirname, 'public-typography-source.baseline.json');

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'options' || entry.name === 'next' || entry.name === '__tests__') return [];
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(?:css|tsx?)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)
      ? [file]
      : [];
  });
}

test('public route files, marketing and documentation add no literal type sizes', async () => {
  test.info().annotations.push({
    type: 'source-coverage',
    description:
      'Scans public page files, marketing and docs sources. Imported shared components, route layouts, global CSS, runtime generated styles and unresolved expressions require the browser guard; this source result alone cannot prove a page passes.',
  });
  const root = path.resolve(__dirname, '..');
  const inventory = getPublicRouteInventory();
  const files = [
    ...new Set([
      ...sourceFiles(path.join(root, 'features/marketing')),
      ...sourceFiles(path.join(root, 'features/docs')),
      ...inventory.routes.flatMap((route) => route.sourceFiles),
      ...inventory.unresolvedDynamic.flatMap((route) => route.sourceFiles),
      ...inventory.unavailableDynamic.flatMap((route) => route.sourceFiles),
    ]),
  ];
  expect(files.length, 'the source check must read real public inputs').toBeGreaterThan(0);
  const findings = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const scan = file.endsWith('.css')
      ? scanPublicStylesheetTypography
      : scanPublicComponentTypography;
    return scan(source, file).map((finding) => ({
      file: path.relative(root, file).split(path.sep).join('/'),
      ...finding,
    }));
  });
  const counts = findings.reduce<Record<string, number>>((result, finding) => {
    result[finding.kind] = (result[finding.kind] ?? 0) + 1;
    return result;
  }, {});
  const perFile = findings.reduce<Record<string, number>>((result, finding) => {
    result[finding.file] = (result[finding.file] ?? 0) + 1;
    return result;
  }, {});
  const summary = { sourceFiles: files.length, findingCount: findings.length, counts };
  const artifact = test.info().outputPath('source-findings.json');
  writeFileSync(artifact, JSON.stringify({ summary, perFile, files, findings }, null, 2));
  await test.info().attach('source-findings', {
    path: artifact,
    contentType: 'application/json',
  });

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Record<string, number>;
  const grown = Object.entries(perFile)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => ({
      file,
      allowed: baseline[file] ?? 0,
      found: count,
      findings: findings.filter((finding) => finding.file === file).slice(0, 8),
    }));
  expect(
    grown,
    'A public source file sets more literal type sizes than its baseline allows. Use a type token; the baseline never rises.',
  ).toEqual([]);

  const stale = Object.entries(baseline)
    .filter(([file, allowed]) => (perFile[file] ?? 0) < allowed)
    .map(([file, allowed]) => ({ file, allowed, found: perFile[file] ?? 0 }));
  expect(
    stale,
    'A file now sets fewer literal type sizes than its baseline. Lower its number in public-typography-source.baseline.json, or delete the entry at zero, so the gain cannot be spent again.',
  ).toEqual([]);
});
