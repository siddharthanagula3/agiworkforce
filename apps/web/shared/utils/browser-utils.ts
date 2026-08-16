
export const isBrowser = typeof window !== 'undefined';

export const isNode =
  typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

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

export const safeSessionStorage = {
  getItem(key: string): string | null {
    if (!isBrowser) return null;

    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.warn(`[safeSessionStorage] Failed to get item "${key}":`, error);
      return null;
    }
  },

  setItem(key: string, value: string): boolean {
    if (!isBrowser) return false;

    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`[safeSessionStorage] Failed to set item "${key}":`, error);
      return false;
    }
  },

  removeItem(key: string): boolean {
    if (!isBrowser) return false;

    try {
      sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`[safeSessionStorage] Failed to remove item "${key}":`, error);
      return false;
    }
  },
};

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

export const safeClipboard = {
  /**
   * Copy text to clipboard with fallback
   * @returns Promise that resolves to true on success
   */
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

  /**
   * Read text from clipboard (requires user permission)
   * @returns Promise that resolves to text or null on failure
   */
  async readText(): Promise<string | null> {
    if (!isBrowser) return null;

    if (navigator?.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch (error) {
        console.warn('[safeClipboard] Read failed:', error);
        return null;
      }
    }

    return null;
  },

  isAvailable(): boolean {
    return isBrowser && !!navigator?.clipboard?.writeText;
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

  isWindows(): boolean {
    if (!isBrowser) return false;

    if (navigator.userAgentData?.platform) {
      return navigator.userAgentData.platform === 'Windows';
    }

    return navigator.userAgent?.includes('Win') ?? false;
  },

  isLinux(): boolean {
    if (!isBrowser) return false;

    if (navigator.userAgentData?.platform) {
      return navigator.userAgentData.platform === 'Linux';
    }

    return navigator.userAgent?.includes('Linux') ?? false;
  },

  isIOS(): boolean {
    if (!isBrowser) return false;

    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
    );
  },

  isAndroid(): boolean {
    if (!isBrowser) return false;

    return navigator.userAgent?.includes('Android') ?? false;
  },

  isMobile(): boolean {
    return this.isIOS() || this.isAndroid();
  },

  getModifierKey(): 'Meta' | 'Control' {
    return this.isMac() ? 'Meta' : 'Control';
  },

  getModifierKeyDisplay(): '⌘' | 'Ctrl' {
    return this.isMac() ? '⌘' : 'Ctrl';
  },
};

export function safeWindow<K extends keyof Window>(key: K): Window[K] | null {
  if (!isBrowser) return null;
  return window[key] ?? null;
}

export function safeDocument<K extends keyof Document>(key: K): Document[K] | null {
  if (!isBrowser || typeof document === 'undefined') return null;
  return document[key] ?? null;
}

export function safeReload(): void {
  if (isBrowser) {
    window.location.reload();
  }
}

export function safeNavigate(url: string): void {
  if (isBrowser) {
    window.location.href = url;
  }
}

export function safeOrigin(): string {
  if (!isBrowser) return '';
  return window.location.origin;
}

declare global {
  interface Navigator {
    userAgentData?: {
      platform: string;
      mobile: boolean;
      brands: Array<{ brand: string; version: string }>;
    };
  }
}
