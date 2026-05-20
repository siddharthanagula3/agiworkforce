# Squad: chrome

**Surface:** apps/extension | **Subagent:** chrome-ext-engineer

## Baseline (cited from plan)

- MV3 manifest v1.2.0
- Native messaging bridge target: desktop on port 8787
- 14 test suites
- Surface owns: popup, side panel, content scripts, background service worker, LinkedIn/Lever job autofill, platform prompts for Slack/Gmail/Calendar/Docs/GitHub

## Checker output (source of truth)

### typecheck

```
src/features/background/shortcuts.ts(31,9): error TS2741:
  Property 'createdByOrigin' is missing in type
  '{ id: string; name: string; actions: RunPageAction[]; createdAt: number;
     url: string | undefined; prompt: string | undefined;
     startUrl: string | undefined; scheduled: boolean | undefined; }'
  but required in type 'SavedShortcut'.
```

FAIL — 1 type error.

### lint

PASS — no warnings or errors (`pnpm lint:extension` exits 0).

### test

PASS — 32 test files, 758 tests, 0 failures.
Note: baseline spec cited 14 suites; actual suite count is 32 (the spec was stale). All pass.

### build

PASS — `vite build` completes in ~4s, dist/ produces 7 chunks.
One non-fatal plugin warning: `vite:terser` performance, no correctness impact.

---

## Findings

| #   | Severity              | File:line                                              | Category                          | Checker-cited? | Effort (hrs) | Note                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------- | ------------------------------------------------------ | --------------------------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1                    | `src/features/background/shortcuts.ts:31`              | TypeScript compile error          | Yes (tsc)      | 0.25         | `handleSaveShortcut` constructs `SavedShortcut` without the required `createdByOrigin` field. The security property was added to the type (types.ts:760) as part of the C-03 audit but the corresponding assignment in shortcuts.ts was not updated. Any saved shortcut will have `createdByOrigin: undefined` at runtime, silently breaking the fire-time allowlist re-check in background.ts:555–571.                         |
| 2   | P2                    | `src/jobAutofill.runtime.js:1`                         | eslint-disable scope too broad    | No             | 0.5          | File-level `/* eslint-disable no-undef */` suppresses the lint rule across the entire 1348-line runtime. The `window`, `document`, `DataTransfer`, `HTMLInputElement`, `HTMLSelectElement`, `HTMLTextAreaElement`, `CSS`, `atob` globals are legitimately present in a browser context; the disable is warranted in intent but a comment explaining why, or narrower per-call disables, would be cleaner. Low operational risk. |
| 3   | P2                    | `native-host/com.agiworkforce.browser.json.template:4` | Hardcoded macOS-only install path | No             | 0.5          | `"path": "/Applications/AGI Workforce.app/Contents/MacOS/agi-workforce-bridge"` is macOS-only. Windows and Linux users installing from the template would need a different path. The template is used during manual setup (per INSTALL.md), but the mismatch will silently produce a broken native host on non-Mac platforms.                                                                                                   |
| 4   | ~~P2~~ FALSE POSITIVE | Cross-file schema drift (RETRACTED)                    | Protocol schema drift             | No             | 0            | **Retracted on PR review.** Re-check of `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs:173` confirms `#[serde(rename = "tabId")]` IS present on `SelectedTextQuery.tab_id`. The drift claim contradicts the same report's message-schema table (line 112) which correctly states `tab_id (renamed "tabId")`. Drop from backlog.                                                                               |
| 5   | P3                    | `src/features/content/autofill/detector.ts:64–88`      | LinkedIn selector staleness       | No             | 2            | Multiple LinkedIn selectors target class names tied to CSS-module-compiled output that LinkedIn rotates on deploys. See LinkedIn/Lever section.                                                                                                                                                                                                                                                                                 |
| 6   | P3                    | `manifest.json:content_scripts`                        | Broad content-script match        | No             | 0            | `"matches": ["http://*/*", "https://*/*"]` injects content.js on every HTTP/HTTPS page. This is standard practice for this type of extension and is mitigated by the allowlist gate in background.ts, but it widens the attack surface vs. a more specific match list. Escalation-worthy only if Chrome Web Store review raises it.                                                                                             |

---

## MV3 manifest audit

| Field                      | Value                                                                                                                        | Assessment                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest_version`         | 3                                                                                                                            | Correct                                                                                                                                                                                                                                                     |
| `minimum_chrome_version`   | 132                                                                                                                          | Correct per spec                                                                                                                                                                                                                                            |
| `permissions`              | activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies, notifications, tabGroups     | All individually justifiable for the feature set; `scripting` is needed for `chrome.scripting.executeScript`, `cookies` for the cookie-read/write bridge, `notifications` for task-completion alerts. No `webNavigation` or `declarativeNetRequest` — good. |
| `host_permissions`         | `http://localhost/*`, `http://127.0.0.1/*`                                                                                   | Broad localhost intentional and documented in manifest comment (`_host_permissions_note`). `validateBridgeUrl()` in background.ts enforces non-local rejection at runtime. No `<all_urls>` — correct.                                                       |
| CSP `script-src`           | `'self'`                                                                                                                     | No `'unsafe-eval'`, no `'unsafe-inline'` — correct.                                                                                                                                                                                                         |
| CSP `style-src`            | `'self'`                                                                                                                     | `'unsafe-inline'` was removed per the M-08 audit note in the manifest. Constructable Stylesheets are used instead.                                                                                                                                          |
| CSP `connect-src`          | `'self' http://localhost:* http://127.0.0.1:* https://api.agiworkforce.com https://*.agiworkforce.com https://*.supabase.co` | Enumerated, no wildcard remote origins.                                                                                                                                                                                                                     |
| CSP `object-src`           | `'self'`                                                                                                                     | Correct, no plugin embeds.                                                                                                                                                                                                                                  |
| CSP `base-uri`             | `'self'`                                                                                                                     | Blocks `<base>` tag hijack.                                                                                                                                                                                                                                 |
| CSP `form-action`          | `'self'`                                                                                                                     | Blocks form exfiltration.                                                                                                                                                                                                                                   |
| CSP `frame-ancestors`      | `'none'`                                                                                                                     | Blocks clickjacking.                                                                                                                                                                                                                                        |
| Remote script loads        | None found in manifest or source                                                                                             | Correct for MV3.                                                                                                                                                                                                                                            |
| `web_accessible_resources` | SVG icons, scoped to `https://*.agiworkforce.com/*`                                                                          | Minimal scope, not `<all_urls>`.                                                                                                                                                                                                                            |
| `offline_enabled`          | false                                                                                                                        | Expected.                                                                                                                                                                                                                                                   |

Overall CSP posture: **hardened**. No unsafe directives. Compliant with MV3 requirements.

---

## Native messaging port 8787 contract symmetry (cross-ref squad #6 vscode for same port)

### Architecture

The bridge is **two-hop**:

1. Extension ↔ native host process (Chrome native messaging over stdio, length-prefixed JSON)
2. Native host process ↔ Desktop app (WebSocket at `ws://127.0.0.1:8787`)

The native host binary is `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`. It hardcodes `ws://127.0.0.1:8787` and connects using `RealtimeEvent::NativeMessage / NativeResponse` envelope types defined in `integrations/realtime/events.rs`.

### Wire message schema — extension side (background.ts sendNativeRequest calls)

| type value (JS)       | Fields sent                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| `connect`             | `extension_id`                                                                         |
| `ping`                | (empty)                                                                                |
| `page_context`        | `url`, `title`, `html`, `selected_text`, `tab_id`, `timestamp`, `reason`               |
| `task_result`         | `task_id`, `success`, `screenshot`, `result`, `error`, `actions_performed`, `duration` |
| `selected_text_query` | `tabId`, `url`, `selectedText`, `timestamp`                                            |
| `accessibility_tree`  | `tab_id`, `tools`, `url` (varies)                                                      |
| `webmcp_tools_update` | `tab_id`, `tools`, `url`                                                               |

### Wire message schema — desktop side (Rust `NativeMessage` enum, mod.rs)

The Rust enum uses `#[serde(tag = "type", rename_all = "snake_case")]`. Relevant variants:

| Rust variant        | Deserialized `type`   | Fields expected                                                                                                 |
| ------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Connect`           | `connect`             | `extension_id: String`                                                                                          |
| `Ping`              | `ping`                | (none)                                                                                                          |
| `PageContext`       | `page_context`        | `url, title, html, selected_text (Option), tab_id: i32, timestamp: u64`                                         |
| `TaskResult`        | `task_result`         | `task_id, success, screenshot (Option), result (Option), error (Option), actions_performed: u32, duration: u64` |
| `SelectedTextQuery` | `selected_text_query` | `selected_text (renamed "selectedText"), context_url (renamed "url"), tab_id (renamed "tabId")`                 |

### Schema drift findings

**Finding #4 (RETRACTED — false positive on PR re-check): `selected_text_query` — `tabId` field name ambiguity**

Extension sends (background.ts:1994–1999):

```
{ type: 'selected_text_query', tabId: tab.id, url: ..., selectedText: ..., timestamp: ... }
```

Desktop Rust struct:

```rust
SelectedTextQuery {
    #[serde(rename = "selectedText")]  selected_text: String,
    #[serde(rename = "url")]           context_url: Option<String>,
    #[serde(rename = "tabId")]         tab_id: Option<i32>,
}
```

The `#[serde(rename = "tabId")]` annotation is present, so this field **does** deserialize correctly. However:

- `timestamp` is sent by the extension but not present in the Rust struct — silently dropped. Acceptable.
- The `page_context` message sends `selected_text` (snake_case, matching Rust expectation) and `tab_id` (snake_case, matching). No drift there.
- The `task_result` message sends `actions_performed` and `duration` as `Number(...)` casts; Rust expects `u32` and `u64`. JavaScript numbers are f64; truncation is silent for realistic values.

**No critical schema drift found.** The `selected_text_query` rename annotations are in place. The `timestamp` field mismatch (sent but ignored) is cosmetic.

**Observation — two parallel "schema" layers**: `integrations/native_messaging/mod.rs` (`NativeMessage` enum) is the stdio protocol schema, but `automation/browser/extension_bridge.rs` defines a separate `ExtensionMessage` enum for WebSocket-level commands. These are not in conflict but represent dead-letter types at different abstraction levels. The extension never sends `ExtensionMessage::ExecuteScript` directly — it sends the raw message dict through native messaging. Risk: low, but a future maintainer could confuse the two layers.

---

## LinkedIn / Lever selector staleness

### Lever (`src/features/content/autofill/lever.ts`)

Lever uses a standard HTML form at `jobs.lever.co/<company>/<job>/apply`. Field IDs are stable across companies because Lever is a SaaS platform with a shared form renderer.

| Selector                                         | Risk   | Assessment                                                                                                                                                                                 |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `#name`, `#email`, `#phone`, `#org`              | Low    | Stable Lever-platform IDs; Lever has not changed these in years.                                                                                                                           |
| `input[name="urls[LinkedIn]"]`, `#urls_LinkedIn` | Low    | Lever's URL fields use consistent bracket-notation names.                                                                                                                                  |
| `.upload-btn-wrap input[type="file"]`            | Medium | CSS class `.upload-btn-wrap` is a Lever implementation detail. If Lever updates their UI framework this will break. Fallback `input[type="file"]` should catch most cases.                 |
| `[data-qa="application-form"]`                   | Low    | Data attributes are usually more stable than class names.                                                                                                                                  |
| `form[action*="apply"]`                          | Low    | Attribute-substring match is robust.                                                                                                                                                       |
| `#field0`, `#field1`, `input[name^="cards["]`    | Medium | Custom question IDs are numeric sequencing — stable within a single job posting but the numeric order can shift between postings if the employer changes the form. Functional, not broken. |
| `.lever-application`                             | Low    | Present as a BEM class in Lever's published CSS.                                                                                                                                           |

**Overall Lever risk: Low-Medium.** The `.upload-btn-wrap` CSS class is the one selector most likely to break on a Lever UI refresh. All others anchor on attributes or stable IDs.

### LinkedIn (`src/features/content/autofill/detector.ts:64–88`)

LinkedIn's Easy Apply modal is a React SPA with CSS Modules. Class names like `.jobs-easy-apply-modal`, `.artdeco-modal--layer-default`, `.jobs-easy-apply-form-section`, `.jobs-easy-apply-content` were current as of 2025 but LinkedIn rotates generated class names on every front-end deploy.

| Selector                                      | Risk       | Assessment                                                                        |
| --------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `.jobs-easy-apply-modal`                      | High       | CSS Module class — rotates on LinkedIn FE deploys.                                |
| `[data-test-modal-id="easy-apply-modal"]`     | Low        | Data-test attributes are usually pinned to QA automation; stable.                 |
| `.artdeco-modal--layer-default`               | High       | ArDeCo design system class; rotates.                                              |
| `.jobs-easy-apply-content`                    | High       | CSS Module class — rotates.                                                       |
| `.jobs-apply-modal`                           | High       | CSS Module class — rotates.                                                       |
| `div[aria-label*="Apply"]`                    | Low-Medium | ARIA labels are tied to accessibility requirements; more stable than class names. |
| `[data-test-text-entity-list-form-component]` | Low        | Data-test attribute; stable.                                                      |
| `[id*="jobs-apply"]`                          | Low        | ID substring match; stable as long as LinkedIn keeps this pattern.                |
| `.jobs-easy-apply-form-section`               | High       | CSS Module class — rotates.                                                       |

**Overall LinkedIn risk: Medium-High for form container detection.** The fallback chain (`data-test-modal-id` → `div[aria-label*="Apply"]` → form scan by field IDs) reduces the practical breakage window, but if LinkedIn deploys a new Easy Apply version, the first 3 selectors in `modalSelectors` will all miss simultaneously and the fallback may not find the form container. The content-based fallback (scanning `form` elements for LinkedIn-specific internal field IDs like `[id*="jobs-apply"]`) is the real load-bearing detector.

**Recommendation (not a blocker for v1 LOCAL ONLY):** Replace high-risk class selectors with data attributes or ARIA-based selectors as primaries; keep class selectors only as last-resort fallbacks.

---

## Platform prompts (Slack/Gmail/Calendar/Docs/GitHub)

Canonical file: `src/features/content/platform-prompts.ts`
Re-export shim: `src/platform-prompts.ts` (deprecated, re-exports canonical)

| Platform                    | Key in PLATFORM_PROMPTS | File exists | Model ID hardcoded | LLM logic in surface                                                      |
| --------------------------- | ----------------------- | ----------- | ------------------ | ------------------------------------------------------------------------- |
| Slack                       | `slack.com`             | Yes         | No                 | No — prompt is a static string; routing to LLM brain is done desktop-side |
| Gmail                       | `mail.google.com`       | Yes         | No                 | No                                                                        |
| Google Calendar             | `calendar.google.com`   | Yes         | No                 | No                                                                        |
| Google Docs                 | `docs.google.com`       | Yes         | No                 | No                                                                        |
| GitHub                      | `github.com`            | Yes         | No                 | No                                                                        |
| Notion                      | `notion.so`             | Yes         | No                 | No                                                                        |
| Linear                      | `linear.app`            | Yes         | No                 | No                                                                        |
| Figma                       | `figma.com`             | Yes         | No                 | No                                                                        |
| Atlassian (Jira/Confluence) | `atlassian.net`         | Yes         | No                 | No                                                                        |
| Microsoft Teams             | `teams.microsoft.com`   | Yes         | No                 | No                                                                        |

All platform prompts are static string constants. `getPlatformPrompt(url)` returns the string; the caller sends it to the desktop bridge via `sendNativeRequest`. No LLM inference, no model IDs, no provider API keys in this surface. CLAUDE.md rule #1 and the "NO LLM claims" constraint are both satisfied.

The `getDefaultModelFor` import in background.ts (line 8) is imported from `@agiworkforce/types` and used only to supply a default model hint to the desktop bridge — it reads from `models.json` via the shared package, not hardcoded.

---

## Out-of-scope observations

1. **Test count discrepancy**: Baseline spec says 14 suites; actual checkout has 32 suites and 758 tests. The spec was written at an earlier point and never updated. All 32 pass.
2. **`autofill/filler.ts` duplication**: `src/autofill/filler.ts` and `src/features/content/autofill/filler.ts` both exist and both contain `// eslint-disable-next-line no-control-regex` at line 46. These appear to be the same file in two locations; the barrel at `src/features/native-bridge/index.ts` uses the canonical path. Risk of divergence.
3. **`punycode` DeprecationWarning** during tests: Node.js deprecation from transitive `jsdom` dependency. Not a code issue.
4. **`vite:terser` performance warning** during build: plugin timing warning, not a correctness issue.

---

## False-positive watchlist

- The `/* eslint-disable no-undef */` in `jobAutofill.runtime.js` is intentional: the file runs in a browser content-script context where `window`, `document`, `DataTransfer`, etc. are globally available. It would be a false positive to report this as a genuine lint suppression abuse.
- The `describe.skipIf` tests in the suite are env-gated per CLAUDE.md; none were observed in this audit, and all 758 tests passed.
- The `selected_text_query` schema cross-reference: at first glance the `tabId` (camelCase) / `tab_id` (snake_case) difference looks like drift, but the `#[serde(rename = "tabId")]` annotation on the Rust side resolves it correctly.
