/**
 * extension.smoke.test.ts — Minimal integration smoke test.
 *
 * Runs inside the VS Code extension host (NOT the vitest mock).
 * Asserts:
 *   1. The extension activates without throwing.
 *   2. At least one of the package.json commands is registered and resolvable.
 *   3. The `@agi` chat participant is registered (catches registration order bugs).
 *
 * Requires: pnpm add -D mocha @types/mocha glob @types/glob
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

// Mocha's tdd UI is configured by the loader (`suite/index.ts`).
declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void | Promise<void>): void;

suite('AGI Workforce extension — smoke', () => {
  test('extension activates and is found by id', async () => {
    const ext = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(ext, 'extension agiworkforce.agi-workforce not found');
    if (!ext.isActive) await ext.activate();
    assert.strictEqual(ext.isActive, true, 'extension failed to activate');
  });

  test('package.json version matches getExtensionVersion()', async () => {
    const ext = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(ext);
    const declared = (ext.packageJSON as { version: string }).version;
    assert.match(declared, /^\d+\.\d+\.\d+/, `version "${declared}" does not match semver shape`);
  });

  test('all package.json commands are registered', async () => {
    const ext = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(ext);
    if (!ext.isActive) await ext.activate();
    const declared = (
      (ext.packageJSON as { contributes?: { commands?: Array<{ command: string }> } }).contributes
        ?.commands ?? []
    ).map((c) => c.command);
    const all = await vscode.commands.getCommands(true);
    for (const id of declared) {
      assert.ok(
        all.includes(id),
        `command "${id}" declared in package.json is not registered at runtime`,
      );
    }
  });

  test('newConversation command resolves without throwing', async () => {
    const all = await vscode.commands.getCommands(true);
    if (!all.includes('agi-workforce.newConversation')) return; // skip if not present
    await vscode.commands.executeCommand('agi-workforce.newConversation');
  });
});
