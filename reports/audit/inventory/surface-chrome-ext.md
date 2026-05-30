# Inventory Audit — Chrome Extension (apps/extension)

Surface: Chrome MV3 browser-automation extension. Auditor recon, READ-ONLY.
Date: 2026-05-29. HEAD branch: main.
Scope: `apps/extension/**` (src + manifest + native-host + scripts + tests).

LOC: ~23,400 non-test (src `.ts`/`.js`); ~10,870 test LOC across 38 test files.
Build entry points (vite.config.ts): `background`, `content`, `popup`, `side_panel`, `options` — these 5 + their import closures define what actually ships.

---

## Purpose & Architecture

The extension is the browser arm of AGI Workforce. Per `surface.ts` it is a **developer/task-scoped surface** (NOT consumer chat-history sync — sync is Web/Desktop/Mobile only; `surface.ts` asserts this at load). It surfaces chat in-page (side panel + in-page overlay), runs page automation (click/type/scroll/screenshot/forms), does LinkedIn/Lever job autofill, discovers WebMCP/NLWeb tools on the page, and bridges to the desktop app via the native-messaging host `com.agiworkforce.browser` and a localhost HTTP/SSE bridge (default `http://localhost:8787`).

Key architectural facts (verified against code, not docs):

- **Background service worker** (`src/background.ts`, 3080 lines) — message router, native-host connection lifecycle, page-action executor, cookies/tabs/screenshot handlers, scheduled-task alarms, keepalive. This is the trust nexus.
- **Content script** (`src/content.ts`, 2193 lines) — runs on every http(s) page (`document_idle`, top frame only). Page extraction, action execution, autofill entry, in-page-panel setup, WebMCP/NLWeb discovery.
- **Side panel** (`src/side_panel.ts`, 4584 lines) — the main chat UI (vanilla TS DOM, no framework). Markdown via DOMPurify.
- **Popup** (`src/popup.ts`, 1097 lines) — status, pairing, paywall card, memory list, site allowlist.
- **Options** (`src/options.ts`, 561 lines).
- **Security policy SSOT** (`src/background/policy.ts`, 458 lines) — message-type policy matrix, bridge/gateway URL validators, shortcut-action allowlist + per-field caps, prompt-injection unicode stripper, page-text sanitizer. Excellent, well-commented, single-source-of-truth design.

**No LLM inference runs in the extension's live path** (consistent with "desktop is the brain"). The only model-stream client (`streamFromProvider`) is orphaned (see Dead section).

### Trust model (live path) — strong

- **Message router** (`background.ts:929-1004`): every inbound message passes `isAllowlistedSender` (extension-page senders trusted; content-script senders gated by user-managed `agi_site_allowlist` origin set), then `EXTENSION_PAGE_ONLY_MESSAGE_TYPES` gate (state-persisting types only from popup/side-panel/options), then `DOM_MUTATION_MESSAGE_TYPES` cross-tab gate (`senderTabAllowedToMutate`). Defense-in-depth, derived from one declarative matrix in `policy.ts:72-103`.
- **Bridge URL**: `validateBridgeUrl` (`policy.ts:219`) collapses ws→http, rejects non-http(s), allows only `localhost`/`127.0.0.1`/`[::1]`. `getAgiBridgeBaseUrl` (`background.ts:2607`) re-validates the stored override and falls back to default on failure. No cloud egress in the live path — all `fetch()` go to the validated localhost bridge.
- **Gateway URL** (used only by the orphaned stream client): `validateGatewayUrl` exact-match allowlist, https-only.
- **Cookie access**: gated by `isCookieDomainAllowed` (deny-list of financial/gov/auth/social/target-platform domains, fail-closed parse).
- **Page text to LLM**: `sanitizePageText` strips invisible-unicode (prompt-injection vectors, `INVISIBLE_UNICODE_RE`) then `redactSecrets` (shared util). In-page overlay additionally redacts CC numbers + password lines (`pageActions.ts:181`).
- **Markdown**: DOMPurify with tight allowlist + `afterSanitizeAttributes` hook forcing `rel="noopener noreferrer"` on `target` anchors (`markdown.ts:14-28`); the markdown renderer also entity-encodes link text and blocks non-http(s) URL schemes before DOMPurify.
- **autoSubmit gate**: `content.ts:1293-1304` — any `autoSubmit:true` (including the `submit_job_application` action path at `content.ts:603`) forces a `window.confirm()`; payload-supplied confirmation flags are ignored. The anchor-doc "P2 open finding" is fixed.

---

## Alive vs Dead

This surface is mid-way through an abandoned `src/*` → `src/features/*` directory migration. The result is a confusing mix of real implementations, true re-export shims, and **diverged dead duplicates whose `@deprecated`/"canonical source" comments point the WRONG way**. Liveness must be stated per-file, not per-directory.

### ALIVE (in the entry-point import closure)

- `background.ts`, `content.ts`, `side_panel.ts`, `popup.ts`, `options.ts` (the 5 entries).
- `utils.ts`, `types.ts`, `tokens.ts`, `surface.ts`, `assets/icons.ts`.
- `background/policy.ts`, `background/memory-bridge.ts`.
- `features/background/shortcuts.ts`, `features/background/tasks.ts`, `features/background/conversation-history.ts` (imported directly by background/side_panel; legacy `conversation-history.ts` is a 1-line re-export of the features copy).
- `features/side-panel/markdown.ts`, `features/side-panel/voice.ts`.
- `features/native-bridge/pairing.ts` (re-exports the REAL impl in legacy `pairing.ts`; popup imports via the features path).
- `sendQueue.ts` (shim) → `features/native-bridge/sendQueue.ts` (real, live via side_panel).
- Content modules — the **legacy** copies are live: `webmcp.ts`, `page-metadata.ts`, `nlweb.ts`, `jobAutofill.ts` → `jobAutofill.runtime.js`, `dom-helpers.ts` (real impl despite "shim" comment), `platform-prompts.ts` (shim → `features/content/platform-prompts.ts` which IS the live one), `browserTool.ts` (shim → `features/content/browserTool.ts`, live).
- Autofill: `autofill/filler.ts` (live via `migrateAutofillProfile` import in background; transitively pulls `autofill/detector.ts`, `autofill/linkedin.ts`, `autofill/lever.ts` as type+value imports — so the whole legacy `autofill/` dir is in the closure), PLUS `jobAutofill.runtime.js` (1347-line self-contained monolith that does the actual fill at runtime).
- In-page panel — LIVE chain is `content.ts → inPagePanel/setup.ts` (REAL impl, 98 lines, misleading "shim" header) → imports `./launcher` + `./panel` (true 5-line shims) → `features/content/in-page-panel/{launcher,panel,panelStyles}.ts` (REAL, live). `panel.ts` imports `features/content/in-page-panel/pageActions.ts` (REAL, live, 183 lines).

### DEAD / ORPHANED (built, sometimes tested, but unreachable from any entry point)

1. **cloud-bridge cluster** — `features/cloud-bridge/{InviteCodeModal.ts (795 lines), desktopBridge.ts, types.ts, index.ts}` + `lib/waitlistService.ts` (202 lines). `mountInviteCodeModal` / `new InviteCodeModal` are never called outside the dir and tests; no entry point imports cloud-bridge. Built + unit-tested (`cloud-bridge-invite-code.test.ts`) but **not wired to any UI**. Given v1-local-only/cloud-waitlist posture this reads as "staged ahead of wiring," not broken — but it is dead weight today.
2. **`features/native-bridge/providerStreamClient.ts`** `streamFromProvider` (182 lines, LLM SSE client) — **never called anywhere** (only the legacy shim re-exports it + tests). Dead.
3. **Diverged content duplicates** (DEAD copies, reachable only via the dead `features/content/index.ts` barrel which nothing live imports): `features/content/nlweb.ts` (316 vs live 314, ~19 diff lines), `features/content/page-metadata.ts` (234 vs 234, ~28 diff), `features/content/webmcp.ts` (409 vs live 435, ~40 diff), `features/content/dom-helpers.ts` (47 lines; live copy is legacy `dom-helpers.ts`).
4. **Diverged autofill duplicates** (DEAD): entire `features/content/autofill/{filler,detector,linkedin,lever}.ts` (~1700 lines) — duplicates of the live `autofill/*`; nothing live or in tests imports them.
5. **Diverged in-page-panel duplicates** (DEAD, comments point wrong way): legacy `inPagePanel/pageActions.ts` (177 lines — live one is the features copy at 183, ~36 diff) and `features/content/in-page-panel/setup.ts` (84 lines — live one is legacy at 98, ~34 diff).
6. **Empty "planned inhabitants" scaffolding barrels** (5 lines each, no exports): `core/index.ts`, `data/index.ts`, `integrations/index.ts`, `platform/index.ts`, `ui/index.ts`, `features/background/index.ts`. Pure placeholder scaffolding for a restructure that never happened.

Estimated dead/duplicate weight: ~3,000-3,500 lines of orphaned or diverged-duplicate code.

---

## Test Coverage

38 test files, ~10,870 LOC. Coverage is genuinely good for the security-critical surface area: `policy.test.ts`, `bridge-url-validation.test.ts`, `pairing.test.ts` + `pairing-e2e.test.ts`, `security-fixes.test.ts`, `run-page-actions-validation.test.ts`, `shortcut-action-validation.test.ts`, `scheduled-task-origin.test.ts`, `screenshot-tab-restriction.test.ts`, `tab-updated-allowlist.test.ts`, `extension-page-only-gate.test.ts`, `background.cookies.test.ts`, `recorder-redaction.test.ts`, `extract-page-html-unicode.test.ts`, `connection-lifecycle.test.ts`, `background.reconnect.test.ts`. Tests import from `policy.ts` (no mirrored policy) — the H-02 mirror-drift anti-pattern is deliberately avoided.

Gaps / notes:
- Tests exercise the **dead** cloud-bridge + providerStreamClient (`cloud-bridge-invite-code.test.ts`, `providerStreamClient.paywall.test.ts`) — tests passing here gives false confidence that those features ship.
- The autofill runtime is tested via `jobAutofill.runtime.test.ts` (the live monolith) — good — but the diverged `autofill/*` / `features/content/autofill/*` copies are largely untested for divergence.
- I did not run the suite (instructed not to build); coverage assessment is by inspection of test targets vs live closure.

---

## Panic / Crash sites

No Rust here. `throw new Error` in the live closure (17 total in src) are all genuine error/invariant paths, none on a common user path:
- `popup.ts:238,326` "No active tab found" (rejected promise → caught by popup handlers).
- `popup.ts:346` "Screenshot failed" (error propagation from background response).
- `background.ts:411,418,2248` native handshake/ping failures (caught by the connection state machine, drives reconnect).
- `content.ts:1110` "Only http/https URLs are allowed" (URL scheme guard in execute-script path; intended rejection).

No `unwrap`/`expect`/`todo!`/`unimplemented!` (Rust idioms) — N/A. No raw `eval`/`new Function` (only a comment at `content.ts:1103` asserting their absence). Async handlers wrap bodies in try/catch and return `{success:false,error}` rather than throwing to the message channel.

---

## TODO / FIXME / HACK

Effectively zero. 1 grep hit total in non-test src and it is not an actionable TODO (a doc/comment match). This is unusually clean — the codebase uses dated audit IDs (M-01, H-02, C-02, etc.) in comments instead of TODOs.

---

## Security-sensitive code (with concrete concerns)

Most of the surface area is HARDENED. Concrete items:

- **MV3 permissions** (`manifest.json:8-22`): `activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies, notifications, tabGroups`. `host_permissions` limited to `http://localhost/*` + `http://127.0.0.1/*`. Broad `tabs`/`cookies`/`scripting` are inherent to a browser-automation product; runtime gating (allowlist + cookie deny-list + bridge validation) compensates. `<all_urls>` content-script match is broad but the script does nothing until its origin is on the user allowlist (router rejects otherwise; in-page launcher only injects on allowlisted origins per `setup.ts:48-68`). Reasonable least-privilege-with-runtime-enforcement.
- **CSP** (`manifest.json:24-25`): `default-src 'self'; script-src 'self'; style-src 'self'` (the `'unsafe-inline'` deferral noted in docs is RESOLVED — verified in manifest); `connect-src` enumerates localhost bridge + `*.agiworkforce.com`; `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
- **innerHTML usage** (31 hits): side_panel assistant bubbles use `sanitizeHtml(renderMarkdown(...))` (DOMPurify) — `side_panel.ts:1765,1926,2029`. `InviteCodeModal.ts:289,315,355,425` assign innerHTML from **static SVG/string literals** (DEAD module, low risk). `utils.ts:353` `return div.innerHTML` is a read (HTML-encode helper), not an injection sink. No user/model-controlled innerHTML outside the DOMPurify path.
- **Native messaging**: `connectNative('com.agiworkforce.browser')` (`background.ts:394`) with connect+ping handshake before marking connected. Host manifest template present (`native-host/com.agiworkforce.browser.json.template`) + installers (`scripts/install-native-host.{sh,ps1}`) — the anchor-doc claim that the host manifest is "absent from repo" is STALE.
- **Screenshot/page capture**: `captureVisibleTab` restricted; comment at `background.ts:1180` and `screenshot-tab-restriction.test.ts` guard against the "switch tab then exfiltrate visible tab" vector. Extension-page senders resolve to active tab; content-script senders restricted to `sender.tab`.
- **Pairing tokens**: validated `/^[A-Za-z0-9_\-]{32,128}$/`; fingerprints `/^[A-Za-z0-9_\-]{4,32}$/` (THREAT_MODEL §, H-07).
- **Transport**: localhost bridge is plaintext HTTP — accepted residual risk (desktop-side TLS deferred). A local malicious app binding 8787 is acknowledged in code comment (`background.ts:2101`). This is the one genuine residual security item, tracked and intentional.
- **Tracked residual risks** (THREAT_MODEL §5): `chrome.storage.sync` history retention by Google after migration; legacy pre-stamp records permitted at fire-time; `externally_connectable` not declared (so cross-extension messaging blocked today). All reasonable.

---

## AI-slop

The dominant slop signal is the **abandoned, half-applied `features/` migration** producing diverged duplicates and self-contradicting documentation:

1. **`@deprecated` / "canonical source" comments that point the wrong way.** `inPagePanel/setup.ts` and `inPagePanel/pageActions.ts` and `dom-helpers.ts` carry headers saying they are re-export shims whose canonical source is `features/content/...`, but they actually contain the FULL real implementation and (for setup/pageActions in-page-panel) are EITHER the live copy OR the dead copy inconsistently. A maintainer trusting the comment would patch the wrong file. This is a correctness hazard, not just cosmetic.
2. **Three parallel autofill implementations**: `jobAutofill.runtime.js` (live monolith, 1347 lines), `autofill/*` (legacy, in closure via `migrateAutofillProfile` but its fill logic overlaps the monolith), and `features/content/autofill/*` (dead duplicate, ~1700 lines).
3. **Diverged dead duplicates** of nlweb/webmcp/page-metadata under `features/content/` (19-40 diff lines each from the live legacy copies) — bugs fixed in one will not reach the other.
4. **Empty scaffolding barrels** (`core/`, `data/`, `integrations/`, `platform/`, `ui/`, `features/background/index.ts`) with "planned inhabitants — files will be moved here in subsequent phases" — phases that never ran.
5. **Buggy CI guard**: `scripts/check-no-cloud-ipc-v1.mjs:45` — `collectFiles(full)` recurses but **discards the return value** (doesn't merge into `results`), so only top-level `src/*.ts` is scanned. The v1-local-only cloud-IPC guard silently skips all subdirectories (including `features/`), giving false CI assurance.

No fabricated/hardcoded data rendered to users was found. Platform prompts (`platform-prompts.ts`) are intentional static system-context strings, not fake data. Provider/model lists come from `@agiworkforce/types` (`getCoreManualModelOptions`), not hardcoded IDs. Paywall feature/tier enums are duplicated as a manual mirror of `InlinePaywallCard.tsx` (`providerStreamClient.ts:33-47`) — a drift risk but documented.

---

## Broken / half-built features

- **Cloud-bridge / invite-code / waitlist UI** — fully built + tested but **not mounted** anywhere (`mountInviteCodeModal` never called outside tests). Either an unwired feature or staged-ahead work. (`features/cloud-bridge/InviteCodeModal.ts`, `lib/waitlistService.ts`)
- **`streamFromProvider`** — complete SSE/paywall stream client, **zero call sites**. (`features/native-bridge/providerStreamClient.ts:98`)
- **`features/` directory restructure** — abandoned mid-flight; ~3k lines of dead/diverged duplicates + 6 empty barrels.
- **In-page overlay model picker** — by design shows current model label only, no picker (per parity doc; minor UX gap, not broken).

No dead buttons, empty shells, or stubbed-return handlers found in the live UI paths (popup paywall, pairing, side-panel chat, autofill all wire to real handlers).

---

## Severity-ranked issues

### P1
- **Misleading `@deprecated`/"canonical source" comments invert the real live/dead relationship** — `apps/extension/src/inPagePanel/setup.ts:1-4` (real impl labeled "shim"), `apps/extension/src/inPagePanel/pageActions.ts:1-4` (real impl, but the LIVE one is `features/content/in-page-panel/pageActions.ts`), `apps/extension/src/dom-helpers.ts:1-5` (real impl labeled "re-export shim"). Plus diverged dead duplicates under `features/content/{nlweb,webmcp,page-metadata,autofill/*}.ts`. Fix hint: pick ONE canonical location per module, delete the dead copy, and make the kept legacy paths true 1-line re-export shims (as already done for launcher/panel/browserTool). A bug fixed in the wrong copy will silently not ship.

### P2
- **`check-no-cloud-ipc-v1.mjs` only scans top-level `src/*.ts`** — `apps/extension/scripts/check-no-cloud-ipc-v1.mjs:45` discards the `collectFiles(full)` recursion result. The v1-local-only cloud-IPC guard never inspects subdirectories. Fix hint: `results.push(...collectFiles(full))`. Build-time tooling only (not shipped code), but it provides false security assurance in CI.
- **Dead cloud-bridge + providerStreamClient subsystems** (~1,200 lines) built and tested but unwired — `features/cloud-bridge/InviteCodeModal.ts`, `lib/waitlistService.ts`, `features/native-bridge/providerStreamClient.ts:98`. Fix hint: confirm intent (gate it behind the invite flow per v1-cloud-bridge lock, or remove). Tests passing here misrepresent shipping status.
- **Empty scaffolding barrels** — `core/index.ts`, `data/index.ts`, `integrations/index.ts`, `platform/index.ts`, `ui/index.ts`, `features/background/index.ts`. Fix hint: delete or actually complete the restructure.

### P3
- **Plaintext localhost bridge transport** — `background.ts` fetch to `http://localhost:8787`. Accepted residual (desktop-side TLS deferred); a local malicious process could bind the port. Tracked. Fix hint: keep tracking; consider a per-session shared secret in the bridge handshake.
- **Cookie deny-list `gov`/`mil` suffix coverage** — `background.ts:1745` matches `.gov`/`.mil` TLDs but not e.g. `gov.uk`/`gov.in`. Minor; deny-list is best-effort by design. Fix hint: add country government suffixes if non-US gov protection matters.
- **Manual paywall enum mirror** — `providerStreamClient.ts:33-47` duplicates web `InlinePaywallCard` types. Drift risk. Fix hint: share via `@agiworkforce/types`. (Module is currently dead anyway.)
- **Popup brand gradient** — parity doc notes `#667eea/#764ba2` old-brand colors in popup vs design-token teal/terracotta. Cosmetic, also a `check:no-hex` candidate. (Not re-verified line-level this pass.)

---

## Open questions / uncertainty

- I did NOT run `pnpm test`/`build` (instructed not to). Liveness is established by static import-closure tracing from the 5 vite entry points + grep; test-pass status and runtime behavior are inferred.
- I traced imports by grep + reading entries and key modules; I did not read every line of the 4584-line `side_panel.ts` or 3080-line `background.ts` end-to-end. The security-critical handlers (router, cookies, native, screenshot, bridge, autoSubmit) were read directly; some side-panel UI plumbing was sampled, not exhaustively read.
- The cloud-bridge/providerStreamClient "dead" verdict is intent-ambiguous: it may be deliberately staged for the v1-cloud-bridge-waitlist rollout (`locks/v1-cloud-bridge-strategy-2026-05-23.md`) rather than abandoned. I flag it as unwired, not as a defect, pending owner intent.
- Anchor docs are partly STALE vs HEAD: docs claim "33 source files" (actual ~80 `.ts`), native-host manifest "absent" (present), CSP `'unsafe-inline'` open (resolved), keepalive at 0.5min (now 1.0 at `background.ts:2969`), autoSubmit unconfirmed (now gated). Recon was performed against code, not docs.
