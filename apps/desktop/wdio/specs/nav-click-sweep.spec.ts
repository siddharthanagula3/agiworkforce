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

const SCREEN_DIR = resolveScreenDir('sweep');

const results: SweepStepResult[] = [];
let rawKeyBaseline: string[] = [];

function record(result: SweepStepResult): SweepStepResult {
  results.push(result);
  console.log(
    `SWEEP[${result.label}] clicked=${result.clicked} via=${result.clickedVia} ` +
      `passed=${result.passed} fallbackProjects=${result.forbiddenPresent} ` +
      `${result.elapsedMs}ms`,
  );
  if (result.toasts.length) console.log(`  toasts: ${JSON.stringify(result.toasts)}`);
  if (result.errorBoundary) console.log(`  ERROR BOUNDARY: ${result.errorBoundary}`);
  if (!result.documentAlive) console.log('  BLANK WEBVIEW — the shell rendered nothing');
  const newKeys = result.rawKeys.filter((k) => !rawKeyBaseline.includes(k));
  if (newKeys.length) console.log(`  RAW I18N KEYS: ${JSON.stringify(newKeys)}`);
  return result;
}

function assertStep(result: SweepStepResult, forbidProjectsFallback = true): void {
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

async function waitForInteractiveDialog(timeout = 5_000): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute(() => {
        const dialog = Array.from(
          document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
        ).find((candidate) => (candidate as HTMLElement).getClientRects().length > 0);
        if (!(dialog instanceof HTMLElement)) return false;

        const surface =
          (dialog.querySelector('[data-testid="search-modal-panel"]') as HTMLElement | null) ??
          dialog;
        const opacity = Number.parseFloat(window.getComputedStyle(surface).opacity || '1');
        return (
          surface.getClientRects().length > 0 &&
          opacity >= 0.99 &&
          !!document.activeElement &&
          dialog.contains(document.activeElement)
        );
      }),
    {
      timeout,
      interval: 100,
      timeoutMsg: 'Dialog mounted but never became visible and focus-trapped',
    },
  );
}

async function waitForNoVisibleDialog(label: string, timeout = 5_000): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute(
        () =>
          !Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
            (dialog) => (dialog as HTMLElement).getClientRects().length > 0,
          ),
      ),
    {
      timeout,
      interval: 100,
      timeoutMsg: `${label} stayed open after Escape`,
    },
  );
}

const LOCAL_NAV_STEPS: Array<{
  navId: string;
  label: string;
  expectTestId: string;
  expectSelector?: string;
}> = [
  { navId: 'artifacts', label: 'Artifacts', expectTestId: 'agi-work-artifacts' },
  { navId: 'code', label: 'Code', expectTestId: 'code-workspace' },
  { navId: 'design', label: 'Design', expectTestId: 'design-workspace' },
  { navId: 'research', label: 'Research', expectTestId: 'research-workspace' },
  {
    navId: 'automation',
    label: 'Automation',
    expectTestId: 'desktop-automation',
    expectSelector: '[data-testid="desktop-automation"] button[title="Refresh triggers"]',
  },
  {
    navId: 'tasks',
    label: 'Tasks',
    expectTestId: 'desktop-agent-tasks',
    expectSelector: '[data-testid="desktop-agent-tasks"] #agent-task-goal',
  },
  { navId: 'scheduled', label: 'Schedules', expectTestId: 'agi-work-scheduled' },
];

const LOCAL_RAIL_NAV_IDS = [
  'projects',
  'artifacts',
  'code',
  'design',
  'research',
  'automation',
  'tasks',
  'scheduled',
  'customize',
];

const EXPANDED_NAV_IDS = [
  'artifacts',
  'code',
  'design',
  'research',
  'automation',
  'tasks',
  'scheduled',
  'customize',
];

const RAIL_STEPS: Array<{
  navId: string;
  expectTestId: string;
  expectSelector?: string;
}> = [
  { navId: 'artifacts', expectTestId: 'agi-work-artifacts' },
  { navId: 'code', expectTestId: 'code-workspace' },
  { navId: 'design', expectTestId: 'design-workspace' },
  { navId: 'research', expectTestId: 'research-workspace' },
  {
    navId: 'automation',
    expectTestId: 'desktop-automation',
    expectSelector: '[data-testid="desktop-automation"] button[title="Refresh triggers"]',
  },
  {
    navId: 'tasks',
    expectTestId: 'desktop-agent-tasks',
    expectSelector: '[data-testid="desktop-agent-tasks"] #agent-task-goal',
  },
  { navId: 'scheduled', expectTestId: 'agi-work-scheduled' },
  { navId: 'projects', expectTestId: 'agi-work-projects' },
];

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
    await closeAnySettingsDialog();

    const expandSidebar = await $('button[aria-label="Expand sidebar"]');
    if ((await expandSidebar.isExisting()) && (await expandSidebar.isDisplayed())) {
      await expandSidebar.click();
      await $('button[aria-label="Collapse sidebar"]').waitForDisplayed({ timeout: 5_000 });
    }

    rawKeyBaseline = await collectRawKeys();
    console.log('SWEEP baseline raw i18n keys:', JSON.stringify(rawKeyBaseline));
    console.log('SWEEP screenshots →', SCREEN_DIR);

    await shot('00-shell-local');
  });

  after(async function () {
    this.timeout(120_000);
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
          {
            testId: step.expectTestId,
            selectorPresent: step.expectSelector,
            forbidTestId: 'agi-work-projects',
          },
          6, // looks, not ms — lazy panels (CodeWorkspace) need several
        ),
      );
      await shot(`${String(index + 1).padStart(2, '0')}-panel-${step.navId}`);
      assertStep(result);
    });
  }

  it('Tasks nav badge never claims work that does not exist', async () => {
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
    await shot('08-panel-projects');
    assertStep(result, false);
  });

  it('"New chat" returns to the chat composer', async function () {
    this.timeout(90_000);
    const result = record(
      await sweepStep(
        'rail:new-chat',
        { text: 'New chat', within: '[data-v3-shell]' },
        {
          selectorPresent: 'textarea[aria-label="Chat message input"]',
          forbidTestId: 'agi-work-projects',
        },
      ),
    );
    await shot('09-panel-chat');
    assertStep(result);
  });

  it('"New project" opens the create-project dialog', async function () {
    this.timeout(90_000);
    const result = record(
      await sweepStep('rail:new-project', { ariaLabel: 'New project' }, { dialog: true }, 8),
    );
    expect(result.clicked).toBe(true);
    expect(result.deadControlToasts).toEqual([]);
    expect(result.errorBoundary).toBe(null);
    expect(result.passed).toBe(true);

    await waitForInteractiveDialog();
    await shot('10-dialog-new-project');
    await browser.keys('Escape');
    await waitForNoVisibleDialog('Create-project dialog');
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
    await waitForInteractiveDialog();
    await shot('11-modal-search');
    expect(result.clicked).toBe(true);
    expect(result.deadControlToasts).toEqual([]);
    expect(result.passed).toBe(true);

    await browser.keys('Escape');
    await waitForNoVisibleDialog('Search modal');
  });

  it('an existing project opens an interactive edit dialog and Escape closes it', async function () {
    this.timeout(180_000);
    const createDialog = record(
      await sweepStep(
        'project-edit:create-fixture',
        { ariaLabel: 'New project' },
        { dialog: true },
        8,
      ),
    );
    assertStep(createDialog, false);
    await waitForInteractiveDialog();

    const projectName = `Native edit sweep ${Date.now()}`;
    const nameInput = await $('#project-name');
    await nameInput.setValue(projectName);
    const createButton = await $('button=Create project');
    await createButton.waitForClickable({ timeout: 5_000 });
    await createButton.click();

    await browser.waitUntil(
      () =>
        browser.execute((expectedName: string) => {
          const dialogOpen = Array.from(
            document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
          ).some((dialog) => (dialog as HTMLElement).getClientRects().length > 0);
          const activeProjectHeading = Array.from(document.querySelectorAll('h1')).some(
            (heading) => (heading.textContent ?? '').trim() === expectedName,
          );
          return !dialogOpen && activeProjectHeading;
        }, projectName),
      {
        timeout: 20_000,
        interval: 200,
        timeoutMsg: 'Created project did not open its real detail view',
      },
    );

    const editDialog = record(
      await sweepStep(
        'project-edit:settings',
        { ariaLabel: 'Project settings' },
        { dialog: true },
        8,
      ),
    );
    assertStep(editDialog, false);
    await waitForInteractiveDialog();

    const editTitleVisible = await browser.execute(() => {
      const dialog = Array.from(
        document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
      ).find((candidate) => (candidate as HTMLElement).getClientRects().length > 0);
      return Array.from(dialog?.querySelectorAll('h1, h2, h3, [role="heading"]') ?? []).some(
        (heading) => (heading.textContent ?? '').trim() === 'Edit Project',
      );
    });
    expect(editTitleVisible).toBe(true);
    await shot('12-dialog-edit-project');

    await browser.keys('Escape');
    await waitForNoVisibleDialog('Edit-project dialog');
  });

  it('collapse rail exposes the same destinations and expand restores them', async function () {
    this.timeout(120_000);

    const collapsed = record(
      await sweepStep(
        'rail:collapse',
        { ariaLabel: 'Collapse sidebar' },
        { selectorPresent: '[data-nav-id]' },
      ),
    );
    expect(collapsed.clicked).toBe(true);
    await shot('12-sidebar-collapsed');

    let expanded: SweepStepResult | null = null;
    try {
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
              selectorPresent: target.expectSelector,
              ...(isProjects ? {} : { forbidTestId: 'agi-work-projects' }),
            },
            6,
          ),
        );
        await shot(`13-rail-${target.navId}`);
        assertStep(result, !isProjects);
      }

      const customize = record(
        await sweepStep('rail:customize', { navId: 'customize' }, { dialog: true }, 8),
      );
      assertStep(customize, false);
      await waitForSettingsReady();
      await shot('13-rail-customize-settings');
      expect(await closeAnySettingsDialog()).toBe(true);
    } finally {
      expanded = record(
        await sweepStep(
          'rail:expand',
          { ariaLabel: 'Expand sidebar' },
          { selectorPresent: 'aside[data-v3-sidebar][data-collapsed="false"]' },
        ),
      );
      if (!expanded.passed) {
        await browser.execute(() => {
          const sidebar = document.querySelector('aside[data-v3-sidebar]');
          if (sidebar?.getAttribute('data-collapsed') !== 'true') return;
          (
            sidebar.querySelector('button[aria-label="Expand sidebar"]') as HTMLElement | null
          )?.click();
        });
      }
      await shot('14-sidebar-expanded');
    }

    expect(expanded).not.toBeNull();
    assertStep(expanded!, false);
    expect(await listNavIds()).toEqual(EXPANDED_NAV_IDS);
  });

  it('expanded Customize nav opens Settings and closes cleanly', async function () {
    this.timeout(120_000);
    const result = record(
      await sweepStep('nav:customize', { navId: 'customize' }, { dialog: true }, 8),
    );
    assertStep(result, false);

    await waitForSettingsReady();
    await shot('14-expanded-customize-settings');
    expect(await closeAnySettingsDialog()).toBe(true);
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
    await shot('15-settings-open');
  });

  for (const [index, label] of SETTINGS_TABS.entries()) {
    it(`settings tab "${label}" renders content without an error boundary`, async function () {
      this.timeout(90_000);
      await waitForSettingsReady();

      const clicked = await clickButtonWithText(
        'nav[aria-label="Settings sections"]',
        label,
        'prefix',
      );

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

      await shot(`16-${String(index + 1).padStart(2, '0')}-settings-${slug(label)}`);

      expect(clicked).toBe(true);
      expect(snap.hasErrorBoundary).toBe(false);
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
    expect(state.navIds).toContain('code');
  });
});

const RAW_KEY_SHAPE_SOURCE = '^[a-z][a-zA-Z]*(\\.[a-z][a-zA-Z0-9_]*)+$';
const DOMAIN_LIKE_SOURCE = '\\.(com|org|net|io|dev|app|ai|md|json|ts|tsx|js|rs|html|css|toml)$';

function slug(label: string): string {
  return label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}
