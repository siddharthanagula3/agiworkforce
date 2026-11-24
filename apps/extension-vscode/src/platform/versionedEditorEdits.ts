import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';

let capability: Promise<boolean> | undefined;

export function supportsVersionedEditorEdits(): Promise<boolean> {
  capability ??= probeEditorEdits().catch(() => false);
  return capability;
}

async function probeEditorEdits(): Promise<boolean> {
  const directory = await mkdtemp(path.join(tmpdir(), 'agi-editor-edit-'));
  const uri = vscode.Uri.file(path.join(directory, 'probe.txt'));
  let document: vscode.TextDocument | undefined;
  try {
    await writeFile(uri.fsPath, '0', { flag: 'wx' });
    document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
    });
    const range = new vscode.Range(0, 0, 0, 1);
    let competing: Thenable<boolean> | undefined;
    const proposed = editor.edit((builder) => {
      builder.replace(range, '1');
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, range, '2');
      competing = vscode.workspace.applyEdit(edit);
    });
    const [proposalResult, competingResult] = await Promise.allSettled([proposed, competing]);
    if (proposalResult.status !== 'fulfilled' || competingResult.status !== 'fulfilled') {
      return false;
    }
    const proposalApplied = proposalResult.value;
    const competingApplied = competingResult.value;
    if (competingApplied === undefined) return false;
    return (
      proposalApplied !== competingApplied && document.getText() === (proposalApplied ? '1' : '2')
    );
  } finally {
    try {
      if (document?.isDirty) await document.save();
      const tabs = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter(
          (tab) =>
            tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString(),
        );
      if (tabs.length > 0) await vscode.window.tabGroups.close(tabs, true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
