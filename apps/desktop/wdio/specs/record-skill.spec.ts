import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { waitForDesktopShell } from '../support/desktop-shell';

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return browser.execute(
    async ({ nativeCommand, nativeArgs }) => {
      const tauriWindow = window as typeof window & {
        __TAURI_INTERNALS__?: {
          invoke: (commandName: string, commandArgs?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      if (!tauriWindow.__TAURI_INTERNALS__) {
        throw new Error('Tauri invoke bridge is unavailable in the Desktop webview');
      }
      return tauriWindow.__TAURI_INTERNALS__.invoke(nativeCommand, nativeArgs);
    },
    { nativeCommand: command, nativeArgs: args },
  ) as Promise<T>;
}

describe('AGI Desktop Record a skill', () => {
  it('opens from the live shared composer and creates a reusable managed skill', async function () {
    this.timeout(120_000);
    await waitForDesktopShell();

    const plus = await $('button[aria-label="Add attachment"]');
    await plus.waitForDisplayed({ timeout: 20_000 });
    await plus.click();

    const recordSkill = await $('//button[contains(normalize-space(.), "Record a skill")]');
    await recordSkill.waitForDisplayed({ timeout: 10_000 });
    await recordSkill.click();

    const consent = await $('button=I understand, continue');
    await consent.waitForDisplayed({ timeout: 10_000 });
    expect(await $('body').getText()).toContain('Your recording stays local');
    await browser.saveScreenshot('/tmp/agi-desktop-record-skill-consent.png');
    await consent.click();

    const permissions = await invokeNative<{
      accessibility: boolean;
      input_monitoring: boolean;
    }>('check_automation_permissions');

    const start = await $('button=Start recording');
    await start.click();

    if (!permissions.accessibility || !permissions.input_monitoring) {
      expect(await $('body').getText()).toContain('Allow Desktop control to record and replay');
      expect(await $('body').getText()).toContain('Check again');
      return;
    }

    const done = await $('button=Done');
    await done.waitForDisplayed({ timeout: 10_000 });
    expect(await invokeNative<boolean>('automation_record_is_recording')).toBe(true);
    await invokeNative('automation_record_action_click', {
      x: 120,
      y: 160,
      button: 'left',
    });
    await browser.pause(150);

    await done.click();

    const dialog = await $('[role="dialog"]');
    try {
      await dialog.waitForDisplayed({ timeout: 10_000 });
    } catch {
      await browser.saveScreenshot('/tmp/agi-desktop-record-skill-after-done.png');
      throw new Error(`Save dialog did not open after recording:\n${await $('body').getText()}`);
    }
    const uniqueSuffix = Date.now();
    const skillName = `E2E recorded skill ${uniqueSuffix}`;
    const skillSlug = `e2e-recorded-skill-${uniqueSuffix}`;
    const skillPath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'agiworkforce',
      'skills',
      skillSlug,
    );

    try {
      await dialog.$('input#recorded-skill-name').setValue(skillName);
      await dialog
        .$('input#recorded-skill-description')
        .setValue('Temporary native smoke-test workflow.');
      const createSkill = await dialog.$('button=Create skill');
      await createSkill.waitForEnabled({ timeout: 10_000 });
      await createSkill.click();

      const composer = await $('textarea[aria-label="Chat message input"]');
      try {
        await composer.waitForDisplayed({ timeout: 20_000 });
      } catch {
        await browser.saveScreenshot('/tmp/agi-desktop-record-skill-save-error.png');
        throw new Error(
          `Recorder did not return to chat after saving:\n${await $('body').getText()}`,
        );
      }
      const skills = await invokeNative<Array<{ name: string; sourceType: string }>>('skill_list');
      expect(skills.some((skill) => skill.name === skillName)).toBe(true);
    } finally {
      if (skillPath.startsWith(path.join(os.homedir(), 'Library', 'Application Support'))) {
        fs.rmSync(skillPath, { recursive: true, force: true });
      }
      await invokeNative('skill_reload');
    }
  });
});
