import * as vscode from 'vscode';
import * as path from 'node:path';
import { Config } from './config';

const TERMINAL_NAME = 'AGI';
const PYTHON_ENVIRONMENTS_EXTENSION = 'ms-python.vscode-python-envs';

interface PythonEnvironmentsApi {
  getEnvironment(scope: vscode.Uri): Promise<object | undefined>;
  createTerminal(environment: object, options: vscode.TerminalOptions): Promise<vscode.Terminal>;
}

export function findAgiTerminal(cwd?: vscode.Uri): vscode.Terminal | undefined {
  return vscode.window.terminals.find((terminal) => {
    if (terminal.name !== TERMINAL_NAME || terminal.exitStatus !== undefined) return false;
    const options = terminal.creationOptions;
    const existing = 'cwd' in options ? options.cwd : undefined;
    if (cwd === undefined || existing === undefined) return cwd === existing;
    const existingPath = typeof existing === 'string' ? existing : existing.fsPath;
    return path.relative(cwd.fsPath, existingPath) === '';
  });
}

export async function createAgiTerminal(cwd?: vscode.Uri): Promise<vscode.Terminal> {
  const options: vscode.TerminalOptions = { name: TERMINAL_NAME, cwd };
  if (cwd !== undefined && vscode.workspace.isTrusted && Config.pythonEnvironmentEnabled()) {
    try {
      const extension = vscode.extensions.getExtension<PythonEnvironmentsApi>(
        PYTHON_ENVIRONMENTS_EXTENSION,
      );
      if (extension !== undefined) {
        const api = extension.isActive ? extension.exports : await extension.activate();
        const environment = await api?.getEnvironment?.(cwd);
        if (
          environment !== undefined &&
          vscode.workspace.isTrusted &&
          typeof api?.createTerminal === 'function'
        ) {
          return await api.createTerminal(environment, options);
        }
      }
    } catch {
      void vscode.window.showWarningMessage(
        'The selected Python environment could not be activated for the AGI terminal.',
      );
    }
  }
  return vscode.window.createTerminal(options);
}
