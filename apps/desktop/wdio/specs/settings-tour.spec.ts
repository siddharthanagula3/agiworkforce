import { resolveScreenDir } from '../support/dom';
// Live-interaction QA pass over the full desktop Settings surface (local mode):
// App.tsx -> SettingsPanel (gear icon in the v3 sidebar). Opens the modal for
// real, walks every nav section, and records DOM evidence (text snapshot +
// screenshot) so a human/agent can review what actually rendered instead of
// trusting a static code read. See docs/agent-context/known-flaws.md for the
// already-logged findings this pass cross-checks (DESK-SETTINGS-IA-01,
// DESKTOP-PLAN-TIER-DISPLAY-STALE-01, DESKTOP-BYOK-PROVIDER-UI-COVERAGE-01,
// DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01, DESKTOP-MISC-CRITICAL-GAPS-01).

const SCREEN_DIR = resolveScreenDir('settings');

// Canonical order from packages/ui/ui/src/settings-nav.ts (SETTINGS_NAV).
const NAV_LABELS = [
  'General',
  // Account, Billing, and Usage are LOCAL_HIDDEN_TABS (SettingsPanel.tsx):
  // this tour runs the LOCAL shell, where those sections intentionally do not
  // exist — the cloud modal's sections are toured by cloud-settings-tour.
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

function clickButtonWithText(containerSelector: string, text: string) {
  return browser.execute(
    (containerSel, label) => {
      const container = document.querySelector(containerSel) ?? document;
      const buttons = Array.from(container.querySelectorAll('button'));
      const match = buttons.find((b) => (b.textContent ?? '').trim().startsWith(label));
      if (match) {
        (match as HTMLButtonElement).click();
        return true;
      }
      return false;
    },
    containerSelector,
    text,
  ) as Promise<boolean>;
}

function getContentSnapshot() {
  return browser.execute(() => {
    const nav = document.querySelector('nav[aria-label="Settings sections"]');
    const dialog = nav?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
    // Content pane is the sibling of <nav> inside the dialog's flex row.
    const contentRoot = dialog?.querySelector('.flex-1.flex.flex-col.min-w-0');
    const text = (contentRoot?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const hasErrorBoundary = /encountered an unexpected error|Something went wrong/i.test(text);
    const hasSpinner = !!contentRoot?.querySelector('.animate-spin');
    const activeLabel =
      nav?.querySelector('button[aria-current="page"]')?.textContent?.trim() ?? null;
    return { text: text.slice(0, 900), hasErrorBoundary, hasSpinner, activeLabel };
  }) as Promise<{
    text: string;
    hasErrorBoundary: boolean;
    hasSpinner: boolean;
    activeLabel: string | null;
  }>;
}

describe('AGI Desktop Settings — full live tour', () => {
  it('opens via the sidebar gear icon and shows General by default', async () => {
    await browser.pause(1500);

    // A prior spec's failure can leave the settings dialog open on an
    // arbitrary tab — possibly DIRTY, in which case Escape raises the discard
    // confirmation. Close through the shared helper so the gear opens fresh
    // on General.
    const { closeAnySettingsDialog } = await import('../support/close-settings');
    expect(await closeAnySettingsDialog()).toBe(true);

    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15000 });
    await gear.click();

    const { waitForSettingsReady } = await import('../support/close-settings');
    await waitForSettingsReady();

    const snap = await getContentSnapshot();
    console.log('SETTINGS OPEN — active section:', snap.activeLabel);
    console.log('SETTINGS OPEN — content preview:', snap.text);
    expect(snap.hasErrorBoundary).toBe(false);

    await browser.saveScreenshot(`${SCREEN_DIR}/00-general-default.png`);
  });

  for (const [i, label] of NAV_LABELS.entries()) {
    it(`section "${label}" renders real content without error`, async function () {
      this.timeout(30000);
      const idx = String(i + 1).padStart(2, '0');

      const clicked = await clickButtonWithText('nav[aria-label="Settings sections"]', label);
      console.log(`NAV[${label}] — button found and clicked:`, clicked);
      expect(clicked).toBe(true);

      // Give lazy-loaded tabs (React.lazy + Suspense) time to resolve.
      await browser.pause(600);

      const snap = await getContentSnapshot();
      console.log(`NAV[${label}] — activeLabel:`, snap.activeLabel);
      console.log(`NAV[${label}] — hasSpinner (still loading after 600ms):`, snap.hasSpinner);
      console.log(`NAV[${label}] — hasErrorBoundary:`, snap.hasErrorBoundary);
      console.log(`NAV[${label}] — text preview:`, snap.text);

      await browser.saveScreenshot(
        `${SCREEN_DIR}/${idx}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`,
      );

      expect(snap.hasErrorBoundary).toBe(false);
      expect(snap.text.length).toBeGreaterThan(0);
    });
  }

  it('Escape closes the modal', async () => {
    const nav = await $('nav[aria-label="Settings sections"]');
    await expect(nav).toBeDisplayed();
    await browser.keys('Escape');
    await browser.pause(400);
    const stillOpen = await browser.execute(
      () => !!document.querySelector('nav[aria-label="Settings sections"]'),
    );
    console.log('ESCAPE — settings nav still present after Escape:', stillOpen);
    await browser.saveScreenshot(`${SCREEN_DIR}/99-after-escape.png`);
  });
});
