/**
 * contextBuilder.ts — Rich context builder for AI requests
 *
 * Gathers workspace context (active file, open editors, git status,
 * diagnostics, workspace structure) and formats it into a single
 * string suitable for prepending to LLM system prompts.
 *
 * All methods are fail-safe — they return empty strings on error,
 * never throw.
 */

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── Output limits ────────────────────────────────────────────────────────────

const MAX_GIT_DIFF_CHARS = 2000;
const MAX_FILE_TREE_CHARS = 1500;
const MAX_TREE_ENTRIES = 30;
const MAX_SELECTION_CHARS = 3000;
const MAX_DIAGNOSTICS = 20;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ActiveFileContext {
  filePath: string;
  relativePath: string;
  languageId: string;
  selectedText: string;
  cursorLine: number;
  cursorCharacter: number;
  lineCount: number;
}

export interface OpenFileEntry {
  filePath: string;
  relativePath: string;
  languageId: string;
  isActive: boolean;
}

export interface DiagnosticEntry {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  line: number;
  column: number;
  source: string;
}

export interface ContextBuildOptions {
  includeGit?: boolean;
  includeDiagnostics?: boolean;
  includeOpenFiles?: boolean;
}

// ─── Context builder ──────────────────────────────────────────────────────────

export class ContextBuilder {
  /**
   * Returns context for the currently active editor tab.
   * Returns undefined if no editor is open.
   */
  getActiveFileContext(): ActiveFileContext | undefined {
    try {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) return undefined;

      const { document, selection } = editor;
      let selectedText = document.getText(selection);

      if (selectedText.length > MAX_SELECTION_CHARS) {
        selectedText = selectedText.slice(0, MAX_SELECTION_CHARS) + '\n... (truncated)';
      }

      return {
        filePath: document.uri.fsPath,
        relativePath: vscode.workspace.asRelativePath(document.uri),
        languageId: document.languageId,
        selectedText,
        cursorLine: selection.active.line + 1, // 1-based for human readability
        cursorCharacter: selection.active.character + 1,
        lineCount: document.lineCount,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Returns a list of all open editor tabs with their file paths and languages.
   */
  getOpenFilesContext(): OpenFileEntry[] {
    try {
      const entries: OpenFileEntry[] = [];
      const activeUri = vscode.window.activeTextEditor?.document.uri.toString();

      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const input = tab.input;
          if (input instanceof vscode.TabInputText) {
            const uri = input.uri;
            // Infer language from extension since tab doesn't expose languageId
            const languageId = this._inferLanguageFromUri(uri);
            entries.push({
              filePath: uri.fsPath,
              relativePath: vscode.workspace.asRelativePath(uri),
              languageId,
              isActive: uri.toString() === activeUri,
            });
          }
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Runs `git status --porcelain` and `git diff --stat` in the workspace root.
   * Returns a formatted string. Returns empty string if not a git repo or git is unavailable.
   */
  async getGitContext(): Promise<string> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot === undefined) return '';

      const execOpts = { cwd: workspaceRoot, timeout: 5000 };

      let statusOutput = '';
      try {
        const result = await execFileAsync('git', ['status', '--porcelain'], execOpts);
        statusOutput = result.stdout.trim();
      } catch {
        // Not a git repo or git not installed
        return '';
      }

      let diffOutput = '';
      try {
        const result = await execFileAsync('git', ['diff', '--stat'], execOpts);
        diffOutput = result.stdout.trim();
      } catch {
        // diff failed — continue with status only
      }

      if (statusOutput === '' && diffOutput === '') {
        return 'Git: clean working tree, no changes.';
      }

      const parts: string[] = ['Git status:'];

      if (statusOutput !== '') {
        // Parse porcelain output into readable summary
        const lines = statusOutput.split('\n');
        const staged: string[] = [];
        const modified: string[] = [];
        const untracked: string[] = [];

        for (const line of lines) {
          const index = line.charAt(0);
          const worktree = line.charAt(1);
          const file = line.slice(3);

          if (index === '?' && worktree === '?') {
            untracked.push(file);
          } else if (index !== ' ' && index !== '?') {
            staged.push(file);
          } else if (worktree !== ' ' && worktree !== '?') {
            modified.push(file);
          }
        }

        if (staged.length > 0) {
          parts.push(
            `  Staged (${staged.length}): ${staged.slice(0, 8).join(', ')}${staged.length > 8 ? '...' : ''}`,
          );
        }
        if (modified.length > 0) {
          parts.push(
            `  Modified (${modified.length}): ${modified.slice(0, 8).join(', ')}${modified.length > 8 ? '...' : ''}`,
          );
        }
        if (untracked.length > 0) {
          parts.push(
            `  Untracked (${untracked.length}): ${untracked.slice(0, 8).join(', ')}${untracked.length > 8 ? '...' : ''}`,
          );
        }
      }

      if (diffOutput !== '') {
        let truncatedDiff = diffOutput;
        if (truncatedDiff.length > MAX_GIT_DIFF_CHARS) {
          truncatedDiff = truncatedDiff.slice(0, MAX_GIT_DIFF_CHARS) + '\n... (truncated)';
        }
        parts.push(`\nDiff summary:\n${truncatedDiff}`);
      }

      return parts.join('\n');
    } catch {
      return '';
    }
  }

  /**
   * Returns VS Code diagnostics (errors, warnings) for the active file.
   * Returns an empty array if no active editor or no diagnostics.
   */
  getDiagnosticsContext(): DiagnosticEntry[] {
    try {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) return [];

      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
      if (diagnostics.length === 0) return [];

      return diagnostics.slice(0, MAX_DIAGNOSTICS).map((d) => ({
        severity: this._severityToString(d.severity),
        message: d.message,
        line: d.range.start.line + 1, // 1-based
        column: d.range.start.character + 1,
        source: d.source ?? '',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Returns a tree-like representation of the workspace top-level structure.
   * Limited to MAX_TREE_ENTRIES entries and MAX_FILE_TREE_CHARS characters.
   */
  async getWorkspaceStructure(): Promise<string> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder === undefined) return '';

      const rootUri = workspaceFolder.uri;
      const entries = await vscode.workspace.fs.readDirectory(rootUri);

      // Sort: directories first, then files, alphabetically within each group
      const sorted = entries.sort((a, b) => {
        const aIsDir = a[1] === vscode.FileType.Directory ? 0 : 1;
        const bIsDir = b[1] === vscode.FileType.Directory ? 0 : 1;
        if (aIsDir !== bIsDir) return aIsDir - bIsDir;
        return a[0].localeCompare(b[0]);
      });

      // Filter out common noise directories
      const ignored = new Set([
        'node_modules',
        '.git',
        'dist',
        'build',
        '.next',
        'target',
        '__pycache__',
        '.venv',
        '.vscode',
        '.idea',
        'coverage',
      ]);

      const lines: string[] = [`Workspace: ${workspaceFolder.name}/`];
      let count = 0;

      for (const [name, type] of sorted) {
        if (count >= MAX_TREE_ENTRIES) {
          lines.push(`  ... (${sorted.length - count} more entries)`);
          break;
        }

        if (ignored.has(name)) continue;

        const isDir = type === vscode.FileType.Directory;
        lines.push(`  ${isDir ? name + '/' : name}`);
        count++;
      }

      let output = lines.join('\n');
      if (output.length > MAX_FILE_TREE_CHARS) {
        output = output.slice(0, MAX_FILE_TREE_CHARS) + '\n... (truncated)';
      }

      return output;
    } catch {
      return '';
    }
  }

  /**
   * Combines all context sources into a single formatted string
   * suitable for prepending to LLM system prompts.
   *
   * Options control which sections are included. Default: include everything.
   */
  async buildFullContext(options?: ContextBuildOptions): Promise<string> {
    const includeGit = options?.includeGit ?? true;
    const includeDiagnostics = options?.includeDiagnostics ?? true;
    const includeOpenFiles = options?.includeOpenFiles ?? true;

    const sections: string[] = [];

    // 1. Active file context
    const activeFile = this.getActiveFileContext();
    if (activeFile !== undefined) {
      const fileParts: string[] = [
        `Active file: ${activeFile.relativePath} (${activeFile.languageId})`,
        `  Cursor: line ${activeFile.cursorLine}, column ${activeFile.cursorCharacter} (${activeFile.lineCount} lines total)`,
      ];

      if (activeFile.selectedText !== '') {
        fileParts.push(
          `  Selection:\n\`\`\`${activeFile.languageId}\n${activeFile.selectedText}\n\`\`\``,
        );
      }

      sections.push(fileParts.join('\n'));
    }

    // 2. Open files
    if (includeOpenFiles) {
      const openFiles = this.getOpenFilesContext();
      if (openFiles.length > 0) {
        const fileList = openFiles
          .map((f) => `  ${f.isActive ? '* ' : '  '}${f.relativePath} (${f.languageId})`)
          .join('\n');
        sections.push(`Open files (${openFiles.length}):\n${fileList}`);
      }
    }

    // 3. Diagnostics
    if (includeDiagnostics) {
      const diagnostics = this.getDiagnosticsContext();
      if (diagnostics.length > 0) {
        const diagLines = diagnostics.map(
          (d) =>
            `  [${d.severity.toUpperCase()}] Line ${d.line}: ${d.message}${d.source !== '' ? ` (${d.source})` : ''}`,
        );
        sections.push(`Diagnostics:\n${diagLines.join('\n')}`);
      }
    }

    // 4. Git context
    if (includeGit) {
      const gitContext = await this.getGitContext();
      if (gitContext !== '') {
        sections.push(gitContext);
      }
    }

    // 5. Workspace structure
    const structure = await this.getWorkspaceStructure();
    if (structure !== '') {
      sections.push(structure);
    }

    if (sections.length === 0) return '';

    return '--- Workspace Context ---\n' + sections.join('\n\n') + '\n--- End Context ---';
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _inferLanguageFromUri(uri: vscode.Uri): string {
    const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      sql: 'sql',
      sh: 'shellscript',
      bash: 'shellscript',
      toml: 'toml',
    };
    return map[ext] ?? ext;
  }

  private _severityToString(severity: vscode.DiagnosticSeverity): DiagnosticEntry['severity'] {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return 'error';
      case vscode.DiagnosticSeverity.Warning:
        return 'warning';
      case vscode.DiagnosticSeverity.Information:
        return 'info';
      case vscode.DiagnosticSeverity.Hint:
        return 'hint';
      default:
        return 'info';
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: ContextBuilder | undefined;

export function getContextBuilder(): ContextBuilder {
  if (_instance === undefined) {
    _instance = new ContextBuilder();
  }
  return _instance;
}
