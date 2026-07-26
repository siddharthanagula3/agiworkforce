// Real-UI smoke for the Chrome extension: load the built dist/ into Chromium via
// --load-extension and drive the primary user workflows through the actual UI —
// render, no console/CSP errors, composer input, drawer navigation, model picker,
// allowlist persistence, and end-to-end job autofill with real content-script
// injection. Platform-appropriate real-UI tool for an MV3 extension = Playwright
// launching a persistent context with the unpacked extension (already a workspace
// dependency). Backend-dependent flows (managed chat, computer-use, auth/pairing)
// need a live gateway and are out of scope for this offline harness.
//
// Run: pnpm --filter @agiworkforce/extension build && node apps/extension/e2e/smoke.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function fail(msg) {
  console.error('SMOKE FAIL:', msg);
  process.exitCode = 1;
}

// Synthetic Greenhouse application form, served by a local HTTP server that
// Chromium's --host-resolver-rules maps `boards.greenhouse.io` onto, so the tab's
// real URL is http://boards.greenhouse.io/... — triggering the extension's
// URL-based platform detection AND real content-script injection.
const FORM_HTML =
  '<!doctype html><html><head><title>Apply</title></head><body>' +
  '<form id="application_form">' +
  '<input id="first_name" name="job_application[first_name]" />' +
  '<input id="last_name" name="job_application[last_name]" />' +
  '<input id="email" name="job_application[email]" type="email" />' +
  '<input id="phone" name="job_application[phone]" />' +
  '</form></body></html>';
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(FORM_HTML);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const formPort = server.address().port;

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    `--host-resolver-rules=MAP boards.greenhouse.io 127.0.0.1:${formPort}`,
  ],
});

try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extId = new URL(sw.url()).host;
  console.log('extension id:', extId);
  console.log('service worker booted:', sw.url());

  // ── Render + logs: both extension pages build their primary UI cleanly ──
  for (const [name, path, markers] of [
    ['side_panel', 'src/side_panel.html', ['sp-messages', 'sp-composer', 'sp-input', 'sp-send']],
    ['options', 'src/options.html', ['opt-']],
  ]) {
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`chrome-extension://${extId}/${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(1500);
    const bodyLen = await page.evaluate(() => document.body.innerHTML.length);
    const found = await page.evaluate(
      (ms) => ms.filter((m) => document.body.innerHTML.includes(m)),
      markers,
    );
    console.log(`\n[${name}] bodyLen=${bodyLen} markersFound=${JSON.stringify(found)}`);
    if (errors.length) console.log(`[${name}] console/page errors:`, errors.slice(0, 10));
    if (bodyLen < 200) fail(`${name}: body did not render (len ${bodyLen})`);
    if (found.length === 0) fail(`${name}: none of the expected UI markers rendered`);
    const pageExceptions = errors.filter((e) => e.startsWith('pageerror:'));
    if (pageExceptions.length)
      fail(`${name}: uncaught page exception(s): ${pageExceptions.join(' | ')}`);
    const csp = errors.filter((e) => /Content Security Policy/i.test(e));
    if (csp.length)
      fail(`${name}: CSP violation(s): ${csp.map((e) => e.slice(0, 120)).join(' | ')}`);
    await page.close();
  }

  // ── Signed-out account state: options must not offer a fake Log out action ──
  {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/src/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(1500);
    const accountState = await page.evaluate(() => ({
      signInVisible: Boolean(document.getElementById('opt-signin-btn')),
      logOutVisible: Boolean(document.getElementById('opt-logout-btn')),
    }));
    if (!accountState.signInVisible || accountState.logOutVisible) {
      fail(`signed-out options account: unexpected controls ${JSON.stringify(accountState)}`);
    }
    await page.close();
  }

  // ── Side-panel interactions: composer input, drawer nav, model picker ──
  {
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.setViewportSize({ width: 400, height: 800 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`chrome-extension://${extId}/src/side_panel.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.evaluate(
      () => new Promise((res) => chrome.storage.local.set({ agi_onboarding_completed: true }, res)),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const visibleSecondaryChrome = await page.evaluate(() =>
      [
        'sp-auth-bar',
        'sp-toolbar',
        'sp-prompt-chips',
        'sp-empty-icon',
        'sp-empty-headline',
        'sp-empty-subtext',
      ].filter((id) => {
        const element = document.getElementById(id);
        if (!element) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }),
    );
    if (visibleSecondaryChrome.length > 0) {
      fail(
        `chat surface: secondary controls should stay behind menus, but these are visible: ${visibleSecondaryChrome.join(', ')}`,
      );
    }

    const signedOutGate = await page.evaluate(() => {
      const gate = document.getElementById('sp-cloud-gate');
      const input = document.getElementById('sp-input');
      return {
        gateVisible:
          !!gate &&
          getComputedStyle(gate).display !== 'none' &&
          getComputedStyle(gate).visibility !== 'hidden',
        inputDisabled: input instanceof HTMLTextAreaElement && input.disabled,
      };
    });
    if (!signedOutGate.gateVisible || !signedOutGate.inputDisabled) {
      fail(
        `signed-out chat: expected an actionable sign-in gate and disabled composer, got ${JSON.stringify(signedOutGate)}`,
      );
    }

    const composerMetrics = await page.evaluate(() => {
      const shell = document.getElementById('sp-composer-shell');
      const history = document.getElementById('sp-history-btn');
      return {
        shellHeight: shell?.getBoundingClientRect().height ?? 0,
        historyVisible:
          !!history &&
          getComputedStyle(history).display !== 'none' &&
          getComputedStyle(history).visibility !== 'hidden',
      };
    });
    if (composerMetrics.shellHeight < 100 || !composerMetrics.historyVisible) {
      fail(
        `chat surface: expected a full composer and visible history, got ${JSON.stringify(composerMetrics)}`,
      );
    }

    // Managed authenticated chat needs a live gateway and account, which this
    // offline harness intentionally does not provide. Re-enable the textarea
    // only to verify its local interaction behavior after the signed-out state
    // above has been asserted.
    await page.evaluate(() => {
      const input = document.getElementById('sp-input');
      if (input instanceof HTMLTextAreaElement) input.disabled = false;
    });
    await page.fill('#sp-input', 'hello from the smoke');
    const typed = await page.inputValue('#sp-input');
    if (typed !== 'hello from the smoke')
      fail(`composer: input did not accept text (got "${typed}")`);

    await page.click('#sp-history-btn');
    await page.waitForTimeout(300);
    const historyDrawer = await page.evaluate(() => ({
      drawerOpen: document.getElementById('sp-drawer')?.classList.contains('open') === true,
      historyOpen: !document.getElementById('sp-drawer-history-list')?.hasAttribute('hidden'),
      title: document.getElementById('sp-drawer-title')?.textContent,
      unfinishedActions: [
        document.getElementById('sp-drawer-console-btn'),
        document.getElementById('sp-drawer-open-desktop-btn'),
      ].filter(Boolean).length,
    }));
    if (
      !historyDrawer.drawerOpen ||
      !historyDrawer.historyOpen ||
      historyDrawer.title !== 'AGI in Chrome' ||
      historyDrawer.unfinishedActions !== 0
    ) {
      fail(`history drawer: unexpected public surface ${JSON.stringify(historyDrawer)}`);
    }
    await page.evaluate(() => document.getElementById('sp-drawer-overlay')?.click());
    await page.waitForTimeout(200);

    await page.click('#sp-menu-btn');
    const drawerOpen = await page.evaluate(
      () => document.getElementById('sp-drawer')?.classList.contains('open') === true,
    );
    if (!drawerOpen) fail('drawer: menu button did not open the navigation drawer');
    await page.evaluate(() => document.getElementById('sp-drawer-overlay')?.click());

    await page.click('#sp-model-selector-btn');
    await page.waitForTimeout(300);
    const modelOpen = await page.evaluate(() => {
      const d = document.getElementById('sp-model-dropdown');
      return !!d && (d.classList.contains('open') || getComputedStyle(d).display !== 'none');
    });
    if (!modelOpen) fail('model picker: selector button did not open the model dropdown');
    const signedOutModelLabel = await page
      .locator('#sp-model-dropdown .provider-count-badge')
      .textContent();
    if (signedOutModelLabel !== 'Sign in for models') {
      fail(`model picker: expected an honest signed-out label, got "${signedOutModelLabel}"`);
    }
    await page.click('#sp-model-selector-btn');

    const composerModes = await page.evaluate(() => ({
      inertAutonomyControlPresent: Boolean(document.getElementById('sp-action-mode-toggle')),
      quickModePresent: Boolean(document.getElementById('sp-quick-mode-toggle')),
    }));
    if (composerModes.inertAutonomyControlPresent || !composerModes.quickModePresent) {
      fail(`composer modes: unexpected controls ${JSON.stringify(composerModes)}`);
    }

    // Workflows exposes only controls that execute today. The previous shortcut
    // modal advertised Start from + Schedule fields with no replay/scheduler
    // consumer, and onboarding advertised a slash finder that did not exist.
    await page.click('#sp-menu-btn');
    await page.click('#sp-drawer-wf-btn');
    await page.click('#sp-wf-create-shortcut-btn');
    const shortcutSurface = await page.evaluate(() => {
      const onboardingStep = document.querySelector('.sp-ob-step[data-step="3"]');
      return {
        modalOpen:
          document.getElementById('sp-create-shortcut-overlay')?.classList.contains('open') ===
          true,
        namePresent: Boolean(document.getElementById('sp-sc-name')),
        promptPresent: Boolean(document.getElementById('sp-sc-prompt')),
        deadStartFromPresent: Boolean(document.getElementById('sp-sc-starturl')),
        deadSchedulePresent: Boolean(document.getElementById('sp-sc-schedule')),
        onboardingCopy: onboardingStep?.textContent ?? '',
      };
    });
    if (
      !shortcutSurface.modalOpen ||
      !shortcutSurface.namePresent ||
      !shortcutSurface.promptPresent ||
      shortcutSurface.deadStartFromPresent ||
      shortcutSurface.deadSchedulePresent ||
      !shortcutSurface.onboardingCopy.includes('Open Workflows') ||
      shortcutSurface.onboardingCopy.includes('search shortcuts')
    ) {
      fail(
        `workflows: misleading or unfinished shortcut controls ${JSON.stringify(shortcutSurface)}`,
      );
    }

    const pageExceptions = errors.filter((e) => e.startsWith('pageerror:'));
    if (pageExceptions.length)
      fail(`interactions: uncaught page exception(s): ${pageExceptions.join(' | ')}`);
    console.log(
      `\n[interactions] composer=ok drawer=${drawerOpen} modelPicker=${modelOpen} quickMode=${composerModes.quickModePresent}`,
    );
    await page.close();
  }

  // ── Persistence -> UI render: the site allowlist survives a reload ──
  {
    const ORIGIN = 'https://persist-smoke.example.com';
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/src/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.evaluate(
      (origin) =>
        new Promise((res) => chrome.storage.local.set({ agi_site_allowlist: [origin] }, res)),
      ORIGIN,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const rendered = await page.evaluate((o) => document.body.innerHTML.includes(o), ORIGIN);
    const stored = await page.evaluate(
      () =>
        new Promise((res) =>
          chrome.storage.local.get('agi_site_allowlist', (r) => res(r.agi_site_allowlist)),
        ),
    );
    console.log(`\n[persistence] stored=${JSON.stringify(stored)} renderedInDom=${rendered}`);
    if (!Array.isArray(stored) || !stored.includes(ORIGIN))
      fail('persistence: allowlist origin did not round-trip through chrome.storage');
    if (!rendered) fail('persistence: persisted allowlist origin did not render after reload');
    await page.close();
  }

  // ── Job autofill end to end (the extension's core value) ──
  {
    const FORM_URL = 'http://boards.greenhouse.io/smoketestco/jobs/1234567';
    const PROFILE = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '555-0100',
    };
    const ext = await context.newPage();
    await ext.goto(`chrome-extension://${extId}/src/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await ext.evaluate(
      (p) => new Promise((res) => chrome.storage.local.set({ agi_autofill_profile: p }, res)),
      PROFILE,
    );

    const form = await context.newPage();
    await form.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await form.waitForTimeout(1500); // content-script injection at document_idle

    const runResult = await ext.evaluate(async (urlPart) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url && t.url.includes(urlPart));
      if (!tab || tab.id == null) return { error: 'form tab not found' };
      try {
        return await chrome.tabs.sendMessage(tab.id, { type: 'AGI_RUN_AUTOFILL' });
      } catch (e) {
        return { error: String(e) };
      }
    }, 'boards.greenhouse.io/smoketestco');

    const filledFirst = await form.inputValue('#first_name');
    const filledEmail = await form.inputValue('#email');
    console.log(
      `\n[autofill] success=${runResult && runResult.success} first_name="${filledFirst}" email="${filledEmail}"`,
    );
    if (!runResult || runResult.success !== true)
      fail(
        `autofill: AGI_RUN_AUTOFILL did not succeed: ${JSON.stringify(runResult).slice(0, 200)}`,
      );
    if (filledFirst !== PROFILE.firstName || filledEmail !== PROFILE.email)
      fail(
        `autofill: fields not filled from profile (first_name="${filledFirst}", email="${filledEmail}")`,
      );
    await form.close();
    await ext.close();
  }

  console.log('\nSMOKE RESULT:', process.exitCode ? 'FAIL' : 'PASS');
} catch (e) {
  fail('exception: ' + (e && e.stack ? e.stack : String(e)));
} finally {
  await context.close();
  await new Promise((r) => server.close(r));
}
