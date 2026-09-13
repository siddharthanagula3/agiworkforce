import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function suiteSetup(fn: () => void | Promise<void>): void;

const OPEN_PATH_REFERENCE_COMMAND = 'agi-workforce.openPathReference';

const STACK_TRACE = [
  'Error: cannot read property of undefined',
  '    at renderRow (src/render-row.ts:2:10)',
  '    at Object.<anonymous> (src/render-row.ts:1:1)',
  '',
].join('\n');

const TARGET_SOURCE = ['export function renderRow() {', '  return null;', '}', ''].join('\n');

function workspaceRoot(): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(root, 'the extension host must open the fixture workspace');
  return root;
}

async function openDocument(filePath: string): Promise<vscode.TextDocument> {
  return vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
}

suite('AGI Workforce path links', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(extension, 'extension agiworkforce.agi-workforce not found');
    if (!extension.isActive) await extension.activate();
  });

  test('a stack-trace frame in an open document is a link that opens the file at the position', async () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, 'render-row.log'), STACK_TRACE);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'render-row.ts'), TARGET_SOURCE);

    const logDocument = await openDocument(path.join(root, 'render-row.log'));
    await vscode.window.showTextDocument(logDocument);

    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      logDocument.uri,
    );
    const frameLink = links.find(
      (link) => logDocument.getText(link.range) === 'src/render-row.ts:2:10',
    );
    assert.ok(
      frameLink,
      `no link on the first stack frame; got ${links.map((link) => logDocument.getText(link.range)).join(', ')}`,
    );
    assert.strictEqual(frameLink.range.start.line, 1);

    const target = frameLink.target;
    assert.ok(target, 'the link must carry a target');
    assert.strictEqual(target.scheme, 'command');
    assert.strictEqual(target.path, OPEN_PATH_REFERENCE_COMMAND);
    const [argument] = JSON.parse(decodeURIComponent(target.query)) as Array<{
      path: string;
      line?: number;
      column?: number;
    }>;
    assert.deepStrictEqual(argument, { path: 'src/render-row.ts', line: 2, column: 10 });

    await vscode.commands.executeCommand(OPEN_PATH_REFERENCE_COMMAND, argument);
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, 'the link must open an editor');
    assert.strictEqual(editor.document.uri.fsPath, path.join(root, 'src', 'render-row.ts'));
    assert.strictEqual(editor.selection.active.line, 1);
    assert.strictEqual(editor.selection.active.character, 9);
  });
});
