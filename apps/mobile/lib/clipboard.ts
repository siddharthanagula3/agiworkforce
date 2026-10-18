import * as Clipboard from 'expo-clipboard';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch (err) {
    console.warn('[clipboard] Failed to write to clipboard:', err);
    return false;
  }
}
