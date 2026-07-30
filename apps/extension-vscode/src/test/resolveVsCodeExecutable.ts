import * as fs from 'fs';
import * as path from 'path';

type FileExists = (candidate: string) => boolean;

/**
 * VS Code 1.131 renamed the macOS app executable from `Electron` to `Code`,
 * while @vscode/test-electron 2.5.2 still resolves the legacy basename.
 * Accept the package result when it exists and otherwise try only the two
 * product-owned macOS basenames in the same verified app bundle.
 */
export function resolveVsCodeExecutablePath(
  downloadedPath: string,
  platform: NodeJS.Platform = process.platform,
  fileExists: FileExists = fs.existsSync,
): string {
  if (fileExists(downloadedPath)) return downloadedPath;

  if (platform === 'darwin' && path.basename(downloadedPath) === 'Electron') {
    const executableDirectory = path.dirname(downloadedPath);
    for (const basename of ['Code', 'Code - Insiders']) {
      const candidate = path.join(executableDirectory, basename);
      if (fileExists(candidate)) return candidate;
    }
  }

  throw new Error(`Downloaded VS Code executable was not found at ${downloadedPath}`);
}
