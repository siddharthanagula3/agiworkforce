# AGI Workforce Chrome Extension Public Release Audit

Status: Current
Owner: Extension lead
Audit date: 2026-09-14
Applies to: `apps/extension` at the commit that carries this file, built with `pnpm build` (Vite 8, terser) and exercised as an unpacked extension in Chromium 141 through Playwright.

This is the single active audit for the Chrome extension. It describes the state of the extension after the fixes landed in the same change set; a finding that was fixed in this pass is listed once in §9.3 and nowhere else. Anything marked UNVERIFIED could not be exercised here and names the test that would settle it.

## 1. Executive Summary

Release status: **CONDITIONALLY READY**

| Severity | Open | Fixed in this pass |
| -------- | ---- | ------------------ |
| P0       | 0    | 0                  |
| P1       | 0    | 7                  |
| P2       | 8    | 25                 |
| P3       | 27   | 14                 |
| P4       | 12   | 3                  |

Top launch blockers (the conditions on "conditionally"):

1. **No authenticated live run has been performed against production Clerk and Managed Cloud.** Everything that needs a signed-in session (streaming latency T0–T10, stop propagation to the provider, service-worker restart mid-stream, sign-out during a run, account switching) is verified from code and unit tests only. The runbook in `docs/chrome-web-store-publish-runbook.md` already requires this gate; it has to be run with the two production test accounts before submission (§7, §12).
2. **Store listing assets do not exist in the repository.** No 1280×800 screenshots, no 440×280 promo tile; the Developer Dashboard cannot be completed without them (§8).
3. **The service worker loads a 2.6 MB shared chunk on every wake** because `@clerk/clerk-js`, `zod`, and the model catalog are bundled into one chunk shared by background, side panel and options. Measured import cost is ~200 ms on a cold document (§7). Not a correctness defect, but it is the single largest performance lever and should be split before a wide launch.
4. **Enterprise third-party-cookie blocking produces an unexplained sign-in loop** (EXT-012).

Strongest areas:

- Managed-cloud owner isolation: every conversation, stream, task and durable run is keyed by account and auth incarnation and re-checked after every await. Account switching cannot bleed data.
- Manifest V3 lifecycle: all listeners register synchronously at module evaluation; durable server-side runs are re-attached after a worker restart; cancel reaches the backend cancel endpoint; the maintenance alarm self-disarms.
- Message policy: a declarative per-type sender class with a CI-enforced coverage test; no `externally_connectable`, no `web_accessible_resources`, no `window.postMessage` relay, no `eval`.
- Page context is opt-in, capped, secret-redacted, invisible-Unicode-stripped, nonce-fenced as untrusted data, never stored locally or mirrored to the account, and dropped when the source tab or URL changes.
- Computer use is gated by two independent keys (device allowlist plus a Chrome-granted per-origin host permission) with ask-before-acting on by default.
- Release packaging: `verify-package.mjs` rejects `.env`, source maps, TypeScript, scripts and tests from the ZIP; versions are aligned three ways; publishing uses OIDC.

Weakest areas:

- Bundle composition and the all-sites content script (~136 KB parsed on every page, most of it for features that only run on approved sites).
- Feature scope: desktop pairing, voice input and scheduled tasks reach production with prototype-grade UX (no acquisition path, thin controls).
- Contrast: the accent-on-fill and danger-on-fill token pairs fail WCAG AA text contrast, and the extension has no analogue of the web app's `theme-contrast.test.ts`.
- Live verification coverage: the offline Chromium smoke proves rendering, owner fences and onboarding, but nothing that needs an account.

## 2. Extension Architecture

| Component       | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest        | Manifest V3, `manifest.json` in source; `scripts/manifest-config.mjs` adds the configured Clerk Frontend API and Sync Host origins to `host_permissions` and `connect-src` and the stable CRX `key` at build time. `minimum_chrome_version` 132, `incognito: not_allowed`, `default_locale: en`.                                                                                                                                                |
| Service worker  | `src/background.ts` (single ES-module bundle, 137 KB) plus a shared chunk. Owns message dispatch, managed-cloud streaming, native messaging, context menus, alarms, scheduled tasks, computer use (CDP), page watch, downloads, tab groups.                                                                                                                                                                                                     |
| Popup           | None. `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`: the toolbar action opens the side panel.                                                                                                                                                                                                                                                                                                                           |
| Side panel      | `src/side_panel.html` + `src/side_panel.ts` (415 KB built). One panel document per Chrome window; the conversation is scoped to the window (`window:<id>`), not to a tab or page. Header (model picker, history, new chat, quota, menu), composer with page chip, slash commands, attachments, autonomy chip and a model picker that carries quick mode; drawer with history, automation launchers, tools, pairing, allowlist, memory, account. |
| Content scripts | `src/content.js` (136 KB IIFE) on `http://*/*`, `https://*/*`, top frame only, `document_idle`. On an origin that is not on the approved-sites list it registers the message listener and does nothing else (measured: no DOM injection, no runtime message).                                                                                                                                                                                   |
| Injected UI     | Optional in-page launcher and panel (closed Shadow DOM, own stylesheet, system font stack), only on approved origins with the in-page panel preference on.                                                                                                                                                                                                                                                                                      |
| Context menus   | Selection: Ask AGI Workforce (desktop handoff preview), Explain this, Translate this. Page: Summarize this page, Add tab to AGI group. Registered on `chrome.runtime.onInstalled`.                                                                                                                                                                                                                                                              |
| Commands        | `_execute_action` (Ctrl+Shift+A / Cmd+Shift+A) opens the side panel; `capture_page` (unassigned) ships a screenshot to a paired AGI Desktop.                                                                                                                                                                                                                                                                                                    |
| Storage         | `chrome.storage.local`: owner-scoped conversations (capped), allowlist, browser-control consent record (origins only), autofill profile, memory cache, shortcuts, scheduled tasks, preferences. `chrome.storage.session`: pairing token and secret, pending handoff/chat pointers, owner-bound notification pointers. `chrome.storage.sync`: five booleans. No credentials are written by extension code.                                       |
| Authentication  | Clerk `@clerk/chrome-extension` with a sync host: the extension reads the user's `agiworkforce.com` web session; sign-in opens a web tab and the panel offers "Check sign-in". Bearer tokens are minted per request from the Clerk session and held in memory.                                                                                                                                                                                  |
| Page extraction | Side panel: `chrome.scripting.executeScript` reading main/article text (fallback body) capped at 5,000 characters, then `sanitizePageText` (invisible Unicode stripped, secrets redacted). In-page panel: `innerText` capped at 30,000 with the same sanitiser. Content-script page actions: `innerText` capped at 100,000.                                                                                                                     |
| Streaming       | Side panel → `CHAT_MESSAGE` → background `fetch` to `https://agiworkforce.com/api/llm/v1/chat/completions` (SSE, bounded decoder) → `CHAT_CHUNK` broadcast, fenced by owner + client instance + stream id. Keepalive port with 20 s heartbeat; durable-run resume after a worker restart; `CANCEL_STREAM` aborts locally and calls the backend cancel endpoint with the credential captured at admission.                                       |
| Shared packages | `@agiworkforce/types` (model catalog), `cloud-contracts`, `routing`, `client-runtime`, `provider-runtime`, `utils` (redaction, composer paste), `observability` (scrubbed crash reports), `design-tokens`, `browser-tool`.                                                                                                                                                                                                                      |

## 3. Competitor / Mature Pattern Matrix

Observations were collected on 2026-09-14 from official documentation and store listings (`docs/research` conventions apply; the full note with URLs is in the audit working set and summarised here). Where a competitor's manifest could not be read from a primary source it is marked as such.

| Capability                                        | ChatGPT / OpenAI                                      | Claude / Anthropic                                                           | AGI Workforce                                                                        | Required? | Gap                                                                             |
| ------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------- |
| Side panel as the primary surface (A)             | Yes ("side chat")                                     | Yes                                                                          | Yes, global per window                                                               | Yes       | None                                                                            |
| Page context read only on explicit action (B)     | Yes (toolbar, shortcut, right-click)                  | No, reads the current tab automatically                                      | Yes, explicit page chip / page slash command / menu item                             | Yes       | None. Keep the explicit model.                                                  |
| Selected-text → chat via context menu (A)         | "Ask ChatGPT"                                         | Not documented                                                               | Explain / Translate / Ask (handoff)                                                  | Yes       | "Ask AGI Workforce about…" opens a Desktop handoff, not chat (EXT-021).         |
| Per-site allow / always / decline for actions (B) | Yes, four-way                                         | Yes, plus an operating mode                                                  | Approved sites + per-site Chrome host grant + ask-before-acting                      | Yes       | One editor grants and revokes the Chrome host permission with the device list.  |
| Hard-blocked action categories (C)                | Not documented                                        | Financial transactions, permanent deletions, acting on embedded instructions | Navigate allowlist, ask-before-acting, no purchase/delete classifier                 | No        | Product-specific; not required to copy.                                         |
| Broad host permission at install (D)              | Yes ("read and change all your data on all websites") | Implied by the store privacy disclosure                                      | Content script on all http(s) pages; `optional_host_permissions` for everything else | ,         | The all-sites content script still produces the same install warning (EXT-004). |
| `debugger` / `nativeMessaging` (D)                | Not verified                                          | Reported by secondary sources, not verified                                  | Both present, both justified in the listing                                          | ,         | Keep, but the install prompt is the heaviest Chrome offers.                     |
| Keyboard shortcut to open (A)                     | Cmd+Shift+. (macOS)                                   | Not documented                                                               | Ctrl/Cmd+Shift+A                                                                     | Yes       | Possible macOS collision, not advertised in the panel (EXT-030).                |
| Prompt-injection acknowledged and mitigated (B)   | Not stated                                            | Named in the GA announcement                                                 | Nonce-fenced untrusted page text, invisible-Unicode stripping, onboarding warning    | Yes       | None                                                                            |
| Incognito (A)                                     | Not documented                                        | Not documented                                                               | `not_allowed`, not explained in product                                              | No        | One line of copy (EXT-039).                                                     |
| Privileged panel with camera/mic/file access (D)  | No                                                    | No                                                                           | No                                                                                   | No        | Correctly avoided.                                                              |

Chrome platform facts verified in this audit: `tabs.onUpdated` delivers a `url` change for `pushState`, `replaceState` and `popstate` in Chromium 141 (measured with a probe page), so the panel's SPA handling is sound without `webNavigation`; `chrome.sidePanel.open()` needs a user gesture; the MV3 worker idles out after 30 s.

## 4. Surface Matrix

| Surface                                     | Entry                                  | Exit                  | Loading                                  | Error                                                                        | Auth                          | Keyboard                                             | Accessibility                                                                     | Runtime Verified                                  | Status  |
| ------------------------------------------- | -------------------------------------- | --------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- | ------- |
| Side panel (chat)                           | Toolbar action, shortcut, context menu | Chrome close, Esc n/a | Gate "Checking…", 8 s timeout with Retry | Curated 401/403/429/network copy; raw strings remain in some paths (EXT-024) | Sign-in tab + "Check sign-in" | Enter/Shift+Enter (IME-safe), slash menu, model menu | Live log, dialog semantics on drawer/onboarding, chip state colour-only (EXT-025) | Rendering, restricted-page state, tab switch, SPA | WORKS   |
| Side panel drawer                           | ⋮, History, quota badge                | Esc, ✕, overlay       | Per section                              | Per section                                                                  | Mixed                         | Tab trap, focus return                               | `role=dialog`, `inert` when closed                                                | Smoke                                             | WORKS   |
| Workflows / Computer Use / Runs / Page tabs | Drawer launchers                       | Chat tab              | Runs: yes; others: none                  | Runs: yes; Downloads false-empty (EXT-034)                                   | Cloud token                   | Tab bar roving focus                                 | Two forms lack `<label>` (EXT-031)                                                | Smoke (Stop lifecycle)                            | WORKS   |
| Onboarding overlay                          | First run                              | Skip/Esc/finish       | n/a                                      | n/a                                                                          | None                          | Tab trap, Esc                                        | `role=dialog`, progressbar                                                        | Smoke                                             | WORKS   |
| In-page launcher + panel                    | Approved origin, preference on         | Esc, ✕                | "Thinking" cursor                        | Retryable card; orphaned-script state (EXT-016)                              | Cloud token                   | Esc from launcher, focus return                      | Closed panel `inert`; region semantics                                            | Injection + isolation measured                    | WORKS   |
| Context menu                                | Right-click                            | n/a                   | n/a                                      | Silent when the panel cannot admit (now parks the text in the composer)      | Cloud token                   | n/a                                                  | n/a                                                                               | Registration observed                             | WORKS   |
| Options page                                | Drawer Settings, `chrome://extensions` | Tab close             | Account 8 s timeout                      | Inline                                                                       | Account section               | Standard                                             | Labels present; nav label mismatch (P4)                                           | Smoke                                             | WORKS   |
| Notifications                               | Task/shortcut/capture events           | Click                 | n/a                                      | n/a                                                                          | Owner-fenced                  | n/a                                                  | n/a                                                                               | UNVERIFIED (gesture, EXT-018)                     | PARTIAL |
| Commands                                    | Ctrl/Cmd+Shift+A; capture_page         | n/a                   | n/a                                      | Capture: failure notification                                                | capture_page: Desktop         | n/a                                                  | n/a                                                                               | Not measured                                      | PARTIAL |

Surfaces removed in this pass because they had no result: context-menu "Capture Element", "Get Element Info", "Discover AI Tools on Page".

## 5. Permission Matrix

Production manifest = source manifest plus `https://clerk.agiworkforce.com/*` (host permission and `connect-src`). Install-time warning strings are Chrome's own and vary slightly by version.

| Permission                                  | Required By                                                                                                                                                                  | Install-time?                                        | Optional Possible?                                                                                 | Privacy Impact                                                | Verified Need                                    | Recommendation                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `activeTab`                                 | Page chip / slash commands (`side_panel.ts` `capturePageContext`), screenshot to composer                                                                                    | Yes, no warning                                      | Already the narrowest form                                                                         | Text and pixels of the tab the user acted on                  | Verified                                         | Keep                                                                                               |
| `tabs`                                      | Every origin gate (`sender.tab.url`), page chip label, computer-use ownership                                                                                                | Yes, "read browsing history"                         | No, URL is load-bearing for the gates                                                              | URL and title of tabs                                         | Verified                                         | Keep                                                                                               |
| `storage`                                   | Everything                                                                                                                                                                   | Yes, no warning                                      | No                                                                                                 | See §2                                                        | Verified                                         | Keep                                                                                               |
| `scripting`                                 | `capturePageContext` `executeScript`                                                                                                                                         | Yes                                                  | No (`activeTab` alone does not expose `chrome.scripting`)                                          | 5,000 chars of the pointed-at page                            | Verified                                         | Keep                                                                                               |
| `sidePanel`                                 | The product surface                                                                                                                                                          | Yes                                                  | No                                                                                                 | None                                                          | Verified                                         | Keep                                                                                               |
| `contextMenus`                              | Five menu items                                                                                                                                                              | Yes                                                  | No                                                                                                 | Selection text on click                                       | Verified                                         | Keep                                                                                               |
| `alarms`                                    | Scheduled tasks, self-disarming maintenance sweep                                                                                                                            | Yes                                                  | No                                                                                                 | None                                                          | Verified                                         | Keep                                                                                               |
| `notifications`                             | Task/shortcut/capture outcomes                                                                                                                                               | Yes                                                  | Yes, could be requested when the first task is created                                             | Task names in OS notifications                                | Verified                                         | Keep; optionalising is P4 polish                                                                   |
| `tabGroups`                                 | "Add tab to AGI group"                                                                                                                                                       | Yes, no warning                                      | Yes                                                                                                | Grouping state                                                | Verified                                         | Keep                                                                                               |
| `downloads`                                 | Browser-tools download on a doubly-consented tab, session ledger only                                                                                                        | Yes, "manage downloads"                              | Yes, at first browser-tools use                                                                    | Files written to disk                                         | Verified                                         | Optionalise in a later release (P3)                                                                |
| `debugger`                                  | Computer use over CDP, only after allowlist + Chrome host grant + consent record                                                                                             | Yes, heaviest warning                                | Chrome does not allow `debugger` as optional; reach is optionalised via host grants                | Full CDP over one attached tab                                | Verified                                         | Keep; justification in listing is accurate                                                         |
| `nativeMessaging`                           | AGI Desktop pairing, HMAC-authenticated channel                                                                                                                              | Yes, "communicate with native apps"                  | Chrome does not allow optional `nativeMessaging`                                                   | Page text and screenshots can leave the browser to Desktop    | Verified                                         | Keep; connect only after a successful pairing (fixed)                                              |
| `cookies`                                   | Clerk sync-host handshake: reads the user's own agiworkforce.com session so the extension acts as the account signed in on the web; no extension code calls `chrome.cookies` | Yes, no standalone warning                           | Chrome does not allow optional `cookies` for a sync-host SDK                                       | Session cookie on the configured Clerk and web origins only   | Verified (CI real-Chromium E2E fails without it) | Keep; the dead `SET_COOKIE` handler and its blocklist were removed and the justification rewritten |
| `http://localhost/*`, `http://127.0.0.1/*`  | Desktop pairing over loopback HTTP (`pairing.ts`), host-checked to loopback in code                                                                                          | Yes                                                  | Could be optional at "Connect AGI Desktop"                                                         | Reach into any loopback port                                  | Verified                                         | Narrow or optionalise in a later release (EXT-013)                                                 |
| `https://agiworkforce.com/*`                | Chat, models, usage, memory, mirror, waitlist                                                                                                                                | Yes                                                  | No                                                                                                 | Chat traffic                                                  | Verified                                         | Keep                                                                                               |
| `https://api.agiworkforce.com/*`            | Computer-use gateway                                                                                                                                                         | Yes                                                  | No                                                                                                 | Agent traffic                                                 | Verified                                         | Keep                                                                                               |
| Clerk origin (build-time)                   | Sync-host session handshake                                                                                                                                                  | Yes                                                  | No                                                                                                 | Session read                                                  | Verified                                         | Keep                                                                                               |
| `optional_host_permissions` `http(s)://*/*` | Requested one exact origin at a time when the user grants browser control                                                                                                    | No                                                   | Already optional                                                                                   | Per-origin, visible at `chrome://extensions`                  | Verified                                         | Keep                                                                                               |
| Content script `http(s)://*/*`              | Page context for the in-page panel, page tools, autofill and WebMCP on approved sites                                                                                        | Yes, "read and change all your data on all websites" | `chrome.scripting.registerContentScripts` scoped to the allowlist would remove the install warning | None on unapproved sites (measured), but the warning is shown | Verified                                         | Disclosed in the listing now; scope the registration to the allowlist in a later release (EXT-004) |

## 6. Page-Context Data Flow

```
Browser page
  ↓ (only on an explicit action: page chip, page slash command, "Summarize this page")
Side panel: chrome.scripting.executeScript on the active tab
  ↓ main/article/[role=main] text, fallback body; first 5,000 characters
Normalisation: sanitizePageText → invisible Unicode stripped → redactSecrets
  ↓ held in memory as pendingPageContext; dropped when the tab or URL changes
Background: CHAT_MESSAGE validated, owner checked, page text fenced as untrusted with a per-turn nonce
  ↓ HTTPS bearer request to https://agiworkforce.com/api/llm/v1/chat/completions (surface label: chrome)
AGI router → concrete catalog model → provider
```

| Stage                       | Data present                            | Storage                                 | Logging                                       | Retention                               | Privacy boundary                                             |
| --------------------------- | --------------------------------------- | --------------------------------------- | --------------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Page (content script)       | Nothing on unapproved origins           | None                                    | `debug`/`info` are compiled out of production | None                                    | Allowlist gates in-page panel, page tools, autofill, WebMCP  |
| Side panel capture          | ≤5,000 chars, URL, tab id               | Memory only                             | None                                          | Until sent or dropped                   | `activeTab` + user gesture                                   |
| Background                  | Redacted, fenced text; prompt; history  | Conversation text only, never page text | Origins only, never full URLs (fixed)         | Conversations capped by age/count/4 MiB | Owner-scoped; extension-page-only sender class               |
| Managed Cloud               | Request payload                         | Server policy                           | Server policy                                 | Server policy                           | Bearer only, no cookies on the chat path                     |
| Account mirror              | Prompt and answer text, model, provider | Account conversation store              | ,                                             | Account policy                          | Page text and images are never part of the mirrored record   |
| Screenshot (composer)       | Visible-tab pixels                      | Not stored                              | None                                          | Request only                            | Pixels are not text-redacted; onboarding says so             |
| Screenshot (`capture_page`) | Visible-tab pixels → AGI Desktop        | Not stored                              | None                                          | Desktop policy                          | Now gated on approved site + browser-control consent (fixed) |

## 7. Performance

All numbers below were measured on 2026-09-14 in Chromium 141 (Playwright, `--load-extension`, headless new) on the CI container; absolute values on user hardware will differ, ratios are what matter.

| Metric                                                                             | Value                                                                                                                                                                                                                | Status       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Content script cost on an unapproved page (120-paragraph article, 8 loads, median) | ScriptDuration +2.1 ms, TaskDuration +8.8 ms, JS heap +0.42 MB, load event 14.7 → 33.6 ms                                                                                                                            | MEASURED     |
| DOM injected on an unapproved page                                                 | 0 elements, 0 shadow hosts, 0 runtime messages                                                                                                                                                                       | MEASURED     |
| Content bundle                                                                     | 136.1 KB raw / 35.2 KB gzip after this pass (139.6 KB before), IIFE, no DOMPurify, no Sentry                                                                                                                         | MEASURED     |
| Service worker bundle                                                              | 136.7 KB + shared chunk 2,611 KB (Clerk 807 KB source, zod 273 KB, contracts/types 258 KB, cloud-contracts 183 KB)                                                                                                   | MEASURED     |
| Import of the shared chunk from a cold extension document                          | 199 ms (background entry 38 ms, side panel entry 71 ms)                                                                                                                                                              | MEASURED     |
| Side panel bundle                                                                  | 415 KB / 100 KB gzip; DOMPurify is the only large third-party module                                                                                                                                                 | MEASURED     |
| Total unpacked `dist/`                                                             | 6.0 MB, 264 files; ~1.4 MB of it is Clerk lazy UI chunks (Solana wallet, checkout, pricing table) that the extension never loads                                                                                     | MEASURED     |
| Service-worker startup                                                             | 15 ms `performance.now()` at first contact; inconclusive because the worker's time origin excludes module fetch. Treat the 199 ms chunk import as the parse/evaluate floor                                           | OBSERVED     |
| Side-panel startup                                                                 | Markers rendered within the smoke's 1.5 s budget                                                                                                                                                                     | OBSERVED     |
| Page extraction                                                                    | Not measured on a real site; the 50,000-element guard applies                                                                                                                                                        | HYPOTHESIZED |
| send → first token, first token → first render, streaming cadence (T0–T10)         | Not measured: requires a signed-in production session                                                                                                                                                                | UNVERIFIED   |
| Host-page CPU / memory on approved pages                                           | Not measured; the always-on regex pass at injection was removed                                                                                                                                                      | UNVERIFIED   |
| Re-run after the fixes (same harness)                                              | Panel host now `position: fixed` with `z-index` 2147483647 on an approved page; no runtime message, no DOM node and no worker console line on an unapproved page; only `warn`/`error` lines reach the worker console | MEASURED     |

Streaming render is whole-answer markdown re-render per chunk without `requestAnimationFrame` batching and with the scroll hard-pinned to the bottom (EXT-023). With a fast model on a long answer this is O(n²) in answer length.

## 8. Chrome Web Store Readiness

| Item                     | State                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest                 | MV3, versions aligned (`package.json`, `manifest.json`, release tag). `offline_enabled` (Apps-only key) removed. CSP `script-src 'self'`, no `unsafe-eval`; `connect-src` now exact origins plus Sentry ingest.                                                                                       |
| Permissions              | Every remaining permission has a written justification in `docs/chrome-web-store-listing.md`, frozen by `manifest-contract.test.ts`. `cookies` is justified by the Clerk sync-host handshake, not by a cookie tool. The all-sites content script is now disclosed as the install warning it produces. |
| Privacy                  | Privacy policy URL present. Data-use table matches code after the page-context copy fix. Crash reporting is opt-in and scrubbed to error type + function names; label renamed to "Share crash reports". No usage telemetry exists.                                                                    |
| Assets                   | Icons real at 16/32/48/128. **Screenshots and promo tile are not in the repository** (EXT-010).                                                                                                                                                                                                       |
| CSP / remote code        | No remote scripts, no `eval`/`new Function`, no URL `import()`. `style-src 'unsafe-inline'` is needed by the extension's own inline styles, not only by Clerk.                                                                                                                                        |
| Production configuration | `prepare-package.mjs` now refuses a `VITE_AGI_WEB_API_BASE_URL` that is not an `https://agiworkforce.com` origin; staging gateway removed from the shipped allowlist. `VITE_SENTRY_DSN` is not set by the release workflow, so crash reporting is inert in the shipped build (EXT-036).               |
| Store disclosures        | Support URL not recorded (EXT-037). `minimum_chrome_version: 132` has no written justification (EXT-038). Product name appears four ways (EXT-035).                                                                                                                                                   |
| Naming                   | Manifest name "AGI Browser Companion", action title "AGI", menus "AGI Workforce", chat copy "AGI Cloud" / "Managed Cloud".                                                                                                                                                                            |

## 9. Findings

Severity scale: P0 credential exposure, severe privacy issue, destructive unintended browser action; P1 core unusable, page-context leakage, breaks websites, release blocker; P2 significant reliability or UX problem with a workaround; P3 polish, accessibility, performance, design system; P4 cosmetic.

### 9.1 Open findings

### EXT-001: The service worker evaluates a 2.6 MB shared chunk on every wake

Severity: P2
Area: Performance / MV3
Surface: Service Worker / Shared
Evidence: `pnpm build` output; `dist/src/background.js` statically imports `assets/errorReportingConsent-*.js` (2,611,973 bytes). Source-map attribution: `@clerk/clerk-js` 807 KB, `zod` 273 KB, `packages/contracts/types` 258 KB, `packages/contracts/cloud-contracts` 183 KB.
Reproduction: build, open `chrome-extension://<id>/icons/icon16.png`, time `import('/assets/errorReportingConsent-…js')`: 199 ms cold.
Expected: the worker's module graph is a few hundred KB and evaluates in tens of milliseconds.
Actual: every worker wake parses the Clerk browser SDK, the full model catalog and both contract packages.
Root Cause: Verified. Rollup merges every module shared by the three entries into one chunk, and `@clerk/chrome-extension/background` pulls the whole `clerk-js` runtime; the catalog is imported for model metadata.
Privacy/Security Impact: None.
Recommended Correction: `build.rollupOptions.output.manualChunks` to keep Clerk out of the background chunk; import model metadata through a lean accessor rather than the catalog; consider `@clerk/chrome-extension`'s headless entry for the worker.
Affected Sites/Flows: every worker wake, every panel open.
Verification: re-measure the chunk import and worker first-contact time after splitting.

### EXT-002: Every approved-site feature ships in the content script on every page

Severity: P3
Area: Performance / attack surface
Surface: Content Script
Evidence: `dist/src/content.js` 139.6 KB; contains four ATS autofill engines (~3,400 source lines), the in-page panel, WebMCP discovery and the 20-pattern redaction engine; `content.ts` returns before using any of it on an unapproved origin.
Expected: a small always-injected stub; the rest injected via `chrome.scripting` only on approved origins.
Actual: ~140 KB parsed and compiled on every page load (measured +2 ms script time, +0.4 MB heap).
Root Cause: Verified. Single IIFE build (`vite.config.ts` content target, `inlineDynamicImports`).
Recommended Correction: split the content bundle and inject the feature chunk from the background on approved origins; this also gives EXT-016 its reinjection path and removes the install-time warning (EXT-004).
Verification: content bundle < 30 KB; `measure.mjs`-style comparison shows no heap delta on unapproved pages.

### EXT-004: The all-sites content script is the install warning the listing has to defend

Severity: P2
Area: Permissions
Surface: Shared
Evidence: `manifest.json` `content_scripts.matches` `http://*/*`, `https://*/*`. Chrome derives "Read and change all your data on all websites" from this match regardless of the narrow `host_permissions`.
Expected: install-time access matches what the extension does at install (nothing on unapproved sites).
Actual: the warning is shown; the listing now discloses it (fixed) but the underlying grant remains.
Root Cause: Verified.
Recommended Correction: register the content script with `chrome.scripting.registerContentScripts` for allowlisted origins only, with `activeTab`-driven injection for the side panel's own capture (already the case).
Verification: `chrome://extensions` shows site access "on specific sites" after install.

### EXT-010: Store screenshots and promo assets are not tracked

Severity: P2
Area: Chrome Web Store
Surface: Shared
Evidence: no 1280×800 / 640×400 screenshots and no 440×280 promo tile anywhere in the repository; `docs/chrome-web-store-publish-runbook.md` refers to listing assets as a dashboard operation without naming them.
Expected: the listing doc that calls itself the source of truth covers every asset the Dashboard requires.
Actual: text only.
Root Cause: Verified.
Recommended Correction: add an asset inventory and the files (or the script that produces them from the smoke's `AGI_E2E_SCREENSHOT_DIR` capture) so assets version with copy.
Verification: Dashboard submission completes without manual uploads.

### EXT-012: Enterprise third-party-cookie blocking becomes a silent sign-in loop

Severity: P2
Area: Authentication / enterprise policy
Surface: Side Panel
Evidence: `clerkAuth.ts` sync-host handshake depends on the `clerk.agiworkforce.com` cookies; with `BlockThirdPartyCookies` or a strict `CookiesBlockedForUrls` policy `getFreshClerkAuthContext` returns `null` and the panel shows only "Sign in to sync" / "Sign in to AGI Cloud to send messages." Signing in on the web app does not help.
Expected: after a web sign-in that yields no extension session, a message names third-party cookies / enterprise policy and points at `chrome://settings/cookies`.
Actual: an indistinguishable signed-out state.
Root Cause: Verified from code; Hypothesis on the exact Chrome policy interplay.
Recommended Correction: when "Check sign-in" finds no session twice while the web app reports one, show the cookie-policy message; add a row to the runbook evidence matrix.
Verification: run with `BlockThirdPartyCookies` set in a managed Chrome profile.

### EXT-013: Loopback host permission is port-wildcard while the code needs one port

Severity: P3
Area: Permissions / local attack surface
Surface: Service Worker
Evidence: `manifest.json` `http://localhost/*`, `http://127.0.0.1/*` and `connect-src http://localhost:* http://127.0.0.1:*`; `pairing.ts` posts only to `http://localhost:8787`; `getBridgeBaseUrl` returns the stored `agi_bridge_url` without `validateBridgeUrl`.
Expected: the grant is as narrow as the pairing endpoint, or optional at "Connect AGI Desktop".
Actual: any loopback port is reachable from the worker.
Root Cause: Verified.
Recommended Correction: route the stored bridge URL through `validateBridgeUrl`; move loopback to `optional_host_permissions` requested inside the Pair gesture.
Verification: `chrome://extensions` shows no loopback access until pairing.

### EXT-015: Desktop pairing has no acquisition path in product

Severity: P2
Area: Feature completeness
Surface: Side Panel
Evidence: drawer "Pair with Desktop" surfaces raw `Failed to fetch` when no host is installed (`pairing.ts` error passthrough); there is no download link, no "what is AGI Desktop", and `capture_page`'s failure copy points to "extension options" which has no pairing UI.
Expected: either an install link and a one-line explanation, or the pairing section hidden until AGI Desktop is detected.
Actual: a dead end for every user without the desktop app.
Root Cause: Verified.
Recommended Correction: detect the host once, show an "Install AGI Desktop" link with the product URL, and map fetch failures to "AGI Desktop is not running on this computer."
Verification: click Pair with no host installed, read the message.

### EXT-016: Tabs open before install or update have no content script and no recovery path

Severity: P2
Area: Content-script lifecycle
Surface: Content Script / Side Panel
Evidence: `forwardToContentScript` returns "Failed to communicate with page"; the in-page panel renders a retryable "Managed Cloud request failed" card on `Extension context invalidated`, whose Retry can never succeed.
Expected: reinject via `chrome.scripting.executeScript({ files: ['src/content.js'] })` (the script is now idempotent) or a non-retryable "Reload this page".
Actual: generic failure, endless retry.
Root Cause: Verified.
Recommended Correction: detect `Receiving end does not exist` / `Extension context invalidated` and reinject or render "Reload this page".
Verification: install, use on an already-open tab.

### EXT-017: Selection text reaching `GET_PAGE_INFO` is neither capped nor redacted

Severity: P2 (latent)
Area: Page context
Surface: Content Script
Evidence: `content.ts` `handleGetPageInfo` returns `getSelection().toString()` verbatim while `html` is redacted and capped. Every current consumer ignores `selectedText` or re-sanitises; nothing ships it to a model today.
Expected: the redaction promise in the in-page disclosure holds for every field that leaves the page.
Actual: a latent gap.
Recommended Correction: apply `sanitizePageText` and a cap at the source; add a fallback for `<textarea>`/`<input>` selections (`selectionStart`/`selectionEnd`) and a distinguishable "no selection reachable" reason for iframes (`all_frames: false`).
Verification: unit test on `handleGetPageInfo` with a secret-shaped selection.

### EXT-018: Notification click may not count as a gesture for `sidePanel.open()`

Severity: P2 if confirmed
Area: Notifications
Surface: Service Worker
Evidence: `background.ts` `notifications.onClicked` → `chrome.sidePanel.open({ tabId }).catch(() => {})`. The pending-result pointer is stored, so a later manual open still works.
Expected: the click opens the panel on the linked conversation.
Actual: UNVERIFIED; if Chrome refuses, the click appears to do nothing.
Recommended Correction: verify in a live profile; if refused, fall back to `chrome.action.setBadgeText` and open the conversation on the next manual open.
Verification: create a scheduled task, wait for its notification, click it.

### EXT-020: Chat history persists in plaintext across sign-out and is not disclosed

Severity: P3
Area: Privacy
Surface: Shared
Evidence: `conversation-history.ts` caps (100 conversations × 50 messages) in `chrome.storage.local`, owner-keyed; sign-out does not offer to clear; onboarding disclosures do not mention local retention; there is no "delete all extension data" control.
Recommended Correction: a "Clear everything on this device" control in Options and one disclosure line.

### EXT-021: "Ask AGI Workforce about …" opens a Desktop handoff, not a chat

Severity: P3
Area: Information architecture
Surface: Context Menu
Evidence: `background.ts` `ask-agi-workforce` builds a selection handoff preview destined for AGI Desktop / VS Code / CLI; without a paired Desktop the approve action fails.
Recommended Correction: rename to "Send selection to AGI Desktop" and show it only when paired, or make it start a chat turn.

### EXT-022: In-page panel prompt has no untrusted-content fencing and includes CSS-hidden text

Severity: P2
Area: Prompt injection
Surface: Content Script
Evidence: `panel.ts` builds `Page title: …\n\nVisible page text:\n${pageText}` with no delimiter; `innerText` includes `opacity:0`/off-screen text. The side-panel path is nonce-fenced in the background; the in-page path is not.
Recommended Correction: route the in-page panel's turn through the same fencing the background applies to `pageContext`, and skip `[aria-hidden=true]`/zero-opacity subtrees when cloning.
Verification: fixture page with an `opacity:0` instruction; assert it is fenced.

### EXT-023: Streaming re-renders the whole answer per chunk and hard-pins scroll

Severity: P3
Area: Streaming quality
Surface: Side Panel
Evidence: `side_panel.ts` `updateStreamingBubble` → `bubble.innerHTML = sanitizeHtml(renderMarkdown(fullText))` and `msgs.scrollTop = msgs.scrollHeight` on every chunk; no `requestAnimationFrame`, no "user scrolled up" check.
Recommended Correction: coalesce chunks per animation frame; pin only when within ~40 px of the bottom.
Verification: 3,000-word answer, scroll up mid-stream, position holds; frame time under 16 ms.

### EXT-024: Raw provider and Chrome error strings reach the chat bubble

Severity: P3
Area: Error copy
Surface: Side Panel
Evidence: `chunk.error`, `chrome.runtime.lastError.message`, `response.error` rendered verbatim in several paths (`handleStreamError` callers, `bubbles.ts` error footer); `managedChatHandler.ts` strings such as "Conversation history is malformed." are user-visible.
Recommended Correction: extend the curated mapping in `freeTrialClient.ts` (401/403/429/network) to the remaining classes.

### EXT-025: Page-attached state is colour-only

Severity: P3
Area: Accessibility / privacy transparency
Surface: Side Panel
Evidence: the context chip's text is the hostname in both states; only `.has-context` changes colour and `title`; no `aria-pressed`.
Recommended Correction: `aria-pressed` and a visible "attached" affix.

### EXT-026: No client-side long-prompt guard; shared large-paste policy not adopted

Severity: P3
Surface: Side Panel
Evidence: no `maxlength`/counter on the composer; server cap 32,000 (`managedChatHandler.ts`); paste handler does not call `decideComposerPaste`; over-long sends fail with a developer string.
Recommended Correction: refuse at the composer naming the limit.

### EXT-027: Stop leaves a truncated answer indistinguishable from a complete one; closing the panel mid-stream loses a plain chat answer silently

Severity: P3
Surface: Side Panel
Evidence: no "stopped" flag persisted (`serializeMessagesForHistory`); reopening mints a new client instance id, and resume exists only for runs carrying a `cloudAgentRun` reference.
Recommended Correction: persist a `stopped`/`interrupted` marker and render it; treat a missing terminal chunk on restore as interrupted with a Retry.

### EXT-028: Ordered lists and tables do not render

Severity: P3
Surface: Side Panel
Evidence: `markdown.ts` wraps `<ul>` before the ordered-list pass, so `1. a\n2. b` becomes bare `<li>`; table tags are allowed by DOMPurify but never emitted.
Recommended Correction: emit `<ol>` and a minimal pipe-table renderer.

### EXT-029: Onboarding cannot repeat after a disclosure change; "beta" copy contradicts 1.2.0

Severity: P3
Surface: Side Panel
Evidence: `onboarding.ts` stores an unversioned boolean; step 1 says "This is a beta feature"; step 5 refers to a pin icon that does not exist in a side panel.
Recommended Correction: version the completion key against the disclosure set; decide beta vs. GA copy; fix the pinning instruction.

### EXT-030: Shortcut collision and discoverability

Severity: P3
Surface: Commands
Evidence: `Cmd+Shift+A` is Chrome's Search Tabs on macOS (UNVERIFIED in a Mac profile); the shortcut is advertised nowhere in the panel; the options table has no button to `chrome://extensions/shortcuts`.
Recommended Correction: verify on macOS, consider an unassigned default, add the shortcuts link.

### EXT-031: Form controls without programmatic labels; validation by colour only; autonomy menu without arrow keys

Severity: P3
Surface: Side Panel
Evidence: New Task and Create Shortcut forms use `div` labels with no `for`/`aria-label`; empty-field validation flashes `borderColor` only; `#sp-autonomy-popover` is `role="menu"` with Escape but no ArrowUp/Down/Home/End.
Recommended Correction: real `<label for>`, populate the existing live region, reuse the attach-menu key handler.

### EXT-032: Contrast failures on accent and danger fills

Severity: P3
Surface: Side Panel / Options
Evidence (computed): white on `--agi-ext-accent` `#da7756` = 3.11:1 (12 px button text in ~14 sites); white on dark `--agi-ext-danger` `#ef4444` = 3.35:1 (record button, confirm-delete); placeholders at `opacity: 0.6` ≈ 4.22:1; `.sp-model-upgrade-tag` white on `#f59e0b` ≈ 2.1:1.
Root Cause: one token per family serves fill, text and on-fill roles, the exact shape `.claude/rules/ui-colour-and-interaction.md` forbids; the extension has no `theme-contrast.test.ts`.
Recommended Correction: add `-text`/`-on-*` tokens in `tokens.ts` and a computed-contrast test.

### EXT-033: Icon vocabulary split; decorative icons announced

Severity: P3
Surface: Side Panel
Evidence: `computerUsePanel.ts` step log uses emoji; `menuBtn` is a `⋮` glyph; `icon-vocabulary.test.ts` scans only two files. `renderIcon` now sets `aria-hidden` (fixed).
Recommended Correction: extend the vocabulary test to the panel files; replace emoji with the shared icon set.

### EXT-034: Downloads list shows a false empty state on read failure

Severity: P3
Surface: Side Panel (Page tools)
Evidence: `browserToolsPanel.ts` returns early on `!response?.success` leaving "No downloads started from AGI in this session."; Console and Network render the error.

### EXT-035: Four product names reach the user

Severity: P3
Surface: Shared
Evidence: "AGI Browser Companion" (manifest name), "AGI" (action title), "AGI Workforce" (menus), "AGI Cloud" / "Managed Cloud" / "AGI Managed Cloud" (chat copy); manifest `description` differs from the listing short description.
Recommended Correction: one name in user-visible strings; make the manifest description equal the listing short description.

### EXT-036: Crash reporting is inert in the shipped build

Severity: P3
Surface: Shared
Evidence: `release-chrome-extension.yml` never sets `VITE_SENTRY_DSN`; `errorReporting.ts` `readDsn()` is `undefined`, so the (opt-in) toggle does nothing while its description says reports are sent.
Recommended Correction: set the DSN in the release workflow, or have the Options row say crash reporting is not configured in this build.

### EXT-037: No support URL recorded for the listing

Severity: P3
Surface: Store

### EXT-038: `minimum_chrome_version: 132` has no written justification

Severity: P3
Surface: Store
Evidence: newest APIs used are `sidePanel.open` (116), `optional_host_permissions` (102), `storage.session` (102); the floor is enforced end-to-end by `verify-package.mjs` but explained nowhere.

### EXT-039: Incognito exclusion is not explained in product

Severity: P4
Surface: Options

### EXT-040: Scheduled tasks have no time-of-day, next-run or last-run

Severity: P3
Surface: Side Panel (Workflows)
Evidence: the form sends `scheduleValue: ''`; `tasks.ts` anchors periods to creation time; `renderTaskRows` never renders `lastRun`.

### EXT-041: Drawer footer stats inform nothing

Severity: P4
Surface: Side Panel
Evidence: Tabs = `chrome.tabs.query({}).length`; Actions is written only by the Desktop capture path; Session is a `setInterval` since `buildUI()`.

### EXT-042: Dead UI cluster around `#sp-auth-bar`

Severity: P4
Surface: Side Panel
Evidence: `#sp-auth-bar` built then permanently `display:none`; `#sp-auth-input` has CSS but is never constructed; `TOOL_ICONS` survives via `void TOOL_ICONS`.

### EXT-043: Tests that re-implement the logic they cover

Severity: P3
Surface: Shared (tests)
Evidence: `recorder-redaction.test.ts` defines its own `sanitizeRecordedValue`; the background reconnect/lifecycle tests were converted in this pass to import the shipped classifier, the recorder test was not.
Recommended Correction: extract `sanitizeRecordedValue` into an importable module and test it.

### EXT-044: Rate limiter and quick-mode cache are worker-lifetime only

Severity: P3
Surface: Service Worker
Evidence: `RateLimiter` state and `quickModeCache` reset on every worker start; `GET_QUICK_MODE` that wakes the worker can answer `false` before the storage read lands.
Recommended Correction: apply the held-promise pattern the allowlist already uses.

### EXT-045: Keepalive port stays connected after a stream ends

Severity: P3
Surface: Side Panel / Service Worker
Evidence: `stopManagedChatKeepalive` clears the interval but never disconnects the port; whether a silent port keeps the worker alive is UNVERIFIED.

### EXT-046: Closing the side panel cancels the server-side run

Severity: P3 (design decision needed)
Surface: Service Worker
Evidence: the keepalive port's `onDisconnect` aborts every stream for the client and calls the backend cancel endpoint; the durable-run machinery that exists to survive a surface going away is defeated by the most common way it goes away.

### EXT-047: Product-page claims not covered here

Severity: P3
Surface: Shared
Evidence: `ACTIVE_ISSUES.md` records a landing-page privacy claim already corrected; the listing short description says the panel "reads the page you are on", which matches the explicit-attach model only if read as "on request".

### 9.2 Verified not a defect

- The desktop bridge does pass every command through `authorizeBrowserToolTab` (`desktopCommands.ts` `runDesktopBrowserCommand`); an earlier reading that it bypassed the approved-sites boundary was wrong.
- `tabs.onUpdated` fires with `url` for `pushState`, `replaceState` and history navigation in Chromium 141 (measured), so the side panel's SPA handling does not need `webNavigation`.
- With no native host installed the maintenance alarm does not stay armed (measured over two minutes); the reconnect loop only applied to a host that is installed but fails the handshake, which is now gated on a successful prior pairing.
- Page text is never written to `chrome.storage.local` and never enters the account mirror.

### 9.3 Resolved in this pass

| ID      | Severity | What was wrong                                                                                                                                                         | Fix                                                                                                                                                                                                                                          |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXT-101 | P1       | The `cookies` justification described an extension-UI cookie tool that did not exist, and its `SET_COOKIE` handler had no caller                                       | Handler, blocklist and message type removed; the permission stays because Clerk's sync-host sign-in reads the web session cookie (the real-Chromium E2E fails without it), and the listing, disclosure and threat model now say exactly that |
| EXT-102 | P1       | Three UI strings claimed page text was gated by the approved-sites list; the side panel's attach was not                                                               | Copy corrected to the real gate (explicit attach on any ordinary site; allowlist governs automation)                                                                                                                                         |
| EXT-103 | P1       | Unredacted, always-on `console.debug/info` logger in background and content; full page URLs logged                                                                     | `debug`/`info` compiled out of production; sender origin logged instead of URL                                                                                                                                                               |
| EXT-104 | P1       | All-sites content script undisclosed in the listing's host-access table                                                                                                | Row added and frozen by `manifest-contract.test.ts`                                                                                                                                                                                          |
| EXT-105 | P1       | Generic autofill clicked any button labelled "apply" on any page with no confirmation                                                                                  | Confirmation naming the button; Greenhouse misclassification of `/application` paths fixed                                                                                                                                                   |
| EXT-106 | P1       | Context-menu "Capture Element" / "Get Element Info" / "Discover AI Tools" produced no visible result                                                                   | Items and handlers removed, along with the per-page `mousemove` listener that served them                                                                                                                                                    |
| EXT-107 | P1       | Run start wrote the Computer Use checkbox's stale value back, silently reverting "Ask first"                                                                           | Write removed; checkbox subscribes to `storage.onChanged`; test asserts both directions                                                                                                                                                      |
| EXT-108 | P2       | `/summarize` captured whichever tab was active when the async capture resolved                                                                                         | Capture fenced with `pageContextStillDescribes` against the page at admission                                                                                                                                                                |
| EXT-109 | P2       | Restricted-page copy told users to add the site to Approved sites, which granted no host permission; the Web Store was not detected as restricted                      | `isRestrictedPageUrl` covers the Web Store, `view-source:`, `chrome-untrusted:` and `devtools:`. A page awaiting site approval and a page Chrome blocks outright now get separate copy, so only the fixable case is offered a remedy         |
| EXT-134 | P2       | The panel's Site Allowlist wrote only the device list, so a site approved there still could not run browser control, and removing it left the Chrome host grant behind | Approving a site now requests the per-origin host permission inside the live click gesture and removing it revokes that grant, so one editor carries both halves                                                                             |
| EXT-110 | P2       | Retry duplicated the user bubble                                                                                                                                       | Retry replaces the failed exchange                                                                                                                                                                                                           |
| EXT-111 | P2       | Chat delete and autofill-profile delete fired from a single click                                                                                                      | Two-tap confirmation naming the consequence on both                                                                                                                                                                                          |
| EXT-112 | P2       | Enter sent half-composed IME text                                                                                                                                      | `isComposing` / keyCode 229 guard                                                                                                                                                                                                            |
| EXT-113 | P2       | Context-menu selection consumed and dropped when the panel could not admit it; never delivered on first run                                                            | Text parked in the composer when not admitted; re-checked when the gate opens and after onboarding                                                                                                                                           |
| EXT-114 | P2       | `tabs.*` listeners woke the worker on every tab event browser-wide                                                                                                     | `UpdateFilter` on `onUpdated`; cheap early-outs                                                                                                                                                                                              |
| EXT-115 | P2       | Native host connect attempted on every worker start for every user; maintenance alarm re-armed off it                                                                  | Gated on a prior successful pairing; give-up flag persisted for the session                                                                                                                                                                  |
| EXT-116 | P2       | Debugger listeners registered lazily; page-watch holds never released after a restart                                                                                  | Registered at module evaluation                                                                                                                                                                                                              |
| EXT-117 | P2       | `capture_page` shipped any visible tab's pixels to Desktop with no origin gate                                                                                         | Routed through `authorizeBrowserToolTab`                                                                                                                                                                                                     |
| EXT-118 | P2       | Staging gateway in the shipped allowlist; release gate never validated the web origin                                                                                  | Removed; `prepare-package.mjs` refuses non-`agiworkforce.com` origins                                                                                                                                                                        |
| EXT-119 | P2       | In-page panel host was an in-flow `<body>` child; closed panel stayed focusable and announced                                                                          | Fixed-position zero-size host; `inert` when closed; Escape from the launcher                                                                                                                                                                 |
| EXT-120 | P2       | In-page panel read the whole page and ran the redaction regexes at injection on every approved page load; permanently monkey-patched `history.pushState`               | Capture deferred to open; chips from the URL; Navigation API + `popstate`; truncate before redacting                                                                                                                                         |
| EXT-121 | P2       | WebMCP observer watched the whole document on every approved page and messaged the worker on every mutation                                                            | Observed only where tools exist; sends only on a changed list; disconnects on `pagehide`                                                                                                                                                     |
| EXT-122 | P2       | `FILL_FORM`/`SUBMIT_FORM` without a selector wrote across every form / submitted form #0 and reported success                                                          | Selector required; honest result                                                                                                                                                                                                             |
| EXT-123 | P2       | Autofill overwrote text the user had typed; substring label matching (`velocity` → city, `paypal` → pay)                                                               | Non-empty fields skipped and reported; word-boundary matching                                                                                                                                                                                |
| EXT-124 | P2       | NLWeb probe issued three requests per approved page load into a map nothing read; false positives on catch-all servers (measured)                                      | Probe removed                                                                                                                                                                                                                                |
| EXT-125 | P3       | Context menus rebuilt on every worker start with `removeAll` not awaited (duplicate-id warning observed)                                                               | Built on `onInstalled`; `onClicked` at top level                                                                                                                                                                                             |
| EXT-126 | P3       | Content script not idempotent; duplicate allowlist reads                                                                                                               | Window flag; shared read                                                                                                                                                                                                                     |
| EXT-127 | P3       | Voice input swallowed every error and left a focusable dead button when unsupported; `en-US` only                                                                      | Errors surface in the composer notice; disabled when unsupported; UI language                                                                                                                                                                |
| EXT-128 | P3       | Dead `agi_notif_<id>` writes, dead `messageQueue`, orphaned task alarms, unhandled MAC-verification rejection                                                          | Removed / cleared / caught                                                                                                                                                                                                                   |
| EXT-129 | P3       | `connect-src` wildcard `*.agiworkforce.com`; `offline_enabled` Apps-only key                                                                                           | Exact origins; key removed                                                                                                                                                                                                                   |
| EXT-130 | P3       | Telemetry toggle labelled "crash and usage"; no usage telemetry exists                                                                                                 | "Share crash reports"                                                                                                                                                                                                                        |
| EXT-131 | P3       | Model dropdown `min-width` overrode its `max-width`, overflowing a 320 px panel at 150 %+ zoom                                                                         | `min(232px, calc(100vw - 24px))`                                                                                                                                                                                                             |
| EXT-132 | P3       | Decorative icons were announced to assistive tech                                                                                                                      | `aria-hidden` on `renderIcon`                                                                                                                                                                                                                |
| EXT-133 | P2       | Side-panel capture read `body.innerText`, spending the 5,000-char budget on navigation and banners                                                                     | Prefers `main`/`article`/`[role=main]` when substantial, falls back to body                                                                                                                                                                  |

## 10. Prioritized Execution Plan

Grouped by root cause; the phase numbers follow the release-gate order.

| Phase | Root cause                                     | Findings                                      | Status after this pass                                               |
| ----- | ---------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| 0     | Security / privacy / credentials / permissions | EXT-101…104, 117, 118, 013                    | Done except EXT-013 (loopback narrowing)                             |
| 1     | MV3 / service worker / messaging               | EXT-114…116, 125, 128, 044, 045, 046          | Done except the P3 cache/port items and the design call on EXT-046   |
| 2     | Authentication / core chat / side panel        | EXT-107, 110…113, 012, 024, 026, 027          | Core fixed; enterprise-cookie messaging and error-copy curation open |
| 3     | Page context / selection / extraction          | EXT-108, 109, 120, 122, 123, 133, 017, 022    | Fixed except selection redaction and in-page fencing                 |
| 4     | Streaming / cancellation / speed               | EXT-023, live T0–T10                          | Open: needs the authenticated run                                    |
| 5     | Tabs / navigation / SPA / stale context        | EXT-108, 121, 016                             | Fixed except reinjection for pre-install tabs                        |
| 6     | Permissions / restricted pages / incognito     | EXT-004, 109, 039                             | Copy fixed; allowlist-scoped registration open                       |
| 7     | Injected UI / host-page compatibility          | EXT-119, 120, 121                             | Done                                                                 |
| 8     | Accessibility / keyboard / responsive          | EXT-025, 031, 032, 131, 132                   | Partly done; contrast tokens and form labels open                    |
| 9     | Performance / bundle / memory                  | EXT-001, 002                                  | Open                                                                 |
| 10    | Chrome Web Store requirements                  | EXT-010, 035…038, 129, 130                    | Manifest done; assets, support URL, naming, floor justification open |
| 11    | AI-slop / design-system polish                 | EXT-033, 041, 042                             | Open, low                                                            |
| 12    | Full regression                                | Unit 1,780+ tests, smoke, measurement harness | Unit + offline smoke green; authenticated gate pending               |

## 11. Final Public Release Gate

| Dimension         | Result                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Function          | PASS for every surface exercised offline; UNVERIFIED for signed-in flows                                         |
| Browser-native UX | PASS: side panel, context menus, commands, `activeTab`; not a web app in a popup                                 |
| Context           | PASS: explicit attach, tab/URL-fenced, dropped on navigation, measured tab-switch and restricted-page behaviour  |
| Isolation         | PASS: owner + client-instance + stream-id fences; per-window conversations                                       |
| MV3               | PASS: synchronous listeners, durable-run resume, self-disarming alarm; worker-restart-mid-stream UNVERIFIED live |
| Navigation        | PASS: `tabs.onUpdated` carries SPA URL changes (measured)                                                        |
| Permissions       | PASS with one open item: the all-sites content script warning (EXT-004)                                          |
| Privacy           | PASS: copy now matches code; page text request-only; logs origin-only                                            |
| Security          | PASS: no credentials in storage, HMAC native channel, no page→background surface, CSP tight                      |
| Performance       | CONDITIONAL: content script cheap on unapproved pages (measured); worker chunk oversized (EXT-001)               |
| Streaming         | UNVERIFIED live; render path has a known O(n²) shape (EXT-023)                                                   |
| Cancellation      | PASS by code and tests: local abort + backend cancel with captured credential; live UNVERIFIED                   |
| Offline           | CONDITIONAL: network errors are curated, but there is no offline affordance (no `navigator.onLine` handling)     |
| Restricted pages  | PASS: accurate, non-blaming state for Chrome pages, Web Store, `view-source:`, `file:`                           |
| Accessibility     | CONDITIONAL: dialogs and menus correct; contrast and two forms open                                              |
| Store             | CONDITIONAL: manifest and disclosures ready; assets and support URL missing                                      |

## 12. The Final Question

If thousands of users installed this build tomorrow and used it across Gmail, GitHub, documentation, long articles, SPAs, iframe-heavy pages, dozens of tabs, dark and light sites, restricted pages, poor networks, expired sessions and fast and slow models, what would still go wrong:

- **Nothing would leak between tabs, windows or accounts.** The fences are real and tested; the one wrong-tab capture path is closed.
- **Unapproved pages would not notice the extension** beyond ~2 ms of script time; approved pages would get a fixed-position, inert-when-closed panel that no longer reads them until opened.
- **The install prompt would still say "read and change all your data on all websites"** because of the content-script match, and a fraction of users will decline on that alone (EXT-004).
- **Every service-worker wake would still parse 2.6 MB of JavaScript**, which on low-end hardware turns the first message after idle into a visible pause (EXT-001).
- **Enterprise users with third-party cookies blocked would loop on "Sign in"** with nothing telling them why (EXT-012).
- **Long, fast answers would render with growing jank and would yank the scroll** while the user reads earlier messages (EXT-023).
- **Users who click "Pair with Desktop" without the desktop app would hit a dead end** (EXT-015), and anyone who binds `capture_page` would find it needs that same app.
- **Selections inside iframes and form fields would come back empty** without an explanation (EXT-017).
- **Tabs that were open during the install or an update would fail with "reload this page"-class errors that never say so** (EXT-016).
- **A colour-blind or screen-reader user could not tell whether the page is attached** (EXT-025), and the primary buttons' white-on-orange text fails AA (EXT-032).
- **The store listing cannot be submitted** until screenshots and a promo tile exist (EXT-010), and the first authenticated run of the release gate has to happen before the version is tagged.

Everything else the audit found is polish.
