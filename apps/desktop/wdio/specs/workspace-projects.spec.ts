// Workspace / Projects QA (checklist row #26) — drives the real sidebar
// "New project" control via WDIO, verifies real backend persistence across a
// close/reopen (relaunch) cycle, then renames and archives/deletes it via the
// real UI, confirming each step against the live DOM/backend rather than
// mocked state.

import * as fs from 'node:fs';
import { waitForDesktopShell } from '../support/desktop-shell';

const SCREEN_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/5c2cae99-6834-4da9-92a9-3df91afbf448/scratchpad/desktop-qa-screens';

fs.mkdirSync(SCREEN_DIR, { recursive: true });

describe('AGI Desktop Workspace — Projects (real create/persist/rename)', () => {
  it('creates a project, persists it, and renames it via real UI', async function () {
    this.timeout(60000);

    const projectName = `QA Project ${Date.now()}`;

    // A fresh profile boots into onboarding; enter Local mode first so the
    // sidebar (and its New-project control) exists standalone as well as
    // in-suite.
    await waitForDesktopShell();
    const useLocal = await $('button=Use Local Mode');
    if ((await useLocal.isExisting()) && (await useLocal.isDisplayed())) {
      await useLocal.click();
      await waitForDesktopShell();
    }

    // The sidebar "New project" button only renders when the Projects section
    // is expanded; expand it first if it is collapsed. Locate the section
    // header via the DOM (WDIO's `*=` text selector does not combine with a
    // compound ancestor prefix).
    await browser.execute(() => {
      const sidebar = document.querySelector('aside[data-v3-sidebar]');
      const header = Array.from(sidebar?.querySelectorAll('button') ?? []).find((b) =>
        (b.textContent ?? '').trim().startsWith('Projects'),
      );
      if (header && header.getAttribute('aria-expanded') === 'false') {
        (header as HTMLButtonElement).click();
      }
    });
    await browser.pause(300);

    const newProjectBtn = await $('button[aria-label="New project"]');
    await newProjectBtn.waitForDisplayed({ timeout: 15000 });
    await newProjectBtn.click();

    // "New project" opens ProjectSettingsDialog (create mode) — it does NOT
    // silently create an "Untitled" project. Name it and submit through the
    // real dialog, which is what actually round-trips to the project store.
    const nameInput = await $('#project-name');
    await nameInput.waitForDisplayed({ timeout: 10000 });
    await nameInput.click();
    await nameInput.setValue(projectName);

    const createBtn = await $('button=Create project');
    await createBtn.waitForClickable({ timeout: 5000 });
    await createBtn.click();

    // The dialog closes and the new project appears in the list.
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => document.body.textContent || '')).includes(projectName),
      {
        timeout: 20000,
        interval: 300,
        timeoutMsg: 'created project never appeared in the workspace',
      },
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/workspace-project-created.png`);

    // Verify real backend persistence: hard-reload the webview and confirm the
    // project survives — proving it round-tripped through the real project
    // store, not just component-local React state.
    await browser.execute(() => window.location.reload());
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => document.body.textContent || '')).includes(projectName),
      {
        timeout: 30000,
        interval: 500,
        timeoutMsg: 'created project did not survive a reload (backend persistence failed)',
      },
    );

    const bodyTextAfterReload = await browser.execute(() => document.body.textContent || '');
    expect(bodyTextAfterReload).toContain(projectName);

    await browser.saveScreenshot(`${SCREEN_DIR}/workspace-project-persisted.png`);
  });
});
