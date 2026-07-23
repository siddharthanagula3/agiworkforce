# AGI Workforce Chrome Extension — Threat Model

**Surface:** `apps/extension/` (Chrome MV3 v1.2.0)
**Last updated:** 2026-07-23
**Owners:** Chrome extension engineer (delegated). Audit owner per `docs/current/agent-and-repo-operability.md`.

This document declares the trust planes, data classes, and flow rules that
the security model in `src/background/policy.ts` enforces. Every security
fix in `__tests__/security-fixes.test.ts` and the per-fix SECURITY comments
in the source should map back to a rule here.

When a comment in the source says **"SECURITY (X-NN audit YYYY-MM-DD): ..."**,
X-NN is an audit finding ID; the linked PR + this doc explain WHY the
mitigation is shaped the way it is.

---

## 1. Trust planes (most-trusted → least-trusted)

| Plane                                           | Reachable code                                                                        | Trust assumption                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Extension page**                           | popup, side panel, options                                                            | The user _intends_ this action. `sender.id === chrome.runtime.id && !sender.tab` is the predicate.                                                                                                                                                                                                                                                |
| **B. Managed Cloud API**                        | exact-match `https://agiworkforce.com/api/llm/v1/*` endpoints                         | Remote privileged boundary. Requires a fresh Clerk Native API bearer token, authenticates model admission server-side, and owns Chrome chat inference. Client tier, model, quota, and routing claims are untrusted.                                                                                                                               |
| **C. Native messaging host**                    | desktop bridge over `chrome.runtime.connectNative('com.agiworkforce.browser')`        | Installed by the user via the Desktop installer. Chrome's launch origin is bound to the configured extension ID. Only the initial `connect` is unsigned; every subsequent request and response requires the negotiated per-process HMAC session secret. Native messaging owns explicit context handoff and browser mechanics, not chat inference. |
| **D. Local desktop HTTP bridge**                | `http://localhost:8787` (port configurable via `agi_bridge_url` chrome.storage.local) | Trusted only after pairing (token in `chrome.storage.session.agi_bridge_token`). URL validated by `validateBridgeUrl`. It does not own Chrome chat inference.                                                                                                                                                                                     |
| **E. Content script on allowlisted origin**     | `agi_site_allowlist` Set in chrome.storage.local                                      | The user added this origin specifically. Can drive its own tab's DOM via `DOM_MUTATION_MESSAGE_TYPES`, query its own page context, call `REPLAY_SHORTCUT` on shortcuts it created (origin-stamped).                                                                                                                                               |
| **F. Content script on non-allowlisted origin** | any `http(s)://*/*` page where the user has NOT clicked "allow"                       | Untrusted. Messages rejected at `isAllowlistedSender`.                                                                                                                                                                                                                                                                                            |
| **G. Page DOM / page-supplied data**            | innerText, JSON-LD blocks, WebMCP tool descriptions, NLWeb probe responses            | Fully untrusted, even on allowlisted origins. Sanitization, redaction, size caps applied.                                                                                                                                                                                                                                                         |

---

## 2. Data classes

| Class                | Where stored                                                            | Egress allowed to                                                                                                          | Notes                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legacy provider key  | Removed from local, session, and sync storage at service-worker startup | **Nowhere.** Chrome has no BYOK execution path and chat code never reads or transmits this value.                          | `purgeLegacyProviderCredentials` is idempotent and attempts every storage plane independently.                                                   |
| Managed session      | Clerk Chrome Extension SDK-managed session state                        | Exact-match AGI Managed Cloud endpoints only.                                                                              | The app never owns or accepts a hand-pasted production token. The MV3 worker asks Clerk for a fresh token; retired manual keys are cleanup-only. |
| Bridge pairing token | `chrome.storage.session.agi_bridge_token`                               | Local bridge only (`X-Bridge-Token` header). Shape validated (H-07): `^[A-Za-z0-9_\-]{32,128}$`.                           | Set by pairing flow.                                                                                                                             |
| Autofill profile     | `chrome.storage.local.agi_autofill_profile`                             | Form fields on `linkedin.com` / `jobs.lever.co` autofill targets. **Never** `chrome.storage.sync` (H-04).                  | Migrated from sync via `migrateAutofillProfile()`.                                                                                               |
| Recorded actions     | `chrome.storage.local.agi_recorded_actions`                             | Replay against recorder's own tab.                                                                                         | Default selector-only (C-05). Opt-in to values drops passwords, redacts `cc-*` / `one-time-code`, runs `redactSecrets`.                          |
| Page innerText       | Ephemeral request context                                               | Only an explicit user chat submission or an approved selected/redacted handoff; never automatic navigation/readiness sync. | Invisible Unicode stripped + secrets redacted via `sanitizePageText`. Capped at `MAX_CONTEXT_HTML_CHARS` (100 KB).                               |
| Conversation history | `chrome.storage.local.agi_browser_conversations_v2`                     | Managed Cloud chat context only. It never joins Web/Mobile/Desktop consumer-chat synchronization implicitly.               | v1 and legacy stores migrate locally. Each conversation owns its model-selection and route-continuity state.                                     |

---

## 2.1 Demo Permission Story

The Chrome extension is not the main public demo path until install, pairing,
and site approval are shown on-screen. The manifest intentionally contains broad
browser permissions because MV3 needs them for the side panel, native messaging,
active-tab capture, tab grouping, context menus, and content-script discovery.
Runtime access is narrower than the manifest:

- Page-originated messages are rejected unless the tab origin is in the
  user-managed `agi_site_allowlist`.
- DOM-writing actions are restricted to the sender's own tab.
- Persistent shortcuts, scheduled tasks, recording value capture, and stream
  cancellation are extension-page-only.
- Local bridge access is limited to loopback URLs validated by `validateBridgeUrl`.
- Desktop bridge calls require explicit pairing before an `X-Bridge-Token` is
  attached to local bridge requests.

Demo rule: show Chrome as a Managed Cloud chat and approved-site browser companion.
Native messaging is an explicit Desktop context-handoff/browser-mechanics boundary,
not a fallback inference path.

### 2.2 Incognito boundary

The manifest sets `"incognito": "not_allowed"`. Chrome documents that both
`chrome.storage.local` and `chrome.storage.sync` remain shared even in split mode;
therefore split processes alone cannot isolate browser conversations, route state,
tokens, automation records, or allowlists. Incognito support stays disabled until
every persistent data class has an explicitly separate storage owner and lifecycle.

---

## 3. Flow rules (each rule = a SECURITY-NN comment somewhere)

### 3.1 Message-router gates (`background.ts handleMessage`)

In order:

1. **Format check.** `isValidMessage(msg)` requires `type: string`.
2. **Origin allowlist.** `isAllowlistedSender` rejects content scripts whose tab origin is not in `siteAllowlistCache`. Extension pages bypass via `sender.id === chrome.runtime.id && !sender.tab`. **(EXT-1/EXT-2.)**
3. **Extension-page-only types.** `EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(msg.type)` rejects content scripts even from allowlisted origins for state-mutating types: `CREATE_SCHEDULED_TASK`, `UPDATE_SCHEDULED_TASK`, `DELETE_SCHEDULED_TASK`, `SAVE_SHORTCUT`, `DELETE_SHORTCUT`, `SET_RECORDING_VALUE_CAPTURE`. **(C-02 / C-03.)**
4. **Same-tab DOM mutation.** `DOM_MUTATION_MESSAGE_TYPES.has(msg.type) && !senderTabAllowedToMutate(sender, msg.tabId)` rejects cross-tab DOM mutation. **(EXT-3 / CHROME-NEW-005 / P0-D.)**

### 3.2 Persistent-record provenance

Every persisted record (`SavedShortcut`, `ScheduledTask`) carries `createdByOrigin` stamped at creation time with either the `ORIGIN_EXTENSION_PAGE` sentinel (`__extension_page__`) or the URL origin of the originating content script. Fire-time / replay-time, the origin is re-checked against `siteAllowlistCache` via `shouldExecuteScheduledTask`; stale records are auto-deleted. **(C-02 / C-03.)**

### 3.3 LLM-output rendering

LLM-supplied markdown is rendered via `side_panel/markdown.ts renderMarkdown` + `sanitizeHtml` (DOMPurify). Defense-in-depth:

- URL inside `href="..."` is percent-encoded for `"`, `'`, `<`, `>` before interpolation. **(C-04.)**
- DOMPurify FORBID_TAGS includes `img` so the EchoLeak-class Markdown-image exfil vector (CVE-2025-32711) is closed.
- Anchor `rel="noopener noreferrer"` enforced via `afterSanitizeAttributes` hook. **(CHROME-NEW-005.)**

### 3.4 Page-context sanitization

`extractPageHtmlSafely` → `sanitizePageText` (in `policy.ts`):

1. Strip invisible Unicode classes (zero-width / bidi / tag chars).
2. Run shared `redactSecrets` (from `@agiworkforce/utils`) over the result.
3. Cap to `MAX_CONTEXT_HTML_CHARS` (100 KB).

### 3.5 Workflow recorder defaults

`automationState.captureValues` defaults to false. Opt-in via `SET_RECORDING_VALUE_CAPTURE` (extension-page-only). Even when opted in:

- `<input type="password">` is dropped entirely.
- `autocomplete` matching `cc-*`, `current-password`, `new-password`, `one-time-code` → value replaced with `'[REDACTED]'`.
- Remaining values pass through `redactSecrets`.

**(C-05.)**

### 3.6 Cookie access

`isCookieDomainAllowed` parses with `new URL`, lowercases hostname, matches against structured blocklist (exact / suffix / substring modes). The prior regex array silently broke under port suffixes. **(M-01 / CHROME-NEW-003 / CHROME-NEW-006.)**

### 3.7 NLWeb probes

`NLWEB_PROBE` is restricted to the sender's own origin (H-01). Extension-page callers are also rejected (fail-closed) since no extension-page code today calls this handler. **(Self-review #11.)**

### 3.8 Screenshot capture

`CAPTURE_SCREENSHOT` from a content-script sender captures _the sender's own tab_, ignoring any `tabId` in the message body and any active-tab fallback. Extension pages may target a specific tabId or fall back to the active tab. **(H-09.)**

### 3.9 Bridge URL semantics

`validateBridgeUrl` is the single source of truth (in `policy.ts`). Accepted hostnames: `localhost`, `127.0.0.1`, `[::1]` (with brackets). `0.0.0.0` deliberately rejected. Side panel, pairing, probeBridgeStatus, and tests all import from policy. **(H-02 / H-03 / H-08.)**

### 3.10 Gateway URL allowlist

`validateGatewayUrl` uses EXACT-match allowlist. The previous open subdomain rule (`*.agiworkforce.com`) is rejected because a delegated subdomain could land in the JWT path. **(C-1 / M-02.)**

### 3.11 Pairing token shape

Tokens accepted from the desktop `/pair` endpoint must match `/^[A-Za-z0-9_\-]{32,128}$/`. Fingerprints: `/^[A-Za-z0-9_\-]{4,32}$/`. **(H-07.)**

### 3.12 Page-supplied JSON size caps

| Source                                       | Cap    | Const                     |
| -------------------------------------------- | ------ | ------------------------- |
| `<script type="application/ld+json">` blocks | 256 KB | `MAX_JSON_LD_BYTES`       |
| WebMCP tool inputSchema                      | 64 KB  | `MAX_WEBMCP_SCHEMA_BYTES` |
| NLWeb probe body                             | 256 KB | `MAX_NLWEB_PROBE_BYTES`   |

Implemented via `safeJsonParse` which returns `undefined` on oversize or parse-failure. **(M-03.)**

### 3.13 Console-log capture removed

`patchConsole` was removed entirely (M-13). Page-script console interception is a fingerprint and an interference risk. If console-log capture is ever needed, the `chrome.debugger` API gives a per-tab, user-opt-in path with no monkey-patch.

### 3.14 Computer-use agent loop (autonomous CDP control)

The computer-use feature drives a tab via the agent loop (`features/computer-use/agentLoop.ts`, dispatched from `background.ts`). It is the extension's highest-risk capability: an LLM plans actions from page content and executes them against the live tab. The page is untrusted, so the page can attempt **prompt injection** to steer the agent.

- **Human-in-the-loop is the default (P0).** `background.ts` reads `agi_cu_ask_before_acting` from `chrome.storage.local`; an **unset** pref is treated as ask-before-acting (`askPref['agi_cu_ask_before_acting'] !== false`). Allow-all ("autopilot") is an explicit opt-out the user selects by unchecking the side-panel toggle (`computerUsePanel.ts`, default `checked = true`). A prior default-allow-all (auto-execute with no confirmation on injectable pages) is treated as a trust-boundary defect.
- **Approval gate is forge-resistant and fail-closed.** When gated, `onBeforeAction` sends `AGI_CU_APPROVE_REQUEST` with a **CSPRNG** request id (`crypto.randomUUID`, not `Math.random`) and only honors an `AGI_CU_APPROVE_RESPONSE` from a trusted extension page (`sender.id === chrome.runtime.id && !sender.tab`), so a prompt-injected content script cannot forge approval. No response within 30 s = **DENY**.
- **Page-data egress is a trust-boundary crossing.** Action planning sends page content/screenshots to the LLM (managed gateway). This leaves the page's trust plane; page text must pass `sanitizePageText` (3.4) and our-cloud targets stay on the exact-match gateway allowlist (3.10).
- **`chrome.debugger` scope / detach.** CDP control requires the `debugger` permission (per-tab attach). The attach surfaces Chrome's "started debugging this browser" banner (cannot be suppressed); the loop must detach when the goal completes or the tab closes so no stale CDP session outlives the task.

### 3.15 Native messaging and selected-context handoff

- Chrome supplies the invoking extension origin when launching the native host. Desktop binds the in-protocol `extension_id` claim to that OS-mediated origin and the manifest allowlist.
- The first `connect` request is the only unsigned message. Desktop returns a random 32-byte per-process secret, and Chrome refuses to mark the bridge connected unless that secret is present and well formed.
- Every later request signs `id|timestamp|exact JSON.stringify(message)` with HMAC-SHA256. Desktop rejects missing/invalid MACs, expired/future envelopes, duplicate request IDs, malformed IDs, and replay-cache overflow. Responses use the same authenticated envelope discipline.
- Service-worker suspension sends no ad-hoc protocol envelope. `onSuspend` marks suspension in progress, cancels any pending reconnect timer, and closes the native port; the disconnect handler sees the suspension flag and does not schedule a reconnect. The next worker instance must establish a new port and negotiate a fresh authenticated session.
- A context-menu selection is stored only as a redacted, size-limited, query-free preview. Nothing crosses the native boundary until the extension page explicitly approves it.
- Desktop validates the approved payload again, stages it as `desktop_context_preview`, and does not inject it into a conversation automatically. The Desktop UI recovers late native stages, validates the exact payload and expiry again, and presents an explicit review dialog with the query-free source URL, a URL-derived source label, and the selected text marked as untrusted page data.
- Accept is enabled only in the Local Desktop trust plane and writes the exact reviewed payload into the canonical composer draft without sending it. Discard and expiry remove the preview without insertion; exact-match native acknowledgement prevents an older review from clearing a newer stage. The authenticated protocol does not currently carry the page title, so the displayed source label is explicitly identified as URL-derived rather than asserted to be the page title.

---

## 4. Invariants the test suite enforces

These are contracts every PR must keep — failing any of them is a release-blocker:

- `EXTENSION_PAGE_ONLY_MESSAGE_TYPES` rejects content-script senders (`policy.test.ts`, `extension-page-only-gate.test.ts`).
- `DOM_MUTATION_MESSAGE_TYPES` covers every DOM-writing handler (`policy.test.ts`).
- `validateBridgeUrl` rejects `0.0.0.0` and accepts `[::1]` with brackets (`bridge-url-validation.test.ts`, `policy.test.ts`).
- `validateGatewayUrl` is exact-match (M-02; `security-fixes.test.ts`).
- `validateShortcutActions` rejects unknown action types (`shortcut-action-validation.test.ts`, `run-page-actions-validation.test.ts`).
- `redactSecrets` covers all 14 patterns (`security-fixes.test.ts` P1-14 + `extract-page-html-unicode.test.ts`).
- `sanitizePageText` strips invisible Unicode (`extract-page-html-unicode.test.ts`).
- Side panel does NOT send `apiKey:` on CHAT_MESSAGE; background `handleChatMessage` does NOT destructure `apiKey` (static AST checks in `security-fixes.test.ts`).
- Chrome chat and in-page prompt handlers use the Managed Cloud owner and never fall back to native messaging or the local Desktop HTTP bridge (`security-fixes.test.ts`).
- The manifest explicitly disallows incognito while browser-owned data uses shared Chrome local storage (`manifest-contract.test.ts`).
- Production packaging requires an exact HTTPS Clerk Frontend API/Sync Host,
  a live publishable key, and stable CRX public key; it never emits wildcard
  Clerk host permissions (`release-manifest-config.test.ts`).
- Clerk's runtime CSS-in-JS is allowed through `style-src 'unsafe-inline'`,
  while `script-src` remains restricted to `'self'` with neither
  `'unsafe-inline'` nor `'unsafe-eval'` (`manifest-contract.test.ts`).
- `migrateAutofillProfile` is idempotent + clears sync (`autofill-storage.test.ts`).
- Recorder defaults to selector-only and redacts password / cc / one-time-code on opt-in (`recorder-redaction.test.ts`).
- `CAPTURE_SCREENSHOT` restricts content scripts to their own tab (`screenshot-tab-restriction.test.ts`).
- No readiness/navigation listener performs implicit page-context transfer (`context-handoff-boundary.test.ts`).
- Only the initial native `connect` response may be unsigned; every post-connect request and response requires the negotiated HMAC session (`context-handoff-boundary.test.ts` plus Desktop native-messaging tests).
- No `<<<<<<<` or `>>>>>>>` markers in `src/` or `__tests__/` (`scripts/check-conflict-markers.sh`, wired as `pretest`).
- `patchConsole` removed entirely (`security-fixes.test.ts` M-13 block).
- Computer-use defaults to ask-before-acting: an unset `agi_cu_ask_before_acting` is treated as gated (default-deny), never allow-all (`computer-use-default-ask.test.ts`; §3.14).
- Commit messages follow Conventional Commits with the `Co-Authored-By:` footer — enforced by `.husky/commit-msg` running `pnpm exec commitlint --edit "$1"` monorepo-wide. The extension's `package.json` does not duplicate this hook because the root hook already gates every commit in the workspace (L-15 audit 2026-05-19).

---

## 5. Known residual risks (tracked, not yet mitigated)

| Risk                                                | Why deferred                                                                                                                                               | Tracking                                                                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chrome.storage.sync` history retention             | The migrator (H-04) clears the _current_ sync value but Google retains history. Notifying existing users is a product decision.                            | PR description for the audit batch.                                                                                                                                       |
| `style-src 'unsafe-inline'` in extension-page CSP   | Clerk's supported Chrome-extension UI uses runtime CSS-in-JS and requires inline style permission. App-owned styles remain in Constructable Stylesheets.   | Accepted narrowly for styles as of 2026-07-23. `script-src` remains `'self'` and tests reject `'unsafe-inline'` / `'unsafe-eval'` script execution.                       |
| Pre-stamp legacy records                            | Records without `createdByOrigin` are permitted at fire-time (legacy grace).                                                                               | Acceptable: field set on creation post-fix.                                                                                                                               |
| Cross-extension messaging                           | `externally_connectable` not declared, so other extensions cannot send. If that changes, message-router gates must extend their sender-id check.           | Declared rule, not a tested invariant today.                                                                                                                              |
| Clerk dashboard/store identity                      | Native API enablement and production `allowed_origins` are external state; repository tests cannot prove them.                                             | Release is blocked until the stable store ID is added as `chrome-extension://<id>` and verified against the production instance.                                          |
| ~~Staged Desktop context has no accept/discard UI~~ | ~~The authenticated receiver deliberately does not inject selected text into chat; Desktop had no frontend listener for `extension:selected_text_query`.~~ | **RESOLVED 2026-07-15:** Desktop now has a Local-only, explicit context review with accept/discard, expiry, late-stage recovery, queueing, and listener cleanup coverage. |

---

## 6. Adding new message types — checklist

When you add a new `case 'FOO':` to `background.ts handleMessage`, ask:

1. **Does this message mutate the target tab's DOM?** If yes, add `'FOO'` to `DOM_MUTATION_MESSAGE_TYPES` in `policy.ts`.
2. **Does this message mutate persistent state that outlives the tab?** If yes, add `'FOO'` to `EXTENSION_PAGE_ONLY_MESSAGE_TYPES` (or design a web-callable variant with explicit rate limits).
3. **Does the handler return data scoped to a specific origin?** Consider sender-origin matching; if not, design a same-origin restriction.
4. **Does the handler call `chrome.tabs.captureVisibleTab` / `executeScript` / `cookies.*`?** Restrict to `sender.tab.id` rather than any caller-supplied or active-tab fallback.
5. **Does the handler accept a JSON string from the page?** Run it through `safeJsonParse` with an appropriate cap.
6. **Does the handler send data to the LLM?** Run text through `sanitizePageText` first.

If you can't answer YES/NO confidently for any of these, the change needs a security review before merge.
