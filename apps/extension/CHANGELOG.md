# Extension Audit CHANGELOG

Single source of truth for the full-spectrum code audit remediation.
Every fix batch is logged here before and after changes.

---

## Third-Pass: Browser Extension Security Audit (2026-03-25)

## [FIX-022] - Remove stale .js source duplicates from git tracking

- **Files:** `src/background.js`, `src/content.js`, `src/popup.js`, `src/injected.js` (removed from git)
- **Category:** Config / DevOps
- **Severity:** High
- **What changed:** Removed 4 handwritten `.js` files from git tracking via `git rm --cached`. These were stale duplicates of the TypeScript source files, committed before `.gitignore` added the `*.js` rule. The `.ts` files (built by Vite) are the source of truth. `jobAutofill.runtime.js` is intentionally kept (exempt in `.gitignore`).
- **Why:** Having both `.ts` and `.js` source files creates confusion about which is canonical, risks silent divergence, and bloats the repo with dead code.

## [FIX-023] - Add profile data sanitization at autofill entry point

- **Files:** `src/autofill/filler.ts`
- **Category:** Security (PII)
- **Severity:** High
- **What changed:** Added `sanitizeProfileValue()` function that strips control characters, rejects HTML tags, trims whitespace, and enforces a 2000-char length limit. Applied at the `fillFields()` boundary before any value reaches a form field.
- **Why:** Profile data originates from the desktop app and is used directly in `setNativeValue()`. If the desktop app is compromised or the profile contains malformed data (HTML tags, control chars, null bytes), it would propagate into form fields unsafely. The sanitizer acts as a trust boundary.

## [FIX-024] - Add concurrent autofill guard

- **Files:** `src/content.ts`
- **Category:** Bug
- **Severity:** High
- **What changed:** Added `_isAutofillingNow` boolean guard in `handleAutoFillJobApplication()`. Returns early with error if autofill is already running. Cleared in `finally` block to guarantee reset even on errors.
- **Why:** Double-clicking the autofill button (or receiving duplicate messages) causes two concurrent `runPlatformJobAutofill()` calls that stomp on the same form fields, dispatch duplicate events, and produce race conditions.

## [FIX-025] - Add readonly/disabled field detection in filler.ts

- **Files:** `src/autofill/filler.ts`
- **Category:** Bug
- **Severity:** Medium
- **What changed:** Added `readOnly` and `disabled` checks before attempting to fill any field. Skipped fields get descriptive reasons (`"Field is readonly"` or `"Field is disabled"`).
- **Why:** Filling readonly/disabled fields has no effect and can confuse form validation. Previously, the filler silently returned `false` with no explanation.

## [FIX-026] - Expand cookie domain blocklist

- **Files:** `src/background.ts`
- **Category:** Security
- **Severity:** High
- **What changed:** Expanded `BLOCKED_COOKIE_DOMAINS` from 10 to 38 patterns covering: cloud infrastructure (AWS, Azure, GCP), developer tools (GitHub, GitLab, Bitbucket), auth providers (Auth0, Okta, Google accounts, Microsoft login), financial (Stripe, Plaid, Fidelity, Schwab, crypto exchanges), email (Gmail, Outlook), social media (Facebook, Twitter/X, Instagram), and government/military (.gov, .mil).
- **Why:** The original blocklist only covered banks and healthcare. A malicious page triggering `GET_COOKIES` could exfiltrate session tokens from AWS, GitHub, Stripe, etc.

## [FIX-027] - Add beforeinput event to dispatchFillEvents

- **Files:** `src/autofill/filler.ts`
- **Category:** Bug
- **Severity:** Medium
- **What changed:** Added `beforeinput` InputEvent dispatch before the `input` event in the focus→beforeinput→input→change→blur sequence.
- **Why:** React 19+ and Vue 3.4+ frameworks listen to `beforeinput` for input validation hooks. Without it, controlled component validation may not trigger when fields are filled programmatically.

---

## Deferred Items Completed (2026-03-25)

## [FIX-018] - Rename queue_message and open_side_panel to SCREAMING_SNAKE_CASE

- **Files:** `src/types.ts`, `src/background.ts`, `src/popup.ts`, `src/content.ts`
- **Category:** Code Quality
- **Severity:** Medium
- **What changed:** Renamed `'queue_message'` → `'QUEUE_MESSAGE'` and `'open_side_panel'` → `'OPEN_SIDE_PANEL'` across all 13 references (union members, interface type fields, case handlers, sendMessage calls, logging strings, comments).
- **Why:** These two message types were the only ones using lowercase in a 66-member discriminated union that otherwise uses SCREAMING_SNAKE_CASE. Exploration confirmed no Rust-side pattern matching on these strings — they pass through generically via the native messaging envelope.

## [FIX-019] - HTML extraction heuristic guard + shared helper

- **Files:** `src/content.ts`
- **Category:** Performance
- **Severity:** Medium
- **What changed:** Extracted `extractPageHtmlSafely()` as a shared function used by both `buildCurrentPageContext()` and `handleGetPageInfo()`, eliminating code duplication. Added a heuristic guard that checks `document.querySelectorAll('*').length` against `MAX_DOM_ELEMENTS_FOR_EXTRACTION` (50,000) before attempting `outerHTML`. Skips extraction on pathological DOMs to avoid multi-second event-loop stalls.
- **Why:** `outerHTML` is synchronous and blocks the JS thread. On huge SPAs (100K+ elements), this can stall for 5-10 seconds. The previous post-hoc timeout only measured elapsed time after completion — it didn't prevent the stall. The heuristic guard avoids the stall entirely.

## [FIX-020] - automationState defensive idempotent guards

- **Files:** `src/content.ts`
- **Category:** Architecture
- **Severity:** Low
- **What changed:** (a) Added documenting comment at `automationState` declaration explaining the single-threaded safety model and async interleaving. (b) Added idempotent early-return to `handleStopRecording()` if already stopped. (c) Added idempotent guard to `CONNECTION_STATUS_CHANGED` handler — skips redundant status updates to avoid unnecessary page context re-syncs.
- **Why:** While JS is single-threaded, `async/await` yields between message handlers mean state mutations can interleave. Idempotent guards ensure duplicate or out-of-order messages are harmless.

## [FIX-021] - Document manifest.json localhost permission rationale

- **Files:** `manifest.json`
- **Category:** Config / Documentation
- **Severity:** Info
- **What changed:** Added `_host_permissions_note` field documenting why `host_permissions` use broad `http://localhost/*` — the bridge port is user-configurable, so restricting to port 8765 would break configurability. Runtime enforcement is via `validateBridgeUrl()` in `background.ts`.
- **Why:** The broad permission was flagged as a security concern in the audit. Exploration confirmed it's necessary and that runtime validation enforces localhost-only.

---

## Second-Pass Audit (2026-03-25)

## [FIX-011] - NLWEB_PROBE timeout leak

- **Files:** `src/background.ts`
- **Category:** Bug
- **Severity:** Medium
- **What changed:** Moved `clearTimeout(timeoutId)` from inline (happy path only) to a `finally` block, ensuring timer cleanup on all error paths including fetch rejection.
- **Why:** When fetch failed with a network error, `clearTimeout` was never called, accumulating orphaned timers in the service worker.

## [FIX-012] - SSE fetch error diagnostic logging

- **Files:** `src/background.ts`
- **Category:** Error Handling
- **Severity:** High
- **What changed:** Replaced empty `catch {}` with `catch (fetchErr)` + `logger.debug()` for chat SSE fetch failures.
- **Why:** Network errors (including 401/500/connection failures) were silently swallowed, making debugging impossible. The fallback to native messaging still happens, but the root cause is now logged.

## [FIX-013] - Selector validation in ALLOWED_SCRIPT_OPERATIONS

- **Files:** `src/content.ts`
- **Category:** Security
- **Severity:** High
- **What changed:** Added `validators.isValidSelector()` checks to `scrollIntoView`, `getComputedStyle`, `getBoundingRect`, `focusElement`, and `blurElement` operations before calling `document.querySelector()`.
- **Why:** User-provided selectors were passed directly to `querySelector()` without validation. Invalid selectors throw, and while caught by the handler, validated selectors prevent potential selector injection edge cases.

## [FIX-014] - Scroll recording listener passive flag (false positive)

- **Files:** None (no change)
- **Category:** Bug
- **Severity:** N/A — verified false positive
- **What changed:** No change. Verified that `removeEventListener` only matches on `capture` + function reference per DOM spec. The `passive` flag is irrelevant for listener removal.
- **Why:** Audit finding was incorrect — the original code was already correct.

## [FIX-015] - WebMCP MutationObserver debounce

- **Files:** `src/webmcp.ts`
- **Category:** Performance
- **Severity:** Medium
- **What changed:** Added 300ms debounce to the MutationObserver callback that triggers `discoverAllTools()`. The debounce timer is cleared in `stopWatchingToolChanges()`.
- **Why:** On SPAs with rapid DOM mutations, the observer fired `discoverAllTools()` (full DOM scan) on every single mutation — potentially hundreds of times per second.

## [FIX-016] - Connection status notification efficiency

- **Files:** `src/background.ts`
- **Category:** Performance / Code Quality
- **Severity:** Low
- **What changed:** Added `discarded: false` filter to `chrome.tabs.query()` in `notifyConnectionStatusChange()`. Replaced `_lastError` variable pattern with direct `void chrome.runtime.lastError` plus explanatory comment.
- **Why:** Discarded tabs have no active content script to receive messages. The `_lastError` variable pattern was confusing; the direct void with a comment is clearer.

## [FIX-017] - Exhaustive schedule type check

- **Files:** `src/background.ts`
- **Category:** Architecture
- **Severity:** Medium
- **What changed:** Replaced `default: return 60 * 24` with a TypeScript exhaustive check (`const _exhaustive: never = task.scheduleType`) plus a warning log and fallback.
- **Why:** If a new `scheduleType` value is added to the `ScheduledTask` type, the `default` case silently treated it as daily. The exhaustive check causes a compile-time error for unhandled enum values.

---

## First-Pass Audit (2026-03-25)

## [FIX-001] - NLWEB_PROBE SSRF URL validation

- **Files:** `src/background.ts`
- **Category:** Security
- **Severity:** Critical
- **What changed:** Added `isAllowedProbeUrl()` and `isPrivateOrReservedHost()` functions that block probes to private/reserved IPs (10._, 172.16-31._, 192.168._, 169.254._, 127._, ::1, fe80:_, fd\*, localhost, 0.0.0.0). Applied validation to the NLWEB_PROBE handler. Clamped response body to 256KB via `MAX_PROBE_RESPONSE_BYTES`.
- **Why:** The NLWEB_PROBE handler accepted arbitrary URLs, enabling network reconnaissance of internal networks (SSRF) via a compromised content script. Bridge URL validation was not applied to this handler.

## [FIX-002] - DOMPurify href protocol restriction

- **Files:** `src/side_panel.ts`
- **Category:** Security
- **Severity:** Critical
- **What changed:** Added `ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i` to the DOMPurify config in `sanitizeHtml()`.
- **Why:** The DOMPurify config allowed `href` attribute without explicit URI scheme restriction. While the markdown renderer independently blocks non-http URLs, `sanitizeHtml()` is the security boundary and should enforce protocol restrictions directly.

## [FIX-003] - nlwebByTab memory leak on tab removal

- **Files:** `src/background.ts`
- **Category:** Bug
- **Severity:** Critical
- **What changed:** Added `nlwebByTab.delete(tabId)` to the `chrome.tabs.onRemoved` listener alongside the existing cleanup of `rateLimiter`, `lastPageContextSyncByTab`, and `webmcpToolsByTab`.
- **Why:** The `nlwebByTab` Map was never cleaned up when tabs were closed, causing unbounded memory growth in long-running sessions.

## [FIX-004] - SSE stream partial chunk buffering

- **Files:** `src/background.ts`
- **Category:** Bug
- **Severity:** High
- **What changed:** Added `sseBuffer` variable that accumulates incomplete lines across `reader.read()` calls. Lines are split from the buffer, with the last (potentially incomplete) element kept for the next iteration. Remaining buffer is flushed after the stream ends.
- **Why:** SSE parser split on `\n` per read() call but didn't buffer incomplete lines. A JSON payload split across two TCP segments was silently dropped, causing missing chat response content.

## [FIX-005] - Popup timer leak + sendMessage error + unvalidated cast

- **Files:** `src/popup.ts`
- **Category:** Bug / Error Handling / Type Safety
- **Severity:** High
- **What changed:** (a) Stored `setInterval` return in module-level `sessionTimerInterval`, cleared on `window.unload`. (b) Added `.catch(() => {})` to `open_side_panel` sendMessage. (c) Replaced direct cast with runtime type guard (`typeof`, `'type' in`, value check) before processing CONNECTION_STATUS_CHANGED messages.
- **Why:** (a) Each popup open leaked an interval. (b) sendMessage with no handler throws if background is not ready. (c) Unknown message shapes were cast without validation.

## [FIX-006] - Side panel credential logging + API key migration race

- **Files:** `src/side_panel.ts`
- **Category:** Security / Bug
- **Severity:** High
- **What changed:** (a) Removed raw error object from `console.error` in `saveApiKey()`. (b) Added `_apiKeyMigrationPromise` guard so concurrent `loadApiKey()` calls share a single migration promise.
- **Why:** (a) Error objects in devtools could expose sensitive credential operation context. (b) Overlapping calls to `loadApiKey()` could trigger duplicate migrations, reading and deleting the legacy key twice.

## [FIX-007] - React controlled input compatibility

- **Files:** `src/content.ts`
- **Category:** Bug
- **Severity:** High
- **What changed:** Replaced direct `element.value += char` mutation in `handleType()` with the native value setter pattern (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`). Falls back to direct assignment if the native setter is unavailable.
- **Why:** Direct `.value` mutation bypasses React's internal value tracker. React controlled inputs compare against their fiber state, not the DOM attribute, so `onChange` handlers were never fired.

## [FIX-008] - Reconnect debounce comment clarification

- **Files:** `src/background.ts`
- **Category:** Code Quality
- **Severity:** Info (downgraded from High after verification)
- **What changed:** Added clarifying comment to `scheduleNativeReconnect()` explaining the early return is intentional debouncing.
- **Why:** Audit flagged the early return as skipping the attempt increment, but verified this is correct: the counter only increments when a new timer is scheduled, preventing duplicate disconnect events from accelerating backoff.

## [FIX-009] - Medium improvements (CSS.escape, JSON-LD depth, observer cleanup)

- **Files:** `src/webmcp.ts`, `src/nlweb.ts`
- **Category:** Security / Performance / Bug
- **Severity:** Medium
- **What changed:** (a) Added `escapeAttrValue()` helper in webmcp.ts for attribute selector escaping, replacing `CSS.escape()` which is for CSS identifiers, not attribute values. (b) Added `MAX_JSONLD_RECURSION_DEPTH = 10` limit to `collectSchemaTypes()` in nlweb.ts. (c) Added `window.addEventListener('beforeunload', stopWatchingToolChanges)` in webmcp.ts.
- **Why:** (a) Tool names containing `"` or `]` broke out of the attribute selector. (b) Maliciously nested JSON-LD could cause stack overflow. (c) MutationObserver was never disconnected on page unload.

## [FIX-010] - Low severity polish

- **Files:** `src/popup.ts`, `src/background.ts`, `src/side_panel.ts`
- **Category:** Bug / Performance / Code Quality
- **Severity:** Low
- **What changed:** (a) Popup URL truncation now uses `[...displayUrl].slice(0, 25)` to iterate by code points. (b) Cookie removal in `handleClearCookies()` uses `Promise.all()` instead of sequential `await`. (c) Storage deserialization in `loadMessages()` guards with `Array.isArray()` before cast.
- **Why:** (a) `substring(0, 25)` can split multibyte characters. (b) Sequential removal is unnecessarily slow for many cookies. (c) Corrupted storage (non-array) caused a runtime crash.
