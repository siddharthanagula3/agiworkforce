/**
 * Single source of truth for message-router policy and security validators
 * shared across background / side-panel / tests.
 *
 * Why this module exists (audit 2026-05-19):
 *
 *   Prior to this refactor, four files independently maintained Sets and
 *   regexes describing the same security policy:
 *     - `background.ts` ALLOWED_BRIDGE_HOSTS (without 0.0.0.0)
 *     - `side_panel.ts` ad-hoc `allowedHosts` (WITH 0.0.0.0)
 *     - `__tests__/bridge-url-validation.test.ts` mirrored the wrong set
 *     - `utils.ts` `isLocalUrl` had yet a third semantic
 *
 *   The drift produced H-02 (silent UX-vs-production divergence) and is
 *   exactly the bug class the mirror-test pattern enables. Tests should
 *   *import* from this module; never re-state the policy.
 *
 * Conventions:
 *   - Sets and pure-function validators live here.
 *   - Handlers and stateful caches (siteAllowlistCache, etc.) stay in
 *     `background.ts`. This module has no side effects on import.
 *   - Adding a message type that should be locked to the extension UI?
 *     Add it to EXTENSION_PAGE_ONLY_MESSAGE_TYPES below.
 */

import type { RunPageAction, ScheduledTask, WebMCPToolInfo } from '../types';
import { redactSecrets } from '@agiworkforce/utils/logger';

// ─── Declarative message policy (Arch #1, audit 2026-05-19) ────────────────
//
// Single per-message-type policy record. Replaces three independent Sets
// (DISCOVERY, DOM_MUTATION, EXTENSION_PAGE_ONLY). The Sets are derived from
// this matrix below for backwards-compatible exports.
//
// Adding a new message type? Add an entry here with the appropriate fields.
// Forgetting to add the entry results in the *default* policy below: the
// message goes through the allowlist gate but has no cross-tab or extension-
// page restriction, so any allowlisted page reaches the handler. That default
// is only safe for read-only, own-tab handlers, and the memory, quick-mode,
// and tab-group handlers all inherited it by accident.
// `__tests__/message-policy-coverage.test.ts` now fails the build when a
// `handleMessageAsync` case has no entry here, so the choice must be written
// down rather than defaulted into.
//
// senderClass
//   - 'extension-page-only': only popup / side panel / options can send
//     (used for state-mutating types whose execution outlives the
//     originating tab — see EXTENSION_PAGE_ONLY history)
//   - 'allowlisted-tab': any content-script on an `agi_site_allowlist`
//     origin can send (the default — gated by isAllowlistedSender)
//   - 'discovery': bypasses the allowlist (no current types — H-1)
//
// allowsCrossTab
//   - false: the message must target the sender's own tab; `tabId` field
//     either matches sender.tab.id or is undefined. Enforced via
//     senderTabAllowedToMutate.
//   - true (default for non-DOM-mutating types): cross-tab forwarding OK.

export type SenderClass = 'extension-page-only' | 'allowlisted-tab' | 'discovery';

export interface MessageTypePolicy {
  senderClass: SenderClass;
  /** When false, the gate rejects the message if msg.tabId !== sender.tab.id. */
  allowsCrossTab: boolean;
}

const DEFAULT_POLICY: MessageTypePolicy = {
  senderClass: 'allowlisted-tab',
  allowsCrossTab: true,
};

/**
 * Declarative policy matrix. Every message type with a non-default policy
 * is listed here. Look-up via `getMessagePolicy(type)`.
 */
export const MESSAGE_POLICY: Record<string, MessageTypePolicy> = {
  // ── DOM-mutation types (allowlisted-tab + same-tab restriction). ─────────
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

  // ── Extension-page-only types (state-mutating, persistence-outliving). ──
  CREATE_SCHEDULED_TASK: { senderClass: 'extension-page-only', allowsCrossTab: true },
  UPDATE_SCHEDULED_TASK: { senderClass: 'extension-page-only', allowsCrossTab: true },
  DELETE_SCHEDULED_TASK: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SAVE_SHORTCUT: { senderClass: 'extension-page-only', allowsCrossTab: true },
  DELETE_SHORTCUT: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SET_RECORDING_VALUE_CAPTURE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CANCEL_STREAM: { senderClass: 'extension-page-only', allowsCrossTab: true },
  RESUME_CHAT_RUN: { senderClass: 'extension-page-only', allowsCrossTab: true },
  RESOLVE_CHAT_APPROVAL: { senderClass: 'extension-page-only', allowsCrossTab: true },
  MANAGED_CLOUD_AUTH_CHANGED: { senderClass: 'extension-page-only', allowsCrossTab: true },
  APPROVE_CONTEXT_HANDOFF: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CANCEL_CONTEXT_HANDOFF: { senderClass: 'extension-page-only', allowsCrossTab: true },
  // ── Computer-use loop start — side panel / popup only. ─────────────────
  // Starting the CDP agent loop is a high-privilege action: it attaches
  // chrome.debugger to a live tab and makes outbound SSE calls to the AGI
  // Cloud gateway. A content script on any allowlisted site must NOT be able
  // to trigger this — only the trusted extension UI can.
  AGI_START_COMPUTER_USE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CANCEL_COMPUTER_USE: { senderClass: 'extension-page-only', allowsCrossTab: true },

  // ── Privileged tab / cookie / chat operations — side panel / popup / options
  // only. These have background handlers but NO content-script or side-panel-DOM
  // sender in the extension; under DEFAULT_POLICY (allowlisted-tab) any content
  // script on an allowlisted origin could invoke them — enumerate every open
  // tab's URL/title, open/close/switch arbitrary tabs, read/write cookies, or
  // start paid CHAT_MESSAGE runs invisibly (quota burn). None of that is a
  // legitimate web-page capability, and none has a sender outside the extension
  // UI, so gating them fail-closed breaks nothing. (REPLAY_SHORTCUT is
  // deliberately left allowlisted-tab — "web-allowlisted replay" is an explicit
  // current design decision, see the policy.test.ts carve-out; tightening it is a
  // separate security-review call, tracked in known-flaws.)
  CHAT_MESSAGE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  WEBMCP_DISCOVER_TOOLS: { senderClass: 'extension-page-only', allowsCrossTab: true },
  WEBMCP_CALL_TOOL: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_CLOUD_AUTH_TOKEN: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_ALL_TABS: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CREATE_TAB: { senderClass: 'extension-page-only', allowsCrossTab: true },
  CLOSE_TAB: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SWITCH_TAB: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SET_COOKIE: { senderClass: 'extension-page-only', allowsCrossTab: true },

  // ── Conversation cloud persistence — side panel / options only. ─────────
  // These enqueue an authenticated write (or delete) of the user's transcript
  // to their AGI account. An allowlisted page must never be able to trigger or
  // delete account-side history, so both are fail-closed even though the local
  // handlers do no DOM work.
  SYNC_CONVERSATION: { senderClass: 'extension-page-only', allowsCrossTab: true },
  DELETE_CLOUD_CONVERSATION: { senderClass: 'extension-page-only', allowsCrossTab: true },

  // ── Memories, quick mode, tab groups — side panel only. ─────────────────
  // These handlers landed after the C-02/C-03 sweep and silently inherited
  // DEFAULT_POLICY, so any content script on an allowlisted origin could read,
  // rewrite, or wipe the user's memories. That is the same capability C-02/C-03
  // gated for shortcuts: `chrome.storage.local` state that outlives both the
  // page and its place on the allowlist — plus, on the read side, a straight
  // disclosure of the user's own notes to the page. Quick mode flips a stored
  // routing preference, and the tab-group commands fall back to the *active*
  // tab, so a background tab could regroup whatever the user is looking at.
  // The only senders are `side_panel.ts` (memory drawer, quick-mode toggle,
  // tab-group buttons), so gating breaks nothing.
  LIST_MEMORIES: { senderClass: 'extension-page-only', allowsCrossTab: true },
  ADD_MEMORY: { senderClass: 'extension-page-only', allowsCrossTab: true },
  UPDATE_MEMORY: { senderClass: 'extension-page-only', allowsCrossTab: true },
  DELETE_MEMORY: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_QUICK_MODE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  SET_QUICK_MODE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  GET_TAB_GROUP_STATE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  ADD_TAB_TO_GROUP: { senderClass: 'extension-page-only', allowsCrossTab: true },
  REMOVE_TAB_FROM_GROUP: { senderClass: 'extension-page-only', allowsCrossTab: true },

  // ── Native-bridge control — side panel only. ────────────────────────────
  // Same argument as the tab/cookie block above: both cross into the desktop
  // (Local) trust boundary and neither has a content-script sender.
  // QUEUE_MESSAGE hands arbitrary page-supplied text to the desktop's queue;
  // RECONNECT_NATIVE is reached only from the side panel's pairing UI.
  QUEUE_MESSAGE: { senderClass: 'extension-page-only', allowsCrossTab: true },
  RECONNECT_NATIVE: { senderClass: 'extension-page-only', allowsCrossTab: true },

  // ── Allowlisted-tab types, stated rather than inherited. ────────────────
  // These match DEFAULT_POLICY exactly and are listed only so
  // `message-policy-coverage.test.ts` can require an entry for every type
  // `handleMessageAsync` dispatches — the check the memory handlers slipped
  // past. Most are sent by `content.ts` or the in-page panel and would break if
  // gated; the rest either stay inside the sender's own tab
  // (GET_ACCESSIBILITY_TREE), only validate and log (BRIDGE_URL_CHANGED), or
  // ride on the standing web-allowlisted-replay decision noted above
  // (LIST_SHORTCUTS, REPLAY_SHORTCUT, LIST_SCHEDULED_TASKS).
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
  REPLAY_SHORTCUT: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  LIST_SCHEDULED_TASKS: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
  BRIDGE_URL_CHANGED: { senderClass: 'allowlisted-tab', allowsCrossTab: true },
};

/**
 * Returns the policy entry for a message type, or DEFAULT_POLICY if no
 * entry exists. New message types fall back to "allowlisted-tab,
 * cross-tab OK" — which is fail-safe for read-only handlers but
 * UNSAFE for DOM-mutation or state-persistence. Always add an explicit
 * entry when you introduce a new type with either capability.
 */
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

/**
 * Authenticate extension-owned UI documents without assuming they are tabless.
 *
 * Chrome can associate an options page or a side-panel document with a tab.
 * Content scripts also report this extension's id, so id equality alone is not
 * sufficient: at least one document URL/origin must exactly match the extension
 * origin. The tabless fallback preserves service-worker initiated UI messages.
 */
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

/**
 * Resolve the tab a message may target without confusing a tab-associated
 * extension document for a content script. Trusted extension UI may name an
 * explicit target; web content remains pinned to its sender tab.
 */
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

// ─── Backwards-compatible Set exports (derived from MESSAGE_POLICY) ─────────
// These are read by `background.ts handleMessage`. Keep them as Sets so the
// hot path stays O(1). The Sets are derived once at module load — adding a
// new type to MESSAGE_POLICY automatically populates them.

/**
 * Discovery messages bypass the origin allowlist. Currently empty (H-1).
 */
export const DISCOVERY_MESSAGE_TYPES: ReadonlySet<string> = new Set(
  Object.entries(MESSAGE_POLICY)
    .filter(([, p]) => p.senderClass === 'discovery')
    .map(([t]) => t),
);

/**
 * Message types that mutate the target tab's DOM. Gated by both the origin
 * allowlist AND the same-tab restriction. Derived from MESSAGE_POLICY where
 * `allowsCrossTab === false`.
 */
export const DOM_MUTATION_MESSAGE_TYPES: ReadonlySet<string> = new Set(
  Object.entries(MESSAGE_POLICY)
    .filter(([, p]) => p.allowsCrossTab === false)
    .map(([t]) => t),
);

/**
 * Message types that may ONLY originate from an extension page. Derived
 * from MESSAGE_POLICY where `senderClass === 'extension-page-only'`.
 *
 * SECURITY (C-02 / C-03 audit 2026-05-19): scheduled-task and shortcut
 * creation flows mutate persistent state that survives the origin's
 * removal from the allowlist. The capability itself must be gated to
 * UI-trusted contexts.
 */
export const EXTENSION_PAGE_ONLY_MESSAGE_TYPES: ReadonlySet<string> = new Set(
  Object.entries(MESSAGE_POLICY)
    .filter(([, p]) => p.senderClass === 'extension-page-only')
    .map(([t]) => t),
);

// ─── Shared storage keys ────────────────────────────────────────────────────

/**
 * `chrome.storage.local` key holding the user-managed site allowlist — the
 * origin set every trust decision in the extension is derived from.
 *
 * The literal was retyped in six modules (background, cdpDriver, side panel,
 * options, in-page panel, plus the tests). A storage key spelled by hand never
 * throws when it is wrong — the reader just gets `undefined` and treats the
 * user's allowlist as empty, so a writer/reader typo silently revokes trust the
 * options page still shows as granted. Import this instead of typing it.
 */
export const SITE_ALLOWLIST_STORAGE_KEY = 'agi_site_allowlist';

// ─── Shared content / parsing caps ──────────────────────────────────────────

/**
 * Maximum byte budget for page-text extraction (innerText slice) that the
 * extension forwards to the desktop bridge as LLM context.
 *
 * L-14 (audit 2026-05-19): single source so content.ts + background.ts can
 * never drift on this number.
 */
export const MAX_CONTEXT_HTML_CHARS = 100_000;

/**
 * Per-source-document size caps for JSON.parse paths that consume page-
 * supplied data. M-03 (audit 2026-05-19): without a cap, a hostile or
 * malformed page can submit multi-megabyte JSON-LD / WebMCP schemas and
 * stall the parser. The values trade legitimate-edge-case breadth for
 * bounded compute.
 */
export const MAX_JSON_LD_BYTES = 256 * 1024; // 256 KB per <script type="application/ld+json"> block
export const MAX_WEBMCP_SCHEMA_BYTES = 64 * 1024; // 64 KB per tool inputSchema
export const MAX_NLWEB_PROBE_BYTES = 256 * 1024; // 256 KB total NLWeb probe body
export const MAX_WEBMCP_TOOLS = 64;
const MAX_WEBMCP_TOOL_NAME_CHARS = 64;
const MAX_WEBMCP_TOOL_DESCRIPTION_CHARS = 500;
const MAX_WEBMCP_PAGE_URL_CHARS = 2_048;
const WEBMCP_TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_. -]{0,63}$/;

/**
 * Bounded JSON.parse helper. Returns the parsed value or `undefined` if the
 * input is missing, oversized, or unparseable. Callers must accept the
 * possibility of `undefined` and not throw on it.
 */
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
  /** Sender-authoritative HTTP(S) origin + path; credentials/query/fragment removed. */
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

/**
 * Validate the content-script WebMCP discovery event at the privileged
 * background boundary. The sender tab URL is authoritative; the page-reported
 * URL may only confirm the same origin/path.
 */
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

// ─── Bridge URL validation ──────────────────────────────────────────────────

/**
 * Allowed local hostnames for the desktop bridge.
 *
 * `0.0.0.0` removed (SEV-CHEXT-09): on Linux it routes to LAN-bound services,
 * defeating the loopback-only contract. The side-panel settings UI previously
 * accepted `0.0.0.0`; H-02 reconciles all consumers against this Set.
 *
 * For IPv6, the canonical hostname value `new URL(...).hostname` returns is
 * `[::1]` (with brackets). Never compare against `'::1'` directly — that
 * caused H-03.
 */
export const ALLOWED_BRIDGE_HOSTS = new Set<string>(['localhost', '127.0.0.1', '[::1]']);

/** Default bridge URL when no override is configured. */
export const DEFAULT_AGI_BRIDGE_URL = 'http://localhost:8787';

/**
 * Validate a user- or storage-supplied bridge URL. Returns the normalized
 * URL (with ws/wss collapsed to http/https and trailing slash stripped) or
 * `null` if the URL is non-local, non-http, or unparseable.
 */
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

// ─── Shortcut action validation ─────────────────────────────────────────────

/**
 * Allowlist of action `type` strings that may appear in a saved shortcut
 * or scheduled-task plan. Mirrors the content-script `executePlannedAction`
 * switch in `content.ts:executePlannedAction`, one for one — enforced by
 * `__tests__/shortcut-action-coverage.test.ts`.
 *
 * Security note: the previous flow accepted arbitrary action types at save
 * time and only failed at replay (via the content-script switch's `default`
 * case). That gave the attacker an opportunity to plant payloads targeting
 * a future handler. Reject at save.
 *
 * That is also why the eight "computer-use bridge passthrough" entries
 * (screenshot, right_click, double_click, triple_click, execute_script,
 * snapshot, wait, unsupported) are gone: no executor ever ran them. Their only
 * producer was `planActionsFromBrowserTool`, which had no caller — the
 * computer-use agent drives the page through `cdpDriver`, not through
 * `RUN_PAGE_ACTIONS` — so the entries bought no feature and did exactly the
 * thing the note above says to prevent, holding eight type strings open for a
 * handler that might land later. That producer and its `browserTool` bridge
 * were deleted with this change (2026-08-09), so nothing emits them now.
 *
 * To add an action type here you must first add its `case` to
 * `executePlannedAction`; the coverage test fails on either side alone.
 */
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

/**
 * Per-field size caps for action parameters.
 *
 * FIX (audit 2026-05-20, §1): the legacy validator only checked the action
 * `type`. An LLM-controlled `selector`, `url`, or `value` still flowed
 * through unchecked — e.g. a 1MB CSS selector that could DoS the content-
 * script DOM query, or a `javascript:`-scheme URL in a navigate action
 * that runs arbitrary code in the page's origin.
 *
 * Caps chosen to be generous for legitimate UI automation:
 *   - selector: 1024 chars (longest seen in production was ~300, e.g.
 *     `div[data-component-id="ABC"] > div:nth-child(3) ...`)
 *   - value: 16384 chars (one form field of generated text)
 *   - url: 2048 chars (per RFC 7230's de-facto limit + Chrome's own cap)
 *
 * Reject the action plan as a whole if any single field exceeds its cap,
 * so a hostile bridge cannot smuggle one giant payload past the gate.
 */
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
    // Only http(s) and chrome-extension:// are valid for the actions we
    // support (navigate / open). Anything else is rejected.
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate every action in a shortcut/task plan. Returns `true` when:
 *   1. The array is well-formed.
 *   2. Every action's `type` is on the allowlist.
 *   3. Every action's `selector`, `value`, and (if present) `url` field is
 *      within its size cap and (for URLs) on an allowed scheme.
 */
export function validateShortcutActions(actions: ReadonlyArray<RunPageAction>): boolean {
  if (!Array.isArray(actions)) return false;
  for (const action of actions) {
    if (!action || typeof action !== 'object') return false;
    const t = (action as { type?: unknown }).type;
    if (typeof t !== 'string') return false;
    if (!ALLOWED_SHORTCUT_ACTION_TYPES.has(t.toLowerCase())) return false;

    // FIX (audit 2026-05-20, §1): per-parameter validation.
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
      // FIX (Codex P2, 2026-05-20): `navigate` / `open` actions carry the
      // destination URL in the `value` field (the canonical RunPageAction
      // shape), not `url`. The previous fix only scheme-checked `url`, so
      // an LLM-supplied `javascript:` payload in `value` would slip through
      // the 16384-char cap. Apply the URL safety check (2048-char cap,
      // forbidden schemes, http(s)-only) when the action is navigation.
      if (typeLower === 'navigate' || typeLower === 'open') {
        if (!isSafeActionUrl(value)) return false;
      } else if (value.length > MAX_VALUE_LENGTH) {
        return false;
      }
    }
    // Legacy `url` field — kept for older action shapes that still set it.
    const url = rec['url'];
    if (url !== undefined && url !== null) {
      if (!isSafeActionUrl(url)) return false;
    }
  }
  return true;
}

// ─── Gateway URL validation ─────────────────────────────────────────────────

/**
 * Allowlist of api-gateway origins the extension may send user-authenticated
 * gateway requests to. EXACT match only — the previous open-subdomain rule (M-02 audit
 * 2026-05-19) would accept any `*.agiworkforce.com` host including attacker-
 * controlled subdomains if any were ever delegated externally.
 *
 * To add a new staging / preview origin: add it here AND restart all extension
 * surfaces; storage-level overrides are also gated by this list at read time.
 */
export const GATEWAY_URL_ALLOWLIST_EXACT = new Set<string>([
  'https://api.agiworkforce.com',
  'https://gateway.agiworkforce.com',
  'https://staging-api.agiworkforce.com',
  // Web app origin: hosts the Next.js /api/llm/v1/chat/completions route that
  // supports free-tier users (reserveFreeTrialPrompt). The Express gateway at
  // api.agiworkforce.com blocks free-tier users; this origin does not.
  'https://agiworkforce.com',
]);

/**
 * Returns the validated gateway origin or null. Rejects http:// (JWT would
 * be plaintext) and any non-allowlisted host.
 */
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

// ─── Origin-stamp sentinel ──────────────────────────────────────────────────

/**
 * `createdByOrigin` value used for records created from the trusted extension
 * UI (popup / side panel / options). Used as a stable sentinel that the
 * fire-time re-check treats as always-allowed without a special case.
 *
 * Real origins are always URL origins (`https://…` / `http://…`) so this
 * sentinel can never collide. Keep the leading + trailing underscores.
 */
export const ORIGIN_EXTENSION_PAGE = '__extension_page__';

/**
 * Generate a collision-resistant ID for persisted records. Replaces the
 * prior `Math.random().toString(36).slice(2, 8)` (~31 bits) with a UUID-
 * derived 12-hex-char prefix (~48 bits). MV3 service workers expose
 * `crypto.randomUUID()` natively.
 */
export function generateRecordId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${Date.now()}_${uuid.slice(0, 12)}`;
}

// ─── Page-text sanitization (extracted from content.ts for testability) ─────

/**
 * Invisible Unicode characters used as vehicles for indirect prompt injection
 * (Greshake 2023 / EchoLeak CVE-2025-32711 / ASCII-smuggling vectors —
 * Embrace The Red 2024). The regex is the SINGLE source of truth — both
 * production (`content.ts:extractPageHtmlSafely`) and tests import it.
 *
 * Self-review #1 audit 2026-05-19: previously content.ts had a local copy
 * and `__tests__/extract-page-html-unicode.test.ts` mirrored it. That mirror
 * pattern is the same antipattern that caused H-02.
 */
export const INVISIBLE_UNICODE_RE =
  // eslint-disable-next-line no-misleading-character-class, no-irregular-whitespace
  /[​-‍﻿‪-‮⁦-⁩︀-️]|[\u{E0000}-\u{E007F}]/gu;

/**
 * Pure-function page-text sanitizer: strip invisible Unicode then run the
 * shared `redactSecrets` redactor. Production extractor (content.ts) and
 * tests use this directly.
 */
export function sanitizePageText(raw: string): string {
  const stripped = raw.replace(INVISIBLE_UNICODE_RE, '');
  return redactSecrets(stripped);
}

/**
 * Decide whether a scheduled task should fire given the current allowlist.
 * Returns true for the `__extension_page__` sentinel and for any task whose
 * origin remains on the allowlist. Returns false otherwise — caller should
 * auto-delete the task.
 *
 * Self-review #1: extracted so `__tests__/scheduled-task-origin.test.ts`
 * can import this directly instead of mirroring the check.
 */
export function shouldExecuteScheduledTask(
  task: Pick<ScheduledTask, 'createdByOrigin'>,
  allowlist: ReadonlySet<string>,
): boolean {
  if (!task.createdByOrigin) return true; // legacy task pre-stamp; permit
  if (task.createdByOrigin === ORIGIN_EXTENSION_PAGE) return true;
  return allowlist.has(task.createdByOrigin);
}
