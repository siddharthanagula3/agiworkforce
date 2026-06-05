# Chrome Manifest V3 — Current Rules, Constraints & Pitfalls (2026)

Research date: 2026-05-29
Author: Research analyst (AGI Workforce)
Scope: Chrome MV3 extension platform as of Chrome **148** stable. Framed against AGI Workforce's Chrome extension surface (`apps/extension`, already MV3), v1 = Local + BYOK, local-first privacy, native-messaging bridge to the desktop app.

> Confidence: **medium-high overall**, granular per fact.
> - **High:** Chrome stable version (148, confirmed May 12 2026), the MV2 deprecation timeline (from the official timeline doc), CSP minimum, native-messaging size limits, storage quotas, side-panel/scripting API version floors. These are anchored to dated official pages and were cross-checked.
> - **Medium:** the service-worker idle/termination numbers (30s idle / 5-min single-event / 30s fetch). These are still canonical and were corroborated via Context7's indexed copy of the lifecycle doc and the Chrome 110 "What's new" note, **but** the source lifecycle page itself carries a "Last updated 2023-05-02" stamp, so treat the exact seconds as stable-but-older-doc-derived.
> - **Medium (community-sourced, flagged inline):** the "open `connectNative()` port does NOT reliably keep the worker alive past ~5 min" caveat comes from Chrome's own issue tracker plus chromium-extensions threads, not a clean doc statement. It is load-bearing for AGI and is flagged as such.
>
> Context7 note: the brief asked to use Context7 if available. It **does** index the Chrome extension platform docs (`/websites/developer_chrome_extensions`, High reputation, 7268 snippets). I used it to cross-check the service-worker lifecycle numbers and the WebSocket keepalive pattern; results agreed with the official pages. Primary trust still rests on the dated official Chrome for Developers pages cited below.

---

## Summary

Manifest V3 is now the **only** manifest version Chrome runs. MV2 is fully gone for all users: Chrome 138 was the last version to honor MV2 (even under the enterprise `ExtensionManifestV2Availability` policy), and **Chrome 139 removed that policy entirely** (rollout from the Chrome 139 branch beginning June 2025) ([MV2 timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline), accessed 2026-05-29). For AGI this is **context, not a task** — AGI's manifest is already `manifest_version: 3`.

The defining MV3 constraints a modern extension must live with:

1. **The background is an ephemeral service worker, not a persistent page.** It is killed after **30 seconds of inactivity**, when a **single event/handler exceeds 5 minutes**, or when a `fetch()` takes **>30 s** to respond ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), accessed 2026-05-29; corroborated via Context7 indexed copy + [Chrome 110 What's new](https://developer.chrome.com/docs/extensions/whats-new)). All in-memory state can vanish; persist to `chrome.storage`.
2. **No remotely hosted code.** All JS/Wasm/CSS must ship inside the bundle; `eval`, `new Function`, and remote `executeScript` are blocked on extension pages. The extension-pages CSP **cannot be loosened below** `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` ([CSP manifest reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy), accessed 2026-05-29; [Improve security](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)).
3. **Permissions are user-controlled and review-scrutinized.** Host access can be runtime-toggled by the user; broad `<all_urls>`/`http(s)://*/*` matches trigger the "read and change all your data on all websites" warning and single-purpose review pressure.
4. **Native messaging is the supported bridge to a local desktop app**, with hard size limits (64 MiB extension→host, 1 MB host→extension) and an `allowed_origins` allowlist.

**The single most important finding for AGI:** AGI's extension is a *browser-automation* extension wired to the desktop bridge via `nativeMessaging`, which means **long-running, agentic browser workflows** are the core use case — and that is precisely the workload the MV3 service-worker lifecycle is hostile to. The docs say an open `connectNative()` port keeps the worker alive (Chrome 105+), but Chrome's own issue tracker and developer threads report the worker **still dies at ~5–6 minutes even with an open native port** ([developer.chrome.com issue #2688](https://github.com/GoogleChrome/developer.chrome.com/issues/2688)). AGI must treat the bridge connection as *not sufficient on its own* for keepalive and design for unexpected termination + resumability. A directly-on-point public signal: Anthropic's own "Claude in Chrome" hit "service worker idle timeout breaks autonomous/agentic workflows" ([claude-code issue #15239](https://github.com/anthropics/claude-code/issues/15239)).

A secondary repo-grounded gap: AGI declares `minimum_chrome_version: "132"`, but if it calls `sidePanel.getLayout()` (Chrome 140) or the side-panel `onOpened`/`onClosed` events (Chrome 141–142), the version floor is too low for those APIs.

---

## Current bar (what best practice requires as of 2026-05-29)

What a well-built MV3 extension is expected to do today. AGI status noted where verifiable from the repo (`apps/extension/manifest.json`, `THREAT_MODEL.md`, `src/*.ts`).

1. **Be MV3, period.** MV2 no longer loads on any channel; the enterprise escape hatch was removed in Chrome 139 ([MV2 timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline)). **AGI: already MV3.**

2. **Treat the service worker as stateless and short-lived.** Persist anything that must survive a restart to `chrome.storage.local`/`.session`; re-hydrate on wake; register event listeners at the top level (synchronously) so they're attached when the worker is revived by an event ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)). **AGI: persists allowlist/shortcut/task state to `chrome.storage.local` per THREAT_MODEL.md.**

3. **Use a deliberate keepalive only when genuinely doing long work, and use a supported mechanism.** Supported timer-resetters: any incoming event or extension API call (Chrome 110+), long-lived messaging ports (Chrome 114+), WebSocket message exchange within the 30s window (Chrome 116+), offscreen-document messages (Chrome 109+), active `chrome.debugger` sessions (Chrome 118+), and `connectNative()` (Chrome 105+) ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)). The canonical WebSocket keepalive sends a message every **20 seconds** ([Use WebSockets in service workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets), via Context7). **Note:** the 5-minute per-event cap is not a "keepalive" you can defeat with a port — it bounds a single handler (see Pitfalls §1–2).

4. **Ship all code in the bundle; keep CSP at or near the enforced minimum.** No remote scripts; add `'wasm-unsafe-eval'` only if you use Wasm (Chrome 103+); use sandboxed iframes if you truly need `eval` ([CSP reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)). **AGI: CSP is tighter than required — `default-src 'self'`, `script-src 'self'` (no `wasm-unsafe-eval`), `style-src 'self'` (dropped `unsafe-inline`), `object-src 'self'`, enumerated `connect-src`, plus `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. This is best-in-class.**

5. **Least-privilege permissions, with the broad ones justified.** Request the minimum; prefer `activeTab` (temporary host access on user gesture) over broad `host_permissions`; declare broad/discovered hosts as **`optional_host_permissions`** and request at runtime inside a user gesture ([Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions); [chrome.permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)). **AGI: `host_permissions` is localhost-only (bridge); content-script `matches` is `http(s)://*/*` but runtime trust is gated by an origin allowlist (see §Implications).**

6. **Content scripts: stay in the ISOLATED world unless you have a hard reason for MAIN.** `world: "MAIN"` puts your code under the *page's* CSP and lets the host page read/interfere with it — a real risk for a privacy product ([Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)). Prefer `chrome.scripting.registerContentScripts()` (dynamic, Chrome 96+) when match patterns are user-driven rather than baking broad static matches.

7. **Native messaging: lock `allowed_origins` to your exact extension IDs (no wildcards) and respect size limits.** ([Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)). **AGI: uses `nativeMessaging`; host manifest under `apps/extension/native-host`.**

8. **Message passing: return `true` for async responses; never use a bare `async` listener with `return true`.** ([Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)). Validate sender identity on every message.

9. **Side panel: declare `sidePanel` permission + `side_panel.default_path`; only call `open()` inside a user gesture; gate version-floor against the APIs you call.** ([chrome.sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)). **AGI: declares both; `minimum_chrome_version` 132 may be below the floor for newer side-panel APIs.**

10. **Web Store hygiene: one single purpose, minimum functionality, prominent data-use disclosure, Limited Use compliance.** Build review-time slack into release planning — reviews can run **up to a few weeks** under current submission load ([Review process](https://developer.chrome.com/docs/webstore/review-process); [Program policies](https://developer.chrome.com/docs/webstore/program-policies)).

---

## Version-specific facts (exact versions + dates)

### Chrome browser
- **Chrome 148** is the current stable line. Stable updated to **148.0.7778.167/168** (Win/Mac) on **May 12 2026** ([Chrome Releases — Stable update May 12 2026](https://chromereleases.googleblog.com/2026/05/stable-channel-update-for-desktop_12.html)). Chrome 149 beta opened May 6 2026, targeting stable ~June 2 2026 ([Chrome Releases May 2026](https://chromereleases.googleblog.com/2026/05/)).

### Manifest V2 deprecation timeline (all confirmed from the official timeline doc, accessed 2026-05-29)
- **Jan 2022:** Web Store stopped accepting *new* public/unlisted MV2 extensions.
- **June 2022:** Web Store stopped accepting *new* private MV2 extensions.
- **Oct 9 2024:** MV2-disabling began rolling out on Chrome stable; enterprises exempt via `ExtensionManifestV2Availability` until June 2025.
- **Mar 31 2025:** MV2 disabled by default on all channels (re-enable still allowed).
- **July 24 2025 / Chrome 138:** MV2 disabled on all channels with **no re-enable**; Chrome 138 is the **last** version to support MV2 under the enterprise policy.
- **Chrome 139 (branch from June 2025):** `ExtensionManifestV2Availability` policy **removed** — MV2 off for *everyone* at once.
  Source: [Manifest V2 support timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline).

### Service worker lifecycle (numbers: medium confidence — source page "Last updated 2023-05-02", cross-checked via Context7)
- Terminated after **30 s of inactivity**; after a **single event/API call exceeds 5 min**; or if a `fetch()` response takes **>30 s** ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)).
- Timer resets / keepalive sources by version: **105** native messaging `connectNative()`; **109** offscreen-document messages; **110** any extension API call resets timers (idle aligned to web SW lifetime); **114** long-lived messaging ports; **116** WebSocket messages + extended timeout for user-prompt APIs; **118** active `chrome.debugger` sessions; **120** `chrome.alarms` minimum period lowered to **30 s** ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)).
- WebSocket keepalive idiom: send a message every **20 s** ([Use WebSockets in service workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)).

### CSP
- Enforced minimum for `extension_pages`: **`script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`**; cannot be relaxed (no `unsafe-eval`, no remote script hosts) ([CSP reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)).
- Wasm requires **`'wasm-unsafe-eval'`** since **Chrome 103** ([CSP reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)).
- `eval`/`new Function` still work **only inside sandboxed iframes** ([Improve security](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)).

### Content scripts
- Dynamic registration via `chrome.scripting.registerContentScripts()` etc. since **Chrome 96** ([Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)).
- `world`: default **ISOLATED**; **MAIN** runs under the page's CSP and is page-accessible (risk).
- `run_at`: `document_idle` (default), `document_start`, `document_end`; plus `all_frames`, `match_about_blank`, and `match_origin_as_fallback` (inject into `about:`/`data:`/`blob:` by initiator origin).

### Permissions
- `optional_permissions` + `optional_host_permissions` declarable in manifest; runtime grants via `chrome.permissions.request()` **must occur inside a user gesture** (MV3 throws "This function must be called during a user gesture" otherwise) ([chrome.permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)).
- For hosts discovered at runtime, declare `"https://*/*"` in `optional_host_permissions` and request specific origins later ([Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)).
- `activeTab` grants temporary host + tabs access to the active tab on user invocation, avoiding broad host warnings.

### Native messaging
- `nativeMessaging` permission required; APIs unavailable in content scripts (route through the SW).
- Host manifest fields: `name` (lowercase alnum/underscore/dots), `description`, `path` (absolute on macOS/Linux; relative allowed on Windows), `type: "stdio"`, `allowed_origins` (**no wildcards**).
- Install locations — **Windows:** registry `HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\<name>` or `HKCU`; **macOS/Linux:** per-browser system + user dirs.
- **Size limits:** extension→host max **64 MiB**; host→extension max **1 MB** per message ([Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)).
- `connectNative()` = persistent port; `sendNativeMessage()` = one-shot host process per message.

### Storage quotas
- `storage.local`: **10 MB** (was 5 MB ≤ Chrome 113); removed with `unlimitedStorage` permission.
- `storage.session`: **10 MB**, in-memory only, not persisted to disk; MV3 since Chrome 102 (quota raised from earlier 1 MB).
- `storage.sync`: **~100 KB total**, **8 KB per item**, ~512 items — the classic gotcha (see Pitfalls §6).
  Source: [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage).

### Side panel
- `sidePanel` permission + `side_panel.default_path`. `setPanelBehavior({openPanelOnActionClick})`; `setOptions({enabled, path, tabId})`; per-tab vs global panels (tab panels auto-close on unsupported sites).
- `sidePanel.open()` — **Chrome 116**, user-gesture-gated. `getLayout()` ("left"/"right") — **Chrome 140**. `onOpened`/`onClosed` — **Chrome 141–142**.
  Source: [chrome.sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

### Web Store
- Reviews typically a few days, **up to a few weeks** under current load (April 2026 surge noted); contact support if pending > 3 weeks ([Review process](https://developer.chrome.com/docs/webstore/review-process)).
- Single Purpose, Minimum Functionality (now also bars empty/click-bait/template extensions), Limited Use, prominent data-use disclosure; **one appeal per violation, no re-appeal** ([2025 policy updates](https://developer.chrome.com/blog/cws-policy-updates-2025); [Program policies](https://developer.chrome.com/docs/webstore/program-policies)).

---

## Known pitfalls & gotchas

1. **The 5-minute cap bounds a single event/handler — it is NOT total uptime.** A long synchronous or single-promise handler that runs past ~5 minutes is killed even if events keep arriving. Long work must be **chunked** across multiple events/ticks, or offloaded ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)).

2. **"`connectNative()` keeps the SW alive" is unreliable in practice.** Chrome's own issue tracker and developer threads report the worker still goes inactive at **~5–6 minutes** with an open native port (and with `onConnectExternal` ports), and that **opening a port no longer resets the idle timers** the way it once did ([developer.chrome.com issue #2688](https://github.com/GoogleChrome/developer.chrome.com/issues/2688); [chromium-extensions: open port keepalive thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/TKQba6B6psU)). **Do not rely on the bridge connection alone** to keep the worker alive. *(Community/issue-tracker sourced — flagged.)*

3. **In-memory state is volatile.** Globals, in-flight Maps, auth tokens cached in the SW vanish on termination. Persist to `chrome.storage` and re-hydrate; register listeners synchronously at top level so an event can revive the worker.

4. **Async message listener footgun.** `chrome.runtime.onMessage` requires `return true` to keep the response channel open for async work — **but** an `async` listener implicitly returns a Promise (not `true`), silently closing the channel and dropping `sendResponse`. Use a sync listener that returns `true`, or return a Promise per the documented Promise path; only the **first** listener to respond wins ([Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)).

5. **`fetch()` >30 s kills the worker mid-request.** Long LLM/streaming calls from the SW can be cut off. Stream incrementally, or move long network work to an offscreen document / the desktop app over the bridge.

6. **`storage.sync` is tiny.** ~100 KB total and **8 KB per item** — easy to blow with conversation/state blobs, failing the write and setting `runtime.lastError`. Use `storage.local` (10 MB, or `unlimitedStorage`) for anything substantial.

7. **`world: "MAIN"` forfeits your CSP and exposes your script to the page.** The host page's CSP applies and page JS can read/tamper with your injected code — avoid for anything privacy-sensitive ([Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)).

8. **Broad content-script `matches` ≠ broad `host_permissions`, but both feed the scary install warning and review scrutiny.** A `matches: ["http://*/*","https://*/*"]` content script alone produces "read and change all your data on all websites." For a privacy-first product this is a trust and Single-Purpose liability unless tightly gated and disclosed.

9. **Runtime permission requests must be inside a user gesture.** `chrome.permissions.request()` outside a click handler throws in MV3; you can only request permissions **already declared** as optional.

10. **CSP can't be loosened.** Attempts to add `unsafe-eval` or remote hosts to `script-src` for extension pages are rejected; remote code must be bundled or run in a sandboxed iframe.

11. **Native-messaging `allowed_origins` wildcards are invalid** — must be exact extension IDs; a too-permissive list lets unintended extensions talk to your host.

12. **Side-panel `open()` only works on a user gesture**, and newer side-panel APIs raise the effective Chrome floor above what older `minimum_chrome_version` declarations promise.

13. **Web Store review is now a scheduling risk.** Multi-week reviews + one-appeal-only mean a rejected release can slip a launch; pre-validate against Single Purpose / Minimum Functionality / Limited Use before submitting.

---

## Implications / gaps for AGI Workforce

AGI's `apps/extension` is **already MV3 and unusually well-hardened** (CSP tighter than the enforced minimum; origin-allowlist message gate; origin-stamped persisted records; `innerHTML` largely replaced with `textContent`/DOM builders and a `sanitizeHtml(renderMarkdown())` path in `side_panel.ts`; cookie-domain blocklist). The gaps below are about **staying correct within MV3**, not migrating.

1. **(Highest) Service-worker lifecycle vs long-running browser automation — architectural, not a config tweak.** AGI's value prop is agentic browser automation driven over the native-messaging bridge. MV3 will terminate the SW at 30 s idle, will cap any single handler at ~5 min, and — per the issue tracker — **may kill the worker even with an open `connectNative()` port** (Pitfall §2). Anthropic's own Claude-in-Chrome hit exactly this ([claude-code #15239](https://github.com/anthropics/claude-code/issues/15239)). Required posture:
   - Make every automation step **resumable**: persist step/cursor state to `chrome.storage.local`/`.session` and continue on wake.
   - Keep the **heavy/long-running orchestration in the desktop app** (the bridge owner), with the extension as a thin, restart-tolerant executor — which fits AGI's local-first design.
   - If a deliberate keepalive is needed, use a **supported** mechanism (long-lived port message exchange or a 20-25 s heartbeat via `chrome.runtime.getPlatformInfo()` / WebSocket) and still chunk work under the 5-min handler ceiling. **Verify in AGI's `background.ts` whether the bridge port is treated as sufficient keepalive — if so, that assumption is unsafe.**

2. **`minimum_chrome_version: "132"` may be below the floor for newer APIs.** If AGI calls `sidePanel.getLayout()` (Chrome **140**) or side-panel `onOpened`/`onClosed` (Chrome **141–142**), those calls will be undefined on Chrome 132–139. Either raise the floor to match the highest API actually used, or feature-detect. Confirm by grepping `apps/extension/src` for `getLayout`/`onOpened`/`onClosed`.

3. **Content-script breadth is intentional and gated — keep it documented for review.** `content_scripts.matches` is `http(s)://*/*` (every page) while `host_permissions` stays localhost-only. THREAT_MODEL.md shows runtime trust is gated: `isAllowlistedSender` rejects content scripts whose tab origin isn't in `siteAllowlistCache`; `EXTENSION_PAGE_ONLY_MESSAGE_TYPES` blocks state-mutating messages from content scripts; records are origin-stamped and re-checked at fire time; `CAPTURE_SCREENSHOT` from a content script is restricted to its own tab. This is a strong design. **The residual risk is review/trust optics:** the broad match still produces the "all websites" warning and Single-Purpose scrutiny. Consider documenting in the Web Store listing why all-pages injection is needed, and evaluate whether dynamic `registerContentScripts()` on the allowlisted origins (instead of a broad static match) would shrink the surface and the warning. **(Frame: verify breadth is intended + disclosed — the gate exists, this is not a bug.)**

4. **CSP posture is ahead of the bar — keep it.** AGI omits `'wasm-unsafe-eval'`; if any provider/local-inference path ever needs Wasm in extension pages, that one token must be added (and only that one). The `side_panel.ts` `innerHTML = sanitizeHtml(renderMarkdown(...))` path is the one place to keep auditing — sanitizer correctness is the load-bearing control there.

5. **Native messaging size limits constrain payloads.** Host→extension is capped at **1 MB/message** — large page captures, screenshots, or model outputs returned *from* the desktop bridge to the extension must be chunked or referenced, not sent whole. Extension→host is 64 MiB, so capture-upload direction is roomier. Confirm `allowed_origins` in `native-host` is the exact extension ID(s) with no wildcards.

6. **Trust-boundary alignment (product lock).** AGI's locks require never silently routing Local/dev data to BYOK/cloud. The extension's `connect-src` already enumerates only local bridge + AGI origins, and the content-script gate is allowlist-based — consistent with the lock. Any future provider routing inside the extension must preserve the visible-provider-label + explicit-consent contract, not just rely on CSP `connect-src`.

7. **Release scheduling.** Bake **multi-week Web Store review** + one-appeal-only into any launch plan touching the extension; pre-check Single Purpose / Minimum Functionality / Limited Use / data-disclosure before each submission to avoid a rejection slipping the date.

---

## Sources

- Manifest V2 support timeline — https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline — accessed 2026-05-29 (milestones Jan 2022 → Chrome 139)
- The extension service worker lifecycle — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle — page "Last updated 2023-05-02", accessed 2026-05-29
- What's new in Chrome extensions (Chrome 110 SW idle change) — https://developer.chrome.com/docs/extensions/whats-new — accessed 2026-05-29
- Use WebSockets in service workers (20 s keepalive) — https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets — accessed 2026-05-29 (via Context7 `/websites/developer_chrome_extensions`)
- Manifest — Content Security Policy — https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy — accessed 2026-05-29
- Improve extension security (remote code, sandbox eval) — https://developer.chrome.com/docs/extensions/develop/migrate/improve-security — accessed 2026-05-29
- Content scripts — https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts — accessed 2026-05-29
- chrome.scripting — https://developer.chrome.com/docs/extensions/reference/api/scripting — accessed 2026-05-29
- Declare permissions — https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions — accessed 2026-05-29
- chrome.permissions — https://developer.chrome.com/docs/extensions/reference/api/permissions — accessed 2026-05-29
- Native messaging — https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging — accessed 2026-05-29
- chrome.storage (quotas) — https://developer.chrome.com/docs/extensions/reference/api/storage — accessed 2026-05-29
- chrome.sidePanel — https://developer.chrome.com/docs/extensions/reference/api/sidePanel — accessed 2026-05-29
- Message passing — https://developer.chrome.com/docs/extensions/develop/concepts/messaging — accessed 2026-05-29
- Chrome Web Store review process — https://developer.chrome.com/docs/webstore/review-process — accessed 2026-05-29
- Chrome Web Store Program Policies — https://developer.chrome.com/docs/webstore/program-policies — accessed 2026-05-29
- Chrome Web Store policy updates (2025) — https://developer.chrome.com/blog/cws-policy-updates-2025 — accessed 2026-05-29
- Chrome Releases — Stable Channel Update for Desktop (May 12 2026, Chrome 148) — https://chromereleases.googleblog.com/2026/05/stable-channel-update-for-desktop_12.html — accessed 2026-05-29
- Chrome Releases — May 2026 index — https://chromereleases.googleblog.com/2026/05/ — accessed 2026-05-29
- GoogleChrome/developer.chrome.com issue #2688 (connectNative keepalive unreliable) — https://github.com/GoogleChrome/developer.chrome.com/issues/2688 — accessed 2026-05-29 (community/issue-tracker)
- chromium-extensions: "How long will opened port keep worker alive?" — https://groups.google.com/a/chromium.org/g/chromium-extensions/c/TKQba6B6psU — accessed 2026-05-29 (community)
- anthropics/claude-code issue #15239 (SW idle timeout breaks agentic workflows) — https://github.com/anthropics/claude-code/issues/15239 — accessed 2026-05-29 (community)

### Repo facts (direct file reads, high confidence)
- `apps/extension/manifest.json` — MV3; permissions incl. `nativeMessaging`/`sidePanel`/`scripting`; `host_permissions` localhost-only; content-script `matches` `http(s)://*/*`; hardened CSP; `minimum_chrome_version: "132"`.
- `apps/extension/THREAT_MODEL.md` — origin-allowlist message gate, extension-page-only message types, origin-stamped records, per-tab screenshot restriction.
- `apps/extension/src/{side_panel,popup,dom-helpers,background}.ts` — `innerHTML` mostly replaced with `textContent`/DOM builders; `sanitizeHtml(renderMarkdown())` for markdown; cookie-domain blocklist.
