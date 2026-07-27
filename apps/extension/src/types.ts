import type { RoutingTaskType } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import type {
  ManagedCloudAgentRunReference,
  ToolApprovalDecisionWire,
} from '@agiworkforce/cloud-contracts';

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
  | 'GET_CLOUD_AUTH_TOKEN'
  | 'RECONNECT_NATIVE'
  | 'CONNECTION_STATUS_CHANGED'
  | 'TAB_READY'
  | 'SYNC_PAGE_CONTEXT'
  | 'APPROVE_CONTEXT_HANDOFF'
  | 'CANCEL_CONTEXT_HANDOFF'
  | 'RUN_PAGE_ACTIONS'
  | 'CAPTURE_ELEMENT'
  | 'GET_ELEMENT_INFO'
  | 'AUTO_FILL_JOB_APPLICATION'
  | 'QUEUE_MESSAGE'
  | 'CHAT_MESSAGE'
  | 'CANCEL_STREAM'
  | 'RESUME_CHAT_RUN'
  | 'RESOLVE_CHAT_APPROVAL'
  | 'OPEN_SIDE_PANEL'
  | 'OPEN_IN_DESKTOP'
  | 'GET_COOKIES'
  | 'SET_COOKIE'
  | 'CLEAR_COOKIES'
  | 'GET_ALL_TABS'
  | 'CREATE_TAB'
  | 'CLOSE_TAB'
  | 'SWITCH_TAB'
  | 'GET_ACCESSIBILITY_TREE'
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'GET_RECORDED_ACTIONS'
  | 'SELECT_OPTION'
  | 'CHECK'
  | 'UNCHECK'
  | 'FOCUS'
  | 'BLUR'
  | 'HOVER'
  | 'SCROLL'
  | 'DRAG_DROP'
  | 'CLICK_AT_COORDINATES'
  | 'BUILD_ACCESSIBILITY_TREE'
  | 'BRIDGE_URL_CHANGED'
  | 'WEBMCP_DISCOVER_TOOLS'
  | 'WEBMCP_CALL_TOOL'
  | 'WEBMCP_TOOLS_CHANGED'
  | 'NLWEB_DETECTED'
  | 'GET_CONSOLE_LOGS'
  | 'CLEAR_CONSOLE_LOGS'
  | 'SAVE_SHORTCUT'
  | 'LIST_SHORTCUTS'
  | 'DELETE_SHORTCUT'
  | 'REPLAY_SHORTCUT'
  | 'ADD_TAB_TO_GROUP'
  | 'REMOVE_TAB_FROM_GROUP'
  | 'CREATE_SCHEDULED_TASK'
  | 'LIST_SCHEDULED_TASKS'
  | 'UPDATE_SCHEDULED_TASK'
  | 'DELETE_SCHEDULED_TASK'
  | 'LIST_MEMORIES'
  | 'ADD_MEMORY'
  | 'UPDATE_MEMORY'
  | 'DELETE_MEMORY'
  | 'GET_QUICK_MODE'
  | 'SET_QUICK_MODE';

/** Internal-only messages between extension contexts — NOT sent to native host. */
export type InternalMessageType = 'CHAT_CHUNK' | 'PAYWALL_HIT';

export type InternalMessage = ChatChunkMessage | PaywallHitMessage;

// Base message structure
export interface BaseMessage {
  type: NativeMessageType;
  timestamp?: number;
  tabId?: number;
}

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

export interface GetTextMessage extends BaseMessage {
  type: 'GET_TEXT';
  selector: string;
}

export interface GetTextResponse {
  success: boolean;
  text?: string;
  error?: string;
}

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

export interface SubmitFormMessage extends BaseMessage {
  type: 'SUBMIT_FORM';
  formSelector?: string;
}

export interface SubmitFormResponse {
  success: boolean;
  error?: string;
}

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
  /** When true, a browser confirm() dialog is shown before submitting. */
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

export interface ConnectionStatusMessage extends BaseMessage {
  type: 'GET_CONNECTION_STATUS';
}

export interface GetCloudAuthTokenMessage extends BaseMessage {
  type: 'GET_CLOUD_AUTH_TOKEN';
  refresh: boolean;
}

export interface GetCloudAuthTokenResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export interface ReconnectNativeMessage extends BaseMessage {
  type: 'RECONNECT_NATIVE';
}

export interface ConnectionStatusResponse {
  success: boolean;
  nativeConnected: boolean;
  connectionStatus: ConnectionStatus;
  error?: string;
}

export interface ConnectionStatusChangedMessage extends BaseMessage {
  type: 'CONNECTION_STATUS_CHANGED';
  connected: boolean;
  status: ConnectionStatus;
}

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
    metadata?: import('./page-metadata').PageMetadata;
  };
  /** Structured page metadata (JSON-LD, Open Graph, Twitter Card, etc.) */
  metadata?: import('./page-metadata').PageMetadata;
}

export interface ApproveContextHandoffMessage extends BaseMessage {
  type: 'APPROVE_CONTEXT_HANDOFF';
  handoffId: string;
}

export interface CancelContextHandoffMessage extends BaseMessage {
  type: 'CANCEL_CONTEXT_HANDOFF';
  handoffId: string;
}

export interface ContextHandoffResponse {
  success: boolean;
  error?: string;
  consumed?: boolean;
  destination?: 'AGI Desktop';
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
  type: 'QUEUE_MESSAGE';
  id: string;
  text: string;
  tabId?: number;
  timestamp: number;
}

// Chat message — sent from side panel to background to stream an AI response
export interface ChatMessageMessage extends BaseMessage {
  type: 'CHAT_MESSAGE';
  /** Per-extension-view nonce used to prevent cross-panel stream delivery. */
  clientInstanceId: string;
  id: string;
  text: string;
  pageContext?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /**
   * Inline data-URL attachments collected from the side panel composer
   * (paste-image, file picker). Round-2 audit P0 #3 (chrome-ext wire fix,
   * 2026-05-21) — the side panel previously cleared `pendingAttachments`
   * before constructing the CHAT_MESSAGE so the model never saw them.
   * Managed cloud converts supported image data URLs into multimodal content
   * blocks. The local desktop bridge does not yet expose a verified image
   * contract, so that route fails visibly instead of discarding image bytes.
   */
  attachments?: string[];
  /**
   * When true, the bridge should forward `thinking` to providers that
   * support it (Anthropic thinking blocks, OpenAI reasoning effort,
   * Gemini thinkingBudget). Side panel sets this from the user's
   * Extended Thinking toggle.
   */
  extendedThinking?: boolean;
  /** User-visible model selection. `auto` is resolved to a concrete model. */
  modelSelection?: string;
  /** Route this turn through Auto Economy without changing the saved picker selection. */
  quickMode?: boolean;
  /** Prior successful route for prompt-cache continuity in this conversation. */
  currentModelKey?: string;
  previousTaskType?: RoutingTaskType;
}

export interface CancelStreamMessage extends BaseMessage {
  type: 'CANCEL_STREAM';
  clientInstanceId: string;
  id: string;
  cloudRun?: ManagedCloudAgentRunReference;
}

export interface ResumeChatRunMessage extends BaseMessage {
  type: 'RESUME_CHAT_RUN';
  clientInstanceId: string;
  id: string;
  cloudRun: ManagedCloudAgentRunReference;
  alreadyVisibleText: string;
}

export interface ResolveChatApprovalMessage extends BaseMessage {
  type: 'RESOLVE_CHAT_APPROVAL';
  clientInstanceId: string;
  id: string;
  cloudRun: ManagedCloudAgentRunReference;
  toolApprovals: ToolApprovalDecisionWire[];
}

// Chat chunk — sent from background to side panel as streaming response arrives
export interface ChatChunkMessage {
  type: 'CHAT_CHUNK';
  clientInstanceId: string;
  id: string;
  text: string;
  done: boolean;
  error?: string;
  agentEvent?: AgentEventEnvelope;
  durableReplay?: true;
  cloudRun?: ManagedCloudAgentRunReference;
  routing?: {
    modelKey: string;
    taskType: RoutingTaskType;
    reason: string;
  };
}

/**
 * Paywall hit — sent from background to all extension views (popup, side panel)
 * when the API returns 429 + { kind:'paywall', feature, requiredTier, reason }.
 * Mirrors PaywallFeature / PaywallRequiredTier from providerStreamClient.ts.
 */
export interface PaywallHitMessage {
  type: 'PAYWALL_HIT';
  feature: string;
  requiredTier: string;
  reason?: string;
}

export interface ChatMessageResponse {
  success: boolean;
  error?: string;
}

// Open side panel — sent from content script FAB button to background (intra-extension only, not native messaging)
export interface OpenSidePanelMessage extends BaseMessage {
  type: 'OPEN_SIDE_PANEL';
}

// Open in desktop — forwarded to the desktop app via native bridge (Claude/Comet parity)
export interface OpenInDesktopMessage extends BaseMessage {
  type: 'OPEN_IN_DESKTOP';
}

export interface GetCookiesMessage extends BaseMessage {
  type: 'GET_COOKIES';
  url: string;
}

export interface GetCookiesResponse {
  success: boolean;
  data?: chrome.cookies.Cookie[];
  error?: string;
}

export interface CookieDetails {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  url?: string;
}

export interface SetCookieMessage extends BaseMessage {
  type: 'SET_COOKIE';
  cookie: CookieDetails;
}

export interface SetCookieResponse {
  success: boolean;
  error?: string;
}

export interface ClearCookiesMessage extends BaseMessage {
  type: 'CLEAR_COOKIES';
  url: string;
}

export interface ClearCookiesResponse {
  success: boolean;
  cleared?: number;
  error?: string;
}

export interface GetAllTabsMessage extends BaseMessage {
  type: 'GET_ALL_TABS';
}

export interface TabInfo {
  id?: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
  active?: boolean;
  windowId?: number;
  status?: string;
}

export interface GetAllTabsResponse {
  success: boolean;
  data?: TabInfo[];
  error?: string;
}

export interface CreateTabMessage extends BaseMessage {
  type: 'CREATE_TAB';
  url: string;
  active?: boolean;
}

export interface CreateTabResponse {
  success: boolean;
  data?: TabInfo;
  error?: string;
}

export interface CloseTabMessage extends BaseMessage {
  type: 'CLOSE_TAB';
  tabId: number;
}

export interface CloseTabResponse {
  success: boolean;
  error?: string;
}

export interface SwitchTabMessage extends BaseMessage {
  type: 'SWITCH_TAB';
  tabId: number;
}

export interface SwitchTabResponse {
  success: boolean;
  error?: string;
}

export interface GetAccessibilityTreeMessage extends BaseMessage {
  type: 'GET_ACCESSIBILITY_TREE';
}

export interface BuildAccessibilityTreeMessage extends BaseMessage {
  type: 'BUILD_ACCESSIBILITY_TREE';
}

export interface GetAccessibilityTreeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface StartRecordingMessage extends BaseMessage {
  type: 'START_RECORDING';
}

export interface StopRecordingMessage extends BaseMessage {
  type: 'STOP_RECORDING';
}

export interface GetRecordedActionsMessage extends BaseMessage {
  type: 'GET_RECORDED_ACTIONS';
}

export interface RecordingResponse {
  success: boolean;
  recording?: boolean;
  actions?: RecordedAction[];
  error?: string;
}

export interface SelectOptionMessage extends BaseMessage {
  type: 'SELECT_OPTION';
  selector: string;
  value: string;
}

export interface CheckMessage extends BaseMessage {
  type: 'CHECK';
  selector: string;
}

export interface UncheckMessage extends BaseMessage {
  type: 'UNCHECK';
  selector: string;
}

export interface FocusMessage extends BaseMessage {
  type: 'FOCUS';
  selector: string;
}

export interface BlurMessage extends BaseMessage {
  type: 'BLUR';
  selector: string;
}

export interface HoverMessage extends BaseMessage {
  type: 'HOVER';
  selector: string;
}

export interface ScrollMessage extends BaseMessage {
  type: 'SCROLL';
  selector?: string;
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
}

export interface DragDropMessage extends BaseMessage {
  type: 'DRAG_DROP';
  sourceSelector: string;
  targetSelector: string;
}

export interface ClickAtCoordinatesMessage extends BaseMessage {
  type: 'CLICK_AT_COORDINATES';
  x: number;
  y: number;
  button?: 'left' | 'middle' | 'right';
}

// Bridge URL changed (side panel → background)
export interface BridgeUrlChangedMessage extends BaseMessage {
  type: 'BRIDGE_URL_CHANGED';
  url?: string;
}

export interface WebMCPToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  source: 'imperative' | 'declarative';
}

export interface WebMCPDiscoverToolsMessage extends BaseMessage {
  type: 'WEBMCP_DISCOVER_TOOLS';
}

export interface WebMCPDiscoverToolsResponse {
  success: boolean;
  supported: boolean;
  tools: WebMCPToolInfo[];
  url?: string;
  error?: string;
}

export interface WebMCPCallToolMessage extends BaseMessage {
  type: 'WEBMCP_CALL_TOOL';
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface WebMCPCallToolResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface WebMCPToolsChangedMessage extends BaseMessage {
  type: 'WEBMCP_TOOLS_CHANGED';
  tools: WebMCPToolInfo[];
  url?: string;
}

export interface NLWebDetectedMessage extends BaseMessage {
  type: 'NLWEB_DETECTED';
  nlweb: import('./nlweb').NLWebDetectionResult;
  url?: string;
}

export interface AddTabToGroupMessage extends BaseMessage {
  type: 'ADD_TAB_TO_GROUP';
}

export interface RemoveTabFromGroupMessage extends BaseMessage {
  type: 'REMOVE_TAB_FROM_GROUP';
}

export interface TabGroupResponse {
  success: boolean;
  grouped?: boolean;
  error?: string;
}

export interface ConsoleLogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
}

export interface GetConsoleLogsMessage extends BaseMessage {
  type: 'GET_CONSOLE_LOGS';
}

export interface GetConsoleLogsResponse {
  success: boolean;
  logs?: ConsoleLogEntry[];
  error?: string;
}

export interface ClearConsoleLogsMessage extends BaseMessage {
  type: 'CLEAR_CONSOLE_LOGS';
}

export interface ClearConsoleLogsResponse {
  success: boolean;
  error?: string;
}

export interface SavedShortcut {
  id: string;
  name: string;
  actions: RunPageAction[];
  createdAt: number;
  /**
   * SECURITY (C-03 audit 2026-05-19): origin that created this shortcut.
   * Sentinel `__extension_page__` for shortcuts saved from the side-panel UI.
   * Real URL origins (e.g. `https://example.com`) for any future
   * content-script-callable variant. Fire-time replay re-checks this against
   * the current `agi_site_allowlist` and auto-deletes stale records.
   */
  createdByOrigin: string;
  url?: string;
  prompt?: string;
  startUrl?: string;
  scheduled?: boolean;
}

export interface SaveShortcutMessage extends BaseMessage {
  type: 'SAVE_SHORTCUT';
  name: string;
  actions: RunPageAction[];
  url?: string;
  prompt?: string;
  startUrl?: string;
  scheduled?: boolean;
}

export interface ListShortcutsMessage extends BaseMessage {
  type: 'LIST_SHORTCUTS';
}

export interface DeleteShortcutMessage extends BaseMessage {
  type: 'DELETE_SHORTCUT';
  shortcutId: string;
}

export interface ReplayShortcutMessage extends BaseMessage {
  type: 'REPLAY_SHORTCUT';
  shortcutId: string;
}

export interface ShortcutResponse {
  success: boolean;
  shortcuts?: SavedShortcut[];
  error?: string;
}

export type ScheduleType = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  scheduleType: ScheduleType;
  /** Minutes for hourly, HH:MM for daily, day+HH:MM for weekly/monthly */
  scheduleValue: string;
  /** Either a shortcutId to replay OR a prompt to send as chat */
  shortcutId?: string;
  prompt?: string;
  createdAt: number;
  lastRun?: number;
  /**
   * SECURITY (C-02 audit 2026-05-19): origin that created this task.
   * Sentinel `__extension_page__` for tasks created from the side-panel
   * Workflows tab. Real URL origins for any future content-script-callable
   * variant. `executeScheduledTask` re-checks at alarm-fire time and
   * auto-deletes tasks whose origin is no longer on `agi_site_allowlist`.
   */
  createdByOrigin: string;
}

export interface CreateScheduledTaskMessage extends BaseMessage {
  type: 'CREATE_SCHEDULED_TASK';
  task: Omit<ScheduledTask, 'id' | 'createdAt' | 'lastRun'>;
}

export interface ListScheduledTasksMessage extends BaseMessage {
  type: 'LIST_SCHEDULED_TASKS';
}

export interface UpdateScheduledTaskMessage extends BaseMessage {
  type: 'UPDATE_SCHEDULED_TASK';
  taskId: string;
  updates: Partial<
    Pick<
      ScheduledTask,
      'name' | 'enabled' | 'scheduleType' | 'scheduleValue' | 'shortcutId' | 'prompt'
    >
  >;
}

export interface DeleteScheduledTaskMessage extends BaseMessage {
  type: 'DELETE_SCHEDULED_TASK';
  taskId: string;
}

export interface ScheduledTaskResponse {
  success: boolean;
  tasks?: ScheduledTask[];
  error?: string;
}

/** Quick mode: when true, the next turn uses the admitted Auto Economy routing profile. */
export interface GetQuickModeMessage extends BaseMessage {
  type: 'GET_QUICK_MODE';
}

export interface SetQuickModeMessage extends BaseMessage {
  type: 'SET_QUICK_MODE';
  enabled: boolean;
}

export interface GetQuickModeResponse {
  success: boolean;
  enabled?: boolean;
  error?: string;
}

/**
 * Sent from the side panel to the CONTENT SCRIPT to trigger the fast-path
 * autofill + escalation-decision sequence. Content script runs the autofill,
 * calls makeEscalationDecision, and returns the result as the sendResponse.
 *
 * SECURITY: gated by sender.id === chrome.runtime.id in the content-script
 * handleMessage guard (line ~191). Only the extension itself can send this.
 */
export interface RunAutofillMessage {
  type: 'AGI_RUN_AUTOFILL';
  /** Optional — preserved for compatibility with ExtensionMessage union members
   *  that expect a tabId field on the shared message type. */
  tabId?: number;
}

/**
 * Sent from the SIDE PANEL (trusted extension UI) to the BACKGROUND service
 * worker to start the computer-use agent loop. The background re-validates the
 * tab's origin against siteAllowlistCache before invoking runAgentLoop().
 *
 * SECURITY: 'AGI_START_COMPUTER_USE' is added to EXTENSION_PAGE_ONLY_MESSAGE_TYPES
 * in policy.ts, so a content script on an allowlisted site cannot trigger the
 * CDP loop — only the extension UI can.
 */
export interface StartComputerUseMessage {
  type: 'AGI_START_COMPUTER_USE';
  goal: string;
  tabId: number;
}

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
  | GetCloudAuthTokenMessage
  | ReconnectNativeMessage
  | ConnectionStatusChangedMessage
  | TabReadyMessage
  | SyncPageContextMessage
  | RunPageActionsMessage
  | CaptureElementMessage
  | GetElementInfoMessage
  | AutoFillJobApplicationMessage
  | QueueMessageMessage
  | ChatMessageMessage
  | CancelStreamMessage
  | ResumeChatRunMessage
  | ResolveChatApprovalMessage
  | OpenSidePanelMessage
  | OpenInDesktopMessage
  | GetCookiesMessage
  | SetCookieMessage
  | ClearCookiesMessage
  | GetAllTabsMessage
  | CreateTabMessage
  | CloseTabMessage
  | SwitchTabMessage
  | GetAccessibilityTreeMessage
  | BuildAccessibilityTreeMessage
  | StartRecordingMessage
  | StopRecordingMessage
  | GetRecordedActionsMessage
  | SelectOptionMessage
  | CheckMessage
  | UncheckMessage
  | FocusMessage
  | BlurMessage
  | HoverMessage
  | ScrollMessage
  | DragDropMessage
  | ClickAtCoordinatesMessage
  | BridgeUrlChangedMessage
  | WebMCPDiscoverToolsMessage
  | WebMCPCallToolMessage
  | WebMCPToolsChangedMessage
  | NLWebDetectedMessage
  | AddTabToGroupMessage
  | RemoveTabFromGroupMessage
  | GetConsoleLogsMessage
  | ClearConsoleLogsMessage
  | SaveShortcutMessage
  | ListShortcutsMessage
  | DeleteShortcutMessage
  | ReplayShortcutMessage
  | CreateScheduledTaskMessage
  | ListScheduledTasksMessage
  | UpdateScheduledTaskMessage
  | DeleteScheduledTaskMessage
  | GetQuickModeMessage
  | SetQuickModeMessage
  | RunAutofillMessage
  | StartComputerUseMessage
  | ApproveContextHandoffMessage
  | CancelContextHandoffMessage;

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
  | GetCloudAuthTokenResponse
  | TabReadyResponse
  | RunPageActionsResponse
  | ElementInfoResponse
  | AutoFillJobApplicationResponse
  | ChatMessageResponse
  | GetCookiesResponse
  | SetCookieResponse
  | ClearCookiesResponse
  | GetAllTabsResponse
  | CreateTabResponse
  | CloseTabResponse
  | SwitchTabResponse
  | GetAccessibilityTreeResponse
  | RecordingResponse
  | WebMCPDiscoverToolsResponse
  | WebMCPCallToolResponse
  | TabGroupResponse
  | GetConsoleLogsResponse
  | ClearConsoleLogsResponse
  | ShortcutResponse
  | ScheduledTaskResponse
  | GetQuickModeResponse
  | ContextHandoffResponse;

export interface PopupState {
  sessionStartTime: number;
  actionCount: number;
  isConnected: boolean;
}

export interface ExtensionConfig {
  desktopAppPort: number;
  desktopAppUrl: string;
  enableLogging: boolean;
  maxRetries: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
}

export interface RateLimitState {
  count: number;
  resetTime: number;
  lastScreenshot: number;
}

export interface AutomationState {
  isControlled: boolean;
  highlightedElement: Element | null;
  isRecording: boolean;
  recordedActions: RecordedAction[];
  connectionStatus: ConnectionStatus;
  /**
   * SECURITY (C-05 audit 2026-05-19): recorder defaults to selector-only.
   * Set to true via SET_RECORDING_VALUE_CAPTURE (extension-page-only) when
   * the user opts in. Even when true, password / cc-* / one-time-code
   * fields are redacted, and `redactSecrets` runs over remaining values
   * to catch API keys mid-stream.
   */
  captureValues: boolean;
}

export interface RecordedAction {
  type: NativeMessageType;
  selector?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}
