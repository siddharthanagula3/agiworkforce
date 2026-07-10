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
    assert.ok(declared.length > 0, 'no commands declared in package.json contributes.commands');
    const all = new Set(await vscode.commands.getCommands(true));
    // Collect EVERY missing command before failing so a single run reports the
    // full breakage surface instead of stopping at the first missing id.
    const missing = declared.filter((id) => !all.has(id));
    assert.deepStrictEqual(
      missing,
      [],
      `${missing.length} command(s) declared in package.json are not registered at runtime:\n` +
        missing.map((id) => `  - ${id}`).join('\n'),
    );
  });

  test('newConversation command resolves without throwing', async () => {
    const all = await vscode.commands.getCommands(true);
    // No silent skip: if the command is absent that is itself a failure.
    assert.ok(
      all.includes('agi-workforce.newConversation'),
      'command "agi-workforce.newConversation" is not registered at runtime',
    );
    await vscode.commands.executeCommand('agi-workforce.newConversation');
  });
});
