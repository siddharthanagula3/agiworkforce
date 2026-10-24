import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readShellTokens } from '../shellTokens.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export const shellTokens = readShellTokens(repoRoot);

/** The build define supplies the inks to the bundle; a test run supplies them here. */
export function defineShellInkGlobals(): void {
  Object.assign(globalThis, {
    AGI_PAGE_INK_LIGHT: shellTokens.pageInkLight,
    AGI_PAGE_INK_DARK: shellTokens.pageInkDark,
    AGI_PAGE_SECONDARY_INK_LIGHT: shellTokens.pageSecondaryInkLight,
    AGI_PAGE_SECONDARY_INK_DARK: shellTokens.pageSecondaryInkDark,
  });
}
