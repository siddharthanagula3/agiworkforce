import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { URL } from 'node:url';

export const CODE_UI_TASK = 'Explain how to run the tests for this fixture project.';
export const CODE_UI_REPLY = 'Run npm test to check the fixture project.';
export const CODE_UI_EDIT_FILE = 'README.md';
export const CODE_UI_EDIT_TASK = 'Update the fixture README with the test command.';
export const CODE_UI_EDIT_REPLY = 'The fixture README now includes the test command.';
export const CODE_UI_ORIGINAL = 'Fixture project test instructions.';
export const CODE_UI_EDITED = 'Run npm test before submitting a change.';
const SIBLING_FILE = 'elsewhere.txt';
const SIBLING_EDIT = 'This sibling edit stays outside the approved folder.\n';

export function prepareCodeUiProject(project, environment, repository = project) {
  writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ scripts: { test: 'node --test' } }),
  );
  writeFileSync(path.join(project, CODE_UI_EDIT_FILE), `${CODE_UI_ORIGINAL}\n`);
  const env = Object.fromEntries(
    Object.entries(environment).filter(([key]) => !key.startsWith('GIT_')),
  );
  const git = (...args) => execFileSync('git', args, { cwd: repository, env, stdio: 'pipe' });
  const prefix = path.relative(repository, project);
  if (prefix) writeFileSync(path.join(repository, SIBLING_FILE), 'Original sibling contents.\n');
  git('init', '-q', '-b', 'main');
  git(
    'add',
    '--',
    path.join(prefix, 'package.json'),
    path.join(prefix, CODE_UI_EDIT_FILE),
    ...(prefix ? [SIBLING_FILE] : []),
  );
  git(
    '-c',
    'user.name=AGI acceptance fixture',
    '-c',
    'user.email=qa@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    'Fixture project',
  );
  if (prefix) writeFileSync(path.join(repository, SIBLING_FILE), SIBLING_EDIT);
}

export function prepareScopedCli(dir, agi, project) {
  const wrapper = path.join(dir, 'owned-agi.cjs');
  writeFileSync(
    wrapper,
    `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { realpathSync } = require('node:fs');
const project = ${JSON.stringify(project)};
const args = process.argv.slice(2);
if (args[0] === 'app-server') {
  if (realpathSync(process.cwd()) !== project) process.exit(64);
  args.push('--workspace-consent', project, '--workspace-consent-at-ms', String(Date.now()));
}
const result = spawnSync(${JSON.stringify(agi)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
    { mode: 0o700 },
  );
  return wrapper;
}

export const codeUiEntry = `
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CloudCodePage } from '@/features/code/CloudCodePage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const api = {
  list: async () => ({
    availability: { deploymentEnabled: true, planEntitled: true, planTier: 'pro', maxSessions: 5 },
    sessions: [],
    runtimes: [],
  }),
  listRepositories: async () => ({ repositories: [], installationCount: 0, truncated: false, unreachable: [] }),
  listBranches: async () => ({ branches: [], truncated: false }),
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CloudCodePage api={api} />
    </QueryClientProvider>
  </StrictMode>
);
`;

export function codeUiAliases(dir) {
  const modules = {
    navigation: `
const router = {
  push: (url) => window.history.pushState({}, '', url),
  replace: (url) => window.history.replaceState({}, '', url),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => undefined,
  prefetch: () => undefined,
  events: { on: () => undefined, off: () => undefined },
};
export default router;
export const useRouter = () => router;
export const usePathname = () => '/code';
export const useSearchParams = () => new URLSearchParams(window.location.search);
export const useParams = () => ({});
`,
    link: `
export default function Link({ href, children, ...props }) {
  return <a href={href} {...props}>{children}</a>;
}
`,
    image: `
export default function Image({ src, alt, ...props }) {
  return <img src={typeof src === 'string' ? src : src.src} alt={alt} {...props} />;
}
`,
    dynamic: `
import { lazy, Suspense } from 'react';
export default function dynamic(load, options) {
  const Component = lazy(async () => {
    const module = await load();
    return typeof module === 'function' ? { default: module } : module;
  });
  return function Dynamic(props) {
    return <Suspense fallback={options?.loading?.() ?? null}><Component {...props} /></Suspense>;
  };
}
`,
    identity: `
const getToken = async () => 'fixture-token';
const user = { id: 'fixture-account', firstName: 'QA', emailAddresses: [], publicMetadata: {} };
const session = { id: 'fixture-auth', status: 'active', user, getToken };
const auth = { isLoaded: true, isSignedIn: true, userId: user.id, sessionId: session.id, user, session, getToken };
const clerk = { loaded: true, client: null, session, user, signOut: async () => {}, addListener: () => () => {} };
export const useAuth = () => auth;
export const useClerk = () => clerk;
export const useSession = () => auth;
export const useUser = () => auth;
export const ClerkProvider = ({ children }) => children;
export const AuthenticateWithRedirectCallback = () => null;
export const useSignIn = () => ({ isLoaded: false });
export const useSignUp = () => ({ isLoaded: false });
`,
  };
  const files = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => {
      const file = path.join(dir, `fixture-${name}.jsx`);
      writeFileSync(file, source);
      return [name, file];
    }),
  );
  return {
    'next/navigation': files.navigation,
    'next/router': files.navigation,
    'next/link': files.link,
    'next/image': files.image,
    'next/dynamic': files.dynamic,
    '@clerk/nextjs': files.identity,
  };
}

const CODE_UI_IMAGE_NAME = 'reference.png';
const CODE_UI_IMAGE = readFileSync(new URL('../../../../web/public/logo-192.png', import.meta.url));
const exifStart = CODE_UI_IMAGE.indexOf('eXIf') - 4;
assert.ok(exifStart >= 8);
const exifEnd = exifStart + CODE_UI_IMAGE.readUInt32BE(exifStart) + 12;
export const CODE_UI_PREPARED_IMAGE_URL = `data:image/png;base64,${Buffer.concat([
  CODE_UI_IMAGE.subarray(0, exifStart),
  CODE_UI_IMAGE.subarray(exifEnd),
]).toString('base64')}`;

async function dropFixtureImage(page, input) {
  await input.evaluate(
    (input, { bytes, name }) => {
      const { DataTransfer, File, DragEvent } = input.ownerDocument.defaultView;
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([Uint8Array.from(bytes)], name, { type: 'image/png' }));
      input.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }),
      );
      input.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    },
    { bytes: [...CODE_UI_IMAGE], name: CODE_UI_IMAGE_NAME },
  );
  const preview = page.getByRole('img', { name: CODE_UI_IMAGE_NAME });
  await preview.waitFor({ state: 'visible' });
  await preview.evaluate((image) => image.decode());
  return preview;
}

async function verifyComposerFocus(page, input) {
  const styles = () =>
    input.evaluate((textarea) => {
      const view = textarea.ownerDocument.defaultView;
      const inner = view.getComputedStyle(textarea);
      const frame = view.getComputedStyle(textarea.parentElement.parentElement);
      return {
        focused: textarea.ownerDocument.activeElement === textarea,
        innerOutline: inner.outlineStyle,
        innerShadow: inner.boxShadow,
        frameOutline: frame.outlineStyle,
        frameShadow: frame.boxShadow,
        frameBorder: frame.borderColor,
      };
    });
  const resting = await styles();
  await input.click();
  assert.deepEqual(await styles(), {
    ...resting,
    focused: true,
    innerOutline: 'none',
    innerShadow: 'none',
    frameOutline: 'none',
    frameShadow: 'none',
  });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.deepEqual(await styles(), {
    ...resting,
    focused: true,
    innerOutline: 'none',
    innerShadow: 'none',
    frameOutline: 'solid',
    frameShadow: 'none',
  });
  await input.click();
}

export async function exerciseCodeUi({
  page,
  origin,
  project,
  repository,
  cliHome,
  invoke,
  modelCalls,
  reportDir,
}) {
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 840, height: 740 });
  await page.goto(`${origin}/code`);

  const openSessions = page.getByRole('button', { name: 'Open session list' });
  const drawer = page.getByRole('dialog');
  const chooseFolder = page.getByRole('button', { name: 'Choose a local folder', exact: true });
  const usage = page.getByRole('button', { name: 'Code usage', exact: true });
  await chooseFolder.waitFor({ state: 'visible' });
  await usage.waitFor({ state: 'visible' });
  assert.equal(await usage.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.getByTestId('code-usage-dashboard').count(), 0);
  await page.setViewportSize({ width: 1200, height: 440 });
  const draftSidePanel = page.getByRole('button', { name: 'Side panel', exact: true });
  await draftSidePanel.click();
  const draftToolLauncher = page.getByRole('complementary', { name: 'Panel shortcuts' });
  assert.equal(
    await draftToolLauncher.getByRole('button', { name: 'Terminal', exact: true }).isDisabled(),
    true,
  );
  await draftToolLauncher.getByRole('button', { name: 'Browser', exact: true }).click();
  const draftBrowser = page.getByRole('complementary', { name: 'Browser', exact: true });
  await draftBrowser.getByRole('textbox', { name: 'Web address' }).waitFor();
  assert.equal(modelCalls(), 0);
  await draftSidePanel.click();
  await draftBrowser.waitFor({ state: 'hidden' });
  const footer = page.getByTestId('code-rail-account-footer');
  await footer.getByRole('button', { name: /^Account menu for /u }).waitFor();
  const railScroll = page.getByTestId('code-rail-session-scroll');
  const footerBounds = await footer.boundingBox();
  const scrollBounds = await railScroll.boundingBox();
  assert.ok(footerBounds && scrollBounds);
  assert.ok(scrollBounds.y + scrollBounds.height <= footerBounds.y + 1);
  assert.ok(footerBounds.y + footerBounds.height <= 440);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  assert.equal(
    await page.getByRole('menuitem', { name: 'Scheduled' }).getAttribute('href'),
    '/chat/schedules',
  );
  await page.getByRole('menuitem', { name: 'Edit sidebar' }).click();
  const sidebarEditor = page.getByRole('dialog', { name: 'Edit sidebar' });
  await sidebarEditor.getByRole('checkbox', { name: 'Scheduled' }).waitFor();
  await page.keyboard.press('Escape');
  await sidebarEditor.waitFor({ state: 'hidden' });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 664 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole('link', { name: 'Code usage', exact: true }).waitFor();
    const home = await page.getByTestId('code-home').boundingBox();
    const composer = await page.getByTestId('code-composer-area').boundingBox();
    assert.ok(home && composer && home.y + home.height <= composer.y + 1);
    assert.ok(composer.y + composer.height <= viewport.height + 1);
  }
  await page.setViewportSize({ width: 840, height: 740 });
  await usage.waitFor({ state: 'visible' });
  await page.screenshot({
    path: path.join(reportDir, 'code-ui-first-run.png'),
    animations: 'disabled',
  });
  await chooseFolder.click();
  await page.getByRole('button', { name: 'Change the folder: project' }).waitFor();
  const roots = await invoke('workspace_list_roots');
  assert.deepEqual(
    roots.map((root) => root.path),
    [project],
  );

  const composeField = page.getByTestId('code-composer-field');
  const composerArea = page.getByTestId('code-composer-area');
  const firstTask = composeField.getByRole('textbox');
  const microphone = composeField.getByRole('button', { name: 'Start voice input' });
  const start = composeField.getByRole('button', { name: 'Start the task' });
  await microphone.waitFor({ state: 'visible' });
  assert.equal(await microphone.isDisabled(), true);
  assert.equal(
    await microphone.getAttribute('aria-description'),
    'Voice input requires a supported Cloud session.',
  );
  await composeField.getByRole('button', { name: 'Add to this session' }).waitFor();
  assert.equal(await start.count(), 0);
  await verifyComposerFocus(page, firstTask);
  await composerArea.screenshot({
    path: path.join(reportDir, 'code-composer-empty.png'),
    animations: 'disabled',
  });
  await firstTask.fill(CODE_UI_TASK);
  await start.waitFor({ state: 'visible' });
  await microphone.waitFor({ state: 'visible' });
  assert.equal(await start.isDisabled(), true);
  const notices = page.getByTestId('code-notices');
  const allowCommands = notices.getByRole('button', { name: 'Allow running commands' });
  await allowCommands.waitFor({ state: 'visible' });
  await page.screenshot({
    path: path.join(reportDir, 'code-ui-folder-access.png'),
    animations: 'disabled',
  });
  await allowCommands.click();
  await allowCommands.waitFor({ state: 'hidden' });
  assert.equal(await firstTask.inputValue(), CODE_UI_TASK);
  await draftSidePanel.click();
  await draftToolLauncher.getByRole('button', { name: 'Terminal', exact: true }).click();
  const draftTerminal = page.getByTestId('local-terminal-dock');
  await draftTerminal.getByRole('tab', { name: 'project', exact: true }).waitFor();
  const terminalInput = draftTerminal.locator('input, textarea.xterm-helper-textarea').first();
  await terminalInput.waitFor({ state: 'attached' });
  await draftTerminal.getByLabel('Starting the shell…').waitFor({ state: 'hidden' });
  await terminalInput.focus();
  const commandMode = await terminalInput.evaluate((element) => element.tagName === 'INPUT');
  if (process.env.AGI_ACCEPTANCE_REQUIRE_WORKSPACE_TERMINAL === '1') {
    assert.equal(commandMode, false, 'The workspace terminal fell back to Command mode');
  }
  if (commandMode) {
    await terminalInput.fill('pwd');
    await terminalInput.press('Enter');
    await draftTerminal.getByText(project, { exact: true }).waitFor();
  } else {
    await page.keyboard.type('pwd > .agi-terminal-cwd-check');
    await page.keyboard.press('Enter');
    const cwdReceipt = path.join(project, '.agi-terminal-cwd-check');
    try {
      const deadline = Date.now() + 10_000;
      let reportedFolder = '';
      while (!reportedFolder && Date.now() < deadline) {
        if (existsSync(cwdReceipt)) reportedFolder = readFileSync(cwdReceipt, 'utf8').trim();
        if (!reportedFolder) await setTimeout(50);
      }
      assert.equal(reportedFolder, project, await draftTerminal.innerText());
    } finally {
      rmSync(cwdReceipt, { force: true });
    }

    await page.keyboard.type('seq 1 100');
    await page.keyboard.press('Enter');
    await draftTerminal
      .locator('[data-terminal-scrollback]:not([data-terminal-scrollback="0"])')
      .waitFor();
    await terminalInput.press('Shift+PageUp');
    const latestOutput = draftTerminal.getByRole('button', { name: 'Back to latest output' });
    await latestOutput.waitFor({ state: 'visible' });
    await latestOutput.click();
    await latestOutput.waitFor({ state: 'hidden' });
    await draftTerminal.locator('.xterm').hover();
    await page.mouse.wheel(0, -120);
    await latestOutput.waitFor({ state: 'visible' });
    await terminalInput.press('Shift+PageDown');
    await latestOutput.waitFor({ state: 'hidden' });

    const editedInTerminal = path.join(project, '.agi-fullscreen-editor-check');
    try {
      await terminalInput.focus();
      await page.keyboard.type('/usr/bin/vi -u NONE -i NONE -n .agi-fullscreen-editor-check');
      await page.keyboard.press('Enter');
      const alternate = draftTerminal.locator('[data-terminal-buffer="alternate"]');
      await alternate.waitFor({ state: 'visible' });
      await page.keyboard.type('iInteractive fixture');
      await page.keyboard.press('Escape');
      await page.keyboard.type(':wq');
      await page.keyboard.press('Enter');
      await alternate.waitFor({ state: 'hidden' });
      assert.equal(readFileSync(editedInTerminal, 'utf8').trim(), 'Interactive fixture');
    } finally {
      rmSync(editedInTerminal, { force: true });
    }
  }
  assert.equal(modelCalls(), 0);
  await draftTerminal.getByRole('button', { name: 'Close the terminal panel' }).click();
  await draftTerminal.waitFor({ state: 'hidden' });
  await draftTerminal.waitFor({ state: 'attached' });
  if (!commandMode) {
    await draftSidePanel.click();
    await draftToolLauncher.getByRole('button', { name: 'Terminal', exact: true }).click();
    await draftTerminal.getByRole('button', { name: 'Close project', exact: true }).click();
    const closeShell = page.getByRole('alertdialog', { name: 'Close this terminal?' });
    await closeShell.getByRole('button', { name: 'Stop and close' }).click();
    await draftTerminal.waitFor({ state: 'hidden' });
  }
  assert.equal(await firstTask.inputValue(), CODE_UI_TASK);
  await start.and(composeField.locator('button:enabled')).waitFor({ state: 'visible' });
  await composerArea.screenshot({
    path: path.join(reportDir, 'code-composer-draft.png'),
    animations: 'disabled',
  });
  assert.equal(modelCalls(), 0);
  await page.getByRole('button', { name: 'Add to this session' }).click();
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Add images' }).click(),
  ]);
  await picker.setFiles({ name: CODE_UI_IMAGE_NAME, mimeType: 'image/png', buffer: CODE_UI_IMAGE });
  const pickedPreview = page.getByRole('img', { name: CODE_UI_IMAGE_NAME });
  await pickedPreview.waitFor({ state: 'visible' });
  await pickedPreview.evaluate((image) => image.decode());
  await page.getByRole('button', { name: `Remove ${CODE_UI_IMAGE_NAME}` }).click();
  await pickedPreview.waitFor({ state: 'hidden' });
  await dropFixtureImage(page, firstTask);
  assert.equal(await firstTask.inputValue(), CODE_UI_TASK);
  assert.equal(modelCalls(), 0);
  await start.click();
  try {
    await page.getByText(CODE_UI_REPLY, { exact: true }).waitFor({ timeout: 15_000 });
  } catch (error) {
    const notices = await page.getByRole('alert').allTextContents();
    throw new Error(
      `The Code fixture did not show a reply after ${modelCalls()} model requests. ${notices.join(' ')}`,
      { cause: error },
    );
  }
  assert.equal(await page.getByText(CODE_UI_REPLY, { exact: true }).count(), 1);

  const composer = page.getByTestId('local-code-composer').getByRole('textbox');
  await verifyComposerFocus(page, composer);
  const draft = 'Keep this follow-up in the composer.';
  await composer.fill(draft);
  const preview = await dropFixtureImage(page, composer);
  assert.equal(await composer.inputValue(), draft);
  assert.equal(modelCalls(), 1);
  await page.screenshot({
    path: path.join(reportDir, 'code-ui-attachment.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Remove reference.png' }).click();
  await preview.waitFor({ state: 'hidden' });
  await openSessions.click();
  await drawer.waitFor();
  const derivedTitle = /^Explain how to run the tests/;
  await drawer.getByRole('button', { name: derivedTitle }).waitFor();
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  assert.equal(await composer.inputValue(), draft);
  assert.equal(
    await openSessions.evaluate((button) => button === button.ownerDocument.activeElement),
    true,
  );
  await page.getByRole('heading', { name: derivedTitle }).waitFor();

  await page.setViewportSize({ width: 1200, height: 760 });
  await page.getByRole('button', { name: 'Collapse the session list' }).click();
  const expandSessions = page.getByRole('button', { name: 'Expand the session list' });
  await expandSessions.waitFor({ state: 'visible' });
  assert.equal(
    await expandSessions.evaluate((button) => button.ownerDocument.activeElement === button),
    true,
  );
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const globalSearch = page.getByRole('dialog', { name: 'Search', exact: true });
  await globalSearch.getByRole('textbox', { name: 'Search your workspace' }).waitFor();
  await globalSearch.getByRole('button', { name: 'Code', exact: true }).click();
  assert.equal(
    await globalSearch
      .getByRole('button', { name: 'Code', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  const scheduledSearch = globalSearch.getByRole('button', { name: 'Scheduled', exact: true });
  await scheduledSearch.click();
  assert.equal(await scheduledSearch.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  await globalSearch.waitFor({ state: 'hidden' });
  await expandSessions.click();
  assert.equal(await composer.inputValue(), draft);
  assert.equal(await page.getByTestId('local-queued-message').count(), 0);
  assert.equal(modelCalls(), 1);
  await page.screenshot({ path: path.join(reportDir, 'code-ui-live.png'), animations: 'disabled' });

  const editedFile = path.join(project, CODE_UI_EDIT_FILE);
  await composer.fill(CODE_UI_EDIT_TASK);
  await page
    .getByTestId('local-code-composer')
    .getByRole('button', { name: 'Send', exact: true })
    .click();

  const approval = page.getByTestId('local-approval');
  await approval.waitFor({ timeout: 15_000 });
  const queueShortcut = page.getByText(/^Press .+Enter to queue this follow-up\.$/);
  await queueShortcut.waitFor({ state: 'visible' });
  assert.equal(
    await composer.getAttribute('aria-describedby'),
    await queueShortcut.getAttribute('id'),
  );
  assert.ok((await approval.innerText()).includes(CODE_UI_EDIT_FILE));
  assert.equal(readFileSync(editedFile, 'utf8'), `${CODE_UI_ORIGINAL}\n`);
  await approval.getByRole('button', { name: 'Allow once', exact: true }).click();
  await page.getByText(CODE_UI_EDIT_REPLY, { exact: true }).waitFor({ timeout: 15_000 });
  await queueShortcut.waitFor({ state: 'hidden' });

  assert.equal(readFileSync(editedFile, 'utf8'), `${CODE_UI_EDITED}\n`);
  const transcriptChanges = page.getByTestId('local-turn-changes');
  await transcriptChanges
    .getByRole('button', { name: `Edited ${CODE_UI_EDIT_FILE}`, exact: true })
    .waitFor();
  await transcriptChanges.getByText(`+${CODE_UI_EDITED}`, { exact: true }).waitFor();
  assert.ok(!(await transcriptChanges.innerText()).includes(project));
  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  const changes = page.getByRole('complementary', { name: 'Changes', exact: true });
  const repositoryPath = path.posix.join(path.relative(repository, project), CODE_UI_EDIT_FILE);
  const changedFile = changes.getByRole('button', {
    name: `Modified ${repositoryPath}`,
    exact: true,
  });
  const filter = changes.getByRole('searchbox', { name: 'Filter changed files' });
  await changes.getByText(/^Compared with HEAD [0-9a-f]{7}$/).waitFor();
  await filter.fill('file-that-does-not-exist');
  await changes.getByText('No changed files match this filter.').waitFor();
  assert.equal(await changedFile.count(), 0);
  await filter.fill('readme');
  await changedFile.waitFor();
  assert.equal(
    await changedFile.evaluate(
      (button) =>
        button.ownerDocument.getElementById(button.getAttribute('aria-describedby'))?.textContent,
    ),
    '1 added, 1 removed',
  );
  await changedFile.click();
  await changes.getByText(`-${CODE_UI_ORIGINAL}`, { exact: true }).waitFor();
  await changes.getByText(`+${CODE_UI_EDITED}`, { exact: true }).waitFor();
  assert.equal(modelCalls(), 4);
  await page.screenshot({
    path: path.join(reportDir, 'code-ui-changes.png'),
    animations: 'disabled',
  });

  const discard = changes.getByRole('button', {
    name: `Discard the changes to ${repositoryPath}`,
  });
  const confirmation = page.getByRole('alertdialog', { name: 'Discard these changes?' });
  await discard.click();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await confirmation.waitFor({ state: 'hidden' });
  assert.equal(readFileSync(editedFile, 'utf8'), `${CODE_UI_EDITED}\n`);

  await discard.click();
  assert.ok((await confirmation.innerText()).includes(CODE_UI_EDIT_FILE));
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await changes.getByText('No changes to show', { exact: true }).waitFor();
  assert.equal(readFileSync(editedFile, 'utf8'), `${CODE_UI_ORIGINAL}\n`);
  assert.equal(modelCalls(), 4);

  const nested = repository !== project;
  if (nested) {
    assert.ok(!(await changes.innerText()).includes(SIBLING_FILE));
    assert.equal(readFileSync(path.join(repository, SIBLING_FILE), 'utf8'), SIBLING_EDIT);
    const registryPath = path.join(cliHome, 'projects.json');
    const persisted = existsSync(registryPath)
      ? JSON.parse(readFileSync(registryPath, 'utf8'))
      : {};
    assert.equal(Object.hasOwn(persisted, repository), false);
  }

  return {
    firstReplyCount: 1,
    firstTaskModelCalls: 1,
    pointerAndKeyboardComposerFocusVerified: true,
    microphoneAndDraftSendVisibilityVerified: true,
    accountFooterAndSidebarOptionsVerified: true,
    sideToolsAvailableBeforeFirstTask: true,
    terminalAvailableBeforeFirstTask: true,
    interactiveWorkspaceTerminalVerified: !commandMode,
    workspaceTerminalScrollbackAndEditorVerified: !commandMode,
    folderChosenFromHome: true,
    commandAccessRequestedFromComposer: true,
    firstTaskImagePickerPreviewed: true,
    firstTaskImageDelivered: true,
    totalModelCalls: modelCalls(),
    sessionTitleSynced: true,
    drawerFocusRestored: true,
    preservedDraft: true,
    droppedImagePreviewedWithoutSending: true,
    followUpShortcutVisibleDuringTurn: true,
    fileUnchangedBeforeApproval: true,
    approvedEditShownInChanges: true,
    changesFilterAndCountsVerified: true,
    cancelledDiscardPreservedEdit: true,
    confirmedDiscardRestoredFile: true,
    ...(nested ? { approvedSubfolderOnly: true, parentTrustPersisted: false } : {}),
  };
}
