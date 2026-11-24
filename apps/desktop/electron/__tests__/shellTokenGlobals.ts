import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readShellTokens } from '../shellTokens.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export const shellTokens = readShellTokens(repoRoot);
export const shellSymbolUrl = `data:image/png;base64,${readFileSync(
  path.join(repoRoot, 'apps/web/public/agi-symbol.png'),
).toString('base64')}`;

/** The build define supplies the inks to the bundle; a test run supplies them here. */
export function defineShellInkGlobals(): void {
  Object.assign(globalThis, {
    AGI_SHELL_SYMBOL_URL: shellSymbolUrl,
    AGI_PAGE_INK_LIGHT: shellTokens.pageInkLight,
    AGI_PAGE_INK_DARK: shellTokens.pageInkDark,
    AGI_PAGE_SECONDARY_INK_LIGHT: shellTokens.pageSecondaryInkLight,
    AGI_PAGE_SECONDARY_INK_DARK: shellTokens.pageSecondaryInkDark,
  });
}
