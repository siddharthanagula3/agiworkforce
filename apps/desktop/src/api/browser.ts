import { invoke } from '../lib/tauri-mock';

export interface BrowserStatusResult {
  available: boolean;
  error: string | null;
}

export interface BrowserLaunchOptions {
  browserType?: string;
  headless?: boolean;
}

export async function browserInit(): Promise<void> {
  try {
    await invoke('browser_init');
  } catch (error) {
    throw new Error(`browser_init failed: ${error}`);
  }
}

export async function browserCheckStatus(): Promise<BrowserStatusResult> {
  try {
    return await invoke<BrowserStatusResult>('browser_check_status');
  } catch (error) {
    throw new Error(`browser_check_status failed: ${error}`);
  }
}

export async function browserLaunch(options?: BrowserLaunchOptions): Promise<string> {
  try {
    return await invoke<string>('browser_launch', {
      browserType: options?.browserType,
      headless: options?.headless,
    });
  } catch (error) {
    throw new Error(`browser_launch failed: ${error}`);
  }
}

export async function browserClose(browserId: string): Promise<void> {
  try {
    await invoke('browser_close', { browserId });
  } catch (error) {
    throw new Error(`browser_close failed: ${error}`);
  }
}

export async function browserOpenTab(url?: string): Promise<string> {
  try {
    return await invoke<string>('browser_open_tab', { url });
  } catch (error) {
    throw new Error(`browser_open_tab failed: ${error}`);
  }
}

export async function browserNavigate(url: string, tabId?: string): Promise<void> {
  try {
    await invoke('browser_navigate', { url, tabId });
  } catch (error) {
    throw new Error(`browser_navigate failed: ${error}`);
  }
}

export async function browserGoBack(tabId?: string): Promise<void> {
  try {
    await invoke('browser_go_back', { tabId });
  } catch (error) {
    throw new Error(`browser_go_back failed: ${error}`);
  }
}

export async function browserGoForward(tabId?: string): Promise<void> {
  try {
    await invoke('browser_go_forward', { tabId });
  } catch (error) {
    throw new Error(`browser_go_forward failed: ${error}`);
  }
}

export async function browserReload(tabId?: string): Promise<void> {
  try {
    await invoke('browser_reload', { tabId });
  } catch (error) {
    throw new Error(`browser_reload failed: ${error}`);
  }
}

export async function browserGetUrl(tabId?: string): Promise<string> {
  try {
    return await invoke<string>('browser_get_url', { tabId });
  } catch (error) {
    throw new Error(`browser_get_url failed: ${error}`);
  }
}

export async function browserGetTitle(tabId?: string): Promise<string> {
  try {
    return await invoke<string>('browser_get_title', { tabId });
  } catch (error) {
    throw new Error(`browser_get_title failed: ${error}`);
  }
}

export async function browserGetScreenshotStream(tabId?: string): Promise<string> {
  try {
    return await invoke<string>('browser_get_screenshot_stream', { tabId });
  } catch (error) {
    throw new Error(`browser_get_screenshot_stream failed: ${error}`);
  }
}
