import * as vscode from 'vscode';
import {
  PROJECT_INSTRUCTION_FILES,
  PROJECT_INSTRUCTION_MAX_SOURCES,
  projectInstruction,
  type ProjectInstruction,
} from '@agiworkforce/types';
import { getActiveWorkspaceFolderSync } from '../platform/workspaceFolders';

export interface ProjectInstructionSource extends ProjectInstruction {
  uri: vscode.Uri;
}

export function projectInstructionFolder(): vscode.WorkspaceFolder | undefined {
  return getActiveWorkspaceFolderSync() ?? vscode.workspace.workspaceFolders?.[0];
}

export async function loadProjectInstructionSources(): Promise<ProjectInstructionSource[]> {
  const folder = projectInstructionFolder();
  if (folder === undefined) return [];

  const sources: ProjectInstructionSource[] = [];
  for (const fileName of PROJECT_INSTRUCTION_FILES) {
    if (sources.length >= PROJECT_INSTRUCTION_MAX_SOURCES) break;
    const uri = vscode.Uri.joinPath(folder.uri, fileName);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const instruction = projectInstruction(fileName, Buffer.from(bytes).toString('utf8'));
      if (instruction !== null) sources.push({ ...instruction, uri });
    } catch {
      continue;
    }
  }
  return sources;
}
