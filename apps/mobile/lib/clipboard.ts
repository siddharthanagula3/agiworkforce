/**
 * Clipboard utility backed exclusively by expo-clipboard.
 *
 * The legacy `Clipboard` API was removed from React Native core in v0.61 and
 * is no longer available. expo-clipboard is the only supported path.
 */

let clipboardModule: { setStringAsync: (text: string) => Promise<void> } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clipboardModule = require('expo-clipboard');
} catch {
  // expo-clipboard not installed or not linked
  console.warn(
    '[clipboard] expo-clipboard is not available. copyToClipboard will be a no-op. ' +
      'Install expo-clipboard: `npx expo install expo-clipboard`',
  );
}

/**
 * Copy text to the system clipboard via expo-clipboard.
 * Returns true on success, false if expo-clipboard is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!clipboardModule?.setStringAsync) {
    console.warn('[clipboard] expo-clipboard is unavailable — clipboard write skipped.');
    return false;
  }

  try {
    await clipboardModule.setStringAsync(text);
    return true;
  } catch (err) {
    console.warn('[clipboard] Failed to write to clipboard:', err);
    return false;
  }
}
