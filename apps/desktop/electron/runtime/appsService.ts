import { shell } from 'electron';
import { promises as fs, type BigIntStats } from 'node:fs';
import path from 'node:path';
import type { ApplicationOpenResult, WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { OPEN_FILE_FOR_CHECKED_READ, openChecked } from './filesystemService';
import { PathRefused, resolveWithinRoot } from './pathGuard';

/**
 * The kinds of file the default application only shows: plain and structured
 * text, images, PDF, office documents without macros, audio and video. A
 * list of what must not be opened always misses one: `.terminal` carries a
 * command and opens in Terminal, `.webloc`, `.url` and `.fileloc` send a
 * browser or Finder somewhere, `.action` runs in Automator, and a script's
 * default application on some systems is its interpreter. Anything not named
 * here is revealed in the file manager for the user to open, which is what
 * `shell.execute` exists to gate otherwise.
 */
const INERT_DOCUMENT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.rtf',
  '.log',
  '.csv',
  '.tsv',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.heic',
  '.bmp',
  '.tif',
  '.tiff',
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.pages',
  '.numbers',
  '.odt',
  '.ods',
  '.odp',
  '.mp3',
  '.m4a',
  '.wav',
  '.aac',
  '.flac',
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
]);

const EXECUTABLE_MODE_BITS = 0o111n;

function revealInstead(absolute: string, why: string): PathRefused {
  return new PathRefused(
    'denied-file',
    `${path.basename(absolute)} ${why} Reveal it in the file manager and open it yourself.`,
  );
}

/**
 * A file opens when its type is one of the inert ones and it is not marked
 * executable. A folder opens in the file manager when its name has no
 * extension: one that has may be a bundle, which the system runs.
 */
function assertOpenable(absolute: string, stat: BigIntStats): void {
  const extension = path.extname(absolute).toLowerCase();
  if (stat.isDirectory()) {
    if (extension !== '') throw revealInstead(absolute, 'may be a bundle the system runs.');
    return;
  }
  if (!stat.isFile() || !INERT_DOCUMENT_EXTENSIONS.has(extension)) {
    throw revealInstead(
      absolute,
      `is not a kind of document ${PRODUCT_NAMES.desktop} opens for you.`,
    );
  }
  if ((stat.mode & EXECUTABLE_MODE_BITS) !== 0n) {
    throw revealInstead(absolute, 'is marked executable.');
  }
}

/**
 * The system opens by path, so the path is opened here first, without
 * following a link, and looked at: it is still the file or folder that was
 * checked, and its type is judged from what was opened. A swap after that
 * look and before the system's own open is not seen; what it could put there
 * is another file of an inert type, shown to the user and returned to nobody.
 */
export async function openWithDefaultApplication(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<ApplicationOpenResult> {
  const resolved = await resolveWithinRoot(root, relativePath);
  const { handle, stat } = await openChecked(
    resolved.absolute,
    resolved.relative,
    OPEN_FILE_FOR_CHECKED_READ,
  );
  try {
    assertOpenable(resolved.absolute, stat);
    const failure = await shell.openPath(resolved.absolute);
    if (failure) throw new PathRefused('io-error', failure);
  } finally {
    await handle.close();
  }
  return { path: resolved.relative, opened: true };
}

export async function revealInFileManager(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<ApplicationOpenResult> {
  const resolved = await resolveWithinRoot(root, relativePath);
  await fs.stat(resolved.absolute);
  shell.showItemInFolder(resolved.absolute);
  return { path: resolved.relative, opened: true };
}

export function editorFileUrl(absolute: string): string {
  const segments = absolute.split(/[\\/]+/).filter((segment) => segment !== '');
  const encoded = segments.map((segment) =>
    /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment),
  );
  return `vscode://file/${encoded.join('/')}`;
}

export async function openInEditor(root: WorkspaceRoot): Promise<ApplicationOpenResult> {
  await fs.stat(root.path);
  try {
    await shell.openExternal(editorFileUrl(root.path));
  } catch {
    throw new PathRefused(
      'io-error',
      'VS Code did not open. Install VS Code, open it once so it can register vscode:// links, then try again.',
    );
  }
  return { path: '', opened: true };
}
