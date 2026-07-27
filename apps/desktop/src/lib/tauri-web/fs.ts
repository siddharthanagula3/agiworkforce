function resolveFilename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || 'download.txt';
}

function downloadText(path: string, content: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = resolveFilename(path);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exists(): Promise<boolean> {
  return false;
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  downloadText(path, content);
}

export async function readTextFile(): Promise<string> {
  throw new Error('Reading local files requires the desktop application');
}

/**
 * Binary read. Rejects for the same reason `readTextFile` does — the browser
 * has no access to an arbitrary local path.
 *
 * This export was missing while `features/context-handoff/readFolderFiles.ts`
 * imported it, and because the module is aliased in place of
 * `@tauri-apps/plugin-fs`, the absent binding was a *module-level* failure:
 * Vite threw "does not provide an export named 'readFile'" before any component
 * rendered, so Desktop Local mode in the browser dev target died at the error
 * boundary with "Chat interface encountered an error". Throwing here degrades
 * one call instead of the whole shell.
 */
export async function readFile(_path: string): Promise<Uint8Array> {
  throw new Error('Reading local files requires the desktop application');
}

/**
 * Web has no persistent filesystem, so directory creation is a no-op. Artifact
 * writes degrade to a browser download in writeTextFile(), which needs no dir.
 */
export async function mkdir(
  _path: string,
  _options?: { recursive?: boolean; mode?: number },
): Promise<void> {
  // Intentionally empty: nothing to create in the browser sandbox.
}
