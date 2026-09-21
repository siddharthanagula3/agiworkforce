import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APP_MENU_PATH,
  HOST_CONTRACT_PATH,
  REPO_ROOT,
  RENDERER_HANDLERS_PATH,
  RENDERER_REGISTRY_PATH,
  SHORTCUT_SCREEN_PATH,
  VSCODE_MANIFEST_PATH,
  WEB_REGISTRY_PATH,
  WEB_SHARED_SHORTCUT_PATH,
  checkShortcutRegistry,
  normalizeAccelerator,
  readHostMenuShortcuts,
  readRendererShortcuts,
} from './check-shortcut-registry.mjs';

const roots = [];

function fixture(edits = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-shortcut-registry-'));
  roots.push(root);
  for (const relative of [
    HOST_CONTRACT_PATH,
    APP_MENU_PATH,
    RENDERER_REGISTRY_PATH,
    RENDERER_HANDLERS_PATH,
    SHORTCUT_SCREEN_PATH,
    VSCODE_MANIFEST_PATH,
    WEB_REGISTRY_PATH,
    WEB_SHARED_SHORTCUT_PATH,
  ]) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    const original = readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    writeFileSync(destination, edits[relative] ? edits[relative](original) : original);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the tree as it stands has one registry per scope', () => {
  assert.deepEqual(checkShortcutRegistry(REPO_ROOT), []);
});

test('it reads the registries rather than a list of its own', () => {
  const menu = readHostMenuShortcuts(
    readFileSync(path.join(REPO_ROOT, HOST_CONTRACT_PATH), 'utf8'),
  );
  assert.ok(menu.length >= 5, 'the host menu contract should carry several shortcuts');
  const renderer = readRendererShortcuts(
    readFileSync(path.join(REPO_ROOT, RENDERER_REGISTRY_PATH), 'utf8'),
  );
  assert.ok(renderer.length >= 8, 'the renderer registry should carry several shortcuts');
  assert.equal(normalizeAccelerator('Shift+CommandOrControl+K'), 'commandorcontrol+k+shift');
});

test('a second claim on one chord in the app menu fails', () => {
  const root = fixture({
    [HOST_CONTRACT_PATH]: (source) =>
      source.replace(
        "{ id: 'host-settings', description: 'Settings', accelerator: 'CommandOrControl+,' },",
        "{ id: 'host-settings', description: 'Settings', accelerator: 'CommandOrControl+N' },",
      ),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /both claim CommandOrControl\+N/.test(entry)),
    failures.join('\n'),
  );
});

test('a menu chord bound to one platform only fails', () => {
  const root = fixture({
    [HOST_CONTRACT_PATH]: (source) =>
      source.replace("accelerator: 'CommandOrControl+[' }", "accelerator: 'Command+[' }"),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /instead of CommandOrControl/.test(entry)),
    failures.join('\n'),
  );
});

test('a declared menu shortcut no item binds fails', () => {
  const root = fixture({
    [APP_MENU_PATH]: (source) =>
      source.replace("accelerator: hostAccelerator('host-forward'),", ''),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /host-forward is declared but no menu item binds it/.test(entry)),
    failures.join('\n'),
  );
});

test('a menu item bound to a shortcut the contract does not declare fails', () => {
  const root = fixture({
    [APP_MENU_PATH]: (source) =>
      source.replace("hostAccelerator('host-back')", "hostAccelerator('host-rewind')"),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /host-rewind, which the contract does not declare/.test(entry)),
    failures.join('\n'),
  );
});

test('two renderer shortcuts on one chord fail', () => {
  const root = fixture({
    [RENDERER_REGISTRY_PATH]: (source) =>
      source.replace("    id: 'search',\n    key: 'k',", "    id: 'search',\n    key: 'n',"),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /search and new-chat both claim/.test(entry)),
    failures.join('\n'),
  );
});

test('a renderer chord on ctrl alone, which macOS has no variant of, fails', () => {
  const root = fixture({
    [RENDERER_REGISTRY_PATH]: (source) =>
      source.replace(
        "    id: 'minimize',\n    key: 'm',\n    modifiers: { meta: true },",
        "    id: 'minimize',\n    key: 'm',\n    modifiers: { ctrl: true },",
      ),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /minimize is bound on ctrl alone/.test(entry)),
    failures.join('\n'),
  );
});

test('an action with no handler fails', () => {
  const root = fixture({
    [RENDERER_HANDLERS_PATH]: (source) => source.replace(/'window\.minimize':/, "'window.shrink':"),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /window\.minimize has no handler/.test(entry)),
    failures.join('\n'),
  );
  assert.ok(
    failures.some((entry) => /handles window\.shrink, which is not declared/.test(entry)),
    failures.join('\n'),
  );
});

test('an action no chord reaches fails', () => {
  const root = fixture({
    [RENDERER_REGISTRY_PATH]: (source) =>
      source.replace("  | 'window.minimize';", "  | 'window.minimize'\n  | 'window.zoom';"),
    [RENDERER_HANDLERS_PATH]: (source) =>
      source.replace("'chat.new': () => {", "'window.zoom': () => {},\n      'chat.new': () => {"),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /window\.zoom is an action no shortcut reaches/.test(entry)),
    failures.join('\n'),
  );
});

test('a shortcut screen that stops deriving its list from the registry fails', () => {
  const root = fixture({
    [SHORTCUT_SCREEN_PATH]: (source) => source.replaceAll('DEFAULT_SHORTCUTS', 'HAND_WRITTEN_LIST'),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /does not derive its list from the registry/.test(entry)),
    failures.join('\n'),
  );
});

test('a VS Code chord bound to a command nothing contributes fails', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      manifest.contributes.keybindings[0].command = 'agi-workforce.notAThing';
      return JSON.stringify(manifest, null, 2);
    },
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) =>
      /notAThing is bound to a chord but is not a contributed command/.test(entry),
    ),
    failures.join('\n'),
  );
});

test('a VS Code chord with no macOS variant fails', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      delete manifest.contributes.keybindings[0].mac;
      return JSON.stringify(manifest, null, 2);
    },
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /binds ctrl with no macOS variant/.test(entry)),
    failures.join('\n'),
  );
});

test('a VS Code chord with no Windows or Linux variant fails', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      delete manifest.contributes.keybindings[0].key;
      return JSON.stringify(manifest, null, 2);
    },
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /binds macOS with no Windows or Linux variant/.test(entry)),
    failures.join('\n'),
  );
});

test('two VS Code commands on one chord under the same condition fail', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      const [first] = manifest.contributes.keybindings;
      manifest.contributes.keybindings.push({ ...first, command: 'agi-workforce.explain' });
      return JSON.stringify(manifest, null, 2);
    },
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /both claim .* under the same condition/.test(entry)),
    failures.join('\n'),
  );
});

test('two VS Code commands on one chord under different conditions are not a conflict', () => {
  const failures = checkShortcutRegistry(REPO_ROOT);
  assert.deepEqual(
    failures.filter((entry) => /acceptCurrentDiff/.test(entry)),
    [],
  );
});

test('a web chord the browser keeps for itself fails', () => {
  const root = fixture({
    [WEB_REGISTRY_PATH]: (source) =>
      source.replace(
        "    key: 'B',\n    ctrl: true,\n    meta: true,\n    id: 'toggle-sidebar',",
        "    key: 'T',\n    ctrl: true,\n    meta: true,\n    id: 'toggle-sidebar',",
      ),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /which the browser keeps for itself/.test(entry)),
    failures.join('\n'),
  );
});

test('a web chord VoiceOver claims fails', () => {
  const root = fixture({
    [WEB_REGISTRY_PATH]: (source) =>
      source.replace(
        "    key: 'B',\n    ctrl: true,\n    meta: true,\n    id: 'toggle-sidebar',",
        "    key: 'B',\n    ctrl: true,\n    alt: true,\n    id: 'toggle-sidebar',",
      ),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /which VoiceOver claims/.test(entry)),
    failures.join('\n'),
  );
});

test('a web shortcut with no modifier and no context rule fails', () => {
  const root = fixture({
    [WEB_REGISTRY_PATH]: (source) => source.replace("doc.key === 'Escape'", "doc.key === 'Enter'"),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /no context rule that keeps it out of a field/.test(entry)),
    failures.join('\n'),
  );
});

test('a documented web shortcut nothing handles fails', () => {
  const root = fixture({
    [WEB_REGISTRY_PATH]: (source) =>
      source.replace("'toggle-sidebar': onToggleSidebar,", "'collapse-sidebar': onToggleSidebar,"),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) =>
      /toggle-sidebar is documented as a shortcut but nothing handles it/.test(entry),
    ),
    failures.join('\n'),
  );
});

test('a web shortcut whose shared chord has gone fails rather than passing unchecked', () => {
  const root = fixture({
    [WEB_SHARED_SHORTCUT_PATH]: (source) =>
      source.replace('export const OPEN_SEARCH_SHORTCUT = {', 'const RETIRED_SHORTCUT = {'),
  });
  const failures = checkShortcutRegistry(root);
  assert.ok(
    failures.some((entry) => /spreads OPEN_SEARCH_SHORTCUT/.test(entry)),
    failures.join('\n'),
  );
});
