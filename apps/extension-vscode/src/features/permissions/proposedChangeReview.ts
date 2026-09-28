import * as path from 'node:path';
import * as vscode from 'vscode';

const SCHEME = 'agi-proposed';

interface StoredFile {
  data: Uint8Array;
  mtime: number;
}

class ProposedChangeFileSystem implements vscode.FileSystemProvider {
  private readonly files = new Map<string, StoredFile>();
  private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.changed.event;

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const file = this.files.get(uri.toString());
    if (file === undefined) throw vscode.FileSystemError.FileNotFound(uri);
    return {
      type: vscode.FileType.File,
      ctime: file.mtime,
      mtime: file.mtime,
      size: file.data.byteLength,
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {}

  readFile(uri: vscode.Uri): Uint8Array {
    const file = this.files.get(uri.toString());
    if (file === undefined) throw vscode.FileSystemError.FileNotFound(uri);
    return file.data;
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    this.files.set(uri.toString(), { data: content, mtime: Date.now() });
    this.changed.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  delete(uri: vscode.Uri): void {
    this.files.delete(uri.toString());
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions('Proposed changes cannot be renamed.');
  }

  text(uri: vscode.Uri): string | undefined {
    const file = this.files.get(uri.toString());
    return file === undefined ? undefined : new TextDecoder().decode(file.data);
  }
}

interface OpenReview {
  proposedUri: vscode.Uri;
  originalUri: vscode.Uri;
  proposed: string;
}

const fileSystem = new ProposedChangeFileSystem();
const reviews = new Map<string, OpenReview>();

export function registerProposedChangeReview(): vscode.Disposable {
  return vscode.workspace.registerFileSystemProvider(SCHEME, fileSystem, { isCaseSensitive: true });
}

function reviewUri(requestId: string, side: 'proposed' | 'original', name: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: SCHEME,
    path: `/${encodeURIComponent(requestId)}/${side}/${name}`,
  });
}

async function existingFile(uri: vscode.Uri): Promise<boolean> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.File;
  } catch {
    return false;
  }
}

export async function openProposedChange(
  requestId: string,
  filePath: string,
  proposed: string,
): Promise<void> {
  const name = path.basename(filePath);
  const existing = reviews.get(requestId);
  const proposedUri = existing?.proposedUri ?? reviewUri(requestId, 'proposed', name);
  let originalUri = existing?.originalUri ?? vscode.Uri.file(filePath);
  if (existing === undefined) {
    fileSystem.writeFile(proposedUri, new TextEncoder().encode(proposed));
    if (!(await existingFile(originalUri))) {
      originalUri = reviewUri(requestId, 'original', name);
      fileSystem.writeFile(originalUri, new Uint8Array());
    }
    reviews.set(requestId, { proposedUri, originalUri, proposed });
  }
  await vscode.commands.executeCommand(
    'vscode.diff',
    originalUri,
    proposedUri,
    `${name}: proposed change, edit it to change what is written`,
    { preview: false },
  );
}

async function closeReviewTabs(review: OpenReview): Promise<void> {
  const target = review.proposedUri.toString();
  const tabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputTextDiff && tab.input.modified.toString() === target,
    );
  if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
}

async function endReview(requestId: string): Promise<string | undefined> {
  const review = reviews.get(requestId);
  if (review === undefined) return undefined;
  reviews.delete(requestId);
  const document = vscode.workspace.textDocuments.find(
    (candidate) => candidate.uri.toString() === review.proposedUri.toString(),
  );
  const text = document?.getText() ?? fileSystem.text(review.proposedUri) ?? review.proposed;
  if (document?.isDirty === true) await document.save();
  await closeReviewTabs(review);
  fileSystem.delete(review.proposedUri);
  if (review.originalUri.scheme === SCHEME) fileSystem.delete(review.originalUri);
  return text;
}

export async function finishProposedChange(requestId: string): Promise<string | undefined> {
  const proposed = reviews.get(requestId)?.proposed;
  const text = await endReview(requestId);
  return text === undefined || text === proposed ? undefined : text;
}

export async function discardProposedChange(requestId: string): Promise<void> {
  await endReview(requestId);
}
