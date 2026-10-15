import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import { createResolver } from '../../../scripts/lib/module-graph.mjs';

import {
  analyzeCommandCallers,
  analyzeHitlRequirements,
  analyzeWiring,
  collectReachableRendererFiles,
  extractHitlRequirements,
  extractRegisteredCommands,
  INVOKE_CALL_PATTERN,
  isCommandCallee,
  isInvokeCallee,
  reportFailures,
  walkModuleGraph,
} from './check-wiring.mjs';

function analyzeClientFixture(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'check-wiring-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [relativePath, source] of Object.entries(files)) {
    const target = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  const clientRoot = path.join(directory, 'client/src');
  const resolve = createResolver({ '@fixture/client': clientRoot });
  const graph = walkModuleGraph(path.join(directory, 'app/main.tsx'), resolve);
  const callerFiles = new Map(
    fs
      .readdirSync(clientRoot)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => [path.join(clientRoot, name), isCommandCallee]),
  );
  for (const file of graph.reachable) {
    if (!callerFiles.has(file) && /\binvoke\b/.test(fs.readFileSync(file, 'utf8'))) {
      callerFiles.set(file, isInvokeCallee);
    }
  }
  const usage = analyzeCommandCallers({ callerFiles, ...graph, resolve });
  return {
    unreferenced: usage.unreferencedCallers,
    live: [...usage.liveCommands].sort(),
    unused: Object.fromEntries(
      [...usage.unusedWrappers].map(([command, sites]) => [
        command,
        sites.map((site) => site.split('/').at(-1)),
      ]),
    ),
  };
}

test('a reachable module executes eager command initializers without an importer reading their bindings', (t) => {
  const source = `
    const initialized = command('startup_initialize');
    const holder = { value: command('startup_read'), dormant: () => command('dormant_method') };
    const dormant = () => command('dormant_callback');
    function unusedFactory() { return command('unused_factory'); }
  `;
  const observed = [];
  runInNewContext(source, { command: (name) => observed.push(name) });
  assert.deepEqual(observed, ['startup_initialize', 'startup_read']);
  const usage = analyzeClientFixture(t, {
    'app/main.tsx': `import '../client/src/startup';`,
    'client/src/startup.ts': source,
  });
  assert.deepEqual(usage.live, [...observed].sort());
  assert.ok(usage.unused.dormant_callback);
  assert.ok(usage.unused.dormant_method);
  assert.ok(usage.unused.unused_factory);
});

test('an eager initializer calling a local factory reaches its command owner', (t) => {
  const source = `
    function initialize() { return command('factory_initialize'); }
    const ready = initialize();
    function unused() { return command('unused_factory'); }
  `;
  const observed = [];
  runInNewContext(source, { command: (name) => observed.push(name) });
  assert.deepEqual(observed, ['factory_initialize']);
  const usage = analyzeClientFixture(t, {
    'app/main.tsx': `import '../client/src/startup';`,
    'client/src/startup.ts': source,
  });
  assert.deepEqual(usage.live, observed);
  assert.ok(usage.unused.unused_factory);
});

test('a called factory and its called returned function preserve the command path', (t) => {
  const source = `
    function makeReader() { return () => command('factory_read'); }
    const read = makeReader();
    read();
  `;
  const observed = [];
  runInNewContext(source, { command: (name) => observed.push(name) });
  assert.deepEqual(observed, ['factory_read']);
  const usage = analyzeClientFixture(t, {
    'app/main.tsx': `import '../client/src/startup';`,
    'client/src/startup.ts': source,
  });
  assert.deepEqual(usage.live, observed);
});

test('creating an unread callback does not credit its deferred command as an eager factory effect', (t) => {
  const source = `
    function makeReader() { return () => command('deferred_read'); }
    const unusedReader = makeReader();
  `;
  const observed = [];
  runInNewContext(source, { command: (name) => observed.push(name) });
  assert.deepEqual(observed, []);
  const usage = analyzeClientFixture(t, {
    'app/main.tsx': `import '../client/src/startup';`,
    'client/src/startup.ts': source,
  });
  assert.deepEqual(usage.live, []);
  assert.ok(usage.unused.deferred_read);
});

test('initializing an unread store does not hide its unused command method behind a live duplicate', (t) => {
  const source = `
    function create(factory) { return factory(); }
    const dormantStore = create(() => ({ run: () => command('shared_command') }));
    command('shared_command');
  `;
  const observed = [];
  runInNewContext(source, { command: (name) => observed.push(name) });
  assert.deepEqual(observed, ['shared_command']);
  const usage = analyzeClientFixture(t, {
    'app/main.tsx': `import '../client/src/startup';`,
    'client/src/startup.ts': source,
  });
  assert.deepEqual(usage.live, observed);
  assert.ok(usage.unreferenced.some(({ site }) => site.endsWith('#dormantStore')));
});

const CLIENT_INDEX = `
  export * as auth from './auth';
  export * as window from './window';
  export type { Session } from './auth';
`;
const CLIENT_AUTH = `
  import { command } from '@fixture/runtime';
  export interface Session { id: string }
  export async function storeSession(session: string): Promise<void> {
    return command<void>('auth_store_session', { session });
  }
  export async function removeSession(): Promise<void> {
    return command<void>('auth_remove_session');
  }
`;
const CLIENT_WINDOW = `
  import { command } from '@fixture/runtime';
  export const pin = (pinned: boolean) => command<void>('window_pin', { pinned });
  export const unpin = () => pin(false);
  function readGeometry() {
    return command<{ x: number }>('window_geometry');
  }
  export async function center() {
    const geometry = await readGeometry();
    return command<void>('window_center', { x: geometry.x });
  }
  export async function minimize() {
    return command<void>('window_minimize');
  }
`;

test('extracts only commands inside the real generate_handler block', () => {
  const source = `
    // .invoke_handler(tauri::generate_handler![crate::commands::comment_mask])
    fn mention_only() { crate::commands::outside_reference(); }
    builder
      .invoke_handler(tauri::generate_handler![
        crate::commands::registered_command,
        // crate::commands::commented_out,
        crate::commands::nested::second_command,
      ])
      .run();
    fn after() { crate::commands::outside_after(); }
  `;

  assert.deepEqual(extractRegisteredCommands(source), ['registered_command', 'second_command']);
});

test('recognizes multiline generic frontend calls and imported invoke aliases', () => {
  const source = `
    command<{
      available: boolean;
      reason?: string;
    }>('check_capability');

    docInvoke<{
      stdout: string;
      stderr: string;
    }>('execute_code');
  `;
  const commandPattern = /\bcommand(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
  assert.equal([...source.matchAll(commandPattern)][0][1], 'check_capability');
  assert.equal([...source.matchAll(INVOKE_CALL_PATTERN)][0][1], 'execute_code');
});

test('fails an unregistered frontend call and an unallowlisted orphan', () => {
  const result = analyzeWiring({
    registeredCommands: ['called_command', 'orphaned_command'],
    frontendCalls: new Set(['called_command', 'missing_command']),
    rustDefinitions: new Set(['called_command', 'orphaned_command']),
    allowlisted: new Set(),
  });

  assert.deepEqual(result.frontendWithoutRegistration, ['missing_command']);
  assert.deepEqual(result.registeredWithoutFrontend, ['orphaned_command']);
});

test('accepts a reviewed orphan allowlist entry and rejects it once stale', () => {
  const accepted = analyzeWiring({
    registeredCommands: ['native_only'],
    frontendCalls: new Set(),
    rustDefinitions: new Set(['native_only']),
    allowlisted: new Set(['native_only']),
  });
  assert.deepEqual(accepted.registeredWithoutFrontend, []);
  assert.deepEqual(accepted.staleAllowlist, []);

  const stale = analyzeWiring({
    registeredCommands: ['native_only'],
    frontendCalls: new Set(['native_only']),
    rustDefinitions: new Set(['native_only']),
    allowlisted: new Set(['native_only']),
  });
  assert.deepEqual(stale.staleAllowlist, ['native_only']);
});

test('preserves HITL handler enforcement and ignores commented-out approval calls', () => {
  const requirements = extractHitlRequirements(`
    required:
      - tool: file_write
        handler: handlers/file.rs
      - tool: terminal_exec
        handler: handlers/terminal.rs
      - tool: open_url
        handler: handlers/browser.rs
  `);
  const violations = analyzeHitlRequirements(
    requirements,
    new Map([
      ['handlers/file.rs', 'request_confirmation_simple().await;'],
      ['handlers/terminal.rs', '// request_confirmation_simple().await;'],
    ]),
  );

  assert.deepEqual(violations, [
    'terminal_exec -> handlers/terminal.rs has no request_confirmation_simple call',
    'open_url -> missing handler handlers/browser.rs',
  ]);
});

test('a command whose only caller is an unreachable module is reported, not counted as wired', () => {
  const lexical = new Set(['mounted_command', 'orphan_tree_command']);
  const reachable = new Set(['mounted_command']);

  const unguarded = analyzeWiring({
    registeredCommands: ['mounted_command', 'orphan_tree_command'],
    frontendCalls: lexical,
    rustDefinitions: new Set(['mounted_command', 'orphan_tree_command']),
    allowlisted: new Set(),
    reachableFrontendCalls: reachable,
    reachabilityAllowlisted: new Set(),
  });

  assert.deepEqual(unguarded.registeredWithoutFrontend, []);
  assert.deepEqual(unguarded.registeredWithoutReachableCaller, ['orphan_tree_command']);
});

test('a reviewed reachability allowlist entry passes until its caller becomes reachable', () => {
  const accepted = analyzeWiring({
    registeredCommands: ['orphan_tree_command'],
    frontendCalls: new Set(['orphan_tree_command']),
    rustDefinitions: new Set(['orphan_tree_command']),
    allowlisted: new Set(),
    reachableFrontendCalls: new Set(),
    reachabilityAllowlisted: new Set(['orphan_tree_command']),
  });
  assert.deepEqual(accepted.registeredWithoutReachableCaller, []);
  assert.deepEqual(accepted.staleReachabilityAllowlist, []);

  const wired = analyzeWiring({
    registeredCommands: ['orphan_tree_command'],
    frontendCalls: new Set(['orphan_tree_command']),
    rustDefinitions: new Set(['orphan_tree_command']),
    allowlisted: new Set(),
    reachableFrontendCalls: new Set(['orphan_tree_command']),
    reachabilityAllowlisted: new Set(['orphan_tree_command']),
  });
  assert.deepEqual(wired.staleReachabilityAllowlist, ['orphan_tree_command']);
});

test('omitting the reachable set keeps the legacy lexical semantics', () => {
  const result = analyzeWiring({
    registeredCommands: ['a'],
    frontendCalls: new Set(['a']),
    rustDefinitions: new Set(['a']),
    allowlisted: new Set(),
  });
  assert.deepEqual(result.registeredWithoutReachableCaller, []);
  assert.deepEqual(result.staleReachabilityAllowlist, []);
});

test('the renderer reachability walk reaches the real desktop entry point', () => {
  const reachable = collectReachableRendererFiles();
  assert.ok(
    reachable.size > 100,
    `expected the renderer graph to contain the app, got ${reachable.size} module(s)`,
  );
  assert.ok(
    [...reachable].some((file) => file.endsWith('/apps/desktop/src/main.tsx')),
    'main.tsx must be in its own reachable set',
  );
  assert.ok(
    [...reachable].some((file) => file.endsWith('/apps/desktop/src/App.tsx')),
    'App.tsx must be reachable from main.tsx, otherwise the walk is misconfigured',
  );
});

test('a wrapper nobody imports is reported, however reachable its module is', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': CLIENT_INDEX,
    'client/src/auth.ts': CLIENT_AUTH,
    'client/src/window.ts': CLIENT_WINDOW,
    'app/main.tsx': `
      import { auth } from '@fixture/client';
      void auth.storeSession('token');
    `,
  });

  assert.deepEqual(usage.live, ['auth_store_session']);
  assert.deepEqual(usage.unused.auth_remove_session, ['auth.ts#removeSession']);
  assert.deepEqual(usage.unused.window_minimize, ['window.ts#minimize']);

  const result = analyzeWiring({
    registeredCommands: ['auth_store_session', 'auth_remove_session'],
    frontendCalls: new Set(['auth_store_session', 'auth_remove_session']),
    rustDefinitions: new Set(['auth_store_session', 'auth_remove_session']),
    allowlisted: new Set(),
    reachableFrontendCalls: new Set(usage.live),
    unusedWrappers: new Map([['auth_remove_session', ['client/src/auth.ts#removeSession']]]),
  });
  assert.deepEqual(result.registeredWithUnusedWrapper, [
    'auth_remove_session (client/src/auth.ts#removeSession)',
  ]);
  assert.deepEqual(result.registeredWithoutReachableCaller, []);
});

test('a wrapper used through a namespace is live, and so is what it calls', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': CLIENT_INDEX,
    'client/src/auth.ts': CLIENT_AUTH,
    'client/src/window.ts': CLIENT_WINDOW,
    'app/main.tsx': `
      import { window as desktopWindow } from '@fixture/client';
      import * as client from '@fixture/client';
      import { windowControls } from './barrel';
      void desktopWindow.unpin();
      void client.auth.removeSession();
      void windowControls.center();
    `,
    'app/barrel.ts': `
      export { window as windowControls } from '@fixture/client';
    `,
  });

  assert.deepEqual(usage.live, [
    'auth_remove_session',
    'window_center',
    'window_geometry',
    'window_pin',
  ]);
  assert.deepEqual(Object.keys(usage.unused).sort(), ['auth_store_session', 'window_minimize']);
});

test('a destructured or dynamically imported wrapper is live', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': CLIENT_INDEX,
    'client/src/auth.ts': CLIENT_AUTH,
    'client/src/window.ts': CLIENT_WINDOW,
    'app/main.tsx': `
      import { auth } from '@fixture/client';
      const { removeSession } = auth;
      export async function later() {
        const { window } = await import('@fixture/client');
        await window.minimize();
        return removeSession();
      }
    `,
  });

  assert.deepEqual(usage.live, ['auth_remove_session', 'window_minimize']);
});

test('a type import, a shadowing local and an unreachable importer call nothing', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': CLIENT_INDEX,
    'client/src/auth.ts': CLIENT_AUTH,
    'client/src/window.ts': CLIENT_WINDOW,
    'app/main.tsx': `
      import type { auth } from '@fixture/client';
      import { window } from '@fixture/client';
      export type Store = typeof auth.storeSession;
      export function describe(window: { minimize(): void }) {
        window.minimize();
      }
    `,
    'app/unmounted.tsx': `
      import { auth } from '@fixture/client';
      void auth.removeSession();
    `,
  });

  assert.deepEqual(usage.live, []);
  assert.deepEqual(Object.keys(usage.unused).sort(), [
    'auth_remove_session',
    'auth_store_session',
    'window_center',
    'window_geometry',
    'window_minimize',
    'window_pin',
  ]);
});

test('a namespace re-exported under a local alias keeps every wrapper in it', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': CLIENT_INDEX,
    'client/src/auth.ts': CLIENT_AUTH,
    'client/src/window.ts': CLIENT_WINDOW,
    'app/main.tsx': `
      import { session } from './alias';
      import { controls } from './alias';
      void session.storeSession('token');
      void controls.minimize();
    `,
    'app/alias.ts': `
      import { auth, window } from '@fixture/client';
      export const session = auth;
      const controls = window;
      export { controls };
    `,
  });

  assert.deepEqual(usage.live, [
    'auth_remove_session',
    'auth_store_session',
    'window_center',
    'window_geometry',
    'window_minimize',
    'window_pin',
  ]);
});

test('a namespace handed on as a value keeps every wrapper in it', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': CLIENT_INDEX,
    'client/src/auth.ts': CLIENT_AUTH,
    'client/src/window.ts': CLIENT_WINDOW,
    'app/main.tsx': `
      import { auth } from '@fixture/client';
      export const handlers = Object.values(auth);
    `,
  });

  assert.deepEqual(usage.live, ['auth_remove_session', 'auth_store_session']);
});

test('a renderer function that invokes directly is reported when nothing references it', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': 'export {};',
    'app/main.tsx': `
      import { readTheme, themeApi } from './api/theme';
      import Panel from './Panel';
      void readTheme();
      void themeApi.reset();
      void Panel;
    `,
    'app/api/theme.ts': `
      import { invoke } from '@fixture/tauri';
      export const readTheme = () => invoke<string>('theme_read');
      export async function writeTheme(theme: string): Promise<void> {
        await invoke('theme_write', { theme });
      }
      async function resetTheme(): Promise<void> {
        await invoke('theme_reset');
      }
      async function exportTheme(): Promise<string> {
        return invoke<string>('theme_export');
      }
      export const themeApi = { reset: resetTheme };
      export const unusedThemeApi = { export: exportTheme };
    `,
    'app/Panel.tsx': `
      import { invoke } from '@fixture/tauri';
      export default function Panel() {
        void invoke('panel_open');
        return null;
      }
      export function closePanel() {
        return invoke('panel_close');
      }
    `,
  });

  assert.deepEqual(usage.live, ['panel_open', 'theme_read', 'theme_reset']);
  assert.deepEqual(usage.unused, {
    panel_close: ['Panel.tsx#closePanel'],
    theme_export: ['theme.ts#exportTheme', 'theme.ts#unusedThemeApi'],
    theme_write: ['theme.ts#writeTheme'],
  });
});

test('a class or an object literal nobody references is dead with everything only it reaches', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': 'export {};',
    'app/main.tsx': `
      import Live from './api/live';
      import { liveApi } from './api/kept';
      import { ping } from './api/orphan';
      void Live.read();
      void liveApi.read();
      void ping();
    `,
    'app/api/live.ts': `
      import { invoke } from '@fixture/tauri';
      export default class Live {
        static read() {
          return invoke('live_read');
        }
      }
    `,
    'app/api/kept.ts': `
      import { invoke } from '@fixture/tauri';
      const readKept = () => invoke('kept_read');
      export const liveApi = { read: readKept };
    `,
    'app/api/orphan.ts': `
      import { invoke } from '@fixture/tauri';
      export function ping() {
        return invoke('orphan_ping');
      }
      async function eraseAll() {
        return invoke('orphan_erase');
      }
      export class OrphanClient {
        static erase() {
          return eraseAll();
        }
      }
      export default OrphanClient;
      export const OrphanBag = { ping };
    `,
  });

  assert.deepEqual(usage.live, ['kept_read', 'live_read', 'orphan_ping']);
  assert.deepEqual(usage.unused, {
    orphan_erase: ['orphan.ts#eraseAll', 'orphan.ts#OrphanClient'],
  });
  assert.deepEqual(
    usage.unreferenced.map(({ site, commands }) => `${site.split('/').at(-1)} ${commands}`).sort(),
    [
      'orphan.ts#OrphanBag orphan_ping',
      'orphan.ts#OrphanClient orphan_erase',
      'orphan.ts#eraseAll orphan_erase',
    ],
  );
});

test('an unreferenced function is reported even when its command has a live caller', (t) => {
  const usage = analyzeClientFixture(t, {
    'client/src/index.ts': CLIENT_INDEX,
    'client/src/auth.ts': CLIENT_AUTH,
    'client/src/window.ts': 'export {};',
    'app/main.tsx': `
      import { auth } from '@fixture/client';
      import { storeSession } from './api/session';
      void auth.storeSession('token');
      void storeSession('token');
    `,
    'app/api/session.ts': `
      import { invoke } from '@fixture/tauri';
      export const storeSession = (session: string) => invoke('auth_store_session', { session });
      export const storeSessionAgain = (session: string) =>
        invoke('auth_store_session', { session });
    `,
  });

  assert.deepEqual(usage.live, ['auth_store_session']);
  assert.deepEqual(Object.keys(usage.unused), ['auth_remove_session']);

  const result = analyzeWiring({
    registeredCommands: ['auth_store_session', 'auth_remove_session'],
    frontendCalls: new Set(['auth_store_session', 'auth_remove_session']),
    rustDefinitions: new Set(['auth_store_session', 'auth_remove_session']),
    allowlisted: new Set(),
    reachableFrontendCalls: new Set(usage.live),
    unusedWrappers: new Map([['auth_remove_session', ['client/src/auth.ts#removeSession']]]),
    unreferencedCallers: usage.unreferenced.map(({ site, commands }) => ({
      site: site.split('/').at(-1),
      commands,
    })),
  });
  assert.deepEqual(result.unreferencedLiveCallers, [
    'session.ts#storeSessionAgain (auth_store_session)',
  ]);
  assert.deepEqual(result.registeredWithUnusedWrapper, [
    'auth_remove_session (client/src/auth.ts#removeSession)',
  ]);

  const lines = [];
  reportFailures({ unreferencedLiveCallers: result.unreferencedLiveCallers }, (line) =>
    lines.push(line),
  );
  assert.match(lines[0], /^DEAD CALLER .*: session\.ts#storeSessionAgain \(auth_store_session\)$/);
  assert.match(lines[1], /^ {2}Fix: delete the function/);
});

test('each failure group prints how to fix it', () => {
  const lines = [];
  const failureCount = reportFailures(
    {
      registeredWithUnusedWrapper: ['auth_remove_session (client/src/auth.ts#removeSession)'],
      registeredWithoutFrontend: ['native_only'],
    },
    (line) => lines.push(line),
  );

  assert.equal(failureCount, 2);
  assert.match(lines[0], /^ORPHAN .*: native_only$/);
  assert.match(lines[1], /^ {2}Fix: delete the command/);
  assert.match(
    lines[2],
    /^UNUSED WRAPPER .*: auth_remove_session \(client\/src\/auth\.ts#removeSession\)$/,
  );
  assert.match(lines[3], /^ {2}Fix: call the named function .*wire-or-cut\.md\.$/);
});
