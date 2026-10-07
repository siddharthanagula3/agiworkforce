import { test, expect } from '@playwright/test';
import { isAuthPath, isProductPath } from '@agiworkforce/types/product-routes';
import { INSPIRATION, inspirationPath } from '../app/gallery/inspiration';
import { RELEASES, releasePath } from '../lib/changelog-entries';
import {
  archivedVersionHref,
  policyHistories,
  policyHistoryHref,
} from '../lib/legal/policy-archive';
import {
  getHelpArticleRoutePaths,
  getPublicRouteInventory,
  selectPublicRouteCases,
} from './lib/public-route-inventory';

test('canonical content owners and their path helpers populate current generated routes', () => {
  const result = getPublicRouteInventory();
  const pathsFor = (pattern: string) =>
    result.generatedRoutes
      .filter((route) => route.pattern === pattern)
      .map((route) => route.path)
      .sort();
  expect(pathsFor('/gallery/[templateId]')).toEqual(
    INSPIRATION.map((template) => inspirationPath(template.id)).sort(),
  );
  expect(pathsFor('/release-notes/[slug]')).toEqual(RELEASES.map(releasePath).sort());
  expect(pathsFor('/legal/archive/[policy]')).toEqual(
    policyHistories().map(policyHistoryHref).sort(),
  );
  expect(pathsFor('/legal/archive/[policy]/[date]')).toEqual(
    policyHistories()
      .flatMap((history) =>
        history.versions
          .filter((version) => version.status === 'archived')
          .map((version) => archivedVersionHref(history, version.date)),
      )
      .sort(),
  );
  expect(pathsFor('/help/[slug]')).toEqual(getHelpArticleRoutePaths());
  expect(result.fixedRoutes.length).toBeGreaterThan(0);
  expect(
    result.fixedRoutes.every(
      (route) => !route.path.includes('[') && !isAuthPath(route.path) && !isProductPath(route.path),
    ),
  ).toBe(true);
  expect(new Set(result.routes.map((route) => route.path)).size).toBe(result.routes.length);
  expect(result.unresolvedDynamic.map((route) => route.pattern)).toContain(
    '/connectors/mcp-directory/[...id]',
  );
  expect(result.unavailableDynamic.map((route) => route.pattern)).toContain('/blog/[slug]');
});

test('runtime samples distinguish handler guards from execution requiring local fixtures', () => {
  const result = getPublicRouteInventory();
  const malformed = result.stateSamples.filter((sample) =>
    sample.source.includes('malformed-token'),
  );
  expect(malformed).toHaveLength(3);
  expect(
    malformed.every(
      (sample) =>
        sample.path?.includes('inventory-invalid-token') && sample.dataAccess === 'handler-guarded',
    ),
  ).toBe(true);
  for (const sample of result.stateSamples) {
    expect(sample.unresolvedFlags).toEqual(
      expect.arrayContaining([
        'module-initializers-unverified',
        'import-side-effects-unverified',
        'transitive-bindings-unverified',
        'parameter-and-expression-evaluation-unverified',
        'render-execution-unverified',
      ]),
    );
  }
  expect(
    result.stateSamples
      .filter((sample) => sample.path === null)
      .map((sample) => sample.pattern)
      .sort(),
  ).toEqual([
    '/connectors/mcp-directory/[...id]',
    '/plugins/[id]',
    '/share/[token]',
    '/share/schedules/[token]',
    '/shared-artifact/[token]',
  ]);
  const device = result.stateSamples.filter((sample) => sample.pattern === '/connect/[deviceType]');
  expect(device.some((sample) => sample.state === 'unknown-device')).toBe(true);
  expect(
    result.stateSamples
      .filter((sample) => sample.dataAccess === 'fixture-required')
      .every((sample) => sample.path === null),
  ).toBe(true);
  expect(result.routes.every((route) => !route.path.includes('inventory-invalid-token'))).toBe(
    true,
  );
});

test('source page types and strict subsets give guard consumers explicit expectations', () => {
  const inventory = getPublicRouteInventory();
  const pages = new Map(inventory.routes.map((route) => [route.path, route]));
  expect(pages.get('/web')).toEqual(
    expect.objectContaining({
      route: '/web',
      pageType: 'marketing',
      expectedHttpStatuses: [200],
      expectedFinalPath: '/web',
      context: 'signed-out',
    }),
  );
  expect(pages.get('/docs')).toEqual(expect.objectContaining({ pageType: 'docs' }));
  expect(pages.get('/privacy')).toEqual(expect.objectContaining({ pageType: 'legal' }));
  expect(pages.get('/')).toEqual(expect.objectContaining({ ownership: 'lead-home-page' }));
  expect(selectPublicRouteCases(inventory, { paths: ['/web'] }).map((route) => route.path)).toEqual(
    ['/web'],
  );
  expect(() => selectPublicRouteCases(inventory, { paths: [] })).toThrow('must not be empty');
  expect(() =>
    selectPublicRouteCases(inventory, { paths: ['/inventory-not-a-public-route'] }),
  ).toThrow('Unknown public route subset');
  expect(() => selectPublicRouteCases(inventory, { paths: ['/web'], pageTypes: ['docs'] })).toThrow(
    'selected no cases',
  );
});

test('not-found transport statuses remain allowed outcomes with independent UI and robots obligations', () => {
  const inventory = getPublicRouteInventory();
  const absent = inventory.stateSamples.filter((sample) => sample.expectedNotFoundUi);
  expect(absent.map((sample) => sample.pattern).sort()).toEqual([
    '/blog/[slug]',
    '/share/[token]',
    '/share/schedules/[token]',
  ]);
  expect(absent.every((sample) => sample.expectedRobots === 'noindex')).toBe(true);
  expect(absent.map((sample) => [sample.pattern, sample.dataAccess]).sort()).toEqual([
    ['/blog/[slug]', 'unverified'],
    ['/share/[token]', 'handler-guarded'],
    ['/share/schedules/[token]', 'handler-guarded'],
  ]);
  for (const sample of absent) {
    expect(sample.expectedHttpStatuses).toEqual([200, 404]);
    expect(sample).not.toHaveProperty('expectedStatus');
    expect(sample).not.toHaveProperty('expectedHttpStatus');
  }
  expect(inventory.stateSamples).toContainEqual(
    expect.objectContaining({
      state: 'unavailable-artifact',
      expectedHttpStatuses: [200],
      expectedNotFoundUi: false,
      expectedRobots: 'noindex',
    }),
  );
  expect(
    inventory.stateSamples
      .filter((sample) => sample.path === null)
      .every((sample) => sample.expectedHttpStatuses === null),
  ).toBe(true);
  expect(
    inventory.routes
      .filter((route) => route.unresolvedFlags.includes('conditional-navigation'))
      .every((route) => route.expectedHttpStatuses === null),
  ).toBe(true);
});
