let clipboardModule: { setStringAsync: (text: string) => Promise<void> } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clipboardModule = require('expo-clipboard');
} catch {
  console.warn(
    '[clipboard] expo-clipboard is not available. copyToClipboard will be a no-op. ' +
      'Install expo-clipboard: `npx expo install expo-clipboard`',
  );
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!clipboardModule?.setStringAsync) {
    console.warn('[clipboard] expo-clipboard is unavailable, clipboard write skipped.');
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
