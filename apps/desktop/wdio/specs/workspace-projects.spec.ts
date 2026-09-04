import * as fs from 'node:fs';
import { waitForDesktopShell } from '../support/desktop-shell';

const SCREEN_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/5c2cae99-6834-4da9-92a9-3df91afbf448/scratchpad/desktop-qa-screens';

fs.mkdirSync(SCREEN_DIR, { recursive: true });

describe('AGI Desktop Workspace, Projects (real create/persist/rename)', () => {
  it('creates a project, persists it, and renames it via real UI', async function () {
    this.timeout(60000);

    const projectName = `QA Project ${Date.now()}`;

    await waitForDesktopShell();
    const useLocal = await $('button=Use Local Mode');
    if ((await useLocal.isExisting()) && (await useLocal.isDisplayed())) {
      await useLocal.click();
      await waitForDesktopShell();
    }

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

    const nameInput = await $('#project-name');
    await nameInput.waitForDisplayed({ timeout: 10000 });
    await nameInput.click();
    await nameInput.setValue(projectName);

    const createBtn = await $('button=Create project');
    await createBtn.waitForClickable({ timeout: 5000 });
    await createBtn.click();

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
