# AGI Chrome Extension — Volume 11 — Files & Images

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md` (repo root), `apps/extension/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and the real extension paths cited per section (see Repository map). Model IDs are referenced from `packages/types/src/models.json`, never hardcoded.

## Overview & stance

The Chrome surface is the **AGI Browser Companion** — a permission-gated browser agent, not a standalone assistant. It holds **no provider keys and runs no inference of its own**. That single fact governs this entire volume: every file or image the user adds is either (a) captured on-device and handed to the **paired Desktop host** over the native-messaging bridge (`com.agiworkforce.browser`) / localhost `8787` (`X-Bridge-Token`), or (b) streamed to **Managed Cloud** through the gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`; `cloudAgentClient.ts` egress rule: no provider host is ever contacted from the extension). **Analysis always runs server-side or desktop-side.** There is **no BYOK and no Local inference on Chrome** (per-surface trust matrix), so files never touch a provider key inside the browser.

Files and images are **device-scoped**. Chrome history is `chrome.storage.local` only (100 conversations, 30-day TTL — `conversation-history.ts`); memory is capped and never synced (`memory-bridge.ts`, max 200). Consumer conversation sync, global memory sync, Projects, and image _generation_ are removed scope. Higher-capability multimodal models are entitlement-gated: the server returns HTTP 429 `{kind:'paywall', feature, requiredTier}` and the extension renders the upgrade prompt (`providerStreamClient.ts`). Access tiers: Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.

## Upload Files — into bridged chat

**🟡 Partial.** The side-panel composer accepts attachments today but is **restricted to images** (`accept="image/*"`, image-only filter in `acceptIncomingComposerFiles`, `apps/extension/src/side_panel.ts`). Accepted items become base64 data-URLs held in `pendingAttachments` and are forwarded on send to the bridged model as a **structured text annotation** (mime + byte-length), not yet real multimodal parts (`apps/extension/src/background.ts` — attachment-summary block). Requirements: arbitrary file types (PDF, text, code, CSV) are **🔭 Planned** and, when added, MUST extract/parse **server-side or desktop-side** — the extension only transports the payload; never parse or run a model in-browser. Attachments MUST stay in `chrome.storage.local`, never sync to Neon, and respect the existing 8-item / 10 MB-per-file caps.

## Upload Images

**✅ Built** (upload path) / **🟡 Partial** (analysis). The `+` menu "Add an image" opens a file picker, `FileReader.readAsDataURL` encodes it, and a thumbnail preview chip renders in the attachment bar with per-item remove (`side_panel.ts`: `pendingAttachments`, `updateAttachmentPreview`). Caps: image-only MIME, ≤10 MB/file, ≤8 attachments total (`acceptIncomingComposerFiles`). Gap (🟡): images currently reach the bridged model as a text annotation (`background.ts`), so true image _understanding_ depends on upgrading the bridge to real multimodal content — the transport type already supports `image_url` parts (`cloudAgentClient.ts` `TextMessage`). Requirements: uploaded images MUST be analyzed only server-side/desktop-side; model routing MUST come from `models.json`; tier-gated vision models MUST surface the 429 paywall, not a silent failure.

## Screenshot Analysis

**✅ Built** (capture + agent-loop vision) / **🟡 Partial** (bridged-chat Q&A). The composer "Take a screenshot" item sends `CAPTURE_SCREENSHOT`, handled in `background.ts` via `chrome.tabs.captureVisibleTab`. The computer-use agent loop captures via CDP `Page.captureScreenshot` (`cdpDriver.ts` `screenshot()`) and feeds base64 PNGs to the vision model from the `computer_use` task-routing entry in `packages/types/src/models.json` (`cloudAgentClient.ts` `COMPUTER_USE_MODEL`) — loop analysis is built. Gap (🟡): attaching a captured screenshot to bridged chat for Q&A rides the same annotation path as images. Requirements: captures are subject to the site allowlist and the screenshot-cooldown rate limit (`utils.ts`); no capture on off-allowlist tabs; analysis never runs in-extension.

## OCR

**🔭 Planned.** No OCR engine ships in `apps/extension` (no Tesseract/recognizer code). Design intent: when a user attaches an image containing text, OCR runs **server-side or desktop-side** as part of the analysis pipeline — never bundled into the MV3 worker. The extension's only job is capture + transport of the image bytes. Any OCR engine identifier must be grounded in real backend/desktop code before it is named here; do not invent one.

## PDF Analysis

**🔭 Planned.** The extension does not parse PDFs today; the only `pdf` references are resume/cover-letter filenames in job autofill (`jobAutofill`), which is unrelated. Design intent: PDF text/layout extraction and analysis run **server-side or desktop-side** after the file is transported over the bridge or gateway. Requirements: no PDF.js or parser in the extension bundle; extracted content MUST honor prompt-injection fencing (treat document text as untrusted data, mirroring the `--- UNTRUSTED PAGE CONTENT ---` fencing in `cdpDriver.ts`); PDF bytes stay device-scoped and are never persisted as synced conversation data.

## Drag & Drop

**✅ Built.** The composer shell handles `dragover`/`dragleave`/`drop`, highlights on a `Files` drag, and routes dropped files through `acceptIncomingComposerFiles` (`side_panel.ts`), which enforces the image-only filter, 10 MB cap, and 8-item ceiling. Requirements: only `Files`-type drags are accepted (no dragging arbitrary DOM/URLs into inference); non-image drops are silently ignored today (tie to the 🔭 general-file work above); dropped bytes follow the same device-scoped, server/desktop-side analysis contract.

## Clipboard Images

**✅ Built.** A `paste` listener on the composer textarea reads `clipboardData.items`, keeps `kind === 'file'` entries whose MIME starts with `image/`, and appends them via `acceptIncomingComposerFiles` (`side_panel.ts`). This covers OS screenshots and copied images without a round-trip through the menu. Requirements: image-only, subject to the same 8/10 MB caps; no clipboard _text_ is exfiltrated automatically; pasted images are analyzed only server-side/desktop-side.

## Downloads Folder Analysis — with permission

**🔭 Planned.** The manifest declares **no** `downloads` permission and there is no `chrome.downloads` usage (`manifest.json`). Design intent: an explicit, permission-gated flow where the user grants `downloads` access, picks a specific downloaded file, and the extension transports it for **server/desktop-side** analysis. Requirements: MUST add the `downloads` permission with a `THREAT_MODEL.md` update and security review (`apps/extension/AGENTS.md` high-risk rule); MUST be opt-in per file (never auto-scan the folder); MUST respect the site allowlist / task scope; no bulk indexing; nothing synced. Until built, keep this labeled 🔭 — do not imply the folder can be read.

## Repository map

- `apps/extension/manifest.json` — permissions (no `downloads` today), CSP, host allowlist.
- `apps/extension/src/side_panel.ts` — composer attachments, image picker, paste, drag-drop, preview, screenshot menu.
- `apps/extension/src/background.ts` — `CAPTURE_SCREENSHOT` handler, attachment forwarding to the bridged model.
- `apps/extension/src/features/computer-use/cdpDriver.ts` — CDP screenshot, page-content fencing, injection heuristic.
- `apps/extension/src/features/computer-use/cloudAgentClient.ts` — cloud gateway egress, multimodal `image_url` type, model from `models.json`.
- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — gateway stream + 429 paywall.
- `apps/extension/src/features/background/conversation-history.ts` — 100-conv / 30-day local history.
- `apps/extension/src/background/memory-bridge.ts` — device-scoped memory, never synced.
- `packages/types/src/models.json` — canonical model/task-routing IDs.

## Competitor notes

Claude for Chrome and ChatGPT's browser tooling accept image/file attachments and analyze them via the vendor's own hosted model; OpenAI Codex focuses on repo/code files over a paired host. AGI's deliberate divergence: (1) **multi-provider** — the model is chosen from `models.json`, not a single vendor; (2) **strict per-surface trust** — Chrome has no BYOK and no in-browser inference, so uploads route only to Managed Cloud or the paired Desktop host; (3) **local-first / device-scoped** — files, images, history, and memory live in `chrome.storage.local` and never sync to the cloud conversation store; (4) **no image generation** on this surface by design.

## Acceptance / Definition of Done

Production-ready when uploaded images/screenshots are analyzed as real multimodal content through the bridge (closing the 🟡 annotation gap), all analysis is provably server/desktop-side, and every 🔭 item is either built with the required permission + threat-model update or clearly gated off.

- [ ] Build: image upload, paste, and drag-drop enforce image-only + 10 MB + 8-item caps; screenshot capture honors the allowlist and cooldown; model ID resolved from `models.json`.
- [ ] Trust: no provider host contacted from the extension; no BYOK/Local path; files/images stay in `chrome.storage.local` and never sync to Neon; entitlement 429 renders the paywall (no silent drop).
- [ ] Security: `downloads`, OCR, and PDF work ship only with a `THREAT_MODEL.md` update + review; attachment and document text are fenced as untrusted (prompt-injection defense).

## Anti-patterns

- Running OCR, PDF parsing, or any model **inside** the extension — analysis is server/desktop-side only.
- Contacting a provider host directly or adding a provider key to Chrome (no BYOK, no Local here).
- Syncing files, images, screenshots, history, or memory to Neon / cloud conversation store.
- Hardcoding a model ID instead of reading `packages/types/src/models.json`.
- Adding the `downloads` permission (or auto-scanning the folder) without a threat-model update and review.
- Treating page/document/attachment text as instructions instead of fenced untrusted data.
- Referencing removed tiers (Plus, `pro_plus`, Hobby) or credit top-ups. The legacy `PaywallRequiredTier` in `providerStreamClient.ts` still lists `hobby`/`pro_plus` (🟡 — tracked reconciliation; do not propagate). Never reference Supabase.
