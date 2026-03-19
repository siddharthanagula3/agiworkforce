import type { ExtensionConfig, RateLimitState } from './types';

/** Default WebSocket port — must match AGI_REALTIME_PORT env var in the Rust backend (default: 8787) */
const DEFAULT_DESKTOP_PORT = 8787;

// Configuration — port can be overridden via extension settings (popup → Advanced)
export const DEFAULT_CONFIG: ExtensionConfig = {
  desktopAppPort: DEFAULT_DESKTOP_PORT,
  desktopAppUrl: `http://localhost:${DEFAULT_DESKTOP_PORT}`,
  enableLogging: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  requestTimeoutMs: 30000,
};

export async function getConfig(): Promise<ExtensionConfig> {
  try {
    const stored = await chrome.storage.local.get('config');
    return stored['config']
      ? { ...DEFAULT_CONFIG, ...(stored['config'] as Partial<ExtensionConfig>) }
      : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Partial<ExtensionConfig>): Promise<void> {
  try {
    const current = await getConfig();
    await chrome.storage.local.set({ config: { ...current, ...config } });
  } catch (error) {
    logger.error('Failed to save config', error);
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => {
    if (DEFAULT_CONFIG.enableLogging) {
      console.debug(`[AGI Workforce] ${message}`, data);
    }
  },
  info: (message: string, data?: unknown) => {
    console.info(`[AGI Workforce] ${message}`, data);
  },
  warn: (message: string, data?: unknown) => {
    console.warn(`[AGI Workforce] ${message}`, data);
  },
  error: (message: string, error?: unknown) => {
    console.error(`[AGI Workforce] ${message}`, error);
  },
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_CONFIG.maxRetries,
  delayMs: number = DEFAULT_CONFIG.retryDelayMs,
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = delayMs * Math.pow(2, i);
        logger.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms`, error);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_CONFIG.requestTimeoutMs,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export class RateLimiter {
  private state: Map<string, RateLimitState> = new Map();
  private readonly maxRequestsPerMinute: number;
  private readonly screenshotCooldownMs: number;

  constructor(maxRequestsPerMinute: number = 120, screenshotCooldownMs: number = 500) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.screenshotCooldownMs = screenshotCooldownMs;
  }

  isLimited(tabId: number, messageType: string): boolean {
    const now = Date.now();
    const key = `${tabId}:${messageType}`;

    if (!this.state.has(key)) {
      this.state.set(key, { count: 0, resetTime: now + 60000, lastScreenshot: 0 });
      return false;
    }

    const rateState = this.state.get(key)!;

    // Reset counter if minute has passed
    if (now > rateState.resetTime) {
      rateState.count = 0;
      rateState.resetTime = now + 60000;
    }

    // Check if over limit
    if (rateState.count >= this.maxRequestsPerMinute) {
      return true;
    }

    // Check screenshot cooldown
    if (messageType === 'CAPTURE_SCREENSHOT') {
      if (now - rateState.lastScreenshot < this.screenshotCooldownMs) {
        return true;
      }
      rateState.lastScreenshot = now;
    }

    rateState.count++;
    return false;
  }

  reset(tabId: number): void {
    const keys = Array.from(this.state.keys());
    keys.forEach((key) => {
      if (key.startsWith(`${tabId}:`)) {
        this.state.delete(key);
      }
    });
  }

  clear(): void {
    this.state.clear();
  }
}

export const domUtils = {
  querySelector(selector: string): Element | null {
    try {
      return document.querySelector(selector);
    } catch (error) {
      logger.error(`Invalid selector: ${selector}`, error);
      return null;
    }
  },

  querySelectorAll(selector: string): Element[] {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (error) {
      logger.error(`Invalid selector: ${selector}`, error);
      return [];
    }
  },

  async waitForSelector(
    selector: string,
    timeoutMs: number = 5000,
    visible: boolean = false,
  ): Promise<Element | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const element = document.querySelector(selector);

      if (element) {
        if (!visible) return element;

        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return element;
        }
      }

      await sleep(100);
    }

    return null;
  },

  safeClick(element: Element, button: 'left' | 'middle' | 'right' = 'left'): boolean {
    try {
      const mouseEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        buttons: button === 'left' ? 1 : button === 'middle' ? 4 : 2,
      });

      element.dispatchEvent(mouseEvent);

      // Also call click() for fallback
      if ('click' in element && typeof element.click === 'function') {
        (element as HTMLElement).click();
      }

      return true;
    } catch (error) {
      logger.error('Failed to click element', error);
      return false;
    }
  },

  getText(element: Element | null): string {
    if (!element) return '';
    return element.textContent ?? '';
  },

  getElementRect(element: Element | null): DOMRect | null {
    if (!element) return null;
    return element.getBoundingClientRect();
  },

  scrollIntoView(element: Element): boolean {
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    } catch (error) {
      logger.error('Failed to scroll element into view', error);
      return false;
    }
  },

  isVisible(element: Element | null): boolean {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  },
};

export const formUtils = {
  getForms(): HTMLFormElement[] {
    return Array.from(document.querySelectorAll('form'));
  },

  getFormFields(
    form: HTMLFormElement | null = null,
  ): Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> {
    const context = form ?? document;
    const fields = context.querySelectorAll('input, select, textarea');
    return Array.from(fields) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  },

  fillField(
    field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    value: string,
  ): boolean {
    try {
      if (field instanceof HTMLInputElement) {
        field.value = value;

        // Trigger change event
        field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        return true;
      } else if (field instanceof HTMLSelectElement) {
        field.value = value;
        field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        return true;
      } else if (field instanceof HTMLTextAreaElement) {
        field.value = value;
        field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to fill form field', error);
      return false;
    }
  },

  submitForm(form: HTMLFormElement | null = null): boolean {
    try {
      if (form) {
        form.submit();
      } else {
        const forms = this.getForms();
        const firstForm = forms[0];
        if (firstForm) {
          firstForm.submit();
        }
      }
      return true;
    } catch (error) {
      logger.error('Failed to submit form', error);
      return false;
    }
  },
};

export const storageUtils = {
  async getItem<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const result = await chrome.storage.local.get(key);
      return (result[key] as T | undefined) ?? defaultValue;
    } catch (error) {
      logger.error(`Failed to get item: ${key}`, error);
      return defaultValue;
    }
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      logger.error(`Failed to set item: ${key}`, error);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      logger.error(`Failed to remove item: ${key}`, error);
    }
  },

  async clear(): Promise<void> {
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      logger.error('Failed to clear storage', error);
    }
  },
};

export const validators = {
  isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const unsafeProtocols = ['chrome:', 'about:', 'data:', 'javascript:', 'file:'];
      return !unsafeProtocols.some((proto) => parsed.protocol === proto);
    } catch {
      return false;
    }
  },

  isLocalUrl(url: string): boolean {
    try {
      const normalized = url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
      const parsed = new URL(normalized);
      const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
      return localHosts.has(parsed.hostname);
    } catch {
      return false;
    }
  },

  isValidSelector(selector: string): boolean {
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  },

  sanitizeInput(input: string): string {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  },
};
