import { invoke } from '@tauri-apps/api/core';

export interface BrowserOptions {
  headless: boolean;
  args?: string[];
}

export interface BrowserLaunchOptions {
  browserType?: string;
  headless?: boolean;
  profileName?: string;
  proxy?: string;
  args?: string[];
  userDataDir?: string;
  timeout?: number;
}

export interface BrowserStatus {
  available: boolean;
  error: string | null;
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

export interface HighlightResult {
  success: boolean;
  error?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

export type BrowserFormData = Record<string, string | number | boolean>;

export class BrowserAutomation {
  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  static async init(): Promise<void> {
    return invoke('browser_init');
  }

  static async checkStatus(): Promise<BrowserStatus> {
    return invoke('browser_check_status');
  }

  static async launch(
    browserType: string = 'chromium',
    headless: boolean = false,
    profileName?: string,
    proxy?: string,
    options?: BrowserLaunchOptions,
  ): Promise<string> {
    return invoke('browser_launch', { browserType, headless, profileName, proxy, options });
  }

  static async close(browserId: string): Promise<void> {
    return invoke('browser_close', { browserId });
  }

  // ---------------------------------------------------------------------------
  // Tab management
  // ---------------------------------------------------------------------------

  static async openTab(url?: string): Promise<string> {
    return invoke('browser_open_tab', { url });
  }

  static async closeTab(tabId?: string): Promise<void> {
    return invoke('browser_close_tab', { tabId });
  }

  static async switchTab(tabId: string): Promise<void> {
    return invoke('browser_switch_tab', { tabId });
  }

  static async listTabs(): Promise<Tab[]> {
    return invoke('browser_list_tabs');
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

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

  static async waitForNavigation(tabId?: string, timeoutMs?: number): Promise<void> {
    return invoke('browser_wait_for_navigation', { tabId, timeoutMs });
  }

  // ---------------------------------------------------------------------------
  // Page info
  // ---------------------------------------------------------------------------

  static async getUrl(tabId?: string): Promise<string> {
    return invoke('browser_get_url', { tabId });
  }

  static async getTitle(tabId?: string): Promise<string> {
    return invoke('browser_get_title', { tabId });
  }

  static async getContent(tabId?: string): Promise<string> {
    return invoke('browser_get_content', { tabId });
  }

  static async getDomSnapshot(tabId?: string): Promise<string> {
    return invoke('browser_get_dom_snapshot', { tabId });
  }

  // ---------------------------------------------------------------------------
  // DOM interaction
  // ---------------------------------------------------------------------------

  static async click(tabId: string | undefined, selector: string): Promise<void> {
    return invoke('browser_click', { tabId, selector });
  }

  static async type(tabId: string | undefined, selector: string, text: string): Promise<void> {
    return invoke('browser_type', { tabId, selector, text });
  }

  static async hover(tabId: string | undefined, selector: string): Promise<void> {
    return invoke('browser_hover', { tabId, selector });
  }

  static async focus(tabId: string | undefined, selector: string): Promise<void> {
    return invoke('browser_focus', { tabId, selector });
  }

  static async getText(tabId: string | undefined, selector: string): Promise<string> {
    return invoke('browser_get_text', { tabId, selector });
  }

  static async getAttribute(
    tabId: string | undefined,
    selector: string,
    attribute: string,
  ): Promise<string | null> {
    return invoke('browser_get_attribute', { tabId, selector, attribute });
  }

  static async queryAll(tabId: string | undefined, selector: string): Promise<string[]> {
    return invoke('browser_query_all', { tabId, selector });
  }

  static async scrollIntoView(tabId: string | undefined, selector: string): Promise<void> {
    return invoke('browser_scroll_into_view', { tabId, selector });
  }

  static async waitForSelector(
    tabId: string | undefined,
    selector: string,
    timeoutMs: number = 30000,
  ): Promise<void> {
    return invoke('browser_wait_for_selector', { tabId, selector, timeout: timeoutMs });
  }

  static async selectOption(
    tabId: string | undefined,
    selector: string,
    value: string,
  ): Promise<void> {
    return invoke('browser_select_option', { tabId, selector, value });
  }

  static async check(tabId: string | undefined, selector: string): Promise<void> {
    return invoke('browser_check', { tabId, selector });
  }

  static async uncheck(tabId: string | undefined, selector: string): Promise<void> {
    return invoke('browser_uncheck', { tabId, selector });
  }

  static async highlightElement(
    tabId: string | undefined,
    selector: string,
  ): Promise<HighlightResult> {
    return invoke('browser_highlight_element', { tabId, selector });
  }

  // ---------------------------------------------------------------------------
  // Element state
  // ---------------------------------------------------------------------------

  static async getElementState(tabId: string | undefined, selector: string): Promise<ElementState> {
    return invoke('browser_get_element_state', { tabId, selector });
  }

  static async waitForInteractive(
    tabId: string | undefined,
    selector: string,
    timeoutMs: number = 30000,
  ): Promise<void> {
    return invoke('browser_wait_for_interactive', { tabId, selector, timeoutMs });
  }

  // ---------------------------------------------------------------------------
  // Screenshots
  // ---------------------------------------------------------------------------

  static async screenshot(tabId?: string, selector?: string): Promise<string> {
    return invoke('browser_screenshot', { tabId, selector });
  }

  static async getScreenshotStream(tabId?: string): Promise<string> {
    return invoke('browser_get_screenshot_stream', { tabId });
  }

  // ---------------------------------------------------------------------------
  // JavaScript execution (approval-gated)
  // ---------------------------------------------------------------------------

  static async evaluate(tabId: string | undefined, script: string): Promise<unknown> {
    if (!script || !script.trim()) {
      throw new Error('Script cannot be empty');
    }
    return invoke('browser_evaluate', { tabId, script });
  }

  static async executeAsyncJs(tabId: string | undefined, script: string): Promise<unknown> {
    if (!script || !script.trim()) {
      throw new Error('Script cannot be empty');
    }
    return invoke('browser_execute_async_js', { tabId, script });
  }

  // ---------------------------------------------------------------------------
  // Forms
  // ---------------------------------------------------------------------------

  static async fillForm(
    tabId: string | undefined,
    selector: string,
    data: BrowserFormData,
  ): Promise<void> {
    return invoke('browser_fill_form', { tabId, selector, data });
  }

  // ---------------------------------------------------------------------------
  // Drag & drop / file upload
  // ---------------------------------------------------------------------------

  static async dragAndDrop(
    tabId: string | undefined,
    source: string,
    target: string,
  ): Promise<void> {
    return invoke('browser_drag_and_drop', { tabId, source, target });
  }

  static async uploadFile(
    tabId: string | undefined,
    selector: string,
    filePath: string,
  ): Promise<void> {
    if (!filePath || !filePath.trim()) {
      throw new Error('File path cannot be empty');
    }
    if (filePath.includes('..')) {
      throw new Error('File path must not contain path traversal sequences');
    }
    return invoke('browser_upload_file', { tabId, selector, paths: [filePath] });
  }

  // ---------------------------------------------------------------------------
  // Cookies
  // ---------------------------------------------------------------------------

  static async getCookies(tabId?: string): Promise<Cookie[]> {
    return invoke('browser_get_cookies', { tabId });
  }

  static async setCookie(tabId: string | undefined, cookie: Cookie): Promise<void> {
    return invoke('browser_set_cookie', { tabId, cookie });
  }

  static async clearCookies(tabId?: string): Promise<void> {
    return invoke('browser_clear_cookies', { tabId });
  }

  // ---------------------------------------------------------------------------
  // Performance
  // ---------------------------------------------------------------------------

  static async getPerformanceMetrics(tabId?: string): Promise<PerformanceMetrics> {
    return invoke('browser_get_performance_metrics', { tabId });
  }

  // ---------------------------------------------------------------------------
  // Request interception
  // ---------------------------------------------------------------------------

  static async enableRequestInterception(enabled: boolean): Promise<void> {
    return invoke('browser_enable_request_interception', { enabled });
  }

  // ---------------------------------------------------------------------------
  // Frames (approval-gated for executeInFrame)
  // ---------------------------------------------------------------------------

  static async getFrames(tabId?: string): Promise<BrowserFrame[]> {
    return invoke('browser_get_frames', { tabId });
  }

  static async executeInFrame(
    tabId: string | undefined,
    frameId: string,
    script: string,
  ): Promise<unknown> {
    return invoke('browser_execute_in_frame', { tabId, frameId, script });
  }

  // ---------------------------------------------------------------------------
  // Function calls
  // ---------------------------------------------------------------------------

  static async callFunction(
    tabId: string | undefined,
    functionName: string,
    args: unknown[] = [],
  ): Promise<unknown> {
    if (!functionName || !functionName.trim()) {
      throw new Error('Function name cannot be empty');
    }
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$.*]*$/.test(functionName)) {
      throw new Error(`Invalid function name format: ${functionName}`);
    }
    return invoke('browser_call_function', { tabId, functionName, args });
  }

  // ---------------------------------------------------------------------------
  // Semantic selectors
  // ---------------------------------------------------------------------------

  static async findElementSemantic(tabId: string | undefined, query: string): Promise<string> {
    return invoke('find_element_semantic', { tabId, query });
  }

  static async findAllElementsSemantic(
    tabId: string | undefined,
    query: string,
  ): Promise<string[]> {
    return invoke('find_all_elements_semantic', { tabId, query });
  }

  static async clickSemantic(tabId: string | undefined, query: string): Promise<void> {
    return invoke('click_semantic', { tabId, query });
  }

  static async typeSemantic(tabId: string | undefined, query: string, text: string): Promise<void> {
    return invoke('type_semantic', { tabId, query, text });
  }

  static async testSelectorStrategies(tabId: string | undefined, query: string): Promise<unknown> {
    return invoke('test_selector_strategies', { tabId, query });
  }

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------

  static async getAccessibilityTree(tabId?: string): Promise<unknown> {
    return invoke('get_accessibility_tree', { tabId });
  }

  static async getDomSemanticGraph(tabId?: string): Promise<unknown> {
    return invoke('get_dom_semantic_graph', { tabId });
  }

  static async getInteractiveElements(tabId?: string): Promise<string[]> {
    return invoke('get_interactive_elements', { tabId });
  }

  static async findByRole(tabId: string | undefined, role: string, name?: string): Promise<string> {
    return invoke('find_by_role', { tabId, role, name });
  }
}
