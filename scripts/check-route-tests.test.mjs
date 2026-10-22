import assert from 'node:assert/strict';
import test from 'node:test';

import {
  apiRouteIsTested,
  checkAgainstRatchet,
  countByRule,
  isApiRoute,
  isPageRoute,
  pageRouteHasSpec,
  routePath,
  scan,
} from './lib/route-tests.mjs';

test('route paths drop dynamic segments and layout groups', () => {
  assert.equal(routePath('apps/web/app/api/admin/sso/[id]/route.ts'), '/api/admin/sso');
  assert.equal(routePath('apps/web/app/api/version/route.ts'), '/api/version');
  assert.equal(routePath('apps/web/app/(marketing)/pricing/page.tsx'), '/pricing');
  assert.equal(routePath('apps/web/app/skills/[...path]/page.tsx'), '/skills');
  assert.equal(routePath('apps/web/app/page.tsx'), '/');
});

test('scope separates API routes, page routes and everything else', () => {
  assert.ok(isApiRoute('apps/web/app/api/version/route.ts'));
  assert.ok(isApiRoute('apps/web/app/api/og/route.tsx'));
  assert.ok(!isApiRoute('apps/web/app/api/helpers.ts'));
  assert.ok(isPageRoute('apps/web/app/pricing/page.tsx'));
  assert.ok(!isPageRoute('apps/web/app/api/version/page.tsx'));
  assert.ok(!isPageRoute('apps/web/app/pricing/PricingTable.tsx'));
});

test('a test beside the route, or under its own __tests__, counts', () => {
  const route = 'apps/web/app/api/billing/route.ts';
  assert.ok(
    apiRouteIsTested(route, {
      testPaths: ['apps/web/app/api/billing/route.test.ts'],
      testSources: [],
    }),
  );
  assert.ok(
    apiRouteIsTested(route, {
      testPaths: ['apps/web/app/api/billing/__tests__/route.test.ts'],
      testSources: [],
    }),
  );
});

test('a test anywhere in the app that names the route path counts', () => {
  assert.ok(
    apiRouteIsTested('apps/web/app/api/billing/route.ts', {
      testPaths: ['apps/web/lib/__tests__/billing.test.ts'],
      testSources: ["await fetch('/api/billing', { method: 'POST' });"],
    }),
  );
});

test('a route nothing names or sits beside is untested', () => {
  assert.equal(
    apiRouteIsTested('apps/web/app/api/billing/route.ts', {
      testPaths: ['apps/web/lib/__tests__/other.test.ts'],
      testSources: ["await fetch('/api/invoices');"],
    }),
    false,
  );
});

test('a sibling directory does not count as beside the route', () => {
  assert.equal(
    apiRouteIsTested('apps/web/app/api/billing/route.ts', {
      testPaths: ['apps/web/app/api/billing/plans/__tests__/plans.test.ts'],
      testSources: [],
    }),
    false,
  );
});

test('a page counts as specced when a spec names its literal path', () => {
  assert.ok(pageRouteHasSpec('apps/web/app/pricing/page.tsx', ["page.goto('/pricing');"]));
  assert.equal(
    pageRouteHasSpec('apps/web/app/pricing/page.tsx', ["page.goto('/billing');"]),
    false,
  );
});

test('a dynamic segment inside the path is matched by the value a spec visits', () => {
  const page = 'apps/web/app/code/[sessionId]/security/page.tsx';
  assert.ok(pageRouteHasSpec(page, ['await page.goto(`/code/${SESSION_ID}/security`);']));
  assert.ok(pageRouteHasSpec(page, ["await page.goto('/code/1111-aaaa/security');"]));
  assert.equal(pageRouteHasSpec(page, ["page.goto('/code/security');"]), false);
  assert.equal(pageRouteHasSpec(page, ['page.goto(`/code/${id}/security-settings`);']), false);
  assert.equal(pageRouteHasSpec(page, ['page.goto(`/code/${id}`);']), false);
  assert.ok(
    pageRouteHasSpec('apps/web/app/docs/[...slug]/edit/page.tsx', [
      "goto('/docs/guides/setup/edit')",
    ]),
  );
  assert.ok(pageRouteHasSpec('apps/web/app/skills/[...path]/page.tsx', ["goto('/skills/x')"]));
});

test('an inner dynamic route counts only as a quoted path that starts a URL', () => {
  const page = 'apps/web/app/code/[sessionId]/security/page.tsx';
  assert.ok(pageRouteHasSpec(page, ['await page.goto("/code/abc/security?tab=1");']));
  assert.ok(pageRouteHasSpec(page, ["expect(page).toHaveURL('/code/abc/security/');"]));
  assert.equal(pageRouteHasSpec(page, ["await request.get('/api/code/x/security');"]), false);
  assert.equal(pageRouteHasSpec(page, ['await request.get(`/api/code/${id}/security`);']), false);
  assert.equal(pageRouteHasSpec(page, ["read('apps/web/app/code/[sessionId]/security');"]), false);
  assert.equal(pageRouteHasSpec(page, ["const route = '/code/[sessionId]/security';"]), false);
  assert.equal(pageRouteHasSpec(page, ['// visits /code/abc/security in the browser']), false);
  assert.equal(pageRouteHasSpec(page, ["page.goto('/code/abc/security.json');"]), false);
});

test('scan reports each rule and the ratchet fails on growth', () => {
  const findings = scan({
    apiRoutes: ['apps/web/app/api/billing/route.ts'],
    pageRoutes: ['apps/web/app/pricing/page.tsx'],
    testPaths: [],
    testSources: [],
    specSources: [],
  });
  assert.deepEqual(countByRule(findings), { 'untested-api-route': 1, 'unspecced-page-route': 1 });
  assert.equal(
    checkAgainstRatchet(countByRule(findings), {
      maxFindings: { 'untested-api-route': 1, 'unspecced-page-route': 1 },
    }).length,
    0,
  );
  assert.equal(
    checkAgainstRatchet(countByRule(findings), {
      maxFindings: { 'untested-api-route': 0, 'unspecced-page-route': 0 },
    }).length,
    2,
  );
  assert.equal(checkAgainstRatchet(countByRule(findings), { maxFindings: {} }).length, 2);
});
