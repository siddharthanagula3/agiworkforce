import { shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ApplicationOpenResult, WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { PathRefused, resolveWithinRoot } from './pathGuard';

/**
 * Extensions the operating system runs rather than opens.
 *
 * Handing one of these to the default handler starts a program, which is what
 * `shell.execute` exists to gate. Revealing it in the file manager is the
 * answer offered instead, so the capability cannot be reached sideways.
 */
const EXECUTABLE_EXTENSIONS = new Set([
  '.app',
  '.bat',
  '.bin',
  '.cmd',
  '.command',
  '.dmg',
  '.exe',
  '.jar',
  '.msi',
  '.pkg',
  '.ps1',
  '.scpt',
  '.sh',
  '.term',
  '.tool',
  '.workflow',
]);

const EXECUTABLE_MODE_BITS = 0o111;

async function assertOpenable(absolute: string): Promise<void> {
  if (EXECUTABLE_EXTENSIONS.has(path.extname(absolute).toLowerCase())) {
    throw new PathRefused(
      'denied-file',
      `${path.basename(absolute)} is a program. Reveal it in Finder and start it yourself, or approve a local command instead.`,
    );
  }
  const stat = await fs.stat(absolute);
  if (stat.isFile() && (stat.mode & EXECUTABLE_MODE_BITS) !== 0) {
    throw new PathRefused(
      'denied-file',
      `${path.basename(absolute)} is executable. Reveal it in Finder and start it yourself, or approve a local command instead.`,
    );
  }
}

export async function openWithDefaultApplication(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<ApplicationOpenResult> {
  const resolved = await resolveWithinRoot(root, relativePath);
  await assertOpenable(resolved.absolute);
  const failure = await shell.openPath(resolved.absolute);
  if (failure) throw new PathRefused('io-error', failure);
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
