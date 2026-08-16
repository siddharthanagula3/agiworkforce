
import { toast } from 'sonner';

export interface CopyToClipboardOptions {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
  errorMessage?: string;
}

/**
 * Copy text to clipboard with proper error handling and fallback
 *
 * @param text - Text to copy to clipboard
 * @param options - Optional configuration
 * @returns Promise<boolean> - true if copy succeeded, false otherwise
 *
 * @example
 * ```ts
 * // Basic usage
 * const success = await copyToClipboard('Hello World');
 *
 * // With custom messages
 * await copyToClipboard(code, {
 *   successMessage: 'Code copied!',
 *   errorMessage: 'Failed to copy code',
 * });
 *
 * // Silent copy (no toasts)
 * await copyToClipboard(text, { showSuccessToast: false, showErrorToast: false });
 * ```
 */
export async function copyToClipboard(
  text: string,
  options: CopyToClipboardOptions = {},
): Promise<boolean> {
  const {
    showSuccessToast = true,
    showErrorToast = true,
    successMessage = 'Copied to clipboard',
    errorMessage = 'Failed to copy to clipboard',
  } = options;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      if (showSuccessToast) {
        toast.success(successMessage);
      }
      return true;
    } catch (err) {
      console.warn('[Clipboard] Modern API failed, trying fallback:', err);
      // Fall through to fallback
    }
  }

  try {
    const success = fallbackCopyToClipboard(text);
    if (success) {
      if (showSuccessToast) {
        toast.success(successMessage);
      }
      return true;
    } else {
      throw new Error('execCommand returned false');
    }
  } catch (err) {
    console.error('[Clipboard] All copy methods failed:', err);
    if (showErrorToast) {
      toast.error(errorMessage);
    }
    return false;
  }
}

function fallbackCopyToClipboard(text: string): boolean {
  const textarea = document.createElement('textarea');

  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  textarea.style.zIndex = '-1';

  textarea.value = text;
  textarea.setAttribute('readonly', '');

  document.body.appendChild(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const success = document.execCommand('copy');
    return success;
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Read text from clipboard
 *
 * @returns Promise<string | null> - Clipboard text or null if failed
 */
export async function readFromClipboard(): Promise<string | null> {
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      console.warn('[Clipboard] Failed to read from clipboard:', err);
      return null;
    }
  }

  console.warn('[Clipboard] Clipboard read not supported in this context');
  return null;
}

export function isClipboardSupported(): boolean {
  return Boolean(
    (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') ||
    typeof document.execCommand === 'function',
  );
}
