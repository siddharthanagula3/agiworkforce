import * as vscode from 'vscode';
import {
  describePathReference,
  findPathReferences,
  type PathReference,
} from '../../utils/pathReferences';
import { safeResolveWorkspacePath } from '../../utils/pathSafety';

export const OPEN_PATH_REFERENCE_COMMAND = 'agi-workforce.openPathReference';

const MAX_DOCUMENT_LINKS = 500;
const MAX_DOCUMENT_CHARS = 400_000;

export interface PathReferenceTarget {
  path: string;
  line?: number;
  column?: number;
}

export function parsePathReferenceTarget(raw: unknown): PathReferenceTarget | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const candidate = raw as Record<string, unknown>;
  const path = candidate['path'];
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) return undefined;
  const line = candidate['line'];
  const column = candidate['column'];
  return {
    path,
    ...(typeof line === 'number' && Number.isInteger(line) && line > 0 ? { line } : {}),
    ...(typeof column === 'number' && Number.isInteger(column) && column > 0 ? { column } : {}),
  };
}

export async function resolvePathReferenceUri(
  target: PathReferenceTarget,
): Promise<vscode.Uri | undefined> {
  const resolved = await safeResolveWorkspacePath(target.path, { allowAbsolute: true });
  if (!resolved.ok) return undefined;
  try {
    const stat = await vscode.workspace.fs.stat(resolved.uri);
    if ((stat.type & vscode.FileType.File) === 0) return undefined;
  } catch {
    return undefined;
  }
  return resolved.uri;
}

export function pathReferenceCommandUri(target: PathReferenceTarget): vscode.Uri {
  const args = encodeURIComponent(JSON.stringify([target]));
  return vscode.Uri.parse(`command:${OPEN_PATH_REFERENCE_COMMAND}?${args}`);
}

export async function openPathReference(raw: unknown): Promise<boolean> {
  const target = parsePathReferenceTarget(raw);
  if (target === undefined) return false;
  const uri = await resolvePathReferenceUri(target);
  if (uri === undefined) {
    void vscode.window.showWarningMessage(
      `AGI Workforce: ${target.path} is not a readable file inside this workspace.`,
    );
    return false;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  const line = Math.min(Math.max((target.line ?? 1) - 1, 0), Math.max(document.lineCount - 1, 0));
  const maxColumn = document.lineAt(line).text.length;
  const column = Math.min(Math.max((target.column ?? 1) - 1, 0), maxColumn);
  const position = new vscode.Position(line, column);
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
  return true;
}

interface AgiTerminalLink extends vscode.TerminalLink {
  target: PathReferenceTarget;
}

function toTarget(reference: PathReference): PathReferenceTarget {
  return {
    path: reference.path,
    ...(reference.line === undefined ? {} : { line: reference.line }),
    ...(reference.column === undefined ? {} : { column: reference.column }),
  };
}

export class AgiTerminalLinkProvider implements vscode.TerminalLinkProvider<AgiTerminalLink> {
  async provideTerminalLinks(context: vscode.TerminalLinkContext): Promise<AgiTerminalLink[]> {
    const links: AgiTerminalLink[] = [];
    for (const reference of findPathReferences(context.line)) {
      const target = toTarget(reference);
      if ((await resolvePathReferenceUri(target)) === undefined) continue;
      links.push({
        startIndex: reference.start,
        length: reference.length,
        tooltip: `Open ${describePathReference(reference)}`,
        target,
      });
    }
    return links;
  }

  async handleTerminalLink(link: AgiTerminalLink): Promise<void> {
    await openPathReference(link.target);
  }
}

export class AgiDocumentLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentLink[]> {
    const text = document.getText();
    if (text.length > MAX_DOCUMENT_CHARS) return [];
    const links: vscode.DocumentLink[] = [];
    const resolutions = new Map<string, Promise<vscode.Uri | undefined>>();
    for (const reference of findPathReferences(text, MAX_DOCUMENT_LINKS)) {
      if (token.isCancellationRequested) return links;
      const target = toTarget(reference);
      let resolution = resolutions.get(reference.path);
      if (resolution === undefined) {
        resolution = resolvePathReferenceUri({ path: reference.path });
        resolutions.set(reference.path, resolution);
      }
      if ((await resolution) === undefined) continue;
      const range = new vscode.Range(
        document.positionAt(reference.start),
        document.positionAt(reference.start + reference.length),
      );
      const link = new vscode.DocumentLink(range, pathReferenceCommandUri(target));
      link.tooltip = `Open ${describePathReference(reference)}`;
      links.push(link);
    }
    return links;
  }
}

export function registerPathLinks(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(new AgiTerminalLinkProvider()),
    vscode.languages.registerDocumentLinkProvider(
      { scheme: 'file' },
      new AgiDocumentLinkProvider(),
    ),
  );
}
