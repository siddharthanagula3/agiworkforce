import type {
  ExtensionMessage,
  ExtensionResponse,
  AutomationState,
  ClickResponse,
  GetPageInfoResponse,
  GetFormsResponse,
  FormInfo,
  RunPageAction,
  ConnectionStatusChangedMessage,
  ClickMessage,
  DoubleClickMessage,
  RightClickMessage,
  TypeMessage,
  GetTextMessage,
  GetAttributeMessage,
  SetAttributeMessage,
  WaitForSelectorMessage,
  ExecuteScriptMessage,
  FillFormMessage,
  SubmitFormMessage,
  RunPageActionsMessage,
  AutoFillJobApplicationMessage,
} from './types';
import { logger, domUtils, formUtils, validators, sleep } from './utils';
import { runPlatformJobAutofill } from './jobAutofill';
import { discoverAllTools, callTool, watchForToolChanges } from './webmcp';
import { extractPageMetadata } from './page-metadata';
import type { PageMetadata } from './page-metadata';
import { detectNLWeb } from './nlweb';

import type { ConsoleLogEntry } from './types';

const MAX_CONTEXT_HTML_CHARS = 100_000;
const MAX_CONSOLE_BUFFER = 200;
const MAX_CONSOLE_ENTRY_CHARS = 1000;
const PAGE_EXTRACTION_TIMEOUT_MS = 5_000;

const consoleLogBuffer: ConsoleLogEntry[] = [];

interface ActionExecutionResult {
  success?: boolean;
  error?: string;
  type?: string;
  [key: string]: unknown;
}

const automationState: AutomationState = {
  isControlled: false,
  highlightedElement: null,
  isRecording: false,
  recordedActions: [],
  connectionStatus: 'disconnected',
};
let lastPointerTarget: Element | null = null;

function initialize(): void {
  // Wrap DOM injections in error boundaries — CSP-restricted pages or unusual
  // document states (e.g. XML, SVG, sandboxed iframes) can cause these to throw.
  try {
    addAutomationIndicator();
  } catch (err) {
    logger.debug('addAutomationIndicator failed (non-fatal)', err);
  }
  try {
    injectFloatingOverlay();
  } catch (err) {
    logger.debug('injectFloatingOverlay failed (non-fatal)', err);
  }

  chrome.runtime.onMessage.addListener(handleMessage);
  document.addEventListener('mousemove', (event) => {
    const target = event.target;
    lastPointerTarget = target instanceof Element ? target : null;
  });

  void checkConnectionStatus();
  // notifyTabReady() sends TAB_READY which triggers syncTabContextWithDesktop() in background.ts,
  // so there is no need to call syncPageContext() separately here.
  void notifyTabReady();

  try {
    patchConsole();
  } catch (err) {
    logger.debug('patchConsole failed (non-fatal)', err);
  }

  try {
    initWebMCP();
  } catch (err) {
    logger.debug('initWebMCP failed (non-fatal)', err);
  }

  initSPANavigationWatcher();
}

function handleMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: ExtensionResponse) => void,
): boolean {
  // Validate sender is our own extension — reject messages from other extensions or web pages
  if (sender.id !== chrome.runtime.id) {
    logger.warn('Rejected message from unauthorized sender', { senderId: sender.id });
    sendResponse({ success: false, error: 'Unauthorized sender' } as ExtensionResponse);
    return false;
  }

  const msg = message as ExtensionMessage;

  if (!isValidMessage(msg)) {
    sendResponse({ success: false, error: 'Invalid message' } as ExtensionResponse);
    return false;
  }

  handleMessageAsync(msg)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      logger.error('Error handling message', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ExtensionResponse);
    });

  return true;
}

async function handleMessageAsync(message: ExtensionMessage): Promise<ExtensionResponse> {
  const messageType = message.type;
  logger.debug('Processing message', { type: messageType });

  switch (messageType) {
    case 'TAB_READY':
      return { success: true, ready: true } as ExtensionResponse;

    case 'CONNECTION_STATUS_CHANGED': {
      const statusMsg = message as ConnectionStatusChangedMessage;
      automationState.connectionStatus = statusMsg.connected ? 'connected' : 'disconnected';
      updateIndicatorStatus();
      if (statusMsg.connected) {
        void syncPageContext('connection_restored');
      }
      return { success: true } as ExtensionResponse;
    }

    case 'CLICK':
      return handleClick(message as ClickMessage);

    case 'DOUBLE_CLICK':
      return handleDoubleClick(message as DoubleClickMessage);

    case 'RIGHT_CLICK':
      return handleRightClick(message as RightClickMessage);

    case 'TYPE':
      return handleType(message as TypeMessage);

    case 'GET_TEXT':
      return handleGetText(message as GetTextMessage);

    case 'GET_ATTRIBUTE':
      return handleGetAttribute(message as GetAttributeMessage);

    case 'SET_ATTRIBUTE':
      return handleSetAttribute(message as SetAttributeMessage);

    case 'WAIT_FOR_SELECTOR':
      return handleWaitForSelector(message as WaitForSelectorMessage);

    case 'EXECUTE_SCRIPT':
      return handleExecuteScript(message as ExecuteScriptMessage);

    case 'GET_PAGE_INFO':
      return handleGetPageInfo();

    case 'GET_FORMS':
      return handleGetForms();

    case 'FILL_FORM':
      return handleFillForm(message as FillFormMessage);

    case 'SUBMIT_FORM':
      return handleSubmitForm(message as SubmitFormMessage);
    case 'CAPTURE_ELEMENT':
      return handleCaptureElement();
    case 'GET_ELEMENT_INFO':
      return handleGetElementInfo();
    case 'RUN_PAGE_ACTIONS':
      return handleRunPageActions(message as RunPageActionsMessage);
    case 'AUTO_FILL_JOB_APPLICATION':
      return handleAutoFillJobApplication(message as AutoFillJobApplicationMessage);

    case 'SELECT_OPTION':
      return handleSelectOption(message as import('./types').SelectOptionMessage);

    case 'CHECK':
      return handleCheck(message as import('./types').CheckMessage, true);

    case 'UNCHECK':
      return handleCheck(message as import('./types').UncheckMessage, false);

    case 'FOCUS':
      return handleFocusBlur(message as import('./types').FocusMessage, 'focus');

    case 'BLUR':
      return handleFocusBlur(message as import('./types').BlurMessage, 'blur');

    case 'HOVER':
      return handleHover(message as import('./types').HoverMessage);

    case 'SCROLL':
      return handleScroll(message as import('./types').ScrollMessage);

    case 'DRAG_DROP':
      return handleDragDrop(message as import('./types').DragDropMessage);

    case 'CLICK_AT_COORDINATES':
      return handleClickAtCoordinates(message as import('./types').ClickAtCoordinatesMessage);

    case 'GET_ACCESSIBILITY_TREE':
    case 'BUILD_ACCESSIBILITY_TREE':
      return handleBuildAccessibilityTree();

    case 'START_RECORDING':
      return handleStartRecording();

    case 'STOP_RECORDING':
      return handleStopRecording();

    case 'GET_RECORDED_ACTIONS':
      return handleGetRecordedActions();

    case 'WEBMCP_DISCOVER_TOOLS':
      return handleWebMCPDiscoverTools();

    case 'WEBMCP_CALL_TOOL':
      return handleWebMCPCallTool(message as import('./types').WebMCPCallToolMessage);

    case 'GET_CONSOLE_LOGS':
      return { success: true, logs: [...consoleLogBuffer] } as ExtensionResponse;

    case 'CLEAR_CONSOLE_LOGS':
      consoleLogBuffer.length = 0;
      return { success: true } as ExtensionResponse;

    default:
      return { success: false, error: 'Unknown message type' } as ExtensionResponse;
  }
}

async function notifyTabReady(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'TAB_READY',
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.debug('Failed to notify TAB_READY', error);
  }
}

function buildCurrentPageContext(): Record<string, unknown> {
  const selectedText = window.getSelection()?.toString() || '';

  let metadata: PageMetadata | undefined;
  try {
    metadata = extractPageMetadata();
  } catch (e) {
    logger.debug('Failed to extract page metadata for context', e);
  }

  // Bound HTML extraction to avoid hanging on pathological DOMs (e.g. huge SPAs).
  let html = '';
  try {
    const extractStart = Date.now();
    const rawHtml = document.documentElement.outerHTML;
    if (Date.now() - extractStart < PAGE_EXTRACTION_TIMEOUT_MS) {
      html = rawHtml.substring(0, MAX_CONTEXT_HTML_CHARS);
    } else {
      logger.warn('HTML extraction timed out, using empty content');
    }
  } catch (e) {
    logger.debug('Failed to extract page HTML (CSP or DOM error)', e);
  }

  return {
    url: window.location.href,
    title: document.title || 'Untitled',
    html,
    selectedText: selectedText.substring(0, 2_000),
    timestamp: Date.now(),
    ...(metadata ? { metadata } : {}),
  };
}

async function syncPageContext(reason: string): Promise<void> {
  try {
    const pageContext = buildCurrentPageContext();
    await chrome.runtime.sendMessage({
      type: 'SYNC_PAGE_CONTEXT',
      timestamp: Date.now(),
      context: {
        ...pageContext,
        reason,
      },
      // Structured metadata is included inside context.metadata via buildCurrentPageContext(),
      // but also surfaced at the top level for consumers that expect it there.
      ...(pageContext['metadata'] ? { metadata: pageContext['metadata'] } : {}),
    });
  } catch (error) {
    logger.debug('Failed to sync page context', { reason, error });
  }
}

async function executePlannedAction(action: RunPageAction): Promise<ActionExecutionResult> {
  const actionType = String(action.type || '').toLowerCase();
  switch (actionType) {
    case 'get_page_info': {
      const response = handleGetPageInfo() as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'get_forms': {
      const response = handleGetForms() as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'analyze_selection': {
      const selected = window.getSelection()?.toString() || String(action.value || '');
      return {
        type: actionType,
        success: true,
        selectedText: selected.substring(0, 2_000),
      };
    }
    case 'wait_for_selector': {
      const selector = action.selector ? String(action.selector) : '';
      const timeout = action.delay != null ? Math.max(Number(action.delay), 500) : 5_000;
      const response = (await handleWaitForSelector({
        type: 'WAIT_FOR_SELECTOR',
        selector,
        timeout,
        options: { visible: true },
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'navigate': {
      const url = action.value ? String(action.value) : '';
      if (!url || !/^https?:\/\//i.test(url)) {
        return {
          type: actionType,
          success: false,
          error: `Invalid or missing URL for navigate action: ${url}`,
        };
      }
      // Validate that the URL is well-formed beyond the regex check
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return {
            type: actionType,
            success: false,
            error: `Only http/https URLs are allowed: ${url}`,
          };
        }
      } catch {
        return {
          type: actionType,
          success: false,
          error: `Malformed URL for navigate action: ${url}`,
        };
      }
      window.location.href = url;
      return { type: actionType, success: true, url };
    }
    case 'click': {
      const response = (await handleClick({
        type: 'CLICK',
        selector: action.selector ?? '',
        options: { delay: action.delay ?? undefined },
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'type': {
      const response = (await handleType({
        type: 'TYPE',
        selector: action.selector ?? '',
        text: String(action.value || ''),
        options: { delay: action.delay ?? undefined },
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'hover': {
      const selector = action.selector ? String(action.selector) : '';
      if (!validators.isValidSelector(selector)) {
        return { type: actionType, success: false, error: 'Invalid selector for hover' };
      }
      const element = domUtils.querySelector(selector);
      if (!element) {
        return { type: actionType, success: false, error: `Element not found: ${selector}` };
      }
      element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true }));
      return { type: actionType, success: true };
    }
    case 'focus': {
      const selector = action.selector ? String(action.selector) : '';
      if (!validators.isValidSelector(selector)) {
        return { type: actionType, success: false, error: 'Invalid selector for focus' };
      }
      const element = domUtils.querySelector(selector) as HTMLElement | null;
      if (!element) {
        return { type: actionType, success: false, error: `Element not found: ${selector}` };
      }
      if (typeof element.focus === 'function') {
        element.focus();
      }
      return { type: actionType, success: true };
    }
    case 'scroll_into_view': {
      const selector = action.selector ? String(action.selector) : '';
      if (!validators.isValidSelector(selector)) {
        return { type: actionType, success: false, error: 'Invalid selector for scroll_into_view' };
      }
      const element = domUtils.querySelector(selector);
      if (!element) {
        return { type: actionType, success: false, error: `Element not found: ${selector}` };
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { type: actionType, success: true };
    }
    case 'select_option': {
      const selector = action.selector ? String(action.selector) : '';
      const value = action.value ? String(action.value) : '';
      if (!validators.isValidSelector(selector)) {
        return { type: actionType, success: false, error: 'Invalid selector for select_option' };
      }
      const element = domUtils.querySelector(selector) as HTMLSelectElement | null;
      if (!element || element.tagName.toLowerCase() !== 'select') {
        return {
          type: actionType,
          success: false,
          error: `Select element not found: ${selector}`,
        };
      }
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { type: actionType, success: true, value };
    }
    case 'set_checked': {
      const selector = action.selector ? String(action.selector) : '';
      const checked = action.value === 'true' || action.value === '1';
      if (!validators.isValidSelector(selector)) {
        return { type: actionType, success: false, error: 'Invalid selector for set_checked' };
      }
      const element = domUtils.querySelector(selector) as HTMLInputElement | null;
      if (!element) {
        return { type: actionType, success: false, error: `Element not found: ${selector}` };
      }
      element.checked = checked;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { type: actionType, success: true, checked };
    }
    case 'auto_fill_job_application': {
      let parsedProfile: Record<string, unknown> = {};
      let parsedOptions: Record<string, unknown> = {};

      if (typeof action.value === 'string' && action.value.trim()) {
        try {
          const parsed = JSON.parse(action.value) as {
            profile?: Record<string, unknown>;
            options?: Record<string, unknown>;
          };
          parsedProfile = parsed.profile ?? {};
          parsedOptions = parsed.options ?? {};
        } catch {
          parsedOptions = {};
        }
      }

      const response = (await handleAutoFillJobApplication({
        type: 'AUTO_FILL_JOB_APPLICATION',
        profile: parsedProfile,
        options: parsedOptions,
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'submit_job_application': {
      const response = (await handleAutoFillJobApplication({
        type: 'AUTO_FILL_JOB_APPLICATION',
        profile: {},
        options: {
          autoSubmit: true,
          allowSubmitWithMissingRequired: false,
        },
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    default:
      return {
        type: actionType || 'unknown',
        success: false,
        error: `Unsupported page action: ${action.type}`,
      };
  }
}

async function handleRunPageActions(message: RunPageActionsMessage): Promise<ExtensionResponse> {
  const taskId = message.taskId || `task_${Date.now()}`;
  const actions = Array.isArray(message.actions) ? message.actions : [];
  const startedAt = Date.now();
  const results: ActionExecutionResult[] = [];
  let actionsPerformed = 0;
  let firstError: string | undefined;

  for (const action of actions) {
    const result = await executePlannedAction(action);
    results.push({
      id: action.id,
      ...result,
    });
    const success = result.success === true;
    if (success) {
      actionsPerformed += 1;
    } else if (!firstError) {
      firstError =
        typeof result.error === 'string'
          ? result.error
          : `Action '${action.type}' failed without details`;
    }
  }

  let screenshot: string | undefined;
  try {
    const capture = (await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      format: 'png',
      quality: 80,
    })) as { success?: boolean; data?: string };
    if (capture?.success && typeof capture.data === 'string') {
      screenshot = capture.data;
    }
  } catch (error) {
    logger.debug('Unable to capture screenshot after page actions', error);
  }

  return {
    success: !firstError,
    taskId,
    result: {
      actions: results,
      url: window.location.href,
      title: document.title,
    },
    actionsPerformed,
    duration: Date.now() - startedAt,
    screenshot,
    error: firstError,
  } as ExtensionResponse;
}

function serializeElement(target: Element | null): Record<string, unknown> | null {
  if (!target) {
    return null;
  }

  const rect = target.getBoundingClientRect();
  const html = target.outerHTML || '';
  return {
    tag: target.tagName.toLowerCase(),
    id: target.id || null,
    className: target.className || null,
    text: (target.textContent || '').trim().slice(0, 400),
    selector: buildElementSelector(target),
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    html: html.slice(0, 4000),
  };
}

function buildElementSelector(element: Element): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.parentElement && parts.length < 4) {
    const tag = current.tagName.toLowerCase();
    const classPart =
      typeof current.className === 'string' && current.className.trim()
        ? `.${current.className
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((cls) => CSS.escape(cls))
            .join('.')}`
        : '';
    const siblings = Array.from(current.parentElement.children).filter(
      (child) => child.tagName === current!.tagName,
    );
    const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
    parts.unshift(`${tag}${classPart}${nth}`);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function handleCaptureElement(): ExtensionResponse {
  const payload = serializeElement(lastPointerTarget);
  if (!payload) {
    return { success: false, error: 'No element under pointer' };
  }

  return { success: true, element: payload } as ExtensionResponse;
}

function handleGetElementInfo(): ExtensionResponse {
  const active = document.activeElement instanceof Element ? document.activeElement : null;
  const payload = serializeElement(active || lastPointerTarget);
  if (!payload) {
    return { success: false, error: 'No active element found' };
  }
  return { success: true, element: payload } as ExtensionResponse;
}

async function handleClick(message: ClickMessage): Promise<ClickResponse> {
  try {
    const { selector, options = {} } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    if (options.delay) {
      await sleep(options.delay);
    }

    const success = domUtils.safeClick(element, options.button ?? 'left');

    return {
      success,
      element: success
        ? {
            tag: element.tagName.toLowerCase(),
            id: element.id || undefined,
            className: element.className || undefined,
            text: element.textContent?.substring(0, 100) || undefined,
          }
        : undefined,
      error: success ? undefined : 'Failed to click element',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleDoubleClick(message: DoubleClickMessage): Promise<ExtensionResponse> {
  try {
    const { selector, options = {} } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    if (options.delay) {
      await sleep(options.delay);
    }

    const event = new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      view: window,
    });

    element.dispatchEvent(event);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleRightClick(message: RightClickMessage): Promise<ExtensionResponse> {
  try {
    const { selector, options = {} } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    if (options.delay) {
      await sleep(options.delay);
    }

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 2,
    });

    element.dispatchEvent(event);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleType(message: TypeMessage): Promise<ExtensionResponse> {
  try {
    const { selector, text, options = {} } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    if ('focus' in element && typeof element.focus === 'function') {
      (element as HTMLElement).focus();
    }

    if (options.clear && element instanceof HTMLInputElement) {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    for (const char of text) {
      const keyEvent = new KeyboardEvent('keydown', {
        key: char,
        bubbles: true,
        cancelable: true,
      });

      element.dispatchEvent(keyEvent);

      if ('value' in element) {
        (element as HTMLInputElement).value += char;
      } else {
        element.textContent = (element.textContent ?? '') + char;
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: char,
          bubbles: true,
          cancelable: true,
        }),
      );

      if (options.delay) {
        await sleep(options.delay);
      }
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, charsTyped: text.length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleGetText(message: GetTextMessage): Promise<ExtensionResponse> {
  try {
    const { selector } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    const text = domUtils.getText(element);

    return { success: true, text };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleGetAttribute(message: GetAttributeMessage): Promise<ExtensionResponse> {
  try {
    const { selector, attribute } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    const value = element.getAttribute(attribute);

    return { success: true, value: value ?? undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Allowlist of safe attributes for setAttribute.
 * Blocks event handlers (on*) and dangerous URL attributes on sensitive elements.
 */
const SAFE_ATTRIBUTES = new Set([
  'class',
  'id',
  'name',
  'value',
  'placeholder',
  'type',
  'checked',
  'disabled',
  'readonly',
  'selected',
  'title',
  'alt',
  'role',
  'tabindex',
  'width',
  'height',
  'min',
  'max',
  'step',
  'pattern',
  'maxlength',
]);

/** Attributes that can inject URLs on script/link/form/iframe elements */
const DANGEROUS_URL_ATTRIBUTES = new Set(['src', 'href', 'action', 'formaction']);

/** Elements where URL attributes are dangerous */
const SENSITIVE_URL_ELEMENTS = new Set([
  'SCRIPT',
  'LINK',
  'FORM',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'A',
]);

function isAttributeAllowed(attribute: string, element: Element): boolean {
  const lowerAttr = attribute.toLowerCase();

  // Block all event handler attributes
  if (lowerAttr.startsWith('on')) {
    return false;
  }

  // Allow data-* and aria-* prefixed attributes
  if (lowerAttr.startsWith('data-') || lowerAttr.startsWith('aria-')) {
    return true;
  }

  // Block dangerous URL attributes on sensitive elements
  if (DANGEROUS_URL_ATTRIBUTES.has(lowerAttr) && SENSITIVE_URL_ELEMENTS.has(element.tagName)) {
    return false;
  }

  return SAFE_ATTRIBUTES.has(lowerAttr);
}

async function handleSetAttribute(message: SetAttributeMessage): Promise<ExtensionResponse> {
  try {
    const { selector, attribute, value } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    if (!isAttributeAllowed(attribute, element)) {
      return { success: false, error: `Attribute "${attribute}" is not allowed on this element` };
    }

    element.setAttribute(attribute, value);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleWaitForSelector(message: WaitForSelectorMessage): Promise<ExtensionResponse> {
  try {
    const { selector, timeout = 5000, options = {} } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = await domUtils.waitForSelector(selector, timeout, options.visible);

    return { success: true, found: element !== null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Allowlisted script operations that can be executed via handleExecuteScript.
 * SECURITY: new Function() / eval() is not used. Only pre-defined operations are allowed.
 */
const ALLOWED_SCRIPT_OPERATIONS: Record<string, (...args: unknown[]) => unknown> = {
  scrollTo: (...args: unknown[]) =>
    window.scrollTo((args[0] as number) ?? 0, (args[1] as number) ?? 0),
  scrollBy: (...args: unknown[]) =>
    window.scrollBy((args[0] as number) ?? 0, (args[1] as number) ?? 0),
  scrollIntoView: (...args: unknown[]) => {
    const el = document.querySelector(args[0] as string);
    el?.scrollIntoView(
      (args[1] as ScrollIntoViewOptions) ?? { behavior: 'smooth', block: 'center' },
    );
    return !!el;
  },
  getScrollPosition: () => ({ x: window.scrollX, y: window.scrollY }),
  getViewportSize: () => ({ width: window.innerWidth, height: window.innerHeight }),
  getComputedStyle: (...args: unknown[]) => {
    const el = document.querySelector(args[0] as string);
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return args[1] ? style.getPropertyValue(args[1] as string) : null;
  },
  getBoundingRect: (...args: unknown[]) => {
    const el = document.querySelector(args[0] as string);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  },
  focusElement: (...args: unknown[]) => {
    const el = document.querySelector(args[0] as string) as HTMLElement | null;
    el?.focus();
    return !!el;
  },
  blurElement: (...args: unknown[]) => {
    const el = document.querySelector(args[0] as string) as HTMLElement | null;
    el?.blur();
    return !!el;
  },
};

async function handleExecuteScript(message: ExecuteScriptMessage): Promise<ExtensionResponse> {
  try {
    const { script, args = [] } = message;

    const operation = ALLOWED_SCRIPT_OPERATIONS[script];
    if (!operation) {
      return {
        success: false,
        error: `Script operation "${String(script)}" is not allowed. Supported operations: ${Object.keys(ALLOWED_SCRIPT_OPERATIONS).join(', ')}`,
      };
    }

    const result = operation(...args);
    const finalResult = result instanceof Promise ? await result : result;

    return { success: true, result: finalResult };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function handleGetPageInfo(): GetPageInfoResponse {
  try {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : '';

    // Use the timeout-bounded extraction shared with buildCurrentPageContext
    let html = '';
    try {
      const extractStart = Date.now();
      const rawHtml = document.documentElement.outerHTML;
      if (Date.now() - extractStart < PAGE_EXTRACTION_TIMEOUT_MS) {
        html = rawHtml.substring(0, MAX_CONTEXT_HTML_CHARS);
      }
    } catch {
      // CSP or serialisation error — return empty HTML rather than failing the whole call
    }

    return {
      success: true,
      url: window.location.href,
      title: document.title,
      html,
      selectedText,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function handleGetForms(): GetFormsResponse {
  try {
    const forms = formUtils.getForms();

    const formData: FormInfo[] = forms.map((form) => ({
      id: form.id || undefined,
      name: form.name || undefined,
      method: form.method || 'GET',
      action: form.action || undefined,
      fields: formUtils
        .getFormFields(form)
        .map((field) => ({
          name: field.name,
          type: field.type,
          value: field.value,
          required: field.required,
          options:
            field instanceof HTMLSelectElement
              ? Array.from(field.options).map((opt) => opt.value)
              : undefined,
        }))
        .filter((f) => f.name), // Only include named fields
    }));

    return { success: true, forms: formData };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleFillForm(message: FillFormMessage): Promise<ExtensionResponse> {
  try {
    const { formSelector, data, options = {} } = message;

    const form = formSelector ? domUtils.querySelector(formSelector) : null;

    const fields = formUtils.getFormFields(form as HTMLFormElement);

    let fieldsFilled = 0;

    for (const field of fields) {
      const value = data[field.name];

      if (value !== undefined && value !== null) {
        if (formUtils.fillField(field, String(value))) {
          fieldsFilled++;

          if (options.delay) {
            await sleep(options.delay);
          }
        }
      }
    }

    return { success: true, fieldsFilled };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleAutoFillJobApplication(
  message: AutoFillJobApplicationMessage,
): Promise<ExtensionResponse> {
  const profile =
    typeof message.profile === 'object' && message.profile !== null ? message.profile : {};
  const options =
    typeof message.options === 'object' && message.options !== null ? message.options : {};
  try {
    const response = await runPlatformJobAutofill(profile, options);
    return response as ExtensionResponse;
  } catch (error) {
    logger.error('Job autofill failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Autofill failed',
    } as ExtensionResponse;
  }
}

async function handleSubmitForm(message: SubmitFormMessage): Promise<ExtensionResponse> {
  try {
    const { formSelector } = message;

    const form = formSelector
      ? (domUtils.querySelector(formSelector) as HTMLFormElement | null)
      : null;

    const success = formUtils.submitForm(form);

    return { success };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleSelectOption(
  message: import('./types').SelectOptionMessage,
): Promise<ExtensionResponse> {
  try {
    const { selector, value } = message;
    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector for select_option' };
    }
    const element = domUtils.querySelector(selector) as HTMLSelectElement | null;
    if (!element || element.tagName.toLowerCase() !== 'select') {
      return { success: false, error: `Select element not found: ${selector}` };
    }
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return { success: true, value } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleCheck(
  message: import('./types').CheckMessage | import('./types').UncheckMessage,
  checked: boolean,
): Promise<ExtensionResponse> {
  try {
    const { selector } = message;
    if (!validators.isValidSelector(selector)) {
      return { success: false, error: `Invalid selector for ${checked ? 'check' : 'uncheck'}` };
    }
    const element = domUtils.querySelector(selector) as HTMLInputElement | null;
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }
    element.checked = checked;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, checked } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleFocusBlur(
  message: import('./types').FocusMessage | import('./types').BlurMessage,
  action: 'focus' | 'blur',
): Promise<ExtensionResponse> {
  try {
    const { selector } = message;
    if (!validators.isValidSelector(selector)) {
      return { success: false, error: `Invalid selector for ${action}` };
    }
    const element = domUtils.querySelector(selector) as HTMLElement | null;
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }
    if (action === 'focus' && typeof element.focus === 'function') {
      element.focus();
    } else if (action === 'blur' && typeof element.blur === 'function') {
      element.blur();
    }
    return { success: true } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleHover(message: import('./types').HoverMessage): Promise<ExtensionResponse> {
  try {
    const { selector } = message;
    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector for hover' };
    }
    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true }));
    element.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window }),
    );
    return { success: true } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleScroll(message: import('./types').ScrollMessage): Promise<ExtensionResponse> {
  try {
    const { selector, x = 0, y = 0, deltaX = 0, deltaY = 0 } = message;
    if (selector) {
      if (!validators.isValidSelector(selector)) {
        return { success: false, error: 'Invalid selector for scroll' };
      }
      const element = domUtils.querySelector(selector);
      if (!element) {
        return { success: false, error: `Element not found: ${selector}` };
      }
      element.scrollBy({ left: deltaX, top: deltaY, behavior: 'smooth' });
    } else if (deltaX !== 0 || deltaY !== 0) {
      window.scrollBy({ left: deltaX, top: deltaY, behavior: 'smooth' });
    } else {
      window.scrollTo({ left: x, top: y, behavior: 'smooth' });
    }
    return { success: true } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleDragDrop(
  message: import('./types').DragDropMessage,
): Promise<ExtensionResponse> {
  try {
    const { sourceSelector, targetSelector } = message;
    if (!validators.isValidSelector(sourceSelector)) {
      return { success: false, error: 'Invalid source selector for drag_drop' };
    }
    if (!validators.isValidSelector(targetSelector)) {
      return { success: false, error: 'Invalid target selector for drag_drop' };
    }
    const source = domUtils.querySelector(sourceSelector);
    const target = domUtils.querySelector(targetSelector);
    if (!source) {
      return { success: false, error: `Source element not found: ${sourceSelector}` };
    }
    if (!target) {
      return { success: false, error: `Target element not found: ${targetSelector}` };
    }
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const baseOpts: EventInit = { bubbles: true, cancelable: true };
    const dragInit: DragEventInit = { ...baseOpts, view: window, dataTransfer: new DataTransfer() };
    source.dispatchEvent(new MouseEvent('mousedown', { ...baseOpts, view: window }));
    source.dispatchEvent(new DragEvent('dragstart', dragInit));
    target.dispatchEvent(new DragEvent('dragenter', { ...dragInit, dataTransfer: null }));
    target.dispatchEvent(new DragEvent('dragover', { ...dragInit, dataTransfer: null }));
    target.dispatchEvent(
      new DragEvent('drop', {
        ...dragInit,
        dataTransfer: null,
        clientX: targetRect.x,
        clientY: targetRect.y,
      }),
    );
    source.dispatchEvent(
      new DragEvent('dragend', {
        ...dragInit,
        dataTransfer: null,
        clientX: sourceRect.x,
        clientY: sourceRect.y,
      }),
    );
    return { success: true } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handleClickAtCoordinates(
  message: import('./types').ClickAtCoordinatesMessage,
): Promise<ExtensionResponse> {
  try {
    const { x, y, button = 'left' } = message;
    const buttonIndex = button === 'right' ? 2 : button === 'middle' ? 1 : 0;
    const target = document.elementFromPoint(x, y);
    if (!target) {
      return { success: false, error: `No element at coordinates (${x}, ${y})` };
    }
    const opts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: buttonIndex,
    };
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
    return {
      success: true,
      element: {
        tag: target.tagName.toLowerCase(),
        id: target.id || undefined,
      },
    } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function buildAccessibilityNode(element: Element, depth: number = 0): Record<string, unknown> {
  const rect = element.getBoundingClientRect();
  const role = element.getAttribute('role') || element.tagName.toLowerCase();
  const label =
    element.getAttribute('aria-label') ||
    element.getAttribute('alt') ||
    (element as HTMLElement).innerText?.slice(0, 80) ||
    null;

  const node: Record<string, unknown> = {
    role,
    label,
    id: element.id || null,
    visible: rect.width > 0 && rect.height > 0,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
    children: [],
  };

  if (depth < 8) {
    const childNodes: Record<string, unknown>[] = [];
    for (const child of Array.from(element.children)) {
      childNodes.push(buildAccessibilityNode(child, depth + 1));
    }
    node['children'] = childNodes;
  }

  return node;
}

function handleBuildAccessibilityTree(): ExtensionResponse {
  try {
    const root = document.body || document.documentElement;
    const tree = buildAccessibilityNode(root);
    return { success: true, data: tree } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * A recorded user action with a human-friendly shape.
 * Stored separately from the legacy RecordedAction interface in types.ts so
 * the DOM recorder can use precise 'click' | 'input' | 'scroll' | 'navigate'
 * strings without fighting the NativeMessageType union.
 */
interface UserRecordedAction {
  type: 'click' | 'input' | 'scroll' | 'navigate';
  selector: string;
  value?: string;
  timestamp: number;
}

const _userRecordedActions: UserRecordedAction[] = [];

let _recordingClickListener: ((e: MouseEvent) => void) | null = null;
let _recordingInputListener: ((e: Event) => void) | null = null;
let _recordingScrollListener: (() => void) | null = null;
let _recordingNavListener: (() => void) | null = null;
let _recordingIndicatorHost: HTMLElement | null = null;

/**
 * Build a short CSS selector that uniquely identifies an element.
 * Prefers id > [data-testid] > tag+class combo. Falls back to tag name.
 */
function buildCssSelector(el: Element): string {
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }
  const testId = el.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`;
  }
  const name = el.getAttribute('name');
  if (name && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
    return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }
  const base = el.tagName.toLowerCase();
  const firstClass = el.classList[0] ? `.${CSS.escape(el.classList[0])}` : '';
  return `${base}${firstClass}`;
}

function showRecordingIndicator(): void {
  if (_recordingIndicatorHost) return;
  if (!document.body) return;

  const host = document.createElement('div');
  host.setAttribute('data-agi-workforce-recording', 'true');
  host.style.cssText =
    'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;';

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .agi-rec-dot {
      display:inline-flex;align-items:center;gap:6px;
      background:rgba(30,10,10,0.88);color:#f87171;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      font-size:12px;font-weight:600;letter-spacing:0.04em;
      padding:5px 12px;border-radius:20px;
      border:1px solid rgba(220,38,38,0.5);
      user-select:none;
    }
    .agi-rec-circle {
      width:9px;height:9px;border-radius:50%;
      background:#ef4444;flex-shrink:0;
      animation:agi-rec-pulse 1.1s ease-in-out infinite;
    }
    @keyframes agi-rec-pulse {
      0%,100%{opacity:1;transform:scale(1);}
      50%{opacity:0.4;transform:scale(0.75);}
    }
  `;
  const badge = document.createElement('div');
  badge.className = 'agi-rec-dot';
  badge.innerHTML = '<div class="agi-rec-circle"></div>REC';
  shadow.appendChild(style);
  shadow.appendChild(badge);
  document.body.appendChild(host);
  _recordingIndicatorHost = host;
}

function hideRecordingIndicator(): void {
  if (_recordingIndicatorHost && _recordingIndicatorHost.parentNode) {
    _recordingIndicatorHost.parentNode.removeChild(_recordingIndicatorHost);
  }
  _recordingIndicatorHost = null;
}

function attachRecordingListeners(): void {
  _recordingClickListener = (e: MouseEvent) => {
    if (!automationState.isRecording) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    _userRecordedActions.push({
      type: 'click',
      selector: buildCssSelector(target),
      timestamp: Date.now(),
    });
  };

  _recordingInputListener = (e: Event) => {
    if (!automationState.isRecording) return;
    const target = e.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement) &&
      !(target instanceof HTMLSelectElement)
    )
      return;
    _userRecordedActions.push({
      type: 'input',
      selector: buildCssSelector(target),
      value: target.value,
      timestamp: Date.now(),
    });
  };

  // Throttle scroll recording — at most one entry per 500 ms.
  let _lastScrollTs = 0;
  _recordingScrollListener = () => {
    if (!automationState.isRecording) return;
    const now = Date.now();
    if (now - _lastScrollTs < 500) return;
    _lastScrollTs = now;
    _userRecordedActions.push({
      type: 'scroll',
      selector: 'window',
      value: `${window.scrollX},${window.scrollY}`,
      timestamp: now,
    });
  };

  _recordingNavListener = () => {
    if (!automationState.isRecording) return;
    _userRecordedActions.push({
      type: 'navigate',
      selector: 'window.location',
      value: window.location.href,
      timestamp: Date.now(),
    });
  };

  document.addEventListener('click', _recordingClickListener, { capture: true });
  document.addEventListener('change', _recordingInputListener, { capture: true });
  window.addEventListener('scroll', _recordingScrollListener, { passive: true, capture: true });
  window.addEventListener('popstate', _recordingNavListener);
}

function detachRecordingListeners(): void {
  if (_recordingClickListener) {
    document.removeEventListener('click', _recordingClickListener, { capture: true });
    _recordingClickListener = null;
  }
  if (_recordingInputListener) {
    document.removeEventListener('change', _recordingInputListener, { capture: true });
    _recordingInputListener = null;
  }
  if (_recordingScrollListener) {
    window.removeEventListener('scroll', _recordingScrollListener, { capture: true });
    _recordingScrollListener = null;
  }
  if (_recordingNavListener) {
    window.removeEventListener('popstate', _recordingNavListener);
    _recordingNavListener = null;
  }
}

function handleStartRecording(): ExtensionResponse {
  automationState.isRecording = true;
  automationState.recordedActions = [];
  _userRecordedActions.length = 0;

  detachRecordingListeners(); // defensive cleanup in case of double-start
  attachRecordingListeners();
  showRecordingIndicator();

  return { success: true, recording: true } as ExtensionResponse;
}

function handleStopRecording(): ExtensionResponse {
  automationState.isRecording = false;
  detachRecordingListeners();
  hideRecordingIndicator();

  const actions = [..._userRecordedActions];
  chrome.storage.local.set({ agi_recorded_actions: actions }).catch(() => {
    // Storage errors are non-fatal
  });

  chrome.runtime
    .sendMessage({
      type: 'STOP_RECORDING',
      actions,
    })
    .catch(() => {
      // Background may not be listening — not fatal
    });

  return { success: true, recording: false, actions } as ExtensionResponse;
}

function handleGetRecordedActions(): ExtensionResponse {
  return { success: true, actions: _userRecordedActions } as ExtensionResponse;
}

async function checkConnectionStatus(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CONNECTION_STATUS',
    });

    const statusResponse = response as { nativeConnected?: boolean };
    automationState.connectionStatus = statusResponse.nativeConnected
      ? 'connected'
      : 'disconnected';
    updateIndicatorStatus();
  } catch {
    automationState.connectionStatus = 'disconnected';
  }
}

// Shadow host kept in module scope so updateIndicatorStatus() can reach the inner element.

let _indicatorShadow: ShadowRoot | null = null;

/** Monkey-patch console to capture page logs. Our own logger is excluded via prefix check. */
function patchConsole(): void {
  const levels: Array<'log' | 'warn' | 'error' | 'info' | 'debug'> = [
    'log',
    'warn',
    'error',
    'info',
    'debug',
  ];

  for (const level of levels) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      original.apply(console, args);

      const firstArg = args[0];
      if (typeof firstArg === 'string' && firstArg.startsWith('[AGI Workforce]')) return;

      const message = args
        .map((a) => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ')
        .slice(0, MAX_CONSOLE_ENTRY_CHARS);

      consoleLogBuffer.push({
        level,
        message,
        timestamp: Date.now(),
      });

      while (consoleLogBuffer.length > MAX_CONSOLE_BUFFER) {
        consoleLogBuffer.shift();
      }
    };
  }
}

/** Shadow DOM prevents page CSS/JS from hiding or detecting the indicator. */
function addAutomationIndicator(): void {
  if (!document.body) return;

  if (document.querySelector('[data-agi-workforce-indicator]')) return;

  const host = document.createElement('div');
  host.setAttribute('data-agi-workforce-indicator', 'true');
  host.style.cssText =
    'position:fixed;bottom:72px;right:20px;z-index:2147483647;pointer-events:none;';

  const shadow = host.attachShadow({ mode: 'closed' });
  _indicatorShadow = shadow;

  const style = document.createElement('style');
  style.textContent = `
    .agi-indicator {
      width: 40px;
      height: 40px;
      background: radial-gradient(circle, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      font-family: system-ui, -apple-system, sans-serif;
      user-select: none;
      pointer-events: all;
      transition: background 0.3s;
    }
  `;

  const indicator = document.createElement('div');
  indicator.className = 'agi-indicator';
  indicator.textContent = '⚙';
  indicator.title = 'AGI Workforce Extension';

  indicator.addEventListener('click', () => {
    const isConnected = automationState.connectionStatus === 'connected';
    console.log(
      `[AGI Workforce] Status: ${isConnected ? 'Connected' : 'Disconnected'} | URL: ${window.location.href}`,
    );
  });

  shadow.appendChild(style);
  shadow.appendChild(indicator);
  document.body?.appendChild(host);
}

function updateIndicatorStatus(): void {
  if (!_indicatorShadow) return;
  const indicator = _indicatorShadow.querySelector<HTMLElement>('.agi-indicator');
  if (indicator) {
    const isConnected = automationState.connectionStatus === 'connected';
    indicator.style.background = isConnected
      ? 'radial-gradient(circle, #28a745 0%, #20c997 100%)'
      : 'radial-gradient(circle, #dc3545 0%, #fd7e14 100%)';
  }
}

function injectFloatingOverlay(): void {
  // Only inject on regular http/https pages
  if (!/^https?:/.test(location.protocol)) return;
  if (document.querySelector('[data-agi-workforce-overlay]')) return;

  const host = document.createElement('div');
  host.setAttribute('data-agi-workforce-overlay', 'true');
  host.style.cssText =
    'position:fixed;bottom:24px;right:24px;z-index:2147483647;pointer-events:none;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .agi-fab {
      width: 48px; height: 48px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(99,102,241,0.5);
      pointer-events: all;
      transition: transform 0.2s, box-shadow 0.2s;
      color: white; font-size: 20px;
    }
    .agi-fab:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(99,102,241,0.7); }
    .agi-tooltip {
      position: absolute; right: 56px; bottom: 8px;
      background: #1f2937; color: #f9fafb;
      font-size: 12px; font-family: -apple-system, sans-serif;
      padding: 6px 10px; border-radius: 6px;
      white-space: nowrap; pointer-events: none;
      opacity: 0; transition: opacity 0.2s;
    }
    .agi-fab:hover + .agi-tooltip { opacity: 1; }
  `;

  const btn = document.createElement('button');
  btn.className = 'agi-fab';
  btn.setAttribute('aria-label', 'Open AGI Workforce');
  btn.textContent = '\u26a1';

  const tooltip = document.createElement('div');
  tooltip.className = 'agi-tooltip';
  tooltip.textContent = 'Ask AGI Workforce';

  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open_side_panel' }).catch((err: unknown) => {
      logger.warn('Failed to open side panel', err);
    });
  });

  shadow.appendChild(style);
  shadow.appendChild(btn);
  shadow.appendChild(tooltip);
  document.body?.appendChild(host);
}

function initWebMCP(): void {
  // Delay to let page scripts register their tools first.
  // Wrapped in a try/catch so a misconfigured page (e.g. strict CSP that blocks
  // mutation observers) cannot bring down the whole content script.
  setTimeout(() => {
    try {
      const discovery = discoverAllTools();
      if (discovery.tools.length > 0) {
        logger.info(`WebMCP: discovered ${discovery.tools.length} tool(s)`, {
          tools: discovery.tools.map((t) => t.name),
          url: discovery.url,
        });
        chrome.runtime
          .sendMessage({
            type: 'WEBMCP_TOOLS_CHANGED',
            tools: discovery.tools,
            url: discovery.url,
            timestamp: Date.now(),
          })
          .catch(() => {
            // Background may not be listening yet
          });
      }
    } catch (err) {
      logger.debug('WebMCP tool discovery failed (non-fatal)', err);
    }

    try {
      watchForToolChanges((tools) => {
        chrome.runtime
          .sendMessage({
            type: 'WEBMCP_TOOLS_CHANGED',
            tools,
            url: window.location.href,
            timestamp: Date.now(),
          })
          .catch(() => {});
      });
    } catch (err) {
      logger.debug('WebMCP watchForToolChanges failed (non-fatal)', err);
    }

    // NLWeb detection — async and non-blocking. Runs after WebMCP discovery
    // to avoid contention on the initial page load network requests.
    detectNLWeb(window.location.href)
      .then((nlwebResult) => {
        if (nlwebResult.supported) {
          logger.info('NLWeb: detected support', {
            endpoints: nlwebResult.endpoints.length,
            schemaTypes: nlwebResult.schemaTypes,
            url: nlwebResult.url,
          });
          chrome.runtime
            .sendMessage({
              type: 'NLWEB_DETECTED',
              nlweb: nlwebResult,
              url: window.location.href,
              timestamp: Date.now(),
            })
            .catch(() => {
              // Background may not be listening yet
            });
        }
      })
      .catch((err) => {
        logger.debug('NLWeb detection failed (non-fatal)', err);
      });
  }, 1000);
}

function handleWebMCPDiscoverTools(): ExtensionResponse {
  const discovery = discoverAllTools();
  return {
    success: true,
    supported: discovery.supported,
    tools: discovery.tools,
    url: discovery.url,
  } as ExtensionResponse;
}

async function handleWebMCPCallTool(
  message: import('./types').WebMCPCallToolMessage,
): Promise<ExtensionResponse> {
  const { toolName, arguments: args } = message;
  const result = await callTool({ name: toolName, arguments: args });
  return result as ExtensionResponse;
}

// [H9 fix] Allowlist of known message types — prevents unknown type strings from being processed
// Note: CAPTURE_SCREENSHOT is intentionally excluded — it is handled in background.ts, not here.
const VALID_MESSAGE_TYPES = new Set([
  'CLICK',
  'DOUBLE_CLICK',
  'RIGHT_CLICK',
  'TYPE',
  'GET_TEXT',
  'GET_ATTRIBUTE',
  'SET_ATTRIBUTE',
  'WAIT_FOR_SELECTOR',
  'EXECUTE_SCRIPT',
  'GET_PAGE_INFO',
  'GET_FORMS',
  'FILL_FORM',
  'SUBMIT_FORM',
  'CAPTURE_ELEMENT',
  'GET_ELEMENT_INFO',
  'RUN_PAGE_ACTIONS',
  'AUTO_FILL_JOB_APPLICATION',
  'GET_CONNECTION_STATUS',
  'CONNECTION_STATUS_CHANGED',
  'TAB_READY',
  'SYNC_PAGE_CONTEXT',
  // Element interaction messages forwarded from background
  'SELECT_OPTION',
  'CHECK',
  'UNCHECK',
  'FOCUS',
  'BLUR',
  'HOVER',
  'SCROLL',
  'DRAG_DROP',
  'CLICK_AT_COORDINATES',
  // Accessibility
  'GET_ACCESSIBILITY_TREE',
  'BUILD_ACCESSIBILITY_TREE',
  // Recording
  'START_RECORDING',
  'STOP_RECORDING',
  'GET_RECORDED_ACTIONS',
  // WebMCP
  'WEBMCP_DISCOVER_TOOLS',
  'WEBMCP_CALL_TOOL',
  // Console log reading (forwarded from background)
  'GET_CONSOLE_LOGS',
  'CLEAR_CONSOLE_LOGS',
]);

function isValidMessage(message: unknown): message is ExtensionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;
  // [H9 fix] Validate type is a non-empty string in the known message type allowlist
  return typeof msg['type'] === 'string' && VALID_MESSAGE_TYPES.has(msg['type']);
}

/**
 * Watch for SPA route changes and re-sync page context with the desktop app.
 *
 * SPAs use history.pushState / history.replaceState to navigate without a full
 * page reload, so the browser's standard navigation events are not fired.
 * We monkey-patch those two methods (safely) to detect client-side navigations.
 * We also listen for the standard popstate event (back/forward navigation).
 *
 * To avoid hammering the background on every micro-state update we debounce
 * with a 300 ms delay and skip syncs when the URL has not changed.
 */
function initSPANavigationWatcher(): void {
  let lastSyncedUrl = window.location.href;
  let spaDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function onSPANavigate(): void {
    const currentUrl = window.location.href;
    if (currentUrl === lastSyncedUrl) return;
    lastSyncedUrl = currentUrl;

    if (spaDebounceTimer !== null) {
      clearTimeout(spaDebounceTimer);
    }
    spaDebounceTimer = setTimeout(() => {
      spaDebounceTimer = null;
      logger.debug('SPA navigation detected, re-syncing page context', { url: currentUrl });
      void syncPageContext('spa_navigation').catch((err) => {
        logger.debug('SPA navigation context sync failed (non-fatal)', err);
      });
    }, 300);
  }

  // history.pushState / replaceState are not observable via addEventListener so
  // we wrap them. We preserve the original function signature strictly.
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args: Parameters<typeof history.pushState>): void {
    originalPushState(...args);
    onSPANavigate();
  };

  history.replaceState = function (...args: Parameters<typeof history.replaceState>): void {
    originalReplaceState(...args);
    onSPANavigate();
  };

  window.addEventListener('popstate', onSPANavigate);
}

initialize();

// Export for testing
export { automationState, handleMessage, checkConnectionStatus };
