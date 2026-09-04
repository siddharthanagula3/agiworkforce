import { resolveScreenDir } from '../support/dom';
import { waitForSettingsReady } from '../support/close-settings';
import { enterLocalDesktopShell, waitForDesktopShell } from '../support/desktop-shell';

const SCREEN_DIR = resolveScreenDir('settings-persistence-restart');

interface NativeSettings {
  llmConfig: {
    ollamaUrl: string;
  };
  windowPreferences: {
    theme: 'light' | 'dark' | 'system';
    uiScale?: 90 | 100 | 110;
    reduceMotion?: boolean;
  };
  executionPreferences?: {
    approvalTimeoutSeconds?: number;
    approvalTimeoutPolicy?: 'auto-deny' | 'auto-approve' | 'pause';
  };
  personalization?: {
    name?: string;
  };
  [key: string]: unknown;
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return browser.execute(
    async (nativeCommand, nativeArgs) => {
      const tauri = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (name: string, payload?: Record<string, unknown>) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (!tauri) throw new Error('Tauri invoke bridge is unavailable');
      return tauri.invoke(nativeCommand, nativeArgs);
    },
    command,
    args,
  ) as Promise<T>;
}

async function openSettings(): Promise<void> {
  const gear = await $('button[aria-label="Settings"]');
  await gear.waitForDisplayed({ timeout: 20_000 });
  await gear.click();
  await waitForSettingsReady();
}

async function openSection(label: string): Promise<void> {
  const item = await $(
    `//nav[@aria-label="Settings sections"]//button[normalize-space()="${label}"]`,
  );
  await item.waitForDisplayed({ timeout: 15_000 });
  await item.scrollIntoView({ block: 'center' });
  await item.click();
  await browser.waitUntil(async () => (await item.getAttribute('aria-current')) === 'page', {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: `Settings section ${label} did not become active`,
  });
}

async function chooseButton(selector: string): Promise<void> {
  const button = await $(selector);
  await button.waitForDisplayed({ timeout: 10_000 });
  await button.scrollIntoView({ block: 'center' });
  await button.click();
}

async function replaceTextInput(selector: string, value: string): Promise<void> {
  const input = await $(selector);
  await input.waitForDisplayed({ timeout: 10_000 });
  await input.scrollIntoView({ block: 'center' });
  await input.click();
  await input.clearValue();
  await input.addValue(value);
  await browser.waitUntil(async () => (await input.getValue()) === value, {
    timeout: 5_000,
    interval: 100,
    timeoutMsg: `${selector} did not accept keyboard input`,
  });
}

function createDistinctOllamaUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1';
  } else if (url.hostname === '127.0.0.1') {
    url.hostname = 'localhost';
  } else {
    const marker = '/wdio-settings-restart-probe';
    const path = url.pathname.replace(/\/$/, '');
    url.pathname = path.endsWith(marker)
      ? path.slice(0, -marker.length) || '/'
      : `${path}${marker}`;
  }
  return url.toString();
}

describe('AGI Desktop Settings, persisted native restart contract', () => {
  it('commits visible settings, reloads the renderer, and restores them from native disk', async function () {
    this.timeout(180_000);

    await waitForDesktopShell();
    await enterLocalDesktopShell();
    const original = await invokeNative<NativeSettings>('settings_load_from_disk');

    const originalScale = original.windowPreferences.uiScale ?? 100;
    const originalReduceMotion = original.windowPreferences.reduceMotion ?? false;
    const originalApprovalTimeout = original.executionPreferences?.approvalTimeoutSeconds ?? 300;
    const originalApprovalPolicy =
      original.executionPreferences?.approvalTimeoutPolicy ?? 'auto-deny';
    const originalName = original.personalization?.name ?? '';

    const changedUrl = createDistinctOllamaUrl(original.llmConfig.ollamaUrl);
    const persistedChangedUrl = new URL(changedUrl).toString();
    const changedTheme = original.windowPreferences.theme === 'dark' ? 'light' : 'dark';
    const changedScale: 90 | 100 | 110 = originalScale === 110 ? 90 : 110;
    const changedReduceMotion = !originalReduceMotion;
    const changedApprovalPolicy: 'auto-deny' | 'pause' =
      originalApprovalPolicy === 'auto-deny' ? 'pause' : 'auto-deny';
    const changedApprovalTimeout = originalApprovalTimeout === 60 ? 600 : 60;
    const changedName =
      originalName === 'WDIO settings restart'
        ? 'WDIO settings restart 2'
        : 'WDIO settings restart';

    try {
      await openSettings();

      await openSection('Models & Keys');
      await replaceTextInput('input[aria-label="Ollama URL"]', changedUrl);

      await openSection('Personalization');
      await replaceTextInput('#personalization-name', changedName);
      await chooseButton(
        `button[aria-label="Select ${changedTheme === 'dark' ? 'Dark' : 'Light'} theme"]`,
      );
      await chooseButton(
        `//button[normalize-space()="${changedScale === 110 ? 'Large' : 'Small'}"]`,
      );
      const reduceMotion = await $('button[aria-label="Reduce motion"]');
      await reduceMotion.scrollIntoView({ block: 'center' });
      await reduceMotion.click();

      await openSection('Developer');
      const approvalSlider = await $('[role="slider"][aria-valuemin="60"]');
      await approvalSlider.waitForDisplayed({ timeout: 10_000 });
      await approvalSlider.scrollIntoView({ block: 'center' });
      await approvalSlider.click();
      await browser.execute((slider) => (slider as HTMLElement).focus(), approvalSlider);
      expect(
        await browser.execute((slider) => document.activeElement === slider, approvalSlider),
      ).toBe(true);
      const currentApprovalTimeout = Number(await approvalSlider.getAttribute('aria-valuenow'));
      const timeoutStepKey =
        changedApprovalTimeout > currentApprovalTimeout ? 'ArrowRight' : 'ArrowLeft';
      const timeoutStepCount = Math.ceil(
        Math.abs(changedApprovalTimeout - currentApprovalTimeout) / 30,
      );
      for (let index = 0; index < timeoutStepCount; index += 1) {
        await browser.keys(timeoutStepKey);
      }
      await browser.waitUntil(
        async () =>
          Number(await approvalSlider.getAttribute('aria-valuenow')) === changedApprovalTimeout,
        {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: 'Approval timeout slider did not accept keyboard input',
        },
      );

      const policy = await $('#approvalPolicy');
      await policy.scrollIntoView({ block: 'center' });
      await policy.click();
      const approvalPolicies = ['auto-deny', 'auto-approve', 'pause'] as const;
      const currentPolicyIndex = approvalPolicies.indexOf(originalApprovalPolicy);
      const targetPolicyIndex = approvalPolicies.indexOf(changedApprovalPolicy);
      const policyStepKey = targetPolicyIndex > currentPolicyIndex ? 'ArrowDown' : 'ArrowUp';
      for (let index = 0; index < Math.abs(targetPolicyIndex - currentPolicyIndex); index += 1) {
        await browser.keys(policyStepKey);
      }
      await browser.keys('Enter');
      await browser.waitUntil(
        async () =>
          (await policy.getText()).includes(
            changedApprovalPolicy === 'pause' ? 'Pause agent' : 'Auto-deny',
          ),
        {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: 'Approval timeout policy did not accept keyboard selection',
        },
      );

      await openSection('Models & Keys');
      const ollamaUrlDraft = await $('input[aria-label="Ollama URL"]');
      await ollamaUrlDraft.waitForDisplayed({ timeout: 10_000 });
      expect(await ollamaUrlDraft.getValue()).toBe(persistedChangedUrl);
      await browser.saveScreenshot(`${SCREEN_DIR}/00-draft-before-save.png`);
      const save = await $('button=Save Changes');
      await save.waitForEnabled({ timeout: 10_000 });
      await save.click();
      await browser.waitUntil(
        async () => !(await $('nav[aria-label="Settings sections"]').isExisting()),
        {
          timeout: 30_000,
          interval: 200,
          timeoutMsg: 'Settings did not close after native persistence completed',
        },
      );

      const persisted = await invokeNative<NativeSettings>('settings_load_from_disk');
      expect(persisted.llmConfig.ollamaUrl).toBe(persistedChangedUrl);
      expect(persisted.windowPreferences.theme).toBe(changedTheme);
      expect(persisted.windowPreferences.uiScale).toBe(changedScale);
      expect(persisted.windowPreferences.reduceMotion).toBe(changedReduceMotion);
      expect(persisted.executionPreferences?.approvalTimeoutSeconds).toBe(changedApprovalTimeout);
      expect(persisted.executionPreferences?.approvalTimeoutPolicy).toBe(changedApprovalPolicy);
      expect(persisted.personalization?.name).toBe(changedName);

      await browser.saveScreenshot(`${SCREEN_DIR}/01-saved-native-disk.png`);
      await browser.keys('Escape');
      await browser.refresh();
      await waitForDesktopShell();
      await enterLocalDesktopShell();
      await openSettings();

      await openSection('Models & Keys');
      expect(await $('input[aria-label="Ollama URL"]').getValue()).toBe(persistedChangedUrl);

      await openSection('Personalization');
      expect(await $('#personalization-name').getValue()).toBe(changedName);
      expect(
        await $(
          `button[aria-label="Select ${changedTheme === 'dark' ? 'Dark' : 'Light'} theme"]`,
        ).getAttribute('aria-pressed'),
      ).toBe('true');
      expect(
        await $(
          `//button[normalize-space()="${changedScale === 110 ? 'Large' : 'Small'}"]`,
        ).getAttribute('aria-pressed'),
      ).toBe('true');
      expect(await $('button[aria-label="Reduce motion"]').getAttribute('aria-checked')).toBe(
        String(changedReduceMotion),
      );

      await openSection('Developer');
      expect(
        Number(await $('[role="slider"][aria-valuemin="60"]').getAttribute('aria-valuenow')),
      ).toBe(changedApprovalTimeout);
      expect(await $('#approvalPolicy').getText()).toContain(
        changedApprovalPolicy === 'pause' ? 'Pause agent' : 'Auto-deny',
      );
      await browser.saveScreenshot(`${SCREEN_DIR}/02-restored-after-renderer-restart.png`);
    } finally {
      await invokeNative<void>('settings_save', { settings: original });
      await browser.refresh();
      await waitForDesktopShell();
      await enterLocalDesktopShell();
    }
  });
});
