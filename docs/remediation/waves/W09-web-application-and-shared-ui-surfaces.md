# W9 — Web application and shared UI surfaces

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** The largest user-facing surface, batched as one pass because the items overwhelmingly touch the same trees — the composer, message list, artifact viewer, settings shell and the shared UI package. Doing them together means one loaded context covers video generation, aspect-ratio honesty, rich-format cards, the artifact editor, settings IA, accessibility and the design-token/i18n sweep instead of twenty re-entries. It runs after W8 because most of these surfaces render what routing produces (model badge, reasoning chip, research report, code execution, media options) and after W4 because the artifact editor cannot ship until the sandbox and runtime-bridge decision exists. It also clears the honesty defects that would otherwise be re-broken by the copy wave: roughly twenty reachable stub controls that 501, toast 'coming soon', or silently no-op.

**Size.** 178 items (1 critical, 29 high, 84 medium, 64 low); 167 open.

**Done when.** A generated video plays in a browser from persisted storage (media-src present, no provider auth header needed) and can be stopped mid-generation from the UI; every advertised image aspect ratio produces a distinct output size or the label is removed. No reachable web control returns 501, toasts 'coming soon', or no-ops — verified by a repo scan plus a click-through of the enumerated stub list — and /integrations, /apps, /skills and /admin each have a coherent entry and exit. Developer API serves /v1 from the advertised host with a published OpenAPI artifact and contract tests, or the documentation is downgraded to match. Artifacts are editable with real version numbers, restore and per-viewer authorization, publishing has TTL/quota/view audit, and an ownership violation returns 403. Sharing offers scope, expiry and revocation review. Projects, schedules, deep research, AGI Work and knowledge upload each either implement the surface or stop presenting it: no hardcoded read-only clarification card, no silent 16k truncation, no null summary. Rich-format card parsers have round-trip tests proving no content is dropped. Accessibility: keyboard, screen-reader, focus, reduced-motion, high-contrast and zoom pass on the primary web flows; popovers are portalled and do not clip at 320px; z-index and pagination/debounce constants come from shared tokens with a guard; the shared UI package renders non-English strings from the locale bundle. Unmounted and duplicate components are inventoried and either wired or deleted.

| ID                    | Sev      | Item                                                                                                                                                                                                                                                        | Effort |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [WEB-02](#web-02)     | CRITICAL | Generated videos cannot render on web — CSP has no media-src and the provider URI needs an auth header a browser cannot send                                                                                                                                | M      |
| [AI-57](#ai-57)       | HIGH     | No global search across chats, projects, artifacts, files, connectors, settings or developer sessions                                                                                                                                                       | XL     |
| [SEC-81](#sec-81)     | HIGH     | Password-manager autofill hardening (CONNECTOR-FORM-PASSWORD-AUTOFILL-01) was never propagated to ConnectorsPage's MCP auth-token field, which would leak the user's account password to an arbitrary third-party MCP server if that page becomes reachable | S      |
| [UI-03](#ui-03)       | HIGH     | Model badge lies after server-side substitution, pin-to-model is unwired, and two ReasoningAccordion implementations coexist                                                                                                                                | M      |
| [UI-07](#ui-07)       | HIGH     | Web artifacts are read-only while the product calls them editable; version always reports 1 and there is no select-and-edit, restore, or comment path                                                                                                       | XL     |
| [UI-11](#ui-11)       | HIGH     | Settings information architecture is incomplete: unmounted accessibility control, settings with readers but no writers, missing sections, and no Help route                                                                                                 | XL     |
| [UI-14](#ui-14)       | HIGH     | Accessibility coverage is five web routes and nothing else — no keyboard, screen-reader, focus, reduced-motion, high-contrast or zoom testing on any surface                                                                                                | XL     |
| [UI-26](#ui-26)       | HIGH     | Large text pastes flood the composer instead of converting to a 'Pasted text' attachment (mobile already ships the fix)                                                                                                                                     |        |
| [UI-27](#ui-27)       | HIGH     | The shared composer desktop renders has no image/video generation mode at all                                                                                                                                                                               |        |
| [UI-28](#ui-28)       | HIGH     | Web's primary chat surface bypasses the shared chat UI package, running a 2.4–2.5x larger fork                                                                                                                                                              | XL     |
| [UI-77](#ui-77)       | HIGH     | Headless transcript, event and approval state has never been extracted from the DOM renderers                                                                                                                                                               | XL     |
| [UI-81](#ui-81)       | HIGH     | Four independently-authored composer implementations across web, shared unified-chat, mobile and the Chrome extension with no shared behaviour contract                                                                                                     | XL     |
| [UI-82](#ui-82)       | HIGH     | Three independent, non-shared markdown rendering engines across web+desktop, mobile and the Chrome extension                                                                                                                                                | XL     |
| [UI-94](#ui-94)       | HIGH     | Web's primary chat surface bypasses the shared unified-chat package, running a 2.4–2.5x larger fork with no structural mechanism to keep the two in sync                                                                                                    | XL     |
| [WEB-03](#web-03)     | HIGH     | Generated videos are never persisted — only an expiring provider URL is stored, so a paid generation is lost on tab close                                                                                                                                   | L      |
| [WEB-04](#web-04)     | HIGH     | No way to stop a video generation — the fully implemented cancel route has zero client callers and Stop is suppressed in video mode                                                                                                                         | S      |
| [WEB-109](#web-109)   | HIGH     | One-chat flow does not support ordinary chat plus selected/reference files without forcing a separate experience                                                                                                                                            |        |
| [WEB-11](#web-11)     | HIGH     | Developer API is unusable as documented: structured outputs hard-rejected, retired /api/agents paths still referenced, no SDK/webhooks/Files API, no authoritative OpenAPI artifact                                                                         | XL     |
| [WEB-110](#web-110)   | HIGH     | Cloud Code's fully-built approval-gated agent-turn backend has no UI entry point; web only exposes a raw command shell                                                                                                                                      | L      |
| [WEB-118](#web-118)   | HIGH     | WebSidebar renders a second, incomplete and self-inconsistent nav rail on the live /chat/code route                                                                                                                                                         | M      |
| [WEB-12](#web-12)     | HIGH     | Reachable production web controls still return 501, toast 'coming soon', or silently no-op — roughly 20 stub markers remain                                                                                                                                 | L      |
| [WEB-127](#web-127)   | HIGH     | Web-created artifacts never sync to the cloud (push path missing), the gallery falsely claims account-scoped storage, and Library renders artifact-class files through the plain file card                                                                  | L      |
| [WEB-14](#web-14)     | HIGH     | Connector directory UI advertises providers that cannot connect, and its permission/scope surfaces are decorative                                                                                                                                           | L      |
| [WEB-15](#web-15)     | HIGH     | Deep Research web: no plan approval, dead Report tab on Anthropic models, literal Markdown rendering, no server-side resume                                                                                                                                 | XL     |
| [WEB-31](#web-31)     | HIGH     | Skills/Plugins directory is a preview catalogue with no install, permission-consent, publish or uninstall lifecycle                                                                                                                                         | XL     |
| [WEB-34](#web-34)     | HIGH     | Web-created artifacts never push to the cloud — sync is pull-only, so artifacts live in one browser's localStorage                                                                                                                                          |        |
| [WEB-35](#web-35)     | HIGH     | Artifacts gallery nav copy falsely claims 'account-scoped' storage for artifacts that are browser-local only                                                                                                                                                |        |
| [WEB-37](#web-37)     | HIGH     | Collapsed-sidebar 'Settings' gear does not open Settings — it routes to the dead-end /settings/voice sub-page                                                                                                                                               | S      |
| [WEB-38](#web-38)     | HIGH     | WebSidebar renders a second, incomplete 2-item nav rail on the live /chat/code route, and CloudCodePage bypasses WebAppShell                                                                                                                                |        |
| [WEB-53](#web-53)     | HIGH     | Connector browse/connect/add/disconnect is implemented twice (ConnectorsPage vs settings-modal ConnectorsPanel) and has already drifted three ways                                                                                                          |        |
| [AI-46](#ai-46)       | MEDIUM   | No context-window usage visibility in the web chat composer; older turns are silently trimmed                                                                                                                                                               | M      |
| [DOCS-23](#docs-23)   | MEDIUM   | AGI Work and the scheduling/task surfaces carry no maturity or beta disclosure anywhere                                                                                                                                                                     | S      |
| [INFRA-57](#infra-57) | MEDIUM   | Unverified whether a schedule bound to a soft-deleted conversation keeps firing or orphans                                                                                                                                                                  | S      |
| [SEC-80](#sec-80)     | MEDIUM   | Multi-factor authentication is TOTP-only — no passkey/WebAuthn, no SMS MFA, no trusted-device list                                                                                                                                                          | L      |
| [UI-01](#ui-01)       | MEDIUM   | Three rich-format card parsers (Comparison/Steps/Calculation) are unaudited for the content-dropping bug proven in RecipeCard                                                                                                                               | M      |
| [UI-02](#ui-02)       | MEDIUM   | Chat message surface gaps: no camera capture, no per-message report, no image carousel, no accessible interactive tables                                                                                                                                    | L      |
| [UI-04](#ui-04)       | MEDIUM   | Web search has no persistent on-screen indicator, no mode control, unimplemented filters, and no vertical result cards                                                                                                                                      | L      |
| [UI-08](#ui-08)       | MEDIUM   | Live artifacts (refresh policy, connector binding, refresh worker) are approved but unbuilt                                                                                                                                                                 | XL     |
| [UI-10](#ui-10)       | MEDIUM   | Personalization is fragmented across three incompatible vocabularies, the shared composer style is never persisted, and web lacks the tone controls mobile ships                                                                                            | L      |
| [UI-12](#ui-12)       | MEDIUM   | Keyboard shortcuts are read-only on web and defined by three disconnected default sets across surfaces                                                                                                                                                      | L      |
| [UI-13](#ui-13)       | MEDIUM   | Notifications: preferences are grouped by channel instead of event, only one channel has a real sender, and stored push tokens are wired to nothing                                                                                                         | L      |
| [UI-15](#ui-15)       | MEDIUM   | Loading, progress, error, retry and cancel states have never been swept across touched screens, and neither has dark/light consistency                                                                                                                      | L      |
| [UI-16](#ui-16)       | MEDIUM   | Remaining composer popovers are not portalled and will clip at small viewports                                                                                                                                                                              | S      |
| [UI-17](#ui-17)       | MEDIUM   | Shared mention menu is unmounted — file and skill pickers exist but are not wired to the composer                                                                                                                                                           | M      |
| [UI-18](#ui-18)       | MEDIUM   | An expired session mid-turn loses the work: no preserved pending turn, no single-use resume after sign-in                                                                                                                                                   | L      |
| [UI-21](#ui-21)       | MEDIUM   | Shared UI packages may still be unwired for i18n, re-injecting English into every consuming surface                                                                                                                                                         | XL     |
| [UI-22](#ui-22)       | MEDIUM   | Unmounted and duplicate production UI components are not inventoried or resolved                                                                                                                                                                            | L      |
| [UI-32](#ui-32)       | MEDIUM   | No path to reuse an existing Library file in a new conversation on web or desktop — no Library attach action and no 'Add from Library' composer entry                                                                                                       |        |
| [UI-41](#ui-41)       | MEDIUM   | Design-token package exists but its two heaviest adopters bypass it with hundreds of hardcoded hex colours                                                                                                                                                  |        |
| [UI-42](#ui-42)       | MEDIUM   | apps/web's no-hardcoded-colour guard is not wired into CI and currently fails with 4 real violations                                                                                                                                                        | S      |
| [UI-44](#ui-44)       | MEDIUM   | Chat response-format cards inject un-tokenized rainbow gradients per card type with no contrast pass                                                                                                                                                        | S      |
| [UI-45](#ui-45)       | MEDIUM   | Chat top bar uses an off-palette purple/blue gradient CTA and raw Tailwind greys instead of tokens                                                                                                                                                          | S      |
| [UI-46](#ui-46)       | MEDIUM   | Shared EmptyState primitive is barely adopted, and local duplicates re-introduce the exact contrast bug it documents as fixed                                                                                                                               |        |
| [UI-47](#ui-47)       | MEDIUM   | Accessibility component directory is entirely dead — no skip link in layout.tsx, and a mocked audit panel that always reports 'all checks passed'                                                                                                           |        |
| [UI-51](#ui-51)       | MEDIUM   | Web's follow-up message queue holds only one slot and cannot be edited in place                                                                                                                                                                             |        |
| [UI-56](#ui-56)       | MEDIUM   | No inline file-diff (red/green line) view in the chat transcript for file-edit tool results                                                                                                                                                                 |        |
| [UI-57](#ui-57)       | MEDIUM   | Citations render as a flat trailing chip row with only a native tooltip, and the Chrome extension has no citation UI at all                                                                                                                                 |        |
| [UI-58](#ui-58)       | MEDIUM   | Two parallel, architecturally inconsistent mechanisms decide whether to render a rich message card                                                                                                                                                          |        |
| [UI-71](#ui-71)       | MEDIUM   | Two same-named artifactStore Zustand stores and two ArtifactPanel implementations, with no documented split                                                                                                                                                 |        |
| [UI-74](#ui-74)       | MEDIUM   | Confirm-before-destructive-action dialog copy-pasted three times while the settings modal's connector disconnect still has no confirm step                                                                                                                  |        |
| [UI-79](#ui-79)       | MEDIUM   | No context-window usage visibility in the web chat composer                                                                                                                                                                                                 |        |
| [UI-86](#ui-86)       | MEDIUM   | Only Web has a Personal/Team workspace switcher; Desktop and Mobile have none                                                                                                                                                                               | M      |
| [UI-87](#ui-87)       | MEDIUM   | Shared unified-chat settings store carries six remaining dead field/setter pairs after toolAccessMode was deleted                                                                                                                                           | M      |
| [UI-89](#ui-89)       | MEDIUM   | No inline file-diff view for file-edit tool results in the chat transcript, though desktop already ships two diff viewers elsewhere                                                                                                                         | M      |
| [UI-91](#ui-91)       | MEDIUM   | Web and Desktop Capabilities settings lack Artifacts, code-execution, network-egress and tool-access-mode controls, with desktop's tab self-documenting them as unfinished                                                                                  | M      |
| [UI-92](#ui-92)       | MEDIUM   | Library has no 'reuse this file in a new conversation' action on web or desktop, though mobile already ships it                                                                                                                                             | M      |
| [UI-96](#ui-96)       | MEDIUM   | Shared unified-chat settings store ships dead field/setter pairs with zero readers and zero writers                                                                                                                                                         | S      |
| [WEB-06](#web-06)     | MEDIUM   | Image aspect-ratio labels lie: six advertised ratios collapse to three actual output sizes                                                                                                                                                                  | S      |
| [WEB-07](#web-07)     | MEDIUM   | /integrations and /apps form a dead navigation loop                                                                                                                                                                                                         | M      |
| [WEB-08](#web-08)     | MEDIUM   | Public /skills page is sitemap-indexed and the CTA target of marketing pages but redirects anonymous visitors straight to /login with no explanation                                                                                                        | S      |
| [WEB-100](#web-100)   | MEDIUM   | Capabilities settings expose only three memory toggles — no Artifacts, code-execution, network-egress or tool-access-mode controls                                                                                                                          |        |
| [WEB-101](#web-101)   | MEDIUM   | No accent colour or contrast control on web, though mobile and desktop both have one                                                                                                                                                                        |        |
| [WEB-112](#web-112)   | MEDIUM   | Legacy apps/web/shared/ tree (~198 files, ~130 knip-flagged unused) carries a superseded 'AI employee marketplace' product framing                                                                                                                          | L      |
| [WEB-113](#web-113)   | MEDIUM   | A second, orphaned 'share a conversation' backend duplicates the live one, over its own table and public route                                                                                                                                              | S      |
| [WEB-114](#web-114)   | MEDIUM   | A materially complete conversation-export feature (Markdown/PDF/DOCX) is fully built and totally unreachable inside the dead v3 cascade                                                                                                                     | M      |
| [WEB-116](#web-116)   | MEDIUM   | Dead second web chat-surface cascade (UnifiedChatPage/WebShellV3) still ships, injects memory with no temporary-chat guard, and carries a nav landmine                                                                                                      | L      |
| [WEB-117](#web-117)   | MEDIUM   | Left-nav session and project CRUD handlers are hand-duplicated between WebChatPage and WebAppShell                                                                                                                                                          | M      |
| [WEB-120](#web-120)   | MEDIUM   | WorkSessionPanel and TaskDetailPanel independently map the same agent-activity events and render the same event differently                                                                                                                                 | M      |
| [WEB-122](#web-122)   | MEDIUM   | MessageMetadata TypeScript interface has three independently-diverged declarations in apps/web alone                                                                                                                                                        | M      |
| [WEB-123](#web-123)   | MEDIUM   | UserSettings.tsx is a dead 584-line full-page settings implementation whose delete handler mislabels data erasure as account deletion                                                                                                                       | S      |
| [WEB-125](#web-125)   | MEDIUM   | /skills/[name] is an orphaned, unreachable detail route with a category-label map that has diverged 4 of 5 buckets from the live one                                                                                                                        | S      |
| [WEB-129](#web-129)   | MEDIUM   | Schedules have no project/workspace association and no thread-automation concept                                                                                                                                                                            | L      |
| [WEB-130](#web-130)   | MEDIUM   | Project deletion soft-deletes, so knowledge files are permanently orphaned and the ON DELETE CASCADE never fires; there is no restore path                                                                                                                  | M      |
| [WEB-131](#web-131)   | MEDIUM   | Web schedules surface parity gaps: no inline composer, no status filter, no running-state indicator, no auto-title, no close-vs-delete, recurring-by-default                                                                                                | L      |
| [WEB-16](#web-16)     | MEDIUM   | Projects: no templates, no export, no collaborators; Duplicate fires a toast but never refetches the list                                                                                                                                                   | L      |
| [WEB-17](#web-17)     | MEDIUM   | Project knowledge silently truncates uploads at ~16,000 chars with no extraction state shown, stores summary as hard-coded null, and never OCRs images                                                                                                      | L      |
| [WEB-18](#web-18)     | MEDIUM   | Schedules/Tasks UI: no starter templates, no timezone/DST preview, unmounted file-watch/cron/webhook surfaces, no exact-run deep links                                                                                                                      | L      |
| [WEB-19](#web-19)     | MEDIUM   | AGI Work is a composer mode without a goal-intake or plan surface: clarification cards are hardcoded read-only, no pause/resume, no per-task cost, no completion notification                                                                               | XL     |
| [WEB-23](#web-23)     | MEDIUM   | Web voice output is manual browser TTS only — no voice picker, no continuous turn-taking, no server TTS option                                                                                                                                              | L      |
| [WEB-24](#web-24)     | MEDIUM   | Office/document generation: no XLSX, no editing of existing Office files, and artifacts can download with the wrong Office MIME/extension                                                                                                                   | L      |
| [WEB-25](#web-25)     | MEDIUM   | File ingestion breadth is undecided: no Office/archive/audio/video/notebook handling, no OCR or table extraction, checksums computed but never compared                                                                                                     | XL     |
| [WEB-26](#web-26)     | MEDIUM   | 'Run code' toggle is lit for routed providers that have no execution tool, so it silently does nothing                                                                                                                                                      | M      |
| [WEB-30](#web-30)     | MEDIUM   | Artifact publishing has no TTL, quota, view audit or per-viewer auth, and an ownership violation surfaces as a 500 instead of a 403                                                                                                                         | M      |
| [WEB-32](#web-32)     | MEDIUM   | Sharing has no scope choice, no expiry choice, and no revocation review — link expiry is hardcoded to 7 days                                                                                                                                                | L      |
| [WEB-39](#web-39)     | MEDIUM   | UnifiedChatPage/WebShellV3 dead chat-shell cascade (~30 files) still compiles, carries an unguarded memory injection and an artifacts→/gallery routing landmine                                                                                             |        |
| [WEB-42](#web-42)     | MEDIUM   | A materially complete conversation-export feature (Markdown/PDF/DOCX) is built, barrel-exported and totally unreachable                                                                                                                                     |        |
| [WEB-43](#web-43)     | MEDIUM   | Legacy apps/web/shared/ tree (~198 files, ~130 knip-unused) still ships an earlier 'AI employee marketplace' product framing                                                                                                                                | L      |
| [WEB-44](#web-44)     | MEDIUM   | A second, fully-implemented 'share a conversation' backend and public route duplicates the live one with zero UI callers                                                                                                                                    |        |
| [WEB-45](#web-45)     | MEDIUM   | Projects hub search box and Create control vanish outside the default sort and in the Archived view                                                                                                                                                         |        |
| [WEB-46](#web-46)     | MEDIUM   | Two drifted, non-overlapping project-creation quick-start UIs (PROJECT_TEMPLATES vs PROJECT_PRESETS)                                                                                                                                                        |        |
| [WEB-50](#web-50)     | MEDIUM   | /settings/byok and /settings/sync have real content but zero in-app discovery path                                                                                                                                                                          |        |
| [WEB-54](#web-54)     | MEDIUM   | /skills/[name] is an orphaned, unreachable detail page whose hand-copied category-label map disagrees with the live one in 4 of 5 buckets                                                                                                                   |        |
| [WEB-61](#web-61)     | MEDIUM   | Visual design workspace (artboards, layers, properties, prototype/deck preview, versioning, export) approved but unbuilt; the CanvasWorkspace whiteboard stays unmounted                                                                                    | XL     |
| [WEB-67](#web-67)     | MEDIUM   | Library renders tool-generated artifact files through the plain file card, never the rich Artifact viewer                                                                                                                                                   |        |
| [WEB-69](#web-69)     | MEDIUM   | Schedules page has no inline/natural-language composer and no conversational-vs-manual creation choice                                                                                                                                                      |        |
| [WEB-73](#web-73)     | MEDIUM   | No non-destructive Close versus destructive Delete for a task run — /tasks offers no delete at all                                                                                                                                                          |        |
| [WEB-74](#web-74)     | MEDIUM   | No follow-up composer for steering a run from the /tasks detail panel                                                                                                                                                                                       |        |
| [WEB-76](#web-76)     | MEDIUM   | Completed research report reader has no nested table of contents                                                                                                                                                                                            |        |
| [WEB-77](#web-77)     | MEDIUM   | A reopened or standalone research report is a dead end — no follow-up composer for grounded Q&A                                                                                                                                                             |        |
| [WEB-81](#web-81)     | MEDIUM   | WorkSessionPanel has a static 'AGI Work session' header for every task and no options menu                                                                                                                                                                  |        |
| [WEB-82](#web-82)     | MEDIUM   | A conversation with a running task shows no status in the chat-history sidebar row                                                                                                                                                                          |        |
| [WEB-84](#web-84)     | MEDIUM   | Delete-conversation dialog names no dependent objects (schedules, published artifacts, generated media)                                                                                                                                                     |        |
| [WEB-86](#web-86)     | MEDIUM   | Suggested-prompt chips were deliberately deleted from the empty-state composer, against 4-of-4 competitor convergence                                                                                                                                       |        |
| [WEB-89](#web-89)     | MEDIUM   | No per-message timestamp anywhere in web's response action row, though the weaker Chrome extension renders one                                                                                                                                              | S      |
| [DOCS-25](#docs-25)   | LOW      | /features/plugins and /plugins tell contradictory 'is this real yet' stories with no cross-link                                                                                                                                                             | S      |
| [SEC-83](#sec-83)     | LOW      | Opening an HTML artifact logs a CSP violation from about:srcdoc                                                                                                                                                                                             | S      |
| [UI-05](#ui-05)       | LOW      | No typed weather or other vertical result card exists — only a generic tool timeline                                                                                                                                                                        | M      |
| [UI-06](#ui-06)       | LOW      | Tool-progress presentation is thin: one collapsed line instead of a step list, a double leading icon in the legacy fallback, and a generic 'M' badge for custom connectors                                                                                  | S      |
| [UI-19](#ui-19)       | LOW      | Conversation branching is not uniform across surfaces                                                                                                                                                                                                       | M      |
| [UI-20](#ui-20)       | LOW      | Design-token adherence for z-index and other shared scales is unverified and unguarded                                                                                                                                                                      | S      |
| [UI-23](#ui-23)       | LOW      | Learning mode (Socratic questions, understanding checks, uploaded materials) is undecided and its surface is unreachable                                                                                                                                    | L      |
| [UI-24](#ui-24)       | LOW      | Pagination page sizes and debounce intervals are independently redeclared across surfaces                                                                                                                                                                   | M      |
| [UI-50](#ui-50)       | LOW      | Shared Spinner primitive is unused on web; loading indicators fragmented across 60+ raw Loader2 usages plus a hand-rolled duplicate                                                                                                                         | S      |
| [UI-54](#ui-54)       | LOW      | Web lacks the shared package's configurable send shortcut (Enter vs Cmd/Ctrl+Enter)                                                                                                                                                                         |        |
| [UI-59](#ui-59)       | LOW      | No native or interactive chart component — generated charts only ever reach the user as a static PNG                                                                                                                                                        |        |
| [UI-67](#ui-67)       | LOW      | The lighter WebAppShell omits the free-plan upgrade nudge WebChatPage shows                                                                                                                                                                                 | S      |
| [UI-72](#ui-72)       | LOW      | ArtifactsSidebar.tsx in the shared package is fully dead with zero non-test importers                                                                                                                                                                       | S      |
| [UI-73](#ui-73)       | LOW      | ArtifactPanel self-admits its HTML rendering duplicates ArtifactRenderer.HtmlArtifact, kept in sync only by a comment                                                                                                                                       |        |
| [UI-97](#ui-97)       | LOW      | packages/ui/unified-chat carries a fully dead exported component and a self-admitted duplicate HTML-rendering path                                                                                                                                          | S      |
| [WEB-05](#web-05)     | LOW      | Video model picker lists a preview-only model as selectable, which 400s immediately on submit                                                                                                                                                               | S      |
| [WEB-09](#web-09)     | LOW      | /admin console has no inbound navigation link anywhere in the app shell                                                                                                                                                                                     | S      |
| [WEB-103](#web-103)   | LOW      | No in-settings ad-personalization opt-out, and no confirmation that a program exists to gate                                                                                                                                                                |        |
| [WEB-104](#web-104)   | LOW      | No unified named settings destination covering cloud and local compute access                                                                                                                                                                               |        |
| [WEB-105](#web-105)   | LOW      | Developer console inside settings covers API keys but has no user-facing webhook management                                                                                                                                                                 |        |
| [WEB-106](#web-106)   | LOW      | No centralized Deployments/Domains surface; the published-artifacts list has no custom-domain mapping                                                                                                                                                       |        |
| [WEB-107](#web-107)   | LOW      | Settings search indexes only section-level keywords, not per-control body copy                                                                                                                                                                              |        |
| [WEB-108](#web-108)   | LOW      | In-conversation search has no per-match highlighting inside the message bubble                                                                                                                                                                              |        |
| [WEB-115](#web-115)   | LOW      | /dev/inline-toolcall-demo tracked source permanently embeds a stray local filesystem path                                                                                                                                                                   | S      |
| [WEB-119](#web-119)   | LOW      | Two independent dynamic() wrappers around WebChatPage show different cold-load skeletons                                                                                                                                                                    | S      |
| [WEB-121](#web-121)   | LOW      | Tasks and Schedules are presented as two unrelated nav lists over four disconnected backend types                                                                                                                                                           | L      |
| [WEB-126](#web-126)   | LOW      | /apps page doc comment falsely claims a public marketing fallback that does not exist                                                                                                                                                                       | S      |
| [WEB-128](#web-128)   | LOW      | qa-artifacts dev harness carries a stale 'Delete after QA' comment and was never removed                                                                                                                                                                    | S      |
| [WEB-13](#web-13)     | LOW      | /connectors hangs the local dev server; root cause never found                                                                                                                                                                                              | M      |
| [WEB-132](#web-132)   | LOW      | No 'promote this conversation or task to a recurring schedule' action anywhere                                                                                                                                                                              | M      |
| [WEB-20](#web-20)     | LOW      | Popular searches stay empty in production — migration 0045 applied to dev only                                                                                                                                                                              | S      |
| [WEB-21](#web-21)     | LOW      | Reflect produces no persisted or shareable recap artifact and no cross-device active-time aggregation                                                                                                                                                       | M      |
| [WEB-22](#web-22)     | LOW      | Time-and-focus break counter is browser-local and the account namespace is not consumed by other surfaces                                                                                                                                                   | M      |
| [WEB-27](#web-27)     | LOW      | Specialized verticals (health/legal/education/cyber/shopping/travel/maps/finance) are undecided or decorative                                                                                                                                               | M      |
| [WEB-28](#web-28)     | LOW      | Two dead web modules (~1,500 lines) still ship, carrying their own duplicate upload-cap logic                                                                                                                                                               | S      |
| [WEB-29](#web-29)     | LOW      | Map card cannot draw a real route line or place photos, and has no dark-theme tiles                                                                                                                                                                         | S      |
| [WEB-47](#web-47)     | LOW      | /skills, /connectors, /apps, /device-auth and /user render the app-wide default <title>                                                                                                                                                                     | S      |
| [WEB-48](#web-48)     | LOW      | Marketing-nav mobile breakpoint hides the primary sign-in/CTA behind the hamburger                                                                                                                                                                          | S      |
| [WEB-55](#web-55)     | LOW      | /apps page doc comment falsely claims a public marketing fallback for signed-out visitors                                                                                                                                                                   | S      |
| [WEB-57](#web-57)     | LOW      | /ai-skills redirects with a ?tab=agents query param that /skills never reads                                                                                                                                                                                | S      |
| [WEB-58](#web-58)     | LOW      | qa-artifacts dev harness is still present with a stale 'Delete after QA' comment                                                                                                                                                                            | S      |
| [WEB-64](#web-64)     | LOW      | No keyboard shortcut to toggle the Artifacts panel, and no row for it in the shortcuts dialog                                                                                                                                                               | S      |
| [WEB-65](#web-65)     | LOW      | No embed-code or domain-allowlist option for published artifacts                                                                                                                                                                                            |        |
| [WEB-66](#web-66)     | LOW      | 'Live artifacts' nav item routes to the ordinary static Gallery — the labelled capability does not exist                                                                                                                                                    | S      |
| [WEB-68](#web-68)     | LOW      | Library media grid does not visually distinguish video thumbnails from image thumbnails                                                                                                                                                                     | S      |
| [WEB-70](#web-70)     | LOW      | Schedule list rows structurally cannot show that a run is in progress                                                                                                                                                                                       |        |
| [WEB-71](#web-71)     | LOW      | No status filter on the web schedules list, though the control is fully built twice elsewhere                                                                                                                                                               |        |
| [WEB-72](#web-72)     | LOW      | No auto-generated semantic title on either scheduling surface                                                                                                                                                                                               |        |
| [WEB-75](#web-75)     | LOW      | Create-schedule form opens pre-configured as a standing weekday-9am recurring task                                                                                                                                                                          | S      |
| [WEB-78](#web-78)     | LOW      | No one-click transform of a completed research report into derivative formats                                                                                                                                                                               |        |
| [WEB-79](#web-79)     | LOW      | Active research run has no titled narration panel and no opt-in 'notify me when done'                                                                                                                                                                       |        |
| [WEB-80](#web-80)     | LOW      | No mid-flight steering of an active research run — the only interrupt is a full cancel                                                                                                                                                                      |        |
| [WEB-85](#web-85)     | LOW      | AUTO_TITLE_PLACEHOLDERS effect in WebChatPage races the new LLM title generator and re-truncates the title                                                                                                                                                  | S      |
| [WEB-88](#web-88)     | LOW      | Per-response branch/fork is buried in a hover-only overflow menu with no reassurance copy                                                                                                                                                                   | S      |
| [WEB-90](#web-90)     | LOW      | No user-triggered Run affordance on a plain code block in chat                                                                                                                                                                                              |        |
| [WEB-91](#web-91)     | LOW      | Composer '+' menu 'Connectors' entry navigates away to the settings modal rather than offering an in-composer flow                                                                                                                                          |        |
| [WEB-92](#web-92)     | LOW      | Composer has no discrete, named Canvas/artifact-creation entry                                                                                                                                                                                              |        |
| [WEB-93](#web-93)     | LOW      | Artifacts gallery has no search, no filter-by and no shared-with-you tab                                                                                                                                                                                    |        |
| [WEB-94](#web-94)     | LOW      | No dedicated top-level Images/Videos generation surface (nav entry, composer, template gallery)                                                                                                                                                             |        |
| [WEB-95](#web-95)     | LOW      | Image-generation entry points never disclose the underlying model name in first-party copy                                                                                                                                                                  |        |
| [WEB-96](#web-96)     | LOW      | Interactive checklist card description is line-clamped mid-word                                                                                                                                                                                             | S      |
| [WEB-97](#web-97)     | LOW      | Upgrade dialog close button overlaps and clips the Monthly/Annual toggle                                                                                                                                                                                    | S      |
| [WEB-98](#web-98)     | LOW      | StepsCard checklist persistence key collides for two byte-identical checklists in one conversation                                                                                                                                                          | S      |
| [WEB-99](#web-99)     | LOW      | Other panel-hosted components may still use viewport breakpoints inside fixed-width panels                                                                                                                                                                  | S      |

---

### WEB-02 — Generated videos cannot render on web — CSP has no media-src and the provider URI needs an auth header a browser cannot send

`CRITICAL` · web · effort M

**What.** proxy.ts sets default-src 'self' with no media-src directive, so a <video> pointed at the provider host is blocked outright; the provider Files endpoint additionally requires an api-key header a browser cannot send, and no proxy route exists. A billed user sees 'Your video is ready!' followed by 'Video failed to load.' Verified during this merge: grep of apps/web/proxy.ts finds default-src 'self' at line 86 and zero media-src occurrences.

**Done when.** A generated video plays in the web transcript: bytes are served from a first-party authenticated route and the CSP explicitly permits that media source.

**Where.** `apps/web/proxy.ts:83-96`, `apps/web/features/chat/components/messages/MessageBubble.tsx:1373-1405`

**From.** phase4-capability-audit.md (PP-19)

### AI-57 — No global search across chats, projects, artifacts, files, connectors, settings or developer sessions

`HIGH` · ai-routing · effort XL

**What.** source-of-truth.md P0 Gap List item 9 (GAP-9) requires global search to cover chats, projects, artifacts, files, connectors, settings and developer sessions where allowed. The parity matrix's 'Global app search' row is Partial/Missing and notes 'reference docs say prior global search was stubbed'. frontend-experience-contract.md §14 P2 item 4 restates it as an unbuilt remediation item. No register entry currently tracks it.

**Done when.** Define one permitted-object-class search index and a single query surface, rather than per-surface search boxes; scope it by RLS/permission at query time.

**Where.** `apps/web/app/api/search/route.ts`

**From.** docs/current/source-of-truth.md GAP-9; docs/current/parity-implementation-matrix.md (Global app search); docs/current/frontend-experience-contract.md §14 P2 item 4; docs/current/source-of-truth.md P0 Gap List item 9 (GAP-9); docs/current/parity-implementation-matrix.md 'Global app search'

**Folded in.** GAP-9; frontend-P2-4; frontend-contract P2-4; parity-matrix Global app search; No global search across chats, projects, artifacts, files, connectors, settings or developer sessions

### SEC-81 — Password-manager autofill hardening (CONNECTOR-FORM-PASSWORD-AUTOFILL-01) was never propagated to ConnectorsPage's MCP auth-token field, which would leak the user's account password to an arbitrary third-party MCP server if that page becomes reachable

`HIGH` · security · effort S

**What.** duplication audit extension-surfaces.md §2.1 point 1 (audit/competitive-gap-2026-08-15/duplication/). The modal's AddCustomConnectorForm hardens its bearer-token input with autoComplete='new-password' plus data-1p-ignore/lpignore/bwignore precisely because a text field followed by a password field is the shape browsers and password managers treat as a login form, and would otherwise autofill the real account password into 'Bearer token' and transmit it to an arbitrary MCP server on submit. ConnectorsPage.tsx's equivalent field (InspectMcpServerDialog auth-token input, lines 328,335-341) has none of these attributes. It is currently unreachable only because the isSignedIn gate never coincides with ConnectorsPage being on screen — loosening that routing gate or mounting the page elsewhere ships the vulnerability with no change to the vulnerable dialog.

**Done when.** Port the autoComplete/data-\* hardening attributes onto ConnectorsPage.tsx's InspectMcpServerDialog auth-token field immediately, independent of the broader connector-surface consolidation.

**Where.** `packages/ui/ui/src/settings-modal/SettingsModal.tsx:~1130`, `apps/web/features/connectors/pages/ConnectorsPage.tsx:328,335-341`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.1

### UI-03 — Model badge lies after server-side substitution, pin-to-model is unwired, and two ReasoningAccordion implementations coexist

`HIGH` · ui · effort M

**What.** The server computes usedFallback/original_model and emits fallback:{original_model,reason}, but useChatStream.ts sets the turn's model from the REQUEST (options.model || selectedModel) and persists that; no client reads original_model, so a credit fallback or provider failover shows the wrong model. Verified in the source audit: grep for usedFallback/original_model/x-agi-fallback in useChatStream.ts returns zero hits. Separately: the pin-to-model action is unwired or should be removed, there is no model-version/snapshot pinning, and duplicate ReasoningAccordion implementations exist. An account-level effort default with cost warning is also absent (per-message only).

Also recorded by a later audit (Web reasoning accordion — orphaned duplicate removed (wire-or-cut 2026-08-06 Wave 2 orphan sweep)): CONTRADICTS the register's 'two ReasoningAccordion implementations coexist': wire-or-cut records ReasoningAccordion.tsx cut as an orphaned duplicate of the live ThinkingBlock, carrying its own test suite. Re-verify before working UI-03 — if the cut landed, UI-03 narrows to the lying model badge and the unwired pin-to-model.

**Done when.** The model badge names the model that actually answered, including after a fallback; pin-to-model either works or is removed; one reasoning accordion remains.

**Where.** `apps/web/lib/hooks/useChatStream.ts:1964`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2701`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-02: Model/reasoning controls: pin-to-model unwired, no version pinning, duplicate reasoning UIs; phase4 PP-02: Model-identity badge does not reflect server-side model substitution; GAP-276: No account-level intelligence/effort defaults with usage-cost warning copy; GAP-217: No reasoning-effort availability allow-list to trim the model picker

### UI-07 — Web artifacts are read-only while the product calls them editable; version always reports 1 and there is no select-and-edit, restore, or comment path

`HIGH` · ui · effort XL

**What.** ArtifactPreview.tsx has no onEdit/editable/readOnly prop and no Edit control, yet two marketing pages describe artifacts as editable; Desktop artifacts are editable and web is not. There is no select-and-edit or conflict-aware revision model, no real version navigation/restore/comments/remix/provenance, and the published version always reports 1. Desktop cloud publish is a permanent 'coming soon'. Sandboxing interactive artifacts on a separate origin is owned by the security slice.

Also recorded by a later audit (Artifact 'Code' tab is read-only; no direct manual editing of artifact content (ARTIFACTS-003)): Source is a read-only <pre>/highlighted block and every revision comes from a new LLM turn; zero matches for contentEditable/Monaco/CodeMirror anywhere in features/chat/components/artifacts/. Proposed fix: make the Code tab's <pre> an editable textarea behind an Edit toggle writing back through the existing content-keyed versioning path Restore already uses. Ref ArtifactPreview.tsx:1-1368.

Also recorded by a later audit (Gallery's 'New Artifact' never opens a blank, directly-editable artifact — always routes through a chat prompt (ART-CANVAS-02)): GalleryClient.tsx:994-1005's handleCategorySelect either router.push('/chat') or opens a wizard that does router.push('/chat?prompt=…') — every path is a chat-prompt redirect, never a direct editable canvas.

Also recorded by a later audit (Artifacts missing creation, side panel, versions/history, export, multi-select, error-fix loop, publish/share, AI gating (source-of-truth GAP-8)): Preserves the original P0 gap id GAP-8 and its full required-capability list (creation, side panel, source/preview switch, versions/history, copy/download/export, multi-artifact selection, error-fix loop, publish/share controls, AI-powered/MCP-backed gating). frontend-experience-contract §14 P2 item 2 restates the versions half as 'artifact renderer manifests and versions across supported surfaces'.

Also recorded by a later audit (Web artifact version restore — recorded as wired 2026-08-06 (wire-or-cut)): CONTRADICTS the register's 'no restore path': wire-or-cut.md records restoreArtifactVersion re-upserting the chosen version's content as the new latest (desktop already had rollback, web did not). Re-verify against code before working UI-07 — if restore genuinely shipped, UI-07's scope narrows to select-and-edit, comments and the always-1 version counter.

**Done when.** Web artifacts are either genuinely editable with real version history and restore, or every surface that calls them editable is corrected to match.

**Where.** `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; gap-audit-2026-08-08.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-11: Artifacts/Canvas: no select-and-edit, fake version numbers, unwired Desktop publish; phase4 PP-11: Web artifacts are read-only despite two marketing pages describing them as 'editable'; DOC-020: Artifact versioning (always reports version 1) not downgraded consistently; P2-002: File ingestion and artifact/viewer parity is inconsistent

### UI-11 — Settings information architecture is incomplete: unmounted accessibility control, settings with readers but no writers, missing sections, and no Help route

`HIGH` · ui · effort XL

**What.** The font-size/accessibility control is unmounted; several settings have only defaults and readers with no writer or persistence; web model/effort/shortcut/density/code-block settings are undecided; Chrome appearance/data/permissions/help/reset are incomplete; there is no real Help route; and setting precedence and provenance are undefined. The web settings tree (account, billing, byok, capabilities, connections, general, memory, notifications, privacy, profile, reflect) has no Storage, Safety or Parental-controls section that mobile ships, no account-level storage-quota screen, no public @username field, no sidebar nav customization, and Active sessions sits under Account rather than Security. Advanced account security, Lockdown mode and Developer mode toggles are absent. 'Improve the model' and 'Location' toggles were deliberately removed as dead controls (compliance slice owns the consent question).

Also recorded by a later audit (Web Settings Help section — wired (wire-or-cut 2026-08-06)): CONTRADICTS 'no Help route': a HelpSection was added linking /help, /status, /changelog, /docs, /support and /legal, which previously shipped but were unreachable from inside the product. Adding 'help' to SETTINGS_NAV_GROUPS_WEB was required by the desktop capability-honesty test. Re-verify; UI-11's remaining scope is the unmounted accessibility control (now expanded by UI-47), readers-without-writers and missing sections.

Also recorded by a later audit (Settings IA rows (General/Account/Privacy/Billing/Usage/Capabilities/Connectors/AGI Code/AGI in Chrome/Extensions/Developer) all Partial (parity-implementation-matrix); settings schema/capability-driven rendering incomplete (frontend-contract §14 P2-5)): Enumerates the locked settings IA and marks every section Partial or Missing per surface, and adds the structural ask that settings render from a schema driven by the effective capability result rather than hand-authored per-surface sections. Concrete sub-gaps filed separately: WEB-100 (Capabilities), WEB-101 (accent/contrast), WEB-102 (MFA), WEB-105/106/107, UI-63 (nav lock-step).

Also recorded by a later audit (/settings/byok and /settings/sync have real content but zero in-app discovery path (duplication settings-and-nav[3])): Two more concrete instances of the register's 'missing sections' clause. Neither key appears in WebSettingsModal.tsx's SECTION_TO_SEGMENT / WEB_SETTINGS_NAV_GROUPS wiring, nor in settings-nav.ts's SETTINGS_NAV_GROUPS_WEB (full list read, lines 279-305); repo-wide grep for the literal route strings finds only each page's own file and tests. /settings/voice was in the identical orphaned state until it was fixed via a web-only VoiceSection.tsx injection in WebSettingsModal.tsx:66,186-216 — that injection (deliberately web-only, to avoid adding a no-content Voice tab to Desktop Cloud's shared settings array) is the exact template to reuse here. Prevention is tracked separately as TEST-16.

**Done when.** Every rendered setting has a writer and persists; the settings tree covers the sections the product actually has; a Help destination exists; and precedence between account, project and device settings is defined and visible.

**Where.** `apps/web/features/settings/components/WebSettingsModal.tsx`, `apps/web/features/settings/sections/PrivacySection.tsx:16-24`, `apps/web/app/settings/`

**From.** AuditRemediationLedger.md; audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-24: Settings: unmounted accessibility control, missing writers, incomplete Chrome options, no Help route; GAP-273: Web settings nav is missing Storage, Safety and Parental controls that mobile ships; GAP-279: No account-level cloud storage quota screen; GAP-266: No public @username/handle field anywhere in account settings; GAP-258: Sidebar nav items cannot be shown/hidden by the user; GAP-338: Active sessions / log-out-all-devices lives under Account, not Security and login; GAP-265: No Advanced account security enrollment, Lockdown mode, or Developer mode toggles; GAP-259: 'Improve the model for everyone' and 'Location' toggles intentionally removed as dead controls; GAP-337: No connected-CLI device management or device-code auth; GAP-270: Web settings has no view of extensions installed on the paired desktop app; GAP-263: No 'Record mode' / recording-transcript memory reference feature; GAP-336: No virtual 'Pet' companion personalization feature

### UI-14 — Accessibility coverage is five web routes and nothing else — no keyboard, screen-reader, focus, reduced-motion, high-contrast or zoom testing on any surface

`HIGH` · ui · effort XL

**What.** apps/web/scripts/a11y-audit.mjs covers only /, /chat, /pricing, /features/agents and /download, gated on web_changed in CI; only two reduced-motion assertions exist repo-wide; no axe suite exists for desktop, mobile or CLI. There are no keyboard/screen-reader/focus/reduced-motion/high-contrast/zoom/responsive tests on active surfaces, and cards, code blocks, tables, artifacts and partial streams may not retain stable readable geometry. Web General also lacks the contrast and accent-colour controls mobile ships, and the icon-only-button aria-label sweep was started on desktop but never completed across features. The compliance slice separately notes the published accessibility claims were rescoped to match this five-route evidence.

Also recorded by a later audit (Automated accessibility CI gates only ever visit unauthenticated/marketing screens, never the real authenticated product (DESIGN-SYSTEM-003)): Names the exact gates: apps/web/scripts/a11y-audit.mjs:22-28 visits exactly 5 unauthenticated routes (Home, marketing Chat, Pricing, Features, Download); apps/desktop/e2e/accessibility-audit.spec.ts:1-42 audits exactly one screen — the signed-out sign-in route — with a comment saying the signed-out choice keeps the audit 'deterministic'. Neither ever authenticates to exercise Settings (38 nav destinations), a real chat thread, Artifacts, Research or Connectors. Proposed fix names a concrete first slice: a Clerk test-user/mocked-session fixture for web opening a seeded chat + Settings modal + one dialog, and a second desktop Playwright spec booting past onboarding.

**Done when.** Every active surface has automated accessibility coverage plus explicit keyboard, screen-reader, focus-order, reduced-motion, high-contrast and zoom assertions, and the settings offer the contrast/accent controls the claims imply.

**Where.** `apps/web/scripts/a11y-audit.mjs:22-28`, `.github/workflows/ci.yml:643,702`, `apps/web/features/settings/sections/GeneralSection.tsx:410-437`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/ui-gaps.md; known-flaws.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-32: Product surface fidelity/accessibility: unmounted components, no accessibility test coverage; phase4 PP-32: Accessibility (axe/Playwright) automated coverage exists only for 5 web routes; GAP-275: Web General lacks contrast and accent-color controls that mobile already ships; DESKTOP-ICON-BUTTON-ARIA-LABEL-GAP-01: icon-only buttons missing aria-label, pattern only partly swept

### UI-26 — Large text pastes flood the composer instead of converting to a 'Pasted text' attachment (mobile already ships the fix)

`HIGH` · ui · effort ?

**What.** COMPOSER-002: web's handlePaste and the shared ChatInput.tsx's identical handlePaste convert only file/image pastes, with a code comment stating the intent 'so pasting text still inserts text' — pasting 20,000 characters dumps raw text into the textarea. The Chrome extension has the identical file-only restriction. Mobile already implements LARGE_PASTE_THRESHOLD = 10_000 with a doc comment citing competitor parity.

**Done when.** Port mobile's LARGE_PASTE_THRESHOLD logic into a framework-neutral helper under packages/ui/unified-chat/src/lib/ and call it from web's, the shared package's and the extension's paste handlers.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1090-1109`, `packages/ui/unified-chat/src/components/ChatInput.tsx:740-762`, `apps/mobile/src/features/chat/components/ChatInput.tsx:64-67,435-461`

**From.** audit/parity-2026-08-15 — COMPOSER-002

### UI-27 — The shared composer desktop renders has no image/video generation mode at all

`HIGH` · ui · effort ?

**What.** COMPOSER-004: web's composer has explicit imageMode/videoMode state with aspect-ratio and model controls plus a real backend, and mobile has the equivalent via mediaMode.ts, but a repo-wide search of packages/ui/unified-chat/src — the composer desktop actually renders — for imageMode/videoMode/aspectRatio returns zero component-level matches. '/image' exists only as slash-command display metadata with no registered handler, so it produces a text template, not a mode toggle.

**Done when.** Add an explicit image/video mode to ChatInputToolbar.tsx/AttachmentMenu.tsx modelled on mobile's mediaMode.ts, wired to the same app/api/media/{image,video}/generate routes.

**Where.** `packages/ui/unified-chat/src/components/ChatInputToolbar.tsx`, `packages/ui/unified-chat/src/lib/slashCommands.ts:75-81`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:801,809,817-821`

**From.** audit/parity-2026-08-15 — COMPOSER-004

### UI-28 — Web's primary chat surface bypasses the shared chat UI package, running a 2.4–2.5x larger fork

`HIGH` · ui · effort XL

**What.** CROSS-SURFACE-001 plus duplication/components.md §1 and §6: web's primary route renders its own 4,407-line WebChatPage.tsx with a 2,254-line MessageBubble and a 3,621-line ChatComposerNew, against the shared package's 924-line MessageBubble and 1,422-line ChatInput. Desktop and web's secondary routes genuinely import the shared package; WebChatPage's only unified-chat imports are two dialogs and a type. A code-block copy-button hover-gate bug was fixed 2026-08-15 only in the shared markdown renderer, so web's fork still carries the old behaviour. chat-route.test.tsx explicitly asserts /chat always renders WebChatPage.

**Done when.** Founder/architecture decision: either finish migrating web's message list and composer onto @agiworkforce/unified-chat's MessageList/ChatInput as one tracked migration with a shrink-only allowlist, or explicitly retire UnifiedChatPage — do not delete it without asking, it represents real recent effort toward removing this duplication.

**Where.** `apps/web/features/chat/pages/WebChatPage.tsx`, `apps/web/features/chat/components/messages/MessageBubble.tsx:1-2254`, `packages/ui/unified-chat/src/components/MessageBubble.tsx:1-924`

**From.** audit/parity-2026-08-15 — CROSS-SURFACE-001; audit/competitive-gap-2026-08-15/duplication/components.md §1, §6

**Folded in.** CROSS-SURFACE-001; duplication components[0]; duplication components[5]

### UI-77 — Headless transcript, event and approval state has never been extracted from the DOM renderers

`HIGH` · ui · effort XL

**What.** frontend-experience-contract.md §14 P1 item 1: 'Extract headless transcript/event/approval state from DOM renderers.' This is the structural precondition that makes the composer fork (UI-25), the chat-shell fork (UI-28) and the three markdown engines (UI-33) individually unfixable — each surface re-implements state alongside its renderer.

**Done when.** Define one headless transcript/event/approval state layer and have every surface's renderer consume it, before or alongside the individual convergence items.

**From.** docs/current/frontend-experience-contract.md §14 P1 item 1

### UI-81 — Four independently-authored composer implementations across web, shared unified-chat, mobile and the Chrome extension with no shared behaviour contract

`HIGH` · ui · effort XL

**What.** COMPOSER-001: web's primary composer (3,621-line ChatComposerNew.tsx) is separate from the shared unified-chat ChatInput.tsx (1,422 lines) used by desktop and secondary web routes, separate again from mobile's from-scratch RN ChatInput.tsx (1,249 lines), separate again from the Chrome extension's hand-written vanilla-DOM composer (whose comment says it 'Mirrors' the shared component's source rather than importing it). This produces measurable verified drift (large-paste handling, image/video mode, missing toggles) with no structural mechanism keeping the four in sync. Broader than UI-22's undifferentiated 'unmounted and duplicate components' entry.

**Done when.** Extract paste/drop/attachment-policy logic into a framework-neutral module under packages/ui/unified-chat/src/lib/ (mirroring slashCommands.ts's pattern), have web's composer and the shared ChatInput both call it, and give the extension a documented port instead of a comment-only mirror.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `packages/ui/unified-chat/src/components/ChatInput.tsx`, `apps/mobile/src/features/chat/components/ChatInput.tsx`, `apps/extension/src/side_panel.ts:9330-9470`

**From.** audit/parity-2026-08-15 COMPOSER-001; audit/parity-2026-08-15 — COMPOSER-001

**Folded in.** Four independently-authored composer implementations across web/desktop/mobile/extension with no shared behaviour contract

### UI-82 — Three independent, non-shared markdown rendering engines across web+desktop, mobile and the Chrome extension

`HIGH` · ui · effort XL

**What.** RENDERING-001: web and desktop share one real remark/rehype pipeline (react-markdown + remark-gfm/math/breaks + rehype-raw/sanitize/katex/highlight). Mobile has an independent 642-line hand-written regex parser. The Chrome extension has a third, independently written 179-line regex parser. None share code; grep confirms zero references to the shared component outside web/unified-chat. The two regex engines carry their own correctness bugs (MOB-45, EXT-23).

**Done when.** Adopt one shared parse layer (micromark/mdast) with three thin render-target adapters, replacing the two independent regex engines; fix the concrete correctness bugs first, then converge.

**Where.** `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:1-297`, `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1-642`, `apps/extension/src/features/side-panel/markdown.ts:1-179`

**From.** audit/parity-2026-08-15 RENDERING-001; audit/parity-2026-08-15 — RENDERING-001

**Folded in.** Three independent, non-shared markdown rendering engines across web+desktop / mobile / Chrome extension

### UI-94 — Web's primary chat surface bypasses the shared unified-chat package, running a 2.4–2.5x larger fork with no structural mechanism to keep the two in sync

`HIGH` · ui · effort XL

**What.** CROSS-SURFACE-001 plus duplication/components.md §1 and §6. Web's primary route renders its own 4,407-line WebChatPage.tsx with a 2,254-line MessageBubble and a 3,621-line ChatComposerNew, versus the shared package's 924-line MessageBubble and 1,422-line ChatInput; WebChatPage's only real imports from unified-chat are two dialogs and a type. Desktop and web's secondary routes genuinely import the shared package (desktop runs ChatInterface daily behind feature flag desktop_chat_v3, default enabled). Measured consequence: a code-block copy-button hover-gate bug was fixed today only in the shared markdown renderer, so web's copy still has the old behaviour. UnifiedChatPage.tsx is fully wired and tested but has zero route importers, and chat-route.test.tsx explicitly asserts '/chat route always renders the canonical WebChatPage'.

**Done when.** Founder/architecture decision required: either finish cutting web's /chat route over to the shared ChatInterface/MessageList/ChatInput, or explicitly retire that effort. Track as a single migration with a shrink-only allowlist. Do not delete UnifiedChatPage.tsx without asking — it represents recent effort toward removing this exact duplication (see WEB-39).

**Where.** `apps/web/features/chat/pages/WebChatPage.tsx`, `apps/web/features/chat/components/messages/MessageBubble.tsx:1-2254`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1-3621`, `packages/ui/unified-chat/src/components/MessageBubble.tsx:1-924`, `apps/web/features/chat/pages/__tests__/chat-route.test.tsx`

**From.** audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-001; audit/competitive-gap-2026-08-15/duplication/components.md §1, §6

**Folded in.** CROSS-SURFACE-001; components[0]; components[5]

### WEB-03 — Generated videos are never persisted — only an expiring provider URL is stored, so a paid generation is lost on tab close

`HIGH` · web · effort L

**What.** status/route.ts assigns statusResponse.video_url = firstVideo.uri directly and never stores bytes or inserts a media_assets row; grep for kind:'video' returns only an unrelated provenance kind. Images are persisted, videos are not. No webhook, queue, or resume path exists. Overlaps the billing slice (user paid for a lost artifact) but the storage pipeline is the web media surface.

**Done when.** A completed video generation is persisted to first-party storage with a media_assets row, so it survives tab close and appears in Library the same way a generated image does.

**Where.** `apps/web/app/api/media/video/status/route.ts:302`

**From.** phase4-capability-audit.md (PP-19)

### WEB-04 — No way to stop a video generation — the fully implemented cancel route has zero client callers and Stop is suppressed in video mode

`HIGH` · web · effort S

**What.** /api/media/video/cancel/route.ts is fully implemented with its own test suite (cancelRequestedAt, provider cancel attempts, requested/unconfirmed state machine) but no client anywhere calls it; ChatComposerNew.tsx actively suppresses the Stop button and disables the textarea in video mode, making a 1-2 minute generation uninterruptible on both Web and Mobile. Verified during this merge: grep for 'media/video/cancel' across apps/ and packages/ returns only .next build artifacts, no source callers.

**Done when.** The composer's Stop control is reachable during a video generation and calls the existing cancel route, so a user can abort a run in progress.

**Where.** `apps/web/app/api/media/video/cancel/route.ts`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2234,2245`

**From.** ExecutionPlan.md (Web composer 2026-08-13, founder-reported)

### WEB-109 — One-chat flow does not support ordinary chat plus selected/reference files without forcing a separate experience

`HIGH` · web · effort ?

**What.** source-of-truth.md P0 Gap List item 3 (GAP-3) and frontend-experience-contract.md §13 'Reference files in one chat — Missing/Partial': the contract states a filename manifest alone is not project-knowledge parity and that a separate reference-file chat is explicitly not wanted. Related to but distinct from WEB-25 (ingestion breadth) and UI-32 (Library reuse).

**Done when.** Make selected/reference files a first-class attachment mode inside the normal chat composer rather than a distinct surface.

**From.** docs/current/source-of-truth.md P0 Gap List item 3 (GAP-3); docs/current/frontend-experience-contract.md §13

**Folded in.** GAP-3; frontend-contract 'Reference files in one chat'

### WEB-11 — Developer API is unusable as documented: structured outputs hard-rejected, retired /api/agents paths still referenced, no SDK/webhooks/Files API, no authoritative OpenAPI artifact

`HIGH` · web · effort XL

**What.** Structured outputs are advertised as compatible but hard-rejected; unused embedding catalog entries remain; rerank/file-search/batch/flex-priority/realtime/outbound-webhooks/service-accounts/project-budgets/regions/SDKs/playground are all undecided; retired /api/agents paths are not removed from clients and docs; only the internal chat/completions path works and only 3 scopes exist. docs/api/openapi.yaml is referenced but absent from the tree, so there are no contract tests comparing routes to a published spec. Blocked in practice on WEB-10 (the advertised host 404s).

Also recorded by a later audit (response_format: json_schema is still refused with no native or retry-loop support (wire-or-cut, Developer API slice)): Important scoping correction to the register's 'structured outputs hard-rejected': the json_object mode WAS fixed — applyJsonObjectMode + extractJsonObject now genuinely enforce it and return 502 on unparseable output, where previously a caller could ask for JSON and get 200 OK with prose. json_object combined with stream:true is refused by design at the schema (buffering the whole stream to validate would make stream:true a lie). Only json_schema remains refused: enforcing a caller-supplied schema needs native per-provider support or a validate-and-retry loop that would spend the caller's money on unrequested retries; the refusal message names both alternatives but neither is built. Also fixed in the same slice: POST /api/llm/v1/embeddings is now wired (strict dimensions/encoding_format rejection, settle-on-every-exit billing) — though it still has no internal caller, see AI-38.

**Done when.** The published developer API matches what the platform actually serves: one generated OpenAPI artifact, contract tests binding routes to it, an explicit OpenAI-compatibility matrix, and removal of retired paths from clients and docs.

**Where.** `apps/web/public/openapi.json`, `scripts/config/reference-integrity-allowlist.json`

**Blocked by.** WEB-10 — the advertised API host must serve /v1 before compatibility can be verified end to end

**From.** AuditRemediationLedger.md; ExecutionPlan.md; gap-audit-2026-08-08.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-29: Developer API: structured outputs hard-rejected, unused embedding catalog, retired /api/agents paths remain; ExecutionPlan #96: Developer API is unusable as documented; GAP-P1-008: Public/developer API lacks one authoritative OpenAPI artifact

### WEB-110 — Cloud Code's fully-built approval-gated agent-turn backend has no UI entry point; web only exposes a raw command shell

`HIGH` · web · effort L

**What.** BACKEND-RUNTIME-001. A complete approval-gated agent-turn backend exists for Cloud Code sessions (agent/route.ts + agent/approvals/route.ts, real handlers, not stubs). cloud-code-api.ts, the sole in-repo caller of /api/code/sessions/\*\*, calls list/get/create/delete/commands only — never .../agent or .../agent/approvals. CloudCodePage.tsx renders only a raw terminal; its only 'agent' mention (line 660) is a static string pointing to the VS Code extension. Distinct from AI-29, which is the write-only approval state machine inside that backend.

**Done when.** Add an agent-turn composer to CloudCodePage (task input -> POST .../agent, subscribe to the event stream, surface approvals).

**Where.** `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts`, `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts`, `apps/web/features/code/services/cloud-code-api.ts`, `apps/web/features/code/CloudCodePage.tsx:660`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-001; audit/parity-2026-08-15 — BACKEND-RUNTIME-001

**Folded in.** Cloud Code's approval-gated agent-turn backend has no UI entry point; web only exposes a raw command shell

### WEB-118 — WebSidebar renders a second, incomplete and self-inconsistent nav rail on the live /chat/code route

`HIGH` · web · effort M

**What.** duplication/chat-shells.md Finding 3 and settings-and-nav.md §1b. WebSidebar.tsx:93-125's navItemsForMode('code') returns only 2 items (Desktop app, VS Code extension) versus the canonical 8-destination app-nav-items.ts rail; its own collapsed RAIL_ITEMS unconditionally shows MORE links than its expanded state (self-inconsistent within one file); and the collapsed 'Settings' icon maps to /settings/voice rather than general settings. CloudCodePage.tsx:274-287 builds its own shell div instead of using WebAppShell. This is a live route, unlike the dead cascade in WEB-39.

**Done when.** Migrate /chat/code onto WebAppShell + buildAppNavItems, then delete WebSidebar.tsx and resolveWebViewRoute; fix the gear icon to call openSettings('general') like every other entry point.

**Where.** `apps/web/features/chat/v3/WebSidebar.tsx:93-125,200-218`, `apps/web/features/code/CloudCodePage.tsx:29-30,274-287`

**From.** audit/competitive-gap-2026-08-15/duplication/chat-shells.md Finding 3; audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §1b

### WEB-12 — Reachable production web controls still return 501, toast 'coming soon', or silently no-op — roughly 20 stub markers remain

`HIGH` · web · effort L

**What.** Triaged 2026-08-09: 20 'coming soon' / 'not implemented' / 'TODO: implement' markers remain across production web surfaces excluding tests. Each is a reachable user control that does not do what it says — the exact class the no-present-tense-stub rule forbids, and which nothing currently enforces. The work is triaging each into ship / label-as-planned / delete.

**Done when.** Every reachable production web control either performs its stated action or is visibly labelled preview/planned before the user acts on it; no control silently no-ops.

**From.** AuditRemediationLedger.md

**Folded in.** SCALE-FIN-002: 20 'coming soon'/'not implemented'/'TODO: implement' markers remain in production web surfaces; SCALE-FIN-005: No-present-tense-stub rule not enforced

### WEB-127 — Web-created artifacts never sync to the cloud (push path missing), the gallery falsely claims account-scoped storage, and Library renders artifact-class files through the plain file card

`HIGH` · web · effort L

**What.** ARTIFACTS-001 + duplication/content-surfaces.md. /api/chat/sync fully supports bidirectional artifact sync (GET pull + POST push into web_artifacts, route.ts:444-530) but the web client only ever calls the pull half via pullArtifactCloudChanges(); artifacts-store.ts's addArtifact/upsertArtifact make zero network calls and persist only to localStorage (quotaAwareArtifactStorage, lines 335-362), with the sync hook resetting to an in-memory overlay each mount. Desktop and Mobile do push. Consequences: (1) an artifact born from a fenced code block in a web session is gone if storage is cleared or the user switches machines; (2) app-nav-items.ts:101-112 describes the gallery as 'account-scoped', which is false for the majority of its content — the kind of fake-availability claim CLAUDE.md treats as a bug; (3) generated-file-persist.ts:156-180 already buckets html/svg/markdown/mermaid/json/code into surface:'artifact' in media_assets, but LibraryView renders those rows through the plain GeneratedFileCard (download/open-in-tab) instead of ArtifactPreview.

**Done when.** Add the missing web-side push to web_artifacts using the POST /api/chat/sync artifacts array that already exists server-side; correct the 'account-scoped' copy until it lands; route surface:'artifact' Library rows through ArtifactPreview.

**Where.** `apps/web/features/chat/stores/artifacts-store.ts:335-362,493-570`, `apps/web/features/chat/hooks/use-artifact-cloud-sync.ts:20-99`, `apps/web/app/api/chat/sync/route.ts:444-530`, `apps/web/shared/components/layout/app-nav-items.ts:101-112`, `apps/web/lib/server/generated-file-persist.ts:156-180`

**From.** audit/parity-2026-08-15/gaps/domain-artifacts.json ARTIFACTS-001; audit/competitive-gap-2026-08-15/duplication/content-surfaces.md

**Folded in.** ARTIFACTS-001; content-surfaces-storeA/B/C

### WEB-14 — Connector directory UI advertises providers that cannot connect, and its permission/scope surfaces are decorative

`HIGH` · web · effort L

**What.** The catalog advertises ~89 integrations while Settings renders all 84 non-exclusive ones as 'Coming soon' and the public directory POST returns 501; only GitHub and custom MCP genuinely connect. The connector permission panel is unmounted with mismatched keys; grantedScopes and riskClass flow registry->API->UI but are never consulted before a connector tool executes; there is no explicit connector invocation/discovery in the composer and no audit/provenance strip for connector reads and writes. Catalog rows also lack New/Community/Trending badges, popularity ranking, a verified indicator, a Popular quick-connect row, and a Type column. Backend registration work is owned by the integrations slice (oauth-registry ships with zero providers by design); this item is the UI honesty and surface gap.

**Done when.** The connector directory shows only what a user can actually connect on this deployment, mounts a working permission panel, and surfaces connector activity with provenance — with per-provider availability driven by real registry state rather than a static catalogue.

**Where.** `apps/web/features/connectors/pages/ConnectorsPage.tsx:503,712`, `apps/web/features/connectors/data/connectors.ts`, `apps/web/lib/connectors/oauth-registry.ts`

**From.** AuditRemediationLedger.md; audit/ui-gaps.md; phase4-capability-audit.md; ExecutionPlan.md

**Folded in.** PP-16: Connectors and MCP: catalog gaps, placeholder directory, unmounted permission panel; GAP-257: Connector catalog has no New/Community/Trending badges, popularity ranking, or verified indicator; GAP-269: Connectors settings lacks a 'Popular' quick-connect row and a Type (Desktop/Web) column; DOC-023: Placeholder MCP directory not downgraded; Founder actions #13: Connectors catalog should ship or be de-listed

### WEB-15 — Deep Research web: no plan approval, dead Report tab on Anthropic models, literal Markdown rendering, no server-side resume

`HIGH` · web · effort XL

**What.** No plan preview or approval before an expensive research run; no source-quality scoring, contradiction detection or citation verification; reports can render literal Markdown instead of formatted headings/tables/charts. route.ts gates runResearchLoop to provider !== 'anthropic', so all three Anthropic research-capable models fall through to the legacy single-turn path where persistReport never runs and the Report tab permanently shows 'No saved report yet'. Abrupt teardown persists status='interrupted' but nothing resumes server-side (user-initiated Retry only), and there is no per-day cap. Slide/document export and scheduled research remain undecided. The Anthropic routing gate overlaps the ai-routing slice; the plan/report/resume surfaces are the web product.

Also recorded by a later audit (No pre-flight plan-approval gate before a research run spends budget (search-deep-research G1, dr-02/04/05/06/19)): Sharpens 'no plan approval': ResearchActivity.tsx renders the plan only as part of an already-executing run (read-only, no edit handler), research-loop.ts's phase machine has no approval checkpoint between planning and execution, and there is no countdown, time estimate or 'skip research' link. Proposed fix: an explicit review step after planning with editable plan queries and Start/Cancel — no auto-start timer.

Also recorded by a later audit (No pre-flight plan-approval gate before a research run spends budget (search-deep-research G1)): Mechanism for the 'no plan approval' clause: ResearchActivity.tsx renders the plan only as part of an already-executing run (read-only, no edit handler), and research-loop.ts's phase machine has no approval checkpoint between planning and execution. No countdown, time estimate or 'skip research' link exists either. Fix: add an explicit review step after planning completes with editable plan queries and Start/Cancel — and no auto-start timer.

**Done when.** A research run on any research-capable model shows a reviewable plan, streams phase status, renders a formatted report with verified citations, and can be resumed after an interrupted run.

**Where.** `apps/web/app/api/llm/v1/chat/completions/route.ts:313-317`, `apps/web/lib/research-loop.ts:16-17`, `apps/web/features/chat/components/research/ResearchPanel.tsx`, `apps/web/features/chat/components/research/ResearchReportView.tsx`

**From.** AuditRemediationLedger.md; known-flaws.md; audit/capability-gaps.csv; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-04: Deep Research: no plan approval, weak source verification, dropped Mobile events, literal Markdown rendering; CAP-045: Dedicated deep research product; Deep Research web v1: no server-side resume for interrupted runs, no per-day cap; phase4 PP-04: Deep Research on Anthropic models silently runs the legacy single-turn path; Report tab permanently dead

### WEB-31 — Skills/Plugins directory is a preview catalogue with no install, permission-consent, publish or uninstall lifecycle

`HIGH` · web · effort XL

**What.** apps/web/app/plugins/page.tsx labels itself 'Catalogue preview' and states nothing installs; features/plugins/data/plugins.ts is a 4-entry demo catalogue; plugin-store.ts hard-disables installation and returns no installed plugins. Skills settings are read-only discovery with no create/install/update/delete/publish, and the skill rows omit lastUpdated and author metadata with no Browse/Add action. There is no signature/allowlist/sandbox/kill-switch coverage, no publisher identity, ratings, or update policy, and no public creator/builder profile. WebSettingsModal still lists from an offline mirror rather than the shipped live registry, and /plugins has zero i18n. A unified Skills/Connectors/Plugins directory was declined until an install transaction exists. Extension-directory authority (CAP-037) is the same missing lifecycle.

Also recorded by a later audit (Plugin registry ships zero installable entries — the storefront and decomposition UI have nothing live behind them (CPS-07; also CPS-16 category tabs)): Sharpest available evidence: apps/web/app/plugins/page.tsx's own doc comment states 'every row is preview' today — no plugin is currently installable, first- or third-party, in this deployment. Important scoping correction for WEB-31: Connectors and Skills ARE confirmed live-functional; only Plugins are non-functional, so the register's combined 'Skills/Plugins directory' framing overstates the Skills half. This is a launch-readiness gap, not a UI bug: publish at least one first-party plugin artifact with a real manifest_url, or add explicit 'coming soon' messaging on the plugin detail page so a fully-populated decomposition UI does not mislead. Refs: apps/web/db/neon/0096_plugin_registry.sql.

**Done when.** A user can install a skill or plugin through an account-bound transaction with an explicit permission consent step, see who published it, update it, and uninstall it — or the catalogue is plainly labelled as non-installable everywhere it appears.

**Where.** `apps/web/app/plugins/page.tsx:34,64-65`, `apps/web/features/plugins/data/plugins.ts:1-8`, `apps/web/features/settings/components/WebSettingsModal.tsx:420-433`

**From.** AuditRemediationLedger.md; known-flaws.md; audit/capability-gaps.csv; audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-17: Custom assistants/skills/plugins: read-only, no install/publish lifecycle; WEB-UNIFIED-DIRECTORY-01: no tenant-owned plugin installation persistence or working marketplace API; CAP-046 wiring gaps: WebSettingsModal reads offline mirror; /plugins i18n; CAP-037: Authoritative extension directory; GAP-274: Plugin catalogue is a 4-entry preview that installs nothing; GAP-272: Skills settings data model lacks 'last updated' and 'author' metadata, and no Browse/Add actions; GAP-113: A unified Directory is declined while catalogs have different authority and lifecycle; GAP-117: Plugin installation remains explicitly closed until an account-owned marketplace exists; GAP-267: No public creator/builder profile screen for shared Skills/Plugins

### WEB-34 — Web-created artifacts never push to the cloud — sync is pull-only, so artifacts live in one browser's localStorage

`HIGH` · web · effort ?

**What.** ARTIFACTS-001 + duplication/content-surfaces.md: /api/chat/sync supports bidirectional artifact sync (GET pull + POST push into web_artifacts) but the web client only calls pullArtifactCloudChanges(); artifacts-store.ts's addArtifact/upsertArtifact make zero network calls and persist only to localStorage via quotaAwareArtifactStorage. Desktop and mobile push via packages/client/sync. An artifact born from a fenced code block is gone on clear-storage or device switch.

**Done when.** Add a push path in artifacts-store.ts that POSTs locally created/edited artifacts to /api/chat/sync on create/update, reusing existing CSRF/rate-limit/RLS plumbing.

**Where.** `apps/web/features/chat/stores/artifacts-store.ts:335-362,493-570`, `apps/web/features/chat/hooks/use-artifact-cloud-sync.ts:20-99`, `apps/web/app/api/chat/sync/route.ts:444-530`

**From.** audit/parity-2026-08-15 — ARTIFACTS-001; audit/competitive-gap-2026-08-15/duplication/content-surfaces.md 'Store A'/'Store B'

**Folded in.** ARTIFACTS-001; duplication content-surfaces consequence #1

### WEB-35 — Artifacts gallery nav copy falsely claims 'account-scoped' storage for artifacts that are browser-local only

`HIGH` · web · effort ?

**What.** duplication/content-surfaces.md consequence #2: app-nav-items.ts:101-112 describes the gallery as 'account-scoped', but for web-originated artifacts the only backing store is browser localStorage (see WEB-34) — false for the majority of its content, and exactly the fake-availability claim class CLAUDE.md forbids.

**Done when.** Correct the nav/gallery copy now, or stop claiming account-scoped until the web push path in WEB-34 exists.

**Where.** `apps/web/shared/components/layout/app-nav-items.ts:101-112`, `apps/web/features/chat/stores/artifacts-store.ts`

**Blocked by.** honest fix depends on WEB-34 or a copy change

**From.** audit/competitive-gap-2026-08-15/duplication/content-surfaces.md

### WEB-37 — Collapsed-sidebar 'Settings' gear does not open Settings — it routes to the dead-end /settings/voice sub-page

`HIGH` · web · effort S

**What.** SETTINGS-001 / settings-27-gap: WebSidebar's handleNavClick maps id 'settings' to view 'voice-settings' -> /settings/voice ('Managed voice is not available.'), never calling openSettings() as every other entry point does. FIXES-APPLIED.md closed only the other half of this gap (a nav entry for /settings/voice via VoiceSection.tsx); the miswired gear itself is not recorded as fixed.

**Done when.** Change WebSidebar's handleNavClick so id 'settings' calls openSettings('general') like the composer, WebChatPage, WebAppShell and CloudCodePage do.

**Where.** `apps/web/features/chat/v3/WebSidebar.tsx:119-125,200-216`, `apps/web/features/chat/v3/WebShellV3.tsx:30-41`

**From.** audit/parity-2026-08-15 — SETTINGS-001; audit/competitive-gap-2026-08-15 — settings-27-gap (nav half resolved)

### WEB-38 — WebSidebar renders a second, incomplete 2-item nav rail on the live /chat/code route, and CloudCodePage bypasses WebAppShell

`HIGH` · web · effort ?

**What.** duplication/chat-shells.md Finding 3: navItemsForMode('code') returns only Desktop app + VS Code extension against the canonical 8-destination app-nav-items.ts rail; its collapsed RAIL_ITEMS show MORE links than its own expanded state; the collapsed Settings icon maps to /settings/voice. CloudCodePage.tsx builds its own shell div rather than using WebAppShell.

**Done when.** Migrate /chat/code onto WebAppShell + buildAppNavItems before deleting the rest of the v3 cascade, then delete WebSidebar.tsx and resolveWebViewRoute.

**Where.** `apps/web/features/chat/v3/WebSidebar.tsx:93-125,200-218`, `apps/web/features/code/CloudCodePage.tsx:29-30,274-287`

**From.** audit/competitive-gap-2026-08-15/duplication/chat-shells.md Finding 3; all-axes.json#chat-shells[2], #settings-and-nav[0]

### WEB-53 — Connector browse/connect/add/disconnect is implemented twice (ConnectorsPage vs settings-modal ConnectorsPanel) and has already drifted three ways

`HIGH` · web · effort ?

**What.** duplication/extension-surfaces.md §2.1: the modal's ConnectorsPanel is what >99% of real usage hits (ConnectorsPage.tsx renders only for signed-out visitors and the Clerk-loading window). Proven drift: disconnect confirmation exists only in ConnectorsPage's copy — the modal's handleDisconnect fires with zero confirmation; and the new 'paste MCP config as JSON' parity feature was added exclusively to ConnectorsPage.tsx, the copy signed-in users never see.

**Done when.** Make the modal's ConnectorsPanel/AddCustomConnectorForm canonical; render it from ConnectorsPage in a logged-out-safe mode or strip that page to non-interactive marketing content, and port the JSON-import feature into the modal before shipping it.

**Where.** `apps/web/features/connectors/pages/ConnectorsPage.tsx`, `packages/ui/ui/src/settings-modal/SettingsModal.tsx:1028-1239,392-395,1339`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.1; all-axes.json#extension-surfaces[0]

### AI-46 — No context-window usage visibility in the web chat composer; older turns are silently trimmed

`MEDIUM` · ai-routing · effort M

**What.** MODELS-003. context-window.ts silently trims oldest turns once a conversation exceeds a 48k-char/model budget and nothing in web's composer or UI signals it. Mobile already ships ContextWarningChip at a 70% threshold; web has no equivalent.

**Done when.** Estimate live context usage client-side (or thread a computed percentage via a response header) and render a warning chip in the composer once usage crosses a threshold, porting mobile's ContextWarningChip pattern.

**Where.** `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:1-60`, `apps/web/features/chat/components/tokens/TokenUsageDisplay.tsx:1-134`, `apps/mobile/src/features/chat/components/ContextWarningChip.tsx`

**From.** audit/parity-2026-08-15/gaps/domain-models.json MODELS-003

### DOCS-23 — AGI Work and the scheduling/task surfaces carry no maturity or beta disclosure anywhere

`MEDIUM` · docs · effort S

**What.** agentic-modes-gap-10: no 'Beta'/'BETA' string anywhere in WorkSessionPanel.tsx, the composer work-mode toggle or TasksPage.tsx, despite prior-audit findings in this exact domain (dead background agents, opt-in durability, no mid-run steering, zero-tool scheduled runs) showing AGI Work is demonstrably rougher than finished. sched-gap-16: grep for BETA|Beta|Alpha in the schedules/tasks components returns zero hits, while CLAUDE.md states Managed Cloud is 'public alpha, open by default' — a status not surfaced where a user creates an unattended, sometimes-billed automation.

**Done when.** Add a maturity badge to the AGI Work toggle and WorkSessionPanel header and to the schedule-creation surface; the underlying expectation-setting gap is worth a deliberate founder decision, not just a cosmetic badge.

**Where.** `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`, `apps/web/features/schedules/`

**From.** audit/competitive-gap-2026-08-15/domains/agentic-modes.json agentic-modes-gap-10; audit/competitive-gap-2026-08-15/domains/scheduled-tasks-automation.json sched-gap-16; audit/competitive-gap-2026-08-15 — agentic-modes-gap-10 (agentic-16); sched-gap-16 (sched-22)

**Folded in.** agentic-modes-gap-10; sched-gap-16; No maturity/Beta disclosure anywhere in the AGI Work, scheduling or task UI

### INFRA-57 — Unverified whether a schedule bound to a soft-deleted conversation keeps firing or orphans

`MEDIUM` · infra/ci · effort S · **unclear**

**What.** agentic-modes-gap-07. Conversation delete is a soft delete (sets deleted_at, apps/web/app/api/chat/conversations/[id]/route.ts:233-242) and the delete dialog names no dependent objects. Whether a schedule tied to a soft-deleted conversation keeps firing (burning paid turns against a conversation the user believes is gone) or silently orphans was explicitly flagged unverified.

**Done when.** Trace the run-schedules sweep against a soft-deleted conversation and decide the behaviour deliberately; then update the delete-confirmation copy to name dependent schedules when present.

**Where.** `apps/web/app/api/chat/conversations/[id]/route.ts:233-242`, `apps/web/app/api/cron/run-schedules/route.ts`, `apps/web/features/chat/components/Sidebar/ConversationListItem.tsx:320-323`

**From.** audit/competitive-gap-2026-08-15/domains/agentic-modes.json agentic-modes-gap-07

### SEC-80 — Multi-factor authentication is TOTP-only — no passkey/WebAuthn, no SMS MFA, no trusted-device list

`MEDIUM` · security/auth · effort L

**What.** SETTINGS-008 (audit/parity-2026-08-15, prior GAP-115 'Not Planned, pending account contracts') and settings-25-gap (competitive-gap-2026-08-15). SecuritySection.tsx:145-146,193 honestly discloses that passkeys, security keys, SMS MFA and trusted-device lists are unavailable in the current account contract; only TOTP authenticator codes exist, against a majority-benchmark pattern of independently toggleable methods. Distinct from SEC-42 (legacy plaintext TOTP secrets / KDF-less TOTP encryption key) and from DESK-54 (desktop MFA gate declined for lack of backing APIs).

**Done when.** Add at least one second independently-toggleable MFA method (passkey/WebAuthn preferred, SMS as fallback) once account-contract work allows; keep the honest disclosure copy until it ships.

**Where.** `apps/web/features/settings/sections/SecuritySection.tsx:145-146,193`

**From.** audit/parity-2026-08-15/gaps/domain-settings (SETTINGS-008; prior GAP-115); audit/competitive-gap-2026-08-15/domains/settings (settings-25-gap); audit/parity-2026-08-15 — SETTINGS-008 (GAP-115); audit/competitive-gap-2026-08-15 — settings-25-gap (settings-25)

**Folded in.** SETTINGS-008; settings-25-gap; Multi-factor authentication is TOTP-only — no passkey/WebAuthn, SMS, or trusted-device list

### UI-01 — Three rich-format card parsers (Comparison/Steps/Calculation) are unaudited for the content-dropping bug proven in RecipeCard

`MEDIUM` · ui · effort M

**What.** Four heuristic markdown-to-card parsers 'continue' past unrecognised lines and can silently drop content. RecipeCard was proven lossy and fixed; ComparisonCard, StepsCard and CalculationCard have never been audited for the same bug class. Mitigated by an 'Original response' toggle, so a gap costs a click rather than the answer — but the loss is invisible without it.

**Done when.** Each rich-format card parser either round-trips every line of the source response or falls back to plain rendering, proven by a test on content it cannot classify.

**Where.** `apps/web/features/chat/components/cards/StepsCard.tsx`, `apps/web/features/chat/components/cards/`

**From.** known-flaws.md (WEB-FORMAT-CARD-LOSSY-PARSE)

### UI-02 — Chat message surface gaps: no camera capture, no per-message report, no image carousel, no accessible interactive tables

`MEDIUM` · ui · effort L

**What.** No camera-capture decision, no per-message report/feedback path with privacy-safe telemetry, no image-carousel renderer, and no accessible interactive tables. Streaming, stop, retry, edit-branch and reconnect states are untested. The desktop AttachmentMenu offers only 'Take a screenshot' with no webcam item and the desktop MessageBubble has no report/flag control at all, while web and mobile do — so the shared components are the right place to close this.

Also recorded by a later audit (Camera capture in composer — wired (wire-or-cut 2026-08-06)): CONTRADICTS 'no camera capture': CameraCaptureDialog was added to the composer attachment menu with a required preview and stream teardown on unmount/cancel. Re-verify; if it landed, UI-02 narrows to the remaining three gaps.

Also recorded by a later audit (Report a response — web report path wired (wire-or-cut 2026-08-06 trust/legal/safety surfaces)): CONTRADICTS 'no per-message report': a durable sink existed only at /api/mobile/content-report; wire-or-cut records a /api/content-report alias plus a per-message action added on web. Re-verify; note DPDP-31/MOB-27 remain — nothing routes those reports to a human reviewer.

Also recorded by a later audit (Structured result tables Missing/Partial across Web/Desktop/Mobile/CLI (parity-implementation-matrix)): Restates the 'no accessible interactive tables' half as a cross-surface row: sortable/paginated/exportable tabular tool output is not consistently implemented on any of Web, Desktop, Mobile or CLI.

**Done when.** The message surface offers the same capture and report affordances on every surface that claims them, and streaming/stop/retry/branch/reconnect are covered by tests.

**Where.** `packages/ui/unified-chat/src/components/AttachmentMenu.tsx:284-291`, `packages/ui/unified-chat/src/components/MessageBubble.tsx`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-01: Chat/message surface: camera capture, per-message report, image carousel, interactive tables all missing or undecided; phase4 PP-01: Desktop composer lacks a camera-capture item and the desktop assistant bubble has no report/flag control

### UI-04 — Web search has no persistent on-screen indicator, no mode control, unimplemented filters, and no vertical result cards

`MEDIUM` · ui · effort L

**What.** Web search is ambient by deliberate design (the manual toggle was removed), but the composer has no standing indicator of whether search is active for the current model — activeToolLabels pushes 'Web search' only into a transient queued-follow-up chip. There is no off/manual/automatic mode control, domain/date/source-quality filters are unimplemented, and there are no weather/sports/finance/shopping/travel/maps vertical cards. Untested for provider timeout, malformed results, and prompt injection. Marketing copy still describing a deleted toggle is owned by the docs slice.

**Done when.** A user can tell at a glance whether the current turn will search the web, and the filters the product offers actually constrain the search.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1342-1346,1531,1689,3120`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md

**Folded in.** PP-03: Web Search: no explicit mode toggle, filters unused, no vertical cards; phase4 PP-03: Web composer lacks a persistent on-screen indicator of ambient web search

### UI-08 — Live artifacts (refresh policy, connector binding, refresh worker) are approved but unbuilt

`MEDIUM` · ui · effort XL

**What.** Founder-approved 2026-08-05: a refresh-policy plus connector-binding model, refresh worker, and host UI reusing the artifact-sync poll skeleton and sandbox render pipeline. Nothing is built. Distinct from the artifact-runtime-bridge work (CAP-052), which is a separate NO-GO security gate owned by the security slice.

Also recorded by a later audit (Live artifacts (CAP-050) approved, not yet built (parity-implementation-matrix)): Preserves the founder-approval id CAP-050 (Creation-four item, sequenced after Class-1) and the matrix row 'Live artifacts — Partial/Missing' covering long-running/live artifact state, refresh, share/publish and owner/session. The mislabelled 'Live artifacts' nav entry is filed separately as WEB-66.

**Done when.** An artifact bound to a data source refreshes on a declared policy, with the binding and refresh state visible to the user.

**From.** audit/capability-gaps.csv (CAP-050); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### UI-10 — Personalization is fragmented across three incompatible vocabularies, the shared composer style is never persisted, and web lacks the tone controls mobile ships

`MEDIUM` · ui · effort L

**What.** Web PresetStyle, shared/desktop WritingStyle and mobile PersonalizationStyle are three different unions; the web-only style-store fix never reached the other two. In the shared composer, style is plain useState<WritingStyle|null>(null) with no account or localStorage write, so 'Use style -> concise' silently reverts on remount or restart. Styles otherwise live in device-only localStorage instead of account/project/device scope with deterministic precedence, and response-length/style controls are incomplete across surfaces. Web Personalization lacks the style-preset selector and characteristic sliders mobile already has, and no 'effective settings' surface exists anywhere. Cross-surface sync of custom instructions to mobile is owned by the mobile slice.

Also recorded by a later audit (No unified personalization hub — memory, capabilities, reflect and instructions are separate flat settings nav entries (memory-08-gap)): Quantifies the fragmentation: SETTINGS_NAV_GROUPS_WEB (settings-nav.ts:143-145,161,175,279-303) lists capabilities / connectors / memory / reflect as flat sibling entries with no parent grouping — measurably wider fragmentation than even the two-section split competitors use. Fix suggestion: group Memory, Capabilities' memory toggles and Reflect under a single 'Personalization' nav parent with sub-items, without merging their distinct data models.

**Done when.** One personalization vocabulary is shared across surfaces, a chosen style survives a reload, and the user can see which instructions and style are actually in force for the current turn.

**Where.** `packages/ui/unified-chat/src/components/ChatInput.tsx:291`, `apps/web/features/chat/stores/style-store.ts:21`, `packages/ui/unified-chat/src/lib/writingStyle.ts:2`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-08: Styles/personalization: device-only localStorage, incomplete cross-surface controls; phase4 PP-08: Three incompatible style vocabularies; desktop/shared composer style not persisted; no effective-settings surface; GAP-261: Web Personalization lacks style/tone + characteristics controls that mobile already has; GAP-262: No 'Fast answers' or 'Suggested prompts' toggles on any surface

### UI-12 — Keyboard shortcuts are read-only on web and defined by three disconnected default sets across surfaces

`MEDIUM` · ui · effort L

**What.** KeyboardShortcutsDialog.tsx renders key badges with no click or edit handler — no per-shortcut toggle, remap, or Restore defaults. Underneath, keyboard-shortcut defaults exist in three independent arrays with no single command registry generating the settings UI, command palette, help text and registration, and no collision/migration/reset tests. The desktop-side disconnection between the settings UI and runtime dispatch is owned by the desktop slice.

Also recorded by a later audit (Keyboard shortcut documentation — three drifted lists consolidated (wire-or-cut 2026-08-06)): Names the concrete drift that was fixed: Escape, Cmd+Shift+C and Cmd+Shift+R all worked but appeared in none of the three parallel shortcut lists; consolidated onto KEYBOARD_SHORTCUT_DOCS with a bidirectional pinning test. UI-12's remaining scope is that web shortcuts are still read-only (not user-rebindable) and that surfaces still carry disconnected default sets (see also DESK-19).

**Done when.** One shortcut command registry drives the settings UI, command palette and runtime dispatch; a user can rebind and reset shortcuts, and collisions are detected.

**Where.** `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx`

**From.** AuditRemediationLedger.md; audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** HARD-015: Keyboard-shortcut defaults exist in three independent arrays; GAP-271: Keyboard shortcuts are read-only — no per-shortcut toggle, remap, or Restore defaults

### UI-13 — Notifications: preferences are grouped by channel instead of event, only one channel has a real sender, and stored push tokens are wired to nothing

`MEDIUM` · ui · effort L

**What.** NotificationsSection.tsx defines only browserReplyReady, consumed by WebChatPage at response completion — no other channel has a sender. Preferences are grouped by channel with per-channel booleans rather than by event with a channel picker; there is no usage-limit-reset category and no inline 'Manage tasks' deep link. More broadly there is no real push sender/delivery/retry, no email notifications, and no connector-expired/task-complete/approval-needed/quota/security/billing events, deep-link authorization checks, duplicate suppression, quiet hours, or delivery telemetry. Desktop notification-centre defects are owned by the desktop slice.

Also recorded by a later audit (Notification categories are grouped by channel, not offered as per-category channel selection (settings-16-gap)): Names the structure: NotificationsSection.tsx:20-38's CHANNEL_GROUPS group by channel first rather than one event-row with channel checkboxes. Records the team's own discipline that 5 toggles were deliberately deleted for having no backend sender and 2 re-added once real senders shipped — adopt the per-category-with-channel-checkboxes layout when adding more events, without re-introducing a channel toggle ahead of a real sender.

Also recorded by a later audit (Web notifications: 3 categories vs benchmark's 6-8, deliberately narrow (SETTINGS-012, GAP-119 Not Planned)): Records the deliberate decision so it is not re-raised as a gap: NotificationsSection.tsx exposes only categories with a real backend sender, and the 5 dead toggles were deleted rather than left decorative. No action unless a new sender (email digest, product updates) actually ships.

**Done when.** Notification preferences are organised by the events users care about, every listed channel has a working sender, and delivery is observable.

**Where.** `apps/web/features/settings/sections/NotificationsSection.tsx:41-62`

**From.** AuditRemediationLedger.md; audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-23: Notifications: stored push tokens not wired to a real sender/delivery system; GAP-119: Web Notifications exposes only the channel with a real sender; GAP-277: Notification preferences are grouped by channel instead of by event with a channel picker; GAP-278: No usage-limit-reset notification category and no inline 'Manage tasks' deep link

### UI-15 — Loading, progress, error, retry and cancel states have never been swept across touched screens, and neither has dark/light consistency

`MEDIUM` · ui · effort L

**What.** Both sweeps are recorded as outstanding TODOs from the demo-readiness cycle. The bug class they would catch is proven: a video generation in-flight state rendered as an invisible blank card because its only label was hidden behind motion-safe:opacity-0 (visible only to prefers-reduced-motion readers), which the founder hit live and reported as 'it did not work' while the backend was succeeding. List panels also lack a partial-failure state alongside empty and unselected.

**Done when.** Every screen that can load, fail, retry or cancel shows each of those states legibly in both themes, verified by a real pass rather than assumed.

**Where.** `apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx`

**From.** ExecutionPlan.md; audit/ui-gaps.md

**Folded in.** ExecutionPlan TODO: Loading/progress/error/retry/cancel states sweep incomplete; ExecutionPlan TODO: Dark-light consistency sweep across every touched screen incomplete; GAP-208: Adopt the partial-failure + empty + unselected triple-state pattern for list panels

### UI-16 — Remaining composer popovers are not portalled and will clip at small viewports

`MEDIUM` · ui · effort S

**What.** The mentions (@), project picker, and media aspect/quality/duration popovers still sit in the same overflow-hidden clipped column that made 'Add photos & files' unreachable before AnchoredComposerMenu (which portals to document.body) was introduced. They survive a 670px viewport today because they are shorter, but will cut off on a smaller window.

**Done when.** Every composer popover renders through the portalled anchored-menu primitive and stays fully visible at the smallest supported viewport.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`

**From.** ExecutionPlan.md (Website demo walkthrough TODO)

### UI-17 — Shared mention menu is unmounted — file and skill pickers exist but are not wired to the composer

`MEDIUM` · ui · effort M

**What.** CAP-041 records the existing file and skill pickers as needing to be mounted and connected to authoritative search; the mention menu itself is not shipped as a shared component.

**Done when.** Typing @ in the composer opens one shared mention menu backed by authoritative file, project and skill search on every surface that offers it.

**From.** audit/capability-gaps.csv (CAP-041)

### UI-18 — An expired session mid-turn loses the work: no preserved pending turn, no single-use resume after sign-in

`MEDIUM` · ui · effort L

**What.** CAP-040: when auth expires mid-turn the system does not reliably persist the pending turn and attachments, stop before unauthorized side effects, and resume via a single-use continuation token across web, desktop cloud shell, mobile and the extensions.

**Done when.** A turn interrupted by session expiry is preserved, blocked before any side effect, and resumed exactly once after the user signs back in.

**From.** audit/capability-gaps.csv (CAP-040)

### UI-21 — Shared UI packages may still be unwired for i18n, re-injecting English into every consuming surface

`MEDIUM` · ui · effort XL · **unclear**

**What.** Sources disagree. known-flaws records packages/ui/unified-chat (222 files) and packages/ui/ui (76 files) as returning zero for grep -rl useTranslation, with 2,075 missing keys overall and the note that because packages/ui/unified-chat is consumed by both web and desktop, every surface inherits hardcoded English regardless of locale until it is wired. ExecutionPlan #72 records the same finding as fixed (commit c5d67f7be), and #78 records the 2,075-key parity failure as fixed (49d509f47). Locale-specific legal/policy translation review is owned by the compliance and docs slices.

**Done when.** Confirm current i18n coverage in packages/ui and packages/ui/unified-chat, and ensure key parity is enforced so a shared component cannot ship hardcoded English.

**Where.** `packages/ui/ui/`, `packages/ui/unified-chat/`, `packages/ui/i18n/locales`

**From.** known-flaws.md; ExecutionPlan.md

**Folded in.** ExecutionPlan #72: Shared UI package: 0 of 154 component files use i18n; i18n translation debt: 2,075 missing keys, packages/ui 0 of 154 files wired for i18n; ExecutionPlan #78: Guardrail checks failing: i18n key parity (2,075 findings)

### UI-22 — Unmounted and duplicate production UI components are not inventoried or resolved

`MEDIUM` · ui · effort L

**What.** Existing search, message, history and notification components may be unmounted and undeleted, and multiple production paths remain for reasoning UI, approvals, checkpoints, browser replay, the notification center, the memory manager and artifact publishing. No classification of WIRE / REMOVE / test-only / generated-entry-point exists for orphan modules. The desktop-specific orphan inventory (22+ unreachable feature components, 20 feature directories) is owned by the desktop slice; this item covers the shared and web components.

**Done when.** Every shared and web UI component is either mounted on a reachable path or deleted, with duplicates collapsed to one owner.

**From.** AuditRemediationLedger.md

**Folded in.** PP-32 partial: Existing search/message/history/notification components may be unmounted and undeleted; SCALE-FIN-003: Unreachable duplicate implementations not removed; SCALE-FIN-001: Zero-import/zero-caller production modules not inventoried

### UI-32 — No path to reuse an existing Library file in a new conversation on web or desktop — no Library attach action and no 'Add from Library' composer entry

`MEDIUM` · ui · effort ?

**What.** PROJECTS-FILES-007 (prior GAP-020) and COMPOSER-003: the shared LibraryTransport interface both web and desktop implement has no attach-to-conversation callback anywhere in its type or in GeneratedFileCard, and the composer attach menus (AnchoredComposerMenu.tsx on web, the shared AttachmentMenu.tsx on desktop, 9 items including Google Drive and GitHub) have no in-app Library entry. The only reuse path is Download then manually re-attach. Mobile already ships the equivalent via AddToChatSheet.tsx's 'Attach from Library', forwarding an existing asset id without re-uploading bytes — confirmed CONFIRMED_DONE by the done-claim verification pass.

**Done when.** Add an onAttach callback to LibraryTransport and an 'Add from Library' item to AnchoredComposerMenu.tsx and AttachmentMenu.tsx, both routed through the asset-id-forwarding path mobile already proved out.

**Where.** `packages/ui/unified-chat/src/components/library/LibraryView.tsx:120-148,540-559`, `apps/web/features/chat/components/Composer/AnchoredComposerMenu.tsx`, `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:63,213,256-269`

**From.** audit/parity-2026-08-15 — PROJECTS-FILES-007 (GAP-020), COMPOSER-003

**Folded in.** PROJECTS-FILES-007; COMPOSER-003

### UI-41 — Design-token package exists but its two heaviest adopters bypass it with hundreds of hardcoded hex colours

`MEDIUM` · design-system · effort ?

**What.** CROSS-SURFACE-012: @agiworkforce/design-tokens is a real 437-line token file genuinely consumed by web (114 files), desktop (55 files) and the Chrome extension, yet a repo-wide grep found 252 hardcoded #rrggbb literals in apps/desktop/src and 95 in apps/web/features+shared — the same order of magnitude as an independently-run count (294/119).

**Done when.** Add an eslint rule flagging hex-literal colour strings scoped to apps/desktop/src and apps/web/features+shared, allowlisted at today's count and shrink-only from there.

**Where.** `packages/ui/design-tokens/src/index.ts`

**From.** audit/parity-2026-08-15 — CROSS-SURFACE-012

### UI-42 — apps/web's no-hardcoded-colour guard is not wired into CI and currently fails with 4 real violations

`MEDIUM` · design-system · effort S

**What.** DESIGN-SYSTEM-004: check:no-hex-web is defined in apps/web/package.json but a grep across .github finds zero matches — it is never invoked by any workflow. Running it on the clean tree fails with 4 violations (2 in app/brand-assets.test.ts, 2 in app/manifest.ts theme-color values). The equivalent Chrome-extension guard IS wired into CI and passes clean.

**Done when.** Add a check:no-hex-web CI step matching the extension's pattern, and fix the 4 current violations (named constant or EXCLUDE_FILES entry with rationale).

**Where.** `apps/web/scripts/check-no-hex-colors.mjs`, `apps/web/package.json:18`, `apps/web/app/manifest.ts:14-15`

**From.** audit/parity-2026-08-15 — DESIGN-SYSTEM-004

### UI-44 — Chat response-format cards inject un-tokenized rainbow gradients per card type with no contrast pass

`MEDIUM` · design-system · effort S

**What.** DESIGN-SYSTEM-006: CalculationCard, ComparisonCard, StepsCard and RecipeCard each hardcode a distinct raw Tailwind palette (blue / indigo-purple / teal-cyan / amber-orange gradients) instead of the app's --chat-\* tokens. None correspond to a semantic token, and none went through the documented AUDIT-FIX GOV-34 WCAG AA contrast pass every other chat.css pairing records.

**Done when.** Replace each card's header/border classes with the shared --chat-\* tokens, keep only icon colour as a light per-type accent, and drop the per-card gradient headers — a class rename across four files in one PR.

**Where.** `apps/web/features/chat/components/cards/CalculationCard.tsx:198-202`, `apps/web/features/chat/components/cards/ComparisonCard.tsx:195-199`, `apps/web/features/chat/components/cards/StepsCard.tsx:131`, `apps/web/features/chat/components/cards/RecipeCard.tsx:189`

**From.** audit/parity-2026-08-15 — DESIGN-SYSTEM-006

### UI-45 — Chat top bar uses an off-palette purple/blue gradient CTA and raw Tailwind greys instead of tokens

`MEDIUM` · design-system · effort S

**What.** DESIGN-SYSTEM-007: ChatTopBar.tsx:133-141's Dashboard button uses bg-gradient-to-r from-purple-500 to-blue-500 — a third colour identity matching neither sanctioned accent palette per the founder-decision comment in design-tokens/src/index.ts — and the adjacent Settings icon button uses raw Tailwind greys instead of --chat-text-\* tokens.

**Done when.** Swap the Dashboard button to bg-[var(--chat-accent-primary)] and the Settings button to text-[var(--chat-text-secondary)].

**Where.** `apps/web/features/chat/components/Main/ChatTopBar.tsx:133-141`

**From.** audit/parity-2026-08-15 — DESIGN-SYSTEM-007

### UI-46 — Shared EmptyState primitive is barely adopted, and local duplicates re-introduce the exact contrast bug it documents as fixed

`MEDIUM` · design-system · effort ?

**What.** DESIGN-SYSTEM-008: EmptyState.tsx's own comment records a real prior contrast fix (bg-muted/40%-alpha icon was ~1.2:1, resolved via bg-primary/10 + text-primary). Only 2 apps/web files import it; ArtifactsPanel.tsx and ResearchPanel.tsx each define a local function EmptyState() shadowing the shared name and using the exact low-contrast bg-muted/50 + text-muted-foreground/60 recipe the primitive's changelog documents as previously broken.

**Done when.** Delete the local EmptyState() functions and import the shared primitive, then migrate other local duplicates found via the broader 48-file heuristic.

**Where.** `packages/ui/ui/src/primitives/EmptyState.tsx:1-75`, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:56-70`, `apps/web/features/chat/components/research/ResearchPanel.tsx:104-117`

**From.** audit/parity-2026-08-15 — DESIGN-SYSTEM-008

### UI-47 — Accessibility component directory is entirely dead — no skip link in layout.tsx, and a mocked audit panel that always reports 'all checks passed'

`MEDIUM` · ui · effort ?

**What.** DESIGN-SYSTEM-009 (prior GAP-275): 8 files (650 lines) under apps/web/shared/components/accessibility/ have zero imports anywhere under app/features/components — including SkipLink/SkipLinks, so app/layout.tsx has no skip-to-content link at all. AccessibilityAudit.tsx wires its display to a hardcoded object ('Mock accessibility service … since monitoring was archived'); runAudit() always resolves score:95/failed:0 and generateReport() always returns 'All checks passed!' regardless of page state. Note wire-or-cut.md records a 2026-07-30 removal of an 'orphaned Web a11y utility UI' — this directory survived that pass and still contains the fake audit.

**Done when.** Mount the already-built <SkipLink href="#main-content"> in layout.tsx; delete AccessibilityAudit.tsx and the other unused wrappers, or wire it to real axe results before any dev-tools surface exposes it.

**Where.** `apps/web/shared/components/accessibility/AccessibilityAudit.tsx:1-50`, `apps/web/shared/components/accessibility/SkipLink.tsx`, `apps/web/app/layout.tsx`

**From.** audit/parity-2026-08-15 — DESIGN-SYSTEM-009 (GAP-275)

### UI-51 — Web's follow-up message queue holds only one slot and cannot be edited in place

`MEDIUM` · ui · effort ?

**What.** COMPOSER-005: pendingQueueRef is a single object, not an array, and the code comment at line 1706 states outright 'Only the latest queued message is kept' — a second send-while-queued silently overwrites the pending draft. The only control is cancelQueuedMessage, which clears it entirely; no editQueuedMessage exists.

**Done when.** Change pendingQueueRef to an array, render each queued item as its own dismissible row, and add an inline edit affordance that repopulates the textarea and replaces that slot on re-send.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:389-407,1704-1721,1848-1867`

**From.** audit/parity-2026-08-15 — COMPOSER-005

### UI-56 — No inline file-diff (red/green line) view in the chat transcript for file-edit tool results

`MEDIUM` · ui · effort ?

**What.** RENDERING-007: the only place a tool result renders in the shared ToolCallCard is a generic <pre>{result}</pre> block — no diff renderer exists. Desktop already has two real diff viewers (EnhancedDiffViewer, GitDiffViewer) but they live only in the separate Code/Git workspace, unreachable from a chat-transcript tool call.

**Done when.** Detect file-edit-shaped tool results in ToolCallCard and render through a shared lightweight diff component reusing desktop's existing viewer logic.

**Where.** `packages/ui/unified-chat/src/components/ToolCallCard.tsx:333-342`, `apps/desktop/src/features/editing/EnhancedDiffViewer.tsx`

**From.** audit/parity-2026-08-15 — RENDERING-007

### UI-57 — Citations render as a flat trailing chip row with only a native tooltip, and the Chrome extension has no citation UI at all

`MEDIUM` · ui · effort ?

**What.** RENDERING-008, CLR-07 (composer-17), CLR-08 (composer-18) and sched-gap-10 (sched-14): InlineSourceTags.tsx renders a numbered circular index badge plus title/hostname in a single trailing flex-wrap row after the entire message, with only a title attribute; mobile's CitationChip.tsx is the same shape; the extension renders citations as raw markdown links. There is no rich popover (favicon, snippet), no claim-adjacent positioning and no end-of-answer source-card row. ResearchPanel's SourceRow already implements a favicon-with-fallback pattern that the message-level component does not reuse.

**Done when.** Add a rich hover/focus popover (favicon, title, snippet) to InlineSourceTags/CitationChip and consider claim-adjacent positioning; port the same pattern into the extension side panel.

**Where.** `apps/web/features/chat/components/messages/InlineSourceTags.tsx:17-54`, `apps/mobile/src/features/chat/components/CitationChip.tsx:1-47`, `packages/ui/unified-chat/src/components/CitationPill.tsx`, `apps/web/features/chat/components/messages/InlineSourceTags.tsx:1-54`

**From.** audit/parity-2026-08-15 — RENDERING-008; audit/competitive-gap-2026-08-15 — CLR-07, CLR-08, sched-gap-10; audit/parity-2026-08-15 RENDERING-008; audit/competitive-gap-2026-08-15 CLR-07; audit/competitive-gap-2026-08-15 CLR-08

**Folded in.** RENDERING-008; CLR-07; CLR-08; sched-gap-10; Citations are a flat trailing chip row with only a native tooltip, and the Chrome extension has no citation UI at all

### UI-58 — Two parallel, architecturally inconsistent mechanisms decide whether to render a rich message card

`MEDIUM` · ui · effort ?

**What.** RENDERING-010: InteractiveCardBlock.tsx is a clean schema-versioned system (backend emits typed kind/body/fallback) while cards/index.tsx's detectCardType is a separate regex heuristic scanning raw markdown for structural signals (ingredients, 'vs.', 'step N'). Both run in the same message-render path with different false-positive risk profiles. Distinct from UI-01, which is about the parsers dropping content.

**Done when.** Migrate Recipe/Comparison/Steps/Calculation into the same schema-versioned InteractiveCard registry as clarify.v1/map-search.v1 and retire the regex detectCardType heuristic.

**Where.** `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:33-42`, `apps/web/features/chat/components/cards/index.tsx:26-77`, `apps/web/features/chat/components/messages/MessageBubble.tsx:1267-1274`

**From.** audit/parity-2026-08-15 — RENDERING-010

### UI-71 — Two same-named artifactStore Zustand stores and two ArtifactPanel implementations, with no documented split

`MEDIUM` · ui · effort ? · **unclear**

**What.** duplication/components.md §7: apps/desktop/src/stores/artifactStore.ts and packages/ui/unified-chat/src/stores/artifactStore.ts share a name and do not share state. Desktop's panel imports Tauri-only @tauri-apps/plugin-shell and is gated privacyMode==='local' (suggesting an intentional local-vs-managed split per a 'DES-C05' comment), but unlike DesktopLibrary.tsx neither file documents the split, and it was never runtime-verified whether both panels can mount simultaneously for the same artifact.

**Done when.** Runtime-verify on a real desktop build whether opening a managed-cloud artifact ever shows both panels or conflicting state; document the split if intentional, collapse it if not.

**Where.** `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`, `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`, `apps/desktop/src/stores/artifactStore.ts`, `packages/ui/unified-chat/src/stores/artifactStore.ts`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §7; all-axes.json#components[6]

### UI-74 — Confirm-before-destructive-action dialog copy-pasted three times while the settings modal's connector disconnect still has no confirm step

`MEDIUM` · ui · effort ?

**What.** duplication/extension-surfaces.md §2.2: the same confirm-dialog block was added twice in one file (DirectoryBrowse's plugin tab and PluginsPanel's table view), both citing CPS-03 and 'mirroring apps/web ConnectorsPage's Disconnect/Remove-custom-connector Dialogs' — a third hand-copy — while ConnectorsPanel's own disconnect action in the same file has no confirm step at all. FIXES-APPLIED.md's useConfirm() rollout covered conversation/project/message deletes, archive-all, permanent-delete and plugin removal, but not connector disconnect.

**Done when.** Extract one shared confirm-dialog primitive (useConfirm()) used by DirectoryBrowse, PluginsPanel and ConnectorsPanel's disconnect action alike.

**Where.** `packages/ui/ui/src/settings-modal/SettingsModal.tsx:~482,974-1006,~1749,2014-2046`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.2; all-axes.json#extension-surfaces[1]

### UI-79 — No context-window usage visibility in the web chat composer

`MEDIUM` · ui · effort ?

**What.** MODELS-003: context-window.ts silently trims oldest turns once a conversation exceeds a 48k-char/model budget, and nothing in web's composer or UI signals it is happening. Mobile already ships ContextWarningChip at a 70% threshold; web has no equivalent (TokenUsageDisplay shows per-message usage, not remaining window).

**Done when.** Estimate live context usage client-side or thread a computed percentage via a response header, and render a warning chip in the composer once usage crosses a threshold, porting mobile's ContextWarningChip pattern.

**Where.** `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:1-60`, `apps/web/features/chat/components/tokens/TokenUsageDisplay.tsx:1-134`, `apps/mobile/src/features/chat/components/ContextWarningChip.tsx`

**From.** audit/parity-2026-08-15 — MODELS-003

### UI-86 — Only Web has a Personal/Team workspace switcher; Desktop and Mobile have none

`MEDIUM` · ui · effort M

**What.** SHELL-NAV-IA-005: WorkspaceMenuItems.tsx on Web is a complete, working Personal/Team switcher with live-selection state; Desktop's AccountMenu.tsx has no equivalent and neither does Mobile, despite Team being a real shared feature backed by the Clerk organization-overview API the web backend already exposes.

**Done when.** Port a thin equivalent of WorkspaceMenuItems into Desktop's AccountMenu using the same Clerk organization-overview API, then add the same to Mobile.

**Where.** `apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:1-77`, `apps/desktop/src/features/v3/AccountMenu.tsx`

**From.** audit/parity-2026-08-15 SHELL-NAV-IA-005; audit/parity-2026-08-15 — SHELL-NAV-IA-005

**Folded in.** Only web has a Personal/Team workspace switcher; desktop and mobile have none

### UI-87 — Shared unified-chat settings store carries six remaining dead field/setter pairs after toolAccessMode was deleted

`MEDIUM` · ui · effort M

**What.** SETTINGS-005: inlineVisualizationsEnabled/toggleInlineViz, notifyCompletions/notifyAgentUpdates/notifyResearch and memorySearchChats/memoryGenerateFromHistory are all defined in packages/ui/unified-chat/src/stores/settingsStore.ts with zero read or call sites anywhere in web or desktop. The seventh pair, toolAccessMode/setToolAccessMode, was deleted outright by the FIXES-APPLIED remediation wave as dead code (settings-21-gap, outcome DELETED_DEAD_CODE) — the remaining six were not.

**Done when.** Wire each remaining pair into its corresponding settings section, or delete it the same way toolAccessMode was, rather than leaving store fields nothing reads.

**Where.** `packages/ui/unified-chat/src/stores/settingsStore.ts:24,39-45,51,55-61`

**From.** audit/parity-2026-08-15 SETTINGS-005; audit/competitive-gap-2026-08-15 settings-21-gap

### UI-89 — No inline file-diff view for file-edit tool results in the chat transcript, though desktop already ships two diff viewers elsewhere

`MEDIUM` · ui · effort M

**What.** RENDERING-007: the only place a tool result renders in the shared ToolCallCard is a generic <pre>{result}</pre> block — no diff renderer exists. Desktop already has two real diff viewers (EnhancedDiffViewer.tsx, GitDiffViewer.tsx) but they live only in the separate Code/Git workspace, unreachable from a chat-transcript tool call.

**Done when.** Detect file-edit-shaped tool results in ToolCallCard and render through a shared lightweight diff component, reusing desktop's existing diff viewer logic.

**Where.** `packages/ui/unified-chat/src/components/ToolCallCard.tsx:333-342`, `apps/desktop/src/features/editing/EnhancedDiffViewer.tsx`, `apps/desktop/src/features/git/GitDiffViewer.tsx`

**From.** audit/parity-2026-08-15 RENDERING-007

### UI-91 — Web and Desktop Capabilities settings lack Artifacts, code-execution, network-egress and tool-access-mode controls, with desktop's tab self-documenting them as unfinished

`MEDIUM` · ui · effort M

**What.** SETTINGS-006: web's CapabilitiesSection.tsx exposes only 3 Memory toggles, and Desktop's CapabilitiesTab self-documents Artifacts / code-exec / network-egress / domain-allowlist toggles as unfinished in its own source comment (apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:30 also carries the forward-looking tool-access-mode comment for a pass that never landed).

**Done when.** Add Artifacts, code-execution, network-egress and tool-access-mode controls to Capabilities settings on Web and Desktop, and remove the in-code 'future pass' comments once real.

**Where.** `apps/web/features/settings/sections/CapabilitiesSection.tsx`, `apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:30`

**From.** audit/parity-2026-08-15 SETTINGS-006; audit/competitive-gap-2026-08-15 CPS-17

### UI-92 — Library has no 'reuse this file in a new conversation' action on web or desktop, though mobile already ships it

`MEDIUM` · ui · effort M

**What.** PROJECTS-FILES-007 (prior GAP-020, mobile side CONFIRMED_DONE): the shared LibraryTransport interface that both web and desktop implement has no attach-to-conversation callback anywhere in its type or in GeneratedFileCard's rendering, so the only way to reuse a Library file is Download then manual re-attach via the composer file picker. Mobile already shipped the equivalent (AddToChatSheet.tsx's 'Attach from Library', forwarding an existing asset id without re-uploading bytes), confirmed by the done-claim verification pass.

**Done when.** Add an onAttach callback to LibraryTransport and wire it on web and desktop to push the selected item's existing asset id into the composer via the same asset-id-forwarding path mobile already proved out.

**Where.** `packages/ui/unified-chat/src/components/library/LibraryView.tsx:120-148,540-559`, `apps/mobile/src/features/library/index.tsx`

**From.** audit/parity-2026-08-15 PROJECTS-FILES-007; audit/ui-gaps GAP-020

### UI-96 — Shared unified-chat settings store ships dead field/setter pairs with zero readers and zero writers

`MEDIUM` · ui · effort S

**What.** SETTINGS-005. inlineVisualizationsEnabled/toggleInlineViz, notifyCompletions/notifyAgentUpdates/notifyResearch, and memorySearchChats/memoryGenerateFromHistory are all defined in packages/ui/unified-chat/src/stores/settingsStore.ts:24,39-45,51,55-61 with zero read or call sites anywhere in web or desktop. The seventh pair, toolAccessMode/setToolAccessMode, was DELETED as dead code by the FIXES-APPLIED remediation wave (settings-21-gap) rather than wired — establishing deletion as the accepted precedent for this class.

**Done when.** Wire each remaining pair into its corresponding settings section, or delete it following the toolAccessMode precedent.

**Where.** `packages/ui/unified-chat/src/stores/settingsStore.ts:24,39-45,51,55-61`

**From.** audit/parity-2026-08-15/gaps/domain-settings.json SETTINGS-005; audit/parity-2026-08-15 — SETTINGS-005; audit/competitive-gap-2026-08-15 — settings-21-gap (toolAccessMode deleted)

**Folded in.** Shared unified-chat settings store carries dead field/setter pairs with zero readers or writers

### WEB-06 — Image aspect-ratio labels lie: six advertised ratios collapse to three actual output sizes

`MEDIUM` · web · effort S

**What.** ChatComposerNew.tsx maps both 3:4 and 9:16 to 1024x1792 (and both 4:3 and 16:9 to 1792x1024); the Google path then re-derives the ratio purely from width>height. Selecting 'Portrait 3:4' silently produces a 9:16 image with no notice to the user.

**Done when.** Each offered aspect ratio produces an image at that ratio, or ratios the provider cannot honour are not offered.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:248-255`, `apps/web/app/api/media/image/generate/route.ts:482-487`

**From.** phase4-capability-audit.md (PP-18)

### WEB-07 — /integrations and /apps form a dead navigation loop

`MEDIUM` · web · effort M

**What.** Redirects, CTAs, auth middleware behaviour, locale variants and deep links for integrations were never traced to one canonical route, and no route tests prevent redirect cycles.

**Done when.** One canonical integrations route exists; every redirect, CTA, locale variant and deep link resolves to it, pinned by a route test that fails on a redirect cycle.

**From.** AuditRemediationLedger.md (CRIT-008)

### WEB-08 — Public /skills page is sitemap-indexed and the CTA target of marketing pages but redirects anonymous visitors straight to /login with no explanation

`MEDIUM` · web · effort S

**What.** apps/web/app/skills/page.tsx redirects any anonymous visitor to /login?redirectTo=%2Fskills, while sitemap.ts lists /skills at priority 0.8 and the features/plugins page links 'Browse Skills' to it. Search traffic and marketing clicks both land on an unexplained login wall.

**Done when.** An anonymous visitor to /skills either sees a public read-only catalogue or an explicit explanation of why sign-in is required; the sitemap and marketing CTAs match whichever is chosen.

**Where.** `apps/web/app/skills/page.tsx:18-22`, `apps/web/app/sitemap.ts:75`

**From.** phase4-capability-audit.md (PP-17)

### WEB-100 — Capabilities settings expose only three memory toggles — no Artifacts, code-execution, network-egress or tool-access-mode controls

`MEDIUM` · web · effort ?

**What.** SETTINGS-006 and settings-05-gap: web's CapabilitiesSection.tsx state is exactly {memory, generateFromHistory, allowToolAssistedGeneration}; desktop's CapabilitiesTab self-documents Artifacts/code-exec/network-egress/domain-allowlist toggles as unfinished in its own source comment. Grep for network/egress/domain/allowlist across web and desktop settings returns zero hits.

**Done when.** Add Artifacts, code-execution, network-egress and tool-access-mode controls to Capabilities on web and desktop — but only where a real enforcement point exists (see SEC-05/SEC-06), not as decorative toggles.

**Where.** `apps/web/features/settings/sections/CapabilitiesSection.tsx:13-17`

**From.** audit/parity-2026-08-15 — SETTINGS-006; audit/competitive-gap-2026-08-15 — settings-05-gap

**Folded in.** SETTINGS-006; settings-05-gap

### WEB-101 — No accent colour or contrast control on web, though mobile and desktop both have one

`MEDIUM` · web · effort ?

**What.** SETTINGS-007: GeneralSection.tsx offers only System/Light/Dark appearance — no accent colour or contrast picker.

**Done when.** Add an accent-colour/contrast picker to web's General/Appearance settings, driven by the shared design tokens.

**Where.** `apps/web/features/settings/sections/GeneralSection.tsx`

**From.** audit/parity-2026-08-15 — SETTINGS-007

### WEB-112 — Legacy apps/web/shared/ tree (~198 files, ~130 knip-flagged unused) carries a superseded 'AI employee marketplace' product framing

`MEDIUM` · web · effort L

**What.** DEAD-CODE-007. shared/types/store-types.ts and shared/types/index.ts define AIEmployee/MarketplaceEmployee/AIEmployeePerformance types from a superseded product framing. Only 6 files anywhere in the live app import from @/shared/, and those are either part of the dead v3/UnifiedChatPage cascade or pull one narrow utility. Last touched by a 2026-07-29 cleanup commit titled 'close unmounted surface sweep' that did not finish.

**Done when.** Delete apps/web/shared/ in one pass after confirming via knip that no file outside it survives on an import from it; triage the 6 exception files individually first.

**Where.** `apps/web/shared/types/index.ts`, `apps/web/shared/types/store-types.ts`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-007

### WEB-113 — A second, orphaned 'share a conversation' backend duplicates the live one, over its own table and public route

`MEDIUM` · web · effort S

**What.** DEAD-CODE-008. The live Share button calls POST /api/share -> shared_sessions -> /share/[token]. A second fully-implemented POST/GET /api/shared -> shared_conversations -> /shared/[id] path has zero UI callers; the live path's own test explicitly asserts it does NOT use the legacy /api/shared route.

**Done when.** Delete /api/shared, /shared/[id]/page.tsx and the shared_conversations table, unless a maintainer confirms /shared/<id> links were ever issued in production — in which case document the compatibility reason instead.

**Where.** `apps/web/app/api/shared/route.ts`, `apps/web/app/shared/[id]/page.tsx`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-008

### WEB-114 — A materially complete conversation-export feature (Markdown/PDF/DOCX) is fully built and totally unreachable inside the dead v3 cascade

`MEDIUM` · web · effort M

**What.** DEAD-CODE-009 and duplication/chat-shells.md Finding 1. EnhancedExportDialog.tsx is built, tested and barrel-exported but has zero importers outside the dead UnifiedChatPage/WebShellV3 tree — the live chat header ships only a Print action. knip widens the blast radius to ~30 files in the same cascade (ChatHeader.tsx, ChatTopBar.tsx, the entire Sidebar/Tools/workflows subdirectories, use-export-conversation.ts, conversation-export.ts, document-export.ts). A real, working, tested feature is invisible to every user and to product review.

**Done when.** Extract EnhancedExportDialog + conversation-export.ts + document-export.ts + use-export-conversation.ts out of the dead cascade and wire them into WebChatPage's live header BEFORE deleting the rest of the v3 cascade (WEB-39).

**Where.** `apps/web/features/chat/v3/dialogs/EnhancedExportDialog.tsx`, `apps/web/features/chat/components/dialogs/index.ts`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-009; audit/competitive-gap-2026-08-15/duplication/chat-shells.md Finding 1

### WEB-116 — Dead second web chat-surface cascade (UnifiedChatPage/WebShellV3) still ships, injects memory with no temporary-chat guard, and carries a nav landmine

`MEDIUM` · web · effort L

**What.** duplication/chat-shells.md Finding 1 + MEMORY-010 + settings-and-nav.md §1c. grep for UnifiedChatPage in apps/web returns only a vi.mock and a doc comment — zero real imports; app-nav-items.ts:101-103 already calls WebShellV3 'a dead shell (zero mount points)'; UnifiedChatPage.tsx:49-54 self-documents 'kept internal … do not expose a second public chat route'; surface-reachability-allowlist.json:303-318 lists it as accepted unreachable debt. Two latent hazards ride inside it: (1) WebChatRuntime.ts:181-189 unconditionally injects saved memory facts with no isTemporary check, unlike the live request-processor.ts:976-996 path which correctly short-circuits — so making it reachable would leak memory into temporary chats; (2) WebShellV3.tsx:31-43's VIEW_ROUTES still maps artifacts -> /gallery, the exact out-of-shell destination app-nav-items.ts was written to fix, reintroducing the bug immediately if resurrected.

**Done when.** Delete the cascade after extracting the still-valuable pieces: WebSidebar.tsx + resolveWebViewRoute for their live consumer, and the export dialog stack per WEB-37. If instead the v3 shell is still on the roadmap, add the isTemporary short-circuit and fix VIEW_ROUTES['artifacts'] before any change makes it reachable. Note this decision is entangled with UI-25 (which chat shell is canonical) and should not be taken unilaterally.

**Where.** `apps/web/features/chat/pages/UnifiedChatPage.tsx:44-67`, `apps/web/features/chat/v3/WebShellV3.tsx:31-43`, `apps/web/lib/runtime/WebChatRuntime.ts:181-189`, `scripts/config/surface-reachability-allowlist.json:303-318`

**Blocked by.** UI-25 (founder/architecture decision on which web chat shell is canonical)

**From.** audit/competitive-gap-2026-08-15/duplication/chat-shells.md Finding 1; audit/parity-2026-08-15/gaps/domain-memory.json MEMORY-010; audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §1c

**Folded in.** chat-shells[0]; MEMORY-010; settings-and-nav[1]

### WEB-117 — Left-nav session and project CRUD handlers are hand-duplicated between WebChatPage and WebAppShell

`MEDIUM` · web · effort M

**What.** duplication/chat-shells.md Finding 2. WebAppShell.tsx:14-16 self-documents the duplication as deliberate; delete-conversation dialog copy is hand-matched between WebChatPage.tsx:2997-3000 and WebAppShell.tsx:171-176 with nothing enforcing sameness. The sibling nav-items array already drifted once under the identical pattern (fixed only by extracting app-nav-items.ts), and WebAppShell.handleProjectDelete was found to have had no confirmation at all.

**Done when.** Extract a shared useSidebarSessionActions() hook, mirroring the buildAppNavItems() extraction already done for nav items.

**Where.** `apps/web/features/chat/pages/WebChatPage.tsx:2929-3150`, `apps/web/shared/components/layout/WebAppShell.tsx:159-267`

**From.** audit/competitive-gap-2026-08-15/duplication/chat-shells.md Finding 2

**Folded in.** Left-nav session and project CRUD handlers are hand-duplicated between WebChatPage and WebAppShell

### WEB-120 — WorkSessionPanel and TaskDetailPanel independently map the same agent-activity events and render the same event differently

`MEDIUM` · web · effort M

**What.** duplication/tasks-schedules.md Finding 4. WorkSessionPanel.tsx's progressFromActivity has a legacy message.metadata.tools fallback branch TaskDetailPanel has no equivalent of; WorkSessionPanel falls back to humanizeToolName(entry.name) when summary is empty while TaskDetailPanel uses entry.summary||entry.name with no humanizing — so the same tool call renders a machine-cased name in one surface and a humanized label in the other. Status/tone-to-color mapping is independently coded in each.

**Done when.** Extract one shared entry -> {label, detail, status, tone} projector next to the already-shared applyAgentActivityEvent reducer in client-runtime.

**Where.** `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:100-107,150-158,258-274`, `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:56-61,85-118`

**From.** audit/competitive-gap-2026-08-15/duplication/tasks-schedules.md Finding 4; audit/competitive-gap-2026-08-15/duplication/tasks-schedules.md Finding 4; all-axes.json#tasks-schedules[3]

**Folded in.** WorkSessionPanel and TaskDetailPanel independently map the same agent-activity events and render the same tool call differently

### WEB-122 — MessageMetadata TypeScript interface has three independently-diverged declarations in apps/web alone

`MEDIUM` · web · effort M

**What.** duplication/components.md §2. web-chat-store.ts:164 (live write path: privacyMode/providerMode/handoffDraftId/…), shared/types/common.ts:86 (employeeId/employeeName/thinkingProcess/…) and unified-chat-types.ts:20 (tokenCount/widgets/taskId/…) declare three disjoint field sets under one interface name. A field needed by the live path required manual double-patching across files just to pass typecheck.

**Done when.** Standardize on web-chat-store.ts's MessageMetadata (the live write-path shape); have the other two extend/import it or be renamed so the shared name stops implying interchangeability.

**Where.** `apps/web/shared/stores/web-chat-store.ts:164`, `apps/web/shared/types/common.ts:86`, `apps/web/shared/stores/unified-chat-types.ts:20`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §2; audit/competitive-gap-2026-08-15/duplication/components.md §2; all-axes.json#components[1]

**Folded in.** MessageMetadata interface has three independently-diverged declarations in apps/web alone

### WEB-123 — UserSettings.tsx is a dead 584-line full-page settings implementation whose delete handler mislabels data erasure as account deletion

`MEDIUM` · web · effort S

**What.** duplication/settings-and-nav.md §2d and §3b. The file self-documents 'NOT MOUNTED BY ANY ROUTE … Do not link to this page — it renders nowhere and will drift out of sync with the real settings surfaces', and no file under apps/web/app/\*\* imports it. Worse, its handleDeleteAccount (lines 259-283) calls DELETE /api/user/data — a GDPR Art.17 erasure endpoint that explicitly retains the profile/auth account (retainProfile:true per its own doc comment) — but shows 'Account data deleted. You will be signed out' and redirects to /login, for an operation that never touches the Clerk auth account. If resurrected on the compliance/dpdp branch it presents a 'Delete account' CTA that does not delete the account.

**Done when.** Delete the file outright. Do not resurrect it without rewriting the handler to call /api/user/delete-account and correcting the copy.

**Where.** `apps/web/features/settings/pages/UserSettings.tsx:7-14,259-283,272`, `apps/web/app/api/user/data/route.ts:16-52,189-195`, `apps/web/app/api/user/delete-account/route.ts:16-49`, `apps/web/features/settings/pages/UserSettings.tsx:7-14,259-283`

**From.** audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §2d, §3b; audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §2d, §3b; all-axes.json#settings-and-nav[2]

**Folded in.** UserSettings.tsx is a dead 584-line full-page settings implementation whose delete handler mislabels a data-only erasure as full account deletion

### WEB-125 — /skills/[name] is an orphaned, unreachable detail route with a category-label map that has diverged 4 of 5 buckets from the live one

`MEDIUM` · web · effort S

**What.** duplication/extension-surfaces.md §2.3. Grep for any link that could reach /skills/[name] returns nothing and sitemap.ts explicitly excludes it. Its own comment says its label function 'mirrors DirectoryModal helper' but no component named DirectoryModal exists anywhere in the repo (renamed to DirectoryBrowse). Comparing the two label functions on the same source field, 4 of 5 buckets disagree (e.g. bundled -> 'AGI' in the modal vs 'Built-in' on the detail page). Related: /ai-skills redirects to /skills?tab=agents while /skills's route component never reads any tab search param, so the query string is silently dropped.

**Done when.** Delete the route (nothing links here), or wire a real click-through from SkillsPanel and delete the hand-copied label function in favour of importing skillAuthorLabel. Reconcile the /ai-skills redirect target only if a real Skills sub-tab is ever built.

**Where.** `apps/web/app/skills/[name]/page.tsx:19-25`, `packages/ui/ui/src/settings-modal/SettingsModal.tsx:407-419,1589-1732`, `apps/web/app/ai-skills/page.tsx`, `apps/web/app/skills/page.tsx:14-27`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.3, §2.6

**Folded in.** extension-surfaces[2]; ai-skills-dead-param

### WEB-129 — Schedules have no project/workspace association and no thread-automation concept

`MEDIUM` · web · effort L

**What.** PROJ-WS-02: grepping the schedules types/route/form for projectId returns zero matches, and the project detail page has only Chats/Sources tabs with no Scheduled tab. sched-gap-05: grep for project|workspace|folder in ScheduleForm.tsx returns zero hits, and the UI explicitly states scheduled runs 'do not inherit chat context or memory'. memory-15-gap: no Scheduled card exists in the project settings rail. The parity matrix records 'Project automations' (background worktree/session per project with schedule/prompt/permissions/notifications/result-artifact) and 'Thread automations' (recurring wake-up on the same thread with context retention) as Partial/Missing.

**Done when.** Add a nullable project_id to the schedules table, thread it through ScheduleForm and the routes, and add a Scheduled tab/card to the project detail page. Requires scheduled runs to gain context/tool access first (AI-36).

**Where.** `apps/web/features/schedules/types/index.ts`, `apps/web/features/schedules/components/ScheduleForm.tsx:176-179`, `apps/web/app/chat/projects/[id]/page.tsx:587-611`

**Blocked by.** AI-36 (scheduled runs have no context or tools to inherit)

**From.** audit/competitive-gap-2026-08-15/domains/projects-workspaces-notebooks-file-knowledge.json PROJ-WS-02; audit/competitive-gap-2026-08-15/domains/scheduled-tasks-automation.json sched-gap-05; audit/competitive-gap-2026-08-15/domains/memory-personalization.json memory-15-gap

**Folded in.** PROJ-WS-02; sched-gap-05; memory-15-gap

### WEB-130 — Project deletion soft-deletes, so knowledge files are permanently orphaned and the ON DELETE CASCADE never fires; there is no restore path

`MEDIUM` · web · effort M

**What.** PROJ-WS-03. Project deletion sets deleted_at and moves conversations out (route.ts:283-337), but project_knowledge_files.project_id has an 'on delete cascade' (0006_projects.sql:18) that can only fire on a hard DELETE, which never happens. No restore/undelete endpoint exists, and the deletion dialog never mentions files — so the rows are both unreachable and retained indefinitely.

**Done when.** Either add explicit knowledge-file cleanup on delete, or add a project-restore endpoint; update the dialog copy to reflect actual retention behaviour either way.

**Where.** `apps/web/app/api/projects/[id]/route.ts:283-337`, `apps/web/db/neon/0006_projects.sql:18`

**From.** audit/competitive-gap-2026-08-15/domains/projects-workspaces-notebooks-file-knowledge.json PROJ-WS-03

### WEB-131 — Web schedules surface parity gaps: no inline composer, no status filter, no running-state indicator, no auto-title, no close-vs-delete, recurring-by-default

`MEDIUM` · web · effort L

**What.** Eight filed gaps in one surface. sched-gap-02: SchedulesPage.tsx's only affordance is a 'Create Schedule' button opening a full-form Dialog; mobile has a working NL composer chip (QuickSchedule.tsx) never ported to web. sched-gap-03: no dual conversational-vs-manual creation path. sched-gap-07: ManagedCloudScheduleTask.status (schedules.ts:56) has no 'running' value, so ScheduleCard.tsx:106-108 structurally cannot indicate an in-flight run, even though /tasks has a real polling status pill. sched-gap-08: schedule-form.ts:253's name is a required user-typed field, never auto-generated. sched-gap-13: /tasks (Active/All tabs) and the desktop scheduler (5-way filter) both have status filtering; /chat/schedules has no filter state at all. sched-gap-11: TaskDetailPanel offers Close but no delete for a task run; ScheduleCard offers destructive delete but no Close. sched-gap-17: INITIAL_SCHEDULE_DRAFT defaults to recurrence:'daily', 09:00, Mon-Fri — a new dialog opens pre-configured as a standing weekday recurring task. sched-gap-06/14: template cadence text and icon differentiation exist on mobile, absent on web (blocked on the web templates surface, WEB-18). sched-gap-09: task-log entries carry real tool names but every row gets an identical status-colored dot.

**Done when.** Port QuickSchedule's NL composer and the /tasks Active/All filter onto /chat/schedules; add a transient running-now visual state driven by run status; default recurrence to 'once' or force an explicit choice; decide deliberately whether task runs are deletable; map a small icon set onto AgentActivityToolEntry.name.

**Where.** `apps/web/features/schedules/components/SchedulesPage.tsx:391-394,432-443,496-533`, `apps/web/features/schedules/lib/schedule-form.ts:26-43,253`, `packages/contracts/cloud-contracts/src/schedules.ts:56`, `apps/web/features/schedules/components/ScheduleCard.tsx:106-108,215-226`, `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:94-118,283-291`, `apps/mobile/src/features/schedules/components/QuickSchedule.tsx`

**From.** audit/competitive-gap-2026-08-15/domains/scheduled-tasks-automation.json sched-gap-02,03,06,07,08,09,11,13,14,17; audit/competitive-gap-2026-08-15/domains/shell-global-nav-ia-design-system.json shell-nav-ia-gap-06

**Folded in.** sched-gap-02; sched-gap-03; sched-gap-06; sched-gap-07; sched-gap-08; sched-gap-09; sched-gap-11; sched-gap-13; sched-gap-14; sched-gap-17; shell-nav-ia-gap-06

### WEB-16 — Projects: no templates, no export, no collaborators; Duplicate fires a toast but never refetches the list

`MEDIUM` · web · effort L

**What.** No project templates, duplication UX, or export; no collaborators, tasks, or project-scoped agents. handleDuplicate succeeds but ProjectSettingsDialog.tsx does not invalidate the list query, so the copy only appears after navigation or refresh. New accounts also get no pre-seeded example project. Per-project memory may be decorative rather than a real scoped policy (see UI-09).

Also recorded by a later audit (Project templates, project export and project duplication — all wired (wire-or-cut 2026-08-06)): CONTRADICTS 'no templates, no export': wire-or-cut records project-templates.ts plus a picker in CreateProjectDialog (built-in templates only, no user-defined CRUD since duplication serves that role), GET /api/projects/[id]/export returning a versioned JSON snapshot, and POST /api/projects/[id]/duplicate copying settings/instructions/knowledge files by reference through the same quota guard as create. Re-verify; the two drifted template sets are filed as WEB-46, and 'no collaborators' plus the Duplicate-doesn't-refetch bug remain.

**Done when.** Project duplication immediately shows the copy, and templates/export/collaboration either ship or are removed from the product surface rather than implied by an incomplete settings dialog.

**Where.** `apps/web/features/projects/components/ProjectSettingsDialog.tsx:96-99`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-05: Projects: templates/duplication/export, collaborators, and real scoped memory all missing; phase4 PP-05: Web Duplicate Project toast fires but project list is not refetched; GAP-260: New accounts get no pre-seeded 'How to use AGI' example project

### WEB-17 — Project knowledge silently truncates uploads at ~16,000 chars with no extraction state shown, stores summary as hard-coded null, and never OCRs images

`MEDIUM` · web · effort L

**What.** MAX_FILE_CONTENT_CHARS = 16_000, so a 90-page PDF uploads 'successfully' and only its first ~16k characters ever reach the model, while neither KnowledgeFilesPanel nor SourcesPanel shows extraction or truncation state. knowledge-files/route.ts inserts summary as null unconditionally, so any file whose extractor returns null (images, scanned PDFs) contributes only its filename to the prompt; extractProjectKnowledgeFile returns extractedText:null for every image and there is no OCR anywhere in apps/web. Server-side extraction and untrusted-data framing are remediated in code but production activation is gated on migration 0064.

**Done when.** Project knowledge upload shows honest per-file extraction state (extracted / truncated / not readable), and the model receives either the full document or a clearly-bounded excerpt the user can see.

**Where.** `apps/web/lib/services/project-context-service.ts:54`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts:355-365`, `apps/web/lib/server/project-knowledge-extraction.ts:299`, `apps/web/db/neon/0064_project_knowledge_extraction.sql`

**Blocked by.** migration 0064 must be applied to production Neon before server-side extraction activates

**From.** phase4-capability-audit.md; known-flaws.md; AuditRemediationLedger.md

**Folded in.** PP-06 residue: Web knowledge-file 'summary' column is hard-coded null on every insert; phase4 PP-06: Web project knowledge silently truncates large uploads with no truncation indicator; phase4 PP-09: Web project-knowledge images upload and list successfully but the model never sees their content; WEB-PROJECT-KNOWLEDGE-MANIFEST-ONLY-01: project knowledge extraction gated on unapplied migration 0064

### WEB-18 — Schedules/Tasks UI: no starter templates, no timezone/DST preview, unmounted file-watch/cron/webhook surfaces, no exact-run deep links

`MEDIUM` · web · effort L

**What.** The schedules empty state has no suggested-template gallery to drive adoption; existing file-watch/cron/webhook UI is unmounted; there is no timezone/DST preview, no idempotent occurrence IDs surfaced, no skip/catch-up, pause/resume, retry or connector-remediation affordance, and no deep link to an exact run. Schedule behaviour also falls short of the promised task runtime (one non-streaming, no-tool completion) — the runtime half overlaps the backend/ops slice; this item is the surface.

Also recorded by a later audit (No real-task/suggested-template divider on the web schedules list (sched-gap-01); template cards never show cadence (sched-gap-06); template icon differentiation missing (sched-gap-14)): Sharpens 'no starter templates' with the fact that the capability exists twice already and was never ported: mobile (apps/mobile/app/(app)/schedules/index.tsx:310-367, with a '+'-in-circle icon and a SCHEDULE_TEMPLATES set) and desktop (ScheduledTasksPanel.tsx:198-243) both ship template lists, while SchedulesPage.tsx:432-443 shows only 'No schedules yet' + Create and grep for template|suggest returns zero hits. Both the cadence text and icon differentiation follow automatically once web templates exist. Severity raised to HIGH by the source. Note the schedule-composer half of shell-nav-ia-gap-06 is filed separately as WEB-69.

Also recorded by a later audit (No real-task/suggested-template divider on the web schedules list (sched-gap-01)): Confirms and locates the 'no starter templates' clause: SchedulesPage.tsx:432-443's empty state is only 'No schedules yet' plus a Create button, and grep for template|suggest returns zero hits. Both other surfaces already have a template list (mobile app/(app)/schedules/index.tsx:310-367 with SCHEDULE_TEMPLATES; desktop ScheduledTasksPanel.tsx:198-243) but only in the empty state, never ported to web. Fix: port mobile's SCHEDULE_TEMPLATES set to /chat/schedules, rendered always below a divider alongside real tasks. Note this blocks sched-gap-14 (template icon/cadence differentiation), which carries automatically once templates exist.

**Done when.** The schedules surface lets a user start from a template, preview when a schedule will actually fire in their timezone, and open the exact run that produced a given output.

**Where.** `apps/web/features/schedules/components/SchedulesPage.tsx`, `apps/web/features/schedules/lib/schedule-form.ts`

**From.** AuditRemediationLedger.md; audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-21: Tasks/schedules: schedule only does one non-streaming, no-tool completion; GAP-264: Scheduled tasks empty state has no suggested-template gallery

### WEB-19 — AGI Work is a composer mode without a goal-intake or plan surface: clarification cards are hardcoded read-only, no pause/resume, no per-task cost, no completion notification

`MEDIUM` · web · effort XL

**What.** Work is not clearly a standalone durable task surface versus a chat toggle, and there is no structured goal intake or model-authored editable plan. The clarify.v1 interactive card has a contract and a ClarifyCard renderer but zero server-side producers outside tests, and InteractiveCardBlock.tsx hardcodes ctx:{canRespond:false}, so a clarification round-trip cannot complete. 'paused' is emitted only by the tool-approval gate and TasksPage.tsx has no pause control. CloudAgentRunSchema carries no usage or cost fields and TaskDetailPanel renders none. No task-completion notification exists (push fires only for schedules). A separate /agi-work marketing naming collision needs resolving. Founder-approved 2026-08-05.

Also recorded by a later audit (AGI Work remains a chat-composer mode toggle, not a standalone Cowork-style workspace surface (AGENTIC-WORK-006, prior P2-001)): Re-verified at commit e15df56e3: AGI Work is reachable only via the shared composer mode switch (DesktopShellV3 / shared ChatInput / WorkScopePicker), and /tasks (TasksPage.tsx:1-48) is a run-history list, not a task-creation surface. Sequencing note: a standalone workspace built atop current execution/visibility gaps would inherit all of them.

Also recorded by a later audit (Global Chat↔Agentic-mode toggle is composer-only and doesn't change placeholder/empty-state (agentic-modes-gap-01 / shell-nav-ia-gap-03)): ChatComposerNew.tsx:2895-2924 holds the segmented 'Chat | AGI Work' toggle, Pro-tier gated via canUseAgiWork, not chrome-level. The placeholder half was FIXED 2026-08-15 (FIXES-APPLIED.md: 'Composer placeholder now reacts to the Chat <-> AGI Work axis'); the tier-visibility half was explicitly declined as a prior product decision (AUDIT-FIX CMP-14, prevents a control that hard-fails with agi_work_plan_required). What remains open under WEB-19 is promoting the toggle from a composer-only control to chrome level.

Also recorded by a later audit (Standalone Cowork session surface Missing on Web, Desktop and Mobile (frontend-experience-contract §13)): Row scored Missing on all three surfaces; confirmed still Missing in the 2026-08-09 correction note as a dedicated resumable async workspace rather than a mode inside chat. Sub-gaps tracked under Section 14 of audit/master-checklist-gap-audit-2026-08-05.md.

Also recorded by a later audit (clarify.v1 card renderer wired but read-only — cannot be answered in place (wire-or-cut 2026-08-06 interactive cards slice 2)): Sharpens 'clarification cards are hardcoded read-only' to the exact mechanism: ClarifyCard.tsx renders real UI but InteractiveCardBlock passes ctx:{canRespond:false} and no server endpoint accepts an InteractiveCardResponsePayload. Answering requires both a resolver route and a producer tool (ask_clarifying_questions) that suspends the turn — neither exists.

Also recorded by a later audit (AGI Work remains a chat-composer mode toggle, not a standalone Cowork-style workspace (AGENTIC-WORK-006, prior P2-001); also parity 'Standalone Cowork session surface' Missing on W/D/M): Re-verified at commit e15df56e3 with no contradicting evidence. AGI Work is reached only via the shared chat composer's Chat<->AGI Work mode switch (DesktopShellV3 / shared ChatInput / WorkScopePicker); /tasks (TasksPage.tsx:1-48) is a run-history list, not a task-creation surface. The audit's own sequencing advice: do not build a standalone workspace on top of the current execution/visibility gaps (dead background agents DESK-66, opt-in durability AI-34, no mid-run steering AI-35, zero-tool scheduled runs AI-36) or it will inherit all of them.

Also recorded by a later audit (clarify.v1 interactive card renders but is read-only and cannot be answered in place (wire-or-cut, Interactive cards slice 2)): Exact mechanism for the register's 'clarification cards are hardcoded read-only': ClarifyCard.tsx renders real UI, but InteractiveCardBlock passes ctx:{canRespond:false} and no server endpoint accepts an InteractiveCardResponsePayload. Making it answerable requires a resolver route plus a producer tool (ask_clarifying_questions) that suspends the turn — i.e. it is blocked on the same pause/resume machinery as AI-30. Related: itinerary.v1 remains in the kind allowlist with no renderer and no producer, deliberately rendering the authored fallback rather than registering untested code as shipped.

**Done when.** A user can state a goal, review and edit the model's plan, answer a clarifying question mid-run, pause or resume the run, see what it cost, and be notified when it finishes.

**Where.** `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:68`, `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:42`, `packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:47-65`

**From.** AuditRemediationLedger.md; audit/capability-gaps.csv; gap-audit-2026-08-08.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-13: AGI Work: clarification round-trip broken, no durable pause/resume, single-threaded cloud loop; CAP-048: AGI Work goal intake and plan surface; P2-001: Standalone Cowork/workspace product is missing; phase4 PP-13 gaps: no producers for clarify cards, no pause control, no per-task cost, no completion notification

### WEB-23 — Web voice output is manual browser TTS only — no voice picker, no continuous turn-taking, no server TTS option

`MEDIUM` · web · effort L · **in-progress**

**What.** Manual Read-aloud/Stop via browser-native TTS works, but continuous turn-taking, barge-in, a live voice session or waveform, selectable voices and output devices, and an explicit server TTS option are all absent. The Voice settings page separates working dictation from unavailable managed voice, so the surface is honest, but the capability gap is real. Model/routing-side voice gaps (no TTS routing slot, hardcoded TTS IDs) are owned by the ai-routing slice.

**Done when.** Web read-aloud offers a voice picker and output-device choice, and either supports continuous turn-taking or states plainly that it does not.

**From.** AuditRemediationLedger.md; known-flaws.md

**Folded in.** PP-20 web portion: no Web read-aloud voice picker; WEB-VOICE-OUTPUT-01: no hands-free/full-duplex voice, no server/provider TTS option

### WEB-24 — Office/document generation: no XLSX, no editing of existing Office files, and artifacts can download with the wrong Office MIME/extension

`MEDIUM` · web · effort L

**What.** create_office_file supports editable DOCX/PPTX generation only — its discriminated union accepts no xlsx — while artifacts can download as the wrong Office format. Word/Excel editor implementations are unwired or need removal; PDF editing was dropped without a recorded decision; PowerPoint charts/pivot/templates/branding/citations are undecided; tests use no real Office/PDF parser validation. The tool is also not exposed on non-web surfaces. The public /agent-permissions page still promises 'spreadsheet' generation (docs slice owns the copy fix).

Also recorded by a later audit (Editing an existing Word document cannot preserve source content and is deliberately not exposed (wire-or-cut, Wave 2/3 final items)): Adds a specific, load-bearing constraint behind 'no editing of existing Office files': WordEditor::edit_document CANNOT parse an existing .docx (docx_rs is write-only) and its own tracing::warn! states source content 'is not preserved' — it builds a new document from the edits alone. Exposing it as 'edit your document' would silently destroy the user's file, so it is deliberately not registered as a tool. Resolution requires deleting the module or replacing docx_rs. Note the sibling case DID ship: ExcelEditor reads and rewrites the source workbook via calamine and is exposed as document_edit_excel with RiskLevel::High approval.

**Done when.** A generated Office file downloads with the correct MIME type and extension, and the product only claims the formats create_office_file can actually produce.

**Where.** `apps/web/lib/services/managed-office-file-service.ts:51-64`

**From.** AuditRemediationLedger.md; known-flaws.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-12: Documents/spreadsheets/presentations/PDFs: editors unwired, wrong export MIME/extension; CLOUD-OFFICE-CREATE-01: no XLSX support, no editing of existing Office files, not exposed on non-web surfaces; phase4 PP-12: /agent-permissions still promises spreadsheet generation the Office tool cannot produce

### WEB-25 — File ingestion breadth is undecided: no Office/archive/audio/video/notebook handling, no OCR or table extraction, checksums computed but never compared

`MEDIUM` · web · effort XL

**What.** DOCX/PPTX/XLSX/ZIP/audio/video/notebook support is undecided; there is no OCR fallback, table extraction, archive-safety handling, or parser isolation; folder/repo/cloud-drive upload is unsupported; checksums are computed but not compared; and there are no quotas, versions, retention, deletion propagation, or scan state. Chat-attached Jupyter notebooks are additionally not extracted (unlike project-attached ones) so raw base64 image blobs are sent to the model and burn context budget up to the 12MB ceiling. Malware scanning of uploads is owned by the security slice.

Also recorded by a later audit (One-chat flow must support normal chat plus selected/reference files without forcing separate chat experiences (source-of-truth.md GAP-3)): Preserves GAP-3 as the trail-back id and records the founder-level requirement that reference-file handling must NOT be a separate chat experience — a constraint on how WEB-25's ingestion work and the composer's attachment model may be designed.

**Done when.** Each accepted upload type has a decided, tested extraction path, and formats that cannot be read are rejected at upload rather than accepted and silently ignored.

**Where.** `packages/contracts/cloud-contracts/src/chat-attachments.ts:24-31`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-09: File ingestion: missing Office/archive/audio/video/notebook support, no OCR/table extraction, checksum not compared; phase4 PP-10b: Chat-attached Jupyter notebooks are not extracted, unlike project-attached ones

### WEB-26 — 'Run code' toggle is lit for routed providers that have no execution tool, so it silently does nothing

`MEDIUM` · web · effort M

**What.** The composer enables 'Run code' unconditionally under Auto routing, but resolveCodeExecutionTools returns an empty array for providers with no execution tool; with the sandbox flag off the turn proceeds with no execution tool and no notice. Separately, code_interpreter is deliberately stripped on the OpenAI Chat Completions path and is unproven on the Responses path. Notebook support (.ipynb ingestion/edit/execution/export) is not implemented. Provider capability resolution overlaps the ai-routing slice; the lit-but-inert toggle is the chat UI defect.

**Done when.** The 'Run code' control reflects whether the resolved model can actually execute code, and a turn that silently drops the capability tells the user.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:713`, `apps/web/lib/e2b/execution-tools.ts:113-128`, `packages/ai/providers/openai/src/translate.ts:223,262-269`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md

**Folded in.** PP-10: Code execution and notebooks: .ipynb ingestion/edit/execution/export not implemented; phase4 PP-10: OpenAI code execution is a silent no-op on Chat Completions; auto-routing can select a provider with no code-execution tool

### WEB-30 — Artifact publishing has no TTL, quota, view audit or per-viewer auth, and an ownership violation surfaces as a 500 instead of a 403

`MEDIUM` · web · effort M

**What.** Published artifacts carry only a 1M-char per-row bound: no TTL, no per-user quota, no view counter or access audit. apps/web/app/shared-artifact/[token]/page.tsx contains an explicit code comment stating there is no expiry branch, and migration 0095 ships no TTL. Publishing an artifact tied to another user's conversation passes zod, then trips the RLS WITH CHECK and surfaces as a 500 — fail-closed, but it should be a pre-checked 403. Recorded as founder-pending follow-ups on the otherwise shipped CAP-015.

**Done when.** Published artifacts expire or are quota-bounded, publishing someone else's conversation is rejected with a 403 before it reaches the database, and views are auditable.

**Where.** `apps/web/app/shared-artifact/[token]/page.tsx:20`, `packages/platform/artifacts/src/artifacts.ts`, `apps/web/db/neon/0095*.sql`

**From.** known-flaws.md; audit/capability-gaps.csv

**Folded in.** CAP-015 follow-ups: TTL/quota + abuse/retention, per-viewer auth; CAP-015 Artifact publishing: ownership violation surfaces as 500 not 403

### WEB-32 — Sharing has no scope choice, no expiry choice, and no revocation review — link expiry is hardcoded to 7 days

`MEDIUM` · web · effort L

**What.** CreateShareSchema.expires_in_days accepts 1|7|30 but its only caller never sends it, so every share link is 7 days. There are no private/workspace/public scopes, no permission review, and no revoke UI; sharing for projects, artifacts, skills, plugins and prompts is incomplete; there are no comments, co-editing, mentions or org templates; Slack/Teams delivery is not via real app installs; and there are no tests for revoked membership, link leakage or tenant crossing.

Also recorded by a later audit (Share-link lifetime was hardcoded to a 7-day expiry): wire-or-cut.md#2026-08-06: POST /api/share now accepts a bounded expires_in_days (1, 7 or 30; default 7), closing the 'no expiry choice' clause of WEB-32. The 'no scope choice' and 'no revocation review' clauses are untouched.

**Done when.** A user choosing to share picks the scope and expiry the API already supports, can see and revoke what they have shared, and revoked access is proven by test.

**Where.** `apps/web/app/api/share/route.ts:44-47`, `apps/web/lib/hooks/use-share-conversation.ts`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-22: Sharing/collaboration: no scopes/expiry/revoke, no comments/co-editing; phase4 PP-22: Share-link expiry is hardcoded to 7 days

### WEB-39 — UnifiedChatPage/WebShellV3 dead chat-shell cascade (~30 files) still compiles, carries an unguarded memory injection and an artifacts→/gallery routing landmine

`MEDIUM` · web · effort ?

**What.** duplication/chat-shells.md Finding 1 + all-axes#settings-and-nav[1] + frontend-experience-contract §14 P0-6: grep finds only a vi.mock and a doc comment for UnifiedChatPage; surface-reachability-allowlist.json:303-318 already accepts it as unreachable debt. Inside it, WebChatRuntime.ts injects saved memory with no isTemporary short-circuit (the live request-processor.ts:976-996 path has one), and WebShellV3's VIEW_ROUTES still maps artifacts -> /gallery, the exact bug app-nav-items.ts was written to fix.

**Done when.** Extract WebSidebar/resolveWebViewRoute for their live consumer and re-home EnhancedExportDialog and the export services (WEB-42) onto WebChatPage, then delete the cascade — do not resurrect WebShellV3 without fixing VIEW_ROUTES and the isTemporary guard.

**Where.** `apps/web/features/chat/pages/UnifiedChatPage.tsx`, `apps/web/features/chat/v3/WebShellV3.tsx:31-43`, `apps/web/lib/runtime/WebChatRuntime.ts:181-189`

**From.** audit/competitive-gap-2026-08-15/duplication/chat-shells.md Finding 1; all-axes.json#chat-shells[0], #settings-and-nav[1]; docs/current/frontend-experience-contract.md §14 P0 item 6

**Folded in.** duplication chat-shells[0]; settings-and-nav[1]; MEMORY-010; frontend-experience-contract §14 P0-6

### WEB-42 — A materially complete conversation-export feature (Markdown/PDF/DOCX) is built, barrel-exported and totally unreachable

`MEDIUM` · web · effort ?

**What.** DEAD-CODE-009 + duplication/chat-shells.md 'not-quite-empty dead weight': EnhancedExportDialog.tsx has zero importers outside the dead v3 cascade; the live chat header ships only a Print action. knip widens the blast radius to ~30 files in the same cascade (use-export-conversation.ts, conversation-export.ts, document-export.ts).

**Done when.** Extract EnhancedExportDialog + conversation-export.ts + document-export.ts + use-export-conversation.ts out of the dead cascade and wire them into WebChatPage's live header before deleting the remainder.

**Where.** `apps/web/features/chat/v3/dialogs/EnhancedExportDialog.tsx`, `apps/web/features/chat/components/dialogs/index.ts`

**From.** audit/parity-2026-08-15 — DEAD-CODE-009; audit/competitive-gap-2026-08-15/duplication/chat-shells.md

**Folded in.** DEAD-CODE-009; duplication chat-shells Finding 1 residue

### WEB-43 — Legacy apps/web/shared/ tree (~198 files, ~130 knip-unused) still ships an earlier 'AI employee marketplace' product framing

`MEDIUM` · web · effort L

**What.** DEAD-CODE-007: shared/types/store-types.ts and shared/types/index.ts define AIEmployee/MarketplaceEmployee/AIEmployeePerformance types from a superseded framing. Only 6 files in the live app import from @/shared/, and those are part of the dead v3/UnifiedChatPage cascade or pull one narrow utility. Last touched by a 2026-07-29 'close unmounted surface sweep' that did not finish. Distinct from WEB-28's two ~1,500-line dead modules.

**Done when.** Triage the 6 exception files, then delete apps/web/shared/ in one pass once knip confirms no live file survives on an import from it.

**Where.** `apps/web/shared/types/index.ts`, `apps/web/shared/types/store-types.ts`

**From.** audit/parity-2026-08-15 — DEAD-CODE-007

### WEB-44 — A second, fully-implemented 'share a conversation' backend and public route duplicates the live one with zero UI callers

`MEDIUM` · web · effort ?

**What.** DEAD-CODE-008: the live Share button uses POST /api/share -> shared_sessions -> /share/[token]. A parallel POST/GET /api/shared -> shared_conversations -> /shared/[id] path exists with zero UI callers; the live path's own test explicitly asserts it does NOT use the legacy /api/shared route.

**Done when.** Delete /api/shared, /shared/[id]/page.tsx and the shared_conversations table unless a maintainer confirms /shared/<id> links were issued in production, in which case document the compatibility reason.

**Where.** `apps/web/app/api/shared/route.ts`, `apps/web/app/shared/[id]/page.tsx`

**From.** audit/parity-2026-08-15 — DEAD-CODE-008

### WEB-45 — Projects hub search box and Create control vanish outside the default sort and in the Archived view

`MEDIUM` · web · effort ?

**What.** PROJECTS-FILES-003: app/chat/projects/page.tsx renders <ProjectGallery> (owner of the only search box and inline create form) solely when sortMode==='updated' && !showArchived; every other sort falls back to a custom grid with no search and no create. The empty-state copy literally tells the user to change the sort dropdown in order to create a project.

**Done when.** Hoist the search box and New Project trigger to the page-level header so they render unconditionally; scope ProjectGallery's own search to its default-sort subset.

**Where.** `apps/web/app/chat/projects/page.tsx:150,406-411`

**From.** audit/parity-2026-08-15 — PROJECTS-FILES-003

### WEB-46 — Two drifted, non-overlapping project-creation quick-start UIs (PROJECT_TEMPLATES vs PROJECT_PRESETS)

`MEDIUM` · web · effort ?

**What.** PROJECTS-FILES-004: sidebar 'New project' uses CreateProjectDialog + PROJECT_TEMPLATES (name/description/instructions, no emoji or colour); the /chat/projects hub inline form uses ProjectGallery + PROJECT_PRESETS (emoji/colour, no instructions). Category lists partially overlap and partially diverge.

**Done when.** Merge PROJECT_TEMPLATES and PROJECT_PRESETS into one shared list carrying emoji, accent colour, name, description and instructions, consumed by both entry points.

**Where.** `apps/web/features/projects/data/project-templates.ts:34-60`, `packages/ui/unified-chat/src/components/ProjectGallery.tsx:20-25,356-376`

**From.** audit/parity-2026-08-15 — PROJECTS-FILES-004

### WEB-50 — /settings/byok and /settings/sync have real content but zero in-app discovery path

`MEDIUM` · web · effort ? · **unclear**

**What.** duplication/settings-and-nav.md §2c: neither key appears in WebSettingsModal.tsx's SECTION_TO_SEGMENT/WEB_SETTINGS_NAV_GROUPS nor in settings-nav.ts's SETTINGS_NAV_GROUPS_WEB (full list read, lines 279-305); a repo-wide grep for the literal route strings finds only each page's own file and tests. /settings/voice was in the identical state until fixed 2026-08-15 via VoiceSection.tsx, which is the fix template.

**Done when.** Confirm with the settings owner whether nav-reachability is intended; if yes, wire SettingsModalRedirect-style entries the way VoiceSection.tsx was wired in.

**Where.** `apps/web/app/settings/byok/page.tsx`, `apps/web/app/settings/sync/page.tsx`, `packages/ui/ui/src/settings-nav.ts:279-305`

**From.** audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §2c; all-axes.json#settings-and-nav[3]

### WEB-54 — /skills/[name] is an orphaned, unreachable detail page whose hand-copied category-label map disagrees with the live one in 4 of 5 buckets

`MEDIUM` · web · effort ?

**What.** duplication/extension-surfaces.md §2.3: no link anywhere reaches /skills/[name] and sitemap.ts explicitly excludes it. Its comment says its label function 'mirrors DirectoryModal helper' but no DirectoryModal exists (renamed DirectoryBrowse); comparing the two label functions on the same source field, 4 of 5 buckets disagree (e.g. bundled -> 'AGI' vs 'Built-in').

**Done when.** Delete the route, or wire a real click-through from SkillsPanel and replace the hand-copied label function with an import of skillAuthorLabel.

**Where.** `apps/web/app/skills/[name]/page.tsx:19-25`, `packages/ui/ui/src/settings-modal/SettingsModal.tsx:407-419,1589-1732`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.3; all-axes.json#extension-surfaces[2]

### WEB-61 — Visual design workspace (artboards, layers, properties, prototype/deck preview, versioning, export) approved but unbuilt; the CanvasWorkspace whiteboard stays unmounted

`MEDIUM` · web · effort XL

**What.** parity-implementation-matrix CAP-051 (founder-approved 2026-08-05: mount the orphaned CanvasWorkspace whiteboard as design workspace v1) plus source-of-truth GAP-13 (canvas, artboards, layers/assets, properties panel, prototype/deck preview, versioning, export and trust labels must be designed before claiming parity). Matrix row 'Visual design workspace — Missing/Gated'.

**Done when.** Mount CanvasWorkspace as the v1 slice per CAP-051; treat full artboard/layers/prototype parity as a separate scoped decision.

**From.** docs/current/parity-implementation-matrix.md CAP-051; source-of-truth.md P0 Gap List item 13 (GAP-13)

**Folded in.** CAP-051; GAP-13; parity-matrix 'Visual design workspace'

### WEB-67 — Library renders tool-generated artifact files through the plain file card, never the rich Artifact viewer

`MEDIUM` · web · effort ?

**What.** duplication/content-surfaces.md 'Store C' / consequence #3: generated-file-persist.ts's classifyGeneratedFile already buckets html/svg/markdown/mermaid/json/code into surface:'artifact' in media_assets, but LibraryView renders every row — including surface:'artifact' — through GeneratedFileCard (download / open-in-tab) instead of ArtifactPreview (sandboxed iframe, versions, iterate).

**Done when.** Route surface:'artifact' Library rows through ArtifactPreview and/or link them into the Artifacts gallery.

**Where.** `apps/web/lib/server/generated-file-persist.ts:156-180`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/content-surfaces.md

### WEB-69 — Schedules page has no inline/natural-language composer and no conversational-vs-manual creation choice

`MEDIUM` · web · effort ?

**What.** sched-gap-02, sched-gap-03 and shell-nav-ia-gap-06: SchedulesPage.tsx's only affordance is a 'Create Schedule' button opening a full ScheduleForm dialog of labelled inputs, a model <select> and a raw cron field. Mobile already ships a working NL-parsing composer chip (QuickSchedule.tsx) that was never ported to web.

**Done when.** Port QuickSchedule's NL-parsing composer to /chat/schedules and expose 'Describe it' vs 'Fill out the form' as an explicit choice.

**Where.** `apps/web/features/schedules/components/SchedulesPage.tsx:391-394,496-533`, `apps/mobile/src/features/schedules/components/QuickSchedule.tsx`

**From.** audit/competitive-gap-2026-08-15 — sched-gap-02 (sched-03), sched-gap-03 (sched-04), shell-nav-ia-gap-06 (shell-05)

**Folded in.** sched-gap-02; sched-gap-03; shell-nav-ia-gap-06 (composer half)

### WEB-73 — No non-destructive Close versus destructive Delete for a task run — /tasks offers no delete at all

`MEDIUM` · web · effort ?

**What.** sched-gap-11: TaskDetailPanel's 'Close' only clears selectedRunId, and TasksPage.tsx has no delete action for a task run anywhere; ScheduleCard has destructive delete but no Close concept. The two surfaces disagree on the object lifecycle.

**Done when.** Decide deliberately whether AGI Work task runs are deletable, document the choice, and add delete explicitly if so.

**Where.** `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:283-291`, `apps/web/features/schedules/components/ScheduleCard.tsx:215-226`

**From.** audit/competitive-gap-2026-08-15 — sched-gap-11 (sched-15)

### WEB-74 — No follow-up composer for steering a run from the /tasks detail panel

`MEDIUM` · web · effort ?

**What.** sched-gap-15: TasksPage renders a list plus a sticky TaskDetailPanel, but TaskDetailPanel.tsx has no input field anywhere for sending a follow-up instruction to the run. Root cause is shared with AI-30/AGENTIC-WORK-005 (a conversation with an active managed run hard-rejects any new message with HTTP 409), but the missing UI affordance is separate.

**Done when.** Add the composer once the runtime accepts mid-run guidance (an optional guidance field on the tool-approval-resume contract is the smallest first step).

**Where.** `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:420-585`, `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`

**Blocked by.** AI-30 / AGENTIC-WORK-005 (no mid-run steering path in the runtime)

**From.** audit/competitive-gap-2026-08-15 — sched-gap-15 (sched-21)

### WEB-76 — Completed research report reader has no nested table of contents

`MEDIUM` · web · effort ?

**What.** dr G5 (dr-21): ResearchReportView.tsx renders the whole report body as one continuous MarkdownContent block with no heading extraction, and no TableOfContents helper exists.

**Done when.** Extract markdown headings client-side and render a clickable nested TOC anchored to in-page heading IDs.

**Where.** `apps/web/features/chat/components/research/ResearchReportView.tsx:252-257`

**From.** audit/competitive-gap-2026-08-15 — search-deep-research G5 (dr-21)

### WEB-77 — A reopened or standalone research report is a dead end — no follow-up composer for grounded Q&A

`MEDIUM` · web · effort ?

**What.** dr G12 (dr-22): ResearchReportView.tsx and ReportTab, the only two places a persisted report renders, have no composer or 'ask about this' affordance, so a report opened outside its originating conversation cannot be followed up on.

**Done when.** Add a lightweight composer to ResearchReportView when hosted outside the live conversation, seeding follow-ups with the report content.

**Where.** `apps/web/features/chat/components/research/ResearchReportView.tsx`, `apps/web/features/chat/components/research/ResearchPanel.tsx`

**From.** audit/competitive-gap-2026-08-15 — search-deep-research G12 (dr-22)

### WEB-81 — WorkSessionPanel has a static 'AGI Work session' header for every task and no options menu

`MEDIUM` · web · effort ?

**What.** agentic-modes-gap-04 (agentic-05): WorkSessionPanel.tsx:496-513 always renders the literal string 'AGI Work session' with no per-task semantic title, and offers only a close (X) button.

**Done when.** Use the newly-shipped title generator to replace the static header, and add an options menu alongside the close button.

**Where.** `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:496-513,500`

**From.** audit/competitive-gap-2026-08-15 — agentic-modes-gap-04 (agentic-05)

### WEB-82 — A conversation with a running task shows no status in the chat-history sidebar row

`MEDIUM` · web · effort ?

**What.** agentic-modes-gap-03 (agentic-04) and shell-nav-ia-gap-04 (shell-04): TasksPage has a live status system (tone-coloured badge, spinner, self-rescheduling poll) but ConversationListItem.tsx has no run-status awareness (only isActive/isStarred/isPinned/isArchived) and SidebarSession has no status/isStreaming/isRunning field, so SessionItem.tsx (298 lines) has zero badge logic.

**Done when.** Add an optional status field to SidebarSession, populate it from the same run-state source TasksPage reads, and render a small dot in SessionItem/ConversationListItem for active runs.

**Where.** `packages/ui/ui/src/sidebar/types.ts:16-34`, `packages/ui/ui/src/sidebar/SessionItem.tsx`, `apps/web/features/chat/components/Sidebar/ConversationListItem.tsx:54-84`

**From.** audit/competitive-gap-2026-08-15 — agentic-modes-gap-03 (agentic-04); shell-nav-ia-gap-04 (shell-04)

**Folded in.** agentic-modes-gap-03; shell-nav-ia-gap-04

### WEB-84 — Delete-conversation dialog names no dependent objects (schedules, published artifacts, generated media)

`MEDIUM` · web · effort ?

**What.** agentic-modes-gap-07 (agentic-09) and MEDIA-DELETE-11 (media-20): ConversationListItem.tsx:320-323 shows generic copy ('This will permanently delete… and all its messages'), naming no dependent objects and not stating whether generated images/videos are included. Delete is a soft delete (deleted_at), and whether a schedule tied to a soft-deleted conversation keeps firing or orphans is explicitly unverified.

**Done when.** Name dependent objects in the dialog when present — but verify server-side behaviour (schedules, generated media) before claiming it in copy, especially on the compliance/dpdp branch.

**Where.** `apps/web/features/chat/components/Sidebar/ConversationListItem.tsx:320-323`, `apps/web/app/api/chat/conversations/[id]/route.ts:233-242`

**From.** audit/competitive-gap-2026-08-15 — agentic-modes-gap-07 (agentic-09); MEDIA-DELETE-11 (media-20)

**Folded in.** agentic-modes-gap-07; MEDIA-DELETE-11

### WEB-86 — Suggested-prompt chips were deliberately deleted from the empty-state composer, against 4-of-4 competitor convergence

`MEDIUM` · web · effort ?

**What.** shell-nav-ia-gap-02 (shell-20): GreetingBanner.tsx:11-13 records 'The six quick-start suggestion chips were removed here and on mobile and desktop (founder 2026-08-06): the empty state is the mark and the greeting, nothing else.' All four benchmarked products show starter-prompt chips. Related ledger drift is separately recorded: ui-gaps.csv GAP-051/GAP-205 still mark QuickChips 'Done' for a feature that was deleted.

**Done when.** Flag to the founder for reconsideration given unanimous convergence, rather than silently re-adding chips; retire GAP-051/GAP-205 to 'Superseded' either way.

**Where.** `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx:11-13`

**Blocked by.** founder decision (2026-08-06) being reconsidered

**From.** audit/competitive-gap-2026-08-15 — shell-nav-ia-gap-02 (shell-20); audit/parity-2026-08-15 DeadAndDisconnectedCode.md §11 (GAP-051/GAP-205)

### WEB-89 — No per-message timestamp anywhere in web's response action row, though the weaker Chrome extension renders one

`MEDIUM` · web · effort S

**What.** CLR-03 (composer-11): message.timestamp exists as data (MessageBubble.tsx:2215) but is used only for memo comparisons and never rendered; the 'Slim badge row' comment explicitly says 'no name/timestamp'. The extension's bubbles.ts does render a timestamp span despite an otherwise much weaker action row.

**Done when.** Add a small relative-timestamp span near the action row, reusing the extension's formatTime pattern.

**Where.** `apps/web/features/chat/components/messages/MessageBubble.tsx:1053,2215`, `apps/extension/src/features/side-panel/bubbles.ts:241-243,704-705`

**From.** audit/competitive-gap-2026-08-15 — CLR-03 (composer-11)

### DOCS-25 — /features/plugins and /plugins tell contradictory 'is this real yet' stories with no cross-link

`LOW` · docs · effort S

**What.** duplication/extension-surfaces.md §2.5. /features/plugins says 'Previewed on the agi CLI today, ahead of a marketplace' (CLI-only framing); /plugins renders a live hosted Web registry whose entries can be 'Available on Web'/'Installable' and says 'The catalogue below is the live hosted registry'. Contradictory launch-state claims, undiscoverable because nothing cross-links the two pages — and per WEB-31/CPS-07 every /plugins row is in fact status='preview' and not installable.

**Done when.** Add a cross-link from /features/plugins to /plugins and make /features/plugins defer to the real catalogue state rather than a hardcoded 'CLI preview only' claim.

**Where.** `apps/web/app/features/plugins/page.tsx`, `apps/web/app/plugins/page.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.5

**Folded in.** /features/plugins and /plugins tell contradictory 'is this real yet' stories with no cross-link

### SEC-83 — Opening an HTML artifact logs a CSP violation from about:srcdoc

`LOW` · security/sandboxing · effort S

**What.** FIXES-APPLIED.md Known-remaining (audit/competitive-gap-2026-08-15): 'Opening an HTML artifact logs one CSP console error from about:srcdoc; present on /gallery before this work too.' Pre-existing defect surfaced during the remediation wave and not fixed by it. Filed separately from SEC-18 (sandbox isolation degrading to same-origin because NEXT_PUBLIC_SANDBOX_ORIGIN is unset, three diverged CSP copies) because the causal link was not established — it may be a symptom of that divergence or an independent policy error.

**Done when.** Reproduce on /gallery, identify which CSP directive the about:srcdoc frame violates, and either fix the directive or confirm it is a symptom of SEC-18's diverged CSP copies and fold it in.

**Where.** `apps/web/app/gallery/GalleryClient.tsx`

**From.** audit/competitive-gap-2026-08-15/FIXES-APPLIED.md Known-remaining

**Folded in.** Opening an HTML artifact logs a CSP console error from about:srcdoc

### UI-05 — No typed weather or other vertical result card exists — only a generic tool timeline

`LOW` · ui · effort M

**What.** Current research and the repository prove no typed weather-card producer exists on Web or Mobile; the only weather path is a generic tool timeline. Explicitly recorded: do not fabricate a weather card from prose — add one only with a validated schema, a real producer, persistence, and Local/Cloud boundary behaviour.

Also recorded by a later audit (Only 2 of the declared InteractiveCard kinds have live producers (RENDERING-011); itinerary.v1 renderer still not built (wire-or-cut)): Only clarify.v1 and map-search.v1 have producers; itinerary.v1 and any weather/stocks/shopping/local-business/reservations/jobs kind fall back rather than fabricate unverified data — an honest, deliberate non-implementation. wire-or-cut adds that itinerary.v1 remains in the kind allowlist with no renderer and no producer, rendering the authored fallback, and that registering an entry with no producer 'would be untested code pretending to be shipped'. When prioritized, add producers behind the existing InteractiveCard registry rather than a new mechanism.

Also recorded by a later audit (No image-result or current-data (weather/stock/sports) card types in search results (SEARCH-RESEARCH-006)): Contract-level cause: WebSearchResultItem carries only {url, title, snippet, date} (apps/web/lib/web-search/web-search-tool.ts:117-123) — no image results and no structured current-data cards can be represented at all, so this is a data-contract gap, not just a missing renderer. The competitive benchmark itself flags this row as unverified/low-confidence, so it stays low priority. If pursued, extend the Perplexity Search API integration to optionally request image results.

**Done when.** If vertical result cards ship, each has a validated schema, a real server producer, persistence, and defined Local/Cloud behaviour; otherwise the product does not imply them.

**From.** ExecutionPlan.md (Mobile parity audit TODO); AuditRemediationLedger.md (PP-03 vertical cards); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### UI-06 — Tool-progress presentation is thin: one collapsed line instead of a step list, a double leading icon in the legacy fallback, and a generic 'M' badge for custom connectors

`LOW` · ui · effort S

**What.** Reference UIs show 'Searching for places -> Done' as an expandable step list; ours shows a single 'Preparing map' line. The ToolTimeline legacy fallback (used only when !canonicalActivity) renders a double leading icon and a weak Result affordance, and is tracked alongside a planned ToolTimeline safe-delete. The custom-connector activity badge still shows a generic 'M' letter because the display name is not threaded onto the versioned agent-event tool schema.

Also recorded by a later audit (No tool-use icon differentiation in the live task log, only status-colored dots (sched-gap-09)): Extends the thin-tool-progress finding to the tasks surface: TaskDetailPanel.tsx:94-118's ProgressRow gives every entry an identical small dot keyed only to status, never tool identity, even though tool entries carry a real name/summary. Fix: map a small icon set (search, code, browser, file) onto AgentActivityToolEntry.name/kind.

**Done when.** Tool progress renders as an expandable step list with correct icons and the real connector name, and the superseded legacy timeline is deleted.

**Where.** `packages/ui/unified-chat/src/components/AgentActivityTimeline`

**From.** ExecutionPlan.md; known-flaws.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** ExecutionPlan TODO: Tool-progress timeline shows one line instead of an expandable step list; ToolTimeline legacy fallback renders a double leading icon and a weak Result affordance; CONNECTOR-BADGE-CUSTOM-NAME: custom connector activity badge still shows a generic 'M' letter

### UI-19 — Conversation branching is not uniform across surfaces

`LOW` · ui · effort M

**What.** Desktop branching remains available and Web now has owner-scoped persisted branch creation with sibling navigation through the shared BranchNavigator, but Mobile still performs only a whole-thread copy with no branch relation. The mobile half overlaps the mobile slice; the shared BranchNavigator contract is the ui component.

Also recorded by a later audit (Branch/fork conversation switcher exists only on Web (RENDERING-009)): Quantifies it: grep for onBranch/BranchNavigator across mobile, extension and packages/ui/unified-chat's MessageBubble returns zero hits — only apps/web/features/chat/components/messages/MessageBubble.tsx:369-374,1062-1069,1977-1981 has it. Editing an earlier message on desktop/mobile creates the same implicit branch web does, with no way to see or switch it. Fix path: port onBranch/BranchNavigator into the shared MessageBubble (covers desktop), then mobile and the extension's bubbles.ts.

Also recorded by a later audit (Web conversation-level fork entry point — wired (wire-or-cut 2026-08-06)): ConversationTitleMenu gained 'Duplicate as branch'; the branch API and hook were already live end to end and only the conversation-level entry point was missing. Narrows UI-19 to the non-web surfaces plus the per-message discoverability issue filed as WEB-88.

Also recorded by a later audit (Branch/fork conversation switcher exists only on Web (RENDERING-009 + wire-or-cut mobile note)): Makes UI-19 concrete: grep for onBranch/BranchNavigator across mobile, extension and packages/ui/unified-chat's MessageBubble returns zero hits — only apps/web/features/chat/components/messages/MessageBubble.tsx:369-374,1062-1069,1977-1981 has it. Editing an earlier message on Desktop or Mobile creates the same implicit branch web does, with no way to see or switch it. wire-or-cut.md adds that Mobile still performs only a whole-thread copy rather than per-message branching. Fix: port onBranch/BranchNavigator into packages/ui/unified-chat's MessageBubble (covers Desktop) and add the equivalent to mobile's MessageBubble and the extension's bubbles.ts.

Also recorded by a later audit (Mobile conversation branching is still whole-thread copy only (wire-or-cut, Web Conversation Branching Boundary)): Names the specific surface behind 'not uniform across surfaces': web now has persisted selected-message branching (BranchNavigator plus CSRF-protected, rate-limited, idempotent, transactional /api/chat/conversations/[id]/branches) and the ledger explicitly records 'Mobile remains separately tracked because it still performs only a whole-thread copy'. RENDERING-009 independently confirms desktop and the extension have no branch UI either — grep for onBranch/BranchNavigator across mobile, extension and packages/ui/unified-chat's MessageBubble returns zero hits; only apps/web/features/chat/components/messages/MessageBubble.tsx:369-374,1062-1069,1977-1981 has it. Fix: port onBranch/BranchNavigator into the shared unified-chat MessageBubble (covers desktop) and add equivalents to mobile's MessageBubble and the extension's bubbles.ts.

**Done when.** Creating a branch produces the same persisted branch relation and navigation on every surface that offers the action.

**From.** audit/capability-gaps.csv (CAP-035); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### UI-20 — Design-token adherence for z-index and other shared scales is unverified and unguarded

`LOW` · ui · effort S · **unclear**

**What.** Sources disagree. AuditRemediationLedger MATCH-012 lists the exported z-index scale as unused with components hardcoding arbitrary values and no single overlay/layer contract. ExecutionPlan #99 records this as fixed (commit c6dc19e52): design-tokens.ts exported a zIndex scale with no matching --z-\* block in globals.css and eight overlay components hardcoded their own, now reconciled. Either way, no lint or visual-E2E guard rejects a new unapproved z-index or arbitrary colour/spacing/breakpoint/animation literal — that guard (HARD-022) is owned by the infra/ci slice.

**Done when.** Confirm the overlay stacking contract holds in the current tree, and ensure a guard exists that rejects new arbitrary values where shared tokens are required.

**Where.** `apps/web/shared/lib/design-tokens.ts:136-150`, `apps/web/app/globals.css`

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** MATCH-012: Exported z-index design-token scale is unused; components hardcode values; ExecutionPlan #99: Z-index scale is defined and never used (8 overlay components hardcode their own)

### UI-23 — Learning mode (Socratic questions, understanding checks, uploaded materials) is undecided and its surface is unreachable

`LOW` · ui · effort L · **unclear**

**What.** CAP-011 records that a learning vertical must not be created from comparison evidence alone; CAP-031 says the unreachable learn mode must be resolved before adding grading state; CAP-033 says course and lesson state must not be invented until learning mode is selected. All three are 'unclear' pending a product decision.

**Done when.** Learning mode is either scoped and built as a reachable surface with its own content model, or the unreachable learn-mode entry points are removed.

**From.** audit/capability-gaps.csv

**Folded in.** CAP-011: Socratic learning mode; CAP-031: Understanding checks; CAP-033: Uploaded learning materials

### UI-24 — Pagination page sizes and debounce intervals are independently redeclared across surfaces

`LOW` · ui · effort M

**What.** A 300 ms debounce is independently chosen in seven surfaces and components (search, command palette, filters, MCP discovery, autosave) with no fake-clock tests; page size 50 is repeated across Desktop, Web and Mobile while run-history page size 20 drifts, with no resource-specific pagination contract carrying server maximums and opaque cursors. ExecutionPlan #65 records a partial consolidation (ac20a2962). The magic-number lint guard (HARD-021) is owned by the infra/ci slice.

**Done when.** Page size and debounce values come from one shared, per-resource contract rather than being redeclared per component.

**Where.** `apps/desktop/src/stores/chat/chatStore.ts:170`

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** HARD-009: 300 ms debounce copied across seven surfaces/components; HARD-012: Page size 50 repeated across Desktop/Web/Mobile; run-history page size 20 drifts

### UI-50 — Shared Spinner primitive is unused on web; loading indicators fragmented across 60+ raw Loader2 usages plus a hand-rolled duplicate

`LOW` · design-system · effort S

**What.** DESIGN-SYSTEM-012: Spinner.tsx is a documented primitive whose comment records a prior a11y-drift fix (desktop had dropped role="status"), but a grep for Spinner usage in apps/web finds no direct JSX usage. 60 files implement their own spin treatment with lucide's Loader2, plus a second hand-rolled duplicate at apps/web/shared/ui/loading-spinner.tsx.

**Done when.** Point apps/web/shared/ui/loading-spinner.tsx's remaining call site at the shared Spinner primitive and delete the duplicate; leave the 60 inline Loader2 usages unless a future pass wants a full sweep.

**Where.** `packages/ui/ui/src/primitives/Spinner.tsx:1-42`, `apps/web/shared/ui/loading-spinner.tsx:1-32`

**From.** audit/parity-2026-08-15 — DESIGN-SYSTEM-012

### UI-54 — Web lacks the shared package's configurable send shortcut (Enter vs Cmd/Ctrl+Enter)

`LOW` · ui · effort ?

**What.** COMPOSER-008: the shared unified-chat ChatInput exposes a real host-controlled sendShortcut prop ('mod-enter'|'enter') used by desktop, while web's primary composer hardcodes plain Enter with Cmd/Ctrl+Enter always-on as a secondary trigger; a repo-wide grep for sendShortcut/enterToSend in apps/web returns zero hits. Desktop's own setSendShortcut is separately dead (see UI-62).

**Done when.** Thread a sendShortcut preference through web's settings store into ChatComposerNew.tsx's keydown handler, defaulting to today's Enter-sends behaviour.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1910`, `packages/ui/unified-chat/src/components/ChatInput.tsx:924,1266`

**From.** audit/parity-2026-08-15 — COMPOSER-008

### UI-59 — No native or interactive chart component — generated charts only ever reach the user as a static PNG

`LOW` · ui · effort ?

**What.** RENDERING-012: a grep for recharts|Chart\b across apps/web/features/chat/components returns nothing; the only chart path is CodeExecutionBlock.tsx's base64 image rendering, always a static raster.

**Done when.** If pursued, add a native chart card driven by structured JSON the model emits directly, reusing the InteractiveCard registry pattern rather than a new mechanism.

**Where.** `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:112-122`

**From.** audit/parity-2026-08-15 — RENDERING-012

### UI-67 — The lighter WebAppShell omits the free-plan upgrade nudge WebChatPage shows

`LOW` · ui · effort S

**What.** SHELL-NAV-IA-006: WebChatPage's account footer shows a dismissible 'Free plan — Upgrade' pill and inline badge for free-tier users; the second lighter WebAppShell used for /tasks, /chat/library, /chat/projects and /chat/schedules omits both.

**Done when.** Extract the free-plan nudge into a small shared component both shells' footerSlot can render.

**Where.** `apps/web/shared/components/layout/WebAppShell.tsx:242-368`, `apps/web/features/chat/pages/WebChatPage.tsx:3820-3875`

**From.** audit/parity-2026-08-15 — SHELL-NAV-IA-006

### UI-72 — ArtifactsSidebar.tsx in the shared package is fully dead with zero non-test importers

`LOW` · ui · effort S

**What.** duplication/components.md §7 'related dead code found while tracing this': ArtifactsSidebar.tsx is exported from packages/ui/unified-chat's index.ts and fully tested, but has zero non-test importers anywhere in the repo — not web, not desktop, not mobile.

**Done when.** Delete ArtifactsSidebar.tsx or wire up a real consumer.

**Where.** `packages/ui/unified-chat/src/components/ArtifactsSidebar.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §7

### UI-73 — ArtifactPanel self-admits its HTML rendering duplicates ArtifactRenderer.HtmlArtifact, kept in sync only by a comment

`LOW` · ui · effort ?

**What.** duplication/components.md §7 'a drift admission already in the code': packages/ui/unified-chat/src/components/ArtifactPanel.tsx contains a comment acknowledging that its HTML rendering and ArtifactRenderer.HtmlArtifact's are two separate code paths kept in sync only by a note telling the next editor to update both.

**Done when.** Consolidate the two HTML-artifact rendering code paths into one shared implementation.

**Where.** `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §7

### UI-97 — packages/ui/unified-chat carries a fully dead exported component and a self-admitted duplicate HTML-rendering path

`LOW` · ui · effort S

**What.** duplication/components.md §7. ArtifactsSidebar.tsx is exported from the package's index.ts and fully tested but has zero non-test importers anywhere in the repo — not web, not desktop, not mobile. Separately, ArtifactPanel.tsx contains its own code comment acknowledging that its HTML rendering and ArtifactRenderer.HtmlArtifact's HTML rendering are two separate code paths kept in sync only by a comment telling the next editor to remember to update both.

**Done when.** Delete ArtifactsSidebar.tsx or wire up a real consumer; consolidate the two HTML-artifact rendering paths into one shared implementation instead of relying on a comment.

**Where.** `packages/ui/unified-chat/src/components/ArtifactsSidebar.tsx`, `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §7

### WEB-05 — Video model picker lists a preview-only model as selectable, which 400s immediately on submit

`LOW` · web · effort S

**What.** VIDEO_MODELS filters only on status==='deprecated', not on availability, so a preview-availability video model renders as pickable; generate/route.ts then rejects it with 'Unknown or unavailable video model'.

**Done when.** The video model picker offers only models the generate route will accept — availability is part of the filter, not just deprecation status.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:309-315`, `apps/web/app/api/media/video/generate/route.ts:162`

**From.** phase4-capability-audit.md (PP-19)

### WEB-09 — /admin console has no inbound navigation link anywhere in the app shell

`LOW` · web · effort S

**What.** The admin console inventories every enterprise control, but grep for '/admin' returns only route-blocklist arrays and no nav link — the page is reachable only by typing the URL.

**Done when.** The admin console is reachable from the app shell for users entitled to it, or it is explicitly documented as URL-only and excluded from capability claims.

**From.** phase4-capability-audit.md (PP-27)

### WEB-103 — No in-settings ad-personalization opt-out, and no confirmation that a program exists to gate

`LOW` · web · effort ? · **unclear**

**What.** settings-15-gap: grepping every settings section for ads/Ads/advertis returns zero matches referring to a real ad-personalization control, and no evidence was found of a program this would need to gate.

**Done when.** Confirm whether any account data is shared with an ad vendor; build the toggle only if such a program exists — do not ship a decorative control.

**Where.** `apps/web/features/settings/sections`

**From.** audit/competitive-gap-2026-08-15 — settings-15-gap (settings-15)

### WEB-104 — No unified named settings destination covering cloud and local compute access

`LOW` · web · effort ?

**What.** settings-22-gap and agentic-modes-gap-16 (agentic-22): desktop's Computer Use capability settings and the Connections tab's local-machine pairing are separate, differently-named destinations, and no page frames them as peers. Substantially explained by the Local/Managed-Cloud trust-boundary separation, which must not be collapsed into one picker.

**Done when.** If a unified view is wanted, surface both sides in one named destination without merging their trust models.

**From.** audit/competitive-gap-2026-08-15 — settings-22-gap (settings-22); agentic-modes-gap-16 (agentic-22)

**Folded in.** settings-22-gap; agentic-modes-gap-16

### WEB-105 — Developer console inside settings covers API keys but has no user-facing webhook management

`LOW` · web · effort ?

**What.** settings-23-gap: ApiKeysManager renders inside AccountSection.tsx, but grepping every settings component for 'Webhook' returns zero hits for a user-facing webhook UI — existing webhook code is inbound backend plumbing only.

**Done when.** Add a Webhooks sub-tab next to the existing API Keys manager if user-facing webhooks become a roadmap item.

**Where.** `apps/web/features/settings/sections/AccountSection.tsx:20,340`

**From.** audit/competitive-gap-2026-08-15 — settings-23-gap (settings-23)

### WEB-106 — No centralized Deployments/Domains surface; the published-artifacts list has no custom-domain mapping

`LOW` · web · effort ?

**What.** settings-24-gap: PublishedArtifactsSection.tsx is a real centralized 'what is public' list with revoke/unpublish, but has no custom-domain mapping and no Websites/Apps/Domains sub-tab structure.

**Done when.** Extend PublishedArtifactsSection with custom-domain mapping if that capability ships.

**Where.** `apps/web/features/settings/sections/PublishedArtifactsSection.tsx`

**From.** audit/competitive-gap-2026-08-15 — settings-24-gap (settings-24)

### WEB-107 — Settings search indexes only section-level keywords, not per-control body copy

`LOW` · ui · effort ?

**What.** domain-settings.md §4 (noted for completeness, not filed as a formal SETTINGS-\* id) and MissingScreensAndComponents.md §E: settings-nav.ts:196-198's keyword system operates at section granularity only, so a search for a control's own label or body text cannot surface it.

**Done when.** Extend settings search to index each control's body copy, not just its section-level keywords array.

**Where.** `packages/ui/ui/src/settings-nav.ts:196-198`

**From.** audit/parity-2026-08-15 gaps/domain-settings.md §4; MissingScreensAndComponents.md §E

### WEB-108 — In-conversation search has no per-match highlighting inside the message bubble

`LOW` · web · effort ?

**What.** wire-or-cut.md 2026-08-06 late web items: Cmd+F in-conversation search was wired (ChatMessageList now owns it, fixing a virtualized-list truncation), but the note states explicitly that 'per-match text highlighting inside the bubble is NOT included — needs a new prop threaded through the markdown renderer, tracked separately.'

**Done when.** Thread a match-highlight prop through MarkdownContent so matched spans render highlighted in the bubble.

**From.** docs/adr/wire-or-cut.md 2026-08-06 Wave 2 late web items — In-conversation search

### WEB-115 — /dev/inline-toolcall-demo tracked source permanently embeds a stray local filesystem path

`LOW` · web · effort S

**What.** DEAD-CODE-011. The qa-artifacts/dev kill-switch itself (env guard + gitignore + robots disallow) is genuinely well-engineered and correctly prevents production exposure. The only residual issue: apps/web/app/dev/inline-toolcall-demo/page.tsx permanently embeds the literal string '~/Desktop/reference/ui/desktop/claude-artifacts/…' in tracked, dev-only source.

**Done when.** Replace the literal local path with a generic placeholder or comment-only reference; do not remove the kill-switch guard itself.

**Where.** `apps/web/app/dev/inline-toolcall-demo/page.tsx`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-011; audit/parity-2026-08-15 — DEAD-CODE-011

**Folded in.** /dev/inline-toolcall-demo tracked source permanently embeds a literal local filesystem path

### WEB-119 — Two independent dynamic() wrappers around WebChatPage show different cold-load skeletons

`LOW` · web · effort S

**What.** duplication/chat-shells.md Finding 4. WebChatRoot.tsx:6-11 and app/chat/[sessionId]/page.tsx:6-11 each independently call dynamic(… import WebChatPage …, {ssr:false, loading}) with a different loading fallback; both carry near-identical 'GOV-25' comments — the same fix applied twice by hand.

**Done when.** Route [sessionId]/page.tsx through WebChatRoot, or share one loading component between both wrappers.

**Where.** `apps/web/features/chat/components/WebChatRoot.tsx:6-11`, `apps/web/app/chat/[sessionId]/page.tsx:6-11`

**From.** audit/competitive-gap-2026-08-15/duplication/chat-shells.md Finding 4

**Folded in.** Two independent dynamic() wrappers around WebChatPage show different cold-load skeletons

### WEB-121 — Tasks and Schedules are presented as two unrelated nav lists over four disconnected backend types

`LOW` · web · effort L

**What.** duplication/tasks-schedules.md Finding 5. cloud_agent_runs and scheduled_tasks/scheduled_task_runs have no FK or shared row (0061_cloud_agent_runs.sql vs 0057_durable_scheduling.sql / 0009_scheduling.sql); zero cross-links exist in either direction; four distinct types (Task, ScheduleTask, AgentTaskStore goal, ScheduledTask) surface as two disconnected nav lists. The backend split is a defensible product decision and the Schedule form is honest about its limits, but the result violates the 'one place for my automated work' mental model every competitor uses.

**Done when.** Product decision, not a refactor: either cross-link the two surfaces, or extend scheduled execution to optionally use the full agent harness (AI-36) before unifying the list UI.

**Where.** `apps/web/db/neon/0061_cloud_agent_runs.sql`, `apps/web/db/neon/0057_durable_scheduling.sql`, `apps/web/db/neon/0009_scheduling.sql`

**Blocked by.** sequenced after AI-36 (scheduled runs have no tools)

**From.** audit/competitive-gap-2026-08-15/duplication/tasks-schedules.md Finding 5; audit/competitive-gap-2026-08-15/duplication/tasks-schedules.md Finding 5; all-axes.json#tasks-schedules[4]

**Folded in.** Tasks and Schedules are presented as two unrelated nav lists over four distinct backend types

### WEB-126 — /apps page doc comment falsely claims a public marketing fallback that does not exist

`LOW` · web · effort S

**What.** duplication/extension-surfaces.md §2.4. apps/page.tsx:24's header comment says 'Unauthenticated visitors see a public marketing fallback', but the code renders null while Clerk loads then router.replace('/login?redirectTo=/apps') — confirmed by apps/page.test.tsx:67-74. The actual public fallback for the concept is a different route, /integrations.

**Done when.** Fix the stale doc comment so it no longer describes fallback markup that does not exist.

**Where.** `apps/web/app/apps/page.tsx:24`, `apps/web/app/apps/page.test.tsx:67-74`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.4

### WEB-128 — qa-artifacts dev harness carries a stale 'Delete after QA' comment and was never removed

`LOW` · web · effort S

**What.** duplication/all-axes.json#library-artifacts-gallery[3]. apps/web/app/qa-artifacts/layout.tsx calls notFound() under NODE_ENV=production, the directory is gitignored and it is in robots.ts DISALLOW_APP — so it is inert — but its own header comment says 'Delete after QA'.

**Done when.** Delete apps/web/app/qa-artifacts now that its QA purpose is served.

**Where.** `apps/web/app/qa-artifacts/`

**From.** audit/competitive-gap-2026-08-15/duplication/content-surfaces.md

### WEB-13 — /connectors hangs the local dev server; root cause never found

`LOW` · web · effort M

**What.** A request to /connectors on the local dev server never resolves, stacking hung workers under repeated probes. The production build passes cleanly so the merge guard was lifted, but the underlying compile-hang root cause was never found via static analysis. Dev-only; production unaffected.

**Done when.** /connectors compiles and responds on the local dev server, with the root cause identified rather than worked around.

**Where.** `apps/web/features/connectors/pages/ConnectorsPage.tsx`

**From.** known-flaws.md (WEB-CONNECTORS-SSR-HANG-2026-07-11)

### WEB-132 — No 'promote this conversation or task to a recurring schedule' action anywhere

`LOW` · web · effort M

**What.** agentic-modes-gap-12 / shell-nav-ia-gap-09. No conversation or task menu (MessageBubble.tsx, ConversationListItem.tsx, WorkSessionPanel.tsx, SessionItem.tsx) offers a schedule-creation shortcut; schedules are created only from a standalone /chat/schedules flow with no conversationId/fromConversation concept anywhere. Repo grep for 'Schedule a task' / 'Turn into schedule' / 'promoteToSchedule' returns zero hits.

**Done when.** Add a 'Schedule this' menu action that pre-fills ScheduleForm with the source conversation's context.

**Where.** `packages/ui/ui/src/sidebar/SessionItem.tsx`, `apps/web/features/chat/components/messages/MessageBubble.tsx`, `apps/web/features/chat/components/Sidebar/ConversationListItem.tsx`

**From.** audit/competitive-gap-2026-08-15/domains/agentic-modes.json agentic-modes-gap-12; audit/competitive-gap-2026-08-15/domains/shell-global-nav-ia-design-system.json shell-nav-ia-gap-09; audit/competitive-gap-2026-08-15 — agentic-modes-gap-12 (agentic-18); shell-nav-ia-gap-09 (shell-28)

**Folded in.** agentic-modes-gap-12; shell-nav-ia-gap-09; No 'promote this conversation/task to a recurring schedule' action in any menu

### WEB-20 — Popular searches stay empty in production — migration 0045 applied to dev only

`LOW` · web · effort S

**What.** Migration 0045's get_popular_searches was applied to the DEV database only. A code-level fallback prevents the 500 that previously broke the search modal, but the popular-searches feature renders empty in production until 0045 is applied.

**Done when.** The search modal shows real popular searches in production, or the feature is removed from the modal until the backing function exists.

**Where.** `apps/web/db/neon/0045*.sql`, `apps/web/app/api/search/route.ts`

**Blocked by.** migration 0045 must be applied to production Neon

**From.** known-flaws.md (PROD-SEARCH-MIGRATION-0045-01)

### WEB-21 — Reflect produces no persisted or shareable recap artifact and no cross-device active-time aggregation

`LOW` · web · effort M · **in-progress**

**What.** Server-owned recap works for 30/90/180/365-day ranges with bounded reads, but there is no persisted artifact, no user feedback loop, no cross-device aggregation, and no Desktop presentation. Partially remediated 2026-07-18.

**Done when.** A Reflect recap can be saved and shared, and its active-time figures aggregate across the user's devices rather than one browser.

**From.** known-flaws.md (WEB-REFLECT-01)

### WEB-22 — Time-and-focus break counter is browser-local and the account namespace is not consumed by other surfaces

`LOW` · web · effort M · **in-progress**

**What.** Quiet hours and break intervals work on web, but the break counter is browser-local; Mobile's quiet-hours UI is still device-local notification suppression that does not consume the shared account namespace, selected weekdays, or timezone, and Desktop does not consume the settings at all. Cross-surface consumption overlaps the mobile and desktop slices.

**Done when.** Quiet hours and break settings are account-scoped and honoured identically wherever they are shown.

**From.** known-flaws.md (WEB-TIME-FOCUS-01)

### WEB-27 — Specialized verticals (health/legal/education/cyber/shopping/travel/maps/finance) are undecided or decorative

`LOW` · web · effort M

**What.** No scope decision exists per vertical, and no domain-specific policy, disclaimers, data handling, sources, evaluations or UI back them. A decorative financial/Plaid integration remains in place despite no vertical being committed. Downgrading the public copy is owned by the docs slice.

**Done when.** Each vertical is either built with its own policy and disclaimers or removed from the product surface, with no decorative integrations left behind.

**From.** AuditRemediationLedger.md

**Folded in.** PP-31: Specialized verticals undecided or decorative; DOC-021: Design/Science/Security vertical products not downgraded consistently

### WEB-28 — Two dead web modules (~1,500 lines) still ship, carrying their own duplicate upload-cap logic

`LOW` · web · effort S

**What.** shared/ui/ai-prompt-box.tsx is an 815-line second composer with zero importers and SecurityManager in shared/lib/security.ts is ~700 lines with zero importers repo-wide. Both were pointed at the canonical 12MB attachment constant during the upload-cap fix rather than deleted, so the duplicate cap logic survives as a future drift source. The ledger's HARD-006 still lists these two files as carrying a 10MB literal; ExecutionPlan records the canonical-constant repointing — either way the modules are dead and should go.

**Done when.** Both zero-importer modules are deleted, leaving one composer and one attachment-cap owner.

**Where.** `apps/web/shared/ui/ai-prompt-box.tsx`, `apps/web/shared/lib/security.ts`, `packages/contracts/cloud-contracts/src/chat-attachments.ts`

**Blocked by.** deletion deferred to a founder call in ExecutionPlan.md

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** HARD-006: Upload cap is 10 MB in several clients while canonical cap is 12 MB (web residue); ExecutionPlan audit sweep TODO: Two dead web modules still carry their own wrong hardcoded limits

### WEB-29 — Map card cannot draw a real route line or place photos, and has no dark-theme tiles

`LOW` · web · effort S

**What.** GOOGLE_API_KEY is a Generative Language key, not a Maps Platform key — verified 2026-08-12 that Maps Static/Geocoding/Directions all return REQUEST_DENIED. OSRM's public demo server is documented development-only with no SLA and must not back a shipped feature, and drawing a straight line between endpoints was explicitly rejected as fake functionality. Dark map tiles need CARTO basemaps, a licensing decision. Mobile acceptance of the map-card path against the deployed backend is also outstanding (mobile slice).

**Done when.** A routing credential is provisioned and the map card draws a real route; the dark-theme basemap licensing question is decided.

**Blocked by.** FoundersAssistance.md #16 — needs an OpenRouteService or Google Maps Platform credential the environment lacks

**From.** FoundersAssistance.md; ExecutionPlan.md

**Folded in.** FoundersAssistance #16: Provide a routing credential so map cards can draw a real route line; ExecutionPlan TODO: Dark map tiles unavailable (OSM standard tiles are light-only)

### WEB-47 — /skills, /connectors, /apps, /device-auth and /user render the app-wide default <title>

`LOW` · web · effort S

**What.** SHELL-NAV-IA-007: none of these five route files exports a metadata object, so each shows the generic app title in the tab and in shared links.

**Done when.** Add a metadata export with a short specific title to each file — one line per file, no behavioural risk.

**Where.** `apps/web/app/skills/page.tsx`, `apps/web/app/connectors/page.tsx`, `apps/web/app/apps/page.tsx`, `apps/web/app/device-auth/page.tsx`, `apps/web/app/user/page.tsx`

**From.** audit/parity-2026-08-15 — SHELL-NAV-IA-007

### WEB-48 — Marketing-nav mobile breakpoint hides the primary sign-in/CTA behind the hamburger

`LOW` · web · effort S

**What.** shell-nav-ia-gap-07: globals.css @media (max-width: 900px) hides both .agi-top-nav-desktop and .agi-top-actions-desktop (Sign-in/CTA) together, unlike the benchmark which keeps CTAs visible outside the hamburger at a similar breakpoint.

**Done when.** Split the media query so the CTA-only variant stays visible while only nav links collapse into the hamburger.

**Where.** `apps/web/app/globals.css:2246-2254`

**From.** audit/competitive-gap-2026-08-15 — shell-nav-ia-gap-07 (shell-26)

### WEB-55 — /apps page doc comment falsely claims a public marketing fallback for signed-out visitors

`LOW` · web · effort S

**What.** duplication/extension-surfaces.md §2.4: apps/page.tsx:24 says 'Unauthenticated visitors see a public marketing fallback', but the code renders null while Clerk loads then router.replace('/login?redirectTo=/apps') — confirmed by apps/page.test.tsx:67-74. The actual public fallback for the concept is /integrations.

**Done when.** Fix the stale doc comment so it no longer describes fallback markup that does not exist.

**Where.** `apps/web/app/apps/page.tsx:24`, `apps/web/app/apps/page.test.tsx:67-74`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.4

### WEB-57 — /ai-skills redirects with a ?tab=agents query param that /skills never reads

`LOW` · web · effort S

**What.** duplication/extension-surfaces.md §2.6: /ai-skills redirects to /skills?tab=agents while /features/ai-skills redirects to bare /skills; /skills's route component never reads any tab search param, so the query string is silently dropped.

**Done when.** Reconcile the two redirect targets; only meaningful if a real Skills sub-tab is ever built.

**Where.** `apps/web/app/ai-skills/page.tsx`, `apps/web/app/skills/page.tsx:14-27`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.6

### WEB-58 — qa-artifacts dev harness is still present with a stale 'Delete after QA' comment

`LOW` · web · effort S

**What.** duplication/content-surfaces.md and all-axes#library-artifacts-gallery[3]: apps/web/app/qa-artifacts/layout.tsx notFound()s in production, is gitignored and robots-disallowed — inert, but its own header comment says 'Delete after QA' and it was never removed.

**Done when.** Delete apps/web/app/qa-artifacts/ now that its QA purpose is served.

**Where.** `apps/web/app/qa-artifacts/`

**From.** audit/competitive-gap-2026-08-15/duplication/content-surfaces.md

### WEB-64 — No keyboard shortcut to toggle the Artifacts panel, and no row for it in the shortcuts dialog

`LOW` · web · effort S

**What.** ARTIFACTS-007 (prior GAP-227): grepping use-keyboard-shortcuts.ts and KeyboardShortcutsDialog.tsx for 'artifact' (case-insensitive) returns zero matches.

**Done when.** Bind Cmd/Ctrl+Shift+A in use-keyboard-shortcuts.ts to useArtifactsStore's togglePanel and add the row to KeyboardShortcutsDialog.tsx.

**Where.** `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts`, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:587-615`

**From.** audit/parity-2026-08-15 — ARTIFACTS-007 (GAP-227)

### WEB-65 — No embed-code or domain-allowlist option for published artifacts

`LOW` · web · effort ?

**What.** ARTIFACTS-006: the publish route response (token, shareUrl, publishedAt, kind, title, sandboxed) and the Settings 'Published artifacts' actions (Copy, Unpublish) contain no embed-related field or control anywhere. Distinct from WEB-30's TTL/quota/audit/per-viewer-auth gaps.

**Done when.** Add an allowedDomains column to published_artifacts, a settings field to manage it, generate an iframe snippet client-side and enforce via frame-ancestors on the public route.

**Where.** `apps/web/app/api/artifacts/publish/route.ts:1-159`, `apps/web/features/settings/sections/PublishedArtifactsSection.tsx:60-136`

**From.** audit/parity-2026-08-15 — ARTIFACTS-006

### WEB-66 — 'Live artifacts' nav item routes to the ordinary static Gallery — the labelled capability does not exist

`LOW` · web · effort S

**What.** ARTIFACTS-008: the Work-mode sidebar maps 'work-artifacts' to /gallery, the same target as plain Artifacts; no persistent auto-refreshing artifact concept exists anywhere in packages/platform/artifacts or the web app. This is the mislabelled-nav half of the live-artifacts story tracked separately from UI-08's unbuilt capability.

**Done when.** Relabel the nav item until a real live-artifact surface exists.

**Where.** `apps/web/features/chat/v3/WebShellV3.tsx:29-40`, `packages/platform/artifacts/src/artifact-sync.ts`

**From.** audit/parity-2026-08-15 — ARTIFACTS-008

### WEB-68 — Library media grid does not visually distinguish video thumbnails from image thumbnails

`LOW` · ui · effort S

**What.** PROJ-WS-05: GeneratedFileCard.tsx renders image and video assets as an identical plain <img>; the only differentiator is a text kindLabel below the thumbnail, not an icon overlay.

**Done when.** Add a small play/film-strip icon overlay on video tiles.

**Where.** `packages/ui/unified-chat/src/components/GeneratedFileCard.tsx:159-185`

**From.** audit/competitive-gap-2026-08-15 — PROJ-WS-05 (projects-16)

### WEB-70 — Schedule list rows structurally cannot show that a run is in progress

`LOW` · web · effort ?

**What.** sched-gap-07: /tasks has a live status system (tone-coloured badge, 4s polling) but ManagedCloudScheduleTask.status has no 'running' value, so ScheduleCard.tsx's collapsed row cannot indicate an in-flight run at all.

**Done when.** Add a transient 'running now' visual state to ScheduleCard driven by run status, without adding a new schedule-level enum value.

**Where.** `packages/contracts/cloud-contracts/src/schedules.ts:56`, `apps/web/features/schedules/components/ScheduleCard.tsx:106-108`

**From.** audit/competitive-gap-2026-08-15 — sched-gap-07 (sched-09)

### WEB-71 — No status filter on the web schedules list, though the control is fully built twice elsewhere

`LOW` · web · effort ?

**What.** sched-gap-13: SchedulesPage.tsx has no filter/tab state at all, while /tasks ships Active/All tabs and the desktop scheduler ships a 5-way filter — neither carried to /chat/schedules.

**Done when.** Port the /tasks Active/All filter pattern (or desktop's 5-state version) onto /chat/schedules.

**Where.** `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:52-55,371-389`, `apps/desktop/src/features/scheduler/ScheduledTasksPanel.tsx:14-20,126-160`

**From.** audit/competitive-gap-2026-08-15 — sched-gap-13 (sched-18)

### WEB-72 — No auto-generated semantic title on either scheduling surface

`LOW` · web · effort ?

**What.** sched-gap-08: schedule-form.ts's 'name' is a required user-typed field never auto-generated, and /tasks row labels come from a static workModeLabel() switch rather than the task's content.

**Done when.** Generate a short content-derived title on schedule creation and for task rows, reusing the conversation-title generator shipped 2026-08-15.

**Where.** `apps/web/features/schedules/lib/schedule-form.ts:253`, `packages/ui/unified-chat/src/components/tasks/task-display.ts:18-28`

**From.** audit/competitive-gap-2026-08-15 — sched-gap-08 (sched-10)

### WEB-75 — Create-schedule form opens pre-configured as a standing weekday-9am recurring task

`LOW` · web · effort S

**What.** sched-gap-17: INITIAL_SCHEDULE_DRAFT defaults recurrence:'daily', timeOfDay:'09:00', daysOfWeek:[1,2,3,4,5] — the inverse of an on-demand default, so an unattended recurring automation is the path of least resistance.

**Done when.** Default ScheduleDraft.recurrence to 'once', or force an explicit choice.

**Where.** `apps/web/features/schedules/lib/schedule-form.ts:26-43`

**From.** audit/competitive-gap-2026-08-15 — sched-gap-17 (sched-23)

### WEB-78 — No one-click transform of a completed research report into derivative formats

`LOW` · web · effort ?

**What.** ART-CANVAS-05 (artifacts-18) and dr G8 (dr-23): grepping ResearchReportView.tsx, ResearchPanel.tsx and ResearchActivity.tsx for infographic/flashcard/quiz/'audio overview'/Create-transform menu returns zero hits, and a repo-wide grep for 'Audio Overview'/'Flashcards' finds nothing.

**Done when.** Cheapest slice is a 'Turn into artifact' action on ResearchReportView that re-prompts the model to restructure the report as an HTML artifact, before investing in audio or quiz pipelines.

**Where.** `apps/web/features/chat/components/research/ResearchReportView.tsx`

**From.** audit/competitive-gap-2026-08-15 — ART-CANVAS-05 (artifacts-18); search-deep-research G8 (dr-23)

**Folded in.** ART-CANVAS-05; dr G8

### WEB-79 — Active research run has no titled narration panel and no opt-in 'notify me when done'

`LOW` · web · effort ?

**What.** dr G6 (dr-11) and dr G7 (dr-08): ResearchActivity.tsx gives phase labels and a plan-step queue but nothing structurally equivalent to a titled multi-paragraph narration panel; a grep of apps/web/features/chat for 'notify'/'Notify' in any research-adjacent component returns zero hits.

**Done when.** Stream the existing planning/gathering reasoning into a titled side panel, and extend an existing notification channel rather than building a parallel mechanism.

**Where.** `apps/web/features/chat/components/research/ResearchActivity.tsx`

**From.** audit/competitive-gap-2026-08-15 — search-deep-research G6 (dr-11), G7 (dr-08)

**Folded in.** dr G6; dr G7

### WEB-80 — No mid-flight steering of an active research run — the only interrupt is a full cancel

`LOW` · web · effort ?

**What.** dr G3 (dr-09, dr-10): multiple send-path handlers early-return on isStreaming, and handleStopGeneration is the only interrupt during a research run — no plan edit-in-place and no quick-answer redirect.

**Done when.** Lower-cost partial win is a 'Quick answer' interrupt reusing the existing Stop plumbing; full steering is an architectural change shared with WEB-74.

**Where.** `apps/web/features/chat/pages/WebChatPage.tsx:4238,2617,3403,3437,3519,3584`

**From.** audit/competitive-gap-2026-08-15 — search-deep-research G3 (dr-09, dr-10)

### WEB-85 — AUTO_TITLE_PLACEHOLDERS effect in WebChatPage races the new LLM title generator and re-truncates the title

`LOW` · web · effort S · **in-progress**

**What.** FIXES-APPLIED.md Known-remaining, against agentic-modes-gap-06 (agentic-08): LLM-generated two-stage conversation titles shipped 2026-08-15, but 'a pre-existing AUTO_TITLE_PLACEHOLDERS effect in WebChatPage.tsx races the generated title and re-truncates. Mitigated server-side by treating that effect's exact output as safe-to-replace; the durable fix belongs in that effect.'

**Done when.** Fix the AUTO_TITLE_PLACEHOLDERS effect directly so it stops racing and re-truncating; the server-side mitigation is a stopgap.

**Where.** `apps/web/features/chat/pages/WebChatPage.tsx`

**From.** audit/competitive-gap-2026-08-15 — agentic-modes-gap-06 (agentic-08); FIXES-APPLIED.md Known-remaining

### WEB-88 — Per-response branch/fork is buried in a hover-only overflow menu with no reassurance copy

`LOW` · web · effort S

**What.** agentic-modes-gap-11 (agentic-17), CLR-10 (composer-13) and shell-nav-ia-gap-08 (shell-27): conversation-branch-service.ts fully implements forking and MessageBubble.tsx:1977-1981 wires 'Branch conversation' correctly, but it lives inside a DropdownMenuItem and the entire action row is opacity-0 group-hover:opacity-100. No 'your original task stays unchanged' reassurance exists.

**Done when.** Promote the existing onBranch handler out of the overflow menu into the always-visible icon row; the backend already supports it.

**Where.** `apps/web/features/chat/components/messages/MessageBubble.tsx:1742,1761,1977-1982`

**From.** audit/competitive-gap-2026-08-15 — agentic-modes-gap-11 (agentic-17), CLR-10 (composer-13), shell-nav-ia-gap-08 (shell-27)

**Folded in.** agentic-modes-gap-11; CLR-10; shell-nav-ia-gap-08

### WEB-90 — No user-triggered Run affordance on a plain code block in chat

`LOW` · ui · effort ?

**What.** CLR-06 (composer-20): MarkdownContent.tsx's CodeBlock renders only a Copy button for any language. CodeExecutionBlock.tsx is a different mechanism rendering the output of a model-initiated tool call, not a user-triggered Run on an arbitrary code fence.

**Done when.** Low priority — a real sandboxed two-pane execution panel is substantial infra investment; track separately from the existing agentic 'Run code' toggle.

**Where.** `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:24-70`, `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx`

**From.** audit/competitive-gap-2026-08-15 — CLR-06 (composer-20)

### WEB-91 — Composer '+' menu 'Connectors' entry navigates away to the settings modal rather than offering an in-composer flow

`LOW` · web · effort ?

**What.** CLR-09 (composer-06): ChatComposerNew.tsx:2735-2775's Connectors item calls openSettings('connectors'); the code comment gives an honest rationale ('an inline connect toggle here would imply a mid-chat capability that does not exist'). The capability genuinely exists one navigation hop away.

**Done when.** If composer adjacency is wanted, open ConnectorsPage in a modal/sheet anchored to the composer rather than full settings navigation.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2735-2775`

**From.** audit/competitive-gap-2026-08-15 — CLR-09 (composer-06)

### WEB-92 — Composer has no discrete, named Canvas/artifact-creation entry

`LOW` · web · effort ?

**What.** ART-CANVAS-04 (artifacts-17): grep for canvas/Canvas in ChatComposerNew.tsx returns only an HTML <canvas> used for camera capture; artifact creation is implicit-by-prompt-content or via the Gallery's New Artifact button only.

**Done when.** If pursued, add a 'New artifact' entry to the composer's tools menu reusing the Gallery's existing category picker rather than a second implementation.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1063-1075`

**From.** audit/competitive-gap-2026-08-15 — ART-CANVAS-04 (artifacts-17)

### WEB-93 — Artifacts gallery has no search, no filter-by and no shared-with-you tab

`LOW` · web · effort ?

**What.** ART-CANVAS-01 (artifacts-09): GalleryClient.tsx has only two tabs ('yours'|'inspiration') and no search or filter UI anywhere in the file.

**Done when.** Add a search input and type/date filter first; a 'Shared with you' tab needs a cross-account artifact-sharing model that does not exist.

**Where.** `apps/web/app/gallery/GalleryClient.tsx:970,630`

**Blocked by.** Shared-with-you tab blocked on a cross-account artifact-sharing model

**From.** audit/competitive-gap-2026-08-15 — ART-CANVAS-01 (artifacts-09)

### WEB-94 — No dedicated top-level Images/Videos generation surface (nav entry, composer, template gallery)

`LOW` · web · effort ?

**What.** ART-CANVAS-07 (artifacts-20), MEDIA-NAV-07 (media-12) and MEDIA-TMPL-08 (media-15): video generation is real end to end (generate/status/cancel routes, workflow, in-chat lifecycle UI) but WebSidebar's nav items are Projects/Live artifacts/Dispatch/Schedules/Customize with no Images or Videos entry, and grep for 'template' across the composer and generation cards finds only unrelated slash-command hits. /chat/library browses already-generated media after the fact.

**Done when.** This is a chrome/surface gap, not a capability gap — add generation entry points per media type, reusing the existing APIs; a curated template gallery is separate content work.

**Where.** `apps/web/features/chat/v3/WebSidebar.tsx`, `apps/web/app/chat/library/page.tsx`

**From.** audit/competitive-gap-2026-08-15 — ART-CANVAS-07 (artifacts-20), MEDIA-NAV-07 (media-12), MEDIA-TMPL-08 (media-15)

**Folded in.** ART-CANVAS-07; MEDIA-NAV-07; MEDIA-TMPL-08

### WEB-95 — Image-generation entry points never disclose the underlying model name in first-party copy

`LOW` · web · effort ?

**What.** ART-CANVAS-08 (artifacts-22): modelId is threaded through function calls in ImageGenerationCard.tsx but no user-visible model-name string was found near the generation entry point. Flagged as a shallow single-file grep, so confidence is lower than sibling findings.

**Done when.** Surface the resolved model's display name sourced from the catalog (never hardcoded) near the image-generation entry point.

**Where.** `apps/web/features/chat/components/ImageGenerationCard.tsx`

**From.** audit/competitive-gap-2026-08-15 — ART-CANVAS-08 (artifacts-22)

### WEB-96 — Interactive checklist card description is line-clamped mid-word

`LOW` · ui · effort S

**What.** manual-qa-2026-08-15 QA-003 (P3, OPEN): the description clamps to 2 lines and cuts mid-phrase ('…reach out to your manager or IT if you hit any…'). Full text remains reachable via the 'Original response' toggle, so nothing is lost, but the truncation lands on a meaningless word.

**Done when.** Clamp at a sentence boundary or widen the clamp to 3 lines.

**From.** audit/manual-qa-2026-08-15.md#QA-003

### WEB-97 — Upgrade dialog close button overlaps and clips the Monthly/Annual toggle

`LOW` · ui · effort S

**What.** manual-qa-2026-08-15 QA-005 (P3, OPEN): the × close control sits on top of the right edge of the Monthly/Annual segmented toggle, clipping the word 'Annual'. Same family as QA-001 — a header row with no reserved space for its own controls.

**Done when.** Reserve dedicated space for the close control in the upgrade dialog header, matching the container-query fix pattern applied for QA-001.

**From.** audit/manual-qa-2026-08-15.md#QA-005

### WEB-98 — StepsCard checklist persistence key collides for two byte-identical checklists in one conversation

`LOW` · web · effort S

**What.** manual-qa-2026-08-15 QA-002 'Known limit, recorded not hidden': after the persistence fix, the localStorage key is conversation id + FNV-1a content hash, so two checklists with identical content in one conversation share a single entry. The durable fix requires threading a real message id through MessageCardRenderer and MessageFormatCard, which was not done.

**Done when.** Thread a stable message id through MessageCardRenderer -> MessageFormatCard -> StepsCard and key storage on it instead of a content hash.

**Where.** `apps/web/features/chat/components/cards/StepsCard.tsx`

**From.** audit/manual-qa-2026-08-15.md#QA-002 known limit

### WEB-99 — Other panel-hosted components may still use viewport breakpoints inside fixed-width panels

`LOW` · ui · effort S

**What.** manual-qa-2026-08-15 QA-001 follow-up: the artifact-panel toolbar overlap (198px measured) was caused by sm: viewport breakpoints deciding layout inside a ~399px split panel. The fix converted that one header to @container queries; the recommended sweep — 'grep other panel-hosted components for stray sm:/md:/lg: usage since the same viewport-vs-container-panel mistake could recur' — was never run.

**Done when.** Grep panel-hosted components for sm:/md:/lg: usage and convert to container queries where the component lives inside a fixed-width panel.

**Where.** `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`

**From.** audit/manual-qa-2026-08-15.md#QA-001 follow-up
