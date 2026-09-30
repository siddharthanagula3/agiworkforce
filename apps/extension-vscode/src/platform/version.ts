import * as vscode from 'vscode';

export const EXTENSION_ID = 'agiworkforce.agi-workforce';
const FALLBACK_VERSION = '0.0.1';

export function getExtensionVersion(): string {
  return vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version ?? FALLBACK_VERSION;
}

export function getExtensionUserAgent(): string {
  return `agi-workforce-vscode/${getExtensionVersion()}`;
}
