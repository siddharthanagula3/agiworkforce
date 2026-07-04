// Live-interaction verification for DESKTOP-SETTINGS-SILENT-DISCARD-01 (see
// docs/agent-context/known-flaws.md).
//
// Before the fix: SettingsPanel.tsx wired every close path (X button, Escape,
// click-outside, footer "Cancel") to unconditionally call loadSettings(),
// which re-fetches settings from the Rust-side disk file and overwrites the
// live Zustand store -- silently discarding any edit that wasn't explicitly
// committed via "Save Changes", with zero warning. AgentsSettings.tsx
// ("Always Use Agent Mode") and PersonalizationSettings.tsx (Name/Occupation/
// Bio/sliders) both write directly to that same store and are not
// self-saving, so they were both silently affected.
//
// A second, related bug: buildCurrentSnapshot() (backing hasUnsavedChanges /
// the Save button's disabled state) never read state.personalization, so
// editing Personalization never enabled "Save Changes" even though the edit
// was real.
//
// This spec drives the real dialog (no mocks) and asserts:
//  1. Toggling "Always Use Agent Mode" then closing via the X button now
//     surfaces an explicit "Discard unsaved changes?" confirmation instead of
//     silently discarding.
//  2. Choosing "Keep editing" leaves the edit intact and the panel open.
//  3. Editing Personalization's Name field enables "Save Changes" (previously
//     stayed disabled forever for a personalization-only edit).
//  4. Choosing "Discard changes" on that edit both closes the panel AND
//     reverts the Name field to its pre-edit value the next time Settings is
//     reopened -- i.e. discard is now honest for personalization too, not
//     just for the other store-backed fields.
//
// Neither assertion path calls "Save Changes", so this test does not mutate
// the developer machine's real persisted settings file.

import * as fs from 'node:fs';

const SCREEN_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/75367813-fb2a-4a49-bdcd-6412347c218f/scratchpad/desktop-qa-screens/settings-discard';
fs.mkdirSync(SCREEN_DIR, { recursive: true });

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

function settingsContentRoot() {
  return browser.execute(() => {
    const nav = document.querySelector('nav[aria-label="Settings sections"]');
    const dialog = nav?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
    return !!dialog?.querySelector('.flex-1.flex.flex-col.min-w-0');
  });
}

function getSwitchState(id: string) {
  return browser.execute((elId) => {
    const el = document.getElementById(elId);
    return el ? el.getAttribute('aria-checked') : null;
  }, id) as Promise<string | null>;
}

function clickById(id: string) {
  return browser.execute((elId) => {
    const el = document.getElementById(elId) as HTMLElement | null;
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, id) as Promise<boolean>;
}

function getInputValue(id: string) {
  return browser.execute((elId) => {
    const el = document.getElementById(elId) as HTMLInputElement | null;
    return el ? el.value : null;
  }, id) as Promise<string | null>;
}

function setInputValueViaReactChange(id: string, value: string) {
  return browser.execute(
    (elId, val) => {
      const el = document.getElementById(elId) as HTMLInputElement | null;
      if (!el) return false;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    id,
    value,
  ) as Promise<boolean>;
}

function alertDialogVisible() {
  return browser.execute(() => !!document.querySelector('[role="alertdialog"]'));
}

function getAlertDialogTitle() {
  return browser.execute(() => {
    const el = document.querySelector(
      '[role="alertdialog"] h2, [role="alertdialog"] [class*="title" i]',
    );
    return el?.textContent?.trim() ?? null;
  });
}

function isSaveChangesDisabled() {
  return browser.execute(() => {
    const nav = document.querySelector('nav[aria-label="Settings sections"]');
    const dialog = nav?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
    const buttons = Array.from(dialog?.querySelectorAll('button') ?? []);
    const saveBtn = buttons.find((b) => (b.textContent ?? '').trim().startsWith('Save Changes'));
    return saveBtn ? (saveBtn as HTMLButtonElement).disabled : null;
  });
}

async function openSettings() {
  const gear = await $('button[aria-label="Settings"]');
  await gear.waitForDisplayed({ timeout: 15000 });
  await gear.click();
  const nav = await $('nav[aria-label="Settings sections"]');
  await nav.waitForDisplayed({ timeout: 10000 });
}

function clickDialogXClose() {
  return browser.execute(() => {
    const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
    const closeButton = btns.find((b) => b.querySelector('.sr-only')?.textContent === 'Close');
    if (closeButton) {
      (closeButton as HTMLButtonElement).click();
      return true;
    }
    return false;
  }) as Promise<boolean>;
}

describe('Settings discard-confirmation (DESKTOP-SETTINGS-SILENT-DISCARD-01)', () => {
  it('toggling Agent Mode then closing via X surfaces a discard confirmation, and "Keep editing" preserves the edit', async () => {
    await browser.pause(1500);
    await openSettings();

    const clickedAgents = await clickButtonWithText(
      'nav[aria-label="Settings sections"]',
      'Agents',
    );
    expect(clickedAgents).toBe(true);
    await browser.pause(1300);

    const before = await getSwitchState('agents-agentMode');
    console.log('Agent Mode switch state before toggle:', before);
    expect(before === 'true' || before === 'false').toBe(true);

    const toggled = await clickById('agents-agentMode');
    expect(toggled).toBe(true);
    await browser.pause(300);

    const afterToggle = await getSwitchState('agents-agentMode');
    console.log('Agent Mode switch state after toggle:', afterToggle);
    expect(afterToggle).not.toBe(before);

    // Close via the X button (top-right of the dialog) -- one of the paths
    // that used to silently discard with zero warning.
    const closedViaX = await clickDialogXClose();
    expect(closedViaX).toBe(true);
    await browser.pause(400);

    const alertShown = await alertDialogVisible();
    const alertTitle = await getAlertDialogTitle();
    console.log('Discard-confirmation shown after X close:', alertShown, 'title:', alertTitle);
    await browser.saveScreenshot(`${SCREEN_DIR}/01-discard-confirm-on-x-close.png`);
    expect(alertShown).toBe(true);
    expect(alertTitle).toMatch(/discard/i);

    // Settings panel must still be open behind the confirm (we haven't
    // resolved the confirmation yet).
    const stillOpenBehind = await settingsContentRoot();
    expect(stillOpenBehind).toBe(true);

    // Choose "Keep editing" -- must NOT discard the edit or close Settings.
    const keptEditing = await clickButtonWithText('[role="alertdialog"]', 'Keep editing');
    expect(keptEditing).toBe(true);
    // Radix's exit animation keeps the alertdialog node mounted briefly after
    // close; under concurrent-agent CPU contention on this shared dev machine
    // that can take noticeably longer than the open-transition waits above,
    // so poll instead of a single fixed pause.
    await browser.waitUntil(async () => !(await alertDialogVisible()), {
      timeout: 5000,
      timeoutMsg: 'alertdialog did not close after choosing "Keep editing"',
    });

    const alertGone = await alertDialogVisible();
    expect(alertGone).toBe(false);

    const settingsStillOpen = await settingsContentRoot();
    expect(settingsStillOpen).toBe(true);

    const afterKeepEditing = await getSwitchState('agents-agentMode');
    console.log('Agent Mode switch state after Keep editing:', afterKeepEditing);
    expect(afterKeepEditing).toBe(afterToggle); // edit preserved, not reverted

    // Restore original value so we don't leave the toggle mutated, then close
    // via X again -- this time hasUnsavedChanges should be false (back at
    // baseline) so the close should go through with NO confirmation prompt.
    await clickById('agents-agentMode');
    await browser.pause(300);
    const restored = await getSwitchState('agents-agentMode');
    expect(restored).toBe(before);

    const closedAgainViaX = await clickDialogXClose();
    expect(closedAgainViaX).toBe(true);
    await browser.pause(500);

    const alertShownAtBaseline = await alertDialogVisible();
    console.log(
      'Discard-confirmation shown when back at baseline (should be false):',
      alertShownAtBaseline,
    );
    const navGoneNow = await browser.execute(
      () => !document.querySelector('nav[aria-label="Settings sections"]'),
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/02-closed-cleanly-at-baseline.png`);
    expect(alertShownAtBaseline).toBe(false);
    expect(navGoneNow).toBe(true);
  });

  it('editing Personalization enables Save Changes, and discarding it reverts the field on reopen', async () => {
    await openSettings();

    const clickedPersonalization = await clickButtonWithText(
      'nav[aria-label="Settings sections"]',
      'Personalization',
    );
    expect(clickedPersonalization).toBe(true);
    await browser.pause(1300);

    const disabledBefore = await isSaveChangesDisabled();
    console.log('Save Changes disabled before any edit:', disabledBefore);
    expect(disabledBefore).toBe(true);

    const originalName = (await getInputValue('personalization-name')) ?? '';
    const probeName = `QA-Discard-Probe-${Date.now()}`;
    console.log('Original personalization name:', JSON.stringify(originalName));

    const setOk = await setInputValueViaReactChange('personalization-name', probeName);
    expect(setOk).toBe(true);
    // PersonalizationSettings.tsx debounces the store commit 400ms after the
    // last edit before calling setPersonalization(); wait past that before
    // asserting on hasUnsavedChanges/Save-enabled state.
    await browser.pause(700);

    const disabledAfterEdit = await isSaveChangesDisabled();
    console.log(
      'Save Changes disabled after Personalization edit (should be false):',
      disabledAfterEdit,
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/03-personalization-edit-enables-save.png`);
    expect(disabledAfterEdit).toBe(false);

    // Close via X -- must surface the discard confirmation (hasUnsavedChanges
    // is now true because of the personalization edit, per the bug-2 fix).
    const closedViaX = await clickDialogXClose();
    expect(closedViaX).toBe(true);
    await browser.pause(400);

    const alertShown = await alertDialogVisible();
    expect(alertShown).toBe(true);

    const discarded = await clickButtonWithText('[role="alertdialog"]', 'Discard changes');
    expect(discarded).toBe(true);
    await browser.waitUntil(
      async () =>
        browser.execute(() => !document.querySelector('nav[aria-label="Settings sections"]')),
      { timeout: 5000, timeoutMsg: 'Settings panel did not close after "Discard changes"' },
    );

    const navGone = await browser.execute(
      () => !document.querySelector('nav[aria-label="Settings sections"]'),
    );
    expect(navGone).toBe(true);

    // Reopen and confirm the Name field reverted -- this is the interaction
    // the bug-2 fix must get right: loadSettings() alone does NOT revert
    // personalization (it isn't part of the disk-backed payload), so
    // handleCancel must explicitly restore it from the open-time baseline.
    await openSettings();
    const clickedPersonalizationAgain = await clickButtonWithText(
      'nav[aria-label="Settings sections"]',
      'Personalization',
    );
    expect(clickedPersonalizationAgain).toBe(true);
    await browser.pause(1300);

    const nameAfterDiscard = await getInputValue('personalization-name');
    console.log('Personalization name after discard + reopen:', JSON.stringify(nameAfterDiscard));
    await browser.saveScreenshot(`${SCREEN_DIR}/04-personalization-reverted-after-discard.png`);
    expect(nameAfterDiscard).toBe(originalName);
  });
});
