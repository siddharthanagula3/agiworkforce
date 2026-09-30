import * as vscode from 'vscode';

import type { MemoryAddResult } from '../../integrations/localRuntimeClient';
import type { CliCapabilityAdapter } from './cliCapabilities';

const OPEN_MEMORY_FILE = 'Open memory file';

export async function rememberForRepository(cli: CliCapabilityAdapter): Promise<void> {
  const text = (
    await vscode.window.showInputBox({
      title: 'AGI Workforce, Remember for this repository',
      prompt:
        'Sessions in this repository load this note. It is saved in the project, not your account.',
      placeHolder: 'For example: run pnpm test:unit before committing',
      ignoreFocusOut: true,
    })
  )?.trim();
  if (text === undefined || text === '') return;
  const result = await cli.call<MemoryAddResult>('memoryAdd', text);
  if (result.status !== 'ok') {
    void vscode.window.showWarningMessage(`AGI Workforce: ${result.reason}`);
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    `AGI Workforce: saved to ${result.value.path}. Sessions in this repository will load it.`,
    OPEN_MEMORY_FILE,
  );
  if (choice === OPEN_MEMORY_FILE) {
    await vscode.window.showTextDocument(vscode.Uri.file(result.value.path));
  }
}
