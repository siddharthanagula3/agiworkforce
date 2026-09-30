import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getActiveWorkspaceFolderSync } from '../platform/workspaceFolders';
import { redactTelemetryText } from '../core/telemetry';

const execFileAsync = promisify(execFile);

const MAX_GIT_DIFF_CHARS = 2000;
const MAX_SELECTION_CHARS = 3000;
const MAX_DIAGNOSTICS = 20;

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

export class ContextBuilder {
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

  getOpenFilesContext(): OpenFileEntry[] {
    try {
      const entries: OpenFileEntry[] = [];
      const activeUri = vscode.window.activeTextEditor?.document.uri.toString();

      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const input = tab.input;
          if (input instanceof vscode.TabInputText) {
            const uri = input.uri;
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

  async getGitContext(): Promise<string> {
    try {
      const workspaceRoot = getActiveWorkspaceFolderSync()?.uri.fsPath;
      if (workspaceRoot === undefined) return '';

      const execOpts = { cwd: workspaceRoot, timeout: 5000 };

      let statusOutput = '';
      try {
        const result = await execFileAsync('git', ['status', '--porcelain'], execOpts);
        statusOutput = result.stdout.trim();
      } catch {
        return '';
      }

      let diffOutput = '';
      try {
        const result = await execFileAsync('git', ['diff', '--stat'], execOpts);
        diffOutput = result.stdout.trim();
      } catch (err) {
        void err;
      }

      if (statusOutput === '' && diffOutput === '') {
        return 'Git: clean working tree, no changes.';
      }

      const parts: string[] = ['Git status:'];

      if (statusOutput !== '') {
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
        parts.push(`\nDiff summary:\n${redactTelemetryText(truncatedDiff)}`);
      }

      return parts.join('\n');
    } catch {
      return '';
    }
  }

  getDiagnosticsContext(): DiagnosticEntry[] {
    try {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) return [];

      const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri);
      if (allDiagnostics.length === 0) return [];

      const diagnostics = allDiagnostics
        .filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning)
        .slice(0, MAX_DIAGNOSTICS);
      if (diagnostics.length === 0) return [];

      return diagnostics.map((d) => ({
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
      zsh: 'shellscript',
      toml: 'toml',
      xml: 'xml',
      svg: 'xml',
      vue: 'vue',
      svelte: 'svelte',
      mts: 'typescript',
      cts: 'typescript',
      mjs: 'javascript',
      cjs: 'javascript',
      hpp: 'cpp',
      hxx: 'cpp',
      scala: 'scala',
      groovy: 'groovy',
      lua: 'lua',
      r: 'r',
      dart: 'dart',
      zig: 'zig',
      tf: 'terraform',
      dockerfile: 'dockerfile',
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

let _instance: ContextBuilder | undefined;

export function getContextBuilder(): ContextBuilder {
  if (_instance === undefined) {
    _instance = new ContextBuilder();
  }
  return _instance;
}
