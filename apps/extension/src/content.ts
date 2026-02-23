/**
 * Content script for AGI Workforce extension
 * Runs in the context of web pages and handles DOM interactions
 */

import type {
  ExtensionMessage,
  ExtensionResponse,
  AutomationState,
  ClickResponse,
  GetPageInfoResponse,
  GetFormsResponse,
  FormInfo,
  RunPageAction,
} from './types';
import { logger, domUtils, formUtils, validators, sleep } from './utils';
import { runPlatformJobAutofill } from './jobAutofill';

const MAX_CONTEXT_HTML_CHARS = 100_000;

interface ActionExecutionResult {
  success?: boolean;
  error?: string;
  type?: string;
  [key: string]: unknown;
}

// Content script state
const automationState: AutomationState = {
  isControlled: false,
  highlightedElement: null,
  isRecording: false,
  recordedActions: [],
  connectionStatus: 'disconnected',
};
let lastPointerTarget: Element | null = null;

/**
 * Initialize content script
 */
function initialize(): void {
  logger.info('Content script initializing on', window.location.href);

  // Add automation indicator to page
  addAutomationIndicator();

  // Inject floating overlay button via shadow DOM
  injectFloatingOverlay();

  // Set up message listener
  chrome.runtime.onMessage.addListener(handleMessage);
  document.addEventListener('mousemove', (event) => {
    const target = event.target;
    lastPointerTarget = target instanceof Element ? target : null;
  });

  // Check connection status
  void checkConnectionStatus();
  void notifyTabReady();
  void syncPageContext('content_init');

  logger.info('Content script initialized');
}

/**
 * Handle messages from background script
 */
function handleMessage(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: ExtensionResponse) => void,
): boolean {
  const msg = message as ExtensionMessage;

  if (!isValidMessage(msg)) {
    sendResponse({ success: false, error: 'Invalid message' } as ExtensionResponse);
    return false;
  }

  // Handle async response
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

/**
 * Async message handler
 */
async function handleMessageAsync(message: ExtensionMessage): Promise<ExtensionResponse> {
  const messageType = (message as unknown as Record<string, unknown>)['type'];
  logger.debug('Processing message', { type: messageType });

  switch (messageType) {
    case 'TAB_READY':
      return { success: true, ready: true } as ExtensionResponse;

    case 'CONNECTION_STATUS_CHANGED':
      automationState.connectionStatus = (message as any).connected ? 'connected' : 'disconnected';
      updateIndicatorStatus();
      if ((message as any).connected) {
        void syncPageContext('connection_restored');
      }
      return { success: true } as ExtensionResponse;

    case 'CLICK':
      return handleClick(message as any);

    case 'DOUBLE_CLICK':
      return handleDoubleClick(message as any);

    case 'RIGHT_CLICK':
      return handleRightClick(message as any);

    case 'TYPE':
      return handleType(message as any);

    case 'GET_TEXT':
      return handleGetText(message as any);

    case 'GET_ATTRIBUTE':
      return handleGetAttribute(message as any);

    case 'SET_ATTRIBUTE':
      return handleSetAttribute(message as any);

    case 'WAIT_FOR_SELECTOR':
      return handleWaitForSelector(message as any);

    case 'EXECUTE_SCRIPT':
      return handleExecuteScript(message as any);

    case 'GET_PAGE_INFO':
      return handleGetPageInfo();

    case 'GET_FORMS':
      return handleGetForms();

    case 'FILL_FORM':
      return handleFillForm(message as any);

    case 'SUBMIT_FORM':
      return handleSubmitForm(message as any);
    case 'CAPTURE_ELEMENT':
      return handleCaptureElement();
    case 'GET_ELEMENT_INFO':
      return handleGetElementInfo();
    case 'RUN_PAGE_ACTIONS':
      return handleRunPageActions(message as any);
    case 'AUTO_FILL_JOB_APPLICATION':
      return handleAutoFillJobApplication(message as any);

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
  return {
    url: window.location.href,
    title: document.title || 'Untitled',
    html: document.documentElement.outerHTML.substring(0, MAX_CONTEXT_HTML_CHARS),
    selectedText: selectedText.substring(0, 2_000),
    timestamp: Date.now(),
  };
}

async function syncPageContext(reason: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'SYNC_PAGE_CONTEXT',
      timestamp: Date.now(),
      context: {
        ...buildCurrentPageContext(),
        reason,
      },
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
        selector,
        timeout,
        options: { visible: true },
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'click': {
      const response = (await handleClick({
        selector: action.selector,
        options: { delay: action.delay ?? undefined },
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'type': {
      const response = (await handleType({
        selector: action.selector,
        text: String(action.value || ''),
        options: { delay: action.delay ?? undefined },
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
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
        profile: parsedProfile,
        options: parsedOptions,
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'submit_job_application': {
      const response = (await handleAutoFillJobApplication({
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

async function handleRunPageActions(message: {
  taskId?: string;
  actions?: RunPageAction[];
}): Promise<ExtensionResponse> {
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

/**
 * Click element handler
 */
async function handleClick(message: any): Promise<ClickResponse> {
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

/**
 * Double click element handler
 */
async function handleDoubleClick(message: any): Promise<ExtensionResponse> {
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

/**
 * Right click element handler
 */
async function handleRightClick(message: any): Promise<ExtensionResponse> {
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

/**
 * Type text into element handler
 */
async function handleType(message: any): Promise<ExtensionResponse> {
  try {
    const { selector, text, options = {} } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    // Focus element
    if ('focus' in element && typeof element.focus === 'function') {
      (element as HTMLElement).focus();
    }

    // Clear if requested
    if (options.clear && element instanceof HTMLInputElement) {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Type text character by character with delay
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

/**
 * Get text content handler
 */
async function handleGetText(message: any): Promise<ExtensionResponse> {
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

/**
 * Get element attribute handler
 */
async function handleGetAttribute(message: any): Promise<ExtensionResponse> {
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
 * Set element attribute handler
 */
async function handleSetAttribute(message: any): Promise<ExtensionResponse> {
  try {
    const { selector, attribute, value } = message;

    if (!validators.isValidSelector(selector)) {
      return { success: false, error: 'Invalid selector' };
    }

    const element = domUtils.querySelector(selector);
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    element.setAttribute(attribute, value);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Wait for selector handler
 */
async function handleWaitForSelector(message: any): Promise<ExtensionResponse> {
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
 * Execute script handler
 */
async function handleExecuteScript(message: any): Promise<ExtensionResponse> {
  try {
    const { script, args = [] } = message;

    // Create a function from the script string
    const fn = new Function(...args.map((_: unknown, i: number) => `arg${i}`), script);

    // Execute with args
    const result = fn(...args);

    // Handle async results
    const finalResult = result instanceof Promise ? await result : result;

    return { success: true, result: finalResult };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get page information handler
 */
function handleGetPageInfo(): GetPageInfoResponse {
  try {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : '';

    return {
      success: true,
      url: window.location.href,
      title: document.title,
      html: document.documentElement.outerHTML.substring(0, 100000),
      selectedText,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get forms on page handler
 */
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

/**
 * Fill form handler
 */
async function handleFillForm(message: any): Promise<ExtensionResponse> {
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

async function handleAutoFillJobApplication(message: {
  profile?: Record<string, unknown>;
  options?: Record<string, unknown>;
}): Promise<ExtensionResponse> {
  const profile = message.profile ?? {};
  const options = message.options ?? {};
  const response = await runPlatformJobAutofill(profile, options);
  return response as ExtensionResponse;
}

/**
 * Submit form handler
 */
async function handleSubmitForm(message: any): Promise<ExtensionResponse> {
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

/**
 * Check connection status with background script
 */
async function checkConnectionStatus(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CONNECTION_STATUS',
    });

    automationState.connectionStatus = (response as any).nativeConnected
      ? 'connected'
      : 'disconnected';
    updateIndicatorStatus();
  } catch {
    automationState.connectionStatus = 'disconnected';
  }
}

/**
 * Add automation indicator to page
 */
function addAutomationIndicator(): void {
  const indicator = document.createElement('div');
  indicator.id = 'agi-workforce-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
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
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    font-family: system-ui, -apple-system, sans-serif;
    user-select: none;
  `;

  indicator.textContent = '⚙';
  indicator.title = 'AGI Workforce Extension';

  // Update indicator on click
  indicator.addEventListener('click', () => {
    const isConnected = automationState.connectionStatus === 'connected';
    alert(
      `AGI Workforce Extension\n\nStatus: ${isConnected ? 'Connected' : 'Disconnected'}\n\nURL: ${window.location.href}`,
    );
  });

  document.body.appendChild(indicator);
}

/**
 * Update automation indicator status
 */
function updateIndicatorStatus(): void {
  const indicator = document.getElementById('agi-workforce-indicator');
  if (indicator) {
    const isConnected = automationState.connectionStatus === 'connected';
    indicator.style.background = isConnected
      ? 'radial-gradient(circle, #28a745 0%, #20c997 100%)'
      : 'radial-gradient(circle, #dc3545 0%, #fd7e14 100%)';
  }
}

/**
 * Inject a floating overlay button for quick access to AGI Workforce.
 * Uses shadow DOM to prevent page style interference.
 */
function injectFloatingOverlay(): void {
  if (document.getElementById('agi-workforce-overlay-host')) return;

  const host = document.createElement('div');
  host.id = 'agi-workforce-overlay-host';
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
    chrome.runtime.sendMessage({ type: 'open_side_panel' });
  });

  shadow.appendChild(style);
  shadow.appendChild(btn);
  shadow.appendChild(tooltip);
  document.body?.appendChild(host);
}

/**
 * Validate message structure
 */
function isValidMessage(message: unknown): message is ExtensionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;
  return typeof msg['type'] === 'string';
}

// Initialize on script load
initialize();

// Export for testing
export { automationState, handleMessage, checkConnectionStatus };
