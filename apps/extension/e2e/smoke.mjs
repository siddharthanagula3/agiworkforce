// Real-UI smoke for the Chrome extension: load the built dist/ into Chromium
// via --load-extension and assert the side panel + options pages render their
// primary UI without uncaught console/page errors. Platform-appropriate real-UI
// tool for an MV3 extension = Playwright launching a persistent context with the
// unpacked extension (Playwright is already a workspace dependency).
//
// Run: pnpm --filter @agiworkforce/extension build && node apps/extension/e2e/smoke.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function fail(msg) {
  console.error('SMOKE FAIL:', msg);
  process.exitCode = 1;
}

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extId = new URL(sw.url()).host;
  console.log('extension id:', extId);
  console.log('service worker booted:', sw.url());

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
    await page.waitForTimeout(1500); // let buildUI()/injectStyles() run
    const bodyLen = await page.evaluate(() => document.body.innerHTML.length);
    const found = await page.evaluate(
      (ms) => ms.filter((m) => document.body.innerHTML.includes(m)),
      markers,
    );
    console.log(`\n[${name}] bodyLen=${bodyLen} markersFound=${JSON.stringify(found)}`);
    if (errors.length) console.log(`[${name}] console/page errors:`, errors.slice(0, 10));
    if (bodyLen < 200) fail(`${name}: body did not render (len ${bodyLen})`);
    if (found.length === 0) fail(`${name}: none of the expected UI markers rendered`);
    // Fail on genuine code defects: uncaught page exceptions, and CSP violations
    // (an inline style/script silently dropped by the extension's strict CSP — the
    // exact class of bug this harness first caught on the options page). The local
    // bridge/gateway being unreachable in a bare harness can emit expected network
    // console errors, so those are logged but not failed on.
    const pageExceptions = errors.filter((e) => e.startsWith('pageerror:'));
    if (pageExceptions.length)
      fail(`${name}: uncaught page exception(s): ${pageExceptions.join(' | ')}`);
    const cspViolations = errors.filter((e) => /Content Security Policy/i.test(e));
    if (cspViolations.length)
      fail(`${name}: CSP violation(s): ${cspViolations.map((e) => e.slice(0, 120)).join(' | ')}`);
    await page.close();
  }

  // Primary workflow — persistence -> UI render: seed an allowlisted origin into
  // chrome.storage, reload the options page, and assert the real refreshAllowlist
  // path reads it back and renders it (the site allowlist is the extension's core
  // trust control, so its persisted state must survive a reload and show up).
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
    const rendered = await page.evaluate(
      (origin) => document.body.innerHTML.includes(origin),
      ORIGIN,
    );
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

  console.log('\nSMOKE RESULT:', process.exitCode ? 'FAIL' : 'PASS');
} catch (e) {
  fail('exception: ' + (e && e.stack ? e.stack : String(e)));
} finally {
  await context.close();
}
