// Live-interaction verification for DESKTOP-SETTINGS-SILENT-DISCARD-01 (see
// docs/agent-context/known-flaws.md).
//
// Before the fix: SettingsPanel.tsx wired every close path (X button, Escape,
// click-outside, footer "Cancel") to unconditionally call loadSettings(),
// which re-fetches settings from the Rust-side disk file and overwrites the
// live Zustand store -- silently discarding any edit that wasn't explicitly
// committed via "Save Changes", with zero warning. AgentsSettings.tsx
// ("Timeout Warnings") and PersonalizationSettings.tsx (Name/Occupation/
// Bio/sliders) both write directly to that same store and are not
// self-saving, so they were both silently affected.
//
// A second, related bug: buildCurrentSnapshot() (backing hasUnsavedChanges /
// the Save button's disabled state) never read state.personalization, so
// editing Personalization never enabled "Save Changes" even though the edit
// was real.
//
// This spec drives the real dialog (no mocks) and asserts:
//  1. Toggling "Timeout Warnings" then closing via the X button now
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

import { closeAnySettingsDialog, waitForSettingsReady } from '../support/close-settings';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('settings-discard');

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
    return Boolean(nav?.nextElementSibling);
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

function dialogHasButton(label: string) {
  return browser.execute((text) => {
    const nav = document.querySelector('nav[aria-label="Settings sections"]');
    const dialog = nav?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
    return Array.from(dialog?.querySelectorAll('button') ?? []).some(
      (button) => (button.textContent ?? '').trim() === text,
    );
  }, label) as Promise<boolean>;
}

async function openSettings() {
  const gear = await $('button[aria-label="Settings"]');
  await gear.waitForDisplayed({ timeout: 15000 });
  await gear.click();
  // Nav is disabled while Settings loads; wait for interactivity before any
  // tab click (otherwise the click is a silent no-op).
  await waitForSettingsReady();
}

function clickDialogXClose() {
  return browser.execute(() => {
    const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
    // The shared Dialog primitive's default closeLabel is "Close dialog"
    // (packages/ui/ui/src/primitives/Dialog.tsx); match by prefix so a label
    // tweak doesn't silently disable this close path again.
    const closeButton = btns.find((b) =>
      (b.querySelector('.sr-only')?.textContent ?? '').startsWith('Close'),
    );
    if (closeButton) {
      (closeButton as HTMLButtonElement).click();
      return true;
    }
    return false;
  }) as Promise<boolean>;
}

describe('Settings discard-confirmation (DESKTOP-SETTINGS-SILENT-DISCARD-01)', () => {
  afterEach(async () => {
    if (!(await closeAnySettingsDialog())) {
      throw new Error('Settings remained open after discard-spec cleanup');
    }
  });

  it('toggling Timeout Warnings then closing via X surfaces a discard confirmation, and "Keep editing" preserves the edit', async () => {
    await browser.pause(1500);
    await openSettings();

    const clickedAgents = await clickButtonWithText(
      'nav[aria-label="Settings sections"]',
      'Agents',
    );
    expect(clickedAgents).toBe(true);
    // The Agents tab content is React.lazy behind Suspense — wait for the
    // switch itself rather than a fixed pause (measured: 1300ms can lose the
    // race even on an idle machine).
    await browser.waitUntil(async () => (await getSwitchState('agents-timeoutWarnings')) !== null, {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: 'The Agents tab never rendered its Timeout Warnings switch',
    });

    const before = await getSwitchState('agents-timeoutWarnings');
    console.log('Timeout Warnings switch state before toggle:', before);
    expect(before === 'true' || before === 'false').toBe(true);

    const toggled = await clickById('agents-timeoutWarnings');
    expect(toggled).toBe(true);
    await browser.pause(300);

    const afterToggle = await getSwitchState('agents-timeoutWarnings');
    console.log('Timeout Warnings switch state after toggle:', afterToggle);
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
    // Radix's AlertDialogCancel closes on a real activation; a stray synthetic
    // click can land while the open transition is still settling and be
    // swallowed, leaving the dialog up. Retry the click until the alertdialog
    // actually goes away rather than clicking once and hoping.
    let keptEditing = false;
    await browser.waitUntil(
      async () => {
        if (await alertDialogVisible()) {
          keptEditing = await clickButtonWithText('[role="alertdialog"]', 'Keep editing');
          return false;
        }
        return true;
      },
      {
        timeout: 15_000,
        interval: 500,
        timeoutMsg: 'alertdialog did not close after choosing "Keep editing"',
      },
    );
    expect(keptEditing).toBe(true);

    const alertGone = await alertDialogVisible();
    expect(alertGone).toBe(false);

    const settingsStillOpen = await settingsContentRoot();
    expect(settingsStillOpen).toBe(true);

    const afterKeepEditing = await getSwitchState('agents-timeoutWarnings');
    console.log('Timeout Warnings switch state after Keep editing:', afterKeepEditing);
    expect(afterKeepEditing).toBe(afterToggle); // edit preserved, not reverted

    // Restore original value so we don't leave the toggle mutated, then close
    // via X again -- this time hasUnsavedChanges should be false (back at
    // baseline) so the close should go through with NO confirmation prompt.
    await clickById('agents-timeoutWarnings');
    const restored = await getSwitchState('agents-timeoutWarnings');
    expect(restored).toBe(before);
    await browser.waitUntil(async () => (await isSaveChangesDisabled()) === true, {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Restoring Timeout Warnings did not return Settings to its clean baseline',
    });

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
    // Same lazy-tab race as the Agents test: wait for the tab's own control.
    await browser.waitUntil(async () => (await getInputValue('personalization-name')) !== null, {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: 'The Personalization tab never rendered its name input',
    });

    const disabledBefore = await isSaveChangesDisabled();
    console.log('Save Changes disabled before any edit:', disabledBefore);
    expect(disabledBefore).toBe(true);

    const originalName = (await getInputValue('personalization-name')) ?? '';
    const probeName = `QA-Discard-Probe-${Date.now()}`;
    console.log('Original personalization name:', JSON.stringify(originalName));

    const setOk = await setInputValueViaReactChange('personalization-name', probeName);
    expect(setOk).toBe(true);
    // Personalization writes to the shared Settings draft synchronously. Wait
    // for the parent snapshot effect to expose that draft through the footer
    // rather than sleeping for the retired debounce implementation.
    await browser.waitUntil(async () => (await isSaveChangesDisabled()) === false, {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Personalization edit did not enable Save Changes',
    });

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

    let discarded = false;
    await browser.waitUntil(
      async () => {
        if (await alertDialogVisible()) {
          discarded = await clickButtonWithText('[role="alertdialog"]', 'Discard changes');
          return false;
        }
        return !(await settingsContentRoot());
      },
      {
        timeout: 15_000,
        interval: 250,
        timeoutMsg: 'Settings panel did not close after "Discard changes"',
      },
    );
    expect(discarded).toBe(true);

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
    await browser.waitUntil(async () => (await getInputValue('personalization-name')) !== null, {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: 'The Personalization tab never re-rendered its name input after reopen',
    });

    const nameAfterDiscard = await getInputValue('personalization-name');
    console.log('Personalization name after discard + reopen:', JSON.stringify(nameAfterDiscard));
    await browser.saveScreenshot(`${SCREEN_DIR}/04-personalization-reverted-after-discard.png`);
    expect(nameAfterDiscard).toBe(originalName);

    expect(await clickDialogXClose()).toBe(true);
    await browser.waitUntil(async () => !(await settingsContentRoot()), {
      timeout: 5_000,
      timeoutMsg: 'Clean Settings panel did not close after verification',
    });
  });

  it('keeps deferred Save and Cancel controls after switching to a self-saving tab', async () => {
    await openSettings();
    expect(
      await clickButtonWithText('nav[aria-label="Settings sections"]', 'Personalization'),
    ).toBe(true);
    await browser.waitUntil(async () => (await getInputValue('personalization-name')) !== null, {
      timeout: 15_000,
      interval: 100,
      timeoutMsg: 'The Personalization tab never rendered its name input',
    });

    const originalName = (await getInputValue('personalization-name')) ?? '';
    const probeName = `QA-Cross-Tab-Discard-${Date.now()}`;
    expect(await setInputValueViaReactChange('personalization-name', probeName)).toBe(true);
    await browser.waitUntil(async () => (await isSaveChangesDisabled()) === false, {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Deferred Personalization edit did not enable Save Changes',
    });

    expect(await clickButtonWithText('nav[aria-label="Settings sections"]', 'Cowork')).toBe(true);
    await browser.waitUntil(
      async () =>
        (await dialogHasButton('Save Changes')) &&
        (await dialogHasButton('Cancel')) &&
        !(await dialogHasButton('Close')),
      {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Self-saving tab replaced the global dirty Save/Cancel footer',
      },
    );
    expect((await $('body').getText()).includes('Changes in this section apply immediately.')).toBe(
      false,
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/05-dirty-footer-survives-self-saving-tab.png`);

    expect(await clickButtonWithText('[role="dialog"]', 'Cancel')).toBe(true);
    await browser.waitUntil(alertDialogVisible, {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Cancel did not surface the discard confirmation',
    });
    expect(await clickButtonWithText('[role="alertdialog"]', 'Keep editing')).toBe(true);
    await browser.waitUntil(async () => !(await alertDialogVisible()), {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Keep editing did not return to Settings',
    });
    expect(await settingsContentRoot()).toBe(true);

    expect(await clickButtonWithText('[role="dialog"]', 'Cancel')).toBe(true);
    await browser.waitUntil(alertDialogVisible, {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Second Cancel did not surface the discard confirmation',
    });
    expect(await clickButtonWithText('[role="alertdialog"]', 'Discard changes')).toBe(true);
    await browser.waitUntil(async () => !(await settingsContentRoot()), {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Discard changes did not close Settings',
    });

    await openSettings();
    expect(
      await clickButtonWithText('nav[aria-label="Settings sections"]', 'Personalization'),
    ).toBe(true);
    await browser.waitUntil(async () => (await getInputValue('personalization-name')) !== null, {
      timeout: 15_000,
      interval: 100,
      timeoutMsg: 'Personalization name did not render after discard and reopen',
    });
    expect(await getInputValue('personalization-name')).toBe(originalName);
    expect(await clickDialogXClose()).toBe(true);
    await browser.waitUntil(async () => !(await settingsContentRoot()), {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Clean Settings panel did not close after cross-tab verification',
    });
    expect(await alertDialogVisible()).toBe(false);
  });
});
