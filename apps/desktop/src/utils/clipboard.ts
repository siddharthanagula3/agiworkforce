/**
 * CHT-006 fix: Clipboard utilities with proper error handling and fallback
 *
 * Provides cross-browser clipboard functionality with:
 * - Modern Clipboard API when available
 * - Fallback to document.execCommand for older browsers/restricted contexts
 * - User-visible error messages via toast
 * - Promise-based API for async/await usage
 */

import { toast } from 'sonner';

export interface CopyToClipboardOptions {
  /** Show success toast on copy (default: true) */
  showSuccessToast?: boolean;
  /** Show error toast on failure (default: true) */
  showErrorToast?: boolean;
  /** Custom success message */
  successMessage?: string;
  /** Custom error message */
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

  // Try modern Clipboard API first
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      if (showSuccessToast) {
        toast.success(successMessage);
      }
      return true;
    } catch (err) {
      // Clipboard API failed (e.g., permissions denied, insecure context)
      console.warn('[Clipboard] Modern API failed, trying fallback:', err);
      // Fall through to fallback
    }
  }

  // Fallback: Create a temporary textarea and use execCommand
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

/**
 * Fallback copy using document.execCommand (for older browsers/restricted contexts)
 */
function fallbackCopyToClipboard(text: string): boolean {
  const textarea = document.createElement('textarea');

  // Style to make it invisible but still functional
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  // Prevent scrolling to the element
  textarea.style.zIndex = '-1';

  // Set the text
  textarea.value = text;
  textarea.setAttribute('readonly', ''); // Prevent keyboard from showing on mobile

  document.body.appendChild(textarea);

  try {
    // Select the text
    textarea.select();
    textarea.setSelectionRange(0, text.length); // For mobile devices

    // Execute the copy command
    const success = document.execCommand('copy');
    return success;
  } finally {
    // Always clean up
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

  // No fallback for reading - clipboard read requires user permission
  console.warn('[Clipboard] Clipboard read not supported in this context');
  return null;
}

/**
 * Check if clipboard operations are supported
 */
export function isClipboardSupported(): boolean {
  return Boolean(
    (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') ||
    typeof document.execCommand === 'function',
  );
}
