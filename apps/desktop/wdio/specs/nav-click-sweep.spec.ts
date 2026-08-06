import * as path from 'node:path';

import { waitForDesktopShell } from '../support/desktop-shell';
import { closeAnySettingsDialog, waitForSettingsReady } from '../support/close-settings';
import {
  clickButtonWithText,
  collectRawKeys,
  listNavIds,
  resolveScreenDir,
  sweepStep,
  type SweepStepResult,
} from '../support/dom';

/**
 * Click sweep over every sidebar destination and settings tab in Local mode,
 * against the REAL Tauri binary.
 *
 * WHAT MAKES A CONTROL "WIRED" HERE
 * DesktopShellV3's panel ternary ends in a bare `else` that renders
 * `AgiWorkProjects` (DesktopShellV3.tsx:736-741). So a nav button whose id
 * never reaches a matching branch — a typo in the view map, a branch gated on
 * the wrong privacyMode, a panel that was never mounted — still paints a
 * plausible-looking Projects screen. A spec that only asserted "something
 * rendered" would pass on every dead control in the shell. Every step therefore
 * asserts the EXPECTED panel's own `data-testid` AND that `agi-work-projects`
 * is absent unless Projects was the target.
 *
 * The other two silent-failure modes this sweep watches for:
 *  - a toast in the "coming soon / not available" family, which means the click
 *    was received and deliberately declined (a dead control, not a wired one);
 *  - raw i18n keys (`sidebar.nav.code`) rendering as their own names, the
 *    regression i18n-raw-keys.spec.ts found on 2026-08-01.
 *
 * COST MODEL: every discrete WebdriverIO command costs ~5-6s against the
 * embedded Tauri driver, so each control is one `execute` to click plus as few
 * `execute` observations as it takes to settle — NOT one `waitForDisplayed` per
 * assertion. Polling cannot be pushed into the page (the obvious cheaper
 * design): this driver's `execute/sync` never awaits a returned Promise, and a
 * poll written that way hangs for 90s and then leaves the WebView blank. See
 * the clickTarget/observe docs in support/dom.ts.
 *
 * TEARDOWN CONTRACT: one app instance serves the whole run, so this spec must
 * hand the next spec a Local-mode shell with the sidebar expanded and no dialog
 * open. The final `it` and the `after` hook both enforce that.
 */

const SCREEN_DIR = resolveScreenDir('sweep');

// Recorded across all steps, printed as one table at the end so the failure
// list survives even when an individual assertion aborts its own `it`.
const results: SweepStepResult[] = [];
/**
 * Raw keys already on screen before the sweep starts. Anything in this set is
 * a pre-existing i18n gap, not something a sweep step caused; subtracting it
 * keeps one stale key from failing every single step.
 */
let rawKeyBaseline: string[] = [];

function record(result: SweepStepResult): SweepStepResult {
  results.push(result);
  console.log(
    `SWEEP[${result.label}] clicked=${result.clicked} via=${result.clickedVia} ` +
      `passed=${result.passed} fallbackProjects=${result.forbiddenPresent} ` +
      `${result.elapsedMs}ms`,
  );
  if (result.toasts.length) console.log(`  toasts: ${JSON.stringify(result.toasts)}`);
  // ATTRIBUTION CAVEAT: a panel that crashes ASYNCHRONOUSLY (CodeWorkspace's
  // FileTree needs a render loop or two to exhaust React's update depth) blows
  // the boundary after its own step has already been observed, so the boundary
  // is reported against the NEXT step. Measured: nav:code logs "Failed to load
  // directory" and passes, then nav:tasks inherits the boundary. Read a
  // boundary as "at or shortly before this step", never as proof of this one.
  if (result.errorBoundary) console.log(`  ERROR BOUNDARY: ${result.errorBoundary}`);
  if (!result.documentAlive) console.log('  BLANK WEBVIEW — the shell rendered nothing');
  const newKeys = result.rawKeys.filter((k) => !rawKeyBaseline.includes(k));
  if (newKeys.length) console.log(`  RAW I18N KEYS: ${JSON.stringify(newKeys)}`);
  return result;
}

/** Assert a step both landed on its target and was not silently declined. */
function assertStep(result: SweepStepResult, forbidProjectsFallback = true): void {
  // Checked first: once the WebView blanks, every later "control not found" is
  // an artefact of the dead shell, not nine independently dead controls.
  expect(result.documentAlive).toBe(true);
  expect(result.clicked).toBe(true);
  expect(result.deadControlToasts).toEqual([]);
  expect(result.errorBoundary).toBe(null);
  expect(result.rawKeys.filter((k) => !rawKeyBaseline.includes(k))).toEqual([]);
  if (forbidProjectsFallback) expect(result.forbiddenPresent).toBe(false);
  expect(result.passed).toBe(true);
}

async function shot(name: string): Promise<void> {
  await browser.saveScreenshot(path.join(SCREEN_DIR, `${name}.png`));
}

// Canonical Local-mode order from Sidebar.tsx navItemsForMode(). `customize` is
// last and opens the settings modal rather than a panel, so it is swept in the
// settings section below.
const LOCAL_NAV_STEPS: Array<{ navId: string; label: string; expectTestId: string }> = [
  { navId: 'artifacts', label: 'Artifacts', expectTestId: 'agi-work-artifacts' },
  { navId: 'code', label: 'Code', expectTestId: 'code-workspace' },
  { navId: 'tasks', label: 'Tasks', expectTestId: 'desktop-agent-tasks' },
  { navId: 'scheduled', label: 'Schedules', expectTestId: 'agi-work-scheduled' },
];

/**
 * The collapsed rail is a SECOND control list (railItems() in Sidebar.tsx),
 * independently written from the expanded nav but routed through the same view
 * map. It is swept separately, and its inventory is asserted, because the two
 * lists really did drift: Local's rail was missing `scheduled` entirely, so
 * collapsing the sidebar silently removed a destination the expanded nav
 * offered. `projects` is rail-only (the expanded sidebar gives Projects its own
 * folder section instead), so the two lists are compared deliberately, not
 * asserted equal.
 */
const LOCAL_RAIL_NAV_IDS = ['projects', 'artifacts', 'code', 'tasks', 'scheduled', 'customize'];

/** Local-mode expanded nav, in Sidebar.tsx navItemsForMode() order. */
const EXPANDED_NAV_IDS = ['artifacts', 'code', 'tasks', 'scheduled', 'customize'];

const RAIL_STEPS: Array<{ navId: string; expectTestId: string }> = [
  { navId: 'artifacts', expectTestId: 'agi-work-artifacts' },
  { navId: 'code', expectTestId: 'code-workspace' },
  { navId: 'tasks', expectTestId: 'desktop-agent-tasks' },
  { navId: 'scheduled', expectTestId: 'agi-work-scheduled' },
  { navId: 'projects', expectTestId: 'agi-work-projects' },
];

// Canonical order from packages/ui/ui/src/settings-nav.ts (SETTINGS_NAV),
// minus Account/Billing/Usage — LOCAL_HIDDEN_TABS in SettingsPanel.tsx, so
// they do not exist in the Local shell. Kept identical to settings-tour.spec.ts
// so the two stay comparable.
const SETTINGS_TABS = [
  'General',
  'Personalization',
  'Privacy',
  'Models & Keys',
  'Capabilities',
  'Agents',
  'Connectors',
  'AGI Code',
  'AGI in Chrome',
  'Plugins',
  'Memory',
  'Notifications',
  'Voice',
  'Extensions',
  'Developer',
];

describe('nav click sweep · every Local-mode sidebar destination is really wired', () => {
  before(async function () {
    this.timeout(180_000);
    await waitForDesktopShell();

    const useLocal = await $('button=Use Local Mode');
    if ((await useLocal.isExisting()) && (await useLocal.isDisplayed())) {
      await useLocal.click();
      await waitForDesktopShell();
    }
    // A previous spec can leave settings open, possibly dirty.
    await closeAnySettingsDialog();

    rawKeyBaseline = await collectRawKeys();
    console.log('SWEEP baseline raw i18n keys:', JSON.stringify(rawKeyBaseline));
    console.log('SWEEP screenshots →', SCREEN_DIR);

    await shot('00-shell-local');
  });

  after(async function () {
    this.timeout(120_000);
    // Hand the next spec a clean Local shell: no dialog, sidebar expanded.
    await closeAnySettingsDialog();
    await browser.execute(() => {
      const expand = document.querySelector(
        'button[aria-label="Expand sidebar"]',
      ) as HTMLElement | null;
      expand?.click();
    });
    await browser.pause(400);

    const failures = results.filter(
      (r) =>
        !r.documentAlive ||
        !r.clicked ||
        !r.passed ||
        r.forbiddenPresent ||
        r.deadControlToasts.length > 0 ||
        r.errorBoundary,
    );
    console.log('\n═══ SWEEP SUMMARY ═══');
    for (const r of results) {
      const verdict = failures.includes(r) ? 'FAIL' : 'PASS';
      console.log(
        `${verdict}\t${r.label}\tclicked=${r.clicked}\tpassed=${r.passed}\t` +
          `projectsFallback=${r.forbiddenPresent}\talive=${r.documentAlive}\t` +
          `toasts=${JSON.stringify(r.deadControlToasts)}`,
      );
    }
    console.log(`═══ ${results.length - failures.length}/${results.length} PASS ═══\n`);
  });

  it('renders the expected Local-mode nav inventory', async () => {
    const navIds = await listNavIds();
    console.log('SWEEP nav ids present:', JSON.stringify(navIds));
    expect(navIds).toEqual(EXPANDED_NAV_IDS);
  });

  for (const [index, step] of LOCAL_NAV_STEPS.entries()) {
    it(`nav "${step.label}" opens its own panel, not the Projects fallback`, async function () {
      this.timeout(90_000);
      const result = record(
        await sweepStep(
          `nav:${step.navId}`,
          { navId: step.navId },
          { testId: step.expectTestId, forbidTestId: 'agi-work-projects' },
          6, // looks, not ms — lazy panels (CodeWorkspace) need several
        ),
      );
      await shot(`${String(index + 1).padStart(2, '0')}-panel-${step.navId}`);
      assertStep(result);
    });
  }

  it('Tasks nav badge never claims work that does not exist', async () => {
    // NavBadge returns null at zero on purpose: an empty pill claims pending
    // work, and a literal "0" reads as a broken counter. A fresh e2e profile has
    // no tasks, so the badge is expected to be ABSENT — assert the invariant
    // (present ⇒ positive integer) rather than its presence, which would make
    // this test depend on seeded data.
    const badge = (await browser.execute(() => {
      const el = document.querySelector('[data-testid="nav-badge-tasks"]');
      return el
        ? { text: (el.textContent ?? '').trim(), label: el.getAttribute('aria-label') }
        : null;
    })) as { text: string; label: string | null } | null;

    console.log('SWEEP nav-badge-tasks:', JSON.stringify(badge));
    if (badge) {
      expect(badge.text).toMatch(/^[1-9]\d*$/);
      expect(badge.label ?? '').toMatch(/task/i);
    }
  });

  it('sidebar "Projects" header opens the Projects panel', async function () {
    this.timeout(90_000);
    const result = record(
      await sweepStep(
        'rail:projects-header',
        { text: 'Projects', within: '[data-v3-shell]' },
        { testId: 'agi-work-projects' },
      ),
    );
    await shot('05-panel-projects');
    // Projects IS the target here, so the fallback guard does not apply.
    assertStep(result, false);
  });

  it('"New chat" returns to the chat composer', async function () {
    this.timeout(90_000);
    const result = record(
      await sweepStep(
        'rail:new-chat',
        { text: 'New chat', within: '[data-v3-shell]' },
        {
          // The chat panel has no testid of its own; the composer's aria-label
          // is the seam every other chat spec drives.
          selectorPresent: 'textarea[aria-label="Chat message input"]',
          forbidTestId: 'agi-work-projects',
        },
      ),
    );
    await shot('06-panel-chat');
    assertStep(result);
  });

  it('"New project" opens the create-project dialog', async function () {
    this.timeout(90_000);
    const result = record(
      await sweepStep('rail:new-project', { ariaLabel: 'New project' }, { dialog: true }),
    );
    await shot('07-dialog-new-project');
    expect(result.clicked).toBe(true);
    expect(result.deadControlToasts).toEqual([]);
    expect(result.errorBoundary).toBe(null);
    expect(result.passed).toBe(true);

    await browser.keys('Escape');
    await browser.pause(400);
  });

  it('Search button opens the search modal and Escape closes it', async function () {
    this.timeout(90_000);
    const result = record(
      await sweepStep(
        'rail:search',
        { text: 'Search', within: '[data-v3-shell]' },
        { dialog: true },
      ),
    );
    await shot('08-modal-search');
    expect(result.clicked).toBe(true);
    expect(result.deadControlToasts).toEqual([]);
    expect(result.passed).toBe(true);

    await browser.keys('Escape');
    await browser.pause(500);
    const closed = await browser.execute(
      () =>
        !Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
          (d) => (d as HTMLElement).getClientRects().length > 0,
        ),
    );
    expect(closed).toBe(true);
  });

  it('collapse rail exposes the same destinations and expand restores them', async function () {
    this.timeout(120_000);

    const collapsed = record(
      await sweepStep(
        'rail:collapse',
        { ariaLabel: 'Collapse sidebar' },
        // The rail replaces the expanded nav; both carry data-nav-id, so the
        // expectation is simply that some nav survives the collapse.
        { selectorPresent: '[data-nav-id]' },
      ),
    );
    expect(collapsed.clicked).toBe(true);
    await shot('09-sidebar-collapsed');

    // Inventory FIRST: a destination the rail never renders cannot be caught by
    // clicking the ones it does. This assertion is what the missing `scheduled`
    // rail entry would have failed on.
    const railNavIds = await listNavIds();
    console.log('SWEEP rail nav ids present:', JSON.stringify(railNavIds));
    expect(railNavIds).toEqual(LOCAL_RAIL_NAV_IDS);

    for (const target of RAIL_STEPS) {
      const isProjects = target.navId === 'projects';
      const result = record(
        await sweepStep(
          `rail:${target.navId}`,
          { navId: target.navId },
          {
            testId: target.expectTestId,
            ...(isProjects ? {} : { forbidTestId: 'agi-work-projects' }),
          },
          6,
        ),
      );
      await shot(`10-rail-${target.navId}`);
      assertStep(result, !isProjects);
    }

    const expanded = record(
      await sweepStep(
        'rail:expand',
        { ariaLabel: 'Expand sidebar' },
        { selectorPresent: '[data-nav-id="customize"]' },
      ),
    );
    expect(expanded.clicked).toBe(true);
    await browser.pause(400);
    // Expanding must restore the expanded nav, not leave the rail behind.
    expect(await listNavIds()).toEqual(EXPANDED_NAV_IDS);
    await shot('11-sidebar-expanded');
  });

  it('settings gear opens the modal', async function () {
    this.timeout(120_000);
    const result = record(
      await sweepStep('rail:settings-gear', { ariaLabel: 'Settings' }, { dialog: true }, 8),
    );
    expect(result.clicked).toBe(true);
    expect(result.deadControlToasts).toEqual([]);
    expect(result.passed).toBe(true);

    await waitForSettingsReady();
    await shot('12-settings-open');
  });

  for (const [index, label] of SETTINGS_TABS.entries()) {
    it(`settings tab "${label}" renders content without an error boundary`, async function () {
      this.timeout(90_000);
      // Nav buttons are inert (and clicks are SILENT no-ops) while the panel
      // carries aria-busy — see support/close-settings.ts.
      await waitForSettingsReady();

      // Settings nav buttons can carry a trailing badge, so match on prefix.
      const clicked = await clickButtonWithText(
        'nav[aria-label="Settings sections"]',
        label,
        'prefix',
      );

      // Settings sections are React.lazy + Suspense. Sampling once right after
      // the click caught 9 of 15 tabs mid-spinner with <70 chars of text, and
      // "text length > 0" happily called a spinner a rendered tab. Poll until
      // the spinner clears so a PASS means real content — and so a tab that
      // NEVER resolves is reported as such instead of quietly passing.
      const readSnapshot = () =>
        browser.execute(
          (rawKeySource: string, domainSource: string) => {
            const shape = new RegExp(rawKeySource);
            const domain = new RegExp(domainSource, 'i');
            const nav = document.querySelector('nav[aria-label="Settings sections"]');
            const dialog =
              nav?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
            const content = dialog?.querySelector('.flex-1.flex.flex-col.min-w-0');
            const text = (content?.textContent ?? '').replace(/\s+/g, ' ').trim();
            const offenders = new Set<string>();
            if (content) {
              const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                const parent = walker.currentNode.parentElement;
                if (!parent || parent.closest('code, pre, script, style, textarea')) continue;
                const value = (walker.currentNode.textContent ?? '').trim();
                if (!value || value.length > 80) continue;
                if (shape.test(value) && !domain.test(value)) offenders.add(value);
              }
            }
            return {
              activeLabel:
                nav?.querySelector('button[aria-current="page"]')?.textContent?.trim() ?? null,
              textLength: text.length,
              preview: text.slice(0, 220),
              hasErrorBoundary: /encountered an unexpected error|Something went wrong/i.test(text),
              stillSpinning: !!content?.querySelector('.animate-spin'),
              rawKeys: Array.from(offenders).sort(),
            };
          },
          RAW_KEY_SHAPE_SOURCE,
          DOMAIN_LIKE_SOURCE,
        ) as unknown as Promise<{
          activeLabel: string | null;
          textLength: number;
          preview: string;
          hasErrorBoundary: boolean;
          stillSpinning: boolean;
          rawKeys: string[];
        }>;

      // "Nothing but a spinner" is the Suspense fallback — the tab has not
      // rendered. A spinner ALONGSIDE substantial text is an in-panel loading
      // state (Connectors polls each connector's status and keeps one
      // indefinitely), which is not a rendering failure.
      const suspended = (s: { stillSpinning: boolean; textLength: number }) =>
        s.stillSpinning && s.textLength < 300;

      let snap = await readSnapshot();
      for (let look = 0; look < 8 && suspended(snap); look += 1) {
        await browser.pause(400);
        snap = await readSnapshot();
      }

      results.push({
        label: `settings:${label}`,
        clicked,
        clickedVia: clicked ? `settingsNav=${label}` : null,
        passed: clicked && !snap.hasErrorBoundary && !suspended(snap) && snap.textLength > 0,
        forbiddenPresent: false,
        toasts: [],
        deadControlToasts: [],
        errorBoundary: snap.hasErrorBoundary ? snap.preview : null,
        rawKeys: snap.rawKeys,
        visibleTestIds: [],
        documentAlive: true,
        elapsedMs: 0,
      });
      console.log(
        `SWEEP[settings:${label}] clicked=${clicked} active=${snap.activeLabel} ` +
          `chars=${snap.textLength} spinning=${snap.stillSpinning} ` +
          `rawKeys=${JSON.stringify(snap.rawKeys)}`,
      );
      console.log(`  preview: ${snap.preview}`);

      await shot(`13-${String(index + 1).padStart(2, '0')}-settings-${slug(label)}`);

      expect(clicked).toBe(true);
      expect(snap.hasErrorBoundary).toBe(false);
      // A bare spinner is not content: a tab still suspended after ~3.2s has
      // not been shown to render anything.
      expect(suspended(snap)).toBe(false);
      expect(snap.textLength).toBeGreaterThan(0);
      expect(snap.rawKeys.filter((k) => !rawKeyBaseline.includes(k))).toEqual([]);
    });
  }

  it('closes settings and leaves the shell in Local mode for the next spec', async function () {
    this.timeout(90_000);
    expect(await closeAnySettingsDialog()).toBe(true);
    await shot('99-teardown-local-shell');

    const state = (await browser.execute(() => ({
      dialogOpen: Array.from(
        document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
      ).some((d) => (d as HTMLElement).getClientRects().length > 0),
      navIds: Array.from(document.querySelectorAll('[data-nav-id]')).map((el) =>
        el.getAttribute('data-nav-id'),
      ),
    }))) as { dialogOpen: boolean; navIds: string[] };
    expect(state.dialogOpen).toBe(false);
    // `code` only exists in Local mode — its presence proves the teardown left
    // the shell where the next spec expects it.
    expect(state.navIds).toContain('code');
  });
});

// Duplicated as plain strings because browser.execute serializes its function
// and cannot close over module-scope RegExp objects.
const RAW_KEY_SHAPE_SOURCE = '^[a-z][a-zA-Z]*(\\.[a-z][a-zA-Z0-9_]*)+$';
const DOMAIN_LIKE_SOURCE = '\\.(com|org|net|io|dev|app|ai|md|json|ts|tsx|js|rs|html|css|toml)$';

function slug(label: string): string {
  return label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}
