import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function suiteSetup(fn: () => void | Promise<void>): void;

const SIDEBAR_VIEW_ID = 'agi-workforce.sidebar';

function workspaceRoot(): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(root, 'the extension host must open the fixture workspace');
  return root;
}

suite('AGI Workforce sidebar surfaces', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(extension, 'extension agiworkforce.agi-workforce not found');
    if (!extension.isActive) await extension.activate();
  });

  test('the usage meter view resolves in a real window and offers its billing command', async () => {
    await vscode.commands.executeCommand(`${SIDEBAR_VIEW_ID}.focus`);

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('agi-workforce.showAccountUsage'),
      'the account and usage surface behind the meter must be reachable',
    );

    // Resolving twice is what a user does by collapsing and reopening the view;
    // a throw inside the meter push would surface here.
    await vscode.commands.executeCommand('agi-workforce.newConversation');
    await vscode.commands.executeCommand(`${SIDEBAR_VIEW_ID}.focus`);
  });

  test('the composer view resolves with a real selection and a real problem in the editor', async () => {
    const root = workspaceRoot();
    const filePath = path.join(root, 'src', 'composer-context.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, ['const a = 1;', 'const b = 2;', 'export { a, b };', ''].join('\n'));

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, 0, 1, 12);

    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, filePath);
    assert.strictEqual(vscode.window.activeTextEditor?.selection.isEmpty, false);
    assert.ok(
      vscode.window.tabGroups.all.some((group) =>
        group.tabs.some(
          (tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === filePath,
        ),
      ),
      'the open-editors context must see the tab this test opened',
    );

    await vscode.commands.executeCommand(`${SIDEBAR_VIEW_ID}.focus`);
    assert.strictEqual(vscode.workspace.isTrusted, true, 'git context is gated on workspace trust');
  });
});
