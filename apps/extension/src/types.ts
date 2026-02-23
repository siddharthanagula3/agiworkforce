/**
 * Extension types for AGI Workforce browser extension
 * Provides type-safe communication between popup, background, content scripts
 */

// Connection status types
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
export type NativeMessageType =
  | 'CAPTURE_SCREENSHOT'
  | 'CLICK'
  | 'DOUBLE_CLICK'
  | 'RIGHT_CLICK'
  | 'TYPE'
  | 'GET_TEXT'
  | 'GET_ATTRIBUTE'
  | 'SET_ATTRIBUTE'
  | 'WAIT_FOR_SELECTOR'
  | 'EXECUTE_SCRIPT'
  | 'GET_PAGE_INFO'
  | 'GET_FORMS'
  | 'FILL_FORM'
  | 'SUBMIT_FORM'
  | 'GET_CONNECTION_STATUS'
  | 'CONNECTION_STATUS_CHANGED'
  | 'TAB_READY'
  | 'SYNC_PAGE_CONTEXT'
  | 'RUN_PAGE_ACTIONS'
  | 'CAPTURE_ELEMENT'
  | 'GET_ELEMENT_INFO'
  | 'AUTO_FILL_JOB_APPLICATION'
  | 'queue_message'
  | 'open_side_panel';

// Base message structure
export interface BaseMessage {
  type: NativeMessageType;
  timestamp?: number;
  tabId?: number;
}

// Screenshot request/response
export interface CaptureScreenshotMessage extends BaseMessage {
  type: 'CAPTURE_SCREENSHOT';
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
}

export interface CaptureScreenshotResponse {
  success: boolean;
  data?: string;
  error?: string;
  timestamp?: number;
}

// Click action
export interface ClickMessage extends BaseMessage {
  type: 'CLICK';
  selector: string;
  options?: {
    delay?: number;
    button?: 'left' | 'middle' | 'right';
  };
}

export interface ClickResponse {
  success: boolean;
  element?: {
    tag: string;
    id?: string;
    className?: string;
    text?: string;
  };
  error?: string;
}

// Double click action
export interface DoubleClickMessage extends BaseMessage {
  type: 'DOUBLE_CLICK';
  selector: string;
  options?: {
    delay?: number;
  };
}

export interface DoubleClickResponse {
  success: boolean;
  error?: string;
}

// Right click action
export interface RightClickMessage extends BaseMessage {
  type: 'RIGHT_CLICK';
  selector: string;
  options?: {
    delay?: number;
  };
}

export interface RightClickResponse {
  success: boolean;
  error?: string;
}

// Type action
export interface TypeMessage extends BaseMessage {
  type: 'TYPE';
  selector: string;
  text: string;
  options?: {
    delay?: number;
    clear?: boolean;
  };
}

export interface TypeResponse {
  success: boolean;
  charsTyped?: number;
  error?: string;
}

// Get text content
export interface GetTextMessage extends BaseMessage {
  type: 'GET_TEXT';
  selector: string;
}

export interface GetTextResponse {
  success: boolean;
  text?: string;
  error?: string;
}

// Get element attribute
export interface GetAttributeMessage extends BaseMessage {
  type: 'GET_ATTRIBUTE';
  selector: string;
  attribute: string;
}

export interface GetAttributeResponse {
  success: boolean;
  value?: string;
  error?: string;
}

// Set element attribute
export interface SetAttributeMessage extends BaseMessage {
  type: 'SET_ATTRIBUTE';
  selector: string;
  attribute: string;
  value: string;
}

export interface SetAttributeResponse {
  success: boolean;
  error?: string;
}

// Wait for selector
export interface WaitForSelectorMessage extends BaseMessage {
  type: 'WAIT_FOR_SELECTOR';
  selector: string;
  timeout?: number;
  options?: {
    visible?: boolean;
  };
}

export interface WaitForSelectorResponse {
  success: boolean;
  found?: boolean;
  error?: string;
}

// Execute script
export interface ExecuteScriptMessage extends BaseMessage {
  type: 'EXECUTE_SCRIPT';
  script: string;
  args?: unknown[];
}

export interface ExecuteScriptResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

// Get page info
export interface GetPageInfoMessage extends BaseMessage {
  type: 'GET_PAGE_INFO';
}

export interface GetPageInfoResponse {
  success: boolean;
  url?: string;
  title?: string;
  html?: string;
  selectedText?: string;
  error?: string;
}

// Form detection
export interface FormInfo {
  id?: string;
  name?: string;
  method: string;
  action?: string;
  fields: FormField[];
}

export interface FormField {
  name: string;
  type: string;
  value?: string;
  required: boolean;
  options?: string[];
}

export interface GetFormsMessage extends BaseMessage {
  type: 'GET_FORMS';
}

export interface GetFormsResponse {
  success: boolean;
  forms?: FormInfo[];
  error?: string;
}

// Fill form
export interface FillFormMessage extends BaseMessage {
  type: 'FILL_FORM';
  formSelector?: string;
  data: Record<string, string>;
  options?: {
    delay?: number;
  };
}

export interface FillFormResponse {
  success: boolean;
  fieldsFilled?: number;
  error?: string;
}

// Submit form
export interface SubmitFormMessage extends BaseMessage {
  type: 'SUBMIT_FORM';
  formSelector?: string;
}

export interface SubmitFormResponse {
  success: boolean;
  error?: string;
}

// High-level job application autofill (platform-aware)
export interface JobApplicationFiles {
  resumeDataUrl?: string;
  resumeFileName?: string;
  coverLetterDataUrl?: string;
  coverLetterFileName?: string;
}

export interface JobApplicationProfile {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  locationCity?: string;
  locationState?: string;
  locationCountry?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  websiteUrl?: string;
  currentCompany?: string;
  currentTitle?: string;
  yearsOfExperience?: string;
  workAuthorization?: string;
  requiresSponsorship?: boolean | string;
  salaryExpectation?: string;
  resumeText?: string;
  coverLetterText?: string;
  customAnswers?: Record<string, string>;
  files?: JobApplicationFiles;
}

export interface JobAutofillOptions {
  platform?: 'auto' | 'greenhouse' | 'workday' | 'generic';
  autoSubmit?: boolean;
  allowSubmitWithMissingRequired?: boolean;
  includeOptionalFields?: boolean;
  delayMs?: number;
  maxSubmitSteps?: number;
}

export interface AutoFillJobApplicationMessage extends BaseMessage {
  type: 'AUTO_FILL_JOB_APPLICATION';
  profile?: JobApplicationProfile;
  options?: JobAutofillOptions;
}

export interface AutoFillJobApplicationResponse {
  success: boolean;
  platform?: 'greenhouse' | 'workday' | 'generic' | 'unknown';
  filledCount?: number;
  skippedCount?: number;
  genericFlowStarted?: boolean;
  missingRequiredFields?: string[];
  submitted?: boolean;
  stepsAdvanced?: number;
  details?: {
    filledFields: string[];
    skippedFields: string[];
    errors: string[];
  };
  error?: string;
}

// Connection status
export interface ConnectionStatusMessage extends BaseMessage {
  type: 'GET_CONNECTION_STATUS';
}

export interface ConnectionStatusResponse {
  success: boolean;
  nativeConnected: boolean;
  connectionStatus: ConnectionStatus;
  error?: string;
}

// Status change notification
export interface ConnectionStatusChangedMessage extends BaseMessage {
  type: 'CONNECTION_STATUS_CHANGED';
  connected: boolean;
  status: ConnectionStatus;
}

// Tab ready check
export interface TabReadyMessage extends BaseMessage {
  type: 'TAB_READY';
}

export interface TabReadyResponse {
  success: boolean;
  ready: boolean;
}

export interface SyncPageContextMessage extends BaseMessage {
  type: 'SYNC_PAGE_CONTEXT';
  context?: {
    url?: string;
    title?: string;
    html?: string;
    selectedText?: string;
    timestamp?: number;
    reason?: string;
  };
}

export interface RunPageAction {
  id: string;
  type: string;
  selector?: string | null;
  value?: string | null;
  delay?: number | null;
}

export interface RunPageActionsMessage extends BaseMessage {
  type: 'RUN_PAGE_ACTIONS';
  taskId: string;
  actions: RunPageAction[];
}

export interface RunPageActionsResponse {
  success: boolean;
  taskId?: string;
  result?: unknown;
  actionsPerformed?: number;
  duration?: number;
  screenshot?: string;
  error?: string;
}

// Context-menu DOM capture
export interface CaptureElementMessage extends BaseMessage {
  type: 'CAPTURE_ELEMENT';
}

export interface GetElementInfoMessage extends BaseMessage {
  type: 'GET_ELEMENT_INFO';
}

export interface ElementInfoResponse {
  success: boolean;
  element?: Record<string, unknown>;
  error?: string;
}

// Queue message — sent from side panel to background to forward text to the desktop app
export interface QueueMessageMessage extends BaseMessage {
  type: 'queue_message';
  id: string;
  text: string;
  tabId: number;
  timestamp: number;
}

// Open side panel — sent from content script FAB button to background
export interface OpenSidePanelMessage extends BaseMessage {
  type: 'open_side_panel';
}

// Union types for all messages
export type ExtensionMessage =
  | CaptureScreenshotMessage
  | ClickMessage
  | DoubleClickMessage
  | RightClickMessage
  | TypeMessage
  | GetTextMessage
  | GetAttributeMessage
  | SetAttributeMessage
  | WaitForSelectorMessage
  | ExecuteScriptMessage
  | GetPageInfoMessage
  | GetFormsMessage
  | FillFormMessage
  | SubmitFormMessage
  | ConnectionStatusMessage
  | ConnectionStatusChangedMessage
  | TabReadyMessage
  | SyncPageContextMessage
  | RunPageActionsMessage
  | CaptureElementMessage
  | GetElementInfoMessage
  | AutoFillJobApplicationMessage
  | QueueMessageMessage
  | OpenSidePanelMessage;

export type ExtensionResponse =
  | CaptureScreenshotResponse
  | ClickResponse
  | DoubleClickResponse
  | RightClickResponse
  | TypeResponse
  | GetTextResponse
  | GetAttributeResponse
  | SetAttributeResponse
  | WaitForSelectorResponse
  | ExecuteScriptResponse
  | GetPageInfoResponse
  | GetFormsResponse
  | FillFormResponse
  | SubmitFormResponse
  | ConnectionStatusResponse
  | TabReadyResponse
  | RunPageActionsResponse
  | ElementInfoResponse
  | AutoFillJobApplicationResponse;

// Popup state
export interface PopupState {
  sessionStartTime: number;
  actionCount: number;
  isConnected: boolean;
}

// Extension configuration
export interface ExtensionConfig {
  desktopAppPort: number;
  desktopAppUrl: string;
  enableLogging: boolean;
  maxRetries: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
}

// Rate limiting state
export interface RateLimitState {
  count: number;
  resetTime: number;
  lastScreenshot: number;
}

// Automation state
export interface AutomationState {
  isControlled: boolean;
  highlightedElement: Element | null;
  isRecording: boolean;
  recordedActions: RecordedAction[];
  connectionStatus: ConnectionStatus;
}

// Recorded action for replay
export interface RecordedAction {
  type: NativeMessageType;
  selector?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// Safe type for chrome runtime
export interface ChromeExtensionAPI {
  runtime: {
    id: string;
    onMessage: {
      addListener: (
        callback: (
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: ExtensionResponse) => void,
        ) => boolean | void,
      ) => void;
    };
    sendMessage: (message: ExtensionMessage) => Promise<ExtensionResponse>;
  };
  tabs: {
    query: (query: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
    get: (tabId: number) => Promise<chrome.tabs.Tab>;
    executeScript: (tabId: number, details: chrome.tabs.InjectDetails) => Promise<unknown[]>;
  };
  storage: {
    local: {
      get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      clear: () => Promise<void>;
    };
    onChanged: {
      addListener: (
        callback: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void,
      ) => void;
    };
  };
}
