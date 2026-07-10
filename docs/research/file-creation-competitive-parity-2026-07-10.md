# File Creation / Code Execution / Artifact-vs-File Competitive Parity — 2026-07-10

Status: Research spec — uncommitted, for review before merge.
Owner: Platform lead (research requested by team lead, executed autonomously)
Scope: Verify, from official sources, exactly how ChatGPT, Claude (claude.ai), Gemini, and (briefly) Grok and Microsoft Copilot implement sandboxed code execution, file creation, and the artifact/canvas-vs-downloadable-file split — API wire shapes included — then diff against our current implementation and rank the gaps.

**Honesty rules applied**: every claim below carries a citation. Claims not confirmed by an official source are marked **INFERRED** or **UNKNOWN/not found** — these are documentation gaps in the vendor's own public docs, not omissions on my part. Do not upgrade an INFERRED claim to a fact when reusing this doc.

---

## 1. ChatGPT / OpenAI

Sources: `developers.openai.com/api/docs/guides/tools-code-interpreter` (current home of what used to be `platform.openai.com/docs`, redirects 301), `developers.openai.com/api/docs/api-reference/container-files/*`, `help.openai.com` (WebSearch-snippet only — direct fetch returned 403 in this session), local screenshots at `~/Desktop/openai-docs/screencapture-developers-openai-api-docs-guides-tools-code-interpreter-2026-07-10-09_53_09.png` and `...guides-agents-sandboxes-...png`.

**1. Execution environment**

- Sandbox described only as a "fully sandboxed virtual machine" running Python; no container runtime named.
- Containers expire after **20 minutes of inactivity**; any container operation refreshes `last_active_at`. Expired containers cannot be reactivated — a new container + file re-upload is required, and in-memory Python state is lost.
- Memory tiers: `1g` (default), `4g`, `16g`, `64g`, billed at different built-in-tool rates.
- Disk limits: not documented.
- Network access inside the sandbox: not stated in the official guide (a community claim says no internet access — **INFERRED**, not confirmed).
- Session reuse: "auto" mode reuses an active container across `code_interpreter_call` items in the same conversation context while it's alive; ephemeral after the 20-min idle window.
- Only Python is named as a supported language; specific preinstalled libraries are not enumerated in the guide.

**2. File creation flow**

- Model calls the `code_interpreter` tool (`"type": "code_interpreter"`) with a `container` object — either `{"type": "auto", "memory_limit": "4g", "file_ids": [...]}` or an explicit pre-created container id (`cntr_...`).
- Exact in-sandbox filesystem path (commonly assumed `/mnt/data`) is **not confirmed** — it does not appear in the fetched guide text; do not assert it.
- Files created by the model surface as `container_file_citation` annotations on the assistant message (shape in §6). Developers pull bytes via `GET /v1/containers/{container_id}/files/{file_id}/content`.
- Any file referenced in model input auto-uploads into the active container; additional files can be added via a container-files create endpoint (multipart or `{file_id}` JSON body); files can be listed via `GET /v1/containers/{container_id}/files`.
- Product-level (ChatGPT UI, not API) upload caps, via WebSearch snippets of `help.openai.com` articles (not independently re-fetched — treat as less certain than the API-doc facts): max upload **512 MB**, CSV/spreadsheet ~50 MB, images 20 MB, text/doc ~2M tokens, account storage up to 10 GB (some sources cite 25 GB/user, 100 GB/org — inconsistent across snippets, **flag as unresolved**), ~80 files/3h rate limit.
- Supported file extensions (API code-interpreter table, confirmed via local screenshot + live page): `.c .cs .cpp .csv .doc .docx .html .java .json .md .pdf .php .pptx .py .rb .tex .txt .css .js .sh .ts .jpeg/.jpg .gif .pkl .png .tar .xlsx .xml .zip` — docx/pptx/xlsx/pdf/csv/images all present.
- No evidence found of a file-generation tool distinct from code_interpreter for document creation — **unknown/not found**.

**3. Chat UX**

- Official UI-chrome documentation (file card anatomy, progress spinners, click behavior, per-file error states) was **not found** on help.openai.com or developers.openai.com in this session (help.openai.com blocked direct fetch with 403). Confirmed only: generated files save to the user's **Library**, visible under Settings > Storage (WebSearch snippet of `help.openai.com/en/articles/20001052-file-storage-and-library-in-chatgpt`, not independently re-verified). Everything else about card layout/progress/error UI is **INFERRED from general knowledge, not sourced** — treat as an open documentation gap, not a confirmed OpenAI spec.

**4. Canvas vs files**

- Canvas is a distinct editing surface with **version history and restore** (back-button to previous versions) and a "Show changes" diff toolbar for both prose and code (WebSearch snippet, `help.openai.com/en/articles/9930697`). Canvas supports **in-browser Python execution** via an "Execute" button.
- How Canvas content becomes a downloadable file vs. how code-interpreter files become downloadable is **not confirmed** — the two appear architecturally distinct (Canvas edit surface vs. container-file citations), but the hand-off is undocumented.

**5. Cross-surface**

- No official documentation found confirming or denying feature parity between ChatGPT web/desktop/iOS/Android for code interpreter or file creation. One third-party GitHub issue (not official) reports mobile apps can send incomplete file references to MCP tools vs. web — **INFERRED/community, do not treat as OpenAI-confirmed**.

**6. API wire shapes** (most reusable for our provider adapters)

```json
// tool definition
"tools": [{ "type": "code_interpreter", "container": { "type": "auto", "memory_limit": "4g", "file_ids": ["file-1"] } }]
// explicit container
POST /v1/containers  { "name": "My Container", "memory_limit": "4g" }  -> { "id": "cntr_..." }
// citation on assistant message content
{
  "annotations": [{
    "type": "container_file_citation",
    "file_id": "cfile_682d514p2e0881918d49b0af7e13557f02",
    "container_id": "cntr_682d514p2e08e19341d9dcc4c2a1a2ac2e08af",
    "filename": "cfile_682d514p2e08e19381394f0e7e13557f02.png",
    "index": 0, "start_index": 0, "end_index": 0
  }]
}
// download bytes
GET /v1/containers/{container_id}/files/{file_id}/content
// list files
GET /v1/containers/{container_id}/files
```

Container fields observed: `id`, `name`, `memory_limit`, `file_ids`, `last_active_at`, `status`; a literal `expires_after` field is plausible (matches the 20-min rule) but not literally confirmed in fetched text.

---

## 2. Claude / Anthropic

Sources: `platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool`, `platform.claude.com/docs/en/build-with-claude/files`, `support.claude.com/en/articles/12111783-create-and-edit-files-with-claude`, `support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them`, `support.claude.com/en/articles/11869629-use-claude-with-android-apps`, `claude.com/blog/create-files`. Plus local reference: `docs/research/claudeai-component-spec-2026-07-10.md` (128 UI screenshots + live crawl, artifact-viewer anatomy).

**1. Execution environment — two distinct products**

_API code execution tool_ (`code_execution_20250825`/`...20260120`/`...20260521`): Linux container, x86_64, Python 3.11, **5 GiB RAM, 5 GiB disk, 1 CPU**. **Internet access completely disabled** — no outbound requests, no runtime `pip install`; only preinstalled packages available (pandas, numpy, scipy, scikit-learn, statsmodels, matplotlib, seaborn, pyarrow, openpyxl, xlsxwriter, xlrd, pillow, python-pptx, python-docx, pypdf, pdfplumber, reportlab, sympy, tqdm, etc., plus CLI tools unzip/7zip/ripgrep/sqlite). Fresh container per request by default; reusable across turns by passing back the prior response's `container.id`; with `code_execution_20260120`+, Python REPL variable state persists across reused-container calls. Checkpointed after ~5 min idle, restorable up to **30 days** via container ID. Programmatic tool calling (`...20260521`) adds a **90-second per-REPL-cell wall-clock limit**. Billing: free when combined with `web_search_20260209+`/`web_fetch_20260209+`; otherwise time-billed, 5-min minimum, 1,550 free org-hours/month then $0.05/hr.

_Consumer claude.ai product_ ("Create and edit files with Claude") is explicitly a **separate environment** — "a private computing environment directly in claude.ai." Unlike the API tool, **network access is enabled** by default (flagged to users as a risk: "gives Claude internet access... which may put your data at risk"); Team/Enterprise admins can restrict to no-egress / package-managers-only / package-managers-plus-allowlisted-domains via Organization Settings > Capabilities > Network access. No numeric RAM/disk/Python-version/timeout is officially documented for this consumer sandbox (a third-party teardown by Simon Willison claims Ubuntu 24.04, ~9 GB RAM, Python 3.12.3, Node 18.19.1 — **explicitly unofficial, not usable as fact**).

**2. File creation flow / Files API**

- Model writes files via `text_editor_code_execution` (`create`/`str_replace`/`view`) and/or `bash_code_execution`. Bash-created files appear as entries with a `file_id` inside `bash_code_execution_tool_result.content.content[]`.
- File ID format: `file_011CNha8iCJcU1wXNR6q4V8w`-style; containers/tool-use IDs use `srvtoolu_...`.
- **Files API** (`https://api.anthropic.com/v1/files`, requires `anthropic-beta: files-api-2025-04-14`):
  - `POST /v1/files` (upload) → `{id, type:"file", filename, mime_type, size_bytes, created_at, downloadable}`. User-uploaded files have `downloadable: false`.
  - `GET /v1/files` (list, paginated), `GET /v1/files/{id}` (metadata), `DELETE /v1/files/{id}`.
  - `GET /v1/files/{id}/content` (download bytes) — **only works when `downloadable: true`**, which is true only for skill/code-execution-created files, never for user uploads (400 error otherwise).
- Retention: files persist until explicitly deleted at the Files API level; container-level execution artifacts retained up to 30 days.
- Size caps: **500 MB/file, 500 GB/org** at the API level. Filename constraints: 1–255 chars, forbidden `< > : " | ? * \ /` and control chars.
- Files API ops are free; only file bytes used as model input are billed as input tokens. **Not eligible for Zero Data Retention.**
- Consumer product caps (separate from the 500 MB API limit): **30 MB per file** for both uploads and downloads; PDFs over 30 MB can still be processed via the compute environment without loading into context. Supported creation formats: .xlsx, .pptx, .docx, PDF, PNG data-viz images; can read CSV/TSV and other data files.

**3. Chat UX in claude.ai**

- Toggle: Settings > Capabilities > "Code execution and file creation" (Free/Pro/Max); Org Settings > Capabilities for Team/Enterprise.
- Users can download generated files or save directly to Google Drive. On mobile, tapping Download opens the file in the system preview or an associated app (e.g., Word for .docx).
- **No official documentation of file-card visual anatomy, in-progress indicators, or error-state UI in official Anthropic sources** — this level of pixel/UX detail is undocumented, same gap as OpenAI. What we do have, from our own live-crawl reference (`docs/research/claudeai-component-spec-2026-07-10.md`), is the **Artifact** viewer's anatomy in detail (below) — Anthropic support docs explicitly note the file-creation UX "may look slightly different" from artifacts but don't spell out how.

**4. Artifacts vs files split**

- Support docs: Claude creates an **Artifact** (not a downloadable file) when content is "significant and self-contained, typically over 15 lines," something to "edit, iterate on, or reuse outside the conversation," and "stands on its own." Common types: documents, code, HTML sites, SVG, diagrams, React components.
- Confirmed live (our own crawl, `claudeai-component-spec-2026-07-10.md` §2): Artifact panel opens as a right-hand split pane (~40–45% width); header has an eye/code toggle pill, title + muted `· TYPE` label, and type-dependent right-side controls (Copy+dropdown [Download as Markdown/PDF]+Publish for long-form documents; Copy+refresh+expand+close for renderable code/HTML; plain download+refresh+close for PDF artifacts, no Copy/Publish). Small/simple artifacts (e.g. a tiny checklist) can render **inline in the chat flow** without ever opening the side panel, fully interactive (checkbox ticks live-update a progress counter). In-chat artifact **cards** show a kind-tinted icon tile, title + `{Kind} · {TYPE}` subtitle, and a Download button; multiple artifacts in one message each get their own card plus a single "Download all" button.
- Versioning is documented specifically for Markdown-type artifacts (select text → "Edit with Claude" → switch between versions via a version selector); no general cross-type versioning mechanism is documented. A persistent catalog exists at `claude.ai/catalog/artifacts` across conversations, supporting reopen/iterate/publish-as-link.
- Claude reads a **frontend-design skill** automatically before producing any HTML artifact (visible as a tool-step line in the reasoning trace, live crawl) — explains why HTML artifacts consistently look designed rather than default-browser-styled. This is a real backend behavior, not UI chrome.

**5. Cross-surface**

- "Code execution and file creation is available to all Claude users (Free, Pro, Max, Team, Enterprise) on the web, Claude Desktop, and Claude Mobile" (same Settings > Capabilities toggle). Mobile file-open behavior differs (system preview/associated app instead of in-app viewer); mobile upload limit stated as 30 MB/file, up to 20 files/conversation (same as web per the Android help article). The original blog rollout launched web/desktop-only for Max/Team/Enterprise, Pro following "in the coming weeks," reaching paid-plan GA by **Oct 21, 2025**; mobile availability confirmed later via the mobile support article. No official source documents differing per-surface resource/time limits — only the download/rendering affordance differs by client.

**6. API wire shapes**

```json
// tool definition (no parameters)
{ "type": "code_execution_20250825", "name": "code_execution" }

// bash tool_use / tool_result
{ "type": "server_tool_use", "id": "srvtoolu_01B3...", "name": "bash_code_execution",
  "input": { "command": "ls -la | head -5" } }
{ "type": "bash_code_execution_tool_result", "tool_use_id": "srvtoolu_01B3...",
  "content": { "type": "bash_code_execution_result", "stdout": "...", "stderr": "", "return_code": 0, "content": [] } }
// content.content[] holds one entry per generated file, each with a file_id

// text-editor create
{ "type": "server_tool_use", "id": "srvtoolu_01D5...", "name": "text_editor_code_execution",
  "input": { "command": "create", "path": "new_file.txt", "file_text": "Hello, World!" } }
{ "type": "text_editor_code_execution_tool_result", "tool_use_id": "srvtoolu_01D5...",
  "content": { "type": "text_editor_code_execution_create_result", "is_file_update": false } }

// response-level container
{ "container": { "id": "...", "expires_at": "..." } }   // pass container:"<id>" on next call to reuse

// input file blocks (file_id IN)
{"type":"document","source":{"type":"file","file_id":"file_..."}}       // PDF/text
{"type":"image","source":{"type":"file","file_id":"file_..."}}
{"type":"container_upload","file_id":"file_..."}                        // feeds sandbox

// downloading generated bytes (file_id OUT)
GET https://api.anthropic.com/v1/files/{file_id}/content
  header: anthropic-beta: files-api-2025-04-14   // only if downloadable:true
```

Error codes across sub-tools: `unavailable`, `execution_time_exceeded`, `invalid_tool_input`, `too_many_requests`; bash-specific `output_file_too_large`; text-editor-specific `file_not_found`. No partial streaming of tool results — each result block arrives whole in one `content_block_start` event.

---

## 3. Gemini (gemini.google.com + API)

Sources: `ai.google.dev/gemini-api/docs/code-execution`, `ai.google.dev/api/files`, `ai.google.dev/gemini-api/docs/files`, `ai.google.dev/gemini-api/docs/interactions/code-execution`, `support.google.com/gemini/answer/13275745`, `support.google.com/gemini/answer/14903178`, `support.google.com/gemini/answer/16047321`, `developers.googleblog.com/gemini-20-deep-dive-code-execution/`.

**1. Execution environment**

- Python only — "Gemini is only able to execute code in Python."
- **Max runtime: 30 seconds per execution**; on sandbox error the model may auto-retry/regenerate up to **5 times** without re-prompting.
- Sandbox type, network policy, memory/disk quotas: **not documented anywhere in official sources checked — genuinely undisclosed**, not merely unresearched.
- Session persistence beyond the in-turn 5-retry window: not documented; cross-turn persistence unconfirmed.
- "You can't install your own libraries" — preinstalled set explicitly named includes NumPy, Pandas, Matplotlib (docs page states a fuller ~40-package roster exists but the complete list wasn't independently re-verified in this pass — re-fetch before quoting exhaustively).
- File I/O: file input (CSV/text) supported; image/graph output via Matplotlib. Image output with code execution requires both Code Execution and Thinking enabled on Gemini-3-Flash-class models.

**2. File creation flow**

- Response `Part` fields: `executableCode.language` / `executableCode.code`; `codeExecutionResult.outcome` (`OUTCOME_UNSPECIFIED | OUTCOME_OK | OUTCOME_FAILED | OUTCOME_DEADLINE_EXCEEDED`) / `codeExecutionResult.output`.
- Generated images (e.g. Matplotlib charts) return as **inline base64**: `inlineData.mimeType` + `inlineData.data` — no file reference/URI for code-execution-generated output.
- `fileData` (`mimeType` + `fileUri`, form `files/{file_id}`) is for **input** references to previously-uploaded Files API assets, not output.
- Separate **Files API**: upload returns a `uri`/`fileUri`; **default expiry 48 hours**, after which auto-deleted (metadata still gettable during the window, but not downloadable); size caps **2 GB/file, 50 MB for PDFs**, recommended once payload exceeds 100 MB; **20 GB per-project storage cap**; free; management via `files.get/list/delete`. Full MIME-type matrix not fully enumerated in fetched content — re-check before quoting exhaustively.
- A **newer "Interactions API"** variant (`ai.google.dev/gemini-api/docs/interactions/code-execution`) uses a different step-based schema (`step.type`, `step.arguments.code`, `step.result`, `previous_interaction_id`) layered alongside the classic `generateContent` Part schema — which is canonical/current was not fully reconciled in this pass; **flag as a documentation-surface discrepancy** worth a follow-up read before committing to one schema.

**3. Chat UX**

- "You can create formatted files directly from your Gemini Apps conversations... download directly to device or export to Google Drive." Chart generation is prompt-triggered (e.g. "create a chart from that data") and rendered inline.
- No official page documents a distinct "file card" UI element, error-state UX, or explicit progress/"thinking-steps" indicator description — capability is documented, UI chrome is not.

**4. Canvas**

- Distinct collaborative surface: "collaborate with Gemini in Canvas to create or edit a doc, app, slides, or code," with auto-save. Export paths are explicit: text → new Google Doc; slides → Google Slides; **Python code → Google Colab** (Canvas's code-export path, distinct from the API's inline code-execution result). Canvas also generates Audio Overviews, quizzes, infographics, web pages, and visuals from documents. No documented versioning/version-history UX.

**5. Cross-surface**

- Canvas help articles exist in parallel Android/iOS/Desktop variants (suggests parity, but no explicit parity statement — **INFERRED**). No confirmation the consumer app's internal pipeline uses the identical `executableCode`/`codeExecutionResult`/`inlineData` wire format as the raw API — **INFERRED**, plausible but unconfirmed.

**6. Wire shapes**

```
Part {
  executableCode: { language: string, code: string }
  codeExecutionResult: { outcome: Outcome, output: string }
  inlineData: { mimeType: string, data: string(base64) }
  fileData: { mimeType: string, fileUri: string }   // "files/{file_id}"
}
Outcome = OUTCOME_UNSPECIFIED | OUTCOME_OK | OUTCOME_FAILED | OUTCOME_DEADLINE_EXCEEDED
```

---

## 4. Grok and Microsoft Copilot (brief)

**Grok (x.ai)**: `docs.x.ai/developers/tools/code-execution` documents a server-side `code_execution` tool — "sandboxed Python environment with common libraries pre-installed, including... NumPy, Pandas, Matplotlib, and SciPy." A separate Files capability (`docs.x.ai/developers/files`) lets users upload/reference files; attaching a file auto-activates an `attachment_search` server-side tool for agentic document search. No official documentation found for exact response wire-shape field names or for grok.com's consumer-chat file-card/download UI — **not confirmed**, not guessed.

**Microsoft Copilot**: Best-documented surface is **Copilot Studio / M365 Copilot declarative-agent "Code Interpreter"** (`learn.microsoft.com/en-us/microsoft-copilot-studio/code-interpreter-for-prompts`, `.../microsoft-365/copilot/extensibility/code-interpreter`): runs generated Python, supports Excel as both input and output, "automatically presents a download link in the response," files "temporarily hosted... within the active session." This is an agent-builder capability — whether plain consumer chat at copilot.microsoft.com (non-agent-builder) exposes identical code-interpreter/file-download UX is **not confirmed** by official docs.

---

## 5. Comparison table

|                                | ChatGPT (API)                                               | ChatGPT (consumer, docs gap) | Claude API                                           | Claude consumer                  | Gemini API                                      | Gemini consumer                     |
| ------------------------------ | ----------------------------------------------------------- | ---------------------------- | ---------------------------------------------------- | -------------------------------- | ----------------------------------------------- | ----------------------------------- |
| Sandbox disclosed              | VM, unnamed runtime                                         | unknown                      | Linux container, named specs                         | undocumented specs               | undisclosed                                     | undisclosed                         |
| Idle/session TTL               | 20 min inactivity                                           | unknown                      | ~5 min checkpoint, 30-day restore                    | undocumented                     | not documented (30s/exec cap only)              | undocumented                        |
| Network in sandbox             | undocumented                                                | unknown                      | **disabled**                                         | **enabled** (admin-restrictable) | undocumented                                    | undocumented                        |
| RAM/disk                       | 1/4/16/64 GB tiers, disk undocumented                       | unknown                      | 5 GiB / 5 GiB                                        | undocumented                     | undocumented                                    | undocumented                        |
| File output mechanism          | container file + citation annotation                        | file card (UI undocumented)  | Files API `file_id`, `downloadable` flag             | file card (UI undocumented)      | inline base64 (`inlineData`)                    | inline / download (UI undocumented) |
| File size cap                  | not doc'd (API); ~512 MB product upload (WebSearch snippet) | same                         | 500 MB/file, 500 GB/org (API) / **30 MB** (consumer) | 30 MB                            | 2 GB/file, 50 MB PDF                            | same as API presumably              |
| File expiry                    | 20-min container                                            | unknown                      | persists until deleted (Files API); 30-day container | unknown                          | **48h** (Files API)                             | unknown                             |
| Editable surface               | Canvas (versioned, diff view)                               | same                         | Artifacts (versioned for Markdown only)              | same                             | Canvas (export-based, no versioning documented) | same                                |
| Cross-surface parity statement | none found                                                  | —                            | explicit: "available on web, Desktop, Mobile"        | —                                | none found (parallel help pages only)           | —                                   |

---

## 6. Our implementation (verified from repo, not re-derived)

Pipeline: chat request with `code_execution:true` → E2B tools (`write_file`/`run_code`, non-Anthropic/Google providers) or provider-native containers (Anthropic code-execution tool / OpenAI Code Interpreter via `apps/web/lib/server/container-files.ts`) or Google's native code execution → all sources funnel through one shared persistence core, `apps/web/lib/server/generated-file-persist.ts:persistGeneratedFileBytes()`, which stores bytes to R2 (`storeMedia`), catalogs them in the `media_assets` table (`apps/web/db/neon/0036_media_assets.sql`), and returns a `GeneratedFileWire` descriptor (`id, file_name, mime_type, uri, byte_count, kind, checksum_sha256`) with a **same-origin `/api/files/{id}` URI** — the only URL form the web renderer's inline gates (PDF/image/spreadsheet) accept.

The descriptor streams to clients as an `x_generated_files` SSE delta; web renders it via `packages/unified-chat/src/components/MessageGeneratedFiles.tsx` → `GeneratedFileCard.tsx` (shared package, also used by mobile). Card anatomy: 12×12 thumbnail-or-kind-icon (color-coded by type: pdf/docx/xlsx/csv/pptx/archive/image/html), title + status badge (running/failed/complete/pending with icon+color), kind label + byte-count + checksum-short (SHA-256 first 12 hex) + retention label, privacy/provider/source-surface pill row, then a bottom action row (Preview / Download / Share / "Open source session" link) gated by `canDownload && isComplete`. Download failures render inline as `role="alert"` text under the card, not silent. Mobile parses the same delta (`apps/mobile/stores/chat/chatExecutionStore.ts`, `apps/mobile/services/streaming.ts`) against a shared Zod contract (`packages/services/src/cloud-contracts/generated-files.ts`); desktop consumption is task #83, in progress. Auth: web fetches via same-origin cookie; hosts needing explicit auth (desktop Tauri) provide `ChatHostBridge.fetchCloudFile` for a Bearer-JWT fetch.

Sandbox lifecycle: E2B pause/resume per conversation (`sandbox.pause()`/`Sandbox.connect(sandboxId)`, per `docs/research/e2b-sandbox-api-2026-07-10.md`), not create-per-call; Base plan 1h / Pro plan 24h max run ceilings. No versioning of generated files or artifacts. No web Library/gallery page for past generated files (nothing like ChatGPT's Library or Claude's artifact catalog). R2 env is missing in dev, so persistence fails closed there with an honest inline note rather than silent loss — by design, not a bug.

---

## 7. Ranked gap list — "to match top apps"

### (a) UX gaps — file card anatomy, progress states, previews

1. **No in-progress/streaming state while code runs.** Claude's live crawl shows a streaming code/text preview scrollable box before "Done," ChatGPT's Canvas shows execution status; our `GeneratedFileCard` has a `presentation.isRunning` badge state defined but nothing confirms a live-updating card appears _during_ E2B execution rather than only after the file is persisted — verify and, if missing, wire the SSE delta to emit a `pending`/`running` file entry before bytes exist.
2. **No inline preview thumbnails for images/charts in the message stream itself** (as opposed to inside the card). Claude renders small artifacts fully inline in the chat flow (interactive checklist widget); we always render via the `GeneratedFileCard`, no equivalent lightweight inline path for e.g. a single small chart PNG.
3. **No "Download all" for multi-file turns.** Claude explicitly has a "Download all" button when a message produces multiple artifacts/files; our `MessageGeneratedFiles` renders N independent cards with no bulk action.
4. **No visible retry/regenerate on a failed generated file**, only a static inline error line (`Download failed: {message}`). ChatGPT/Claude's broader chat retry affordance exists at the message level but not scoped to just the failed file.
5. **No explicit distinction UI between "Artifact-equivalent" (editable/renderable) output and "downloadable file" output** the way Claude's own docs flag this ambiguity for users — we conflate everything into one `GeneratedFileCard` type regardless of whether the underlying content is renderable (HTML/code) vs. purely a binary deliverable (xlsx/docx).

### (b) Capability gaps — formats, sandbox limits, link-expiry handling

6. **No document-format-specific behaviors called out anywhere in our pipeline** — e.g. Claude's Files API `downloadable` flag distinguishes user-uploads from generated files at the API level; our `media_assets` model doesn't appear (from the persist-core comment) to track an equivalent "was this a model-generated output vs. a user-uploaded input" flag beyond the `kind` field — worth confirming this distinction is enforced for auth/expiry purposes.
7. **No documented/enforced link-expiry policy** matching vendors' container/file TTLs (OpenAI 20-min container, Gemini 48h Files API, Anthropic 30-day container). Our `/api/files/{id}` URIs appear to be durable (backed by R2 + `media_assets`), which is actually _better_ than the ephemeral vendor defaults, but there's no visible retention/expiry field surfaced to the user (Claude shows a `retentionLabel` slot in the card that may or may not be populated — verify it's wired, not just a placeholder).
8. **20 MB max generated-file size** (`MAX_GENERATED_FILE_BYTES` in `generated-file-persist.ts`) is well below Anthropic's API cap (500 MB) and Gemini's (2 GB), though close to Claude's _consumer_ cap (30 MB) and above OpenAI's per-type product caps (images 20 MB, CSV 50 MB). Confirm 20 MB is an intentional product ceiling (R2/latency cost control) rather than an accidental gap versus the consumer-product norm of 30 MB.
9. **No E2B sandbox network-access control surfaced to org admins**, unlike Anthropic's three-tier Org Settings > Capabilities > Network Access (no-egress / package-managers-only / allowlisted-domains) — worth for Team/Enterprise parity once that tier exists.

### (c) Architecture gaps — versioning, library

10. **No versioning for generated files or artifact-equivalents.** ChatGPT Canvas has full version history + diff view; Claude has version-selector for Markdown artifacts. Ours are single-shot: a regenerate produces a new independent file/message, no version chain.
11. **No web Library/gallery page.** ChatGPT has a Library (Settings > Storage) and Claude has a persistent artifact catalog (`claude.ai/catalog/artifacts`) for reopening/iterating/publishing past outputs across conversations. We have none — generated files are only reachable by scrolling back to the originating message.
12. **No cross-file/session linkage UI.** `GeneratedFileCard` has an `onOpenSourceSession` slot, but nothing in the vendor research suggests we're behind here — this is closer to parity than the other gaps; deprioritize.

**Most actionable 10, in priority order**: #10 (versioning) and #11 (Library page) are the biggest structural gaps since every top vendor has at least one; #1 (in-progress state) and #3 (Download all) are cheap, high-visibility UX wins already partially scaffolded (`isRunning` badge exists, `MessageGeneratedFiles` already loops files — bulk action is a small addition); #2 (inline small-artifact rendering) and #5 (artifact-vs-file distinction) require a real product decision since we don't currently have an "Artifact" concept distinct from "generated file" at all — that's arguably the single largest conceptual gap versus Claude/ChatGPT/Gemini, which all separate an editable/renderable surface from a downloadable-file surface; #7/#8/#9 (expiry policy, size ceiling, network-access admin control) are policy/config gaps, lower engineering lift; #4 and #12 are minor UX and mostly already scaffolded.

---

## 8. Recommended implementation waves

Sequenced by dependency and blast radius, not strictly by the priority order in §7 — some high-priority items (e.g. #5, the Artifact/file split) are foundational and should land before the UX polish that depends on it, even though they're more work.

**Wave A — Artifact/file conceptual split (foundational, unblocks B–D)**
Introduce a distinct "renderable/editable" surface separate from `GeneratedFileCard`'s binary-deliverable framing (gap #5). Concretely: extend the `x_generated_files` wire contract (or add a sibling `x_artifacts` delta) with a `renderable: boolean` or `surface: 'artifact' | 'file'` field set at persistence time in `generated-file-persist.ts`, based on MIME/kind (HTML, code, Markdown, SVG → artifact; xlsx/docx/pptx/pdf/csv/zip → file). This doesn't require a new UI yet — it's the data-model prerequisite everything else in this list builds on. Without this, #2 and #11 have nowhere to attach.

**Wave B — In-flight status + bulk actions (cheap, high-visibility, already scaffolded)**

- #1: wire `presentation.isRunning` to actually fire during E2B/provider execution, before bytes are persisted — needs the SSE stream to emit a `pending` `x_generated_files` entry (or reuse the existing tool-call-timeline UI) rather than only emitting after `persistGeneratedFileBytes()` succeeds.
- #3: add a "Download all" action in `MessageGeneratedFiles.tsx` when `files.length > 1`, mirroring Claude's per-message bulk button.
- #7/#8: confirm and, if needed, wire `presentation.retentionLabel` to a real value (R2 object lifetime / `media_assets` TTL if any), and explicitly document the 20 MB cap as an intentional ceiling (or raise it toward Claude's 30 MB consumer norm) rather than leaving it unstated.

**Wave C — Renderable-artifact side panel (depends on Wave A)**
Build the actual editable/preview side-panel surface for `renderable: true` outputs (HTML, code, SVG, Markdown) — eye/code toggle, Copy/Download, refresh, close, matching the anatomy documented in §2 (Claude) and the Canvas-equivalent behavior in §1/§3 (ChatGPT/Gemini). This is the largest single lift in the list and is where "make AGI apps perform the same way" is most visibly tested. Land HTML/code artifacts first (highest usage, matches Claude's default), Markdown/document artifacts second (needs the Copy+Download-as-Markdown/PDF dropdown), inline-small-widget rendering (#2, e.g. an interactive checklist) last since it's the highest-polish, lowest-frequency case.

**Wave D — Library/gallery page + versioning (depends on A, benefits from C)**

- #11: a `/library` (or equivalent) page listing all generated files/artifacts across a user's conversations, backed by the existing `media_assets` table (already has the rows; this is a listing UI + query, not new storage).
- #10: versioning is the deepest architectural change — start scoped, matching Claude's own scope-limiting (Markdown-artifact-only versioning), rather than attempting general version history across every artifact type in one pass. A version chain on `media_assets` (parent_asset_id) would let a regenerate replace-in-place with a version selector instead of always appending a new independent file.

**Wave E — Org/admin policy controls (lowest urgency, needs Team/Enterprise tier to exist)**

- #9: E2B sandbox network-access tiering (no-egress / package-managers-only / allowlist) surfaced in Org Settings, mirroring Anthropic's model. Defer until Team/Enterprise settings surface exists; no rush relative to A–D.

Waves A→D are the ones that materially close the gap against ChatGPT/Claude/Gemini; Wave E is compliance/governance polish for a later tier.

## Post-research verification (coordinator, 2026-07-10)

Gap items 3 and 8 flagged "verify" are CONFIRMED: no producer in the repo ever sets
`isRunning` or `retentionLabel` on `GeneratedFilePresentation` (only `isRunning:` hit
anywhere is ThinkingBlock's unrelated prop). Both card slots are unwired placeholders —
the running-state badge and retention label render dead code today.

## Wave A implementation note (2026-07-10)

Wave A landed at the contract level: `GeneratedFileWireSchema` now carries
`surface: 'artifact' | 'file'` plus `previewable: boolean`, both derived once,
server-side, at persistence time by `classifyGeneratedFile` in
`apps/web/lib/server/generated-file-persist.ts` (deterministic on mime +
extension) and persisted into `media_assets` metadata for Wave D filtering.
Both fields are optional-with-default (`file`/`false`) with `.catch` folding
unknown future surface values, so pre-classification payloads and older
client parses keep working.

Decision on images/charts (the case §8-A left open): raster images — e.g.
matplotlib chart PNGs — are `surface: 'file'` + `previewable: true`, NOT a
third surface value. Rationale from §1–2: ChatGPT delivers chart PNGs as
`container_file_citation` byte files that the chat UI happens to render
inline, and Claude likewise treats PNG outputs as downloadable files with
inline preview — neither routes them to the Canvas/Artifact editing surface,
because a raster has no source text for a panel to show or edit. A third
`surface` value would conflate ownership (which UI opens it) with rendering
affordance (can the client inline-render the bytes); `previewable` carries
the latter orthogonally. SVG is the deliberate exception: despite its
`image/*` mime it IS editable source text, so it classifies as `artifact`.
`previewable` is also true for pdf/docx/xlsx/pptx/csv, which the web app
already inline-renders (PDF viewer + shared docx/spreadsheet/presentation
renderers); archives and unknown binaries are the only `previewable: false`
class. `kind` is unchanged and stays the icon taxonomy.
