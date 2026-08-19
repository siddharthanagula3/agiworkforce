import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedPackage = process.argv[2];
const requestedScreenshotDirectory = process.env.AGI_E2E_SCREENSHOT_DIR?.trim();

if (requestedScreenshotDirectory && !requestedPackage) {
  throw new Error(
    'AGI_E2E_SCREENSHOT_DIR requires an exact packaged extension path (for example ./extension.zip)',
  );
}

const screenshotDirectory = requestedScreenshotDirectory
  ? resolve(process.cwd(), requestedScreenshotDirectory)
  : undefined;

if (screenshotDirectory) {
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  console.log(`screenshot capture enabled: ${screenshotDirectory}`);
}

async function captureScreenshot(page, filename, options = {}) {
  if (!screenshotDirectory) return;
  const outputPath = join(screenshotDirectory, filename);
  await page.screenshot({
    path: outputPath,
    type: 'png',
    animations: 'disabled',
    caret: 'hide',
    ...options,
  });
  console.log(`[screenshot] ${outputPath}`);
}

function runChecked(command, args, failureMessage) {
  const result = spawnSync(command, args, {
    cwd: extensionRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${failureMessage}: ${command} is required`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${failureMessage}: ${result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`}`,
    );
  }
  return result.stdout;
}

function resolveExtensionDirectory() {
  if (!requestedPackage) {
    return { directory: resolve(extensionRoot, 'dist'), cleanup: undefined };
  }

  const packagePath = resolve(process.cwd(), requestedPackage);
  runChecked(
    process.execPath,
    [resolve(extensionRoot, 'scripts', 'verify-package.mjs'), packagePath],
    'packaged extension verification failed',
  );

  const extractedRoot = fs.mkdtempSync(join(os.tmpdir(), 'agi-extension-package-'));
  try {
    runChecked(
      'unzip',
      ['-q', packagePath, '-d', extractedRoot],
      'packaged extension extraction failed',
    );
  } catch (error) {
    fs.rmSync(extractedRoot, { recursive: true, force: true });
    throw error;
  }

  const sha256 = createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
  console.log(
    `packaged artifact: ${packagePath} (${fs.statSync(packagePath).size} bytes, sha256 ${sha256})`,
  );
  return {
    directory: extractedRoot,
    cleanup: () => fs.rmSync(extractedRoot, { recursive: true, force: true }),
  };
}

const extensionBundle = resolveExtensionDirectory();
const DIST = extensionBundle.directory;
const extensionManifest = JSON.parse(fs.readFileSync(resolve(DIST, 'manifest.json'), 'utf8'));
const usesNonRoutableAuthFixture = (extensionManifest.host_permissions ?? []).some((permission) => {
  try {
    return new URL(permission.replace(/\*$/u, '')).hostname.endsWith('.invalid');
  } catch {
    return false;
  }
});

function fail(msg) {
  console.error('SMOKE FAIL:', msg);
  process.exitCode = 1;
}

const FORM_HTML =
  '<!doctype html><html><head><title>Apply</title></head><body>' +
  '<form id="application_form" tool-name="submit_application" tool-description="Submit this synthetic application">' +
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
const hostResolverRules = [
  `MAP boards.greenhouse.io 127.0.0.1:${formPort}`,
  process.env.AGI_EXTENSION_E2E_HOST_RESOLVER_RULES?.trim(),
]
  .filter(Boolean)
  .join(',');

let context;

try {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      `--host-resolver-rules=${hostResolverRules}`,
    ],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 20000 });
  sw.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(
        `[service-worker ${message.type()}]`,
        message.text(),
        JSON.stringify(message.location()),
      );
    }
  });
  const extId = new URL(sw.url()).host;
  console.log('extension id:', extId);
  console.log('service worker booted:', sw.url());

  if (screenshotDirectory) {
    await sw.evaluate(() => chrome.storage.local.set({ agi_onboarding_completed: true }));
  }

  for (const [name, path, markers] of [
    ['side_panel', 'src/side_panel.html', ['sp-messages', 'sp-composer', 'sp-input', 'sp-send']],
    ['options', 'src/options.html', ['opt-']],
  ]) {
    const page = await context.newPage();
    if (screenshotDirectory && name === 'side_panel') {
      await page.setViewportSize({ width: 400, height: 800 });
    }
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
    if (name === 'side_panel') {
      const runGeneration = Date.now() * 1000;
      const initialStopState = await page.evaluate(() => ({
        stopExists: Boolean(document.querySelector('.sp-cu-stop-btn')),
        stopVisible: document.querySelector('.sp-cu-stop-btn')?.classList.contains('visible'),
      }));
      if (!initialStopState.stopExists || initialStopState.stopVisible) {
        fail(`side_panel: invalid initial Stop state ${JSON.stringify(initialStopState)}`);
      }
      await sw.evaluate(
        ({ runGeneration }) =>
          chrome.runtime.sendMessage({
            type: 'AGI_CU_STATE',
            status: 'running',
            runId: 'e2e-computer-use-run',
            runGeneration,
            tabId: 1,
          }),
        { runGeneration },
      );
      await page.waitForFunction(() =>
        document.querySelector('.sp-cu-stop-btn')?.classList.contains('visible'),
      );
      const runningState = await page.evaluate(() => ({
        stopText: document.querySelector('.sp-cu-stop-btn')?.textContent,
        runDisabled: document.querySelector('.sp-cu-run-btn')?.disabled,
      }));
      if (runningState.stopText !== 'Stop' || runningState.runDisabled !== true) {
        fail(
          `side_panel: computer-use running controls are dishonest ${JSON.stringify(runningState)}`,
        );
      }
      await captureScreenshot(page, 'agi-chrome-exact-computer-use-stop-running.png');
      await sw.evaluate(
        ({ runGeneration }) =>
          chrome.runtime.sendMessage({
            type: 'AGI_CU_STATE',
            status: 'stopped',
            runId: 'e2e-computer-use-run',
            runGeneration,
            tabId: 1,
          }),
        { runGeneration },
      );
      await page.waitForFunction(
        () => !document.querySelector('.sp-cu-stop-btn')?.classList.contains('visible'),
      );
      console.log('[side_panel] computer-use Stop lifecycle rendered');
    }
    await page.close();
  }

  {
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto(`chrome-extension://${extId}/src/side_panel.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    const now = Date.now();
    await page.evaluate(
      async ({ now }) => {
        const storedOwner = {
          accountId: 'history-smoke-account-a',
          authIncarnation: 'history-smoke-session-a',
        };
        await chrome.storage.session.remove('agi_browser_conversation_owners_v1');
        await chrome.storage.local.set({
          agi_onboarding_completed: true,
          agi_browser_conversations_v2: {
            version: 2,
            activeConversationId: 'history-chrome-review',
            activeOwner: storedOwner,
            conversations: [
              {
                id: 'history-chrome-review',
                owner: storedOwner,
                title: 'Chrome launch review',
                savedAt: now,
                routing: { selectedModel: 'auto', effort: 'high' },
                messages: [
                  {
                    role: 'user',
                    content: 'Review Chrome permission notes before launch',
                    timestamp: now,
                  },
                ],
              },
              {
                id: 'history-dinner',
                owner: storedOwner,
                title: 'Dinner ideas',
                savedAt: now - 1000,
                routing: { selectedModel: 'auto' },
                messages: [
                  {
                    role: 'user',
                    content: 'Suggest a vegetarian pasta',
                    timestamp: now - 1000,
                  },
                ],
              },
            ],
          },
        });
      },
      { now },
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    await page.click('#sp-history-btn');
    await page.waitForSelector('#sp-drawer-history-search:not([hidden])');
    await page.waitForTimeout(200);
    const ownerBoundary = await page.evaluate(async () => {
      const stored = await chrome.storage.local.get('agi_browser_conversations_v2');
      const ownerStore = await chrome.storage.session.get('agi_browser_conversation_owners_v1');
      return {
        storedCount: stored.agi_browser_conversations_v2?.conversations?.length ?? 0,
        visibleItems: document.querySelectorAll('.sp-drawer-history-item').length,
        leakedTitle: document.body.textContent?.includes('Chrome launch review') === true,
        panelOwnerCount: Object.keys(ownerStore.agi_browser_conversation_owners_v1?.owners ?? {})
          .length,
      };
    });
    if (
      ownerBoundary.storedCount !== 2 ||
      ownerBoundary.visibleItems !== 0 ||
      ownerBoundary.leakedTitle ||
      ownerBoundary.panelOwnerCount !== 0
    ) {
      fail(`signed-out history crossed its account owner: ${JSON.stringify(ownerBoundary)}`);
    }

    const outbound = await page.evaluate(async () => {
      const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
      globalThis.__agiSignedOutChatMessage = null;
      chrome.runtime.sendMessage = (message, ...args) => {
        if (message?.type === 'CHAT_MESSAGE') {
          globalThis.__agiSignedOutChatMessage = structuredClone(message);
        }
        return originalSendMessage(message, ...args);
      };
      const input = document.getElementById('sp-input');
      const send = document.getElementById('sp-send-btn');
      const messageCountBefore = document.querySelectorAll('#sp-messages > *').length;
      input.disabled = false;
      input.value = 'Do not send without an owner';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      send.disabled = false;
      send.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        captured: globalThis.__agiSignedOutChatMessage,
        messageCountBefore,
        messageCountAfter: document.querySelectorAll('#sp-messages > *').length,
        thinkingCount: document.querySelectorAll('.sp-thinking-wrap').length,
      };
    });
    if (
      outbound.captured !== null ||
      outbound.messageCountAfter !== outbound.messageCountBefore ||
      outbound.thinkingCount !== 0
    ) {
      fail(`signed-out composer crossed its account owner: ${JSON.stringify(outbound)}`);
    }
    console.log(
      `\n[history-owner] signedOutHidden=true stored=${ownerBoundary.storedCount} outboundBlocked=true`,
    );
    await page.evaluate(() => chrome.storage.local.remove('agi_browser_conversations_v2'));
    await page.close();
  }

  async function runWebMCPSmoke(control, target, baseUrl) {
    const parsedBaseUrl = new URL(baseUrl);
    const webMCPOrigin = parsedBaseUrl.origin;
    const targetUrlPart = `${parsedBaseUrl.host}${parsedBaseUrl.pathname}`;
    await control.evaluate(
      (origin) => chrome.storage.local.set({ agi_site_allowlist: [origin] }),
      webMCPOrigin,
    );
    const firstUrl = `${baseUrl}?account=one#start`;
    const secondUrl = `${baseUrl}?account=two#details`;
    await target.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await target.waitForTimeout(1500);
    await target.evaluate((url) => history.replaceState({}, '', url), firstUrl);
    await target.waitForTimeout(300);

    async function discoverTools(pageGeneration) {
      return control.evaluate(
        async ({ generation, targetUrlPart }) => {
          const tabs = await chrome.tabs.query({});
          const targetTab = tabs.find((tab) => tab.url?.includes(targetUrlPart));
          if (!targetTab?.id) return { success: false, error: 'Synthetic target tab not found' };
          let response;
          for (let attempt = 0; attempt < 8; attempt += 1) {
            response = await chrome.runtime.sendMessage({
              type: 'WEBMCP_DISCOVER_TOOLS',
              tabId: targetTab.id,
              pageGeneration: generation,
            });
            if (response?.success === true) return response;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          return response;
        },
        { generation: pageGeneration, targetUrlPart },
      );
    }

    const firstDiscovery = await discoverTools(41);
    await target.evaluate((url) => history.pushState({}, '', url), secondUrl);
    await target.waitForTimeout(300);
    const secondDiscovery = await discoverTools(42);
    const webmcpState = {
      firstSuccess: firstDiscovery?.success,
      firstError: firstDiscovery?.error,
      firstGeneration: firstDiscovery?.pageGeneration,
      firstUrl: firstDiscovery?.url,
      firstTools: firstDiscovery?.tools?.map((tool) => tool.name),
      secondSuccess: secondDiscovery?.success,
      secondError: secondDiscovery?.error,
      secondGeneration: secondDiscovery?.pageGeneration,
      secondUrl: secondDiscovery?.url,
      secondTools: secondDiscovery?.tools?.map((tool) => tool.name),
    };
    if (
      webmcpState.firstSuccess !== true ||
      webmcpState.secondSuccess !== true ||
      webmcpState.firstGeneration !== 41 ||
      webmcpState.secondGeneration !== 42 ||
      webmcpState.firstUrl !== baseUrl ||
      webmcpState.secondUrl !== webmcpState.firstUrl ||
      !webmcpState.firstTools?.includes('submit_application') ||
      !webmcpState.secondTools?.includes('submit_application')
    ) {
      fail(`WebMCP runtime discovery/epoch mismatch ${JSON.stringify(webmcpState)}`);
    }
    console.log(
      `\n[webmcp] realBackground=ok generations=${webmcpState.firstGeneration}->${webmcpState.secondGeneration} redactedUrl=${webmcpState.secondUrl}`,
    );
  }

  {
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto(`chrome-extension://${extId}/src/side_panel.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.evaluate(async () => {
      await chrome.storage.session.remove('agi_browser_conversation_owners_v1');
      await chrome.storage.local.set({
        agi_onboarding_completed: true,
        agi_quick_mode: true,
      });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const quickEnabled = await page.getAttribute('#sp-quick-mode-toggle', 'data-active');
    if (quickEnabled !== 'true') fail(`Quick mode did not restore before test: ${quickEnabled}`);

    const signedOutQuick = await page.evaluate(async () => {
      const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
      globalThis.__agiQuickChatMessage = null;
      chrome.runtime.sendMessage = (message, ...args) => {
        if (message?.type === 'CHAT_MESSAGE') {
          globalThis.__agiQuickChatMessage = structuredClone(message);
        }
        return originalSendMessage(message, ...args);
      };
      const input = document.getElementById('sp-input');
      const send = document.getElementById('sp-send-btn');
      const messageCountBefore = document.querySelectorAll('#sp-messages > *').length;
      input.disabled = false;
      input.value = 'Quick must still require an owner';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      send.disabled = false;
      send.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        captured: globalThis.__agiQuickChatMessage,
        quickEnabled:
          document.getElementById('sp-quick-mode-toggle')?.getAttribute('data-active') === 'true',
        messageCountBefore,
        messageCountAfter: document.querySelectorAll('#sp-messages > *').length,
        thinkingCount: document.querySelectorAll('.sp-thinking-wrap').length,
      };
    });
    if (
      signedOutQuick.captured !== null ||
      signedOutQuick.quickEnabled !== true ||
      signedOutQuick.messageCountAfter !== signedOutQuick.messageCountBefore ||
      signedOutQuick.thinkingCount !== 0
    ) {
      fail(`Quick bypassed the signed-out owner gate: ${JSON.stringify(signedOutQuick)}`);
    }
    console.log('\n[quick-owner] preference=restored signedOutOutbound=blocked');
    await page.close();
  }

  {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/src/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    // The account row renders "Checking your account…" with no controls until
    // the status probe settles, and in CI that probe retries against an
    // unroutable Clerk fixture. Wait for the settled row, not a fixed delay.
    await page.waitForFunction(
      () =>
        Boolean(
          document.getElementById('opt-signin-btn') || document.getElementById('opt-logout-btn'),
        ),
      { timeout: 30000 },
    );
    const accountState = await page.evaluate(() => ({
      signInVisible: Boolean(document.getElementById('opt-signin-btn')),
      logOutVisible: Boolean(document.getElementById('opt-logout-btn')),
    }));
    if (!accountState.signInVisible || accountState.logOutVisible) {
      fail(`signed-out options account: unexpected controls ${JSON.stringify(accountState)}`);
    }
    await captureScreenshot(page, 'agi-chrome-exact-options-local-settings-signed-out.png', {
      fullPage: true,
    });
    await page.close();
  }

  {
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`chrome-extension://${extId}/src/side_panel.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          chrome.storage.local.set({ agi_onboarding_completed: false }, resolve),
        ),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        document.getElementById('sp-onboarding-overlay')?.classList.contains('visible') === true,
    );
    const initialOnboarding = await page.evaluate(() => {
      const overlay = document.getElementById('sp-onboarding-overlay');
      const progress = overlay?.querySelector('[role="progressbar"]');
      return {
        role: overlay?.getAttribute('role'),
        modal: overlay?.getAttribute('aria-modal'),
        hidden: overlay?.getAttribute('aria-hidden'),
        inert: overlay?.hasAttribute('inert'),
        fakeTabs: overlay?.querySelectorAll('[role="tab"], [role="tablist"]').length ?? -1,
        progressNow: progress?.getAttribute('aria-valuenow'),
        progressText: progress?.getAttribute('aria-valuetext'),
      };
    });
    if (
      initialOnboarding.role !== 'dialog' ||
      initialOnboarding.modal !== 'true' ||
      initialOnboarding.hidden !== 'false' ||
      initialOnboarding.inert ||
      initialOnboarding.fakeTabs !== 0 ||
      initialOnboarding.progressNow !== '1' ||
      initialOnboarding.progressText !== 'Step 1 of 5'
    ) {
      fail(`onboarding: invalid initial semantics ${JSON.stringify(initialOnboarding)}`);
    }
    await page.click('.sp-ob-btn-next');
    await page.locator('#sp-onboarding-skip').focus();
    await page.keyboard.press('Shift+Tab');
    const wrappedBackward = await page.evaluate(
      () => document.activeElement?.classList.contains('sp-ob-btn-next') === true,
    );
    await page.keyboard.press('Tab');
    const wrappedForward = await page.evaluate(
      () => document.activeElement?.id === 'sp-onboarding-skip',
    );
    const progressed = await page.getAttribute('.sp-ob-dots', 'aria-valuenow');
    if (!wrappedBackward || !wrappedForward || progressed !== '2') {
      fail(
        `onboarding: focus/progress contract failed ${JSON.stringify({ wrappedBackward, wrappedForward, progressed })}`,
      );
    }
    await page.keyboard.press('Escape');
    const dismissed = await page.evaluate(() => {
      const overlay = document.getElementById('sp-onboarding-overlay');
      return {
        visible: overlay?.classList.contains('visible'),
        hidden: overlay?.getAttribute('aria-hidden'),
        inert: overlay?.hasAttribute('inert'),
      };
    });
    if (dismissed.visible || dismissed.hidden !== 'true' || !dismissed.inert) {
      fail(`onboarding: dismiss did not restore inert state ${JSON.stringify(dismissed)}`);
    }
    console.log('\n[onboarding] progress=real focusTrap=ok escapeDismiss=ok');
    await page.close();
  }

  {
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.setViewportSize({ width: 400, height: 800 });
    const errors = [];
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'warn') {
        warnings.push(message.text());
      }
    });
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
      ['sp-auth-bar', 'sp-toolbar', 'sp-prompt-chips'].filter((id) => {
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
    const emptyStateVisible = await page.evaluate(() =>
      ['sp-empty-icon', 'sp-empty-headline', 'sp-empty-subtext'].every((id) => {
        const element = document.getElementById(id);
        if (!element) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }),
    );
    if (!emptyStateVisible) fail('chat surface: branded empty-state orientation is not visible');

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

    for (const colorScheme of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme });
      for (const width of [320, 390, 500]) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(75);
        const layout = await page.evaluate(() => {
          const selectors = [
            '#sp-header',
            '#sp-model-selector-btn',
            '#sp-cloud-gate',
            '#sp-composer-shell',
          ];
          return {
            viewportWidth: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            boxes: selectors.map((selector) => {
              const element = document.querySelector(selector);
              const rect = element?.getBoundingClientRect();
              return {
                selector,
                visible: Boolean(rect && rect.width > 0 && rect.height > 0),
                left: rect?.left ?? -1,
                right: rect?.right ?? -1,
              };
            }),
          };
        });
        const escaped = layout.boxes.filter(
          (box) => !box.visible || box.left < -1 || box.right > layout.viewportWidth + 1,
        );
        if (layout.scrollWidth > layout.viewportWidth + 1 || escaped.length > 0) {
          fail(
            `responsive ${colorScheme}/${width}: overflow ${JSON.stringify({ layout, escaped })}`,
          );
        }
        await captureScreenshot(
          page,
          `agi-chrome-side-panel-${colorScheme}-${width}-signed-out.png`,
        );

        for (const menu of [
          {
            button: '#sp-model-selector-btn',
            popup: '#sp-model-dropdown',
            filename: 'model-menu',
          },
          {
            button: '#sp-autonomy-chip',
            popup: '#sp-autonomy-popover',
            filename: 'approval-menu',
          },
        ]) {
          await page.click(menu.button);
          await page.waitForFunction(
            (selector) => document.querySelector(selector)?.classList.contains('open') === true,
            menu.popup,
          );
          const menuBounds = await page.locator(menu.popup).boundingBox();
          if (
            !menuBounds ||
            menuBounds.x < -1 ||
            menuBounds.x + menuBounds.width > width + 1 ||
            menuBounds.y < -1 ||
            menuBounds.y + menuBounds.height > 801
          ) {
            fail(
              `responsive ${colorScheme}/${width}: ${menu.popup} escaped viewport ${JSON.stringify(menuBounds)}`,
            );
          }
          await captureScreenshot(
            page,
            `agi-chrome-side-panel-${colorScheme}-${width}-${menu.filename}.png`,
          );
          await page.keyboard.press('Escape');
          await page.waitForFunction(
            (selector) => document.querySelector(selector)?.classList.contains('open') !== true,
            menu.popup,
          );
        }
      }
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 400, height: 800 });
    if (screenshotDirectory) {
      await page.waitForFunction(
        () => {
          const message = document.getElementById('sp-cloud-gate-message')?.textContent ?? '';
          const action = document.getElementById('sp-cloud-gate-action');
          return (
            message.startsWith('Sign in') && action?.textContent === 'Sign in' && !action.hidden
          );
        },
        undefined,
        { timeout: 30_000 },
      );
    }

    const authBridge = await page.evaluate(() =>
      Promise.race([
        chrome.runtime.sendMessage({ type: 'GET_CLOUD_AUTH_TOKEN', refresh: true }),
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: false, error: 'auth probe timed out' }), 10_000),
        ),
      ]),
    );
    if (usesNonRoutableAuthFixture) {
      if (!authBridge || authBridge.success !== false) {
        fail(`auth bridge: CI fixture did not fail closed: ${JSON.stringify(authBridge)}`);
      }
      console.log('[auth-bridge] non-routable CI fixture failed closed as expected');
    } else if (!authBridge || authBridge.success !== true) {
      fail(`auth bridge: background Sync Host probe failed: ${JSON.stringify(authBridge)}`);
    }
    const extensionPageRejections = warnings.filter(
      (warning) =>
        /Rejected (message from non-allowlisted sender|extension-page-only message)/.test(
          warning,
        ) && warning.includes(`chrome-extension://${extId}/src/side_panel.html`),
    );
    if (extensionPageRejections.length > 0) {
      fail(`auth bridge: extension-owned side panel was rejected by policy`);
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
    await captureScreenshot(page, 'agi-chrome-exact-side-panel-signed-out-local.png');

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

    await page.click('#sp-menu-btn');
    await page.click('#sp-drawer-wf-btn');
    await page.locator('#sp-tab-workflows').focus();
    await page.keyboard.press('ArrowRight');
    const computerUseTabState = await page.evaluate(() => ({
      selected: document.getElementById('sp-tab-computer-use')?.getAttribute('aria-selected'),
      tabIndex: document.getElementById('sp-tab-computer-use')?.getAttribute('tabindex'),
      panelHidden: document.getElementById('sp-cu-panel')?.getAttribute('aria-hidden'),
      controls: document.getElementById('sp-tab-computer-use')?.getAttribute('aria-controls'),
    }));
    if (
      computerUseTabState.selected !== 'true' ||
      computerUseTabState.tabIndex !== '0' ||
      computerUseTabState.panelHidden !== 'false' ||
      computerUseTabState.controls !== 'sp-cu-panel'
    ) {
      fail(
        `view tabs: ArrowRight did not activate Computer Use ${JSON.stringify(computerUseTabState)}`,
      );
    }
    await page.keyboard.press('ArrowLeft');
    const workflowsSelected = await page.getAttribute('#sp-tab-workflows', 'aria-selected');
    if (workflowsSelected !== 'true') fail('view tabs: ArrowLeft did not return to Workflows');
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

    await page.evaluate(() => {
      document.getElementById('sp-create-shortcut-overlay')?.classList.remove('open');
      document.getElementById('sp-drawer')?.classList.remove('open');
      document.querySelectorAll('.sp-overlay.open, .sp-modal.open').forEach((element) => {
        element.classList.remove('open');
      });
    });

    const slashOpened = await page.evaluate(() => {
      const input = document.getElementById('sp-input');
      if (!input) return null;
      input.value = '/su';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const menu = document.getElementById('sp-slash-menu');
      const items = Array.from(document.querySelectorAll('.sp-slash-item'));
      return {
        visible: menu?.classList.contains('visible') === true,
        names: items.map((i) => i.querySelector('.sp-slash-name')?.textContent ?? ''),
        hasHint: items.some((i) => (i.querySelector('.sp-slash-hint')?.textContent ?? '') !== ''),
        activeDescendant: input.getAttribute('aria-activedescendant'),
      };
    });
    if (
      !slashOpened?.visible ||
      slashOpened.names.length !== 1 ||
      slashOpened.names[0] !== '/summarize' ||
      !slashOpened.hasHint ||
      !slashOpened.activeDescendant
    ) {
      fail(`slash menu: did not open on "/su" ${JSON.stringify(slashOpened)}`);
    }

    const press = (key) => `
      document.getElementById('sp-input').dispatchEvent(
        new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true })
      );`;

    const messagesBefore = await page.evaluate(
      () => document.querySelectorAll('#sp-messages > *').length,
    );
    const slashAfter = await page.evaluate(`(() => {${press('Enter')}
      return {
        value: document.getElementById('sp-input').value,
        menuVisible: document.getElementById('sp-slash-menu').classList.contains('visible'),
        messageCount: document.querySelectorAll('#sp-messages > *').length,
      };
    })()`);
    if (slashAfter.value !== '/summarize ' || slashAfter.menuVisible) {
      fail(`slash menu: Enter did not complete the command ${JSON.stringify(slashAfter)}`);
    }
    if (slashAfter.messageCount !== messagesBefore) {
      fail('slash menu: Enter sent the raw fragment instead of completing the command');
    }

    const slashArrow = await page.evaluate(`(() => {
      const input = document.getElementById('sp-input');
      input.value = '/t';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const opened = document.querySelectorAll('.sp-slash-item').length;
      ${press('ArrowDown')}
      const items = Array.from(document.querySelectorAll('.sp-slash-item'));
      return { opened, activeIndex: items.findIndex((item) => item.classList.contains('active')) };
    })()`);
    if (slashArrow.opened < 2 || slashArrow.activeIndex !== 1) {
      fail(`slash menu: ArrowDown did not move selection ${JSON.stringify(slashArrow)}`);
    }

    const slashEscape = await page.evaluate(`(() => {${press('Escape')}
      return {
        closed: !document.getElementById('sp-slash-menu').classList.contains('visible'),
        value: document.getElementById('sp-input').value,
      };
    })()`);
    if (!slashEscape.closed || slashEscape.value !== '/t') {
      fail(`slash menu: Escape behaviour wrong ${JSON.stringify(slashEscape)}`);
    }
    await page.evaluate(() => {
      const input = document.getElementById('sp-input');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    console.log(
      `\n[slash-menu] opened=${slashOpened.names[0]} enterCompleted="${slashAfter.value.trim()}" arrowNav=ok escapeDismissed=${slashEscape.closed} noStrayMessage=true`,
    );

    const pageExceptions = errors.filter((e) => e.startsWith('pageerror:'));
    if (pageExceptions.length)
      fail(`interactions: uncaught page exception(s): ${pageExceptions.join(' | ')}`);
    const csp = errors.filter((error) => /Content Security Policy/i.test(error));
    if (csp.length) {
      fail(
        `interactions: CSP violation(s): ${csp.map((error) => error.slice(0, 120)).join(' | ')}`,
      );
    }
    console.log(
      `\n[interactions] composer=ok drawer=${drawerOpen} modelPicker=${modelOpen} quickMode=${composerModes.quickModePresent} authBridge=${usesNonRoutableAuthFixture ? 'fixture-failed-closed' : authBridge.success === true}`,
    );
    await page.close();
  }

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
      ({ profile, origin }) =>
        new Promise((res) =>
          chrome.storage.local.set(
            { agi_autofill_profile: profile, agi_site_allowlist: [origin] },
            res,
          ),
        ),
      { profile: PROFILE, origin: new URL(FORM_URL).origin },
    );

    const form = await context.newPage();
    await form.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await form.waitForTimeout(1500);

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
    await runWebMCPSmoke(ext, form, FORM_URL);
    await form.close();
    await ext.close();
  }

  console.log('\nSMOKE RESULT:', process.exitCode ? 'FAIL' : 'PASS');
} catch (e) {
  fail('exception: ' + (e && e.stack ? e.stack : String(e)));
} finally {
  await context?.close();
  await new Promise((r) => server.close(r));
  extensionBundle.cleanup?.();
}
