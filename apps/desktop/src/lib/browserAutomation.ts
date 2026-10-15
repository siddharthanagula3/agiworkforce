import { invoke } from '@tauri-apps/api/core';

export interface BrowserStatus {
  available: boolean;
  error: string | null;
}

export class BrowserAutomation {
  static async init(): Promise<void> {
    return invoke('browser_init');
  }

  static async checkStatus(): Promise<BrowserStatus> {
    return invoke('browser_check_status');
  }

  static async launch(
    browserType: string = 'chromium',
    headless: boolean = false,
  ): Promise<string> {
    return invoke('browser_launch', { browserType, headless });
  }

  static async close(browserId: string): Promise<void> {
    return invoke('browser_close', { browserId });
  }

  static async openTab(url?: string): Promise<string> {
    return invoke('browser_open_tab', { url });
  }

  static async navigate(tabId: string | undefined, url: string): Promise<void> {
    if (!url || !url.trim()) {
      throw new Error('URL cannot be empty');
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Only HTTP(S) URLs are allowed, got: ${parsed.protocol}`);
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid URL: ${url}`);
      }
      throw error;
    }
    return invoke('browser_navigate', { tabId, url });
  }

  static async goBack(tabId?: string): Promise<void> {
    return invoke('browser_go_back', { tabId });
  }

  static async goForward(tabId?: string): Promise<void> {
    return invoke('browser_go_forward', { tabId });
  }

  static async reload(tabId?: string): Promise<void> {
    return invoke('browser_reload', { tabId });
  }

  static async getUrl(tabId?: string): Promise<string> {
    return invoke('browser_get_url', { tabId });
  }

  static async getTitle(tabId?: string): Promise<string> {
    return invoke('browser_get_title', { tabId });
  }

  static async getScreenshotStream(tabId?: string): Promise<string> {
    return invoke('browser_get_screenshot_stream', { tabId });
  }
}
