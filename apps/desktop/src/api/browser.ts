
import { invoke } from '../lib/tauri-mock';

export interface BrowserStatusResult {
  available: boolean;
  error: string | null;
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

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  createdAt: number;
}

export interface ElementStateResult {
  visible: boolean;
  enabled: boolean;
  checked: boolean;
  selected: boolean;
  focused: boolean;
  tagName: string;
  id: string;
  classes: string;
  error?: string;
}

export interface PerformanceMetrics {
  navigationStart: number | null;
  loadComplete: number | null;
  domContentLoaded: number | null;
  firstPaint: number | null;
  firstContentfulPaint: number | null;
  memoryUsage: number | null;
}

export interface FrameContext {
  id: string;
  url: string;
  name: string;
  parentId: string | null;
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
}

export interface ElementBoundsResult {
  success: boolean;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  error?: string;
}

export interface SemanticResult {
  strategy: string;
  found: boolean;
  elementInfo: {
    selector: string;
    role: string | null;
    name: string | null;
    text: string | null;
  } | null;
  error: string | null;
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
      profileName: options?.profileName,
      proxy: options?.proxy,
      options: options
        ? {
            args: options.args,
            userDataDir: options.userDataDir,
            timeout: options.timeout,
          }
        : undefined,
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

export async function browserCloseTab(tabId?: string): Promise<void> {
  try {
    await invoke('browser_close_tab', { tabId });
  } catch (error) {
    throw new Error(`browser_close_tab failed: ${error}`);
  }
}

export async function browserSwitchTab(tabId: string): Promise<void> {
  try {
    await invoke('browser_switch_tab', { tabId });
  } catch (error) {
    throw new Error(`browser_switch_tab failed: ${error}`);
  }
}

export async function browserListTabs(): Promise<TabInfo[]> {
  try {
    return await invoke<TabInfo[]>('browser_list_tabs');
  } catch (error) {
    throw new Error(`browser_list_tabs failed: ${error}`);
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

export async function browserWaitForNavigation(timeoutMs?: number, tabId?: string): Promise<void> {
  try {
    await invoke('browser_wait_for_navigation', { timeoutMs, tabId });
  } catch (error) {
    throw new Error(`browser_wait_for_navigation failed: ${error}`);
  }
}

export async function browserClick(selector: string, tabId?: string): Promise<void> {
  try {
    await invoke('browser_click', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_click failed: ${error}`);
  }
}

export async function browserType(selector: string, text: string, tabId?: string): Promise<void> {
  try {
    await invoke('browser_type', { selector, text, tabId });
  } catch (error) {
    throw new Error(`browser_type failed: ${error}`);
  }
}

export async function browserGetText(selector: string, tabId?: string): Promise<string> {
  try {
    return await invoke<string>('browser_get_text', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_get_text failed: ${error}`);
  }
}

export async function browserGetAttribute(
  selector: string,
  attribute: string,
  tabId?: string,
): Promise<string | null> {
  try {
    return await invoke<string | null>('browser_get_attribute', {
      selector,
      attribute,
      tabId,
    });
  } catch (error) {
    throw new Error(`browser_get_attribute failed: ${error}`);
  }
}

export async function browserWaitForSelector(
  selector: string,
  timeout?: number,
  tabId?: string,
): Promise<void> {
  try {
    await invoke('browser_wait_for_selector', { selector, timeout, tabId });
  } catch (error) {
    throw new Error(`browser_wait_for_selector failed: ${error}`);
  }
}

export async function browserSelectOption(
  selector: string,
  value: string,
  tabId?: string,
): Promise<void> {
  try {
    await invoke('browser_select_option', { selector, value, tabId });
  } catch (error) {
    throw new Error(`browser_select_option failed: ${error}`);
  }
}

export async function browserCheck(selector: string, tabId?: string): Promise<void> {
  try {
    await invoke('browser_check', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_check failed: ${error}`);
  }
}

export async function browserUncheck(selector: string, tabId?: string): Promise<void> {
  try {
    await invoke('browser_uncheck', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_uncheck failed: ${error}`);
  }
}

export async function browserHover(selector: string, tabId?: string): Promise<void> {
  try {
    await invoke('browser_hover', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_hover failed: ${error}`);
  }
}

export async function browserFocus(selector: string, tabId?: string): Promise<void> {
  try {
    await invoke('browser_focus', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_focus failed: ${error}`);
  }
}

export async function browserQueryAll(selector: string, tabId?: string): Promise<string[]> {
  try {
    return await invoke<string[]>('browser_query_all', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_query_all failed: ${error}`);
  }
}

export async function browserScrollIntoView(selector: string, tabId?: string): Promise<void> {
  try {
    await invoke('browser_scroll_into_view', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_scroll_into_view failed: ${error}`);
  }
}

export async function browserGetElementState(
  selector: string,
  tabId?: string,
): Promise<ElementStateResult> {
  try {
    return await invoke<ElementStateResult>('browser_get_element_state', {
      selector,
      tabId,
    });
  } catch (error) {
    throw new Error(`browser_get_element_state failed: ${error}`);
  }
}

export async function browserWaitForInteractive(
  selector: string,
  timeoutMs?: number,
  tabId?: string,
): Promise<void> {
  try {
    await invoke('browser_wait_for_interactive', { selector, timeoutMs, tabId });
  } catch (error) {
    throw new Error(`browser_wait_for_interactive failed: ${error}`);
  }
}

export async function browserHighlightElement(
  selector: string,
  tabId?: string,
): Promise<ElementBoundsResult> {
  try {
    return await invoke<ElementBoundsResult>('browser_highlight_element', {
      selector,
      tabId,
    });
  } catch (error) {
    throw new Error(`browser_highlight_element failed: ${error}`);
  }
}

export async function browserFillForm(
  selector: string,
  data: Record<string, string | number | boolean>,
  tabId?: string,
): Promise<void> {
  try {
    await invoke('browser_fill_form', { selector, data, tabId });
  } catch (error) {
    throw new Error(`browser_fill_form failed: ${error}`);
  }
}

export async function browserDragAndDrop(
  source: string,
  target: string,
  tabId?: string,
): Promise<void> {
  try {
    await invoke('browser_drag_and_drop', { source, target, tabId });
  } catch (error) {
    throw new Error(`browser_drag_and_drop failed: ${error}`);
  }
}

export async function browserUploadFile(
  selector: string,
  paths: string[],
  tabId?: string,
): Promise<void> {
  try {
    await invoke('browser_upload_file', { selector, paths, tabId });
  } catch (error) {
    throw new Error(`browser_upload_file failed: ${error}`);
  }
}

export async function browserScreenshot(selector?: string, tabId?: string): Promise<string> {
  try {
    return await invoke<string>('browser_screenshot', { selector, tabId });
  } catch (error) {
    throw new Error(`browser_screenshot failed: ${error}`);
  }
}

export async function browserGetScreenshotStream(tabId?: string): Promise<string> {
  try {
    return await invoke<string>('browser_get_screenshot_stream', { tabId });
  } catch (error) {
    throw new Error(`browser_get_screenshot_stream failed: ${error}`);
  }
}

export async function browserGetContent(tabId?: string): Promise<string> {
  try {
    return await invoke<string>('browser_get_content', { tabId });
  } catch (error) {
    throw new Error(`browser_get_content failed: ${error}`);
  }
}

export async function browserGetDomSnapshot(tabId?: string): Promise<string> {
  try {
    return await invoke<string>('browser_get_dom_snapshot', { tabId });
  } catch (error) {
    throw new Error(`browser_get_dom_snapshot failed: ${error}`);
  }
}

export async function browserEvaluate(script: string, tabId?: string): Promise<unknown> {
  try {
    return await invoke('browser_evaluate', { script, tabId });
  } catch (error) {
    throw new Error(`browser_evaluate failed: ${error}`);
  }
}

export async function browserExecuteAsyncJs(script: string, tabId?: string): Promise<unknown> {
  try {
    return await invoke('browser_execute_async_js', { script, tabId });
  } catch (error) {
    throw new Error(`browser_execute_async_js failed: ${error}`);
  }
}

export async function browserCallFunction(
  functionName: string,
  args: unknown,
  tabId?: string,
): Promise<unknown> {
  try {
    return await invoke('browser_call_function', { functionName, args, tabId });
  } catch (error) {
    throw new Error(`browser_call_function failed: ${error}`);
  }
}

export async function browserGetCookies(tabId?: string): Promise<BrowserCookie[]> {
  try {
    return await invoke<BrowserCookie[]>('browser_get_cookies', { tabId });
  } catch (error) {
    throw new Error(`browser_get_cookies failed: ${error}`);
  }
}

export async function browserSetCookie(cookie: BrowserCookie, tabId?: string): Promise<void> {
  try {
    await invoke('browser_set_cookie', { cookie, tabId });
  } catch (error) {
    throw new Error(`browser_set_cookie failed: ${error}`);
  }
}

export async function browserClearCookies(tabId?: string): Promise<void> {
  try {
    await invoke('browser_clear_cookies', { tabId });
  } catch (error) {
    throw new Error(`browser_clear_cookies failed: ${error}`);
  }
}

export async function browserGetPerformanceMetrics(tabId?: string): Promise<PerformanceMetrics> {
  try {
    return await invoke<PerformanceMetrics>('browser_get_performance_metrics', {
      tabId,
    });
  } catch (error) {
    throw new Error(`browser_get_performance_metrics failed: ${error}`);
  }
}

export async function browserGetFrames(tabId?: string): Promise<FrameContext[]> {
  try {
    return await invoke<FrameContext[]>('browser_get_frames', { tabId });
  } catch (error) {
    throw new Error(`browser_get_frames failed: ${error}`);
  }
}

export async function browserExecuteInFrame(
  frameId: string,
  script: string,
  tabId?: string,
): Promise<unknown> {
  try {
    return await invoke('browser_execute_in_frame', { frameId, script, tabId });
  } catch (error) {
    throw new Error(`browser_execute_in_frame failed: ${error}`);
  }
}

export async function browserEnableRequestInterception(enabled: boolean): Promise<void> {
  try {
    await invoke('browser_enable_request_interception', { enabled });
  } catch (error) {
    throw new Error(`browser_enable_request_interception failed: ${error}`);
  }
}

export async function findElementSemantic(query: string, tabId?: string): Promise<string> {
  try {
    return await invoke<string>('find_element_semantic', { query, tabId });
  } catch (error) {
    throw new Error(`find_element_semantic failed: ${error}`);
  }
}

export async function findAllElementsSemantic(query: string, tabId?: string): Promise<string[]> {
  try {
    return await invoke<string[]>('find_all_elements_semantic', { query, tabId });
  } catch (error) {
    throw new Error(`find_all_elements_semantic failed: ${error}`);
  }
}

export async function clickSemantic(query: string, tabId?: string): Promise<void> {
  try {
    await invoke('click_semantic', { query, tabId });
  } catch (error) {
    throw new Error(`click_semantic failed: ${error}`);
  }
}

export async function typeSemantic(query: string, text: string, tabId?: string): Promise<void> {
  try {
    await invoke('type_semantic', { query, text, tabId });
  } catch (error) {
    throw new Error(`type_semantic failed: ${error}`);
  }
}

export async function testSelectorStrategies(
  query: string,
  tabId?: string,
): Promise<SemanticResult[]> {
  try {
    return await invoke<SemanticResult[]>('test_selector_strategies', { query, tabId });
  } catch (error) {
    throw new Error(`test_selector_strategies failed: ${error}`);
  }
}

export async function getAccessibilityTree(tabId?: string): Promise<unknown> {
  try {
    return await invoke('get_accessibility_tree', { tabId });
  } catch (error) {
    throw new Error(`get_accessibility_tree failed: ${error}`);
  }
}

export async function getDomSemanticGraph(tabId?: string): Promise<unknown> {
  try {
    return await invoke('get_dom_semantic_graph', { tabId });
  } catch (error) {
    throw new Error(`get_dom_semantic_graph failed: ${error}`);
  }
}

export async function getInteractiveElements(tabId?: string): Promise<string[]> {
  try {
    return await invoke<string[]>('get_interactive_elements', { tabId });
  } catch (error) {
    throw new Error(`get_interactive_elements failed: ${error}`);
  }
}

export async function findByRole(role: string, name?: string, tabId?: string): Promise<string> {
  try {
    return await invoke<string>('find_by_role', { role, name, tabId });
  } catch (error) {
    throw new Error(`find_by_role failed: ${error}`);
  }
}

export const BrowserClient = {
  init: browserInit,
  checkStatus: browserCheckStatus,
  launch: browserLaunch,
  close: browserClose,

  openTab: browserOpenTab,
  closeTab: browserCloseTab,
  switchTab: browserSwitchTab,
  listTabs: browserListTabs,

  navigate: browserNavigate,
  goBack: browserGoBack,
  goForward: browserGoForward,
  reload: browserReload,
  getUrl: browserGetUrl,
  getTitle: browserGetTitle,
  waitForNavigation: browserWaitForNavigation,

  click: browserClick,
  type: browserType,
  getText: browserGetText,
  getAttribute: browserGetAttribute,
  waitForSelector: browserWaitForSelector,
  selectOption: browserSelectOption,
  check: browserCheck,
  uncheck: browserUncheck,
  hover: browserHover,
  focus: browserFocus,
  queryAll: browserQueryAll,
  scrollIntoView: browserScrollIntoView,
  getElementState: browserGetElementState,
  waitForInteractive: browserWaitForInteractive,
  highlightElement: browserHighlightElement,

  fillForm: browserFillForm,
  dragAndDrop: browserDragAndDrop,
  uploadFile: browserUploadFile,

  screenshot: browserScreenshot,
  getScreenshotStream: browserGetScreenshotStream,
  getContent: browserGetContent,
  getDomSnapshot: browserGetDomSnapshot,

  evaluate: browserEvaluate,
  executeAsyncJs: browserExecuteAsyncJs,
  callFunction: browserCallFunction,

  getCookies: browserGetCookies,
  setCookie: browserSetCookie,
  clearCookies: browserClearCookies,

  getPerformanceMetrics: browserGetPerformanceMetrics,
  getFrames: browserGetFrames,
  executeInFrame: browserExecuteInFrame,
  enableRequestInterception: browserEnableRequestInterception,

  findElementSemantic,
  findAllElementsSemantic,
  clickSemantic,
  typeSemantic,
  testSelectorStrategies,

  getAccessibilityTree,
  getDomSemanticGraph,
  getInteractiveElements,
  findByRole,
} as const;
