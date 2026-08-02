/**
 * Desktop Cloud degraded-dependency behavior on the real binary.
 *
 * DES-C10 — a transient conversation- or project-list failure blanked the whole
 * app. `App.tsx` hydrated the cloud boundary with
 * `Promise.all([loadConversations(...), loadProjects({ throwOnError: true })])`
 * and turned EITHER rejection into a full-screen "Could not open Cloud Mode"
 * alert, so a 429/500/cold-start on `/api/projects` took down chat, composer,
 * sidebar and history at once.
 *
 * DES-C20 — a transient `/api/me` failure left `plan = null`, which is not a
 * neutral "unknown": `desktopCloudEntitlements` returns [] for it, so the model
 * picker had nothing selectable and the plan row said "Loading…" forever.
 *
 * Web precedent: `apps/web/e2e/authenticated-flows.spec.ts` forces
 * `/api/chat/sync` to 500 and asserts the composer still renders — "a failing
 * background sync must NOT take down the chat UI".
 */
import {
  completeMockedDeviceSignIn,
  installCloudApiStubs,
  mockDeviceAuthorization,
  recordedCloudApiCalls,
  restoreLocalModeProfile,
  writePersistedAppMode,
  type CloudApiStubOptions,
} from '../helpers/cloudSession';

/** Text of every visible toast / alert region, for failure diagnostics. */
function shellText(): Promise<string> {
  return browser.execute(() => document.body.innerText || '') as Promise<string>;
}

function boundaryErrorBannerVisible(): Promise<boolean> {
  return browser.execute(
    () => !!document.querySelector('[data-testid="conversation-boundary-error"]'),
  ) as Promise<boolean>;
}

async function fullScreenTakeoverVisible(): Promise<boolean> {
  return (await browser.execute(() =>
    (document.body.innerText || '').includes('Could not open Cloud Mode'),
  )) as boolean;
}

/** Signs in with the given endpoint failures already in place. */
async function enterCloudWith(stubs: CloudApiStubOptions): Promise<void> {
  await writePersistedAppMode({ mode: 'local', hasSelectedMode: true, hasOnboarded: true });
  await browser.refresh();
  await (
    await $('textarea[aria-label="Chat message input"]')
  ).waitForDisplayed({
    timeout: 60_000,
  });

  await installCloudApiStubs(stubs);
  await mockDeviceAuthorization();

  const cloudTab = await $('button[role="tab"]=Cloud');
  await cloudTab.waitForDisplayed({ timeout: 30_000 });
  await cloudTab.click();

  await completeMockedDeviceSignIn();
}

describe('AGI Desktop Cloud degrades instead of blanking', () => {
  after(async () => {
    await restoreLocalModeProfile();
  });

  it('keeps the shell mounted when /api/projects fails (DES-C10)', async function () {
    this.timeout(240_000);

    await enterCloudWith({
      me: 'ok',
      models: 'ok',
      conversations: 'ok',
      projects: 'server-error',
    });

    // Projects are not part of the chat boundary: the composer must be there.
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });
    await expect(composer).toBeDisplayed();

    const sidebar = await $('aside[data-v3-sidebar]');
    await expect(sidebar).toBeDisplayed();

    // Prove the failing path really ran rather than never being reached.
    const calls = await recordedCloudApiCalls();
    expect(calls.some((path) => path.startsWith('/api/projects'))).toBe(true);

    expect(await fullScreenTakeoverVisible()).toBe(false);
    // …and a projects failure must not even raise the conversation banner.
    expect(await boundaryErrorBannerVisible()).toBe(false);

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-projects-failure.png');
  });

  it('reports a conversation-list failure inline and keeps chat usable (DES-C10)', async function () {
    this.timeout(240_000);

    await enterCloudWith({
      me: 'ok',
      models: 'ok',
      conversations: 'server-error',
      projects: 'ok',
    });

    // The failure is scoped and named…
    await browser.waitUntil(async () => boundaryErrorBannerVisible(), {
      timeout: 60_000,
      interval: 500,
      timeoutMsg: `No inline conversation-boundary error appeared. Shell text: ${await shellText()}`,
    });

    // …the shell is NOT replaced…
    expect(await fullScreenTakeoverVisible()).toBe(false);
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });
    await expect(composer).toBeDisplayed();
    await expect($('aside[data-v3-sidebar]')).toBeDisplayed();

    // …and it is recoverable rather than terminal.
    const banner = await $('[data-testid="conversation-boundary-error"]');
    const bannerText = await banner.getText();
    expect(bannerText).toContain('Try again');

    const dismissed = await browser.execute(() => {
      const button = document.querySelector<HTMLButtonElement>(
        '[data-testid="conversation-boundary-error"] button[aria-label="Dismiss conversation loading error"]',
      );
      if (!button) return false;
      button.click();
      return true;
    });
    expect(dismissed).toBe(true);

    await browser.waitUntil(async () => !(await boundaryErrorBannerVisible()), {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'The conversation-boundary banner could not be dismissed',
    });
    await expect($('textarea[aria-label="Chat message input"]')).toBeDisplayed();

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-conversations-failure.png');
  });

  it('keeps a usable model picker and an honest plan row when /api/me fails (DES-C20)', async function () {
    this.timeout(240_000);

    await enterCloudWith({
      me: 'server-error',
      models: 'ok',
      conversations: 'ok',
      projects: 'ok',
    });

    // The session survives a non-authorization /api/me failure by design
    // (`refreshUserData` only invalidates on 401/403), so the shell must mount.
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });

    // The plan row must not be pinned on the transient sentinel.
    await browser.waitUntil(
      async () =>
        browser.execute(() => {
          const sidebar = document.querySelector('aside[data-v3-sidebar]');
          return !!sidebar && !(sidebar.textContent ?? '').includes('Loading...');
        }),
      {
        timeout: 60_000,
        interval: 500,
        timeoutMsg: 'The sidebar plan row stayed on the "Loading..." sentinel after /api/me failed',
      },
    );

    // And the Cloud model picker must have something selectable. The catalog
    // stub is deliberately EMPTY: `resolveDesktopCloudPickerModels` still
    // prepends the canonical Auto routing profile, so a non-empty picker proves
    // the plan resolved to a real tier rather than null (which returns []).
    const picker = await $('button[aria-label="Select model"]');
    await picker.waitForDisplayed({ timeout: 30_000 });
    await picker.click();

    const pickerEmptyState = await $('*=No managed models available');
    await browser.pause(750);
    expect(await pickerEmptyState.isExisting()).toBe(false);

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-me-failure.png');
  });
});
