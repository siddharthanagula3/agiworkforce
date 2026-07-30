/**
 * projectInstructions.ts — Load project-level AI instruction files from the workspace.
 *
 * Reads AGENTS.md / CLAUDE.md / .agiworkforce/instructions.md from the workspace
 * root and returns
 * their content as project instructions to inject into the system prompt.
 *
 * Design constraints:
 *   - Max 8 KB per file (truncated with a notice) to stay within token budgets.
 *   - Max 2 files loaded in the same order as the local app-server.
 *   - Files in node_modules, .git, etc. are never traversed.
 *   - Content is wrapped in <project_instructions> tags and labelled as data-only
 *     so the model treats it as authoritative project context, not arbitrary
 *     user-supplied untrusted input.
 *   - Returns empty string when no workspace is open or no instruction file is found.
 */

import * as vscode from 'vscode';
import * as path from 'path';

const MAX_FILE_BYTES = 8_192; // 8 KB per file
const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', '.agiworkforce/instructions.md'] as const;

export interface ProjectInstructionSource {
  fileName: (typeof INSTRUCTION_FILES)[number];
  uri: vscode.Uri;
  content: string;
  truncated: boolean;
}

/**
 * Read the bounded project-instruction sources used by the VS Code context UI.
 *
 * The local app-server owns final system-prompt assembly and independently
 * discovers repository instructions. Keeping the structured source list here
 * lets the extension show users what the runtime will discover without
 * silently duplicating those files as a second user-message instruction block.
 */
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
          `\n\n[...truncated — file is ${raw.length} chars, showing first ${MAX_FILE_BYTES}]`
        : raw;
      sources.push({ fileName, uri, content, truncated });
    } catch {
      // File does not exist or is unreadable — skip silently.
    }
  }

  return sources;
}

/**
 * Load project instruction files from the workspace root. Returns a formatted
 * string ready to append to a system prompt, or an empty string if none were
 * found.
 */
export async function loadProjectInstructions(): Promise<string> {
  const sources = await loadProjectInstructionSources();
  const sections = sources.map(
    (source) => `### ${path.basename(source.fileName)}\n${source.content}`,
  );

  if (sections.length === 0) return '';

  return (
    '## Project instructions\n' +
    'The following files define project-level conventions and AI instructions. ' +
    'Follow them when they are relevant to the current task.\n\n' +
    sections.join('\n\n')
  );
}
