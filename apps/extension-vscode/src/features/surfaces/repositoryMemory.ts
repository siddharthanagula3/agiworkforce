import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';

import type { MemoryAddResult } from '../../integrations/localRuntimeClient';
import { CLI_WORKSPACE_REQUIREMENT, type CliCapabilityAdapter } from './cliCapabilities';

const OPEN_MEMORY_FILE = 'Open memory file';

export async function rememberForRepository(cli: CliCapabilityAdapter): Promise<void> {
  if (!vscode.workspace.isTrusted || !vscode.workspace.workspaceFolders?.length) {
    void vscode.window.showWarningMessage(CLI_WORKSPACE_REQUIREMENT);
    return;
  }
  const workspace = await cli.pinToWorkspace();
  if (workspace === undefined) return;
  const text = (
    await vscode.window.showInputBox({
      title: `${PRODUCT_NAMES.code}, Remember for this repository`,
      prompt: 'Save a note to the repository. Collaborators can see it if you commit the file.',
      placeHolder: 'Run pnpm test:unit before committing',
      ignoreFocusOut: true,
    })
  )?.trim();
  if (text === undefined || text === '') return;
  const result = await workspace.call<MemoryAddResult>('memoryAdd', text);
  if (result.status !== 'ok') {
    void vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${result.reason}`);
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    `${PRODUCT_NAMES.code}: saved to ${result.value.path}. Sessions in this repository will load it.`,
    OPEN_MEMORY_FILE,
  );
  if (choice === OPEN_MEMORY_FILE) {
    await vscode.window.showTextDocument(vscode.Uri.file(result.value.path));
  }
}
