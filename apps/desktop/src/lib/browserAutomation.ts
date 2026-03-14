import { invoke } from '@tauri-apps/api/core';

export interface BrowserOptions {
  headless: boolean;
  args?: string[];
}

export interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  favicon?: string | null;
  created_at?: number;
}

export interface BrowserFrame {
  frame_id: string;
  parent_frame_id?: string | null;
  name: string;
  url: string;
}

export interface ElementInfo {
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface ElementState {
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  focused: boolean;
  interactive: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface FormField {
  selector: string;
  fieldType: 'text' | 'email' | 'password' | 'checkbox' | 'radio' | 'select' | 'textarea';
  value: string;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
}

export interface PerformanceMetrics {
  navigationStart: number;
  loadComplete: number;
  domContentLoaded: number;
  firstPaint: number;
  firstContentfulPaint: number;
  memoryUsage: number;
}

export type BrowserFormData = Record<string, string | number | boolean>;

export class BrowserAutomation {
  static async init(): Promise<void> {
    return invoke('browser_init');
  }

  static async launch(
    browserType: string = 'chromium',
    headless: boolean = false,
    profileName?: string,
    proxy?: string,
  ): Promise<string> {
    return invoke('browser_launch', { browserType, headless, profileName, proxy });
  }

  static async openTab(url: string): Promise<string> {
    return invoke('browser_open_tab', { url });
  }

  static async closeTab(tabId: string): Promise<void> {
    return invoke('browser_close_tab', { tabId });
  }

  static async listTabs(): Promise<Tab[]> {
    return invoke('browser_list_tabs');
  }

  static async navigate(tabId: string, url: string): Promise<void> {
    return invoke('browser_navigate', { tabId, url });
  }

  static async goBack(tabId: string): Promise<void> {
    return invoke('browser_go_back', { tabId });
  }

  static async goForward(tabId: string): Promise<void> {
    return invoke('browser_go_forward', { tabId });
  }

  static async reload(tabId: string): Promise<void> {
    return invoke('browser_reload', { tabId });
  }

  static async getUrl(tabId: string): Promise<string> {
    return invoke('browser_get_url', { tabId });
  }

  static async getTitle(tabId: string): Promise<string> {
    return invoke('browser_get_title', { tabId });
  }

  static async click(tabId: string, selector: string): Promise<void> {
    return invoke('browser_click', { tabId, selector });
  }

  static async type(tabId: string, selector: string, text: string): Promise<void> {
    return invoke('browser_type', { tabId, selector, text });
  }

  static async getText(tabId: string, selector: string): Promise<string> {
    return invoke('browser_get_text', { tabId, selector });
  }

  static async getAttribute(
    tabId: string,
    selector: string,
    attribute: string,
  ): Promise<string | null> {
    return invoke('browser_get_attribute', { tabId, selector, attribute });
  }

  static async waitForSelector(
    tabId: string,
    selector: string,
    timeoutMs: number = 30000,
  ): Promise<void> {
    return invoke('browser_wait_for_selector', { tabId, selector, timeout: timeoutMs });
  }

  static async selectOption(tabId: string, selector: string, value: string): Promise<void> {
    return invoke('browser_select_option', { tabId, selector, value });
  }

  static async check(tabId: string, selector: string): Promise<void> {
    return invoke('browser_check', { tabId, selector });
  }

  static async uncheck(tabId: string, selector: string): Promise<void> {
    return invoke('browser_uncheck', { tabId, selector });
  }

  static async screenshot(tabId: string, selector?: string): Promise<string> {
    return invoke('browser_screenshot', { tabId, selector });
  }

  static async evaluate(tabId: string, script: string): Promise<unknown> {
    return invoke('browser_evaluate', { tabId, script });
  }

  static async executeAsyncJs(tabId: string, script: string): Promise<unknown> {
    return invoke('browser_execute_async_js', { tabId, script });
  }

  static async getElementState(tabId: string, selector: string): Promise<ElementState> {
    return invoke('browser_get_element_state', { tabId, selector });
  }

  static async waitForInteractive(
    tabId: string,
    selector: string,
    timeoutMs: number = 30000,
  ): Promise<void> {
    return invoke('browser_wait_for_interactive', { tabId, selector, timeoutMs });
  }

  static async fillForm(tabId: string, selector: string, data: BrowserFormData): Promise<void> {
    return invoke('browser_fill_form', { tabId, selector, data });
  }

  static async dragAndDrop(
    tabId: string,
    source: string,
    target: string,
  ): Promise<void> {
    return invoke('browser_drag_and_drop', { tabId, source, target });
  }

  static async uploadFile(tabId: string, selector: string, filePath: string): Promise<void> {
    return invoke('browser_upload_file', { tabId, selector, paths: [filePath] });
  }

  static async getCookies(tabId: string): Promise<Cookie[]> {
    return invoke('browser_get_cookies', { tabId });
  }

  static async setCookie(tabId: string, cookie: Cookie): Promise<void> {
    return invoke('browser_set_cookie', { tabId, cookie });
  }

  static async clearCookies(tabId: string): Promise<void> {
    return invoke('browser_clear_cookies', { tabId });
  }

  static async getPerformanceMetrics(tabId: string): Promise<PerformanceMetrics> {
    return invoke('browser_get_performance_metrics', { tabId });
  }

  static async findElementSemantic(tabId: string, query: string): Promise<string> {
    return invoke('find_element_semantic', { tabId, query });
  }

  static async findAllElementsSemantic(tabId: string, query: string): Promise<string[]> {
    return invoke('find_all_elements_semantic', { tabId, query });
  }

  static async clickSemantic(tabId: string, query: string): Promise<void> {
    return invoke('click_semantic', { tabId, query });
  }

  static async typeSemantic(tabId: string, query: string, text: string): Promise<void> {
    return invoke('type_semantic', { tabId, query, text });
  }

  static async getAccessibilityTree(tabId: string): Promise<unknown> {
    return invoke('get_accessibility_tree', { tabId });
  }

  static async getFrames(tabId: string): Promise<BrowserFrame[]> {
    return invoke('browser_get_frames', { tabId });
  }

  static async executeInFrame(tabId: string, frameId: string, script: string): Promise<unknown> {
    return invoke('browser_execute_in_frame', { tabId, frameId, script });
  }

  static async callFunction(
    tabId: string,
    functionName: string,
    args: unknown[] = [],
  ): Promise<unknown> {
    return invoke('browser_call_function', { tabId, functionName, args });
  }
}
