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

export function safeNavigate(url: string): void {
  if (isBrowser) {
    window.location.href = url;
  }
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
