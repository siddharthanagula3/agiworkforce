# Chrome Extension (`apps/extension`) — Capability Inventory

**Audited:** 2026-08-15, commit `e15df56e3` (tree clean), branch `compliance/dpdp`
**Method:** Read-only. Every claim below is anchored to a file path; verified against
running `pnpm exec vitest run` (112 files / 1549 tests, all pass) and
`node scripts/check-no-cloud-ipc-v1.mjs` (exit 0) at audit time, not against test names alone.
**Prior coverage:** `audit/ui-gaps.csv` has 5 rows for this surface. This inventory
supersedes that as the baseline.

## 0. Top-line verdict

This is **not** a thin wrapper that opens `agiworkforce.com` in a side panel. It is a
~35,000-line, hand-built vanilla-TS/DOM Chrome MV3 application with a real CDP-based
browser-automation agent, a genuinely enforced Managed-Cloud provenance/mirroring
trust boundary, a job-application autofill+escalation engine with no equivalent in
Claude in Chrome or the ChatGPT extension, and 1,549 passing unit/integration tests.
The security engineering (message-policy matrix, origin allowlisting, HMAC native
handshake, prompt-injection fencing) is more mature than the "least-audited surface"
framing suggests. The gaps that do exist are concrete and named below: no
console/network capture (deliberately removed), no file-upload/download automation,
no 1Password-style credential handoff, no per-site "Allow once/Always allow" approval
card (a static allowlist instead), and a real, measurable composer feature gap
against the shared `ChatInput.tsx` the code claims to mirror by hand.

---

## 1. Manifest audit (`apps/extension/manifest.json`)

MV3, `manifest_version: 3`, version `1.2.0`, `minimum_chrome_version: "132"`.

| Permission          | Declared use (THREAT_MODEL.md)          | Verified used in code                                                                                                                                                                         | Verdict  |
| ------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `activeTab`, `tabs` | Page context, tab query/manage          | `chrome.tabs.query/sendMessage/create/update` throughout `background.ts` (e.g. `apps/extension/src/background.ts:4650`, `:4915`)                                                              | COMPLETE |
| `scripting`         | Bounded script injection                | Content script registration + `RUN_PAGE_ACTIONS`/`EXECUTE_SCRIPT` handlers (`apps/extension/src/content.ts:266`, `:284`)                                                                      | COMPLETE |
| `debugger`          | CDP computer-use                        | `apps/extension/src/features/computer-use/cdpDriver.ts` — real `Page.captureScreenshot`, `Input.dispatchMouseEvent`, `Input.insertText`, `Page.navigate` (`cdpDriver.ts:418-549`, `:790`)     | COMPLETE |
| `cookies`           | Extension-UI cookie tools               | `SET_COOKIE` gated `extension-page-only` (`apps/extension/src/background/policy.ts:139`); `__tests__/background.cookies.test.ts`                                                              | COMPLETE |
| `nativeMessaging`   | Desktop pairing                         | `apps/extension/src/features/native-bridge/pairing.ts`, HMAC handshake at `apps/extension/src/background.ts:621-678`                                                                          | COMPLETE |
| `storage`           | Everything persisted                    | `chrome.storage.local/session/sync` used per THREAT_MODEL storage table                                                                                                                       | COMPLETE |
| `alarms`            | Scheduled tasks, keep-alive, sync sweep | `chrome.alarms.create('keep-alive', ...)` and `SYNC_SWEEP_ALARM` at `apps/extension/src/background.ts:5685-5703`; `apps/extension/src/features/background/scheduled-task-runs.ts` (298 lines) | COMPLETE |
| `notifications`     | Task completion notices                 | `chrome.notifications?.onClicked` at `apps/extension/src/background.ts:4653`                                                                                                                  | COMPLETE |
| `contextMenus`      | Page actions                            | 8 real menu items wired to handlers, `apps/extension/src/background.ts:4666-4847`                                                                                                             | COMPLETE |
| `sidePanel`         | Primary UI                              | `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true})` at `apps/extension/src/background.ts:805`                                                                                  | COMPLETE |
| `tabGroups`         | "Add to tab group"                      | `ensureTabGroup()` at `apps/extension/src/background.ts:4680` + context-menu item                                                                                                             | COMPLETE |

**No declared-but-unused permission found.** Every permission in `manifest.json:10-23` has
a live, gated call site.

**No over-broad host permission beyond what's declared:** `host_permissions` is
`localhost`/`127.0.0.1`/`agiworkforce.com`/`api.agiworkforce.com` only
(`apps/extension/manifest.json:24-29`); `GATEWAY_URL_ALLOWLIST_EXACT` in
`apps/extension/src/background/policy.ts:644-652` is an exact-match set, not a
subdomain wildcard (the code comment at `:637-640` documents this was previously an
open-subdomain bug, M-02, now fixed).

**Content script is broad by design** (`http://*/*`, `https://*/*`,
`manifest.json:37-45`) — THREAT_MODEL.md calls this out explicitly as a material
attack-surface choice (`THREAT_MODEL.md:60-65`), and the code backs the claim with a
same-origin/allowlist gate at the message-router layer (§5 below), not at the
content-script-injection layer. This is the standard trade every page-aware extension
(Claude in Chrome included) makes.

**No `downloads` permission** — confirmed absent from `manifest.json:10-23` and no
`chrome.downloads.*` call anywhere in `src/` (verified by grep). Claude in Chrome
declares `downloads` per the research doc (`audit/parity-2026-08-15/research/claude-code-chrome-ide.md:238`).
**Gap, not a mistake** — see §9.

**No `omnibox` key, no `default_popup`.** There is no popup surface and no omnibox
surface (see §2).

CSP (`manifest.json:30-32`) is restrictive: `script-src 'self'`, `object-src 'self'`,
`frame-ancestors 'none'`. `THREAT_MODEL.md:67-69` correctly flags that `style-src
'unsafe-inline'` and `img-src data:` are permitted — code review must not assume those
two are blocked; this is documented, not silently true.

`web_accessible_resources` is scoped to `icons/providers/*.svg` matched only against
`https://*.agiworkforce.com/*` (`manifest.json:81-86`) — narrow, appropriate.

---

## 2. Surfaces — which exist and are real

| Surface                           | Exists?            | Evidence                                                                                                                                                                                                                                       | Verdict                                                                                                                |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Side panel                        | Yes                | `src/side_panel.html` + `src/side_panel.ts` (10,933 lines), opened via `setPanelBehavior` (`background.ts:805`) and 6+ other trigger points (notification click, context-menu items, keyboard command)                                         | COMPLETE                                                                                                               |
| Popup                             | **Does not exist** | No `default_popup` in `manifest.json`; no `chrome.action.onClicked` listener anywhere in `background.ts` (grep confirms zero hits) — the toolbar icon opens the side panel directly via native Chrome behavior                                 | N/A (by design — not a gap, side panel replaces it)                                                                    |
| Options page                      | Yes                | `src/options.html` + `src/options.ts` (1,715 lines) — site allowlist, task-notification toggle, local dev bearer token (dev builds only), account state                                                                                        | COMPLETE                                                                                                               |
| Context menu                      | Yes, 8 items       | `ask-agi-workforce`, `explain-selection`, `translate-selection`, `summarize-page`, `capture-element`, `get-element-info`, `discover-webmcp-tools`, `add-to-tab-group` — all have live `onClicked` branches, `background.ts:4683-4845`          | COMPLETE                                                                                                               |
| Content-script UI (in-page panel) | Yes                | Shadow-DOM floating launcher + non-modal chat panel, `src/features/content/in-page-panel/launcher.ts` (209 lines), `panel.ts` (527 lines), `pageActions.ts` (185 lines); gated by `agi_in_page_panel_enabled` sync pref and the site allowlist | COMPLETE                                                                                                               |
| Omnibox                           | **Does not exist** | No `omnibox` key in manifest, no keyword-input handler                                                                                                                                                                                         | GAP (not competitively material — neither Claude in Chrome nor ChatGPT's extension ship one either, per research docs) |
| Keyboard commands                 | 2 real commands    | `_execute_action` (open side panel) and `capture_page` (screenshot → native message), `manifest.json:61-76`, dispatched at `background.ts:4903-4930`                                                                                           | COMPLETE                                                                                                               |

---

## 3. Page-context and automation capabilities

| Capability                                                | Present?                       | Evidence                                                                                                                                                                                                                                                                                                   | Verdict                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current page text extraction                              | Yes                            | `content.ts` extractor, capped at 30,000 visible chars (`THREAT_MODEL.md:124-125`), redacted via `sanitizePageText` (`background/policy.ts:714-717`)                                                                                                                                                       | COMPLETE                                                                                                                                                                                                                                 |
| Selected text capture                                     | Yes                            | `ask-agi-workforce` context menu → `createSelectionContextHandoff` (`background.ts:4765-4794`)                                                                                                                                                                                                             | COMPLETE                                                                                                                                                                                                                                 |
| Screenshot (full tab)                                     | Yes                            | `chrome.tabs.captureVisibleTab` (`background.ts:4922-4925`, `capture_page` command) and CDP `Page.captureScreenshot` (`cdpDriver.ts:418-435`, computer-use path)                                                                                                                                           | COMPLETE                                                                                                                                                                                                                                 |
| Region/element screenshot                                 | Yes                            | `CAPTURE_ELEMENT` context-menu item + handler (`content.ts:280-282`)                                                                                                                                                                                                                                       | COMPLETE                                                                                                                                                                                                                                 |
| DOM read/query                                            | Yes                            | `GET_TEXT`, `GET_ATTRIBUTE`, `GET_PAGE_INFO`, `GET_FORMS`, `GET_ACCESSIBILITY_TREE`/`BUILD_ACCESSIBILITY_TREE` cases in `content.ts:254-320`                                                                                                                                                               | COMPLETE                                                                                                                                                                                                                                 |
| Form fill / submit                                        | Yes                            | `FILL_FORM`, `SUBMIT_FORM`, `SELECT_OPTION`, `CHECK`/`UNCHECK` (`content.ts:275-297`) plus a dedicated ATS-specific autofill engine (§4)                                                                                                                                                                   | COMPLETE                                                                                                                                                                                                                                 |
| Click / double-click / right-click / hover / focus / blur | Yes                            | `content.ts:242-304` (content-script path) and `cdpDriver.ts:443-477` (CDP path, used by the computer-use agent)                                                                                                                                                                                           | COMPLETE                                                                                                                                                                                                                                 |
| Type / keypress / hold-key                                | Yes                            | `content.ts:424-435,564-591`; CDP `type()` at `cdpDriver.ts:524-549`                                                                                                                                                                                                                                       | COMPLETE                                                                                                                                                                                                                                 |
| Scroll (page + scroll-into-view)                          | Yes                            | `content.ts:307,436-457,485-496`; CDP `scroll()` at `cdpDriver.ts:482-518`                                                                                                                                                                                                                                 | COMPLETE                                                                                                                                                                                                                                 |
| Drag-and-drop (page element)                              | Yes                            | `DRAG_DROP` case, `content.ts:310`                                                                                                                                                                                                                                                                         | COMPLETE                                                                                                                                                                                                                                 |
| Navigation (URL-bounded)                                  | Yes                            | CDP `navigate()` with `assertDestinationAllowlisted` + scheme allowlist, `cdpDriver.ts:745-818`                                                                                                                                                                                                            | COMPLETE                                                                                                                                                                                                                                 |
| Tab management (open/close/switch/enumerate)              | Yes                            | `GET_ALL_TABS`, `CREATE_TAB`, `CLOSE_TAB`, `SWITCH_TAB` — all `extension-page-only`, `background/policy.ts:135-138`                                                                                                                                                                                        | COMPLETE                                                                                                                                                                                                                                 |
| Tab groups                                                | Yes                            | `ADD_TAB_TO_GROUP`/`REMOVE_TAB_FROM_GROUP`/`GET_TAB_GROUP_STATE`, `ensureTabGroup()` at `background.ts:4680`                                                                                                                                                                                               | COMPLETE                                                                                                                                                                                                                                 |
| **File upload automation**                                | **No**                         | No `DOM.setFileInputFiles` CDP call anywhere in `cdpDriver.ts`; escalation engine explicitly documents file inputs as unfillable programmatically (`escalationEngine.ts:186-193`, `:34`) and instructs the agent only to "look for a visible upload button" — it cannot actually select a file             | **GAP** — Claude in Chrome supports "image/file uploads to forms" per research (`research/claude-code-chrome-ide.md:232`)                                                                                                                |
| **Download automation**                                   | **No**                         | No `downloads` permission, no `chrome.downloads.*` call (confirmed by full-tree grep)                                                                                                                                                                                                                      | **GAP** vs Claude in Chrome's `downloads` permission                                                                                                                                                                                     |
| **Console log capture**                                   | **Deliberately removed, DEAD** | `content.ts:164-179` — explicit comment: "console-patch removed entirely, and STAYS removed... The vestigial GET_CONSOLE_LOGS/CLEAR_CONSOLE_LOGS handlers and the empty buffer they answered were removed too (CHR-INPAGE-CONSOLE-PANEL-DEAD)... If a future flow needs console data, use chrome.debugger" | **DEAD (intentional)** — this is good hygiene (no lingering fake feature), but it is a genuine capability gap vs Claude in Chrome's "reads console errors and network requests for debugging" (`research/claude-code-chrome-ide.md:227`) |
| **Network request capture**                               | **No**                         | No CDP `Network.enable`/`Network.responseReceived`/`Network.requestWillBeSent` anywhere in `cdpDriver.ts` or `agentLoop.ts` (confirmed by grep)                                                                                                                                                            | **GAP** vs Claude in Chrome                                                                                                                                                                                                              |

---

## 4. Job-application autofill + escalation engine (differentiated capability, unique vs benchmark)

Neither Claude in Chrome nor the ChatGPT extension has an equivalent per the research
docs. Real, wired, and tested:

- Platform-specific selector sets for **Greenhouse**, **Lever**, **Ashby**, **LinkedIn** —
  `apps/extension/src/features/content/autofill/{greenhouse,lever,ashby,linkedin}.ts`.
- `detector.ts` infers field purpose via label→aria-label→name→id→placeholder cascade
  (`detector.ts:288-351`).
- `filler.ts` writes values and reports per-field success/failure.
- `escalationEngine.ts` (315 lines) is a genuine "one agent, two strategies" boundary
  detector: after the deterministic fast-path runs, it re-reads the committed DOM
  value and compares against the intended value (catches React-swallowed events,
  `escalationEngine.ts:67-89`), detects login walls, CAPTCHAs, typeaheads, file
  inputs, and required-but-empty fields, then hands a **goal string** to the CDP
  computer-use agent loop (`agentLoop.ts`) to finish only the blocked fields — with an
  explicit instruction never to click Submit (`escalationEngine.ts:287`).
- Tests: `__tests__/autofill-detector-selector.test.ts`,
  `__tests__/autofill-escalation-agent-integration.test.ts`,
  `__tests__/autofill-outcome-banner.test.ts`, `__tests__/autofill-storage.test.ts`,
  `__tests__/jobAutofill.runtime.test.ts` — all pass.

Verdict: **COMPLETE**, and worth flagging in any competitive narrative as a real
differentiator, not filler.

Minor hygiene note: `src/jobAutofill.ts` (15 lines) is a thin TS wrapper around
`src/jobAutofill.runtime.js` (1,364 lines, plain JS with a co-located `.d.ts`) rather
than a native `.ts` module. Functions correctly (test passes) but is worth a
NEEDS_VALIDATION note for why this one module isn't TypeScript like everything else.

---

## 5. Message-policy security layer (background/policy.ts)

`apps/extension/src/background/policy.ts` is a single declarative policy matrix
(`MESSAGE_POLICY`, lines 76-204) classifying every message type as
`extension-page-only` / `allowlisted-tab` / `discovery`, each with a same-tab-only
flag. `message-policy-coverage.test.ts` fails the build if any dispatched message type
has no entry (`policy.ts:41-43`), so silent-default drift (which caused a real prior
bug, C-02/C-03, memories/quick-mode/tab-group handlers landing without gating — see
comment at `policy.ts:149-159`) is now caught mechanically. This is a genuinely
above-average security pattern for a browser extension.

- `AGI_START_COMPUTER_USE` and `CANCEL_COMPUTER_USE` are `extension-page-only`
  (`policy.ts:112-118`) — a content script on an allowlisted site **cannot** start the
  paid CDP loop through the message router, matching the THREAT_MODEL.md claim
  (`THREAT_MODEL.md:194-195`). Verified at the handler itself,
  `background.ts:3927-4059`.
- DOM-mutating types (`CLICK`, `TYPE`, `SCROLL`, `FILL_FORM`, etc.) are `allowsCrossTab:
false` (`policy.ts:78-97`) — same-tab only, enforced.
- One documented, intentional fail-open case:
  `shouldExecuteScheduledTask()` (`policy.ts:728-735`) — `if (!task.createdByOrigin)
return true; // legacy task pre-stamp; permit`. A scheduled task created before
  origin-stamping shipped will fire even though its origin can no longer be verified
  against the current allowlist. This is a narrower, deliberately-scoped version of
  the same "legacy record, unknown provenance" problem the Managed-Cloud mirroring
  rule solves by failing _closed_ (§6) — here it fails _open_ for backward
  compatibility. **NEEDS_VALIDATION**: worth a security-review sign-off on whether
  this legacy-permit branch should instead auto-delete stale unstamped tasks the way
  `known-flaws.md`-style tracking would want, rather than trusting them indefinitely.

---

## 6. Managed-Cloud mirroring rule — verified enforced in code, not just documented

This is the trust-boundary rule `AGENTS.md`/`THREAT_MODEL.md:139-168` states: mirror a
conversation to the account **only** when every turn was inferred in Managed Cloud;
mirror is append-only; `chrome.storage.local` stays authoritative; one Local/BYOK/unknown
turn permanently disqualifies the conversation.

**Provenance stamp:** `HistoryMessage.runtime?: ConversationRuntime` where
`ConversationRuntime = 'managed-cloud' | 'local'`
(`apps/extension/src/features/background/conversation-history.ts:73,100`). The doc
comment is explicit: _"An absent value means 'unknown', which fails closed (never
synced)"_ (`conversation-history.ts:71`).

**Eligibility gate** (`conversation-history.ts:1465-1468`):

```ts
export function isCloudPersistenceEligible(entry: ConversationEntry): boolean {
  if (entry.cloudSync?.blockedReason === 'non-cloud-runtime') return false;
  return entry.messages.every((message) => message.runtime === 'managed-cloud');
}
```

`.every(...)` over the full transcript — one non-`'managed-cloud'` or `undefined`
message anywhere disqualifies the whole conversation. Confirmed there is **no** code
path in the extension that stamps `runtime: 'local'` on a live turn (grep across
`src/` found zero write sites for `'local'`; the only place `'local'` appears as a
literal is the type union itself and the _read_-side normalizer at
`conversation-history.ts:416-417`, which exists so a legacy/cross-surface record can be
normalized and still correctly fail the eligibility check). Chrome chat itself is
Managed-Cloud-only end to end — the only write sites for `runtime` stamp
`'managed-cloud'` (`side_panel.ts:4766,4824,10578,10636,10672`;
`features/background/background-results.ts:134`).

**Sticky disqualification:** `blockCloudPersistence(owner, conversationId,
'non-cloud-runtime')` sets `blockedReason: 'non-cloud-runtime'`
(`conversation-history.ts:1708-1710`), which is checked ahead of (and independent of)
the per-message check, and there is no code path anywhere that clears
`'non-cloud-runtime'` (contrast: `'auth'` _is_ clearable at `conversation-history.ts:1644`
— the sticky-vs-clearable distinction is deliberate and correctly asymmetric).

**Forced no-inference:** `conversationSyncClient.ts:1-8` states the mirror client hard-forces
`skipLlm: true` on every write, "so no payload this file can construct will ever
trigger inference or bill the user." `buildExtensionCloudMessageMetadata()`
(`conversationSyncClient.ts:115-166`) is bounded/truncated field-by-field before
serialization.

**Egress-boundary lint, verified live:** `node
apps/extension/scripts/check-no-cloud-ipc-v1.mjs` → `[AP-10] No direct cloud-IPC calls
found outside the cloud-bridge gate.` (exit 0, run at audit time). The script greps the
entire `src/` tree (excluding `features/cloud-bridge/` itself) for cloud-CRUD IPC
literals and `/api/chat/conversations` string literals and fails the build on any hit
(`check-no-cloud-ipc-v1.mjs:29-46`).

**Debounce + catch-up sweep, verified live:** `SYNC_SWEEP_ALARM` registered at
`background.ts:5694` with `periodInMinutes: 1.0`, matching THREAT_MODEL.md's "one-minute
catch-up sweep alarm so an evicted worker cannot strand it" claim (`THREAT_MODEL.md:151`).

**Tests, run at audit time, all pass:**
`__tests__/conversation-cloud-sync-state.test.ts`,
`__tests__/conversation-history.test.ts`, `__tests__/conversation-sync.test.ts`,
`__tests__/managed-cloud-authority.test.ts`, `__tests__/trust-boundary.test.ts`,
`__tests__/context-handoff-boundary.test.ts` — 103/103 tests pass
(`pnpm exec vitest run` on this file set).

**Verdict: COMPLETE.** This is a security-severity claim in the task brief, and it holds
up under code inspection, not just documentation — the enforcement is a real
`.every()` gate plus a sticky flag plus an egress lint plus passing tests, not a
comment promising behavior.

---

## 7. Native messaging host (`apps/extension/native-host/`)

- `apps/extension/native-host/com.agiworkforce.browser.json.template` — Chrome native-messaging
  manifest template with `<EXTENSION_ID_PLACEHOLDER>`/`<NATIVE_HOST_PATH_PLACEHOLDER>`
  substitution.
- `apps/extension/native-host/install.sh` → delegates to
  `apps/extension/scripts/install-native-host.sh`, which installs the manifest into
  Chrome/Chromium/Edge `NativeMessagingHosts` directories on macOS/Linux (Windows via
  a separate `.ps1`), and **refuses to proceed** if the actual host executable at
  `~/Library/Application Support/com.agiworkforce.desktop/native_messaging_host` (macOS
  default) is missing or non-executable — it prints "Launch AGI Desktop once so it can
  prepare the external native host helper" (`install-native-host.sh:47-51`) rather than
  silently installing a broken pointer.
- The actual host binary/logic lives cross-surface in `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`
  and `apps/desktop/src-tauri/src/integrations/native_messaging/{host,mod,manifest}.rs`
  — real Rust code exists there (out of this surface's scope to verify further, flagged
  for the Desktop-surface audit).
- Handshake: `apps/extension/src/background.ts:621-678` negotiates a 32-byte session
  secret via `crypto.subtle.importKey`/`crypto.subtle.sign` with HMAC-SHA256; secret is
  dropped on disconnect (`background.ts:1213`). `__tests__/native-host-installer.test.ts`
  and `__tests__/pairing.test.ts`/`pairing-e2e.test.ts` pass.
- Pairing token/fingerprint format is validated with a strict regex before use
  (`pairing.ts:25-34`).

**Verdict: COMPLETE and wired**, contingent on the Desktop app having been launched at
least once (by design — this is documented, not a silent failure).

---

## 8. Auth, model selector, chat history

- **Auth:** Clerk (`@clerk/chrome-extension`), `apps/extension/src/features/cloud-bridge/clerkAuth.ts`
  (311 lines). Owner identity is derived from the session JWT's own `sub`/`sid` claims
  because the MV3 background Clerk client with `standardBrowser: false` doesn't
  reliably hydrate `clerk.user` (`managedCloudAuthority.ts:62-76`) — a documented,
  reasoned workaround, not an unexplained hack. Signature is deliberately not
  re-verified client-side (self-minted token, used only for local-state partitioning;
  authority is server-side) — correctly scoped trust.
- **Model selector:** live-fetched from `https://agiworkforce.com/api/llm/v1/models`
  (`MANAGED_MODELS_ENDPOINT`, `freeTrialClient.ts:103,167`), not hardcoded. Rendered
  with per-provider SVG badges (`side_panel.ts:5892-6014`).
- **Chat history:** `agi_browser_conversations_v2` in `chrome.storage.local`, partitioned
  by exact account/session owner, capped at 4 MiB aggregate / 1 MiB per entry / 30-day
  TTL (`THREAT_MODEL.md:285`). Real drawer UI with search (`side_panel.ts:6572`).
- **Owner-change safety:** sign-out or account switch aborts in-flight streams and
  rejects delayed chunks whose owner no longer matches
  (`managedCloudAuthority.ts:142-173`, `isManagedCloudBroadcastOwnedBy`).

**Verdict: COMPLETE.**

---

## 9. Site allowlist, incognito, prompt-injection defenses

- **Allowlist model:** a **static, user-managed list** in the Options page
  (`site-allowlist.ts`, `options.ts:1056-1066` — "Approved sites (allowlist)" section
  with add/remove UI), not a per-domain "first action → Allow once / Always allow /
  Deny" approval **card** like Claude in Chrome's model
  (`research/claude-code-chrome-ide.md:257`). **Gap** — the AGI model requires the
  user to proactively add a site in Options before any privileged capability works
  there; Claude in Chrome's model prompts contextually on first use per site. Neither
  is wrong, but they are materially different UX, and AGI's has no "Allow once"
  (session-scoped, non-durable) tier at all — every approval is durable until removed.
- **No sensitive-action floor.** No code anywhere blocks financial-transaction,
  account-creation, or CAPTCHA-bypass actions even under an explicit "ask before
  acting = false" opt-out (confirmed absent by grep for `financial|purchase|checkout|
payment` across `src/`). Claude in Chrome has an explicit non-overridable floor for
  exactly these three categories per the research doc (`claude-code-chrome-ide.md:258`).
  AGI's only safety net once a user disables ask-before-acting is the origin allowlist
  itself — there is no category-level backstop. **Gap, security-relevant.**
- **Incognito:** `"incognito": "not_allowed"` (`manifest.json:9`) — Chrome will not even
  load the extension in an incognito window. This is **stronger** than Claude in
  Chrome's incognito behavior, which the research doc marks UNVERIFIED/undocumented
  (`claude-code-chrome-ide.md:263-265`). **AGI wins this specific axis.**
- **Prompt-injection defenses, layered and real:**
  - Invisible-Unicode stripping (`INVISIBLE_UNICODE_RE`, `policy.ts:705-707`, citing
    Greshake 2023 / EchoLeak CVE-2025-32711 / ASCII-smuggling in the comment).
  - Pattern-based secret redaction (`redactSecrets`, shared `@agiworkforce/utils`).
  - Content fencing with an injection heuristic that prefixes a WARNING when common
    prompt-injection patterns are detected in page text
    (`cdpDriver.ts:560-563`, `scanForInjection()` at `cdpDriver.ts:711`).
  - Size bounds everywhere untrusted page content crosses a boundary (30,000-char page
    text cap, 100,000-char `MAX_CONTEXT_HTML_CHARS`, 256 KB JSON-LD, 64 KB WebMCP
    schema — `policy.ts:335,344-347`).
  - Explicit acknowledgment in THREAT_MODEL.md that this is mitigation, not proof
    (`THREAT_MODEL.md:78-80,298`) — matches Claude's own "aren't foolproof" framing
    (`claude-code-chrome-ide.md:254,261`). Honest parity on this specific point.

**Verdict: PARTIAL** — genuinely defended against the injection-content risk class, but
missing the two structural UX/policy backstops (per-site contextual approval card,
sensitive-action floor) that the benchmark extension has.

---

## 10. Handoff to Desktop / IDE

- **Explicit selected-text handoff** (THREAT_MODEL.md §"Explicit Chrome to Desktop
  context handoff", `THREAT_MODEL.md:260-279`): user selects text → 2,000-char cap,
  URL stripped to origin+path, 5-minute session-only preview, requires an explicit
  **Send redacted context** click, Desktop stages (doesn't auto-insert) and requires a
  second review + Local-privacy-mode gate to accept. Implementation:
  `apps/extension/src/features/context-handoff/index.ts` (356 lines). Tests:
  `__tests__/context-handoff.test.ts`, `__tests__/context-handoff-boundary.test.ts` —
  pass.
- **WebMCP metadata bridge:** allowlisted pages can publish bounded tool declarations
  (max 64 tools, name/description/schema size-capped, name pattern-validated) that are
  forwarded to an already-paired Desktop session over the same HMAC-authenticated
  channel (`webmcp.ts`, `background.ts` `normalizeWebMCPToolsUpdate` at
  `policy.ts:416-463`). Explicitly does **not** carry prompt text, chat history,
  cookies, or tool results — metadata only (`THREAT_MODEL.md:233-258`).
- **No IDE-specific handoff** (no VS Code deep link, no `@browser`-equivalent from an
  editor into this extension) — that integration direction (Claude Code CLI/VS Code →
  browser) is genuinely a Claude-only feature per the research doc
  (`claude-code-chrome-ide.md:170,242-250`) and has no counterpart here. This extension
  is the destination of a handoff (from Chrome to Desktop), never a target an IDE
  drives. **Gap**, but this repo's separate `apps/vscode` surface is the more relevant
  place to look for the inverse direction — out of this audit's scope.

**Verdict: COMPLETE** for what's implemented (Chrome→Desktop); **absent** for
IDE→Chrome, which is a different surface's responsibility.

---

## 11. Headline question — does it merely open the main website?

**No — confirmed false, and confirmed with a measurable feature-drift cost.**

- `src/side_panel.ts` is 10,933 lines. Zero `react` imports (grep confirms). Uses a
  hand-rolled `el()` DOM builder (`features/side-panel/dom.ts`) throughout — genuinely
  vanilla TS/DOM, not React, not an iframe, not a webview pointed at the website.
- The claimed comment exists exactly as described: `side_panel.ts:9352-9353` —
  _"Mirrors `packages/ui/unified-chat/ChatInput.tsx` and the VS Code webview composer
  wire"_ — attached to the paste-image handler. This confirms the shared-packages.md
  finding: behavior is manually re-derived by reading the shared component, not
  imported from it. There is no `@agiworkforce/ui/unified-chat` import anywhere in
  `side_panel.ts` (confirmed by import-block inspection, lines 1-157).

**Concrete drift, feature-by-feature**, comparing `side_panel.ts` against
`packages/ui/unified-chat/src/components/ChatInput.tsx` (1,422 lines) +
`ChatInputToolbar.tsx` (223 lines):

| Composer feature in shared `ChatInput.tsx`                                               | Present in `side_panel.ts`?                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slash-command menu (`/plan`, `/rewind`)                                                  | **Yes** — own reimplementation, `side_panel.ts:2015-2043` (styles), `matchSlashCommands`                                                                                                                                                                  |
| Extended-thinking toggle                                                                 | **Yes** — own reimplementation, `thinkingEnabled` + toggle UI, `side_panel.ts:6129-6135`                                                                                                                                                                  |
| Reasoning-effort control                                                                 | **Yes** — own reimplementation, `#sp-effort-control` popover/slider, `side_panel.ts:2326-2386`                                                                                                                                                            |
| Model selector w/ fallback-model flag                                                    | **Yes** — own reimplementation, `side_panel.ts:5892-6014`                                                                                                                                                                                                 |
| Drag-and-drop file attach + paste-image                                                  | **Yes** — `side_panel.ts:9956-9978` (drop), `:9350-9367` (paste)                                                                                                                                                                                          |
| **`AgentControl` (Ask/Auto/Plan/Bypass agent-mode chips)**                               | **No** — zero matches for `AgentControl`/`agentMode`/`bypass`/`PlanMode` as UI concepts in `side_panel.ts` (grep confirms)                                                                                                                                |
| **`PlanModeToggle`**                                                                     | **No**                                                                                                                                                                                                                                                    |
| **Skill `@mention` picker** (`SkillMentionPicker`)                                       | **No** — zero matches for `SkillMention`/`@skill`                                                                                                                                                                                                         |
| **"Project or folder" picker / Chat↔AGI Work mode toggle** (`projectPicker`, `workMode`) | **No** — zero matches for `projectPicker`/`workMode`/`AGI Work` (arguably N/A for a browser extension with no project concept, but it is a real, silent capability gap if AGI Work conversations are ever expected to be visible/continuable from Chrome) |
| **Research toggle** (`supportsResearch`)                                                 | **No** — zero matches for a `research` toggle as a composer control (the string `'research'` only appears as a routing-task-type enum value and unrelated copy)                                                                                           |
| **Explicit one-shot web-search toggle** (`supportsExplicitLocalWebSearch`)               | **No**                                                                                                                                                                                                                                                    |
| **Code-execution ("Run code") toggle**                                                   | **No**                                                                                                                                                                                                                                                    |
| **Writing-style picker** (`WritingStyle`)                                                | **No**                                                                                                                                                                                                                                                    |
| Attachment menu: only 2 items (**Take a screenshot**, **file upload**)                   | The shared `AttachmentMenu` also offers Select folder, Record skill, Research, explicit Web search, Run code, Writing style — `side_panel.ts:9412-9477` shows only `screenshotItem` + `fileItem`                                                          |

**Assessment:** the extension is not merely a thinner composer — it has correctly
reimplemented the pieces that make sense for a browser context (thinking, effort,
model selector, slash commands, drag-drop) and correctly omitted desktop-only concepts
(project/folder scoping). But it is missing several controls that are **not**
desktop-specific — Skill mentions, Research, explicit web search, code execution,
writing style, and the Ask/Auto/Plan/Bypass agent-mode row — that exist in the shared
component precisely so every host can offer them. Because `side_panel.ts` doesn't
import the shared component, none of these will appear here automatically if/when they
ship elsewhere; each one requires a human to notice the gap and hand-port it, exactly
the drift risk `shared-packages.md` warns about. This is a real, currently-measurable
cost, not a hypothetical one.

**Verdict: PARTIAL** on composer parity specifically — full app is COMPLETE and
functionally real, but the "mirrors by reading, not importing" architecture has
already produced a concrete, listed feature gap.

---

## 12. Benchmark comparison summary (vs Claude in Chrome / ChatGPT extension)

| Axis                                                                            | AGI Chrome extension                                                                                            | Claude in Chrome (per research)                                           | Verdict                                                                                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Side panel is a real app, not an iframe                                         | Yes, vanilla TS/DOM                                                                                             | Yes (React, unconfirmed internally)                                       | Parity                                                                                                                     |
| DOM read/click/type/scroll/navigate                                             | Yes, CDP-backed                                                                                                 | Yes, CDP-backed (`debugger` permission)                                   | Parity                                                                                                                     |
| Screenshot                                                                      | Yes                                                                                                             | Yes                                                                       | Parity                                                                                                                     |
| File upload to forms                                                            | **No**                                                                                                          | Yes                                                                       | AGI gap                                                                                                                    |
| Download automation                                                             | **No** (`downloads` permission absent)                                                                          | Yes                                                                       | AGI gap                                                                                                                    |
| Console/network capture                                                         | **No** (deliberately removed)                                                                                   | Yes                                                                       | AGI gap                                                                                                                    |
| Cross-device history/skills/connector sync (Cowork merge, Aug 2026)             | **Partial** — one-way, append-only mirror to account; local always authoritative; nothing read back into Chrome | Yes — full bidirectional Cowork session sync across desktop/web/mobile    | AGI gap (but AGI's version is a narrower, more conservative trust design, not a broken attempt at the same thing — see §6) |
| Per-site approval UX                                                            | Static allowlist (Options page)                                                                                 | Contextual "Allow once/Always allow/Deny" card on first action per domain | AGI gap (UX/architecture, not security-severity by itself)                                                                 |
| Sensitive-action floor (financial/account-creation/CAPTCHA never auto-approved) | **No**                                                                                                          | Yes, explicit and non-overridable                                         | AGI gap (security-relevant)                                                                                                |
| Incognito                                                                       | Hard-blocked (`not_allowed`)                                                                                    | Unverified/undocumented                                                   | **AGI wins**                                                                                                               |
| Ask-before-acting default, timeout-to-deny                                      | Yes, default-on, 30s timeout                                                                                    | Not directly compared in research                                         | Parity or better                                                                                                           |
| Scheduled/recurring tasks                                                       | Yes                                                                                                             | Yes                                                                       | Parity                                                                                                                     |
| Workflow recording/replay                                                       | Yes (`START_RECORDING`/`STOP_RECORDING`/shortcuts)                                                              | Yes ("classic panel")                                                     | Parity                                                                                                                     |
| 1Password-style credential handoff                                              | **No**                                                                                                          | Yes                                                                       | AGI gap                                                                                                                    |
| Job-application autofill (Greenhouse/Lever/Ashby/LinkedIn) with escalation      | **Yes**                                                                                                         | Not mentioned in research                                                 | **AGI-only differentiator**                                                                                                |
| Native-messaging Desktop handoff with HMAC integrity                            | Yes                                                                                                             | Yes (own native-messaging host)                                           | Parity                                                                                                                     |
| Managed-Cloud-only chat, no silent Local/BYOK fallback                          | Yes, enforced                                                                                                   | N/A (different architecture — Claude is not multi-provider)               | AGI-specific, verified enforced                                                                                            |
| Paid-tier gate                                                                  | Public alpha, open by default (per `AGENTS.md`); optional invite code redeems only for plan credits             | Requires paid plan (Pro/Max/Team/Enterprise) at install                   | Different go-to-market, not a code defect                                                                                  |

---

## 13. Findings requiring follow-up (ranked)

1. **[Security-relevant, PARTIAL]** No sensitive-action floor for financial
   transactions/account creation/CAPTCHA bypass — once a user opts out of
   ask-before-acting, the only remaining backstop is the site allowlist itself, with no
   category-level hard block. `escalationEngine.ts` explicitly instructs the agent
   never to click Submit on a _job application_ (`escalationEngine.ts:287`) but there is
   no equivalent, general-purpose instruction or code-level block for payment/checkout
   flows anywhere in the automation stack. Recommend tracking in
   `docs/agent-context/known-flaws.md`.
2. **[NEEDS_VALIDATION]** `shouldExecuteScheduledTask()` (`background/policy.ts:728-735`)
   permits a legacy (pre-origin-stamp) scheduled task to fire without an allowlist
   check — fail-open, not fail-closed, unlike every other provenance gate in this
   codebase. Worth a deliberate security-review sign-off or a migration that
   auto-deletes/re-stamps legacy tasks instead.
3. **[Composer drift, PARTIAL — §11]** `side_panel.ts` is missing Skill `@mentions`,
   Research toggle, explicit web-search toggle, code-execution toggle, writing-style
   picker, and the Ask/Auto/Plan/Bypass agent-mode row that exist in
   `packages/ui/unified-chat/src/components/ChatInput.tsx`. None of these are
   desktop-specific concepts — they are plausible-to-want-in-Chrome capabilities that
   won't appear here automatically because the component is hand-mirrored, not
   imported.
4. **[Capability gap vs benchmark]** No file-upload automation (no
   `DOM.setFileInputFiles` equivalent), no download automation (no `downloads`
   permission), no console/network capture (deliberately and correctly removed rather
   than left as a fake stub — good hygiene, but still a real gap), no 1Password-style
   credential handoff.
5. **[Minor hygiene, NEEDS_VALIDATION]** `src/jobAutofill.runtime.js` (1,364 lines) is
   the only major non-TypeScript module in `src/`; a thin `.ts` wrapper
   (`jobAutofill.ts`) re-exports it. Functions correctly and is tested
   (`jobAutofill.runtime.test.ts` passes) — flagging only because every other feature
   module in this surface is `.ts`, so this is an outlier worth a one-line explanation
   in-repo (build-tooling reason? migration in progress?).

## 14. What is genuinely solid (do not re-litigate without new evidence)

- Managed-Cloud mirroring provenance/disqualification (§6) — verified in code, not
  just docs, with passing tests and a live-run egress lint.
- Message-policy matrix + coverage test (§5) — a real defense against the exact class
  of silent-gating bug (C-02/C-03) that bit this codebase before.
- Native-messaging HMAC handshake (§7).
- Job-application autofill+escalation engine (§4) — unique, real, tested.
- 1,549/1,549 tests pass; `check:no-cloud-ipc` passes; no `TODO`/`FIXME`/"coming
  soon"/"not implemented" strings found anywhere in `src/` (full-tree grep, verified
  clean).
