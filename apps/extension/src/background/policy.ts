import type { RunPageAction, ScheduledTask, WebMCPToolInfo } from '../types';
import { redactSecrets } from '@agiworkforce/utils/logger';

export type SenderClass = 'extension-page-only' | 'allowlisted-tab' | 'discovery';

export interface MessageTypePolicy {
  senderClass: SenderClass;
  allowsCrossTab: boolean;
}

const DEFAULT_POLICY: MessageTypePolicy = {
  senderClass: 'allowlisted-tab',
  allowsCrossTab: true,
};

export const MESSAGE_POLICY: Record<string, MessageTypePolicy> = {
  TYPE: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  CLICK: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  SET_LOCAL_STORAGE: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  CLEAR_LOCAL_STORAGE: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  SUBMIT_FORM: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  SELECT_OPTION: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  CHECK: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  UNCHECK: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  FOCUS: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  BLUR: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  HOVER: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  SCROLL: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  DRAG_DROP: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  CLICK_AT_COORDINATES: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  EXECUTE_SCRIPT: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  RUN_PAGE_ACTIONS: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  AUTO_FILL_JOB_APPLICATION: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  DOUBLE_CLICK: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  RIGHT_CLICK: { senderClass: 'allowlisted-tab', allowsCrossTab: false },
  FILL_FORM: { senderClass: 'allowlisted-tab', allowsCrossTab: false },

  CREATE_SCHEDULED_TASK: { senderClass: 'extension-page-only', allowsCrossTab: true },
  UPDATE_SCHEDULED_TASK: { senderClass: 'extension-page-only', allowsCrossTab: true },
  DELETE_SCHEDULED_TASK: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SAVE_SHORTCUT: { senderClass: 'extension-page-only', allowsCrossTab: true },
  DELETE_SHORTCUT: { senderClass: 'extension-page-only', allowsCrossTab: true },
  REPLAY_SHORTCUT: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SET_RECORDING_VALUE_CAPTURE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CANCEL_STREAM: { senderClass: 'extension-page-only', allowsCrossTab: true },
  RESUME_CHAT_RUN: { senderClass: 'extension-page-only', allowsCrossTab: true },
  RESOLVE_CHAT_APPROVAL: { senderClass: 'extension-page-only', allowsCrossTab: true },
  MANAGED_CLOUD_AUTH_CHANGED: { senderClass: 'extension-page-only', allowsCrossTab: true },
  APPROVE_CONTEXT_HANDOFF: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CANCEL_CONTEXT_HANDOFF: { senderClass: 'extension-page-only', allowsCrossTab: true },
  AGI_START_COMPUTER_USE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CANCEL_COMPUTER_USE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_COMPUTER_USE_STATE: { senderClass: 'extension-page-only', allowsCrossTab: true },

  CHAT_MESSAGE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  WEBMCP_DISCOVER_TOOLS: { senderClass: 'extension-page-only', allowsCrossTab: true },
  WEBMCP_CALL_TOOL: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_CLOUD_AUTH_TOKEN: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_ALL_TABS: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CREATE_TAB: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CLOSE_TAB: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SWITCH_TAB: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SET_COOKIE: { senderClass: 'extension-page-only', allowsCrossTab: true },

  SYNC_CONVERSATION: { senderClass: 'extension-page-only', allowsCrossTab: true },
  DELETE_CLOUD_CONVERSATION: { senderClass: 'extension-page-only', allowsCrossTab: true },

  LIST_MEMORIES: { senderClass: 'extension-page-only', allowsCrossTab: true },
  ADD_MEMORY: { senderClass: 'extension-page-only', allowsCrossTab: true },
  UPDATE_MEMORY: { senderClass: 'extension-page-only', allowsCrossTab: true },
  DELETE_MEMORY: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_QUICK_MODE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SET_QUICK_MODE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_TAB_GROUP_STATE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  ADD_TAB_TO_GROUP: { senderClass: 'extension-page-only', allowsCrossTab: true },
  REMOVE_TAB_FROM_GROUP: { senderClass: 'extension-page-only', allowsCrossTab: true },

  QUEUE_MESSAGE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  RECONNECT_NATIVE: { senderClass: 'extension-page-only', allowsCrossTab: true },

  TAB_READY: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  SYNC_PAGE_CONTEXT: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  GET_CONNECTION_STATUS: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  CAPTURE_SCREENSHOT: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  GET_ACCESSIBILITY_TREE: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  OPEN_SIDE_PANEL: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  IN_PAGE_PROMPT: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  NLWEB_PROBE: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  NLWEB_DETECTED: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  WEBMCP_TOOLS_CHANGED: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  START_RECORDING: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  STOP_RECORDING: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  GET_RECORDED_ACTIONS: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  LIST_SHORTCUTS: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  LIST_SCHEDULED_TASKS: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  BRIDGE_URL_CHANGED: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
};

export function getMessagePolicy(type: string): MessageTypePolicy {
  return MESSAGE_POLICY[type] ?? DEFAULT_POLICY;
}

export interface ExtensionPageSenderIdentity {
  id?: string;
  url?: string;
  origin?: string;
  tabId?: number;
  tabUrl?: string;
  hasTab?: boolean;
}

export function isTrustedExtensionPageSender(
  sender: ExtensionPageSenderIdentity,
  extensionId: string,
  extensionOrigin: string,
): boolean {
  if (sender.id !== extensionId) return false;

  const candidates = [sender.url, sender.origin, sender.tabUrl].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (candidates.length === 0) return sender.hasTab !== true;

  const normalizedOrigin = extensionOrigin.replace(/\/+$/, '');
  return candidates.some(
    (value) => value === normalizedOrigin || value.startsWith(`${normalizedOrigin}/`),
  );
}

export function resolveMessageTargetTabId(
  sender: ExtensionPageSenderIdentity,
  requestedTabId: unknown,
  extensionId: string,
  extensionOrigin: string,
): number | undefined {
  const validTabId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const senderTabId = validTabId(sender.tabId) ? sender.tabId : undefined;
  const explicitTabId = validTabId(requestedTabId) ? requestedTabId : undefined;
  return isTrustedExtensionPageSender(sender, extensionId, extensionOrigin)
    ? (explicitTabId ?? senderTabId)
    : (senderTabId ?? explicitTabId);
}

export const DISCOVERY_MESSAGE_TYPES: ReadonlySet<string> = new Set(
  Object.entries(MESSAGE_POLICY)
    .filter(([, p]) => p.senderClass === 'discovery')
    .map(([t]) => t),
);

export const DOM_MUTATION_MESSAGE_TYPES: ReadonlySet<string> = new Set(
  Object.entries(MESSAGE_POLICY)
    .filter(([, p]) => p.allowsCrossTab === false)
    .map(([t]) => t),
);

export const EXTENSION_PAGE_ONLY_MESSAGE_TYPES: ReadonlySet<string> = new Set(
  Object.entries(MESSAGE_POLICY)
    .filter(([, p]) => p.senderClass === 'extension-page-only')
    .map(([t]) => t),
);

export const SITE_ALLOWLIST_STORAGE_KEY = 'agi_site_allowlist';

export const MAX_CONTEXT_HTML_CHARS = 100_000;

export const MAX_JSON_LD_BYTES = 256 * 1024;
export const MAX_WEBMCP_SCHEMA_BYTES = 64 * 1024;
export const MAX_NLWEB_PROBE_BYTES = 256 * 1024;
export const MAX_WEBMCP_TOOLS = 64;
const MAX_WEBMCP_TOOL_NAME_CHARS = 64;
const MAX_WEBMCP_TOOL_DESCRIPTION_CHARS = 500;
const MAX_WEBMCP_PAGE_URL_CHARS = 2_048;
const WEBMCP_TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_. -]{0,63}$/;

export function safeJsonParse<T = unknown>(
  text: string | null | undefined,
  maxBytes: number,
): T | undefined {
  if (typeof text !== 'string') return undefined;
  if (text.length > maxBytes) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export interface NormalizedWebMCPToolsUpdate {
  tools: WebMCPToolInfo[];
  url: string;
}

export function normalizeWebMCPPageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_WEBMCP_PAGE_URL_CHARS) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const normalized = `${parsed.origin}${parsed.pathname}`;
    return normalized.length <= MAX_WEBMCP_PAGE_URL_CHARS ? normalized : null;
  } catch {
    return null;
  }
}

function cloneBoundedWebMCPInputSchema(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (
      typeof serialized !== 'string' ||
      new TextEncoder().encode(serialized).byteLength > MAX_WEBMCP_SCHEMA_BYTES
    ) {
      return null;
    }
    const cloned = JSON.parse(serialized) as unknown;
    return cloned && typeof cloned === 'object' && !Array.isArray(cloned)
      ? (cloned as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function normalizeWebMCPToolsUpdate(
  value: unknown,
  reportedUrl: unknown,
  senderTabUrl: unknown,
): NormalizedWebMCPToolsUpdate | null {
  if (!Array.isArray(value) || value.length > MAX_WEBMCP_TOOLS) return null;
  const url = normalizeWebMCPPageUrl(senderTabUrl);
  if (!url) return null;
  if (reportedUrl !== undefined) {
    const normalizedReportedUrl = normalizeWebMCPPageUrl(reportedUrl);
    if (!normalizedReportedUrl || normalizedReportedUrl !== url) return null;
  }

  const names = new Set<string>();
  const tools: WebMCPToolInfo[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
    const rawDescription = record['description'];
    const source = record['source'];
    if (
      name.length === 0 ||
      name.length > MAX_WEBMCP_TOOL_NAME_CHARS ||
      !WEBMCP_TOOL_NAME_PATTERN.test(name) ||
      names.has(name) ||
      typeof rawDescription !== 'string' ||
      rawDescription.length > MAX_WEBMCP_TOOL_DESCRIPTION_CHARS ||
      (source !== 'imperative' && source !== 'declarative')
    ) {
      return null;
    }
    names.add(name);
    const description = sanitizePageText(rawDescription).trim();
    const inputSchema =
      record['inputSchema'] === undefined
        ? undefined
        : cloneBoundedWebMCPInputSchema(record['inputSchema']);
    if (record['inputSchema'] !== undefined && !inputSchema) return null;
    tools.push({
      name,
      description,
      source,
      ...(inputSchema ? { inputSchema } : {}),
    });
  }
  return { tools, url };
}

export const ALLOWED_BRIDGE_HOSTS = new Set<string>(['localhost', '127.0.0.1', '[::1]']);

export const DEFAULT_AGI_BRIDGE_URL = 'http://localhost:8787';

export function validateBridgeUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const normalized = raw.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!ALLOWED_BRIDGE_HOSTS.has(parsed.hostname)) return null;
    return normalized.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export const ALLOWED_SHORTCUT_ACTION_TYPES = new Set<string>([
  'get_page_info',
  'get_forms',
  'analyze_selection',
  'wait_for_selector',
  'navigate',
  'click',
  'type',
  'input',
  'scroll',
  'hover',
  'focus',
  'scroll_into_view',
  'select_option',
  'set_checked',
  'auto_fill_job_application',
  'submit_job_application',
  'key',
  'hold_key',
]);

const MAX_SELECTOR_LENGTH = 1024;
const MAX_VALUE_LENGTH = 16384;
const MAX_URL_LENGTH = 2048;
const FORBIDDEN_URL_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:'];

function isSafeActionUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  const lower = value.trim().toLowerCase();
  if (FORBIDDEN_URL_SCHEMES.some((scheme) => lower.startsWith(scheme))) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateShortcutActions(actions: ReadonlyArray<RunPageAction>): boolean {
  if (!Array.isArray(actions)) return false;
  for (const action of actions) {
    if (!action || typeof action !== 'object') return false;
    const t = (action as { type?: unknown }).type;
    if (typeof t !== 'string') return false;
    if (!ALLOWED_SHORTCUT_ACTION_TYPES.has(t.toLowerCase())) return false;

    const rec = action as Record<string, unknown>;
    const selector = rec['selector'];
    if (selector !== undefined && selector !== null) {
      if (typeof selector !== 'string') return false;
      if (selector.length === 0 || selector.length > MAX_SELECTOR_LENGTH) return false;
    }
    const value = rec['value'];
    const typeLower = t.toLowerCase();
    if (value !== undefined && value !== null) {
      if (typeof value !== 'string') return false;
      // the 16384-char cap. Apply the URL safety check (2048-char cap,
      if (typeLower === 'navigate' || typeLower === 'open') {
        if (!isSafeActionUrl(value)) return false;
      } else if (value.length > MAX_VALUE_LENGTH) {
        return false;
      }
    }
    const url = rec['url'];
    if (url !== undefined && url !== null) {
      if (!isSafeActionUrl(url)) return false;
    }
  }
  return true;
}

export const GATEWAY_URL_ALLOWLIST_EXACT = new Set<string>([
  'https://api.agiworkforce.com',
  'https://gateway.agiworkforce.com',
  'https://staging-api.agiworkforce.com',
  'https://agiworkforce.com',
]);

export function validateGatewayUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    const origin = `https://${parsed.host}`;
    return GATEWAY_URL_ALLOWLIST_EXACT.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

export const ORIGIN_EXTENSION_PAGE = '__extension_page__';

export function generateRecordId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${Date.now()}_${uuid.slice(0, 12)}`;
}

export const INVISIBLE_UNICODE_RE =
  // eslint-disable-next-line no-misleading-character-class, no-irregular-whitespace
  /[​-‍﻿‪-‮⁦-⁩︀-️]|[\u{E0000}-\u{E007F}]/gu;

export function sanitizePageText(raw: string): string {
  const stripped = raw.replace(INVISIBLE_UNICODE_RE, '');
  return redactSecrets(stripped);
}

export function shouldExecuteScheduledTask(
  task: Pick<ScheduledTask, 'createdByOrigin'>,
  allowlist: ReadonlySet<string>,
): boolean {
  if (!task.createdByOrigin) return true;
  if (task.createdByOrigin === ORIGIN_EXTENSION_PAGE) return true;
  return allowlist.has(task.createdByOrigin);
}
