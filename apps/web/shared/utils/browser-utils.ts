const isBrowser = typeof window !== 'undefined';

function legacyCopyToClipboard(text: string): boolean {
  if (!isBrowser) return false;

  const textArea = document.createElement('textarea');
  textArea.value = text;

  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (error) {
    console.warn('[safeClipboard] Legacy copy failed:', error);
  }

  document.body.removeChild(textArea);
  return success;
}

export const safeLocalStorage = {
  getItem(key: string): string | null {
    if (!isBrowser) return null;

    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`[safeLocalStorage] Failed to get item "${key}":`, error);
      return null;
    }
  },

  setItem(key: string, value: string): boolean {
    if (!isBrowser) return false;

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`[safeLocalStorage] Failed to set item "${key}":`, error);
      return false;
    }
  },

  removeItem(key: string): boolean {
    if (!isBrowser) return false;

    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`[safeLocalStorage] Failed to remove item "${key}":`, error);
      return false;
    }
  },

  clear(): boolean {
    if (!isBrowser) return false;

    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.warn('[safeLocalStorage] Failed to clear:', error);
      return false;
    }
  },

  isAvailable(): boolean {
    if (!isBrowser) return false;

    const testKey = '__storage_test__';
    try {
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (_error) {
      return false;
    }
  },
};

export const safeClipboard = {
  async writeText(text: string): Promise<boolean> {
    if (!isBrowser) return false;

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.warn('[safeClipboard] Modern API failed, trying fallback:', error);
      }
    }

    return legacyCopyToClipboard(text);
  },
};

export const safePlatform = {
  isMac(): boolean {
    if (!isBrowser) return false;

    if (navigator.userAgentData?.platform) {
      return navigator.userAgentData.platform === 'macOS';
    }

    return navigator.userAgent?.includes('Mac') ?? false;
  },
};

declare global {
  interface Navigator {
    userAgentData?: {
      platform: string;
      mobile: boolean;
      brands: Array<{ brand: string; version: string }>;
    };
  }
}
