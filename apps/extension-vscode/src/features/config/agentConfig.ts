import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

export function agentConfigPath(homeDirectory = os.homedir()): string {
  return path.join(homeDirectory, '.agiworkforce', 'config.toml');
}

interface AgentConfigFileSystem {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<string | undefined>;
  open(path: string, flags: 'a', mode: number): Promise<{ close(): Promise<void> }>;
}

export interface OpenAgentConfigOptions {
  homeDirectory?: string;
  fileSystem?: AgentConfigFileSystem;
}

export async function openAgentConfig(options: OpenAgentConfigOptions = {}): Promise<string> {
  const configPath = agentConfigPath(options.homeDirectory);
  const configDirectory = path.dirname(configPath);
  const fileSystem = options.fileSystem ?? fs;
  await fileSystem.mkdir(configDirectory, { recursive: true, mode: 0o700 });
  const handle = await fileSystem.open(configPath, 'a', 0o600);
  await handle.close();
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
  await vscode.window.showTextDocument(document, { preview: false });
  return configPath;
}
