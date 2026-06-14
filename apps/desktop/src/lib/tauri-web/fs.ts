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
 * Web has no persistent filesystem, so directory creation is a no-op. Artifact
 * writes degrade to a browser download in writeTextFile(), which needs no dir.
 */
export async function mkdir(
  _path: string,
  _options?: { recursive?: boolean; mode?: number },
): Promise<void> {
  // Intentionally empty: nothing to create in the browser sandbox.
}
