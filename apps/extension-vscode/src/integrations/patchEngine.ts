import * as vscode from 'vscode';

export async function showOriginalContext(
  expectedText: string,
  matchedText: string,
  filePath: string,
): Promise<void> {
  const expectedDoc = await vscode.workspace.openTextDocument({
    content: expectedText,
    language: 'plaintext',
  });
  const matchedDoc = await vscode.workspace.openTextDocument({
    content: matchedText,
    language: 'plaintext',
  });

  await vscode.commands.executeCommand(
    'vscode.diff',
    expectedDoc.uri,
    matchedDoc.uri,
    `Patch Context: ${filePath} (Expected vs Actual)`,
    { preview: true },
  );
}
