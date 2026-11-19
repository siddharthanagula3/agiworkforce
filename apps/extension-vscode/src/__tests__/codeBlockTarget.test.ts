import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { codeBlockTargetRefusal } from '../platform/codeBlockTarget';

function document(fsPath: string, languageId: string, isUntitled = false) {
  return { uri: vscode.Uri.file(fsPath), languageId, isUntitled };
}

describe('where a chat code block may be applied', () => {
  it.each([
    ['ts', 'typescript'],
    ['typescript', 'typescript'],
    ['ts', 'typescriptreact'],
    ['js', 'typescript'],
    ['py', 'python'],
    ['python3', 'python'],
    ['bash', 'shellscript'],
    ['json', 'jsonc'],
    ['', 'go'],
  ])('accepts a %j block in a %s file', (fence, languageId) => {
    expect(codeBlockTargetRefusal(document('/repo/a', languageId), fence, '/repo')).toBeUndefined();
  });

  it.each([
    ['python', 'typescript'],
    ['tsx', 'typescript'],
    ['diff', 'typescript'],
    ['rust', 'go'],
  ])('refuses a %j block in a %s file', (fence, languageId) => {
    expect(codeBlockTargetRefusal(document('/repo/a', languageId), fence, '/repo')).toContain(
      'does not belong in',
    );
  });

  it('refuses a file outside the folder the conversation works in', () => {
    expect(
      codeBlockTargetRefusal(document('/other-root/src/app.ts', 'typescript'), 'ts', '/repo'),
    ).toContain('outside /repo');
  });

  it('accepts a file inside the conversation folder and an unsaved buffer', () => {
    expect(
      codeBlockTargetRefusal(document('/repo/src/app.ts', 'typescript'), 'ts', '/repo'),
    ).toBeUndefined();
    expect(
      codeBlockTargetRefusal(document('Untitled-1', 'typescript', true), 'ts', '/repo'),
    ).toBeUndefined();
  });
});
