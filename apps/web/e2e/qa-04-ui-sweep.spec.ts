import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { signIn } from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

/**
 * scripts/a11y-audit.mjs runs with NO session, so every protected route it
 * "audits" is really the login wall, its own header says so. This sweep signs
 * in first, which is the only way the settings modal, connectors, skills,
 * plugins, chat and workspace surfaces are reachable at all.
 */
const SLICES: Record<string, string[]> = {
  'settings-sections': [
    '/settings/general',
    '/settings/account',
    '/settings/profile',
    '/settings/billing',
    '/settings/usage',
    '/settings/capabilities',
    '/settings/connections',
    '/settings/memory',
    '/settings/notifications',
    '/settings/privacy',
    '/settings/safety',
    '/settings/security',
    '/settings/skills',
    '/settings/sync',
    '/settings/team',
    '/settings/voice',
    '/settings/archived',
    '/settings/deleted-chats',
    '/settings/shared-links',
    '/settings/time-focus',
    '/settings/reflect',
    '/settings/byok',
  ],
  capabilities: [
    '/connectors',
    '/connectors/new',
    '/connectors/mcp-directory',
    '/skills',
    '/plugins',
    '/marketplace',
  ],
  chat: [
    '/chat',
    '/chat/projects',
    '/chat/library',
    '/chat/artifacts',
    '/chat/schedules',
    '/chat/customize',
  ],
  workspace: [
    '/workspace',
    '/workspace/people',
    '/workspace/policy',
    '/workspace/models',
    '/workspace/usage',
    '/workspace/billing',
    '/workspace/connectors',
    '/workspace/audit',
    '/workspace/data',
    '/workspace/identity',
    '/workspace/sharing',
  ],
  product: ['/tasks', '/agi-work', '/operator', '/agent-permissions', '/byok', '/local', '/user'],
};

interface RouteReport {
  route: string;
  status: number | null;
  finalUrl: string;
  redirected: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: { url: string; failure: string }[];
  badResponses: { url: string; status: number }[];
  a11y: { id: string; impact: string | null; nodes: number; help: string; targets: string[] }[];
  visibleText: number;
}

async function auditRoute(page: Page, route: string): Promise<RouteReport> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: { url: string; failure: string }[] = [];
  const badResponses: { url: string; status: number }[] = [];

  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  };
  const onPageError = (err: Error) => pageErrors.push(String(err.message).slice(0, 300));
  const onRequestFailed = (req: {
    url: () => string;
    failure: () => { errorText: string } | null;
  }) => {
    const failure = req.failure()?.errorText ?? 'unknown';
    if (failure.includes('ERR_ABORTED')) return;
    failedRequests.push({ url: req.url().slice(0, 200), failure });
  };
  const onResponse = (res: { url: () => string; status: () => number }) => {
    const status = res.status();
    if (status >= 400 && !res.url().includes('/_next/')) {
      badResponses.push({ url: res.url().slice(0, 200), status });
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  let status: number | null = null;
  try {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    status = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
    // Belt and braces: reduced motion kills CSS/framer transitions, but a late
    // client render can still be settling when axe reads computed styles.
    await page.waitForTimeout(600);
  } catch (error) {
    pageErrors.push(`navigation: ${String(error).slice(0, 200)}`);
  }

  let a11y: RouteReport['a11y'] = [];
  try {
    const results = await new AxeBuilder({ page: page as never })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    a11y = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      nodes: v.nodes.length,
      help: v.help,
      targets: v.nodes
        .slice(0, 8)
        .map(
          (n) =>
            `${String(n.target)} :: ${n.html.slice(0, 100)} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220)}`,
        ),
    }));
  } catch (error) {
    pageErrors.push(`axe: ${String(error).slice(0, 160)}`);
  }

  const visibleText = await page
    .locator('body')
    .innerText()
    .then((t) => t.trim().length)
    .catch(() => 0);

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('requestfailed', onRequestFailed);
  page.off('response', onResponse);

  const finalUrl = new URL(page.url()).pathname;
  return {
    route,
    status,
    finalUrl,
    redirected: finalUrl !== route,
    consoleErrors,
    pageErrors,
    failedRequests,
    badResponses,
    a11y,
    visibleText,
  };
}

const SLICE = process.env['QA_SLICE'] ?? 'settings-sections';
const AD_HOC = (process.env['QA_ROUTES'] ?? '')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

test.describe(`QA UI sweep, ${SLICE}`, () => {
  test.setTimeout(15 * 60_000);
  // Without this, axe samples elements mid-transition: the cookie banner fades
  // in, so its text is measured part-way between the background and its real
  // colour and reported as a 1.02:1 contrast failure that does not exist. A
  // probe of the settled page shows rgb(2, 8, 23) on white. Reduced motion also
  // matches how a user with the OS setting on actually sees the product.
  test.use({ reducedMotion: 'reduce' } as never);

  test(`audits every route in the ${SLICE} slice while signed in`, async ({ page }) => {
    await signIn(page);

    const routes = AD_HOC.length > 0 ? AD_HOC : (SLICES[SLICE] ?? []);
    expect(routes.length, `unknown slice: ${SLICE}`).toBeGreaterThan(0);

    const reports: RouteReport[] = [];
    for (const [index, route] of routes.entries()) {
      // Every app page refetches /api/skills, /api/projects and /api/chat/sync,
      // which all share the 60-per-minute `chat-conversation` bucket. Sweeping
      // 22 routes back to back exhausts it and every later route reports ~20
      // console errors that are this harness's own traffic, not a defect.
      if (index > 0) await page.waitForTimeout(4_000);
      reports.push(await auditRoute(page, route));
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      path.join(OUT_DIR, `ui-sweep-${AD_HOC.length > 0 ? 'adhoc' : SLICE}.json`),
      JSON.stringify(reports, null, 2),
    );

    for (const r of reports) {
      const flags = [
        r.redirected ? `redirected->${r.finalUrl}` : '',
        r.visibleText < 40 ? `blank(${r.visibleText})` : '',
        r.pageErrors.length ? `pageErr=${r.pageErrors.length}` : '',
        r.consoleErrors.length ? `consoleErr=${r.consoleErrors.length}` : '',
        r.badResponses.length ? `http4xx5xx=${r.badResponses.length}` : '',
        r.a11y.length ? `a11y=${r.a11y.length}` : '',
      ].filter(Boolean);
      console.log(`[ui] ${r.route.padEnd(30)} ${flags.join(' ') || 'clean'}`);
    }

    // The sweep records; it must not fail the run, or one broken route hides the
    // rest of the slice. Assertions live in the targeted regression tests that
    // each fix ships with.
    expect(reports.length).toBe(routes.length);
  });
});
