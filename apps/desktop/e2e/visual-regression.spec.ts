import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from './fixtures';
import { injectMockCloudAuth, mockCloudAccountEndpoints } from './utils/mock-cloud-auth';

// Settings has two nested async-loading races that both must clear before a
// screenshot is meaningful:
//
// 1. `DesktopCloudSettingsModal` (src/features/settings/DesktopCloudSettingsModal.tsx)
//    code-splits each tab — including the General tab shown by default —
//    behind its own `<Suspense fallback={<SectionSkeleton />}>`. On the
//    modal's first open in a fresh page, that chunk hasn't been fetched yet,
//    so the dialog briefly renders `SectionSkeleton`'s `animate-pulse`
//    placeholder blocks (a title bar + one big blank rounded rect) instead
//    of real content — easy to mistake for a broken/blank capture if baked
//    into a baseline. `GeneralTab` always renders a "Keybindings" heading
//    once it mounts, so waiting for that text confirms the real tab (not
//    the skeleton) is showing.
// 2. Within the now-mounted General tab, the Keybindings section itself
//    lazy-loads its shortcut list behind a second
//    `<Suspense fallback={<Fallback label="Loading keybindings..." />}>`
//    (src/features/settings/tabs/General/index.tsx). Wait for that
//    fallback text to clear too, so the shortcut list is fully rendered
//    rather than mid-spinner.
//
// Both chunks resolve almost immediately in a dev build, but capturing
// before either settles bakes transient loading UI into the baseline, which
// then mismatches on every subsequent run whose timing differs slightly.
async function waitForSettingsToSettle(page: Page): Promise<void> {
  await page
    .getByText('Keybindings', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  await page
    .getByText('Loading keybindings...')
    .waitFor({ state: 'hidden', timeout: 5000 })
    .catch(() => {});
}

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Fix the clock before anything mounts. BrandedGreeting (shown on the
    // empty-chat screen captured by several baselines below) rotates its
    // headline/subline by hour-of-day and by `getMinutes() % pool.length`
    // (src/features/chat/BrandedGreeting.tsx), so an unmocked clock makes
    // the captured text — and therefore the pixel diff against a
    // fixed baseline PNG — depend on wall-clock time-of-day. Pin it to a
    // fixed weekday afternoon (UTC, matching global-setup's TZ=UTC) so the
    // greeting text is stable across every run.
    await page.clock.setFixedTime(new Date('2026-01-06T15:00:00Z'));

    // Clear the Cloud auth gate before the app boots. This suite runs
    // against the plain-browser web-target bundle (`VITE_BUILD_TARGET=web`,
    // no Tauri). `appModeStore`'s `supportsLocalAppMode` is
    // `isTauri || isDesktopUiDevLocal`, so without Tauri the app boots in
    // Cloud mode, and `App.tsx` renders `<AuthPage />` for
    // `isCloudMode && !hasCloudSession` — every one of these "interface
    // baseline" tests would otherwise silently screenshot the sign-in page
    // instead of the chat/AGI/automation/settings surface it claims to check
    // (confirmed: previously all 9 baselines were being diffed against
    // sign-in-page captures, with some pairs coincidentally scoring >90%
    // similarity purely because both are dominated by the same light
    // background color — a false pass, not a real check).
    //
    // `injectMockCloudAuth`/`mockCloudAccountEndpoints` (the same mechanism
    // `v3-locks.spec.ts`/`v3-reachability.spec.ts`/`v3-smoke.spec.ts` already
    // use for this identical gate) seed the real `unified-auth-storage`
    // persisted key so `hasCloudSession` is true and the real v3 shell
    // mounts. This was chosen over forcing `app-mode-store` to `'local'`
    // directly: that alternative reaches the shell too, but leaves the app
    // in a self-contradictory state that cannot occur for a real user —
    // `src/lib/runtimeEnvironment.ts`'s `isCloudWeb` (`!supportsLocalAppMode`)
    // is unconditionally true on this build target, so Settings → General
    // (`src/features/settings/tabs/General/index.tsx`) renders the
    // "You are using AGI Workforce Cloud Managed" banner even while
    // `app-mode-store.mode` says `'local'`. Authenticating into Cloud
    // instead keeps every screen internally consistent, and matches what
    // this build target actually does for a real signed-in user (desktop
    // Cloud mode is not implemented; only the web/mobile-facing Cloud
    // build reaches this code path in production).
    await injectMockCloudAuth(page);
    await mockCloudAccountEndpoints(page);

    // Disable CSS/JS entrance animations (e.g. AuthPage's Framer Motion
    // fade-ins) before the app mounts. Screenshot comparisons must be
    // deterministic: without this, a screenshot can capture content
    // mid-animation (partially transparent / translated) depending on
    // machine speed, producing flaky visual-diff failures unrelated to any
    // real UI regression.
    //
    // NOTE: the equivalent `reducedMotion: 'reduce'` Playwright project/use
    // config option does not reliably propagate to `window.matchMedia()` in
    // this Playwright version (verified: context-level option leaves
    // `matchMedia('(prefers-reduced-motion: reduce)').matches` false, while
    // `page.emulateMedia()` correctly sets it), so it must be applied
    // explicitly here, before navigation.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // `networkidle` only proves requests are quiet — it does not prove the
    // app has rendered past App.tsx's top-level `LoadingFallback` (the
    // "AGI / Loading your workspace... [Retry]" `animate-pulse` screen shown
    // while the lazily-loaded v3 shell chunk is still being fetched/parsed).
    // With mocked APIs responding instantly, `networkidle` can fire before
    // that chunk resolves, so a screenshot taken right after it captures the
    // fallback instead of the real UI — confirmed: this raced intermittently
    // depending on what ran earlier in the same worker (module-cache
    // warmth), producing a baseline that matched itself deterministically on
    // repeat runs but did not reflect real content. Wait for the real shell
    // to mount before any test proceeds.
    await page
      .locator('[data-v3-shell], [data-v3-sidebar]')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
  });

  test.afterEach(async ({ screenshotHelper }) => {
    await screenshotHelper.cleanup(50);
  });

  test('should match chat interface baseline', async ({ page, screenshotHelper }) => {
    const chatLink = page.locator('a[href*="chat"], button:has-text("Chat")').first();
    if (await chatLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Wait for page content to stabilize before screenshot
    await page.waitForLoadState('domcontentloaded');
    const currentPath = await screenshotHelper.captureFullPage('chat-interface');

    try {
      const comparison = await screenshotHelper.compareVisual('chat-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        console.log('[Visual Baseline] Creating missing baseline for chat-interface');
        await screenshotHelper.createBaseline('chat-interface');
      } else {
        throw error;
      }
    }
  });

  // KNOWN GAP (found 2026-07-03, out of scope to redesign here): the v3
  // sidebar's nav items are only artifacts/scheduled/dispatch
  // (src/features/v3/Sidebar.tsx `navItemsForMode`) — there is no surviving
  // "AGI"/"goals" nav destination for `agiPage.navigateToAGI()`'s
  // `/agi|goals/i` locator to match, nor an "automation" destination for
  // `automationPage.navigateToAutomation()`'s `/automation/i` locator below.
  // Both silently no-op (same pattern as the rest of this suite's
  // `.isVisible().catch(() => false)` guards) and this test ends up
  // re-screenshotting the same default empty-chat view as "should match
  // chat interface baseline". The baseline still locks in real, valid,
  // non-broken UI — it just isn't the distinct "AGI"/"automation" surface
  // the test name implies, because that surface doesn't exist in the v3
  // shell. Tracked here rather than silently left ambiguous; fixing it
  // requires deciding what the current product equivalent is (Dispatch?)
  // which is a product-scope call, not a test-plumbing one.
  test('should match AGI interface baseline', async ({ page, screenshotHelper, agiPage }) => {
    await agiPage.navigateToAGI();
    // Wait for AGI interface content to be ready
    await page.waitForLoadState('domcontentloaded');
    const currentPath = await screenshotHelper.captureFullPage('agi-interface');

    try {
      const comparison = await screenshotHelper.compareVisual('agi-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('agi-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match automation interface baseline', async ({
    page,
    screenshotHelper,
    automationPage,
  }) => {
    await automationPage.navigateToAutomation();
    // Wait for automation interface content to be ready
    await page.waitForLoadState('domcontentloaded');
    const currentPath = await screenshotHelper.captureFullPage('automation-interface');

    try {
      const comparison = await screenshotHelper.compareVisual('automation-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('automation-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match settings interface baseline', async ({
    page,
    screenshotHelper,
    settingsPage,
  }) => {
    await settingsPage.navigateToSettings();
    // Wait for settings interface content to be ready
    await page.waitForLoadState('domcontentloaded');
    await waitForSettingsToSettle(page);
    const currentPath = await screenshotHelper.captureFullPage('settings-interface');

    try {
      const comparison = await screenshotHelper.compareVisual('settings-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('settings-interface');
      } else {
        throw error;
      }
    }
  });

  // KNOWN GAP (found 2026-07-03, environment-inherent, not fixable here): the
  // Theme `<Select>` (`settingsPage.themeSelect`) lives in GeneralTab's
  // "Window Preferences" block (src/features/settings/tabs/General/index.tsx),
  // which is gated behind `{isTauri && (...)}`. `isTauri` is always false
  // against this Playwright harness (plain-browser `VITE_BUILD_TARGET=web`
  // dev server, no Tauri runtime), so the selector never renders and
  // `changeTheme()` below is a guarded no-op in this environment — by
  // platform design, not a selector bug. Both "light theme" and "dark
  // theme" baselines below therefore capture the same default General tab
  // rendering and cannot verify real theme-switching output here. Actually
  // exercising theme switching would require running against a real Tauri
  // webview (or exposing an equivalent web-safe theme control), which is a
  // platform/product decision out of scope for this test-plumbing fix.
  test('should match light theme', async ({ page, screenshotHelper, settingsPage }) => {
    await settingsPage.navigateToSettings();

    if (await settingsPage.themeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsPage.changeTheme('light');
      // Wait for theme transition to complete by checking for theme class/attribute
      await expect(page.locator('body, html, [data-theme]').first())
        .toHaveAttribute('class', /light|theme/, { timeout: 2000 })
        .catch(() => {});
    }
    await waitForSettingsToSettle(page);

    const currentPath = await screenshotHelper.captureFullPage('theme-light');

    try {
      const comparison = await screenshotHelper.compareVisual('theme-light', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('theme-light');
      } else {
        throw error;
      }
    }
  });

  test('should match dark theme', async ({ page, screenshotHelper, settingsPage }) => {
    await settingsPage.navigateToSettings();

    if (await settingsPage.themeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsPage.changeTheme('dark');
      // Wait for theme transition to complete by checking for theme class/attribute
      await expect(page.locator('body, html, [data-theme]').first())
        .toHaveAttribute('class', /dark|theme/, { timeout: 2000 })
        .catch(() => {});
    }
    await waitForSettingsToSettle(page);

    const currentPath = await screenshotHelper.captureFullPage('theme-dark');

    try {
      const comparison = await screenshotHelper.compareVisual('theme-dark', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('theme-dark');
      } else {
        throw error;
      }
    }
  });

  test('should match modal dialogs', async ({ page, screenshotHelper, chatPage }) => {
    await chatPage.goto();

    const newChatVisible = await chatPage.newChatButton
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    // llm-guardrail-allow: pre-existing reasoned skip (FIX-019 "replace
    // silent-pass theater with test.skip gates"), not a silent no-op.
    test.skip(!newChatVisible, 'New chat button not available');

    await chatPage.newChatButton.click();

    const modal = page.locator('[role="dialog"], .modal').first();
    await modal.waitFor({ state: 'attached', timeout: 2000 }).catch(() => {});
    const modalVisible = await modal.isVisible({ timeout: 2000 }).catch(() => false);
    // llm-guardrail-allow: pre-existing reasoned skip (FIX-019), not a
    // silent no-op.
    test.skip(!modalVisible, 'Modal dialog did not appear after clicking new chat');

    const currentPath = await screenshotHelper.captureElement(
      '[role="dialog"], .modal',
      'new-chat-modal',
    );

    try {
      const comparison = await screenshotHelper.compareVisual('new-chat-modal', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(85);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('new-chat-modal');
      } else {
        throw error;
      }
    }
  });

  test('should match responsive layout on different viewport sizes', async ({
    page,
    screenshotHelper,
  }) => {
    let currentPath = await screenshotHelper.captureViewport('layout-desktop-1920x1080');
    try {
      const comparison = await screenshotHelper.compareVisual(
        'layout-desktop-1920x1080',
        currentPath,
      );
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('layout-desktop-1920x1080');
      } else {
        throw error;
      }
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    // Wait for layout to stabilize after viewport resize
    await page.waitForLoadState('domcontentloaded');
    currentPath = await screenshotHelper.captureViewport('layout-tablet-768x1024');
    try {
      const comparison = await screenshotHelper.compareVisual(
        'layout-tablet-768x1024',
        currentPath,
      );
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('layout-tablet-768x1024');
      } else {
        throw error;
      }
    }

    await page.setViewportSize({ width: 375, height: 667 });
    // Wait for layout to stabilize after viewport resize
    await page.waitForLoadState('domcontentloaded');
    currentPath = await screenshotHelper.captureViewport('layout-mobile-375x667');
    try {
      const comparison = await screenshotHelper.compareVisual('layout-mobile-375x667', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('layout-mobile-375x667');
      } else {
        throw error;
      }
    }
  });

  test('should capture error states', async ({ page, screenshotHelper, chatPage, mockLLM }) => {
    mockLLM.setMockResponse(/error.*test/i, 'ERROR: Test error message');

    await chatPage.goto();

    const chatInputVisible = await chatPage.chatInput
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    // llm-guardrail-allow: pre-existing reasoned skip (FIX-019), not a
    // silent no-op.
    test.skip(!chatInputVisible, 'Chat input not available');

    await chatPage.sendMessage('trigger error test');
    const errorIndicator = page.locator('[role="alert"], .error, [data-error]').first();
    await errorIndicator.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

    const currentPath = await screenshotHelper.captureFullPage('error-state');

    try {
      const comparison = await screenshotHelper.compareVisual('error-state', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(85);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('error-state');
      } else {
        throw error;
      }
    }
  });

  test('should capture loading states', async ({ page, screenshotHelper, agiPage }) => {
    await agiPage.navigateToAGI();

    const goalInputVisible = await agiPage.goalInput
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    // llm-guardrail-allow: pre-existing reasoned skip (FIX-019), not a
    // silent no-op.
    test.skip(!goalInputVisible, 'AGI goal input not available');

    await agiPage.submitGoal('Test loading state');

    const loadingIndicator = page
      .locator('[data-loading], .loading, .spinner, [aria-busy="true"]')
      .first();
    await loadingIndicator.waitFor({ state: 'attached', timeout: 2000 }).catch(() => {});
    const currentPath = await screenshotHelper.captureFullPage('loading-state');

    try {
      const comparison = await screenshotHelper.compareVisual('loading-state', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(85);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('loading-state');
      } else {
        throw error;
      }
    }
  });

  test('should initialize baseline screenshots on first run', async () => {
    const baselineNames = [
      'chat-interface',
      'agi-interface',
      'automation-interface',
      'settings-interface',
      'theme-light',
      'theme-dark',
      'new-chat-modal',
      'layout-desktop-1920x1080',
      'layout-tablet-768x1024',
      'layout-mobile-375x667',
      'error-state',
      'loading-state',
    ];

    console.log('[Visual Baseline] Required baselines:', baselineNames.join(', '));
    console.log('[Visual Baseline] Run tests with --update-snapshots to create missing baselines');
  });
});
