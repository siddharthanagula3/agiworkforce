import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  scanPublicComponentTypography,
  scanPublicStylesheetTypography,
} from './lib/public-typography-source';
import { getPublicRouteInventory } from './lib/public-route-inventory';

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

test('public route files, marketing and documentation typography uses tokens in source', async () => {
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
    return scan(source, file).map((finding) => ({ file: path.relative(root, file), ...finding }));
  });
  const counts = findings.reduce<Record<string, number>>((result, finding) => {
    result[finding.kind] = (result[finding.kind] ?? 0) + 1;
    return result;
  }, {});
  const summary = { sourceFiles: files.length, findingCount: findings.length, counts };
  const artifact = test.info().outputPath('source-findings.json');
  writeFileSync(artifact, JSON.stringify({ summary, files, findings }, null, 2));
  await test.info().attach('source-findings', {
    path: artifact,
    contentType: 'application/json',
  });
  expect(
    findings.length,
    JSON.stringify(
      {
        ...summary,
        firstRawFindings: findings.filter((finding) => finding.kind.startsWith('raw-')).slice(0, 8),
        firstUnresolvedFindings: findings
          .filter((finding) => finding.kind.startsWith('unresolved-'))
          .slice(0, 4),
      },
      null,
      2,
    ),
  ).toBe(0);
});
