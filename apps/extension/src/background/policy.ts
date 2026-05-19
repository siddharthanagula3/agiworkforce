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

import type { RunPageAction, ScheduledTask } from '../types';
import { redactSecrets } from '@agiworkforce/utils';

// ─── Message-type policy Sets ───────────────────────────────────────────────

/**
 * Discovery messages bypass the origin allowlist because they expose no
 * privileged capability. Currently empty after H-1 (audit 2026-05-03).
 * Do NOT add PING / GET_AGI_BRIDGE_URL here — see the H-1 comment in
 * background.ts.
 */
export const DISCOVERY_MESSAGE_TYPES = new Set<string>();

/**
 * Message types that mutate the target tab's DOM. Gated by both the origin
 * allowlist AND the same-tab restriction in `senderTabAllowedToMutate`.
 *
 * Adding a new content-script handler that writes to the DOM? Add the
 * wire-message type here too — otherwise an allowlisted origin can drive
 * a different tab via that type.
 */
export const DOM_MUTATION_MESSAGE_TYPES = new Set<string>([
  'TYPE',
  'CLICK',
  'SET_LOCAL_STORAGE',
  'CLEAR_LOCAL_STORAGE',
  'SUBMIT_FORM',
  'SELECT_OPTION',
  'CHECK',
  'UNCHECK',
  'FOCUS',
  'BLUR',
  'HOVER',
  'SCROLL',
  'DRAG_DROP',
  'CLICK_AT_COORDINATES',
  'EXECUTE_SCRIPT',
  'RUN_PAGE_ACTIONS',
  'AUTO_FILL_JOB_APPLICATION',
  'DOUBLE_CLICK',
  'RIGHT_CLICK',
  'FILL_FORM',
]);

/**
 * Message types that may ONLY originate from an extension page (popup,
 * side panel, options). Content scripts — even on allowlisted origins —
 * are rejected.
 *
 * SECURITY (C-02 / C-03 audit 2026-05-19): scheduled-task and shortcut
 * creation flows mutate persistent state that survives the origin's
 * removal from the allowlist. The previous architecture allowed any
 * allowlisted content script to plant tasks that fire on later tabs;
 * fixing this surgically (origin-stamp + fire-time re-check) is not
 * enough — the capability itself must be gated to UI-trusted contexts.
 *
 * Add a type here only if (a) it persists state, (b) its execution can
 * outlive the originating tab, and (c) the legitimate flow is always
 * from the side-panel UI. If you need a web-page-callable variant in
 * the future, design a new message type (e.g. `SAVE_PUBLIC_SHORTCUT`)
 * with explicit per-origin rate limits.
 */
export const EXTENSION_PAGE_ONLY_MESSAGE_TYPES = new Set<string>([
  'CREATE_SCHEDULED_TASK',
  'UPDATE_SCHEDULED_TASK',
  'DELETE_SCHEDULED_TASK',
  'SAVE_SHORTCUT',
  'DELETE_SHORTCUT',
  'SET_RECORDING_VALUE_CAPTURE',
]);

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

/**
 * Bounded JSON.parse helper. Returns the parsed value or `undefined` if the
 * input is missing, oversized, or unparseable. Callers must accept the
 * possibility of `undefined` and not throw on it.
 */
export function safeJsonParse<T = unknown>(text: string | null | undefined, maxBytes: number): T | undefined {
  if (typeof text !== 'string') return undefined;
  if (text.length > maxBytes) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
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
 * switch in `content.ts:executePlannedAction`.
 *
 * Security note: the previous flow accepted arbitrary action types at save
 * time and only failed at replay (via the content-script switch's `default`
 * case). That gave the attacker an opportunity to plant payloads targeting
 * a future handler. Reject at save.
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
  // Computer-use bridge passthroughs accepted by the executor.
  'screenshot',
  'right_click',
  'double_click',
  'triple_click',
  'execute_script',
  'snapshot',
  'wait',
  'unsupported',
]);

/**
 * Validate every action in a shortcut/task plan. Returns `true` when every
 * action's `type` is on the allowlist and the array is well-formed.
 */
export function validateShortcutActions(actions: ReadonlyArray<RunPageAction>): boolean {
  if (!Array.isArray(actions)) return false;
  for (const action of actions) {
    if (!action || typeof action !== 'object') return false;
    const t = (action as { type?: unknown }).type;
    if (typeof t !== 'string') return false;
    if (!ALLOWED_SHORTCUT_ACTION_TYPES.has(t.toLowerCase())) return false;
  }
  return true;
}

// ─── Gateway URL validation ─────────────────────────────────────────────────

/**
 * Allowlist of api-gateway origins the extension may send the user's Supabase
 * JWT to. EXACT match only — the previous open-subdomain rule (M-02 audit
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
