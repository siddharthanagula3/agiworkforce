import type { WebMCPToolInfo } from './webmcp';
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
  TypeMessage,
  GetTextMessage,
  WaitForSelectorMessage,
  RunPageActionsMessage,
  AutoFillJobApplicationMessage,
} from './types';
import { logger, domUtils, formUtils, validators, sleep } from './utils';
import { getExtensionTokensCssAuto } from './tokens';
import { redactSecrets } from '@agiworkforce/utils/logger';
import { runPlatformJobAutofill } from './jobAutofill';
import { detectJobApplication } from './features/content/autofill/detector';
import {
  autofillGreenhouse,
  autofillLever,
  autofillLinkedIn,
  autofillAshby,
  loadAutofillProfile,
  resolveProfileValue,
} from './features/content/autofill/filler';
import { makeEscalationDecision } from './features/computer-use/escalationEngine';
import { ASHBY_ALWAYS_ESCALATE_KEYS } from './features/content/autofill/ashby';
import { discoverAllTools, callTool, startToolChangeReporting } from './webmcp';
import { extractPageMetadata } from './page-metadata';
import { setupInPagePanel } from './inPagePanel/setup';
import { isDomSmallEnoughToRead } from './dom-helpers';
import {
  fillPageFields,
  findPageElements,
  watchPasswordFields,
} from './features/content/pageElements';
import {
  validateShortcutActions,
  MAX_CONTEXT_HTML_CHARS,
  sanitizePageText,
  MAX_WEBMCP_SCHEMA_BYTES,
  normalizeWebMCPToolsUpdate,
} from './background/policy';
import { evaluateSiteAccess } from './features/site-policy/store';
import { selectOptionElement } from './features/content/selectOption';
import { BROWSER_COMMAND_TIMEOUT_MS } from '@agiworkforce/types';

function extractPageHtmlSafely(): string {
  try {
    if (!isDomSmallEnoughToRead()) {
      logger.debug('Skipping page-text extraction, DOM too large');
      return '';
    }
    const rawText = document.body?.innerText ?? document.documentElement?.innerText ?? '';
    const collapsed = rawText
      .replace(/[\t \u00a0]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const redacted = sanitizePageText(collapsed);
    return redacted.substring(0, MAX_CONTEXT_HTML_CHARS);
  } catch (e) {
    logger.debug('Failed to extract page text (CSP or DOM error)', e);
    return '';
  }
}

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
  captureValues: false,
};

/**
 * Whether this page's origin carries the user's approval.
 *
 * Read once per document and shared, because every startup call this gates
 * wakes the service worker. Ungated, an extension declaring `http://*\/*`
 * content scripts woke the worker twice on every page load of every site the
 * user visits, and on a site the user never approved, both wakes could only
 * end in the allowlist rejection.
 */
const originApproved: Promise<boolean> = (async () => {
  if (!/^https?:/.test(location.protocol)) return false;
  try {
    return (await evaluateSiteAccess(window.location.href, 'automation')).allowed;
  } catch (err) {
    logger.debug('Could not read the site policy, treating this origin as unapproved', err);
    return false;
  }
})();

interface ContentScriptScope {
  __agiWorkforceContentScriptReady?: boolean;
}

function initialize(): void {
  const scope = window as Window & ContentScriptScope;
  if (scope.__agiWorkforceContentScriptReady) {
    logger.debug('Content script already initialized in this frame, skipping re-injection');
    return;
  }
  scope.__agiWorkforceContentScriptReady = true;

  watchPasswordFields();
  void setupInPagePanel(originApproved, logger);

  chrome.runtime.onMessage.addListener(handleMessage);

  void originApproved.then((approved) => {
    if (!approved) return;
    void checkConnectionStatus();
    void notifyTabReady();

    try {
      initWebMCP();
    } catch (err) {
      logger.debug('initWebMCP failed (non-fatal)', err);
    }
  });
}

function handleMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: ExtensionResponse) => void,
): boolean {
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
      const newStatus = statusMsg.connected ? 'connected' : 'disconnected';
      if (automationState.connectionStatus === newStatus) {
        return { success: true } as ExtensionResponse;
      }
      automationState.connectionStatus = newStatus;
      return { success: true } as ExtensionResponse;
    }

    case 'CLICK':
      return handleClick(message as ClickMessage);

    case 'TYPE':
      return handleType(message as TypeMessage);

    case 'GET_TEXT':
      return handleGetText(message as GetTextMessage);

    case 'WAIT_FOR_SELECTOR':
      return handleWaitForSelector(message as WaitForSelectorMessage);

    case 'GET_PAGE_INFO':
      return handleGetPageInfo();

    case 'RUN_PAGE_ACTIONS':
      return handleRunPageActions(message as RunPageActionsMessage);
    case 'AUTO_FILL_JOB_APPLICATION':
      return handleAutoFillJobApplication(message as AutoFillJobApplicationMessage);

    case 'FIND_ELEMENTS':
      return handleFindElements(message as import('./types').FindElementsMessage);

    case 'FILL_FIELDS':
      return handleFillFields(message as import('./types').FillFieldsMessage);

    case 'GET_ACCESSIBILITY_TREE':
    case 'BUILD_ACCESSIBILITY_TREE':
      return handleBuildAccessibilityTree();

    case 'START_RECORDING':
      return handleStartRecording();

    case 'STOP_RECORDING':
      return handleStopRecording();

    case 'GET_RECORDED_ACTIONS':
      return handleGetRecordedActions();

    case 'SET_RECORDING_VALUE_CAPTURE' as ExtensionMessage['type']:
      return handleSetRecordingValueCapture(message as unknown as { enabled?: unknown });

    case 'WEBMCP_DISCOVER_TOOLS':
      return handleWebMCPDiscoverTools();

    case 'WEBMCP_CALL_TOOL':
      return handleWebMCPCallTool(message as import('./types').WebMCPCallToolMessage);

    case 'WEBMCP_CANCEL_TOOL': {
      const cancel = message as import('./types').WebMCPCancelToolMessage;
      if (cancel.pageInstanceId !== webmcpPageInstanceId)
        return { success: false, error: 'The site-tool document changed.' };
      const pending = webmcpBrowserCalls.get(cancel.browserAgentCallId);
      pending?.abort(new DOMException('Browser site-tool call cancelled', 'AbortError'));
      webmcpBrowserCalls.delete(cancel.browserAgentCallId);
      return { success: true };
    }

    case 'AGI_RUN_AUTOFILL' as ExtensionMessage['type']:
      return handleRunAutofill();

    case 'AGI_CU_SHOW_ACTION' as ExtensionMessage['type']: {
      const point = message as unknown as { x?: unknown; y?: unknown };
      if (typeof point.x === 'number' && typeof point.y === 'number') {
        showActionPoint(point.x, point.y);
      }
      return { success: true } as ExtensionResponse;
    }

    case 'AGI_CU_WATCH_INPUT' as ExtensionMessage['type']:
      watchUserInput((message as unknown as { watching?: unknown }).watching === true);
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
    case 'type':
    case 'input': {
      const response = (await handleType({
        type: 'TYPE',
        selector: action.selector ?? '',
        text: String(action.value || ''),
        options: { delay: action.delay ?? undefined },
      })) as unknown as ActionExecutionResult;
      return { type: actionType, ...response };
    }
    case 'scroll': {
      const selector = action.selector ? String(action.selector) : 'window';
      if (selector === 'window' || selector === 'window.location') {
        const coords = String(action.value || '0,0').split(',');
        const x = parseInt(coords[0] ?? '0', 10) || 0;
        const y = parseInt(coords[1] ?? '0', 10) || 0;
        window.scrollTo({ left: x, top: y, behavior: 'smooth' });
        return { type: actionType, success: true };
      }
      if (!validators.isValidSelector(selector)) {
        return { type: actionType, success: false, error: 'Invalid selector for scroll' };
      }
      const element = domUtils.querySelector(selector);
      if (!element) {
        return { type: actionType, success: false, error: `Element not found: ${selector}` };
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { type: actionType, success: true };
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
      const receipt = selectOptionElement(element, { value });
      return { type: actionType, success: true, value: receipt.selectedValue, ...receipt };
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
    case 'key': {
      const key = action.value ? String(action.value) : '';
      if (!key) {
        return { type: actionType, success: false, error: 'Missing key for key action' };
      }
      const target = (document.activeElement as HTMLElement | null) || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      return { type: actionType, success: true, key };
    }
    case 'hold_key': {
      const key = action.value ? String(action.value) : '';
      if (!key) {
        return { type: actionType, success: false, error: 'Missing key for hold_key action' };
      }
      const rawDelay = Number(action.delay ?? 0);
      const durationMs =
        Number.isFinite(rawDelay) && rawDelay >= 0 ? Math.min(rawDelay, 60_000) : 0;
      const target = (document.activeElement as HTMLElement | null) || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      setTimeout(() => {
        target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      }, durationMs);
      return { type: actionType, success: true, key, durationMs };
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
  if (actions.length > 0 && !validateShortcutActions(actions)) {
    return {
      success: false,
      taskId,
      error: 'Plan contains an unsupported action type.',
      actionsPerformed: 0,
      duration: 0,
    } as ExtensionResponse;
  }
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
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          'value',
        )?.set;
        const newValue = (element as HTMLInputElement).value + char;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(element, newValue);
        } else {
          (element as HTMLInputElement).value = newValue;
        }
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

function handleGetPageInfo(): GetPageInfoResponse {
  try {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : '';

    const html = extractPageHtmlSafely();

    let metadata: ReturnType<typeof extractPageMetadata> | undefined;
    try {
      metadata = extractPageMetadata();
    } catch (metaErr) {
      logger.debug('extractPageMetadata failed (non-fatal)', metaErr);
    }

    return {
      success: true,
      url: window.location.href,
      title: document.title,
      html,
      selectedText,
      ...(metadata ? { metadata } : {}),
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
        .filter((f) => f.name),
    }));

    return { success: true, forms: formData };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

let _isAutofillingNow = false;

const AUTOFILL_ORIGIN_BLOCKED_ERROR =
  'Autofill is blocked here, this site is not on your approved-site allowlist';

async function isAutofillOriginAllowed(): Promise<boolean> {
  try {
    return (await evaluateSiteAccess(window.location.href, 'automation')).allowed;
  } catch (err) {
    logger.debug('Could not read the site policy for autofill gating', err);
    return false;
  }
}

async function handleAutoFillJobApplication(
  message: AutoFillJobApplicationMessage,
): Promise<ExtensionResponse> {
  if (_isAutofillingNow) {
    return {
      success: false,
      error: 'Autofill already in progress, please wait for it to finish',
    } as ExtensionResponse;
  }
  if (!(await isAutofillOriginAllowed())) {
    return { success: false, error: AUTOFILL_ORIGIN_BLOCKED_ERROR } as ExtensionResponse;
  }
  _isAutofillingNow = true;
  const profile =
    typeof message.profile === 'object' && message.profile !== null ? message.profile : {};
  const options =
    typeof message.options === 'object' && message.options !== null ? message.options : {};

  const safeOptions = { ...options };
  if (safeOptions.autoSubmit === true) {
    const confirmed = window.confirm(
      'AGI Workforce: Auto-submit the job application form?\n\nClick OK to submit, or Cancel to fill only.',
    );
    if (!confirmed) {
      safeOptions.autoSubmit = false;
    }
  }

  try {
    const response = await runPlatformJobAutofill(profile, safeOptions);
    return response as ExtensionResponse;
  } catch (error) {
    logger.error('Job autofill failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Autofill failed',
    } as ExtensionResponse;
  } finally {
    _isAutofillingNow = false;
  }
}

async function handleRunAutofill(): Promise<ExtensionResponse> {
  try {
    if (!(await isAutofillOriginAllowed())) {
      return { success: false, error: AUTOFILL_ORIGIN_BLOCKED_ERROR } as ExtensionResponse;
    }
    const profile = await loadAutofillProfile();
    const detection = detectJobApplication();

    if (!detection.isJobApplication || !detection.platform) {
      return {
        success: false,
        error: 'No job application form detected on this page',
      } as ExtensionResponse;
    }

    const { platform, fields } = detection;

    let autofillResult;
    if (platform === 'greenhouse') {
      autofillResult = await autofillGreenhouse(profile);
    } else if (platform === 'lever') {
      autofillResult = await autofillLever(profile);
    } else if (platform === 'linkedin') {
      autofillResult = await autofillLinkedIn(profile);
    } else if (platform === 'ashby') {
      autofillResult = await autofillAshby(profile);
    } else {
      return {
        success: false,
        error: `Unsupported platform: ${String(platform)}`,
      } as ExtensionResponse;
    }

    const profileValues: Record<string, string> = Object.fromEntries(
      fields.map((f) => {
        const v = resolveProfileValue(profile, f.key);
        return [f.key, v != null ? String(v) : ''];
      }),
    );

    const alwaysEscalate = platform === 'ashby' ? ASHBY_ALWAYS_ESCALATE_KEYS : undefined;
    const escalation = makeEscalationDecision(
      autofillResult.filled,
      fields,
      profileValues,
      platform,
      alwaysEscalate,
    );

    return {
      success: true,
      platform,
      autofill: autofillResult,
      escalation,
    } as ExtensionResponse;
  } catch (err) {
    logger.error('AGI_RUN_AUTOFILL failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Autofill failed',
    } as ExtensionResponse;
  }
}

function handleFindElements(message: import('./types').FindElementsMessage): ExtensionResponse {
  try {
    const query = typeof message.query === 'string' ? message.query : undefined;
    return { success: true, elements: findPageElements(query) } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function handleFillFields(message: import('./types').FillFieldsMessage): ExtensionResponse {
  try {
    const fields = Array.isArray(message.fields)
      ? message.fields.filter(
          (field): field is { selector: string; value: string } =>
            typeof field?.selector === 'string' && typeof field?.value === 'string',
        )
      : [];
    if (fields.length === 0) {
      return { success: false, error: 'FILL_FIELDS needs at least one selector and value' };
    }
    return { success: true, ...fillPageFields(fields) } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

const MAX_ACCESSIBILITY_TREE_NODES = 5000;

interface AccessibilityWalkState {
  count: number;
  truncated: boolean;
}

function buildAccessibilityNode(
  element: Element,
  state: AccessibilityWalkState,
  depth: number = 0,
): Record<string, unknown> {
  state.count += 1;
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

  if (depth < 8 && state.count < MAX_ACCESSIBILITY_TREE_NODES) {
    const childNodes: Record<string, unknown>[] = [];
    for (const child of Array.from(element.children)) {
      if (state.count >= MAX_ACCESSIBILITY_TREE_NODES) {
        state.truncated = true;
        break;
      }
      childNodes.push(buildAccessibilityNode(child, state, depth + 1));
    }
    node['children'] = childNodes;
  }

  return node;
}

function handleBuildAccessibilityTree(): ExtensionResponse {
  try {
    const root = document.body || document.documentElement;
    const state: AccessibilityWalkState = { count: 0, truncated: false };
    const tree = buildAccessibilityNode(root, state);
    return {
      success: true,
      data: tree,
      truncated: state.truncated,
      nodeCount: state.count,
    } as ExtensionResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

interface UserRecordedAction {
  type: 'click' | 'input' | 'scroll' | 'navigate';
  selector: string;
  value?: string;
  timestamp: number;
}

const _userRecordedActions: UserRecordedAction[] = [];

function sanitizeRecordedValue(
  target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string | null {
  if (target instanceof HTMLInputElement && target.type === 'password') {
    return null;
  }
  const autocomplete = (target.getAttribute('autocomplete') ?? '').toLowerCase();
  if (
    /^cc-/.test(autocomplete) ||
    autocomplete === 'current-password' ||
    autocomplete === 'new-password' ||
    autocomplete === 'one-time-code'
  ) {
    return '[REDACTED]';
  }
  return redactSecrets(target.value ?? '');
}

let _recordingClickListener: ((e: MouseEvent) => void) | null = null;
let _recordingInputListener: ((e: Event) => void) | null = null;
let _recordingScrollListener: (() => void) | null = null;
let _recordingNavListener: (() => void) | null = null;
let _recordingIndicatorHost: HTMLElement | null = null;

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
  const isValueMode = automationState.captureValues;
  const bgColor = isValueMode ? 'rgba(30,10,10,0.88)' : 'rgba(40,30,5,0.88)';
  const accentColor = isValueMode ? '#ef4444' : '#f59e0b';
  const borderColor = isValueMode ? 'rgba(220,38,38,0.5)' : 'rgba(245,158,11,0.5)';
  style.textContent = `
    .agi-rec-dot {
      display:inline-flex;align-items:center;gap:6px;
      background:${bgColor};color:${accentColor};
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      font-size:12px;font-weight:600;letter-spacing:0.04em;
      padding:5px 12px;border-radius:20px;
      border:1px solid ${borderColor};
      user-select:none;
    }
    .agi-rec-circle {
      width:9px;height:9px;border-radius:50%;
      background:${accentColor};flex-shrink:0;
      animation:agi-rec-pulse 1.1s ease-in-out infinite;
    }
    @keyframes agi-rec-pulse {
      0%,100%{opacity:1;transform:scale(1);}
      50%{opacity:0.4;transform:scale(0.75);}
    }
  `;
  const badge = document.createElement('div');
  badge.className = 'agi-rec-dot';
  const circle = document.createElement('div');
  circle.className = 'agi-rec-circle';
  badge.appendChild(circle);
  const modeLabel = automationState.captureValues ? 'REC (values)' : 'REC (selector only)';
  badge.appendChild(document.createTextNode(modeLabel));
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
    const action: UserRecordedAction = {
      type: 'input',
      selector: buildCssSelector(target),
      timestamp: Date.now(),
    };
    if (automationState.captureValues) {
      const sanitizedValue = sanitizeRecordedValue(target);
      if (sanitizedValue !== null) {
        action.value = sanitizedValue;
      }
    }
    _userRecordedActions.push(action);
  };

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

function handleSetRecordingValueCapture(message: { enabled?: unknown }): ExtensionResponse {
  const enabled = message.enabled === true;
  automationState.captureValues = enabled;
  if (automationState.isRecording) {
    hideRecordingIndicator();
    showRecordingIndicator();
  }
  return { success: true, captureValues: enabled } as ExtensionResponse;
}

function handleStartRecording(): ExtensionResponse {
  automationState.isRecording = true;
  _userRecordedActions.length = 0;

  detachRecordingListeners();
  attachRecordingListeners();
  showRecordingIndicator();

  return { success: true, recording: true } as ExtensionResponse;
}

function handleStopRecording(): ExtensionResponse {
  if (!automationState.isRecording) {
    return { success: true, recording: false } as ExtensionResponse;
  }
  automationState.isRecording = false;
  detachRecordingListeners();
  hideRecordingIndicator();

  const actions = [..._userRecordedActions];
  chrome.runtime
    .sendMessage({
      type: 'STOP_RECORDING',
      actions,
    })
    .catch(() => {
      // Background may not be listening, not fatal
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
  } catch {
    automationState.connectionStatus = 'disconnected';
  }
}

function sendWebMCPTools(tools: WebMCPToolInfo[], url: string): void {
  chrome.runtime
    .sendMessage({
      type: 'WEBMCP_TOOLS_CHANGED',
      tools,
      url,
      timestamp: Date.now(),
    })
    .catch((err) => {
      logger.debug('WebMCP tools notification failed', err);
    });
}

function initWebMCP(): void {
  setTimeout(() => {
    let discoveredTools: WebMCPToolInfo[] = [];
    try {
      const discovery = discoverAllTools();
      discoveredTools = discovery.tools;
      if (discovery.tools.length > 0) {
        logger.info(`WebMCP: discovered ${discovery.tools.length} tool(s)`, {
          tools: discovery.tools.map((t) => t.name),
          url: discovery.url,
        });
        sendWebMCPTools(discovery.tools, discovery.url);
      }
    } catch (err) {
      logger.debug('WebMCP tool discovery failed (non-fatal)', err);
    }

    try {
      startToolChangeReporting(discoveredTools, (tools) => {
        sendWebMCPTools(tools, window.location.href);
      });
    } catch (err) {
      logger.debug('WebMCP startToolChangeReporting failed (non-fatal)', err);
    }
  }, 1000);
}

function createPageInstanceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const webmcpPageInstanceId = createPageInstanceId();
const webmcpBrowserCalls = new Map<string, AbortController>();

function handleWebMCPDiscoverTools(): ExtensionResponse {
  const discovery = discoverAllTools();
  return {
    success: true,
    supported: discovery.supported,
    tools: discovery.tools,
    url: discovery.url,
    pageInstanceId: webmcpPageInstanceId,
  } as ExtensionResponse;
}

async function handleWebMCPCallTool(
  message: import('./types').WebMCPCallToolMessage,
): Promise<ExtensionResponse> {
  const { toolName, arguments: args } = message;
  const binding = message.browserAgentBinding;
  const callId = message.browserAgentCallId;
  if (binding && (typeof callId !== 'string' || !/^[a-f0-9-]{36}$/.test(callId)))
    return { success: false, error: 'The browser site-tool call has no valid identity.' };
  if (binding && webmcpBrowserCalls.has(callId!))
    return { success: false, error: 'This browser site-tool call is already running.' };
  const controller = binding ? new AbortController() : null;
  if (controller) webmcpBrowserCalls.set(callId!, controller);
  const timeout = controller
    ? setTimeout(
        () =>
          controller.abort(
            new DOMException(
              'The website tool timed out; its effects could not be confirmed.',
              'TimeoutError',
            ),
          ),
        BROWSER_COMMAND_TIMEOUT_MS,
      )
    : undefined;
  const assertCurrent = binding
    ? (): void => {
        controller!.signal.throwIfAborted();
        const discovery = discoverAllTools();
        const normalized = normalizeWebMCPToolsUpdate(
          discovery.tools,
          discovery.url,
          window.location.href,
        );
        const descriptor = normalized?.tools.find((tool) => tool.name === toolName);
        if (
          binding.pageInstanceId !== webmcpPageInstanceId ||
          binding.url !== window.location.href ||
          !descriptor ||
          JSON.stringify(descriptor) !== JSON.stringify(binding.descriptor)
        )
          throw new Error('The approved browser document or site tool changed.');
      }
    : undefined;
  try {
    assertCurrent?.();
    const result = await callTool({
      name: toolName,
      arguments: args,
      ...(assertCurrent ? { assertCurrent, source: binding!.descriptor.source } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    assertCurrent?.();
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_WEBMCP_SCHEMA_BYTES)
      return { success: false, error: 'The site-tool result exceeded the browser message limit.' };
    return result as ExtensionResponse;
  } catch {
    return { success: false, error: 'The approved document or site tool could not be verified.' };
  } finally {
    clearTimeout(timeout);
    if (controller && webmcpBrowserCalls.get(callId!) === controller)
      webmcpBrowserCalls.delete(callId!);
  }
}

const VALID_MESSAGE_TYPES = new Set([
  'CLICK',
  'TYPE',
  'GET_TEXT',
  'WAIT_FOR_SELECTOR',
  'GET_PAGE_INFO',
  'RUN_PAGE_ACTIONS',
  'AUTO_FILL_JOB_APPLICATION',
  'GET_CONNECTION_STATUS',
  'CONNECTION_STATUS_CHANGED',
  'TAB_READY',
  'SYNC_PAGE_CONTEXT',
  'FIND_ELEMENTS',
  'FILL_FIELDS',
  'GET_ACCESSIBILITY_TREE',
  'BUILD_ACCESSIBILITY_TREE',
  'START_RECORDING',
  'STOP_RECORDING',
  'GET_RECORDED_ACTIONS',
  'SET_RECORDING_VALUE_CAPTURE',
  'WEBMCP_DISCOVER_TOOLS',
  'WEBMCP_CALL_TOOL',
  'WEBMCP_CANCEL_TOOL',
  'AGI_RUN_AUTOFILL',
  'AGI_CU_WATCH_INPUT',
  'AGI_CU_SHOW_ACTION',
]);

const ACTION_POINT_VISIBLE_MS = 900;

function showActionPoint(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  host.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    ${getExtensionTokensCssAuto(':host')}
    .ring {
      position:absolute; left:-14px; top:-14px; width:28px; height:28px;
      box-sizing:border-box; border-radius:50%;
      border:3px solid var(--agi-ext-accent);
      background:color-mix(in srgb, var(--agi-ext-accent) 22%, transparent);
      animation:agi-action-ring ${ACTION_POINT_VISIBLE_MS}ms ease-out forwards;
    }
    @keyframes agi-action-ring { from { transform:scale(0.5); opacity:1; } to { transform:scale(1.4); opacity:0; } }
    @media (prefers-reduced-motion: reduce) { .ring { animation:none; } }
  `;
  const ring = document.createElement('span');
  ring.className = 'ring';
  root.append(style, ring);
  document.documentElement.appendChild(host);
  setTimeout(() => host.remove(), ACTION_POINT_VISIBLE_MS);
}

const USER_INPUT_REPORT_INTERVAL_MS = 1_000;
const USER_INPUT_EVENTS = ['pointerdown', 'keydown'] as const;
let userInputWatcher: ((event: Event) => void) | null = null;

function watchUserInput(watching: boolean): void {
  if (userInputWatcher) {
    for (const type of USER_INPUT_EVENTS) window.removeEventListener(type, userInputWatcher, true);
    userInputWatcher = null;
  }
  if (!watching) return;
  let lastReportAt = 0;
  userInputWatcher = (event: Event) => {
    if (!event.isTrusted) return;
    const now = Date.now();
    if (now - lastReportAt < USER_INPUT_REPORT_INTERVAL_MS) return;
    lastReportAt = now;
    void chrome.runtime.sendMessage({ type: 'AGI_CU_USER_INPUT' }).catch(() => undefined);
  };
  for (const type of USER_INPUT_EVENTS) window.addEventListener(type, userInputWatcher, true);
}

function isValidMessage(message: unknown): message is ExtensionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;
  return typeof msg['type'] === 'string' && VALID_MESSAGE_TYPES.has(msg['type']);
}

initialize();

export { automationState, handleMessage, checkConnectionStatus };
