import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SHELL_DIR,
  browserWindowConstructions,
  checkDesktopWindowSession,
  checkWindowConstruction,
} from './check-desktop-window-session.mjs';

const roots = [];

const HARDENED = `
const win = new BrowserWindow({
  width: 1280,
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    partition: REMOTE_SESSION_PARTITION,
  },
});
`;

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-window-session-'));
  roots.push(root);
  for (const [name, source] of Object.entries(files)) {
    const destination = path.join(root, SHELL_DIR, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, source, 'utf8');
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the repository as it stands passes', () => {
  assert.deepEqual(checkDesktopWindowSession(), []);
});

test('a hardened window on the shared partition passes', () => {
  assert.deepEqual(checkDesktopWindowSession(fixture({ 'main.ts': HARDENED })), []);
});

test('a window with a session of its own fails', () => {
  const failures = checkDesktopWindowSession(
    fixture({ 'main.ts': HARDENED.replace('REMOTE_SESSION_PARTITION', "'persist:second-window'") }),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /session of its own/);
});

test('a window that turns off context isolation fails', () => {
  const failures = checkDesktopWindowSession(
    fixture({ 'main.ts': HARDENED.replace('contextIsolation: true', 'contextIsolation: false') }),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /contextIsolation: true/);
});

test('a window that leaves the sandbox or turns on node integration fails', () => {
  for (const [from, to] of [
    ['sandbox: true', 'sandbox: false'],
    ['nodeIntegration: false', 'nodeIntegration: true'],
  ]) {
    const failures = checkDesktopWindowSession(fixture({ 'main.ts': HARDENED.replace(from, to) }));
    assert.equal(failures.length, 1, `${from} -> ${to}`);
  }
});

test('a window with no webPreferences at all fails', () => {
  const failures = checkDesktopWindowSession(
    fixture({ 'main.ts': 'const win = new BrowserWindow({ width: 900 });\n' }),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no webPreferences/);
});

test('a second window added in another file is checked too', () => {
  const failures = checkDesktopWindowSession(
    fixture({
      'main.ts': HARDENED,
      'panels/sidePanel.ts': 'const panel = new BrowserWindow({ webPreferences: {} });\n',
    }),
  );
  assert.equal(failures.length, 3);
  for (const failure of failures) assert.match(failure, /panels\/sidePanel\.ts/);
});

test('a shell with no window at all fails', () => {
  const failures = checkDesktopWindowSession(fixture({ 'main.ts': 'export const nothing = 1;\n' }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no window is opened/);
});

test('the argument object is read by balancing braces, not by the first close', () => {
  const [construction] = browserWindowConstructions(HARDENED);
  assert.match(construction.body, /partition: REMOTE_SESSION_PARTITION/);
  assert.equal(construction.body.trim().endsWith('}'), true);
  assert.deepEqual(checkWindowConstruction('main.ts', construction), []);
});

test('two windows in one file are both read', () => {
  assert.equal(browserWindowConstructions(`${HARDENED}${HARDENED}`).length, 2);
});
