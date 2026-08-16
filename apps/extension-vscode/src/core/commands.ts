
import * as vscode from 'vscode';

export interface CommandDeps {
  context: vscode.ExtensionContext;
}

export interface Command {
  id: string;
  handler: (deps: CommandDeps) => (...args: unknown[]) => Promise<unknown> | unknown;
}

export function registerCommands(
  deps: CommandDeps,
  commands: readonly Command[],
): vscode.Disposable[] {
  return commands.map((cmd) =>
    vscode.commands.registerCommand(cmd.id, cmd.handler(deps) as (...args: unknown[]) => unknown),
  );
}

export const REGISTRY_COMMANDS: readonly Command[] = [];
