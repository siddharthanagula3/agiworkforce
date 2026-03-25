/**
 * version.ts — Shared extension version constant
 *
 * Reads the version from the extension's package.json at runtime via the
 * VS Code extensions API. Falls back to the hard-coded version if the
 * extension cannot be resolved (e.g. during tests).
 */

import * as vscode from 'vscode';

const EXTENSION_ID = 'agiworkforce.agi-workforce';
const FALLBACK_VERSION = '0.3.0';

/**
 * Returns the current extension version string.
 */
export function getExtensionVersion(): string {
  return (
    vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version ?? FALLBACK_VERSION
  );
}
