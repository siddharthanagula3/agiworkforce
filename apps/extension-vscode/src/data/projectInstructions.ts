import * as vscode from 'vscode';

const MAX_FILE_BYTES = 8_192;
const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', '.agiworkforce/instructions.md'] as const;

export interface ProjectInstructionSource {
  fileName: (typeof INSTRUCTION_FILES)[number];
  uri: vscode.Uri;
  content: string;
  truncated: boolean;
}

export async function loadProjectInstructionSources(): Promise<ProjectInstructionSource[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return [];

  const root = workspaceFolders[0]!.uri;
  const sources: ProjectInstructionSource[] = [];

  for (const fileName of INSTRUCTION_FILES) {
    if (sources.length >= 2) break;

    const uri = vscode.Uri.joinPath(root, fileName);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.byteLength === 0) continue;

      const raw = Buffer.from(bytes).toString('utf8');
      const truncated = raw.length > MAX_FILE_BYTES;
      const content = truncated
        ? raw.slice(0, MAX_FILE_BYTES) +
          `\n\n[...truncated, file is ${raw.length} chars, showing first ${MAX_FILE_BYTES}]`
        : raw;
      sources.push({ fileName, uri, content, truncated });
    } catch (err) {
      void err;
    }
  }

  return sources;
}
