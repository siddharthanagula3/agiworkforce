import type { CodeDiagnostic } from './diagnostics';
import type { CodeTerminalCapture } from './terminal';

export const CODE_SESSION_IDES = ['vscode', 'jetbrains'] as const;
export type CodeSessionIde = (typeof CODE_SESSION_IDES)[number];

export interface CodePosition {
  line: number;
  character: number;
}

export interface CodeRange {
  start: CodePosition;
  end: CodePosition;
}

/**
 * No editor URI, handle or document object crosses this boundary, which is what
 * lets a second IDE implement the same adapter without the first one's types.
 */
export interface CodeDocument {
  path: string;
  languageId: string;
  text: string;
}

export interface CodeSelection {
  document: CodeDocument;
  range: CodeRange;
  isEmpty: boolean;
  /** The selected text, or the whole document when the selection is empty. */
  text: string;
}

export interface CodeSessionIdentity {
  readonly ide: CodeSessionIde;
}

export interface CodeEditorSession extends CodeSessionIdentity {
  activeSelection(): CodeSelection | null;
}

export interface CodeDiagnosticsSession extends CodeSessionIdentity {
  publishDiagnostics(path: string, diagnostics: readonly CodeDiagnostic[]): void;
  /** Clears one file, or every file the session has published when omitted. */
  clearDiagnostics(path?: string): void;
}

export interface CodeTerminalSession extends CodeSessionIdentity {
  workspaceRoot(): string | null;
  /** The terminal's working directory, or null when the host cannot report it. */
  terminalCwd(): string | null;
  runCommand(command: string): void;
  captureTerminal(): Promise<CodeTerminalCapture | null>;
}

/** Everything a complete IDE integration provides. Hosts may implement it in parts. */
export type CodeSession = CodeEditorSession & CodeDiagnosticsSession & CodeTerminalSession;

export function positionAt(text: string, offset: number): CodePosition {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lastBreak = -1;
  for (let index = 0; index < clamped; index += 1) {
    if (text[index] === '\n') {
      line += 1;
      lastBreak = index;
    }
  }
  return { line, character: clamped - lastBreak - 1 };
}

export function offsetAt(text: string, position: CodePosition): number {
  const lines = text.split('\n');
  const line = Math.max(0, Math.min(position.line, lines.length - 1));
  let offset = 0;
  for (let index = 0; index < line; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }
  return Math.min(offset + Math.max(0, position.character), text.length);
}

export function rangeFromOffsets(text: string, start: number, end: number): CodeRange {
  return { start: positionAt(text, start), end: positionAt(text, end) };
}

export function lineRange(line: number): CodeRange {
  return {
    start: { line, character: 0 },
    end: { line, character: Number.MAX_SAFE_INTEGER },
  };
}
