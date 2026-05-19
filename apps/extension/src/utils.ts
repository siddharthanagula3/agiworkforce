import type { RateLimitState } from './types';

export const logger = {
  debug: (message: string, data?: unknown) => {
    console.debug('[AGI Workforce] %s', message, data);
  },
  info: (message: string, data?: unknown) => {
    // eslint-disable-next-line no-console
    console.info('[AGI Workforce] %s', message, data);
  },
  warn: (message: string, data?: unknown) => {
    console.warn('[AGI Workforce] %s', message, data);
  },
  error: (message: string, error?: unknown) => {
    console.error('[AGI Workforce] %s', message, error);
  },
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 30000): Promise<T> {
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
      // L-02 audit 2026-05-19: use requestSubmit() so framework-level
      // onSubmit handlers (CSRF-token injection, validation hooks) fire.
      // Bare `form.submit()` bypasses them entirely.
      const target = form ?? this.getForms()[0] ?? null;
      if (target) {
        if (typeof target.requestSubmit === 'function') {
          target.requestSubmit();
        } else {
          // Very old browsers — fall back to submit(). MV3 min Chrome 132
          // supports requestSubmit, so this should never trigger in prod.
          target.submit();
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
      const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
      return localHosts.has(parsed.hostname);
    } catch {
      return false;
    }
  },

  isValidSelector(selector: string): boolean {
    // SECURITY (M-11 audit 2026-05-19): validate selector SYNTAX only, never
    // execute it. The previous implementation called `document.querySelector`
    // just to check parseability — but querySelector runs the selector
    // against the entire DOM, which a malicious page or LLM-supplied selector
    // can use as a DoS vector (e.g. `* * * * * * * *` on a deep tree).
    //
    // We do a conservative character-class check and a length cap. The cost
    // is a few legitimate edge-case selectors (e.g. exotic attribute
    // selectors with rare characters), traded for bounded validation cost.
    if (typeof selector !== 'string' || selector.length === 0 || selector.length > 2048) {
      return false;
    }
    // Disallow expression-injection metacharacters that should never appear
    // in a CSS selector but show up in eval-shaped strings.
    if (/[;{}`]/.test(selector)) return false;
    // Accept characters that legitimately appear in CSS selectors. This is
    // intentionally narrower than the full CSS grammar — false-rejects are
    // preferable to false-accepts here.
    return /^[\w\-#.[\]"'=:()*\s>+~\\,^$|@]+$/.test(selector);
  },

  sanitizeInput(input: string): string {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  },
};
