import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { applyLlmEdit } from '../../platform/applyEdit';

declare function suite(name: string, run: () => void): void;
declare function test(name: string, run: () => void | Promise<void>): void;

async function target() {
  const document = await vscode.workspace.openTextDocument({
    content: 'const value = 0;',
    language: 'typescript',
  });
  const editor = await vscode.window.showTextDocument(document);
  const selection = new vscode.Selection(0, 0, 0, document.getText().length);
  const expectedDocument = { uri: document.uri, version: document.version };
  return { document, editor, selection, expectedDocument };
}

suite('native inline edit safety', () => {
  test('uses disposable secret storage without a login Keychain', async () => {
    const runner = vscode.extensions.getExtension<{
      verifySyntheticSecretStorage(): Promise<boolean>;
    }>('agiworkforce-test.agi-vsix-e2e-runner');
    assert.ok(runner, 'The isolated test runner must be installed');
    const fixture = await runner.activate();
    assert.strictEqual(await fixture.verifySyntheticSecretStorage(), true);
  });

  test('accepts an unchanged target through the actual editor transaction', async () => {
    const item = await target();
    const outcome = await applyLlmEdit(
      item.editor,
      item.selection,
      '```typescript\nconst value = 1;\n```',
      'Fix',
      { autoApply: true, expectedDocument: item.expectedDocument },
    );
    assert.strictEqual(outcome, 'accepted');
    assert.strictEqual(item.document.getText(), 'const value = 1;');
  });

  test('preserves a human change made after the proposal snapshot', async () => {
    const item = await target();
    assert.strictEqual(
      await item.editor.edit((edit) => edit.replace(item.selection, 'const value = 9;')),
      true,
    );
    const outcome = await applyLlmEdit(
      item.editor,
      item.selection,
      '```typescript\nconst value = 1;\n```',
      'Fix',
      { autoApply: true, expectedDocument: item.expectedDocument },
    );
    assert.strictEqual(outcome, undefined);
    assert.strictEqual(item.document.getText(), 'const value = 9;');
  });

  test('accepts only one of two native writes racing against the same version', async () => {
    const item = await target();
    let humanChange: Thenable<boolean> | undefined;
    const proposed = item.editor.edit((edit) => {
      edit.replace(item.selection, 'const value = 1;');
      const human = new vscode.WorkspaceEdit();
      human.replace(item.document.uri, item.selection, 'const value = 9;');
      humanChange = vscode.workspace.applyEdit(human);
    });
    assert.ok(humanChange);
    const [humanApplied, proposalApplied] = await Promise.all([humanChange, proposed]);
    assert.notStrictEqual(humanApplied, proposalApplied);
    assert.strictEqual(
      item.document.getText(),
      humanApplied ? 'const value = 9;' : 'const value = 1;',
    );
  });
});
