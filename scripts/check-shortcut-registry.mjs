#!/usr/bin/env node

// A chord a surface claims twice fires twice, and one no handler answers is a
// menu entry that does nothing. Every scope is enumerated from its own registry.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const HOST_CONTRACT_PATH = 'packages/contracts/local-runtime/src/host-bridge.ts';
export const APP_MENU_PATH = 'apps/desktop/electron/appMenu.ts';
export const RENDERER_REGISTRY_PATH = 'apps/desktop/src/constants/shortcuts.ts';
export const RENDERER_HANDLERS_PATH = 'apps/desktop/src/App.tsx';
export const SHORTCUT_SCREEN_PATH = 'apps/desktop/src/features/settings/KeybindingsSettings.tsx';
export const VSCODE_MANIFEST_PATH = 'apps/extension-vscode/package.json';
export const WEB_REGISTRY_PATH = 'apps/web/features/chat/hooks/use-keyboard-shortcuts.ts';
export const WEB_SHARED_SHORTCUT_PATH = 'packages/ui/ui/src/sidebar/Sidebar.tsx';

/**
 * Chords a browser keeps for itself. A page that binds one is describing a key
 * the user's browser will never hand it.
 */
export const BROWSER_RESERVED_KEYS = new Set(['n', 't', 'w', 'q', 'l', 'p', 'd', 'j']);

function read(repoRoot, relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

/** `CommandOrControl` is the one spelling that gives both platforms a variant. */
export function crossPlatformAccelerator(accelerator) {
  return !/(^|\+)(Command|Cmd|Super|Meta|Control|Ctrl)(\+|$)/i.test(accelerator);
}

export function normalizeAccelerator(accelerator) {
  return accelerator
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
    .sort()
    .join('+');
}

export function readHostMenuShortcuts(source) {
  const block = /export const HOST_MENU_SHORTCUTS[^[]*\[([\s\S]*?)\n\];/.exec(source);
  if (block === null) return [];
  return [...block[1].matchAll(/\{\s*id:\s*'([^']+)'[^}]*accelerator:\s*'([^']+)'/g)].map(
    (entry) => ({ id: entry[1], accelerator: entry[2] }),
  );
}

export function readAppMenuHandlers(source) {
  return [...source.matchAll(/hostAccelerator\('([^']+)'\)/g)].map((entry) => entry[1]);
}

function modifiersOf(block) {
  const modifiers = /modifiers:\s*\{([^}]*)\}/.exec(block);
  if (modifiers === null) return [];
  return [...modifiers[1].matchAll(/(ctrl|alt|shift|meta)\s*:\s*true/g)].map((entry) => entry[1]);
}

/** A binding a helper computes per platform still has to name every chord it can return. */
function spreadBindings(source, helper) {
  const body = new RegExp(`function ${helper}\\(\\)[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (body === null) return [];
  return [...body[1].matchAll(/\{[^{}]*key:\s*'([^']+)'[^{}]*modifiers:\s*\{([^}]*)\}/g)].map(
    (entry) => ({
      key: entry[1],
      modifiers: [...entry[2].matchAll(/(ctrl|alt|shift|meta)\s*:\s*true/g)].map((m) => m[1]),
    }),
  );
}

export function readRendererShortcuts(source) {
  const entries = [];
  for (const name of ['RENDERER_SHORTCUTS', 'GLOBAL_SHORTCUTS']) {
    const block = new RegExp(`export const ${name}[^[]*\\[([\\s\\S]*?)\\n\\];`).exec(source);
    if (block === null) continue;
    for (const raw of block[1].split(/\n  \},?\n/)) {
      const id = /id:\s*'([^']+)'/.exec(raw);
      if (id === null) continue;
      const action = /action:\s*'([^']+)'/.exec(raw);
      const backendId = /backendId:\s*'([^']+)'/.exec(raw);
      const spread = /\.\.\.(\w+)\(\)/.exec(raw);
      const key = /(?:^|\s)key:\s*'([^']+)'/.exec(raw);
      const bindings =
        spread === null
          ? [{ key: key === null ? null : key[1], modifiers: modifiersOf(raw) }]
          : spreadBindings(source, spread[1]);
      for (const binding of bindings.length > 0 ? bindings : [{ key: null, modifiers: [] }]) {
        entries.push({
          registry: name,
          id: id[1],
          key: binding.key,
          modifiers: binding.modifiers,
          platformVariant: spread !== null,
          ...(action === null ? {} : { action: action[1] }),
          ...(backendId === null ? {} : { backendId: backendId[1] }),
        });
      }
    }
  }
  return entries;
}

export function readRendererActions(source) {
  const union = /export type RendererShortcutAction =([\s\S]*?);/.exec(source);
  if (union === null) return [];
  return [...union[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

export function readHandledActions(source) {
  const table = /Record<RendererShortcutAction, \(\) => void>>\(([\s\S]*?)\n  \);/.exec(source);
  if (table === null) return [];
  return [...table[1].matchAll(/'([a-z]+\.[A-Za-z]+)'\s*:/g)].map((entry) => entry[1]);
}

function sharedShortcutBlocks(source) {
  const blocks = new Map();
  for (const entry of source.matchAll(/export const (\w+_SHORTCUT) = \{([\s\S]*?)\n\}/g)) {
    blocks.set(entry[1], entry[2]);
  }
  return blocks;
}

function modifierNames(raw) {
  return ['ctrl', 'alt', 'shift', 'meta'].filter((name) =>
    new RegExp(`${name}:\\s*true`).test(raw),
  );
}

export function readWebShortcuts(source, sharedSource = '') {
  const block = /export const KEYBOARD_SHORTCUT_DOCS[^[]*\[([\s\S]*?)\n\];/.exec(source);
  if (block === null) return [];
  const shared = sharedShortcutBlocks(sharedSource);
  const entries = [];
  for (const raw of block[1].split(/\n  \},?\n/)) {
    const id = /id:\s*'([^']+)'/.exec(raw);
    if (id === null) continue;
    const spread = /\.\.\.([A-Z][A-Z_]+)/.exec(raw);
    const resolved = spread === null ? '' : (shared.get(spread[1]) ?? null);
    if (resolved === null) {
      entries.push({ id: id[1], key: null, unresolvedSpread: spread[1], modifiers: [] });
      continue;
    }
    const body = `${resolved}${raw}`;
    const key = /(?:^|\s)key:\s*'([^']+)'/.exec(body);
    entries.push({
      id: id[1],
      key: key === null ? null : key[1],
      unresolvedSpread: null,
      modifiers: modifierNames(body),
    });
  }
  return entries;
}

export function readWebHandledIds(source) {
  const table =
    /const handlerFor: Record<string, \(\(\) => void\) \| undefined> = \{([\s\S]*?)\n      \};/.exec(
      source,
    );
  if (table === null) return [];
  return [...table[1].matchAll(/'([^']+)'\s*:/g)].map((entry) => entry[1]);
}

/** VoiceOver owns Ctrl+Option, so a chord that is exactly that prefix is taken. */
function collidesWithScreenReader(modifiers) {
  return (
    modifiers.includes('ctrl') &&
    modifiers.includes('alt') &&
    !modifiers.includes('meta') &&
    !modifiers.includes('shift')
  );
}

function vscodeBindingKeys(binding) {
  return [
    ['key', binding.key],
    ['mac', binding.mac],
    ['win', binding.win],
    ['linux', binding.linux],
  ].filter(([, value]) => typeof value === 'string' && value.length > 0);
}

export function checkShortcutRegistry(repoRoot = REPO_ROOT) {
  const failures = [];
  const fail = (scope, message) => failures.push(`${scope}: ${message}`);

  const hostSource = read(repoRoot, HOST_CONTRACT_PATH);
  const menuShortcuts = readHostMenuShortcuts(hostSource);
  if (menuShortcuts.length === 0) fail('app-menu', `${HOST_CONTRACT_PATH} declares no shortcuts`);

  const seen = new Map();
  for (const shortcut of menuShortcuts) {
    const chord = normalizeAccelerator(shortcut.accelerator);
    const owner = seen.get(chord);
    if (owner) fail('app-menu', `${shortcut.id} and ${owner} both claim ${shortcut.accelerator}`);
    seen.set(chord, shortcut.id);
    if (!crossPlatformAccelerator(shortcut.accelerator)) {
      fail(
        'app-menu',
        `${shortcut.id} claims ${shortcut.accelerator}, which names one platform's modifier instead of CommandOrControl`,
      );
    }
  }

  const handled = readAppMenuHandlers(read(repoRoot, APP_MENU_PATH));
  const declared = new Set(menuShortcuts.map((shortcut) => shortcut.id));
  for (const id of handled) {
    if (!declared.has(id))
      fail('app-menu', `${APP_MENU_PATH} binds ${id}, which the contract does not declare`);
  }
  for (const shortcut of menuShortcuts) {
    if (!handled.includes(shortcut.id)) {
      fail('app-menu', `${shortcut.id} is declared but no menu item binds it`);
    }
  }

  const registrySource = read(repoRoot, RENDERER_REGISTRY_PATH);
  const rendererShortcuts = readRendererShortcuts(registrySource);
  if (rendererShortcuts.length === 0) {
    fail('desktop-renderer', `${RENDERER_REGISTRY_PATH} declares no shortcuts`);
  }

  const chords = new Map();
  for (const shortcut of rendererShortcuts) {
    if (shortcut.key === null) {
      fail('desktop-renderer', `${shortcut.id} declares no key`);
      continue;
    }
    const chord = normalizeAccelerator([...shortcut.modifiers, shortcut.key].join('+'));
    const owner = chords.get(chord);
    if (owner && owner !== shortcut.id) {
      fail('desktop-renderer', `${shortcut.id} and ${owner} both claim ${chord}`);
    }
    chords.set(chord, shortcut.id);
    const macSafe =
      shortcut.platformVariant ||
      shortcut.modifiers.includes('meta') ||
      !shortcut.modifiers.includes('ctrl');
    if (!macSafe) {
      fail(
        'desktop-renderer',
        `${shortcut.id} is bound on ctrl alone, so macOS has no variant of it`,
      );
    }
  }

  const actions = readRendererActions(registrySource);
  const bound = new Set(
    rendererShortcuts.filter((shortcut) => shortcut.action).map((shortcut) => shortcut.action),
  );
  for (const action of actions) {
    if (!bound.has(action)) fail('desktop-renderer', `${action} is an action no shortcut reaches`);
  }
  for (const action of bound) {
    if (!actions.includes(action)) {
      fail('desktop-renderer', `${action} is bound to a chord but is not a declared action`);
    }
  }

  const handledActions = readHandledActions(read(repoRoot, RENDERER_HANDLERS_PATH));
  if (handledActions.length === 0) {
    fail('desktop-renderer', `${RENDERER_HANDLERS_PATH} has no handler table`);
  }
  for (const action of actions) {
    if (!handledActions.includes(action)) {
      fail('desktop-renderer', `${action} has no handler in ${RENDERER_HANDLERS_PATH}`);
    }
  }
  for (const action of handledActions) {
    if (!actions.includes(action)) {
      fail(
        'desktop-renderer',
        `${RENDERER_HANDLERS_PATH} handles ${action}, which is not declared`,
      );
    }
  }

  const screen = read(repoRoot, SHORTCUT_SCREEN_PATH);
  if (!/DEFAULT_SHORTCUTS/.test(screen)) {
    fail('desktop-renderer', `${SHORTCUT_SCREEN_PATH} does not derive its list from the registry`);
  }

  const webSource = read(repoRoot, WEB_REGISTRY_PATH);
  const webShortcuts = readWebShortcuts(webSource, read(repoRoot, WEB_SHARED_SHORTCUT_PATH));
  if (webShortcuts.length === 0) fail('web', `${WEB_REGISTRY_PATH} declares no shortcuts`);
  const webHandled = readWebHandledIds(webSource);
  const webChords = new Map();
  for (const shortcut of webShortcuts) {
    if (!webHandled.includes(shortcut.id)) {
      fail('web', `${shortcut.id} is documented as a shortcut but nothing handles it`);
    }
    if (shortcut.unresolvedSpread !== null) {
      fail(
        'web',
        `${shortcut.id} spreads ${shortcut.unresolvedSpread}, which ${WEB_SHARED_SHORTCUT_PATH} does not declare`,
      );
      continue;
    }
    if (shortcut.key === null) {
      fail('web', `${shortcut.id} declares no key`);
      continue;
    }
    const chord = normalizeAccelerator([...shortcut.modifiers, shortcut.key].join('+'));
    const owner = webChords.get(chord);
    if (owner) fail('web', `${shortcut.id} and ${owner} both claim ${chord}`);
    webChords.set(chord, shortcut.id);
    if (
      (shortcut.modifiers.includes('ctrl') || shortcut.modifiers.includes('meta')) &&
      !shortcut.modifiers.includes('shift') &&
      !shortcut.modifiers.includes('alt') &&
      BROWSER_RESERVED_KEYS.has(shortcut.key.toLowerCase())
    ) {
      fail('web', `${shortcut.id} binds ${chord}, which the browser keeps for itself`);
    }
    if (collidesWithScreenReader(shortcut.modifiers)) {
      fail('web', `${shortcut.id} binds ${chord}, which VoiceOver claims`);
    }
    if (
      shortcut.modifiers.length === 0 &&
      !new RegExp(`doc\\.key === '${shortcut.key}'`).test(webSource)
    ) {
      fail(
        'web',
        `${shortcut.id} has no modifier and no context rule that keeps it out of a field`,
      );
    }
  }
  for (const id of webHandled) {
    if (!webShortcuts.some((shortcut) => shortcut.id === id)) {
      fail('web', `${WEB_REGISTRY_PATH} handles ${id}, which is not a documented shortcut`);
    }
  }

  for (const shortcut of rendererShortcuts) {
    if (collidesWithScreenReader(shortcut.modifiers) && !shortcut.platformVariant) {
      fail('desktop-renderer', `${shortcut.id} binds Ctrl+Option, which VoiceOver claims`);
    }
  }

  const manifest = JSON.parse(read(repoRoot, VSCODE_MANIFEST_PATH));
  const keybindings = manifest.contributes?.keybindings ?? [];
  if (keybindings.length === 0)
    fail('vscode', `${VSCODE_MANIFEST_PATH} contributes no keybindings`);
  const commands = new Set((manifest.contributes?.commands ?? []).map((entry) => entry.command));
  const claimed = new Map();
  for (const binding of keybindings) {
    if (!commands.has(binding.command)) {
      fail('vscode', `${binding.command} is bound to a chord but is not a contributed command`);
    }
    const variants = vscodeBindingKeys(binding);
    if (variants.length === 0) {
      fail('vscode', `${binding.command} declares no chord`);
      continue;
    }
    const usesControl = variants.some(
      ([platform, value]) => platform !== 'mac' && /(^|\+)ctrl(\+|$)/i.test(value),
    );
    if (usesControl && !variants.some(([platform]) => platform === 'mac')) {
      fail('vscode', `${binding.command} binds ctrl with no macOS variant`);
    }
    if (variants.some(([platform]) => platform === 'mac') && !binding.key) {
      fail('vscode', `${binding.command} binds macOS with no Windows or Linux variant`);
    }
    for (const [platform, value] of variants) {
      const chord = `${platform}:${normalizeAccelerator(value)}:${binding.when ?? ''}`;
      const owner = claimed.get(chord);
      if (owner) {
        fail(
          'vscode',
          `${binding.command} and ${owner} both claim ${value} on ${platform} under the same condition`,
        );
      }
      claimed.set(chord, binding.command);
    }
  }

  return failures;
}

function main() {
  const failures = checkShortcutRegistry();
  if (failures.length > 0) {
    console.error('Keyboard shortcut registry check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    'check-shortcut-registry: every scope has one registry, one handler and both platforms.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
