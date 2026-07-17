# AGI Chrome Extension — Volume 06 — Page Awareness

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-11

Authority: grounds in `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), the nearest surface rules `apps/extension/AGENTS.md`, and these real repo paths: `apps/extension/manifest.json`, `apps/extension/src/content.ts`, `apps/extension/src/page-metadata.ts`, `apps/extension/src/nlweb.ts`, `apps/extension/src/dom-helpers.ts`, `apps/extension/src/features/content/browserTool.ts`, `apps/extension/src/background.ts`, `apps/extension/src/background/policy.ts`, and `apps/extension/THREAT_MODEL.md`. (Corrected 2026-07-11: earlier drafts of this volume cited these under `apps/extension/src/features/content/`; that was a duplicate fork deleted by commit `59c8f4650` because it had drifted out of sync with the live files here and was missing security fixes, including the JSON-LD recursion cap and href percent-encoding referenced below — do not recreate a second copy under `features/content/`.)

## Overview & stance

Page Awareness is how the AGI Browser Companion perceives the active web page: the tab, its URL and title, its visible text, the user's selection, and structured metadata. On this surface every one of those signals is **task-scoped and untrusted**. The extension holds **no provider keys and runs no inference**; page perception exists only to build context that streams out through the cloud gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`) or crosses the native-messaging bridge to Desktop. Trust modes barely apply here because the extension never _runs_ a chat — it is a bridged window; the relevant boundary is the **site allowlist** and the rule that page content is **data, never instructions**.

Three hard rules shape this volume. First, capture is gated on the user-managed origin allowlist (`agi_site_allowlist`); a non-approved page yields no context sync. Second, everything read from the DOM passes `sanitizePageText` (invisible-Unicode stripping + `redactSecrets`) and hard size caps before it can leave the page's trust plane. Third, page-derived data is device-scoped `chrome.storage.local` only and is **never** fed into Neon delta-sync — the removed-scope rule for Chrome (no conversation/memory/Projects sync) applies fully to captured page state.

## Active Tab Detection

The companion resolves the current target via `chrome.tabs.query({ active: true, currentWindow: true })`, used throughout `apps/extension/src/background.ts` before any per-tab action, and reacts to focus/navigation changes through the `chrome.tabs.onUpdated` listener (`background.ts:2633`). The `activeTab` and `tabs` permissions are declared in `manifest.json`. Requirement: detection MUST re-verify the resolved origin against `siteAllowlistCache` at action time, not only at listener registration. **✅ Built** (`apps/extension/src/background.ts` active-tab queries; `manifest.json` permissions).

## Current URL

The captured URL is `window.location.href`, emitted in `buildCurrentPageContext()` (`content.ts:374`) and in `extractPageMetadata()` (`page-metadata.ts:206`). Requirement: only `http(s)` origins are eligible (`/^https?:\/\//i` guard, `background.ts:2638`); `chrome://`, `file://`, and `about:blank` are excluded, and the URL MUST be matched against the allowlist by parsed `origin`, never by substring. **✅ Built** (`apps/extension/src/content.ts`; `apps/extension/src/page-metadata.ts`).

## Page Title

Title is `document.title` (with an `'Untitled'` fallback in `buildCurrentPageContext()`, `content.ts:388`) and is also carried in `PageMetadata.title` (`page-metadata.ts`). Requirement: title text is treated as untrusted page-supplied data and is subject to the same sanitization path as body text before egress. **✅ Built** (`apps/extension/src/content.ts:388`).

## DOM Extraction

Full-DOM extraction is deliberately **not** offered. The former `document.documentElement.outerHTML` path was removed (chrome-CRIT-1) because raw markup shipped hidden nodes, comments, and inline scripts into the LLM context. `extractPageHtmlSafely()` now returns layout-aware `innerText` only, guarded by a 50,000-element ceiling (`MAX_DOM_ELEMENTS_FOR_EXTRACTION`), an extraction timeout, whitespace collapse, and `sanitizePageText` (`content.ts:88`). A structured accessibility view exists as a `snapshot` action (aria mode) in the browser-tool bridge (`browserTool.ts` `browserActionToPageActions`), but a general queryable DOM tree is not exposed. **🟡 Partial** — visible-text + aria-snapshot only; there is intentionally no raw-DOM/serialized-tree extractor (`apps/extension/src/content.ts:88`; `apps/extension/src/features/content/browserTool.ts`).

## Visible Content

Visible content is the sanitized `innerText` of `document.body` (falling back to `document.documentElement`), capped at `MAX_CONTEXT_HTML_CHARS` (~100 KB per THREAT_MODEL). Because `innerText` is layout-computed, `display:none`/`visibility:hidden`/`aria-hidden` and `<script>`/`<style>`/`<noscript>` content are excluded automatically. Requirement: the visible-content payload MUST route through `sanitizePageText` and remain size-capped on every path (context sync and `get_page_info`). **✅ Built** (`apps/extension/src/content.ts:99`; `apps/extension/src/background/policy.ts:446`).

## Selected Text

The user's current selection is read with `window.getSelection()?.toString()` in `buildCurrentPageContext()` (`content.ts:375`), the `analyze_selection` action (`content.ts:427`), and `handleGetPageInfo()` (`content.ts:1205`). Requirement: selection is capped at 2,000 characters at the capture site and, like all page text, is subject to redaction before egress. **✅ Built** (`apps/extension/src/content.ts:375`).

## Images

There is no image extraction, `alt`-text harvesting, or embedded-media enumeration in page capture today; the only visual signal is a whole-viewport screenshot (`chrome.tabs.captureVisibleTab`, `background.ts` `CAPTURE_SCREENSHOT`/`capture_page`), which is a raster snapshot, not per-image awareness. A future image-awareness capability (collect `<img>` sources + `alt`, region capture keyed to elements) is design intent only. **🔭 Planned** — no image-extraction code path exists; screenshot capture is a separate volume.

## Metadata

`extractPageMetadata()` (`page-metadata.ts:194`) returns a typed `PageMetadata`: `description`, `language` (`documentElement.lang`), `canonical` (`link[rel=canonical]`), `author`, `keywords`, `favicon` (with `/favicon.ico` fallback, absolutized), `mainHeading` (first `h1`), plus Open Graph (`og:*`) and Twitter Card (`twitter:*`) maps. Requirement: extraction is fully defensive — it returns a valid empty-fallback object on any DOM error and never throws into the caller. **✅ Built** (`apps/extension/src/page-metadata.ts:194`).

## Structured Data

Structured data covers JSON-LD and microdata. `extractJsonLd()` parses every `script[type="application/ld+json"]` block (malformed blocks are logged and skipped), and `extractSchemaTypes()` collects `@type` values from JSON-LD plus `itemtype` names from `[itemscope][itemtype]` microdata. Recursion is depth-capped at 10 (`MAX_JSONLD_RECURSION_DEPTH`) to bound work on hostile deeply-nested payloads (audit batch-221). `nlweb.ts` reuses schema types for NLWeb/agentic-endpoint detection. Requirement: parsed structured data is untrusted input — it is bounded and sanitized, never executed or trusted as directives. **✅ Built** (`apps/extension/src/page-metadata.ts:19`, `:122`; `apps/extension/src/nlweb.ts`).

## Reading Mode

A dedicated reader/Readability extraction (main-article isolation, boilerplate stripping, clean reading view) is not implemented. Today's closest behavior is the `innerText` visible-content capture, which is not article-scoped. A future Reading Mode would layer a main-content heuristic on top of `extractPageHtmlSafely()` while keeping the same sanitization and size caps. **🔭 Planned** — no reader/article-extraction code path exists.

## Context Refresh

Page context is (re)synced by `syncPageContext()` (`content.ts:396`) → `SYNC_PAGE_CONTEXT`, consumed by `syncTabContextWithDesktop()` in `background.ts` (`:2186`). Refresh fires on `TAB_READY` (content-script init, `content.ts:363`), on explicit `content_sync`, and on allowlisted `tab_updated`. Requirement: each refresh MUST re-run allowlist and sanitization checks; a page removed from the allowlist between refreshes produces no further context. **✅ Built** (`apps/extension/src/content.ts:396`; `apps/extension/src/background.ts:2186`, `:2656`).

## Navigation Tracking

Full-load navigations are tracked via `chrome.tabs.onUpdated` filtered to `changeInfo.status === 'complete'` and gated on `siteAllowlistCache` by parsed origin (`background.ts:2633`). The manifest does **not** request `webNavigation`, so SPA "soft" route changes (`onHistoryStateUpdated`, `pushState`) are not observed and do not trigger a refresh. Requirement: any future SPA-navigation tracking must add the permission via a THREAT_MODEL update and stay allowlist-gated. **🟡 Partial** — full-load navigation is tracked; in-page history/SPA transitions are not (`apps/extension/src/background.ts:2633`; gap: no `webNavigation` in `apps/extension/manifest.json`).

## Repository map

- `apps/extension/src/content.ts` — page-context builder, `innerText` extraction, selection, `get_page_info`.
- `apps/extension/src/page-metadata.ts` — metadata, JSON-LD, microdata schema types.
- `apps/extension/src/nlweb.ts` — NLWeb/agentic-endpoint detection reusing schema types.
- `apps/extension/src/dom-helpers.ts` — safe DOM construction (no `innerHTML`).
- `apps/extension/src/features/content/browserTool.ts` — canonical action bridge incl. aria `snapshot`.
- `apps/extension/src/background.ts` — active-tab resolution, allowlist gate, tab-update sync, context relay.
- `apps/extension/src/background/policy.ts` — `sanitizePageText` + `redactSecrets` chain.
- `apps/extension/manifest.json`, `apps/extension/THREAT_MODEL.md` — permissions and page-data threat model.

## Competitor notes

Claude for Chrome and ChatGPT's browsing/operator surfaces read the page (DOM/text, selection, screenshots) to plan actions; OpenAI Codex focuses on repo/workspace context rather than arbitrary page perception. AGI's deliberate divergence: (1) **local-first, no in-extension inference** — the extension never holds keys or runs a model, so page perception is capture-and-forward only; (2) **allowlist-first** — nothing is captured off approved origins, versus broad host access; (3) **data-not-instructions is enforced in code**, not just policy — `sanitizePageText` + `redactSecrets` + depth/size caps sit on every path; (4) **per-surface trust** — captured page data is task-scoped `chrome.storage.local`, never joined to Web↔Mobile↔Desktop Neon delta-sync, and BYOK is not a mode here at all.

## Acceptance / Definition of Done

Page Awareness is production-ready when capture is allowlist-gated on every path, all page-derived text is sanitized and size-capped before egress, and captured data never leaves the device-scoped store.

- [ ] **Build:** `pnpm --filter @agiworkforce/extension typecheck` and `pnpm --filter @agiworkforce/extension test` pass; capture returns valid fallbacks on DOM/CSP errors.
- [ ] **Trust:** no capture on non-allowlisted origins (message dispatch + `tab_updated` both gated); captured page data stays in `chrome.storage.local` and is never written to any `/api/{chat,memory,projects}/sync` path.
- [ ] **Security:** every page-text path routes through `sanitizePageText`; JSON-LD recursion and body-text size caps hold; page content is consumed as data with no instruction-following (prompt-injection tests in `THREAT_MODEL.md` pass).

## Anti-patterns

- Re-introducing `outerHTML`/raw-DOM extraction, or sending page text that skips `sanitizePageText` (chrome-CRIT-1 regression).
- Capturing or syncing context from non-allowlisted origins, or matching the allowlist by substring instead of parsed `origin`.
- Treating page content, JSON-LD, metadata, or WebMCP/NLWeb strings as instructions rather than untrusted data.
- Routing captured page data into Neon delta-sync, or claiming conversation/memory/Projects sync on Chrome (removed scope).
- Adding `webNavigation` or new capture permissions without a THREAT_MODEL update and security review.
- Hardcoding provider/model IDs (they belong to `packages/contracts/types/src/models.json`), referencing removed tiers (Plus/Hobby/`pro_plus`) or credit top-ups, or referencing Supabase.
- Implying image extraction or Reading Mode is shipped — both are 🔭 Planned.
