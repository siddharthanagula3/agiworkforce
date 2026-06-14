/**
 * projectInstructions.ts — Load project-level AI instruction files from the workspace.
 *
 * Reads CLAUDE.md / AGENTS.md / .cursorrules from the workspace root and returns
 * their content as project instructions to inject into the system prompt.
 *
 * Design constraints:
 *   - Max 8 KB per file (truncated with a notice) to stay within token budgets.
 *   - Max 2 files loaded (CLAUDE.md preferred, AGENTS.md fallback, then .cursorrules).
 *   - Files in node_modules, .git, etc. are never traversed.
 *   - Content is wrapped in <project_instructions> tags and labelled as data-only
 *     so the model treats it as authoritative project context, not arbitrary
 *     user-supplied untrusted input.
 *   - Returns empty string when no workspace is open or no instruction file is found.
 */

import * as vscode from 'vscode';
import * as path from 'path';

const MAX_FILE_BYTES = 8_192; // 8 KB per file
const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules'] as const;

/**
 * Load project instruction files (CLAUDE.md / AGENTS.md / .cursorrules) from the
 * workspace root. Returns a formatted string ready to append to a system prompt,
 * or an empty string if none were found.
 */
export async function loadProjectInstructions(): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return '';

  const root = workspaceFolders[0]!.uri;
  const sections: string[] = [];

  for (const fileName of INSTRUCTION_FILES) {
    if (sections.length >= 2) break; // cap at 2 files

    const fileUri = vscode.Uri.joinPath(root, fileName);
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      if (bytes.byteLength === 0) continue;

      const raw = Buffer.from(bytes).toString('utf8');
      const truncated = raw.length > MAX_FILE_BYTES;
      const content = truncated
        ? raw.slice(0, MAX_FILE_BYTES) +
          `\n\n[...truncated — file is ${raw.length} chars, showing first ${MAX_FILE_BYTES}]`
        : raw;

      const label = path.basename(fileName);
      sections.push(`### ${label}\n${content}`);
    } catch {
      // File does not exist or is unreadable — skip silently.
    }
  }

  if (sections.length === 0) return '';

  return (
    '## Project instructions\n' +
    'The following files define project-level conventions and AI instructions. ' +
    'Follow them when they are relevant to the current task.\n\n' +
    sections.join('\n\n')
  );
}
