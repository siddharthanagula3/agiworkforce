import { expect, test } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * Server error states, reached by answering the list request with a status.
 *
 * A live sweep cannot see these: the API works, so the failure branch never
 * renders. Every surface here shipped at least one of - a status code on
 * screen, a failure nothing announced, or wording that blamed the reader's
 * connection for a 403.
 */

const SURFACES = [
  { route: '/chat/projects', api: '**/api/projects*' },
  { route: '/chat/library', api: '**/api/library**' },
  { route: '/tasks', api: '**/api/llm/v1/chat/completions/runs*' },
  { route: '/chat/schedules', api: '**/api/schedules*' },
];

const CASES = [
  { status: 500, body: { error: { message: 'Internal error' } } },
  { status: 403, body: { error: { message: 'Forbidden' } } },
  { status: 429, body: { error: { message: 'Too many requests' } } },
  // 401 has its own answer: the reader is not at fault and retrying will not
  // help until they sign in again.
  { status: 401, body: { error: { message: 'Unauthorized' } } },
];

test('server error states are announced, actionable and free of raw detail', async ({ page }) => {
  test.setTimeout(900_000);
  await signIn(page);
  const findings: unknown[] = [];

  for (const c of CASES) {
    for (const s of SURFACES) {
      await page.route(s.api, (r) =>
        r.fulfill({
          status: c.status,
          contentType: 'application/json',
          body: JSON.stringify(c.body),
        }),
      );
      await page.goto(s.route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4500);

      findings.push(
        await page.evaluate(
          ({ route, status }) => {
            const main = (document.querySelector('main') ?? document.body) as HTMLElement;
            const text = main.innerText;
            const alerts = [
              ...document.querySelectorAll('[role="alert"],[role="status"],[aria-live]'),
            ]
              .map((e) => (e as HTMLElement).innerText.trim())
              .filter(Boolean);
            const retry = [...document.querySelectorAll('button')]
              .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim())
              .filter((t) => /retry|try again|reload|refresh/i.test(t));
            // Wording that belongs in a log, not on screen.
            const raw = (text.match(
              /\b(500|403|429|Internal error|Forbidden|undefined|null|\[object Object\]|TypeError|Error:)\b/g,
            ) ?? []) as string[];
            return {
              route,
              status,
              visibleChars: text.trim().length,
              announced: alerts.slice(0, 2),
              retryOffered: [...new Set(retry)].slice(0, 3),
              rawLeak: [...new Set(raw)].slice(0, 5),
            };
          },
          { route: s.route, status: c.status },
        ),
      );
      await page.unroute(s.api);
    }
  }
  type Finding = {
    route: string;
    status: number;
    announced: string[];
    rawLeak: string[];
    visibleChars: number;
  };
  const results = findings as Finding[];

  const silent = results
    .filter((f) => f.announced.length === 0)
    .map((f) => `${f.status} ${f.route}`);
  expect(silent, `failure announced to nobody: ${silent.join(', ')}`).toEqual([]);

  const leaking = results
    .filter((f) => f.rawLeak.length > 0)
    .map((f) => `${f.status} ${f.route} -> ${f.rawLeak.join('/')}`);
  expect(leaking, `machine wording on screen: ${leaking.join(', ')}`).toEqual([]);

  const blank = results.filter((f) => f.visibleChars < 60).map((f) => `${f.status} ${f.route}`);
  expect(blank, `blank on error: ${blank.join(', ')}`).toEqual([]);

  // 401 is not a generic failure: retrying cannot help until the reader signs
  // in again, so the answer has to say so rather than offering the same
  // "something went wrong" as a 500.
  const vagueOn401 = results
    .filter((f) => f.status === 401)
    .filter((f) => !/sign in|session/i.test(f.announced.join(' ')))
    .map((f) => `${f.route}: ${f.announced.join(' ').slice(0, 60)}`);
  expect(vagueOn401, `401 answered generically on: ${vagueOn401.join(', ')}`).toEqual([]);
});
