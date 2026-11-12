import * as vscode from 'vscode';

let lastTextEditor: vscode.TextEditor | undefined;

/**
 * An editor-area chat panel becomes the active editor while it has focus, so
 * `activeTextEditor` is undefined exactly when the user clicks inside it. The
 * text editor they were working in is remembered for that case.
 */
export function trackLastTextEditor(): vscode.Disposable {
  lastTextEditor = vscode.window.activeTextEditor;
  return vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor !== undefined) lastTextEditor = editor;
  });
}

export function workingTextEditor(): vscode.TextEditor | undefined {
  const active = vscode.window.activeTextEditor;
  if (active !== undefined) return active;
  const remembered = lastTextEditor;
  if (remembered === undefined) return undefined;
  return vscode.window.visibleTextEditors.includes(remembered) ? remembered : undefined;
}
