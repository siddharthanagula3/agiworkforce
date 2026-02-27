/**
 * Clipboard utility with graceful fallback.
 * Prefers expo-clipboard if installed, otherwise falls back to
 * the native Share API as a last resort.
 */

let clipboardModule: { setStringAsync: (text: string) => Promise<void> } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  clipboardModule = require('expo-clipboard');
} catch {
  // expo-clipboard not installed — will fall back
}

/**
 * Copy text to the system clipboard.
 * Returns true on success, false if clipboard is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try expo-clipboard first
  if (clipboardModule?.setStringAsync) {
    try {
      await clipboardModule.setStringAsync(text);
      return true;
    } catch {
      // Fall through
    }
  }

  // Fallback: use the deprecated RN Clipboard if somehow available
  try {
    const { Clipboard } = require('react-native');
    if (Clipboard?.setString) {
      Clipboard.setString(text);
      return true;
    }
  } catch {
    // Not available
  }

  return false;
}
