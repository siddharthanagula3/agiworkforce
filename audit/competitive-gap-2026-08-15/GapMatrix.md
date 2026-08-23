# Competitive Gap Matrix — AGI Workforce vs ChatGPT · Claude · Gemini · Manus

**Generated** by `build_matrix.py` from `domains/*.json`. Do not hand-edit — change the JSON and re-run, so the matrix and the synthesis can never drift apart.

**Benchmark:** `~/Desktop/competitive-product-research` — 68 files recording a live browser session against the real production apps of ChatGPT (GPT-5.6 Sol), Claude (Sonnet 5), Gemini (3.1 Pro) and Manus on 2026-08-15. Every benchmark claim carries that corpus's own evidence label (OBSERVED / STRONGLY INFERRED / UNVERIFIED).

**Totals:** 168 gaps across 14 domains.

| Severity | Count | | Our state | Count | | Vs prior audit | Count | | Effort | Count |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | 14 | | MISSING | 79 | | NEW | 137 | | S | 52 |
| P2 | 58 | | FIXED | 36 | | CONFIRMS_PRIOR | 28 | | M | 62 |
| P3 | 96 | | PARTIAL | 27 | | SUPERSEDES_PRIOR | 3 | | L | 43 |
|  |  | | DIFFERENT_BY_DESIGN | 11 | |  |  | | XL | 11 |
|  |  | | PRESENT_WORSE | 9 | |  |  | |  |  |
|  |  | | BUILT_NOT_WIRED | 6 | |  |  | |  |  |

## Reading the columns

- **MISSING** — the capability does not exist.
- **BUILT_NOT_WIRED** — the code exists and works, but a link in the chain `UI → client → contract → network → handler` is absent, so no user can reach it. The highest-leverage class: usually small effort, large visible payoff.
- **PARTIAL** — reachable, but materially thinner than the benchmark.
- **PRESENT_WORSE** — we ship it, and ours is the weaker implementation.
- **DIFFERENT_BY_DESIGN** — a deliberate divergence, filed so the decision stays visible.

## P0 — users hit a broken or incorrect experience today (0)

_None._

## P1 — table-stakes capability the benchmark has and we lack or half-ship (14)

| ID | Gap | Domain | State | Effort | vs prior |
|---|---|---|---|---|---|
| `CPS-08` | Mobile Skills screen remains unreachable from any nav entry point | Connectors, plugins, skills, MCP … | FIXED | S | CONFIRMS_PRIOR |
| `orch-gap-01` | The artifacts gallery is complete and working but reachable from nowhere in the app, and renders in marketing-site chrome | Orchestrator live verification (b… | FIXED | S | NEW |
| `settings-27-gap` | Voice settings page is real and honest but has no nav entry - still unreachable | Settings taxonomy & permission/ap… | FIXED | S | CONFIRMS_PRIOR |
| `CPS-01` | Skill auto-invoke matcher exists but has zero call sites in any chat UI | Connectors, plugins, skills, MCP … | FIXED | M | CONFIRMS_PRIOR |
| `MEDIA-VIDEO-01` | Staged attachments are silently discarded when sending in image- or video-generation mode | Image, video & voice generation | FIXED | M | CONFIRMS_PRIOR |
| `orch-gap-03` | Deep Research on the DEFAULT model silently takes the single-turn path — no plan card, no process narration, no signal to the user | Orchestrator live verification (b… | FIXED | M | SUPERSEDES_PRIOR |
| `sched-gap-01` | No real-task/suggested-template divider on the web schedules list | Scheduled tasks & automation | MISSING | M | NEW |
| `settings-26-gap` | Account deletion is not blocked by an active paid subscription, in either of two duplicate delete flows | Settings taxonomy & permission/ap… | MISSING | M | NEW |
| `G2` | Deep Research silently degrades to an unbranded single-turn fallback for Anthropic models and free-trial users | Web Search & Deep Research | FIXED | M | CONFIRMS_PRIOR |
| `agentic-modes-gap-01` | Global Chat↔Agentic-mode toggle is composer-only and doesn't change placeholder/empty-state | Agentic modes: Work / Cowork / Co… | PARTIAL | L | CONFIRMS_PRIOR |
| `CPS-02` | Connectors and Plugins have no in-composer per-message attachment; only Skills do | Connectors, plugins, skills, MCP … | PARTIAL | L | NEW |
| `CPS-07` | Plugin registry ships zero installable entries — the storefront and decomposition UI have nothing live behind them | Connectors, plugins, skills, MCP … | PARTIAL | L | NEW |
| `memory-13-gap` | Project/workspace memory isolation is absent (Web) or actively broken (Desktop writes to the global store) | Memory & personalization | BUILT_NOT_WIRED | L | CONFIRMS_PRIOR |
| `PROJ-WS-01` | No workspace-level memory scoping/isolation control (project memory is unconditionally account-wide) | Projects, workspaces, notebooks &… | MISSING | L | SUPERSEDES_PRIOR |

## P2 — real gap against the majority of the benchmark (58)

| ID | Gap | Domain | State | Effort | vs prior |
|---|---|---|---|---|---|
| `agentic-modes-gap-03` | Task run status doesn't mirror into the main conversation sidebar | Agentic modes: Work / Cowork / Co… | PARTIAL | S | NEW |
| `agentic-modes-gap-07` | Delete-conversation dialog doesn't name dependent objects | Agentic modes: Work / Cowork / Co… | MISSING | S | NEW |
| `agentic-modes-gap-10` | No 'Beta' badge on AGI Work chrome despite it being rougher than a finished feature | Agentic modes: Work / Cowork / Co… | MISSING | S | NEW |
| `CLR-03` | No per-message timestamp rendered anywhere in web's response action row (though the weaker Chrome extension has one) | Composer, chat lifecycle & messag… | MISSING | S | NEW |
| `CLR-04` | Shared code-block copy button is hover-gated despite sitting inside an always-visible header bar, contradicting the persistent-ch… | Composer, chat lifecycle & messag… | PRESENT_WORSE | S | NEW |
| `CPS-03` | Custom connector and Plugin removal bypass the confirmation dialog that catalog connectors correctly use | Connectors, plugins, skills, MCP … | PRESENT_WORSE | S | NEW |
| `CPS-06` | No 'Connector search' or equivalent dedicated auto-invoke toggle | Connectors, plugins, skills, MCP … | MISSING | S | NEW |
| `MEDIA-TITLE-03` | Image/video-generation conversations are permanently stuck with a generic 'Image generation'/'Video generation' title and never g… | Image, video & voice generation | PRESENT_WORSE | S | NEW |
| `legal-trust-01` | EU-AI-Act prohibited-practices list exists but covers only 2 of 5 points, and only on the mobile legal page | Legal, policy, trust & data-contr… | FIXED | S | NEW |
| `legal-trust-02` | Automated high-stakes decision-making clause omits 'medical' from its enumerated domain list | Legal, policy, trust & data-contr… | FIXED | S | NEW |
| `legal-trust-06` | Sandbox retention is disclosed vaguely ('reclaimed once unreachable') when the code enforces a concrete, undisclosed 24-hour numb… | Legal, policy, trust & data-contr… | FIXED | S | NEW |
| `G2` | deprecation_date is wired to silently filter models, never rendered as a visible countdown | Models, reasoning controls, quota… | FIXED | S | NEW |
| `G7` | Pricing comparison table has no training-data-use disclosure row | Models, reasoning controls, quota… | FIXED | S | NEW |
| `G12` | Enterprise pricing copy calls a shipped capability 'roadmap' | Models, reasoning controls, quota… | PRESENT_WORSE | S | NEW |
| `orch-gap-02` | The primary nav rail is defined twice by hand and the two copies have drifted — Tasks is unreachable from the app's default screen | Orchestrator live verification (b… | PRESENT_WORSE | S | NEW |
| `sched-gap-11` | No surface offers both a non-destructive 'Close' and a destructive 'Delete' for the same task object | Scheduled tasks & automation | FIXED | S | NEW |
| `shell-nav-ia-gap-01` | Destructive-action confirmation is inconsistently wired: styled red AlertDialog exists but the highest-frequency and highest-stak… | Shell, global nav, IA & design sy… | FIXED | S | NEW |
| `agentic-modes-gap-02` | AGI Work usage is not disclosed as a separate pool from chat | Agentic modes: Work / Cowork / Co… | MISSING | M | NEW |
| `agentic-modes-gap-04` | WorkSessionPanel has a static title and no options menu | Agentic modes: Work / Cowork / Co… | PARTIAL | M | NEW |
| `ART-CANVAS-02` | Gallery's 'New Artifact' never opens a blank, directly-editable artifact — always routes through a chat prompt | Artifacts, canvas & generative UI… | PARTIAL | M | CONFIRMS_PRIOR |
| `CLR-01` | Model picker never surfaces an inline retirement/deprecation warning for a model with a future deprecation_date | Composer, chat lifecycle & messag… | FIXED | M | NEW |
| `CLR-02` | Conversation sidebar title is a permanent raw 50-char prompt truncation; no second-stage LLM-cleaned title ever replaces it | Composer, chat lifecycle & messag… | MISSING | M | NEW |
| `CLR-05` | 'Edit' on a sent user message prefills the bottom composer instead of turning the message bubble into an inline textarea; a fully… | Composer, chat lifecycle & messag… | FIXED | M | NEW |
| `CPS-04` | No AI-assisted or upload/GitHub-import skill authoring on web, BYOK, or managed-cloud surfaces | Connectors, plugins, skills, MCP … | MISSING | M | NEW |
| `CPS-05` | No raw skill file upload or GitHub-import path anywhere in the product | Connectors, plugins, skills, MCP … | MISSING | M | NEW |
| `MEDIA-IMG-02` | Image-generation conversations get an editor that is a side panel on desktop, not the full-view takeover the claim describes, wit… | Image, video & voice generation | DIFFERENT_BY_DESIGN | M | NEW |
| `memory-12-gap` | No cross-provider memory import on Web or Desktop (Mobile has a working one) | Memory & personalization | MISSING | M | CONFIRMS_PRIOR |
| `memory-19-gap` | Memory bundles 'generate summary from history' and 'search/reference raw past chats' into one dependent toggle instead of two ind… | Memory & personalization | MISSING | M | CONFIRMS_PRIOR |
| `memory-14-gap` | No project-creation-time memory-scope selector | Memory & personalization | MISSING | M | CONFIRMS_PRIOR |
| `G1` | No per-model tier-access matrix on the marketing pricing page | Models, reasoning controls, quota… | FIXED | M | NEW |
| `G4` | Credit balance and top-up exist; the per-task debit ledger a user can inspect does not | Models, reasoning controls, quota… | FIXED | M | NEW |
| `PROJ-WS-03` | Project deletion dialog is silent about knowledge files, which become permanently orphaned (soft-delete never triggers the files'… | Projects, workspaces, notebooks &… | FIXED | M | NEW |
| `sched-gap-02` | No inline always-on composer on the web schedules list page | Scheduled tasks & automation | MISSING | M | NEW |
| `settings-03-gap` | 4-tier approval picker exists but isn't reused across agentic surfaces | Settings taxonomy & permission/ap… | BUILT_NOT_WIRED | M | SUPERSEDES_PRIOR |
| `settings-11-gap` | No storage-quota disclosure anywhere in settings | Settings taxonomy & permission/ap… | MISSING | M | NEW |
| `settings-12-gap` | Per-task credit-debit ledger exists in Postgres, never reaches a settings screen | Settings taxonomy & permission/ap… | FIXED | M | NEW |
| `settings-21-gap` | Tool-access-mode setting is fully dead - defined, never read or set | Settings taxonomy & permission/ap… | FIXED | M | CONFIRMS_PRIOR |
| `shell-nav-ia-gap-02` | Suggested-prompt chips were deliberately removed from the empty-state composer (2026-08-06 founder decision), contradicting a 4/4… | Shell, global nav, IA & design sy… | DIFFERENT_BY_DESIGN | M | NEW |
| `shell-nav-ia-gap-03` | Composer-embedded Chat/AGI-Work mode toggle exists but its placeholder text never changes and it's invisible to free/basic-tier u… | Shell, global nav, IA & design sy… | PARTIAL | M | CONFIRMS_PRIOR |
| `shell-nav-ia-gap-04` | No shared status indicator between the Tasks list and the ordinary chat-history sidebar row for the same running conversation | Shell, global nav, IA & design sy… | MISSING | M | NEW |
| `shell-nav-ia-gap-06` | Scheduled-task creation uses a conventional multi-field form, not the shared chat composer, and offers no suggested/template star… | Shell, global nav, IA & design sy… | MISSING | M | CONFIRMS_PRIOR |
| `G4` | No Reports gallery UI, though the backend already supports listing all of a user's reports | Web Search & Deep Research | FIXED | M | NEW |
| `G5` | No nested Table of Contents in the completed report reader | Web Search & Deep Research | MISSING | M | NEW |
| `G12` | A reopened/standalone report view has no follow-up composer for grounded Q&A | Web Search & Deep Research | FIXED | M | NEW |
| `agentic-modes-gap-08` | No approval-mode picker on Web; Desktop's is global/binary, not per-conversation or 3-tier | Agentic modes: Work / Cowork / Co… | PARTIAL | L | CONFIRMS_PRIOR |
| `CLR-07` | Inline citations render as a trailing numbered-badge pill row after the whole message, not claim-adjacent favicon+domain pills mi… | Composer, chat lifecycle & messag… | PARTIAL | L | CONFIRMS_PRIOR |
| `legal-trust-03` | No published commercial/enterprise legal-terms document distinct from consumer Terms | Legal, policy, trust & data-contr… | MISSING | L | NEW |
| `memory-02-gap` | Memory is a flat/provenance-grouped fact list, never synthesized narrative prose | Memory & personalization | PARTIAL | L | CONFIRMS_PRIOR |
| `memory-15-gap` | No 'Scheduled' card and no editable 'Memory' card in the project settings rail (only Instructions and Files are real) | Memory & personalization | PARTIAL | L | NEW |
| `G9` | No dedicated education-institution plan | Models, reasoning controls, quota… | MISSING | L | NEW |
| `PROJ-WS-02` | No project-scoped scheduled/recurring tasks -- schedules have no project association at all | Projects, workspaces, notebooks &… | MISSING | L | NEW |
| `sched-gap-15` | No follow-up composer for steering a task from the /tasks detail panel | Scheduled tasks & automation | PARTIAL | L | CONFIRMS_PRIOR |
| `settings-05-gap` | No network-egress warning or domain allowlist for agent-executed code | Settings taxonomy & permission/ap… | MISSING | L | CONFIRMS_PRIOR |
| `settings-07-gap` | PR auto-monitoring capability does not exist on any reachable UI surface | Settings taxonomy & permission/ap… | BUILT_NOT_WIRED | L | NEW |
| `settings-08-gap` | PR auto-creation is dead exported code, not a configurable toggle | Settings taxonomy & permission/ap… | BUILT_NOT_WIRED | L | NEW |
| `settings-25-gap` | MFA is TOTP-only; the majority-benchmark pattern is independently toggleable methods | Settings taxonomy & permission/ap… | PARTIAL | L | CONFIRMS_PRIOR |
| `G1` | No pre-flight plan-approval gate before a research run spends budget | Web Search & Deep Research | FIXED | L | NEW |
| `sched-gap-12` | Scheduled tasks have no richer, tool-using tier — only the lightweight kind exists, and not by design | Scheduled tasks & automation | MISSING | XL | CONFIRMS_PRIOR |

## P3 — single-product differentiator or polish (96)

| ID | Gap | Domain | State | Effort | vs prior |
|---|---|---|---|---|---|
| `agentic-modes-gap-05` | No self-disclosed task-complexity narration | Agentic modes: Work / Cowork / Co… | MISSING | S | NEW |
| `agentic-modes-gap-11` | Fork/'continue in new task' action is buried in a dropdown, not always visible | Agentic modes: Work / Cowork / Co… | FIXED | S | NEW |
| `agentic-modes-gap-14` | Custom MCP import supports URL-based add only, not raw-JSON-config import | Agentic modes: Work / Cowork / Co… | PARTIAL | S | NEW |
| `ART-CANVAS-04` | Composer has no discrete, named Canvas/artifact-creation tool entry | Artifacts, canvas & generative UI… | MISSING | S | NEW |
| `ART-CANVAS-08` | Image-generation entry points do not disclose the underlying model name in first-party UI copy | Artifacts, canvas & generative UI… | MISSING | S | NEW |
| `CLR-10` | No always-visible per-response fork/branch icon with reassurance copy; branching is menu-gated only | Composer, chat lifecycle & messag… | DIFFERENT_BY_DESIGN | S | NEW |
| `CPS-10` | No plugin-provenance data flows into the skill autocomplete, so no attribution or narration copy is possible | Connectors, plugins, skills, MCP … | MISSING | S | NEW |
| `CPS-11` | No narration copy at all distinguishing how a skill was loaded | Connectors, plugins, skills, MCP … | MISSING | S | NEW |
| `CPS-13` | No example prompt shown on connector marketplace cards | Connectors, plugins, skills, MCP … | MISSING | S | NEW |
| `MEDIA-VIDPLAYER-09` | Finished video player has no explicit Share control | Image, video & voice generation | PARTIAL | S | NEW |
| `MEDIA-PLACEHOLDER-10` | Generation placeholders are not pre-sized to the requested aspect ratio | Image, video & voice generation | FIXED | S | NEW |
| `MEDIA-DELETE-11` | Delete-conversation confirmation does not name the specific data store or confirm generated media is included | Image, video & voice generation | FIXED | S | NEW |
| `legal-trust-04` | No commercial-tier dispute-resolution stance exists to review or set deliberately | Legal, policy, trust & data-contr… | MISSING | S | NEW |
| `legal-trust-08` | No dedicated MCP marketplace listing policy — correctly not built, since no marketplace exists to govern | Legal, policy, trust & data-contr… | DIFFERENT_BY_DESIGN | S | NEW |
| `memory-16-gap` | No disclosed (or apparently existing) numeric source-count ceiling for project knowledge files | Memory & personalization | MISSING | S | NEW |
| `memory-05-gap` | No disclosure of whether memory personalizes outbound tool/search queries | Memory & personalization | MISSING | S | NEW |
| `memory-10-gap` | No memory-scope disclosure for a voice/Live surface (and no clear equivalent surface exists to disclose about) | Memory & personalization | MISSING | S | NEW |
| `G10` | No disclosed nonprofit discount | Models, reasoning controls, quota… | MISSING | S | NEW |
| `G11` | In-app paywall shows the upgrade tier's name but never its price | Models, reasoning controls, quota… | FIXED | S | NEW |
| `PROJ-WS-05` | Library media grid does not visually distinguish video thumbnails from image thumbnails | Projects, workspaces, notebooks &… | MISSING | S | NEW |
| `PROJ-WS-07` | No pre-built example/tutorial project shipped on new accounts | Projects, workspaces, notebooks &… | MISSING | S | NEW |
| `sched-gap-04` | No approval/autonomy-mode picker at schedule-creation time | Scheduled tasks & automation | MISSING | S | CONFIRMS_PRIOR |
| `sched-gap-06` | Suggested-template cards never show cadence text | Scheduled tasks & automation | MISSING | S | NEW |
| `sched-gap-13` | Status-filter control exists elsewhere in the codebase but not on the web schedules list | Scheduled tasks & automation | FIXED | S | NEW |
| `sched-gap-14` | Suggested-template icon differentiation exists on mobile, absent on web | Scheduled tasks & automation | BUILT_NOT_WIRED | S | NEW |
| `sched-gap-16` | No maturity/beta disclosure anywhere in the scheduling or task UI | Scheduled tasks & automation | MISSING | S | NEW |
| `sched-gap-17` | Create-schedule form defaults to a recurring cadence, not on-demand/manual | Scheduled tasks & automation | PRESENT_WORSE | S | NEW |
| `settings-15-gap` | No in-settings ad-personalization opt-out toggle | Settings taxonomy & permission/ap… | MISSING | S | NEW |
| `shell-nav-ia-gap-07` | Marketing-nav mobile breakpoint hides the primary sign-in/CTA behind the hamburger, unlike Claude's benchmark which keeps CTAs vi… | Shell, global nav, IA & design sy… | FIXED | S | NEW |
| `shell-nav-ia-gap-08` | Per-response fork/branch action is gated behind the hover-only 'More actions' menu, not a persistent always-visible icon | Shell, global nav, IA & design sy… | FIXED | S | NEW |
| `shell-nav-ia-gap-09` | No 'promote to recurring schedule' action in a conversation's options menu | Shell, global nav, IA & design sy… | MISSING | S | NEW |
| `G10` | Report citation list is missing favicons that the sibling Sources-tab component already renders | Web Search & Deep Research | PRESENT_WORSE | S | NEW |
| `agentic-modes-gap-06` | Conversation titles are truncated, not semantically generated, and no auto-rename path exists | Agentic modes: Work / Cowork / Co… | PRESENT_WORSE | M | NEW |
| `agentic-modes-gap-12` | No 'promote task to recurring schedule' menu action | Agentic modes: Work / Cowork / Co… | MISSING | M | NEW |
| `ART-CANVAS-01` | Artifact gallery has no search, no filter-by, and no Shared-with-you tab | Artifacts, canvas & generative UI… | PARTIAL | M | NEW |
| `CLR-09` | Composer '+' menu 'Connectors' entry is a settings-modal link-out, not an in-composer custom-MCP-registration flow | Composer, chat lifecycle & messag… | DIFFERENT_BY_DESIGN | M | NEW |
| `CPS-14` | No first-party productivity-suite bundle toggle (no equivalent of Gemini's Google Workspace master switch) | Connectors, plugins, skills, MCP … | MISSING | M | NEW |
| `CPS-16` | No category-tab browsing on the public plugin storefront, and the storefront's own catalog is not yet installable | Connectors, plugins, skills, MCP … | PARTIAL | M | NEW |
| `CPS-17` | No context-load control (lazy vs. always-loaded) for installed tools | Connectors, plugins, skills, MCP … | MISSING | M | NEW |
| `MEDIA-MENU-06` | No explicit template/freeform/iterative-refine on-ramp menu for image generation | Image, video & voice generation | MISSING | M | NEW |
| `MEDIA-NAV-07` | No dedicated top-level Images/Videos nav destinations | Image, video & voice generation | PARTIAL | M | NEW |
| `legal-trust-05` | No privacy-notice coverage for non-account-holder third parties whose data appears via a user's connectors or conversation | Legal, policy, trust & data-contr… | MISSING | M | NEW |
| `memory-03-gap` | No conversational chat-style editing of memory (only discrete add/edit/delete rows) | Memory & personalization | MISSING | M | NEW |
| `memory-18-gap` | No independent per-capability auto-invoke toggles (web search, canvas, voice, library, connector search) | Memory & personalization | MISSING | M | NEW |
| `memory-17-gap` | No visible memory-retrieval narration step in the reasoning/thinking trace | Memory & personalization | MISSING | M | NEW |
| `G3` | Usage buckets are model-class-scoped, not per-named-model like Claude's Fable bar | Models, reasoning controls, quota… | PARTIAL | M | NEW |
| `G8` | No published per-model API pricing, cache-tier rates, named service tiers, or batch discount | Models, reasoning controls, quota… | MISSING | M | NEW |
| `PROJ-WS-04` | Project capabilities require dialog navigation instead of a single persistent rail; Memory and Scheduled are not represented as f… | Projects, workspaces, notebooks &… | PARTIAL | M | NEW |
| `sched-gap-05` | No project/workspace scoping control at schedule-creation time | Scheduled tasks & automation | MISSING | M | NEW |
| `sched-gap-07` | Schedule list rows have no way to show a run is currently in progress | Scheduled tasks & automation | FIXED | M | NEW |
| `sched-gap-08` | No auto-generated semantic task title on either scheduling surface | Scheduled tasks & automation | MISSING | M | NEW |
| `sched-gap-09` | No tool-use icon differentiation in the live task log, only status-colored dots | Scheduled tasks & automation | FIXED | M | NEW |
| `settings-28-gap` | Scheduled task creation has no approval-mode picker, and scheduled runs have nothing yet to gate | Settings taxonomy & permission/ap… | MISSING | M | NEW |
| `settings-06-gap` | Extension site allowlist has no default-permission policy, only a static list | Settings taxonomy & permission/ap… | FIXED | M | CONFIRMS_PRIOR |
| `settings-16-gap` | Notification categories are grouped by channel, not offered as per-category channel selection | Settings taxonomy & permission/ap… | DIFFERENT_BY_DESIGN | M | CONFIRMS_PRIOR |
| `settings-20-gap` | No global default-approval policy for installed plugin/tool actions | Settings taxonomy & permission/ap… | MISSING | M | NEW |
| `settings-22-gap` | No unified named settings destination for cloud + local compute access | Settings taxonomy & permission/ap… | MISSING | M | NEW |
| `settings-29-gap` | No configurable safety fallback (switch model vs. pause) when a message is flagged | Settings taxonomy & permission/ap… | MISSING | M | NEW |
| `shell-nav-ia-gap-05` | Chat titling is single-stage (raw truncated prompt, permanent) rather than ChatGPT's two-stage placeholder-then-LLM-cleanup patte… | Shell, global nav, IA & design sy… | MISSING | M | NEW |
| `G7` | No opt-in 'notify me when done' control during an active run | Web Search & Deep Research | FIXED | M | NEW |
| `G11` | No source-scoping or file-attachment controls specific to the Deep Research composer | Web Search & Deep Research | FIXED | M | CONFIRMS_PRIOR |
| `agentic-modes-gap-15` | Usage ledger is bucket-based/aggregate, not an itemized per-task debit ledger | Agentic modes: Work / Cowork / Co… | PARTIAL | L | NEW |
| `ART-CANVAS-03` | No product-level 'frontend design' skill is wired into artifact generation, so named-skill narration cannot occur even though the… | Artifacts, canvas & generative UI… | BUILT_NOT_WIRED | L | NEW |
| `ART-CANVAS-05` | No one-click transform of a completed research report into derivative formats (web page/infographic/quiz/flashcards/audio) | Artifacts, canvas & generative UI… | MISSING | L | NEW |
| `ART-CANVAS-06` | Image editing is inline-in-chat only; no full-page editor and no pinned-annotation edit targeting | Artifacts, canvas & generative UI… | PARTIAL | L | NEW |
| `CLR-06` | No user-clickable 'Run' affordance on a plain Python (or any language) code block in chat — only Copy exists in the shared code-b… | Composer, chat lifecycle & messag… | MISSING | L | NEW |
| `CLR-08` | No end-of-answer horizontal source-card carousel with OpenGraph-style hero images; the closest equivalent is a toggle-triggered s… | Composer, chat lifecycle & messag… | PARTIAL | L | CONFIRMS_PRIOR |
| `CPS-09` | No self-serve non-MCP 'Custom API' connector authoring path | Connectors, plugins, skills, MCP … | MISSING | L | NEW |
| `CPS-12` | No dedicated top-level 'data source' category distinct from action-taking connectors | Connectors, plugins, skills, MCP … | MISSING | L | NEW |
| `CPS-15` | No star-rating display and no underlying custom-assistant/GPT-equivalent object | Connectors, plugins, skills, MCP … | MISSING | L | NEW |
| `CPS-18` | No user-configurable network-egress domain allowlist for sandboxed skill/code execution | Connectors, plugins, skills, MCP … | MISSING | L | NEW |
| `MEDIA-IMG-04` | No object/background-removal tool in the image editor | Image, video & voice generation | MISSING | L | CONFIRMS_PRIOR |
| `MEDIA-COMMENT-05` | No pinned-comment-to-edit annotation entry point in the image editor | Image, video & voice generation | MISSING | L | NEW |
| `MEDIA-TMPL-08` | No template-gallery landing page for video (or image) generation | Image, video & voice generation | MISSING | L | NEW |
| `memory-08-gap` | No unified personalization hub — memory, capabilities, reflect, and instructions are five separate flat settings nav entries | Memory & personalization | MISSING | L | NEW |
| `memory-09-gap` | No forward-looking 'Daily Brief' (Reflect is a retrospective usage recap, not a day-ahead schedule/tasks brief) | Memory & personalization | DIFFERENT_BY_DESIGN | L | NEW |
| `memory-11-gap` | No 'Connected Apps' personalization layer distinct from chat memory | Memory & personalization | MISSING | L | NEW |
| `G5` | No named higher-usage seat SKU within the Team plan | Models, reasoning controls, quota… | MISSING | L | NEW |
| `G6` | No self-serve Enterprise checkout path | Models, reasoning controls, quota… | MISSING | L | NEW |
| `sched-gap-03` | No dual conversational-vs-manual creation path anywhere | Scheduled tasks & automation | MISSING | L | NEW |
| `sched-gap-10` | Citations render as a block of pills below the message, not inline hyperlinks woven into prose | Scheduled tasks & automation | PRESENT_WORSE | L | NEW |
| `settings-04-gap` | No scoped, per-session authorization-token table; only dev API keys are scoped | Settings taxonomy & permission/ap… | PARTIAL | L | NEW |
| `settings-23-gap` | Dev console inside the consumer modal covers API keys but not user-facing webhooks | Settings taxonomy & permission/ap… | PARTIAL | L | NEW |
| `settings-24-gap` | No centralized Deployments/Domains surface; closest analog lacks custom-domain mapping | Settings taxonomy & permission/ap… | PARTIAL | L | NEW |
| `G6` | No dedicated live narration panel with titled prose sub-sections ('Show thinking' style) | Web Search & Deep Research | DIFFERENT_BY_DESIGN | L | NEW |
| `G9` | No direct export to a connected productivity suite (e.g. Google Docs) | Web Search & Deep Research | MISSING | L | NEW |
| `agentic-modes-gap-09` | No execution-environment picker (local vs. cloud vs. remote-paired) | Agentic modes: Work / Cowork / Co… | DIFFERENT_BY_DESIGN | XL | NEW |
| `agentic-modes-gap-13` | No agent deployment to external messaging platforms as a first-class tier | Agentic modes: Work / Cowork / Co… | MISSING | XL | NEW |
| `agentic-modes-gap-16` | No named settings destination for a cloud + local 'agent computer' | Agentic modes: Work / Cowork / Co… | DIFFERENT_BY_DESIGN | XL | NEW |
| `ART-CANVAS-07` | No dedicated top-level video-generation surface (nav item, specialized composer, template gallery); video generation is chat-prom… | Artifacts, canvas & generative UI… | PARTIAL | XL | NEW |
| `legal-trust-07` | Consumer Terms/Privacy are a single worldwide document with no EEA/UK/Switzerland variant | Legal, policy, trust & data-contr… | MISSING | XL | NEW |
| `memory-06-gap` | No recording/transcript memory corpus independent of chat memory | Memory & personalization | MISSING | XL | NEW |
| `PROJ-WS-06` | Connector-backed project sources (Google Drive, Slack) are not actually bindable to a project -- buttons route to a generic accou… | Projects, workspaces, notebooks &… | MISSING | XL | NEW |
| `settings-10-gap` | No trusted-contact crisis-notification feature - correctly declined by design | Settings taxonomy & permission/ap… | DIFFERENT_BY_DESIGN | XL | CONFIRMS_PRIOR |
| `G3` | No mid-flight steering of an active research run (no plan edit-in-place, no quick-answer redirect) | Web Search & Deep Research | MISSING | XL | NEW |
| `G8` | No one-click derivative-format ('Create') menu on a completed report | Web Search & Deep Research | MISSING | XL | NEW |

---

## Full detail, every gap

### `CPS-08` — Mobile Skills screen remains unreachable from any nav entry point

**P1** · FIXED · effort S · CONFIRMS_PRIOR (`EXTENSIBILITY-001 / SHELL-NAV-IA-003`) · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** ChatGPT iOS has a first-class Skills tab reachable from the sidebar drawer (01-chatgpt/plugins-apps-skills.md via cross-product-comparison)

**Ours.** apps/mobile/src/features/drawer/components/DrawerContent.tsx's PRIMARY_ITEMS array has no Skills row (removed by commit 1e858a7f1); apps/mobile/src/features/skills/SkillsScreen.tsx (655 lines) is a complete, tested implementation registered at apps/mobile/app/(app)/skills/index.tsx but reachable from nowhere in the app. Web and Desktop both correctly surface Skills as a top-level settings item (packages/ui/ui/src/settings-nav.ts:299).

**Recommendation.** Restore a Skills row in DrawerContent.tsx's PRIMARY_ITEMS (small, low-risk fix reusing existing tested code) — already the prior audit's exact recommendation, re-confirmed here as this claim's mobile-surface instance.

### `orch-gap-01` — The artifacts gallery is complete and working but reachable from nowhere in the app, and renders in marketing-site chrome

**P1** · FIXED · effort S · NEW · _Orchestrator live verification (browser-observed)_

**Benchmark.** Claude ships a dedicated /artifacts gallery as a first-class primary-rail nav item with All / Yours / Shared-with-you tabs, filter, search and a 'New artifact' button — the corpus calls this out as the core of Claude's 'an artifact is immediately a first-class, independently addressable object' philosophy, versus ChatGPT's generic Library where a generated app is one entry among files (04-cross-product-comparison/09-generative-artifacts-canvas-and-media.md; 11-artifacts-and-files/claude-artifacts-findings.md).

**Ours.** VERIFIED LIVE at http://localhost:3000/gallery while signed in: the page renders an 'Artifacts' heading, a 'New Artifact' button, 'Your artifacts' / 'Inspiration' tabs, and this account's REAL artifacts with correct type badges and relative timestamps ('A single red origami crane…' / Png / Created 3h ago; 'Team Pulse Dashboard' / HTML / Created 3h ago). It is a genuine Claude-parity gallery, not a stub. But `grep -rn "'/gallery'" apps/web` returns only three non-generated hits: apps/web/app/sitemap.ts:80 (SEO), the route's own layout/page canonical, and apps/web/features/chat/v3/WebShellV3.tsx:33,36 — and WebShellV3 is DEAD: its only mount point is apps/web/features/chat/pages/UnifiedChatPage.tsx:63, which has zero importers, because both apps/web/app/page.tsx:4 and apps/web/app/chat/page.tsx:1 mount WebChatRoot instead. Confirmed by enumerating the live nav rail on /chat: Chat, Code, Projects, Library, Schedules, Customize — no Artifacts entry. Separately, /gallery renders inside the MARKETING shell (Products ▾ / Pricing / Business / Docs / Sign out header plus the full marketing footer) rather than the app shell, so even a user who reached it by URL would leave the product chrome. NOTE: the artifacts domain agent filed this same route as a STRENGTH ('Dedicated artifact-typed gallery with its own left-nav entry (WebSidebar.tsx:112, WebShellV3.tsx:33 -> /gallery)') — that citation is to the dead shell and the strength claim is withdrawn here.

**Recommendation.** Add an 'Artifacts' entry to BOTH live nav rail definitions (apps/web/features/chat/pages/WebChatPage.tsx:3762-3813 and apps/web/shared/components/layout/WebAppShell.tsx:242-297) pointing at /gallery, and move /gallery under the app shell so it keeps the product chrome. This is the highest payoff-to-effort item in the whole pass: a finished, Claude-parity feature holding real user data becomes reachable for the cost of one nav item. Verify by loading /chat, clicking Artifacts, and confirming the user's own artifacts list with the app sidebar still present.

### `settings-27-gap` — Voice settings page is real and honest but has no nav entry - still unreachable

**P1** · FIXED · effort S · CONFIRMS_PRIOR (`SETTINGS-001 (domain-settings.md, filed P1 as a broken-workflow nav bug) - independently re-verified fresh this pass, still unfixed.`) · _Settings taxonomy & permission/approval architecture_

**Benchmark.** ChatGPT and Claude both give voice mode its own settings section, reachable from the main nav; majority convergence.

**Ours.** apps/web/app/settings/voice/page.tsx:55-60 is real, honest content ('Managed voice is not available... This page does not show disabled settings that the runtime cannot consume'). SETTINGS_NAV_GROUPS_WEB (packages/ui/ui/src/settings-nav.ts:279-306) lists 16 keys; 'voice' is not among them. A route mapping exists (WebShellV3.tsx:38, 'voice-settings': '/settings/voice') but nothing in the settings modal's own nav links to it.

**Recommendation.** Add 'voice' back into SETTINGS_NAV_GROUPS_WEB - a one-line nav-registration fix for an already-built, already-honest page.

### `CPS-01` — Skill auto-invoke matcher exists but has zero call sites in any chat UI

**P1** · FIXED · effort M · CONFIRMS_PRIOR (`EXTENSIBILITY-004`) · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** ChatGPT/Claude/Gemini all auto-select a relevant skill/connector without explicit per-message invocation (01-chatgpt/plugins-apps-skills.md; 02-claude/settings.md; 03-gemini/connected-apps-and-settings.md)

**Ours.** apps/desktop/src-tauri/src/sys/commands/skills.rs:342-414 implements a real tokenizing skill_match_for_message; exposed to the frontend as matchForMessage in apps/desktop/src/stores/skillMarketplaceStore.ts:247,348-354; grep of apps/desktop/src for 'matchForMessage' finds only the interface + implementation, zero call sites in features/chat or features/v3. Web's request-processor.ts:316-329,461-473 requires an explicit client-supplied skill_name with no server-side relevance scoring at all.

**Recommendation.** Wire the existing matchForMessage call into the desktop chat composer (surface top matches as dismissible chips before send) as the smallest end-to-end slice, per EXTENSIBILITY-004's own recommendation; connectors already satisfy this claim's auto-invoke requirement (route.ts:419-466), so this closes the one remaining half.

### `MEDIA-VIDEO-01` — Staged attachments are silently discarded when sending in image- or video-generation mode

**P1** · FIXED · effort M · CONFIRMS_PRIOR (`VOICE-MEDIA-010`) · _Image, video & voice generation_

**Benchmark.** Gemini's video composer shows an image-attach ('+') icon next to the Videos pill implying image-to-video support (03-gemini/media-generation.md, media-13)

**Ours.** apps/web/features/chat/components/Composer/ChatComposerNew.tsx: the 'Add photos & files' menu item (2413-2424) is available unconditionally in image/video mode; setImageMode/setVideoMode (524-531) never clear staged attachments and AttachmentPreview keeps rendering them (2077-2082); but sendImageMode's branch (1601-1627) and the videoMode branch (1632-1669) build their request from prompt + generation options only, never referencing `attachments`; clearComposerState() (943-1030, clearAttachments() at 948) then wipes the attachment on send with no error/toast. hasAttachmentConflict (691) only checks whether the selected TEXT model can read images, so it never fires for imageMode/videoMode. Missing link in the chain: client options type -> request contract never carries `attachments`/`source_image` for these two send paths, and no UI signal tells the user their attachment was dropped.

**Recommendation.** Short term: either disable/hide the attach affordance while imageMode/videoMode is active, or show an explicit warning (reusing the hasAttachmentConflict pattern) that attachments are not used in this mode. Longer term, to actually deliver media-13/VOICE-MEDIA-010: add an optional source_image field to ManagedMediaVideoGenerationRequestSchema (managed-media.ts:167-186, mirroring the image contract's existing source_image shape), thread it through the videoMode send path, and pass it to providers that accept a reference image.

### `orch-gap-03` — Deep Research on the DEFAULT model silently takes the single-turn path — no plan card, no process narration, no signal to the user

**P1** · FIXED · effort M · SUPERSEDES_PRIOR (`search-deep-research P1 (Deep Research silently degrades…)`) · _Orchestrator live verification (browser-observed)_

**Benchmark.** ChatGPT and Gemini both gate Deep Research on a reviewable plan card before spending research budget, and all three products narrate live progress once a research mode is invoked — Gemini narrates through titled sub-sections with a consulted-site grid and a numeric 'Researching 10 websites…' count; ChatGPT shows a task-level progress bar and streaming status line with a stop control (04-cross-product-comparison/04-deep-research-comparison.md).

**Ours.** VERIFIED LIVE: with the composer's default model (Claude Sonnet 5, an Anthropic model) and 'Deep Research' toggled on from the '+' menu, a real research query returned a substantive answer with 10 real numbered citations to genuine sources (Solid Power, BMW Group press, GreenCars, Finimize, TechCrunch) — so the path is NOT dead and does real cited work. But a DOM probe of the completed response found no plan card, no research-activity narration, and no 'Thought for Ns' disclosure. Cause: apps/web/app/api/llm/v1/chat/completions/route.ts:313-317 gates runResearchLoop behind `processed.provider.toLowerCase() !== 'anthropic'`, documented in its own comment as deliberate (the loop consumes OpenAI-compatible SSE; Anthropic keeps 'the existing single-turn research behavior (research prompt + forced web_search) unchanged'). Meanwhile ChatComposerNew.tsx:732-733 computes modelSupportsResearch with no provider exclusion, so the toggle renders, enables and shows its active badge identically for Anthropic models. The defect is not that the fallback exists — it is that one control yields two materially different experiences with zero disclosure, on the model the product ships as default. CORRECTION TO A DOMAIN AGENT: the search-deep-research agent's notWorthCopying entry asserts 'our loop always performs a real planning turn and real search rounds by default … so a user who enables Deep Research always gets genuine multi-round work'. That is false for Anthropic providers, i.e. for the default model, and contradicts the P1 gap the same agent filed.

**Recommendation.** Pick one and make it honest. Either (a) normalize the Anthropic stream so runResearchLoop can consume it and every provider gets the same multi-round experience, or (b) have the composer disclose the lighter path for providers the loop does not cover — e.g. label the toggle 'Research' rather than 'Deep Research' when the selected model will take the single-turn path, the way the model picker already discloses cache/pricing consequences on model switch. Do not leave the same badge meaning two things. Re-verify by running the identical query on an Anthropic and a non-Anthropic model and diffing what the transcript shows.

### `sched-gap-01` — No real-task/suggested-template divider on the web schedules list

**P1** · MISSING · effort M · NEW · _Scheduled tasks & automation_

**Benchmark.** ChatGPT, Claude, Gemini (ALL_PRODUCTS) all show real tasks and suggested templates in one list separated by a visible divider/header (01-chatgpt/tasks.md; 02-claude/scheduled-tasks.md; 04-cross-product-comparison/03-scheduled-tasks-and-automation.md)

**Ours.** apps/web/features/schedules/components/SchedulesPage.tsx:432-443 — empty state is only 'No schedules yet' + a single Create button; grep -rin "template|suggest" apps/web/features/schedules/ returns zero hits. Mobile (apps/mobile/app/(app)/schedules/index.tsx:310-367) and Desktop (apps/desktop/src/features/scheduler/ScheduledTasksPanel.tsx:198-243) each have a template list, but only in the empty state (never alongside real tasks below a divider), and neither has been ported to web.

**Recommendation.** Port the mobile SCHEDULE_TEMPLATES set to /chat/schedules, and change the trigger from empty-state-only to always-rendered-below-a-divider so it matches the benchmark's mixed-list pattern.

### `settings-26-gap` — Account deletion is not blocked by an active paid subscription, in either of two duplicate delete flows

**P1** · MISSING · effort M · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude's Account tab blocks Delete Account until the active Max subscription is first canceled; single-product benchmark, but a real correctness risk in our own product.

**Ours.** AccountSection.tsx:193 ('canonical, working flow') and a separately-built second copy in PrivacySection.tsx:753-883 both call DELETE /api/user/delete-account with no subscription check in either. apps/web/app/api/user/delete-account/route.ts performs CSRF check, rate limit, and auth only before scheduling erasure - grepped the whole route for subscription/billing/cancel: no gate exists, only doc-comments about a not-yet-built self-serve cancel route.

**Recommendation.** Add a subscription-active check to the DELETE /api/user/delete-account handler (block, or force-cancel-first, mirroring the repo's recent billing-safety commit pattern), and consolidate the two independent delete-account UI implementations into one to remove the duplicate-control risk CLAUDE.md flags on sight.

### `G2` — Deep Research silently degrades to an unbranded single-turn fallback for Anthropic models and free-trial users

**P1** · FIXED · effort M · CONFIRMS_PRIOR (`SEARCH-RESEARCH-001 (audit/parity-2026-08-15/gaps/domain-search-research.json)`) · _Web Search & Deep Research_

**Benchmark.** ALL_PRODUCTS show visible process narration once a research mode is invoked (dr-27); the entry point's active-state indicator should reflect what will actually happen (dr-01)

**Ours.** route.ts:314-318 still gates runResearchLoop behind processed.researchMode && !processed.freeTrial && processed.provider.toLowerCase() !== 'anthropic'; ChatComposerNew.tsx:732-733 modelSupportsResearch has no provider exclusion so the toggle renders/enables identically for Claude; useChatStream.ts:1388-1461 shows ResearchActivity is driven only by x_research_status/x_research_plan, which applyResearchMode() (request-processor.ts:1062-1071) never emits, and persistReport is only called inside runResearchLoop so ResearchPanel's Report tab permanently reads 'No saved report yet' for this cohort.

**Recommendation.** Re-verify whether buildToolLoopStream's Anthropic normalization (documented in tool-loop-anthropic.ts as already generalized) is safe for the research loop's multi-turn shape and, if so, drop the anthropic exclusion so Anthropic conversations get the same runResearchLoop path as every other provider; if a real blocker remains, gate the composer toggle on provider too and give the single-turn fallback its own honestly-labeled control instead of silently reusing the Deep Research toggle.

### `agentic-modes-gap-01` — Global Chat↔Agentic-mode toggle is composer-only and doesn't change placeholder/empty-state

**P1** · PARTIAL · effort L · CONFIRMS_PRIOR (`P2-001 / AGENTIC-WORK-006`) · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** ChatGPT (Work), Claude (Cowork), and Gemini (Spark) ship a chrome-level Chat↔Agentic toggle that changes the empty-state headline, composer placeholder, and toolbar controls (not just a label), and is available everywhere in the product, not tied to one page.

**Ours.** apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2895-2924 (segmented 'Chat | AGI Work' toggle, inline), :2377-2411 (relocated into '+' overflow menu below sm breakpoint); workMode wiring at ChatComposerNew.tsx:1676,1872 and WebChatPage.tsx:1437,1514; placeholder ternary at ChatComposerNew.tsx:2258-2266 never branches on workMode (stays 'Ask anything. Type / for commands'); grepping WebChatPage.tsx for workMode finds only 4 usages, none touching the empty-chat headline; toolbar 'Project or folder' picker does change correctly, appearing only in AGI Work mode (ChatComposerNew.tsx:3464); toggle visibility gated on projectPicker && !imageMode && canUseAgiWork (ChatComposerNew.tsx:2902) and canUseAgiWork (ChatComposerNew.tsx:455-456), a Pro-tier billing entitlement.

**Recommendation.** Wire workMode into the composer placeholder ternary (ChatComposerNew.tsx:2258-2266) and the empty-chat headline in WebChatPage.tsx, and promote the toggle from a composer-only, Pro-gated control to chrome-level (visible across settings/tasks/library, not just inside chat) to match the ALL_PRODUCTS convergence benchmark. [severity inferred by recovery pass]

### `CPS-02` — Connectors and Plugins have no in-composer per-message attachment; only Skills do

**P1** · PARTIAL · effort L · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** ChatGPT/Claude/Gemini all let a user attach a specific connector, tool, or skill directly from the composer in-context (01-chatgpt/plugins-apps-skills.md; 04-cross-product-comparison/05-connectors-plugins-skills.md)

**Ours.** apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2714-2800: the '+' menu's Skills row opens the settings modal via openSettings('skills') (documented as a founder directive that per-message selection stays in the @mention dropdown instead, lines 2714-2718), while the Connectors row (2740-2745) and Plugins row (2771-2782) ALSO only call openSettings(...) with an explicit code comment stating 'per-conversation connector enablement has no runtime backing, so the honest surface is the settings pane.' Skills genuinely gets in-composer attachment via @mention/slash (lines 1264-1324); connectors/plugins do not have any in-composer equivalent.

**Recommendation.** If per-message connector scoping is intentionally out of scope given the always-on architecture, that's defensible — but it should be stated as a product decision, not left implicit. If genuine per-message connector/plugin selection is wanted, it requires backend support for scoping a connector to a single turn, which does not exist today (per the code's own comment) — this is real design work, not a UI fix.

### `CPS-07` — Plugin registry ships zero installable entries — the storefront and decomposition UI have nothing live behind them

**P1** · PARTIAL · effort L · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** ChatGPT and Claude both confirmed to have genuinely working, non-decorative connector/plugin backends (01-chatgpt/plugins-apps-skills.md; 02-claude/settings.md)

**Ours.** apps/web/db/neon/0096_plugin_registry.sql's plugin_registry_entries_published_needs_artifact constraint requires a real manifest_url for status='published'; apps/web/app/plugins/page.tsx's own doc comment states 'every row is preview' today, meaning no plugin is currently installable in this deployment, first- or third-party. Connectors and Skills ARE confirmed live-functional (ConnectorsPage.tsx MCP inspect-and-add flow; route.ts:419-466 tool loop; request-processor.ts skill forcing) — only Plugins specifically are non-functional today.

**Recommendation.** This is a launch-readiness gap, not a UI bug: either publish at least one first-party plugin artifact with a real manifest_url so the well-built decomposition UI (connectors-17) has something live behind it, or add explicit 'coming soon, not yet installable' messaging on the plugin detail page itself (today only the catalog list states this) so a user opening a plugin's detail page isn't misled by a fully-populated Skills/Connectors decomposition that cannot actually be installed.

### `memory-13-gap` — Project/workspace memory isolation is absent (Web) or actively broken (Desktop writes to the global store)

**P1** · BUILT_NOT_WIRED · effort L · CONFIRMS_PRIOR (`MEMORY-001 (desktop broken workflow), MEMORY-004 (web architecture gap) — both re-verified as still current; git log since shows only unrelated billing commits.`) · _Memory & personalization_

**Benchmark.** ChatGPT and Claude were both live-tested with a cross-chat isolation test (unique phrase inside a project, checked for leakage outside it) and both passed with no leakage (04-cross-product-comparison/02-memory-and-personalization.md).

**Ours.** Web: apps/web/features/projects/components/ProjectSettingsDialog.tsx:229-251 explicitly documents no project column exists on user_memories (migration 0010_memory.sql) and managed-memory-context-service.ts selects purely by user_id — memory is honestly disclosed as fully shared, not isolated. Desktop: apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:1268-1291 mounts MemoryManager with copy implying project-scoped memory, but apps/desktop/src/features/memory/MemoryManager.tsx:32,117 reads useMemoryStore(), the flat GLOBAL device store with no projectFolder/projectId filter — the missing link is MemoryManager never calling the real project-scoped pipeline (memory_handler.rs / ProjectMemoryManager / projectMemoryStore.ts's getProjectMemories) that the Rust chat runtime actually uses at send time.

**Recommendation.** Web: add a nullable project_id to user_memories and thread it through managed-memory-context-service.ts so a project can opt into isolated memory. Desktop: pass the active project's folder into MemoryManager and swap its data source from useMemoryStore to projectMemoryStore's getProjectMemories(projectFolder), matching what memory_handler.rs already injects at send time.

### `PROJ-WS-01` — No workspace-level memory scoping/isolation control (project memory is unconditionally account-wide)

**P1** · MISSING · effort L · SUPERSEDES_PRIOR (`MEMORY-004 (audit/parity-2026-08-15/gaps/domain-memory.json), filed P2 as 'architecture-gap' citing only ChatGPT+Claude. This pass's live cross-product research confirms Gemini also has this as tableStakes=true (ALL_PRODUCTS convergence), which changes the correct severity from P2 to P1 -- this is table-stakes across the full observed competitive set, not a two-competitor differentiator.`) · _Projects, workspaces, notebooks & file knowledge_

**Benchmark.** ChatGPT: 'Default memory' vs 'Project-only memory' selector at project creation. Claude: 'Search and reference chats' toggle + 'Only you' memory card per project. Gemini: 'Use notebook memory' toggle in per-notebook settings, layered on account-wide memory. All three (ALL_PRODUCTS, tableStakes=true). Source: 01-chatgpt/projects.md, 02-claude/projects.md, 03-gemini/notebooks.md.

**Ours.** apps/web/features/projects/components/ProjectSettingsDialog.tsx:229-251 renders a static, non-interactive sentence ('This project can access memories from outside chats, and vice versa.') with a code comment documenting that a decorative scope <select> (one option, no onChange, no persistence) was deliberately removed rather than fixed. apps/web/db/neon/0010_memory.sql has no project_id/project_folder column on user_memories. No memory-mode field exists in either project-creation flow: grepped apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx and packages/ui/unified-chat/src/components/ProjectGallery.tsx for 'memory'/'Memory' -- zero matches in both.

**Recommendation.** Add a nullable project_id column to user_memories, a per-project memoryScope preference ('default' | 'project-only'), thread it through managed-memory-context-service.ts's loadManagedMemoryContext/persistManagedAutoMemoryFacts, and re-add a real (non-decorative) selector to both project-creation flows and ProjectSettingsDialog's Memory section -- replacing the current honest-but-empty disclaimer sentence with an honest-and-functional control.

### `agentic-modes-gap-03` — Task run status doesn't mirror into the main conversation sidebar

**P2** · PARTIAL · effort S · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Claude Cowork and Gemini Spark show the same live run-status dot in both the dedicated task list and the main conversation/chat sidebar.

**Ours.** packages/ui/unified-chat/src/components/tasks/TasksPage.tsx has a genuine live status system (tone-colored state badge via taskStateLabel/TASK_TONE_BADGE_CLASS from task-display.ts, Loader2 animate-spin while an action is in flight, self-rescheduling poll at TasksPage.tsx:80-81,342-348); ConversationListItem.tsx:54-84 has no run-status awareness at all — its only state props are isActive, isStarred, isPinned, isArchived.

**Recommendation.** Thread run-state (from the same source TasksPage.tsx polls) into ConversationListItem so a conversation with a running AGI Work task shows a status indicator in the sidebar, matching the /tasks page's existing badge/spinner convention. [severity inferred by recovery pass]

### `agentic-modes-gap-07` — Delete-conversation dialog doesn't name dependent objects

**P2** · MISSING · effort S · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Gemini's delete-conversation warning names dependent objects ('along with any schedules created'); Manus's does too ('will also delete the website').

**Ours.** ConversationListItem.tsx:320-323 — generic copy: AlertDialogTitle 'Delete conversation?' / AlertDialogDescription 'This will permanently delete "{title}" and all its messages.', no mention of schedules, published artifacts, or any other dependent object; the actual delete handler (apps/web/app/api/chat/conversations/[id]/route.ts:233-242) is a soft delete (set deleted_at = now()), so the practical risk is lower than the hard-delete framing the benchmark products use.

**Recommendation.** Update the delete-confirmation copy in ConversationListItem.tsx:320-323 to name dependent objects (e.g. active schedules) when present, since the underlying delete is already a soft delete — this is a copy fix, not a data-safety fix. Separately verify (scheduling domain, possibly AGENTIC-WORK-004) whether a schedule tied to a soft-deleted conversation keeps firing or silently orphans — flagged unverified in the source doc. [severity inferred by recovery pass]

### `agentic-modes-gap-10` — No 'Beta' badge on AGI Work chrome despite it being rougher than a finished feature

**P2** · MISSING · effort S · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Claude and Gemini show a persistent 'Beta' badge on their agentic-mode chrome (ChatGPT shows none).

**Ours.** No 'Beta'/'BETA' string appears anywhere in WorkSessionPanel.tsx, ChatComposerNew.tsx's work-mode toggle, or TasksPage.tsx; per the prior audit's own findings in this exact domain (AGENTIC-WORK-001 dead background agents, AGENTIC-WORK-003 opt-in durability, AGENTIC-WORK-005 no mid-run steering, AGENTIC-WORK-007 zero-tool scheduled runs), AGI Work is demonstrably rougher than a finished feature today.

**Recommendation.** Add a 'Beta' badge to the AGI Work toggle and WorkSessionPanel header — given the rough edges already documented under AGENTIC-WORK-001/003/005/007, an honest early-access signal (matching Claude/Gemini) is cheap and closes an expectation-setting gap. [severity inferred by recovery pass]

### `CLR-03` — No per-message timestamp rendered anywhere in web's response action row (though the weaker Chrome extension has one)

**P2** · MISSING · effort S · NEW · _Composer, chat lifecycle & message rendering_

**Benchmark.** ChatGPT and Claude both display a relative timestamp in or near each response's action row (01-chatgpt/composer.md, 02-claude/composer-and-chat-lifecycle.md)

**Ours.** message.timestamp exists as data (apps/web/features/chat/components/messages/MessageBubble.tsx:2215, used only for memo comparisons) but is never rendered as visible text — grepped the file for toLocaleTimeString/toLocaleDateString/format(message.timestamp/dayjs/date-fns: zero hits. The 'Slim badge row' comment at :1053 explicitly says 'no name/timestamp'. Contrast: apps/extension/src/features/side-panel/bubbles.ts:241-243,704-705 DOES render a timestamp span (formatTime(msg.timestamp)) in its otherwise much weaker action row.

**Recommendation.** Add a small relative-timestamp span near the action row (reuse the extension's formatTime pattern or a date-fns formatDistanceToNow), visible on hover or always-on to match Claude's pattern.

### `CLR-04` — Shared code-block copy button is hover-gated despite sitting inside an always-visible header bar, contradicting the persistent-chrome pattern it otherwise implements

**P2** · PRESENT_WORSE · effort S · NEW · _Composer, chat lifecycle & message rendering_

**Benchmark.** ChatGPT and Gemini show code-block header chrome (language label + copy icon) at all times, not hover-gated (01-chatgpt/chat-lifecycle.md, 03-gemini/composer-and-markdown-rendering.md)

**Ours.** packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:52 — the Copy Button's className includes 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'. The surrounding .code-block-header-bar (apps/web/app/globals.css:1004-1007) IS unconditionally visible with the language label always shown, but the one interactive control inside it is invisible until hover/focus — same weakness as Claude's pattern despite having Claude-beating persistent chrome around it.

**Recommendation.** Remove the opacity-0 default on the Copy button in CodeBlock (MarkdownContent.tsx:52) so it renders at full opacity by default, matching the always-visible language label beside it. One-line CSS-class fix, shared by web+desktop.

### `CPS-03` — Custom connector and Plugin removal bypass the confirmation dialog that catalog connectors correctly use

**P2** · PRESENT_WORSE · effort S · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Claude requires a consequence-explaining confirmation dialog before removing an installed plugin/connector (02-claude/settings.md)

**Ours.** Catalog connectors: apps/web/features/connectors/pages/ConnectorsPage.tsx:767-795 renders a real confirm Dialog with per-connector consequence copy from describeDisconnect() (line 491) before disconnecting. Custom (self-added MCP) connectors: the 'Remove' X button at ConnectorsPage.tsx:1190-1203 calls handleRemoveCustomConnector(c.id) directly onClick, no confirmation. Plugins: packages/ui/ui/src/settings-modal/SettingsModal.tsx:1921-1932's 'Remove' button calls adapter.removePlugin?.(plugin.id) directly onClick, also no confirmation.

**Recommendation.** Wrap the custom-connector 'Remove' button and the Plugins panel's 'Remove' button in the same confirm-Dialog pattern ConnectorsPage.tsx already built and shipped for catalog connectors one component away — this is a small, low-risk fix reusing existing UI.

### `CPS-06` — No 'Connector search' or equivalent dedicated auto-invoke toggle

**P2** · MISSING · effort S · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** ChatGPT (Settings -> Personalization -> Advanced) and Claude (Capabilities tab) both expose a settings toggle literally controlling proactive connector search (01-chatgpt/plugins-apps-skills.md; 02-claude/settings.md)

**Ours.** Grepped apps/web and apps/desktop for 'Connector search', connectorSearch, 'Tool access mode', 'Load tools when needed' — no matches. Connectors are always auto-searched per connectors-04's PRESENT half, with no way to disable that behavior short of disconnecting the connector or blocking a specific tool.

**Recommendation.** Add a single settings toggle (e.g. in Capabilities) that, when off, skips loadUserConnectorToolCatalog in route.ts so a user can opt out of automatic connector tool loading without disconnecting anything.

### `MEDIA-TITLE-03` — Image/video-generation conversations are permanently stuck with a generic 'Image generation'/'Video generation' title and never get auto-titled from the prompt

**P2** · PRESENT_WORSE · effort S · NEW · _Image, video & voice generation_

**Benchmark.** Gemini auto-titles a video-generation conversation from the submitted prompt content (03-gemini/media-generation.md, media-21)

**Ours.** apps/web/features/chat/pages/WebChatPage.tsx:1798-1802 creates a fresh conversation with the literal title 'Image generation'; :2316-2320 creates one with 'Video generation'. The app's own auto-title effect (:3136-3145) only fires when `convo.title === 'New Chat'`, so these two hardcoded titles permanently bypass it — unlike regular text-chat conversations, which do get auto-titled from the first user message (:3132-3145).

**Recommendation.** Create image/video-generation conversations with the title 'New Chat' (matching the regular chat path) so the existing auto-title effect fires normally, or extend that effect's guard to also match the literal strings 'Image generation'/'Video generation'.

### `legal-trust-01` — EU-AI-Act prohibited-practices list exists but covers only 2 of 5 points, and only on the mobile legal page

**P2** · FIXED · effort S · NEW · _Legal, policy, trust & data-control surfaces_

**Benchmark.** ChatGPT, Claude, and Manus each independently converge on a near-identical 5-point prohibited-practices list (biometric categorization for protected attributes, real-time public biometric ID, social scoring, workplace/education emotion inference, predictive policing from profiling alone) in their primary usage policy. Source: 04-cross-product-comparison/10-legal-terms-and-policies.md.

**Ours.** apps/web/app/acceptable-use/page.tsx (full file, prohibited-uses section lines 226-237) has none of the 5 points. apps/web/app/mobile/legal/page.tsx:261-263 has a partial version scoped to the mobile surface only, naming just 2 of 5 (subliminal manipulation, biometric categorisation, social scoring) — no real-time public biometric ID, no workplace/education emotion inference, no predictive policing.

**Recommendation.** Port and complete the mobile page's EU AI Act paragraph into the canonical /acceptable-use page's prohibited-uses section (add the 3 missing points). Low effort — the research and half the copy already exist in the repo.

### `legal-trust-02` — Automated high-stakes decision-making clause omits 'medical' from its enumerated domain list

**P2** · FIXED · effort S · NEW · _Legal, policy, trust & data-control surfaces_

**Benchmark.** ChatGPT enumerates 13 regulated domains including medical; Claude enumerates 6 including medical. Source: 01-chatgpt/legal-and-policies.md, 02-claude/legal-and-policies.md.

**Ours.** apps/web/app/acceptable-use/page.tsx:234-236 — 'Do not use output to make automated decisions about a person — employment, credit, housing, insurance, education, or legal status — without meaningful human review.' No 'medical' in the list; the only 'medical' hit in the file set is an unrelated professional-advice disclaimer at apps/web/app/terms/page.tsx:238.

**Recommendation.** Add 'medical' to the enumerated domain list — one-word fix to an otherwise solid, comparably-sized clause.

### `legal-trust-06` — Sandbox retention is disclosed vaguely ('reclaimed once unreachable') when the code enforces a concrete, undisclosed 24-hour number

**P2** · FIXED · effort S · NEW · _Legal, policy, trust & data-control surfaces_

**Benchmark.** Manus discloses an explicit numeric, tier-differentiated sandbox retention window (7 days free / 14 days paid). Source: 07-manus/04-manus-recheck-and-legal.md.

**Ours.** apps/web/app/privacy/page.tsx:628-634 says only 'Reclaimed once unreachable.' The actual enforced number is apps/web/lib/e2b/reclaim.ts:31-36, SANDBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000 (24 hours, uniform across all tiers — code comment: 'Longest a sandbox may live before it is reclaimed regardless of mapping state'). Separately, packages/contracts/types/src/billing-catalog.ts:494-533 defines a per-tier sandboxTtlMs (10/20/30/60 min) but that is a live-execution idle timeout, a different concept from Manus's multi-day persisted-state retention, so tier-differentiation does not apply to the retention dimension as currently built.

**Recommendation.** Replace 'Reclaimed once unreachable' with the actual number ('within 24 hours of the last mapping to your conversation'). This is a copy fix, not a capability build — the number already exists in code. Tier-differentiated retention (to fully match Manus) would be separate, larger product work.

### `G2` — deprecation_date is wired to silently filter models, never rendered as a visible countdown

**P2** · FIXED · effort S · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** ChatGPT's model picker shows 'o3 — Leaving on August 26' inline inside the dropdown.

**Ours.** packages/contracts/types/src/model-catalog.ts:553-554 defines deprecation_date, populated on real records (e.g. models.json:1640). The only consumer is apps/web/shared/stores/model-store.ts:94-109 (isCurrentModel), which uses it purely as an on/off gate ('if (retiresAt <= Date.now()) return false') — the model just vanishes at the deadline. Grepped deprecation_date/deprecationDate across apps/web: no rendering consumer found; ComposerFooter.tsx has no 'deprecation' string anywhere in the file.

**Recommendation.** In ComposerFooter.tsx's row renderer, when a model has a future deprecation_date, render an inline 'Leaving on <date>' label the same way the coming_soon/env-lock reasons already render via modelLock()'s reason field. Adjacent to prior-audit MODELS-006 (retired-model conversation migration notice), which covers a different consumer of the same lifecycle field.

### `G7` — Pricing comparison table has no training-data-use disclosure row

**P2** · FIXED · effort S · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** Both ChatGPT and Claude's pricing tables include a training-data-use row: individual tiers show opt-out available, business/team tiers show a categorical No.

**Ours.** apps/web/app/pricing/page.tsx:1143-1157 enumerates the compareRows columns (Plan/Price/Billing/Managed usage/Projects/Custom MCP/Skills & connectors/AGI Work/Images/Video/Managed API/Developer surfaces/Team controls/Best for) — no training-data row on any tier. The actual policy is favorable and unconditional: apps/web/app/privacy/page.tsx:109,371-373, 'AGI does not use customer conversation content to train AGI-owned models' — stronger than either competitor's opt-out model, but never surfaced on the comparison table.

**Recommendation.** Add a training-data-use row to compareRows/managedPlanCapabilities reading the existing (favorable) policy — a one-line addition to a fact we'd already answer well if asked.

### `G12` — Enterprise pricing copy calls a shipped capability 'roadmap'

**P2** · PRESENT_WORSE · effort S · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** ChatGPT's pricing table accurately reserves an entire Security & Administration section for Business/Enterprise with explicit per-row disclosure of what's included.

**Ours.** packages/ui/i18n/locales/en/pricing.json:110 (rendered at apps/web/app/pricing/page.tsx:873-876): 'SSO, audit, and data retention (roadmap, scoped with your team)'. But apps/web/features/admin/pages/AdminConsolePage.tsx:71-78 documents the real state as 'Implemented — entitlement-gated': first-party SSO sign-in (lib/server/sso/clerk-enterprise-connections.ts, /api/admin/sso) and SCIM provisioning (/api/scim/v2) are implemented and gated on the enterprise_controls capability; the same file's ADMIN_CONTROLS inventory (lines 130-145) lists live routes reachable from /settings/team and /admin/directory-sync. Separately, our comparison table's admin/security disclosure is one boolean 'Team controls: Yes/No' column (pricing/page.tsx:175, canUseBillingPlanCapability(plan,'team_admin')) versus ChatGPT's itemized SSO/SCIM/RBAC/IP-allowlist/audit-log rows.

**Recommendation.** Fix the Enterprise card copy to state SSO/SCIM/audit as shipped and entitlement-gated (not 'roadmap'), and consider itemizing the Team-controls column into the same per-control rows ChatGPT discloses, since the underlying capability data already exists (enterprise_controls gate, AdminConsolePage's ADMIN_CONTROLS inventory).

### `orch-gap-02` — The primary nav rail is defined twice by hand and the two copies have drifted — Tasks is unreachable from the app's default screen

**P2** · PRESENT_WORSE · effort S · NEW · _Orchestrator live verification (browser-observed)_

**Benchmark.** All four benchmarked products keep a stable primary rail whose destinations do not change as you move between them; ChatGPT deliberately manages rail size via a 'More' overflow rather than by dropping items per route (06-design-system/comparative-design-system.md).

**Ours.** Two independent, hand-maintained arrays: apps/web/features/chat/pages/WebChatPage.tsx:3762-3813 defines 6 items (Chat, Code, Projects, Library, Schedules, Customize) and apps/web/shared/components/layout/WebAppShell.tsx:242-297 defines 7 (the same plus Tasks -> /tasks). VERIFIED LIVE by enumerating rail buttons: on /chat the rail is the 6-item set; on /chat/library it is the 7-item set including Tasks. /chat is the app's default landing surface (apps/web/app/page.tsx mounts the same component for signed-in visitors on /), so a user who never leaves the chat screen has no path to /tasks at all. WebChatPage.tsx also hardcodes isActive: true for chat-home and false for every other entry, so active state is wrong on /chat/[sessionId] too.

**Recommendation.** Extract the rail to one exported array consumed by both shells, and derive isActive from pathname rather than hardcoding it. The drift is the real defect — a single definition makes orch-gap-01's Artifacts entry a one-line change instead of a two-place change that can drift again.

### `sched-gap-11` — No surface offers both a non-destructive 'Close' and a destructive 'Delete' for the same task object

**P2** · FIXED · effort S · NEW · _Scheduled tasks & automation_

**Benchmark.** Gemini's task overflow menu offers Rename/Pin/Delete/Close as four distinct actions, keeping the lightweight dismiss separate from the destructive delete (03-gemini/spark-task-lifecycle.md)

**Ours.** packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:283-291 has a 'Close' (X) button that only clears selectedRunId — but TasksPage.tsx has no delete action for a task run anywhere (only Stop/cancel for live runs and Open chat). Conversely apps/web/features/schedules/components/ScheduleCard.tsx:215-226 has a destructive 'Delete Schedule' (confirmed via AlertDialog, SchedulesPage.tsx:535-569) but no 'Close' concept since history is a collapse/expand toggle, not a dismissible panel.

**Recommendation.** Decide deliberately whether AGI Work task runs should ever be deletable (they may be intentionally immutable as a billing/audit ledger) and document that choice; if deletable, add it explicitly rather than leaving the absence unexplained.

### `shell-nav-ia-gap-01` — Destructive-action confirmation is inconsistently wired: styled red AlertDialog exists but the highest-frequency and highest-stakes deletes use native window.confirm()

**P2** · FIXED · effort S · NEW · _Shell, global nav, IA & design system_

**Benchmark.** ChatGPT, Claude, Gemini, Manus all require a two-step confirmation with a red-accented confirm control and specific consequence copy for every destructive action tested (delete chat/project/task, cancel subscription, remove plugin) — comparative-design-system.md.

**Ours.** The destructive-variant primitive is proven correct in some flows: apps/web/features/schedules/components/SchedulesPage.tsx:535-568 (AlertDialog, bg-destructive AlertDialogAction, specific copy) and apps/web/features/projects/components/ProjectSettingsDialog.tsx:326-334 (same pattern, project delete). But the SAME action — delete project — falls back to native window.confirm() when triggered from the sidebar's own three-dot menu: apps/web/features/chat/pages/WebChatPage.tsx:3076-3081. Delete conversation (the single most frequent destructive action) uses window.confirm() in both shells: WebChatPage.tsx:2955-2960 and apps/web/shared/components/layout/WebAppShell.tsx:175-179. Delete message: apps/web/features/chat/components/messages/MessageBubble.tsx:2029. 'Permanently delete every chat, including archived chats' (the highest-stakes single action in the app) and 'Archive every chat': apps/web/features/settings/sections/PrivacySection.tsx:255-258 and :221.

**Recommendation.** Replace the window.confirm() call sites listed above with the existing AlertDialog/destructive-variant primitive already proven correct in SchedulesPage.tsx and ProjectSettingsDialog.tsx — no new component needed, just re-wiring ~7 call sites. Prioritize delete-conversation and delete-all-chats first (highest frequency and highest stakes).

### `agentic-modes-gap-02` — AGI Work usage is not disclosed as a separate pool from chat

**P2** · MISSING · effort M · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** ChatGPT and Claude disclose whether agentic-mode task usage draws from a separate quota pool from ordinary chat.

**Ours.** packages/contracts/types/src/usage-vocabulary.ts:28 defines only four managed usage buckets ('session' | 'weekly' | 'weeklyFlagship' | 'period'), no agiwork/cowork bucket; grepping apps/web/lib/services, apps/web/features/settings, and the usage summary hook for any AGI-Work-specific quota concept returns nothing; managed-usage-accounting-service.ts has no workMode awareness either; no settings copy or in-product UI discloses which pool AGI Work draws from.

**Recommendation.** Add explicit in-product disclosure (settings copy and/or a usage-widget label) stating that AGI Work turns draw from the same session/weekly/period pool as chat, so users aren't left guessing; a single honest pool is an acceptable design, but it needs to be disclosed, not just true. [severity inferred by recovery pass]

### `agentic-modes-gap-04` — WorkSessionPanel has a static title and no options menu

**P2** · PARTIAL · effort M · NEW (`AGENTIC-WORK-006`) · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Gemini's task workspace is a two-pane view with an auto-generated, per-task semantic title and a '⋮' options menu; Manus shows at least a truncated title and a '···' menu.

**Ours.** apps/web/features/chat/components/work-session/WorkSessionPanel.tsx (659 lines; toggleable side panel with open/onClose and slide-in animation at :481-513, progress section 'Task progress, N/M complete' at :515-524, outputs and context sections); mounts whenever hasWorkSession(displayedMessages, composerToggles?.workMode) is true (WebChatPage.tsx:3695,4344-4348); static header string 'AGI Work session' at WorkSessionPanel.tsx:500 for every task, no per-task semantic title; header has only a status subtitle and a single close (X) button (WorkSessionPanel.tsx:496-513), no '⋮'/options menu; remains anchored inside the same chat route rather than a separate task view/URL.

**Recommendation.** Once a real title-generation capability exists (see agentic-modes-gap-06 / agentic-08), use it to replace the static 'AGI Work session' header, and add a '⋮' options menu to WorkSessionPanel's header alongside the existing close button. [severity inferred by recovery pass]

### `ART-CANVAS-02` — Gallery's 'New Artifact' never opens a blank, directly-editable artifact — always routes through a chat prompt

**P2** · PARTIAL · effort M · CONFIRMS_PRIOR (`audit/parity-2026-08-15/gaps/domain-artifacts.json ARTIFACTS-003 (same conclusion reached independently from the gallery entry point rather than the Code-tab side; corroborating, not new)`) · _Artifacts, canvas & generative UI objects_

**Benchmark.** Claude's gallery has a 'New artifact' button implied to open a real artifact creation surface, not just a chat redirect (claude-artifacts-findings.md).

**Ours.** apps/web/app/gallery/GalleryClient.tsx:994-1005 handleCategorySelect either router.push('/chat') for the 'scratch' category or opens a wizard whose handleLaunch does router.push(`/chat?prompt=${encoded}`) — every path is a chat-prompt redirect, never a direct editable canvas.

**Recommendation.** See ARTIFACTS-003's own recommendation: make the Code tab's <pre> a real editable surface behind an Edit toggle, writing back through the existing content-keyed versioning path, and let the Gallery's blank-artifact path open that editor directly instead of always redirecting to /chat.

### `CLR-01` — Model picker never surfaces an inline retirement/deprecation warning for a model with a future deprecation_date

**P2** · FIXED · effort M · NEW · _Composer, chat lifecycle & message rendering_

**Benchmark.** ChatGPT annotates a retiring model directly in the picker itself ('o3 — Leaving on August 26'), not only in release notes (01-chatgpt/composer.md)

**Ours.** apps/web/shared/stores/model-store.ts:88-105 (isCurrentModel()) reads the catalog's deprecation_date and filters the model OUT of the picker once the date has passed, but a model with a future deprecation_date renders with zero warning — grepped ComposerFooter.tsx (ModelRow, lines 362-450) and the whole file for deprecat/retir/Leaving/sunset: only the filter's own comment matches, no UI badge exists. packages/contracts/types/src/models.json currently has zero non-null future deprecation_date entries, so this is latent, not actively visible.

**Recommendation.** Add an advance-warning state to ModelRow: when 0 < days-until(deprecation_date) <= N, render a 'Leaving on <date>' badge instead of silently removing the model at the deadline. Reuses the existing catalog field; no new data source needed.

### `CLR-02` — Conversation sidebar title is a permanent raw 50-char prompt truncation; no second-stage LLM-cleaned title ever replaces it

**P2** · MISSING · effort M · NEW · _Composer, chat lifecycle & message rendering_

**Benchmark.** ChatGPT: instant truncated placeholder title is replaced shortly after by a distinct, clean LLM-generated title (01-chatgpt/composer.md)

**Ours.** apps/web/app/api/chat/conversations/[id]/messages/route.ts:115-133 ('Auto-title conversation from first user message') sets title = content.slice(0, 50) + '...' on the first user message and never updates it again. Grepped apps/web for generateTitle/titleGeneration/smartTitle/autoGenerateTitle: zero results anywhere in the codebase.

**Recommendation.** Add an async second-stage title job (small/cheap model call) that fires after the first assistant response completes and PATCHes web_conversations.title, mirroring ChatGPT's two-stage pattern. Cite the existing auto-title block as the insertion point.

### `CLR-05` — 'Edit' on a sent user message prefills the bottom composer instead of turning the message bubble into an inline textarea; a fully-built inline-edit component exists and is never imported anywhere

**P2** · FIXED · effort M · NEW · _Composer, chat lifecycle & message rendering_

**Benchmark.** ChatGPT: hovering a user message reveals Edit; clicking it turns the bubble into an inline pre-filled textarea with Cancel/Send, without navigating away (01-chatgpt/composer.md)

**Ours.** apps/web/features/chat/pages/WebChatPage.tsx:3401-3433 (handleEditMessage) calls setComposerPrefill(msg.content) instead of enabling in-place editing — the original message stays in the transcript, edits happen in the bottom composer, and resubmission deletes/replaces the message plus everything after it. Separately, apps/web/features/chat/components/messages/EditableMessage.tsx (172 lines, full Save/Cancel/auto-resize textarea UI, doc-comment says 'Ported from desktop EditableMessage') is exported from messages/index.ts:6 but grepped the entire apps/web tree and found zero import sites anywhere outside its own file and the barrel re-export — a real inline-edit component was built and never wired to the actual Edit action.

**Recommendation.** Wire the existing, already-built EditableMessage.tsx into MessageBubble.tsx's user-message render path, gated on an isEditing(messageId) state set by handleEditMessage instead of (or in addition to) the composer-prefill path. The component and its Save/Cancel contract already exist; this is a connection task, not a build task.

### `CPS-04` — No AI-assisted or upload/GitHub-import skill authoring on web, BYOK, or managed-cloud surfaces

**P2** · MISSING · effort M · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Claude (/skill-creator), Gemini ('Create with Gemini'), and Manus ('Create Skill with Manus') all let the AI help author a new skill from a description (02-claude/settings.md; 03-gemini/connected-apps-and-settings.md; 07-manus/02-plugins-connectors-skills.md)

**Ours.** Grepped apps/web and packages for SkillEditor, SkillComposer, createSkill, CreateSkillDialog, NewSkillForm: no matches. apps/web/app/settings/skills/new/page.tsx and apps/web/app/skills/[name]/page.tsx are pure browse/redirect surfaces with no creation form. Desktop Local mode has a different mechanism ('Record skill', apps/desktop/src/features/v3/DesktopShellV3.tsx:777-779, Tauri command skill_create_from_recording in apps/desktop/src-tauri/src/sys/commands/skills.rs:528) but it is gated to privacyMode === 'local' only (DesktopShellV3.tsx:778), so it does not cover web/BYOK/managed-cloud users.

**Recommendation.** Add a conversational skill-authoring entry point on web (describe the skill in natural language, model drafts a SKILL.md) reusing the existing chat infrastructure and the skill catalog's write path; consider whether Desktop's 'Record skill' mechanism could also be exposed as an alternate path once web parity exists.

### `CPS-05` — No raw skill file upload or GitHub-import path anywhere in the product

**P2** · MISSING · effort M · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Gemini (upload icon on Skills page) and Manus ('Upload a Skill' / 'Import Skill from GitHub') both let a user import an external skill artifact (03-gemini/connected-apps-and-settings.md; 07-manus/02-plugins-connectors-skills.md)

**Ours.** Same grep sweep as CPS-04 found no upload or GitHub-import UI. The only inbound-skill-adjacent path found is the Cloud-catalog downloadHref flow already flagged by the prior audit (EXTENSIBILITY-005, apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:907-950) — but that is a one-way OUTBOUND file save to Downloads with no import-back-in step, the opposite direction from this claim.

**Recommendation.** Add a file-upload and a 'paste a GitHub URL' path to the skill creation surface, validating the SKILL.md shape (the tools/skill-vetting scanner already exists for supply-chain vetting and could gate this).

### `MEDIA-IMG-02` — Image-generation conversations get an editor that is a side panel on desktop, not the full-view takeover the claim describes, with a raw-prompt-truncation title instead of a generated one

**P2** · DIFFERENT_BY_DESIGN · effort M · NEW · _Image, video & voice generation_

**Benchmark.** ChatGPT's Edit affordance opens a full-page dedicated editing surface with its own back/close control and an auto-generated descriptive title (01-chatgpt/images-media.md, media-04)

**Ours.** apps/web/features/chat/components/ImageGenerationCard.tsx:11-12 (component's own comment: 'mirrors ArtifactsPanel layout'); :454-460 shows `sm:relative sm:inset-auto sm:z-auto sm:w-full md:w-1/2 lg:w-[480px]` — a right-side panel at >=640px viewport width, not a full-view takeover; below the sm breakpoint it is genuinely `fixed inset-y-0 right-0 w-full` (real full-screen on phone widths). Title at :473 is `{titleText} image` where titleText is a plain 36-char slice of the raw user prompt, not a separately model-generated title.

**Recommendation.** If parity with ChatGPT's full-page pattern is desired on desktop widths, promote EditPanel to a dedicated route/full-view takeover above the sm breakpoint (keeping the existing full-screen phone behavior). Independently, consider generating a short descriptive title (a cheap follow-up model call, or reusing whatever titling mechanism regular chat conversations already use) instead of a raw prompt slice.

### `memory-12-gap` — No cross-provider memory import on Web or Desktop (Mobile has a working one)

**P2** · MISSING · effort M · CONFIRMS_PRIOR (`MEMORY-003`) · _Memory & personalization_

**Benchmark.** Claude ('Import memory from other AI providers' Start-import button) and Gemini ('Import memory to Gemini') both ship a first-party entry point to migrate memory from a rival assistant (04-cross-product-comparison/02-memory-and-personalization.md, 03-gemini/memory-and-personalization.md).

**Ours.** apps/web/features/settings/sections/CapabilitiesSection.tsx:169-174 — code comment: the Import row 'was removed: the web import flow is a placeholder (no working provider import endpoint)'. Working reference implementation exists at apps/mobile/src/features/memory/services/memoryImport.ts (ChatGPT/Claude/Gemini export parsers, format auto-detection, preview-before-commit) reachable from apps/mobile/app/(app)/settings/memory-import.tsx.

**Recommendation.** Port memoryImport.ts's parsers (no server dependency, file-only) to a shared package and add a file-picker Import flow to Web's MemorySection and Desktop's Memory settings tab.

### `memory-19-gap` — Memory bundles 'generate summary from history' and 'search/reference raw past chats' into one dependent toggle instead of two independent ones

**P2** · MISSING · effort M · CONFIRMS_PRIOR (`MEMORY-002`) · _Memory & personalization_

**Benchmark.** Claude ships two independently-defaulted toggles: 'Search and reference chats' (RAG-style retrieval) and 'Generate memory from chat history [Legacy]' (04-cross-product-comparison/02-memory-and-personalization.md).

**Ours.** apps/web/features/settings/sections/CapabilitiesSection.tsx:140-149 — 'Generate from past chats' is disabled unless settings.memory is on (line 146), i.e. a dependent sub-toggle, not an independent second dimension. The underlying raw-past-chat search capability doesn't exist in the production send path at all per prior finding MEMORY-002 (WebChatRuntime.ts and request-processor.ts only ever inject the curated MemoryFact list).

**Recommendation.** Once real past-chat RAG search is built (tracked under MEMORY-002), expose it as an independent toggle rather than folding it into the existing memory-generation switch.

### `memory-14-gap` — No project-creation-time memory-scope selector

**P2** · MISSING · effort M · CONFIRMS_PRIOR (`MEMORY-004 (same root cause; this pass adds the creation-flow-specific angle the prior filing didn't cover)`) · _Memory & personalization_

**Benchmark.** ChatGPT's project-creation modal front-loads a project-only vs. shared memory-mode selector before the project exists (04-cross-product-comparison/02-memory-and-personalization.md).

**Ours.** apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx has no memory-mode field (grepped for memory-related fields, zero hits) — root cause is the same as memory-13/14's underlying architecture gap: no project memory scoping exists on Web at all yet.

**Recommendation.** Once project-scoped memory (memory-13's fix) exists, add a mode selector to CreateProjectDialog so scope is chosen at creation time rather than left implicit.

### `G1` — No per-model tier-access matrix on the marketing pricing page

**P2** · FIXED · effort M · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** ChatGPT's pricing page lists 5 named models with per-tier access badges (checkmark/Limited/Expanded/Unlimited/—) in a real comparison table — 01-chatgpt/pricing.md.

**Ours.** apps/web/app/pricing/page.tsx:518-620 (compareRows) uses hand-written relative strings per plan (e.g. packages/ui/i18n/locales/en/pricing.json:163-171 'compareBasicUsage: Base paid usage', 'compareProUsage: 5x Basic usage') — never a named model. The real per-model tier matrix (tierAllowedModels in packages/contracts/types/src/models.json, consumed by modelLock() in apps/web/features/chat/components/Composer/ComposerFooter.tsx:180-208) exists and is enforced in-app, but the pricing page never reads it.

**Recommendation.** Drive a 'models included' disclosure on /pricing from tierAllowedModels (grouped by provider/class, not a literal 34-row table, since our catalog is far larger and updated weekly per models.json's verificationLog) rather than hardcoded per-plan strings.

### `G4` — Credit balance and top-up exist; the per-task debit ledger a user can inspect does not

**P2** · FIXED · effort M · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** Manus shows a 'Credits history' ledger listing each past task with its own credit debit, scaled by that task's real cost.

**Ours.** apps/web/lib/services/credit-service.ts writes to credit_transactions on every deduction/settlement (lines 447-456). apps/web/features/settings/sections/BillingSection.tsx:901-952 shows only the current spendable balance plus an overage opt-in toggle. Grepped every route under apps/web/app/api for 'credit_transactions': read only by app/api/stripe-webhook internals and by the full-account apps/web/app/api/user/export/route.ts (GDPR-style export) — no live per-task history endpoint exists. apps/web/app/api/llm/v1/credits/balance/route.ts returns an aggregate balance only.

**Recommendation.** Add a GET /api/billing/credits/history route reading credit_transactions (already written) and a 'Credits history' list in BillingSection.tsx, mirroring Manus's per-task debit ledger. This is primarily a read-route + UI gap, not new accounting work.

### `PROJ-WS-03` — Project deletion dialog is silent about knowledge files, which become permanently orphaned (soft-delete never triggers the files' ON DELETE CASCADE)

**P2** · FIXED · effort M · NEW · _Projects, workspaces, notebooks & file knowledge_

**Benchmark.** ChatGPT's deletion dialog enumerates every destroyed object type verbatim: 'permanently delete this project, including all its chats, tasks, and files ... To save chats, move them to your chat list or another project before deleting.' SINGLE_PRODUCT (ChatGPT), tableStakes=false. Source: 01-chatgpt/projects.md.

**Ours.** apps/web/app/api/projects/[id]/route.ts:283-337: project deletion sets deleted_at (soft delete) and explicitly moves conversations out (update web_conversations set project_id = null ...) -- this part is disclosed truthfully in ProjectSettingsDialog.tsx:329-334 ('Conversations in this project will be moved to All Chats'). But apps/web/db/neon/0006_projects.sql:18 defines project_knowledge_files.project_id with 'on delete cascade' -- a constraint that can only fire on a hard DELETE, which never happens (the project row is only ever soft-deleted). Grepped apps/web/app/api/projects for any restore/undelete endpoint -- none exists. So knowledge files remain in Postgres and R2 indefinitely after 'deletion', with the dialog never mentioning files at all and no way for the user to get them back.

**Recommendation.** Either (a) add explicit knowledge-file handling to the delete flow (soft-delete or hard-delete the files' rows and R2 objects on project deletion, with a real cleanup job), or (b) if files are meant to persist for potential recovery, add a project-restore endpoint and update the confirmation dialog to say so truthfully (e.g. 'Files will be retained but inaccessible until the project is restored'). The current silence is the actual defect, independent of which behavior is chosen.

### `sched-gap-02` — No inline always-on composer on the web schedules list page

**P2** · MISSING · effort M · NEW · _Scheduled tasks & automation_

**Benchmark.** ChatGPT and Gemini (MAJORITY) embed a text composer directly on the list page requiring no extra click (01-chatgpt/tasks.md; 03-gemini/spark-task-lifecycle.md)

**Ours.** apps/web/features/schedules/components/SchedulesPage.tsx:391-394,496-533 — only affordance is a 'Create Schedule' button opening a Dialog with a full form; no bare composer on the page. apps/mobile/src/features/schedules/components/QuickSchedule.tsx is a working natural-language composer chip rendered unconditionally above the mobile list (schedules/index.tsx:191-194) with its own NL time/day parser — never ported to web.

**Recommendation.** Port QuickSchedule's NL-parsing composer pattern to the web schedules page.

### `settings-03-gap` — 4-tier approval picker exists but isn't reused across agentic surfaces

**P2** · BUILT_NOT_WIRED · effort M · SUPERSEDES_PRIOR (`SETTINGS-011/GAP-006 (domain-settings.md) called Cowork '1 control vs Claude's 5'; this pass found the missing granularity already exists elsewhere in the product and needs reuse, not new build.`) · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude exposes named 3-tier approval pickers separately on Cowork, Scheduled Tasks, and Code mode (02-claude/settings.md); single-product convergence.

**Ours.** packages/ui/unified-chat/src/components/AgentControl.tsx:64 defines a 4-tier Ask/Auto/Plan/Bypass mode chip, rendered live in ChatInput.tsx (only 2 non-test importers: AgentControl.tsx and ChatInput.tsx). apps/desktop/src/features/scheduler/CreateTaskModal.tsx has zero occurrences of approval/autonom/mode/ask/plan. apps/desktop/src/features/settings/tabs/Cowork/index.tsx:10-11 is a single enabled/setEnabled boolean from useCoworkDispatchStore, not a named tiered picker.

**Recommendation.** Reuse AgentControl's mode chip (and its bypass confirm-gate) in CoworkTab and the scheduled-task creation flow instead of building new pickers from scratch.

### `settings-11-gap` — No storage-quota disclosure anywhere in settings

**P2** · MISSING · effort M · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** ChatGPT's Storage tab shows an exact numeric quota with a per-category breakdown; single-product but flagged tableStakes by the benchmark curator.

**Ours.** Grepped every apps/web/features/settings/sections/*.tsx and apps/web/app/settings/**/*.tsx file for 'Storage' excluding localStorage/sessionStorage matches: zero UI results. No numeric quota, usage bar, or per-category breakdown exists on any surface checked.

**Recommendation.** If any per-account storage cap on uploads/artifacts is enforced server-side, surface exact usage-vs-cap numbers before a silent-failure upload becomes a support burden; if no cap exists, this claim may be moot and should be re-scoped rather than built decoratively.

### `settings-12-gap` — Per-task credit-debit ledger exists in Postgres, never reaches a settings screen

**P2** · FIXED · effort M · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Manus shows a visible 'Credits history' ledger, debited per task, distinct from a message-count plan; single-product.

**Ours.** credit_transactions table (apps/web/db/neon/0004_token_credits.sql:24-25) supports transaction_type in {purchase,adjustment,refund,bonus,deduction} with a metadata column (0020_functions.sql:650). rolling-usage.ts:19,55 already derives rolling-cap math 'entirely from credit_transactions (transaction_type = deduction)'. Grepping every apps/web/app/api route for credit_transactions returns only stripe-webhook write paths, billing/top-up/route.ts (writes), and user/export/route.ts (GDPR bulk-export read only) - no GET route returns it for display, and BillingSection.tsx only renders a lump overageAvailableCents balance plus a purchase-level Stripe Invoices table.

**Recommendation.** Add a GET /api/billing/credit-history route reading the already-populated credit_transactions table and render it as a 'Credits history' list in BillingSection - materially cheaper than the Manus feature it targets because the ledger already exists.

### `settings-21-gap` — Tool-access-mode setting is fully dead - defined, never read or set

**P2** · FIXED · effort M · CONFIRMS_PRIOR (`SETTINGS-005 (domain-settings.md) - one of 7 dead field/setter pairs already catalogued in this exact file; still dead.`) · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude's 'Tool access mode' dropdown (Load tools when needed / eager) governs when connected tools enter the model's active context; single-product.

**Ours.** packages/ui/unified-chat/src/stores/settingsStore.ts:41,55,88,106 defines toolAccessMode:'lazy'|'eager' and setToolAccessMode. Grepping the whole repo (excluding the defining file) for either identifier returns zero hits - no UI control renders it, nothing reads it to gate behavior.

**Recommendation.** Either wire a real dropdown to this setter and make tool-loading actually branch on it, or delete the dead state per this repo's own demonstrated pattern of removing toggles that persist but change nothing.

### `shell-nav-ia-gap-02` — Suggested-prompt chips were deliberately removed from the empty-state composer (2026-08-06 founder decision), contradicting a 4/4-product convergence

**P2** · DIFFERENT_BY_DESIGN · effort M · NEW · _Shell, global nav, IA & design system_

**Benchmark.** ChatGPT, Claude, Gemini, and Manus all show 3-5 clickable starter-prompt chips/cards below the empty-state composer — comparative-design-system.md; claude/gemini/manus frontend-overview.md.

**Ours.** apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx:11-13 — code comment states verbatim: 'The six quick-start suggestion chips were removed here and on mobile and desktop (founder 2026-08-06): the empty state is the mark and the greeting, nothing else.' Confirmed no chip/chip-list rendering remains in the component.

**Recommendation.** This is an explicit, dated, attributed product decision, not an oversight — flag to the founder for reconsideration given the benchmark shows unanimous 4/4-product convergence on this pattern, rather than silently re-adding chips. If reinstated, restore consistently across web/mobile/desktop per the original removal's own scope.

### `shell-nav-ia-gap-03` — Composer-embedded Chat/AGI-Work mode toggle exists but its placeholder text never changes and it's invisible to free/basic-tier users

**P2** · PARTIAL · effort M · CONFIRMS_PRIOR (`audit/parity-2026-08-15/gaps/domain-agentic-work.json AGENTIC-WORK-006 (re-confirms P2-001): 'AGI Work exists as a mode toggle on the ordinary chat composer... no independent, deep-linkable workspace object.' This finding adds the placeholder-non-reactivity and tier-gating angles that prior pass did not check.`) · _Shell, global nav, IA & design system_

**Benchmark.** Claude's composer-embedded Chat/Cowork axis shifts placeholder copy ('Write a message...' -> 'Describe a task or ask a question') on toggle and is visible regardless of plan tier — frontend-overview.md, comparative-design-system.md.

**Ours.** Toggle exists and is functionally real: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2895-2921 (inline) and :2377-2409 (overflow-menu variant for narrow widths), explicitly commented 'claude.ai Chat/Cowork parity.' But the textarea placeholder at ChatComposerNew.tsx:2258-2266 branches only on isTurnActive/imageMode/videoMode, never workMode -- switching to AGI Work never changes the placeholder. Visibility is gated: canUseAgiWork requires billingPolicyReady && !isFreeTrial && canUseBillingPlanCapability(tier, 'agi_work') (ChatComposerNew.tsx:455-456), so free/basic-tier users never see this axis at all. Separately, there is no global-chrome-level axis (ChatGPT top-bar pill / Gemini sidebar-content-swap pattern) at all -- 'Code' in the sidebar (WebAppShell.tsx:251-256) is a plain route navigation to a different feature page, not a sidebar-content swap of the same shell.

**Recommendation.** Wire ChatComposerNew's placeholder prop to workMode (small, isolated change). Separately evaluate whether AGI Work's paid-tier gate should also gate its visibility, or whether it should render (disabled, with an upgrade nudge) for free/basic users the way the other benchmarked products keep their mode switch visible regardless of plan.

### `shell-nav-ia-gap-04` — No shared status indicator between the Tasks list and the ordinary chat-history sidebar row for the same running conversation

**P2** · MISSING · effort M · NEW · _Shell, global nav, IA & design system_

**Benchmark.** Claude and Gemini show an identical blue solid dot for an in-progress agentic task in BOTH a dedicated task list AND the general chat-history row for that same item -- comparative-design-system.md; frontend-overview.md.

**Ours.** packages/ui/ui/src/sidebar/types.ts:16-34 -- the SidebarSession interface every chat-history row is built from has no status/isStreaming/isRunning field. packages/ui/ui/src/sidebar/SessionItem.tsx (298 lines, the row renderer) has zero status/badge logic, confirmed by grep. The Tasks surface (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:440-462) does show a real status pill (taskStateLabel(run.state)) but only within its own separate /tasks list -- no code path connects it back to the conversation's row in the ordinary sidebar.

**Recommendation.** Add an optional status field to SidebarSession, populate it from the same run-state source TasksPage already reads, and render a small dot in SessionItem when a conversation has an active/running AGI Work run -- mirroring the same data the Tasks list already has, just surfaced in a second place.

### `shell-nav-ia-gap-06` — Scheduled-task creation uses a conventional multi-field form, not the shared chat composer, and offers no suggested/template starter schedules

**P2** · MISSING · effort M · CONFIRMS_PRIOR (`audit/parity-2026-08-15/gaps/domain-composer.json COMPOSER-001 (P1): four independent composer implementations repo-wide. This finding narrows to a within-web-surface instance (schedule creation doesn't even attempt the composer visual language) plus the separate, previously-unfiled observation that no suggested-template content exists on this surface at all (shell-18).`) · _Shell, global nav, IA & design system_

**Benchmark.** All four products reuse the same visual composer across contexts including scheduled-task creation, just with different placeholder copy (design-system.md); separately, all three of ChatGPT/Claude/Gemini visually separate real schedules from suggested/template starters in the same list (design-system.md, frontend-overview.md) -- shell-18.

**Ours.** apps/web/features/schedules/components/ScheduleForm.tsx -- labeled text inputs, a model <select>, numeric interval fields, a raw cron-string field (placeholder="0 9 * * 1-5…"), not the rounded chat composer. apps/web/features/schedules/components/SchedulesPage.tsx:432-443 -- empty state offers only a 'Create Your First Schedule' CTA; grepped the file for 'Suggested'/'template', zero hits -- no template gallery exists to separate from real items at all.

**Recommendation.** Lower priority than COMPOSER-001's cross-surface consolidation; if that migration happens, fold schedule creation into the shared composer with a 'Schedule' mode rather than a bespoke form. Independently, add 2-3 suggested schedule templates to the empty state, consistent with how the composer's own suggested-chips decision (shell-20) should be revisited together.

### `G4` — No Reports gallery UI, though the backend already supports listing all of a user's reports

**P2** · FIXED · effort M · NEW · _Web Search & Deep Research_

**Benchmark.** ChatGPT tracks Deep Research outputs in a dedicated, persisted 'Reports' gallery separate from regular chat history, with a document-reader header (download/copy-link/delete)

**Ours.** apps/web/app/api/research/reports/route.ts:15-20,63-68 -- GET with no conversationId returns 'newest reports for the caller' (RLS-scoped via getUserScopedDb), but the only caller anywhere in the repo, ResearchPanel.tsx's ReportTab (line 143), always passes conversationId; `find apps/web/app -iname '*report*'` finds no gallery route (only an unrelated content-report moderation endpoint). The missing link is: no route/nav entry -> no gallery component -> no call site that omits conversationId, even though the read endpoint, RLS isolation, and the exact renderer needed (ResearchReportView.tsx) already exist.

**Recommendation.** Add a /reports (or similar) route with a simple list view calling GET /api/research/reports with no conversationId, reusing ResearchReportView.tsx for the detail pane -- most of the plumbing already exists.

### `G5` — No nested Table of Contents in the completed report reader

**P2** · MISSING · effort M · NEW · _Web Search & Deep Research_

**Benchmark.** ChatGPT and Gemini both present finished reports with a navigable, nested TOC (numbered sections/sub-sections) rather than a single scrolling block

**Ours.** ResearchReportView.tsx:252-257 renders the whole report body as one continuous MarkdownContent block with no heading extraction; grepped apps/web/features/chat and packages/ui for TableOfContents/toc-generation helpers -- none found.

**Recommendation.** Extract markdown headings from report.content client-side (or have the synthesis prompt emit a heading list) and render a clickable, nested TOC sidebar in ResearchReportView, anchored to in-page heading IDs.

### `G12` — A reopened/standalone report view has no follow-up composer for grounded Q&A

**P2** · FIXED · effort M · NEW · _Web Search & Deep Research_

**Benchmark.** ChatGPT and Gemini both explicitly invite continued interaction with a completed report as a live object ('Ask about this file' / 'feel free to ask follow-up questions')

**Ours.** Within the originating live conversation, a report is implicitly grounded because it is simply the assistant's prior turn in chat history -- no gap there. But ResearchReportView.tsx and ReportTab (the only two places a persisted report renders) have no composer or 'ask about this' affordance at all, so a report opened outside its originating conversation (already true today via /api/research/reports?requestId=, and more visible once Gap G4 ships a gallery) is a dead end for follow-up.

**Recommendation.** Add a lightweight composer to ResearchReportView when it's hosted outside the live conversation (e.g. from a future Reports gallery), sending follow-ups as a new turn seeded with the report content, or link back into the originating conversationId when one exists.

### `agentic-modes-gap-08` — No approval-mode picker on Web; Desktop's is global/binary, not per-conversation or 3-tier

**P2** · PARTIAL · effort L · CONFIRMS_PRIOR (`GAP-058 / GAP-059`) · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Claude shows a named, per-conversation, three-tier approval picker in composer chrome (Manually approve / Automatically approve / Skip all approvals).

**Ours.** Web: grepping ChatComposerNew.tsx and apps/web/features/settings for any approval-mode/auto-approve/manual-approve control returns nothing — no approval-mode UI anywhere in the web composer. Desktop: GAP-058 (Done) — a global, binary 'Approvals: Auto' warning shown persistently at the composer when native auto-approve is on, linking to settings (ComposerContextControls.tsx); GAP-059 (Not Planned, reasoned) — a true per-conversation, named, 3-tier picker was explicitly declined because the native Tauri executor only exposes a global policy.

**Recommendation.** Web has no approval-mode affordance at all (not even Desktop's degraded global warning) — add at minimum the Desktop-equivalent global 'Approvals: Auto' warning to the Web composer. A true per-conversation 3-tier picker remains blocked on the executor only exposing a global policy (per GAP-059's reasoning), so don't build a per-conversation UI that misrepresents an isolation the backend doesn't enforce. [severity inferred by recovery pass]

### `CLR-07` — Inline citations render as a trailing numbered-badge pill row after the whole message, not claim-adjacent favicon+domain pills mid-sentence

**P2** · PARTIAL · effort L · CONFIRMS_PRIOR (`audit/parity-2026-08-15/gaps/domain-rendering.json RENDERING-008`) · _Composer, chat lifecycle & message rendering_

**Benchmark.** ChatGPT embeds small favicon+domain pill badges directly after the sentence they support, not numbered footnote markers (01-chatgpt/composer.md)

**Ours.** apps/web/features/chat/components/messages/InlineSourceTags.tsx:17-54 — a numbered circular index badge (not a favicon) + title/hostname, rendered in a single trailing flex-wrap row after the entire message body, confirmed via full file read.

**Recommendation.** See RENDERING-008's existing recommendation (add a rich hover/focus popover, favicon, and consider claim-adjacent positioning); not re-filed as a separate row, only cross-referenced with this claim's specific live-observed benchmark detail (favicon+domain vs numbered badge).

### `legal-trust-03` — No published commercial/enterprise legal-terms document distinct from consumer Terms

**P2** · MISSING · effort L · NEW · _Legal, policy, trust & data-control surfaces_

**Benchmark.** All three benchmarked products publish a business-tier legal document reviewable before contact: Anthropic's Commercial Terms of Service, OpenAI's tier-sectioned Service Terms, Manus's MSA. Source: 01-chatgpt, 02-claude, 07-manus legal-and-policies files.

**Ours.** apps/web/app/enterprise/page.tsx:109-112 ('MSA — We negotiate against your procurement. No forced click-through.') and apps/web/app/terms/page.tsx:450-453 confirm enterprise terms are bespoke-negotiated, not a published document. No file matching an enterprise/commercial-terms/MSA route pattern exists under apps/web/app.

**Recommendation.** Founder/legal decision needed (per legal-constants.ts's own FOUNDER CONFIRMATION REQUIRED convention): either publish a standard-form commercial terms template procurement reviewers can read pre-contact, or state the bespoke-only posture explicitly on /enterprise rather than leaving it undiscoverable. Do not draft binding terms language without that sign-off.

### `memory-02-gap` — Memory is a flat/provenance-grouped fact list, never synthesized narrative prose

**P2** · PARTIAL · effort L · CONFIRMS_PRIOR (`MEMORY-006 (flagged missing search/pin/summary on Web; this pass adds that even the mobile reference implementation it points to isn't prose-structured)`) · _Memory & personalization_

**Benchmark.** ChatGPT's Memory summary modal and Claude's memory view render multi-paragraph prose under topical headers ('Overview', 'Work context', 'Personal context') (01-chatgpt/memory.md, 04-cross-product-comparison/02-memory-and-personalization.md).

**Ours.** Web: packages/ui/unified-chat/src/components/MemoryEditor.tsx:215-283 renders a flat unheaded <li> list. Mobile: apps/mobile/app/(app)/settings/memory-summary.tsx:105-146 groups facts under provenance headers (Pinned/Learned from chats/Added by you, per SUMMARY_SECTION_META in consolidation.ts:110-121) but each item stays a discrete unedited fact line, not synthesized topic-based prose.

**Recommendation.** Add a model-generated narrative summary pass (topic-clustered paragraphs, not provenance-grouped bullets) as a read-only view layered on top of the existing editable fact list, on both Web and Mobile.

### `memory-15-gap` — No 'Scheduled' card and no editable 'Memory' card in the project settings rail (only Instructions and Files are real)

**P2** · PARTIAL · effort L · NEW · _Memory & personalization_

**Benchmark.** Claude's project view shows a persistent 4-card rail — Instructions/Memory/Context/Scheduled — each independently editable, with the Memory card carrying an 'Only you' badge (04-cross-product-comparison/02-memory-and-personalization.md).

**Ours.** apps/web/features/projects/components/ProjectSettingsDialog.tsx:208-227 (Instructions textarea, real) and :253-262 (Files/KnowledgeFilesPanel, real) are genuinely separate editable cards; the Memory 'card' (lines 244-251) is static non-interactive copy, and no Scheduled card exists at all (grepped 'scheduled.*task', 'project.*schedul' across apps/web/features/projects — zero hits).

**Recommendation.** Once project memory scoping exists, turn the static Memory copy into a real editable card matching the Instructions/Files pattern already established; add a Scheduled card only if/when project-level scheduled automations ship.

### `G9` — No dedicated education-institution plan

**P2** · MISSING · effort L · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** ChatGPT has 'ChatGPT for Teachers' (free) and paid 'ChatGPT Edu'; Claude has an Education plan card with dedicated API research credits.

**Ours.** Grepped apps/web/app and the pricing i18n bundle for education/Edu/teachers — no route, plan card, or billing-catalog entry exists.

**Recommendation.** Majority convergence (both benchmarked non-Gemini/Manus products have this); would need a new plan tier, checkout path, and institutional-status verification flow.

### `PROJ-WS-02` — No project-scoped scheduled/recurring tasks -- schedules have no project association at all

**P2** · MISSING · effort L · NEW · _Projects, workspaces, notebooks & file knowledge_

**Benchmark.** Claude's project rail has a dedicated 'Scheduled' card with a '+' button ('Set up recurring tasks for this project'). ChatGPT's project-deletion warning copy confirms tasks live inside projects ('all its chats, tasks, and files'). MAJORITY convergence (ChatGPT, Claude), tableStakes=false. Source: 01-chatgpt/projects.md, 02-claude/projects.md.

**Ours.** Grepped apps/web/features/schedules/types/index.ts, apps/web/app/api/schedules/route.ts, and apps/web/features/schedules/components/ScheduleForm.tsx for 'projectId'/'project_id' -- zero matches in any file, confirming schedules have no project dimension in the data model at all. apps/web/app/chat/projects/[id]/page.tsx:587-611 has exactly two tabs (Chats, Sources); no third Scheduled tab exists, and the string 'schedul' appears nowhere else in that file except an unrelated code comment (page.tsx:338).

**Recommendation.** Add a nullable project_id column to the schedules table, thread it through ScheduleForm.tsx and the create/list routes, add a 'Scheduled' tab or card to the project detail page (page.tsx), and cascade-delete or reassign project-scoped schedules when their project is deleted (mirroring the conversation-reassignment pattern already used in apps/web/app/api/projects/[id]/route.ts).

### `sched-gap-15` — No follow-up composer for steering a task from the /tasks detail panel

**P2** · PARTIAL · effort L · CONFIRMS_PRIOR (`AGENTIC-WORK-005 (P1) — 'Mid-run steering of an active AGI Work / Cloud agent run': a running conversation hard-rejects any new message with a 409, and the only in-run interaction (ToolApprovalDecisionSchema) accepts approved|rejected only, no free text. Severity here kept at P2 to avoid re-counting the same defect above its existing P1.`) · _Scheduled tasks & automation_

**Benchmark.** Gemini's task panel has a persistent bottom composer ('What can we do next?') for continued steering of the same task thread (03-gemini/spark-task-lifecycle.md)

**Ours.** The two-pane structure itself is real: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:420-585 renders a list + a sticky TaskDetailPanel with goal/plan/progress/outputs/context. But TaskDetailPanel.tsx has no input field anywhere for sending a follow-up instruction to the run.

**Recommendation.** Fix belongs to AGENTIC-WORK-005: add an optional guidance field to the tool-approval-resume contract as the smallest first step, per that gap's own recommendation.

### `settings-05-gap` — No network-egress warning or domain allowlist for agent-executed code

**P2** · MISSING · effort L · CONFIRMS_PRIOR (`SETTINGS-006 (domain-settings.md) - still unfixed since the prior pass.`) · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude's Capabilities settings show an 'Allow network egress' toggle with a security warning plus a curated domain-allowlist dropdown; single-product.

**Ours.** apps/web/features/settings/sections/CapabilitiesSection.tsx:13-17 - the only settings state is {memory, generateFromHistory, allowToolAssistedGeneration}; zero occurrences of network/egress/domain/allowlist in the file. Same zero-hit result in apps/desktop/src/features/settings/tabs/Capabilities/index.tsx.

**Recommendation.** If/when agent-executed code gets outbound network access, gate it behind an explicit warning plus curated allowlist rather than an all-or-nothing switch, matching the safety-copy pattern this codebase already uses for the overage opt-in.

### `settings-07-gap` — PR auto-monitoring capability does not exist on any reachable UI surface

**P2** · BUILT_NOT_WIRED · effort L · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude Code's 'Autofix pull requests' toggle ships ON by default, auto-monitoring open PRs; single-product.

**Ours.** apps/desktop/src/api/git.ts exports checkPRReadiness (:661-683) and createPR (:657). Grepping apps/desktop for calls to either (excluding the defining file and tests) returns zero hits - no component, panel, or store calls them, so there is no live PR at all for an 'autofix/monitor' toggle to apply to.

**Recommendation.** Wire the existing git.ts PR functions to a real UI action first (e.g. from a git/diff panel); only then does a monitoring-default question become meaningful.

### `settings-08-gap` — PR auto-creation is dead exported code, not a configurable toggle

**P2** · BUILT_NOT_WIRED · effort L · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude Code has a distinct, OFF-by-default 'Create pull requests automatically' toggle, separate from PR monitoring; single-product.

**Ours.** apps/desktop/src/api/git.ts exports createPR (:657) and generatePRDescription (:621-635). Grepped the whole apps/desktop tree (excluding the defining file and tests) for both identifiers: zero call sites anywhere.

**Recommendation.** Same root fix as settings-07 - wire createPR/generatePRDescription to a real UI trigger; once live, add an explicit ask-first-by-default toggle rather than auto-creating PRs silently.

### `settings-25-gap` — MFA is TOTP-only; the majority-benchmark pattern is independently toggleable methods

**P2** · PARTIAL · effort L · CONFIRMS_PRIOR (`SETTINGS-008/GAP-115 (domain-settings.md) - still TOTP-only, honestly disclosed rather than faked.`) · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Both ChatGPT and Claude expose an active-sessions table plus independently toggleable MFA methods (e.g. Authenticator + SMS); majority convergence, tableStakes.

**Ours.** Active-sessions half is real and Clerk-backed (AccountSection.tsx:564, per-row Revoke). SecuritySection.tsx:145-146 explicitly discloses: 'Passkeys, security keys, SMS MFA, and trusted-device lists are not available in the current account contract. Authenticator app codes (TOTP)... are.'

**Recommendation.** Adding a second independently-toggleable MFA method (SMS or passkey) closes a majority-convergence, tableStakes-adjacent gap; keep the current honest disclosure copy until it does.

### `G1` — No pre-flight plan-approval gate before a research run spends budget

**P2** · FIXED · effort L · NEW · _Web Search & Deep Research_

**Benchmark.** ChatGPT: plan card with Edit/Cancel/Start(N) countdown; Gemini: plan card with Edit plan link, time estimate, and 'Try again without Deep Research' fallback -- both in search-and-research.md and deep-research.md

**Ours.** ResearchActivity.tsx (258 lines, whole file): plan renders only as part of the already-executing run (PlanStepRow is read-only, no edit handler); research-loop.ts phase machine (line 103) goes planning->searching->synthesizing with no approval checkpoint between planning and execution; no countdown, no time estimate, no 'skip research' link found anywhere in apps/web/features/chat.

**Recommendation.** Add an explicit review step after the planning turn completes and before gathering rounds start: render the parsed plan queries as an editable list with Start/Cancel actions (no auto-start timer), and thread edits back into research-loop.ts's plannedQueries before gathering begins.

### `sched-gap-12` — Scheduled tasks have no richer, tool-using tier — only the lightweight kind exists, and not by design

**P2** · MISSING · effort XL · CONFIRMS_PRIOR (`AGENTIC-WORK-007 (P1) — same root cause; severity here kept below the existing P1 to avoid double-counting.`) · _Scheduled tasks & automation_

**Benchmark.** Gemini deliberately offers two tiers: a rich Spark tool-using composer and a separate lightweight digest-delivery form (04-cross-product-comparison/03-scheduled-tasks-and-automation.md)

**Ours.** apps/web/lib/services/scheduled-agent-executor.ts:88-135 — the sole ScheduledTaskExecutor implementation builds a request with no tools field at all (no web search, no MCP, no connectors, no code execution), so there is no richer scheduled-task tier at any maturity, unlike Gemini's intentional two-tier split.

**Recommendation.** Fix belongs to AGENTIC-WORK-007: route scheduled execution through the same runToolLoop/tool-definition assembly used by interactive chat.

### `agentic-modes-gap-05` — No self-disclosed task-complexity narration

**P3** · MISSING · effort S · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Gemini narrates a first-person task-complexity self-assessment (e.g. 'My initial assessment classified the task as simple...').

**Ours.** request-processor.ts:441,450 has a classifiedTaskType/RoutingTaskType concept, but it is used purely for internal model-routing decisions — it is never rendered to the user as first-person narration; grepping the agent-execution services and the LLM completions route for any complexity/difficulty self-assessment string that reaches the client found nothing.

**Recommendation.** Surface the existing classifiedTaskType value as a first-person narration line in the agent activity timeline rather than building new classification logic — the signal already exists server-side, it just never reaches the client. [severity inferred by recovery pass]

### `agentic-modes-gap-11` — Fork/'continue in new task' action is buried in a dropdown, not always visible

**P3** · FIXED · effort S · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Manus shows an always-visible copy-icon + fork-icon pair beneath every response, not a context-menu action.

**Ours.** apps/web/lib/services/conversation-branch-service.ts implements ForkConversationInput{sourceConversationId, messageId, requestId} with idempotent branch lookups (findIdempotentBranch) and caps (MAX_BRANCHES_PER_FORK = 50, MAX_FORK_POINTS_PER_CONVERSATION = 100); wired to the UI at MessageBubble.tsx:1977-1980 ('Branch conversation' with a GitFork icon), but it lives inside a DropdownMenuItem (an overflow/'more actions' menu), not an always-visible icon row beneath every response.

**Recommendation.** Promote the existing 'Branch conversation' action out of the overflow DropdownMenuItem at MessageBubble.tsx:1977-1980 into an always-visible icon beneath each response — the backend (conversation-branch-service.ts) already supports it; this is a UI-placement change only. [severity inferred by recovery pass]

### `agentic-modes-gap-14` — Custom MCP import supports URL-based add only, not raw-JSON-config import

**P3** · PARTIAL · effort S · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Manus offers three separate custom-MCP actions: 'Custom MCP' / 'Import MCP by JSON' / 'Add MCP by URL'. (ChatGPT and Claude offer neither variant — only vendor-curated integrations — a claim already beaten on the URL-based half.)

**Ours.** apps/web/app/api/connectors/custom/route.ts is a live-validating add-a-custom-MCP-by-URL API (connectMcpServer from @agiworkforce/mcp called at save time, ':9-13'), HTTPS-only with DNS-resolved-public-hostname validation (validateHttpsMcpUrl) and encrypted-at-rest bearer tokens; wired to apps/web/features/connectors/pages/ConnectorsPage.tsx (POST /api/connectors/custom at :220); confirmed live on Desktop (apps/desktop/src/api/cloudConnectors.ts) and Mobile (AddCustomConnectorModal.tsx) per prior audit's domain-extensibility.md:79,84. The form takes a URL + optional bearer token only — no arbitrary pasted-JSON server config variant exists.

**Recommendation.** Add a raw-JSON-config import variant alongside the existing URL-based custom-MCP form (apps/web/app/api/connectors/custom/route.ts, ConnectorsPage.tsx:220) to match Manus's third action — the core capability (and its validation/security model) is already ahead of ChatGPT and Claude; this closes the remaining gap against Manus specifically. [severity inferred by recovery pass]

### `ART-CANVAS-04` — Composer has no discrete, named Canvas/artifact-creation tool entry

**P3** · MISSING · effort S · NEW · _Artifacts, canvas & generative UI objects_

**Benchmark.** Gemini's composer 'More tools' menu has a distinct 'Canvas' entry alongside Deep Research (evidence label UNVERIFIED even for Gemini itself — the benchmark never exercised it).

**Ours.** grep for canvas/Canvas in apps/web/features/chat/components/Composer/ChatComposerNew.tsx returns only an HTML <canvas> element used for camera-capture image processing (lines 1063-1075), unrelated to artifact creation. Artifact creation is implicit-by-prompt-content or via the Gallery's New Artifact button (see ART-CANVAS-02).

**Recommendation.** Low priority given SINGLE_PRODUCT/UNVERIFIED convergence. If pursued, add a 'New artifact' entry to the composer's tools/attachments menu that opens the same category picker the Gallery already has (apps/web/app/gallery/GalleryClient.tsx CategoryPicker), rather than building a second implementation.

### `ART-CANVAS-08` — Image-generation entry points do not disclose the underlying model name in first-party UI copy

**P3** · MISSING · effort S · NEW · _Artifacts, canvas & generative UI objects_

**Benchmark.** Gemini's Images entry point shows 'Create images with Nano Banana 2' directly in UI text.

**Ours.** Grepped apps/web/features/chat/components/ImageGenerationCard.tsx for a rendered {modelId}-derived label near the generation entry point: modelId is threaded through function calls (normalizeImageAspectRatioForModel(modelId, ...) etc.) but no user-visible model-name string was found. This is a shallow single-file grep, not a full sweep of every image-generation entry point in the app, so confidence is lower than other findings in this file.

**Recommendation.** Low priority, single-product Gemini differentiator with only shallow verification here. If pursued: surface the resolved model's display name (sourced from packages/contracts/types/src/models.json per this repo's own model-ID rule, never hardcoded) near the image-generation entry point.

### `CLR-10` — No always-visible per-response fork/branch icon with reassurance copy; branching is menu-gated only

**P3** · DIFFERENT_BY_DESIGN · effort S · NEW · _Composer, chat lifecycle & message rendering_

**Benchmark.** Manus shows a persistent fork icon under every response labeled 'Continue in new task' with explicit copy: 'Your original task stays unchanged' (07-manus/01-overview-and-nav.md)

**Ours.** apps/web/features/chat/components/messages/MessageBubble.tsx:1977-1981 — 'Branch conversation' exists only inside the '...' DropdownMenuContent (composer-12's ChatGPT-style pattern, confirmed present), not as an always-visible icon, and no reassurance copy resembling Manus's exists anywhere in the file.

**Recommendation.** Low priority — single-product Manus differentiator; the current menu-gated design (which already beats Claude's fully-invisible branching per RENDERING-009) is defensible. If pursued, promote the existing onBranch handler to an always-visible icon and add reassurance copy; no new backend logic needed.

### `CPS-10` — No plugin-provenance data flows into the skill autocomplete, so no attribution or narration copy is possible

**P3** · MISSING · effort S · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Claude's slash-autocomplete labels a plugin-bundled skill with its parent plugin name (e.g. '/ux-copy' labeled 'Design plugin') (02-claude/settings.md)

**Ours.** apps/web/features/chat/hooks/use-skills-list.ts:10 SkillItem carries only a coarse 'source' tag ('bundled' etc, per apps/web/lib/services/skill-catalog-service.ts:57-83), not a plugin name. apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:118-129's skillSuggestions mapping drops even that field, carrying only id/command/description/icon. The plugin registry's own declared_skills column (0096_plugin_registry.sql) is never joined into the skill catalog the composer consumes.

**Recommendation.** Thread plugin_id/plugin_name through from plugin_registry_entries.declared_skills into the skill catalog service and SkillItem, then render it as a small label in the slash/@ suggestion row — this also unblocks connectors-19's narration-copy gap, which is currently impossible without this data.

### `CPS-11` — No narration copy at all distinguishing how a skill was loaded

**P3** · MISSING · effort S · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Claude appears to use different transparency-UI copy for plugin-sourced vs standalone skill invocation (02-claude/settings.md)

**Ours.** Grepped the product for 'Loaded.*skill', 'skill.*loaded', 'Using skill': only unrelated store/loading-state code matched (skillMarketplaceStore.ts, DesktopCloudSettingsModal.tsx). No 'used skill X' disclosure narration exists in the chat UI at all, for either sourcing path.

**Recommendation.** Blocked on CPS-10 (no provenance data reaches the composer/chat UI yet); once that's wired, add a one-line narration string distinguishing plugin-sourced vs standalone skill loads.

### `CPS-13` — No example prompt shown on connector marketplace cards

**P3** · MISSING · effort S · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Gemini's Connected Apps cards show a concrete, invocation-ready example prompt per connector (03-gemini/connected-apps-and-settings.md)

**Ours.** Grepped apps/web/features/connectors/data/connectors.ts and ConnectorsPage.tsx for examplePrompt/'sample prompt'/'Try:': no matches. Cards show name/description/category only.

**Recommendation.** Add an optional examplePrompt field to the connector data model and render it on the DirectoryBrowse card when present — low-risk, additive.

### `MEDIA-VIDPLAYER-09` — Finished video player has no explicit Share control

**P3** · PARTIAL · effort S · NEW · _Image, video & voice generation_

**Benchmark.** Gemini's finished video player exposes Download, Share, and Mute buttons plus play/pause and a timestamp readout (03-gemini/media-generation.md, media-17)

**Ours.** apps/web/features/chat/components/messages/MessageBubble.tsx:1586-1616 — native <video controls> (giving play/pause, volume/mute, and scrub/timestamp for free) with poster thumbnail, plus a single Download overlay button (1601-1614). No Share button exists for video, unlike the image ShareModal.

**Recommendation.** Add a Share button next to the existing Download overlay on the finished-video block, reusing the same ShareModal component already built for images (ImageGenerationCard.tsx's ShareModal, 184-326).

### `MEDIA-PLACEHOLDER-10` — Generation placeholders are not pre-sized to the requested aspect ratio

**P3** · FIXED · effort S · NEW · _Image, video & voice generation_

**Benchmark.** ChatGPT's generation placeholder is pre-sized to the target image's eventual aspect ratio (01-chatgpt/images-media.md, media-01)

**Ours.** apps/web/features/chat/components/ImageGenerationCard.tsx:139-178 — GeneratingCard() takes no aspectRatio prop and is always h-[280px] w-full max-w-[420px]. apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx:50 hardcodes Tailwind's aspect-video (16:9) regardless of the requested ratio, and the component has no aspectRatio prop to receive one.

**Recommendation.** Pass the requested aspectRatio into GeneratingCard and VideoGenerationPlaceholder and size the placeholder box (e.g. via CSS aspect-ratio) to match, instead of a fixed box/16:9 default.

### `MEDIA-DELETE-11` — Delete-conversation confirmation does not name the specific data store or confirm generated media is included

**P3** · FIXED · effort S · NEW · _Image, video & voice generation_

**Benchmark.** Gemini's delete-chat dialog names the specific backing data store and explicitly states generated content is included ('...from your Gemini Apps Activity, plus any content you created', 03-gemini/media-generation.md, media-20)

**Ours.** apps/web/features/chat/components/Sidebar/ConversationListItem.tsx:320-323 — generic copy: 'Delete conversation? This will permanently delete "{title}" and all its messages.' No data-store name, no explicit statement that generated images/videos tied to the conversation are included.

**Recommendation.** Update the dialog copy to explicitly state that generated media assets are deleted along with the conversation (assuming that is actually true server-side — verify before claiming it in copy). Given the active compliance/dpdp branch, worth a quick check that deletion completeness for generated media actually matches what any updated copy would claim.

### `legal-trust-04` — No commercial-tier dispute-resolution stance exists to review or set deliberately

**P3** · MISSING · effort S · NEW · _Legal, policy, trust & data-control surfaces_

**Benchmark.** Anthropic's Commercial Terms deliberately reverse its consumer litigation-only stance into mandatory arbitration for business customers. Source: 02-claude/legal-and-policies.md.

**Ours.** Depends on legal-trust-03 — no commercial terms document exists, so consumer /terms (arbitration + 30-day opt-out) applies by default to every tier absent a signed MSA overriding it (apps/web/app/terms/page.tsx:450-453).

**Recommendation.** Decide the commercial-tier dispute-resolution stance deliberately at the same time gap legal-trust-03 is closed, rather than letting the consumer clause silently apply by default to enterprise deals.

### `legal-trust-08` — No dedicated MCP marketplace listing policy — correctly not built, since no marketplace exists to govern

**P3** · DIFFERENT_BY_DESIGN · effort S · NEW · _Legal, policy, trust & data-control surfaces_

**Benchmark.** Claude's AUP references a separate Directory Policy governing third-party MCP server listings in Claude's own curated Directory. Source: 02-claude/legal-and-policies.md.

**Ours.** apps/web/app/connectors/mcp-directory/page.tsx:120-125 states AGI does not mirror, curate, or sign any MCP servers — points to the official MCP registry and AGI's own custom-connector (bring-your-own-endpoint) flow instead. apps/web/app/acceptable-use/page.tsx:214-224 already disclaims vetting responsibility for custom MCP servers.

**Recommendation.** No action. A listing policy is only needed if AGI builds a curated marketplace it doesn't currently operate — building one just to justify the policy would be scope creep.

### `memory-16-gap` — No disclosed (or apparently existing) numeric source-count ceiling for project knowledge files

**P3** · MISSING · effort S · NEW · _Memory & personalization_

**Benchmark.** Gemini's Notebook settings disclose 'up to 300 sources' per notebook with a default-on memory toggle (04-cross-product-comparison/02-memory-and-personalization.md).

**Ours.** Grepped 'up to', 'maximum of', 'cap of', '300 sources' in apps/web/features/projects/components/KnowledgeFilesPanel.tsx — zero hits. apps/web/features/projects/__tests__/project-knowledge-upload-boundary.test.ts only asserts a per-file byte-size constant is not leaked into UI copy; no evidence of any file-count ceiling, disclosed or not.

**Recommendation.** If a backend file-count ceiling exists, surface it in KnowledgeFilesPanel copy; if none exists, add one and disclose it — an unbounded per-project file count is itself worth checking independent of this claim.

### `memory-05-gap` — No disclosure of whether memory personalizes outbound tool/search queries

**P3** · MISSING · effort S · NEW · _Memory & personalization_

**Benchmark.** ChatGPT's Personalization settings state explicitly: 'ChatGPT may use Memory to personalize queries to search providers, such as Bing' (01-chatgpt/memory.md).

**Ours.** Grepped 'search provider', 'bing', 'personalize.*quer', 'outbound.*search' across apps/web/features/settings — zero hits. Whether memory actually personalizes our web-search tool calls server-side was not verified either way in this pass; this finding is specifically about absent UI disclosure.

**Recommendation.** Determine whether memory currently feeds tool-call query construction server-side; if it does, add a disclosure line to CapabilitiesSection; if it doesn't, no action needed beyond noting the gap is purely hypothetical today.

### `memory-10-gap` — No memory-scope disclosure for a voice/Live surface (and no clear equivalent surface exists to disclose about)

**P3** · MISSING · effort S · NEW · _Memory & personalization_

**Benchmark.** Gemini's Memory toggle explicitly states 'Coming soon to Live', disclosing memory's voice-mode scope in first-party copy (03-gemini/memory-and-personalization.md).

**Ours.** No AGI Workforce surface found equivalent to a full-duplex voice/Live conversation mode; apps/mobile/src/features/voice/ is dictation input into standard text chat, not a separate voice-first surface. Recorded as MISSING with the caveat that the prerequisite feature itself may not exist yet, rather than DIFFERENT_BY_DESIGN.

**Recommendation.** No action needed until/unless a Live-style voice surface ships; at that point add explicit memory-scope disclosure copy alongside it.

### `G10` — No disclosed nonprofit discount

**P3** · MISSING · effort S · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** ChatGPT's pricing FAQ discloses up to 75% off Business/Enterprise via OpenAI for Nonprofits.

**Ours.** Grepped apps/web/app and the pricing i18n bundle for nonprofit — no program, discount percentage, or FAQ entry found anywhere.

**Recommendation.** Mostly a policy + FAQ-copy decision if applied via a Stripe coupon at the Team/Enterprise checkout layer, not new infrastructure.

### `G11` — In-app paywall shows the upgrade tier's name but never its price

**P3** · FIXED · effort S · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** Gemini's in-app upsell banner discloses the exact price: 'Get 5x more usage with AI Ultra — $99.99/month.'

**Ours.** apps/web/features/chat/components/InlinePaywallCard.tsx:201-202,234-239 builds every CTA string from getBillingPlanPricing(requiredTier).label only ('Upgrade to Pro'). The same getBillingPlanPricing() call already returns monthlyPriceUsd (packages/contracts/types/src/billing-catalog.ts:95,122-123) — the component is already calling the function that has the price, it just doesn't read that field into the string.

**Recommendation.** Interpolate monthlyPriceUsd (or the already-localized price where available) into the existing CTA strings at InlinePaywallCard.tsx:201-202,234-239 — no new data plumbing required.

### `PROJ-WS-05` — Library media grid does not visually distinguish video thumbnails from image thumbnails

**P3** · MISSING · effort S · NEW · _Projects, workspaces, notebooks & file knowledge_

**Benchmark.** Gemini's Library Media grid overlays a small video-camera/film-strip icon on video tiles; plain image tiles have no such overlay. SINGLE_PRODUCT (Gemini), tableStakes=false. Source: 03-gemini/library.md.

**Ours.** packages/ui/unified-chat/src/components/GeneratedFileCard.tsx:159-175: when presentation.previewUri exists, both image and video assets render as an identical plain <img> tag with no overlay; the only differentiator is a text kindLabel (e.g. 'Video') rendered below the thumbnail at line 185, not an icon on the thumbnail itself.

**Recommendation.** Add a small play/film-strip icon overlay (absolutely positioned in a corner of the thumbnail <img> wrapper) in GeneratedFileCard.tsx when presentation.kindLabel indicates video, matching Gemini's at-a-glance pattern -- a small, self-contained UI change.

### `PROJ-WS-07` — No pre-built example/tutorial project shipped on new accounts

**P3** · MISSING · effort S · NEW · _Projects, workspaces, notebooks & file knowledge_

**Benchmark.** Claude's Projects gallery ships a pre-existing project titled 'How to use Claude', explicitly badged 'Example project'. SINGLE_PRODUCT (Claude), tableStakes=false. Source: 02-claude/projects.md.

**Ours.** Grepped apps/web/features/projects and apps/web/db/neon for 'Example project', 'How to use', and any onboarding/seed-project pattern -- no matches. Fresh accounts start with zero projects (confirmed via apps/web/app/api/projects/route.ts having no seed-on-create logic examined in this pass).

**Recommendation.** Seed new accounts with one badged 'Example project' containing sample instructions and a short how-to conversation, distinguishable from user-created projects (e.g. an isExample flag hidden from Duplicate/Export). Low effort, low value -- polish item only.

### `sched-gap-04` — No approval/autonomy-mode picker at schedule-creation time

**P3** · MISSING · effort S · CONFIRMS_PRIOR (`AGENTIC-WORK-007 (apps/web/lib/services/scheduled-agent-executor.ts:88-135 has no tools field at all — there is nothing to gate approval on yet)`) · _Scheduled tasks & automation_

**Benchmark.** Claude's manual task form has a 3-option approval-mode picker (Manually approve / Automatically approve / Skip all approvals) (02-claude/scheduled-tasks.md)

**Ours.** grep -n "approval|autonomy|approve" apps/web/features/schedules/ returns zero hits; apps/web/features/schedules/components/ScheduleForm.tsx has no such control.

**Recommendation.** Do not build this picker in isolation; it only becomes meaningful once scheduled execution gains tool access (AGENTIC-WORK-007's fix).

### `sched-gap-06` — Suggested-template cards never show cadence text

**P3** · MISSING · effort S · NEW · _Scheduled tasks & automation_

**Benchmark.** Each of Claude's six template cards shows exact recurrence (e.g. 'Weekdays at 8:00 AM') before creation (02-claude/scheduled-tasks.md)

**Ours.** N/A on web (no templates exist there — see sched-gap-01). On mobile, apps/mobile/app/(app)/schedules/index.tsx:369-399 (TemplateCard) renders only emoji + title + one-line description; no cadence/time text anywhere in the component despite the underlying template data (apps/mobile/src/features/schedules/templates.ts) having a timeOfDay/recurrence field it could surface.

**Recommendation.** When templates are built for web (sched-gap-01), surface the template's cadence directly on the card; mobile's TemplateCard could add this cheaply since the data is already present in ScheduleTemplate.initialData.

### `sched-gap-13` — Status-filter control exists elsewhere in the codebase but not on the web schedules list

**P3** · FIXED · effort S · NEW · _Scheduled tasks & automation_

**Benchmark.** ChatGPT has a right-aligned 'Active' filter chip on its Scheduled page (01-chatgpt/tasks.md)

**Ours.** apps/web/features/schedules/components/SchedulesPage.tsx has no filter/tab state of any kind (confirmed by full read). The capability is fully built twice elsewhere and never carried to this page: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:52-55,371-389 (Active/All tabs passing explicit `states` arrays to the server) and apps/desktop/src/features/scheduler/ScheduledTasksPanel.tsx:14-20,126-160 (five-way All/Active/Paused/Completed/Failed tabs with live counts).

**Recommendation.** Port the /tasks Active/All filter pattern (or desktop's richer 5-state version) directly onto /chat/schedules — the implementation already exists twice in-repo.

### `sched-gap-14` — Suggested-template icon differentiation exists on mobile, absent on web

**P3** · BUILT_NOT_WIRED · effort S · NEW · _Scheduled tasks & automation_

**Benchmark.** ChatGPT uses a '+' circle icon on template rows distinct from the plain status icon on real task rows (01-chatgpt/tasks.md)

**Ours.** N/A on web (no templates — see sched-gap-01). Already correctly implemented on mobile: TemplateCard uses a teal '+'-in-circle icon (apps/mobile/app/(app)/schedules/index.tsx:391-396) while real ScheduleCard rows use a text Badge for status (apps/mobile/src/features/schedules/components/ScheduleCard.tsx:124-147,214) — visually distinct per the claim's intent, just never ported to the web surface where competitors were benchmarked.

**Recommendation.** Carries automatically once sched-gap-01 (web templates) is built — reuse the same icon-differentiation pattern already proven on mobile.

### `sched-gap-16` — No maturity/beta disclosure anywhere in the scheduling or task UI

**P3** · MISSING · effort S · NEW · _Scheduled tasks & automation_

**Benchmark.** Gemini's task panel header carries an explicit 'BETA' badge even though the feature is fully live (03-gemini/spark-task-lifecycle.md)

**Ours.** grep -rn "BETA|Beta|Alpha" apps/web/features/schedules apps/web/features/tasks packages/ui/unified-chat/src/components/tasks returns zero hits. CLAUDE.md states Managed Cloud is 'public alpha, open by default' (founder decision, 2026-06-27) but that status is not surfaced anywhere a user actually creates or watches an unattended, sometimes-billed automation.

**Recommendation.** The specific 'clone Gemini's badge' ask is cosmetic and low priority, but the underlying expectation-setting gap (no maturity signal on a feature that runs unattended and can bill the user) is worth a deliberate founder decision independent of matching a competitor's chip.

### `sched-gap-17` — Create-schedule form defaults to a recurring cadence, not on-demand/manual

**P3** · PRESENT_WORSE · effort S · NEW · _Scheduled tasks & automation_

**Benchmark.** Claude's Frequency dropdown defaults to 'Manual' (on-demand only) rather than a preset recurring schedule (02-claude/scheduled-tasks.md)

**Ours.** apps/web/features/schedules/lib/schedule-form.ts:26-43 — INITIAL_SCHEDULE_DRAFT defaults recurrence: 'daily', timeOfDay: '09:00', daysOfWeek: [1,2,3,4,5]. A new 'Create Schedule' dialog opens pre-configured as a standing weekday 9am recurring task, the inverse of Claude's on-demand default.

**Recommendation.** Default ScheduleDraft.recurrence to 'once' (or force an explicit choice with no default) so accidental creation of a standing recurring automation isn't the path of least resistance.

### `settings-15-gap` — No in-settings ad-personalization opt-out toggle

**P3** · MISSING · effort S · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Manus's General settings expose an 'Ads about Manus' toggle in plain language; single-product.

**Ours.** Grepped every settings section for ads/Ads/advertis: zero matches referring to an actual ad-personalization control (only unrelated word matches like 'advertised'). No evidence found either way of an actual ad-personalization data-sharing program this would need to gate.

**Recommendation.** Confirm whether AGI Workforce shares account data with any marketing/ad vendor at all; if yes, add a plain-language toggle proactively; if no, do not build a decorative switch for a program that doesn't exist.

### `shell-nav-ia-gap-07` — Marketing-nav mobile breakpoint hides the primary sign-in/CTA behind the hamburger, unlike Claude's benchmark which keeps CTAs visible outside it

**P3** · FIXED · effort S · NEW · _Shell, global nav, IA & design system_

**Benchmark.** Claude's marketing nav collapses to a hamburger at ~1299px (above typical mobile width) while 'Contact sales' and 'Try Claude' CTAs remain visible outside the hamburger -- marketing-site-nav.md.

**Ours.** apps/web/app/globals.css:2246-2254 -- @media (max-width: 900px) hides BOTH .agi-top-nav-desktop AND .agi-top-actions-desktop (the Sign-in / 'Open AGI' CTA) together, replaced only by the hamburger toggle. The breakpoint itself (900px, above the typical 768px binary) matches the spirit of the claim; the CTA-visibility requirement does not.

**Recommendation.** Split the media query so .agi-top-actions-desktop (or a compact CTA-only variant) stays visible at the 900px breakpoint while only the nav links collapse into the hamburger, matching Claude's pattern.

### `shell-nav-ia-gap-08` — Per-response fork/branch action is gated behind the hover-only 'More actions' menu, not a persistent always-visible icon

**P3** · FIXED · effort S · NEW · _Shell, global nav, IA & design system_

**Benchmark.** Manus shows a persistent, always-visible fork/branch icon directly under every completed response ('Continue in new task'), not gated behind a menu -- overview-and-nav.md.

**Ours.** apps/web/features/chat/components/messages/MessageBubble.tsx:1977-1982 -- 'Branch conversation' (GitFork icon, wired to real onBranch/createBranch logic) exists only inside the 'More actions' DropdownMenu. The entire action row itself is opacity-0 group-hover:opacity-100 (MessageBubble.tsx:1742,1761) -- hover-only, not persistent.

**Recommendation.** Promote the branch action out of the overflow menu into the always-visible icon row alongside copy/regenerate, matching Manus's placement; the underlying branch functionality is already correct and just needs a different affordance location.

### `shell-nav-ia-gap-09` — No 'promote to recurring schedule' action in a conversation's options menu

**P3** · MISSING · effort S · NEW · _Shell, global nav, IA & design system_

**Benchmark.** Manus's per-task options menu includes a direct one-click 'Schedule a task' action that promotes an existing conversation into a recurring schedule -- overview-and-nav.md.

**Ours.** Grepped the repo for 'Schedule a task'/'Turn into schedule'/'promoteToSchedule' etc. -- zero hits. packages/ui/ui/src/sidebar/SessionItem.tsx's own header comment names its complete menu surface (pin/star/rename/share/archive/move-to-project/delete) with no scheduling entry.

**Recommendation.** Add a 'Schedule this' menu item to SessionItem's dropdown that pre-fills ScheduleForm with the conversation's context, reusing the existing rerunWork-style pattern already used to seed a new AGI Work chat from a task's goal (apps/web/features/tasks/components/TasksPage.tsx:34-42).

### `G10` — Report citation list is missing favicons that the sibling Sources-tab component already renders

**P3** · PRESENT_WORSE · effort S · NEW · _Web Search & Deep Research_

**Benchmark.** Gemini's end-of-report source list shows a real favicon, domain, and title per entry

**Ours.** ResearchReportView.tsx CitationRow (lines 74-109) renders only a numbered badge + title + host + external-link icon, no favicon <img>; ResearchPanel.tsx SourceRow (lines 27-98), one file away, already implements a favicon-with-Google-fallback pattern (https://www.google.com/s2/favicons?domain=...) for the same kind of source data.

**Recommendation.** Copy the existing favicon-with-fallback rendering from ResearchPanel.tsx's SourceRow into ResearchReportView.tsx's CitationRow -- same-file-pattern fix, no new capability needed.

### `agentic-modes-gap-06` — Conversation titles are truncated, not semantically generated, and no auto-rename path exists

**P3** · PRESENT_WORSE · effort M · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Gemini generates a semantic task title via an LLM call (not truncation); Manus at least produces a truncation/rephrase-style title.

**Ours.** apps/web/app/api/chat/conversations/[id]/messages/route.ts:115-131 — 'Auto-title conversation from first user message' generates the title via pure character truncation (const title = content.slice(0, 50) + (content.length > 50 ? '...' : '')), no LLM call, no semantic rewrite; renameConversation() exists client-side (WebChatRuntime.ts:383-391) but has zero call sites anywhere in apps/web outside its own definition, so there is no auto-rename path at all after the fact, semantic or otherwise; this is also the root cause of WorkSessionPanel's static 'AGI Work session' title (agentic-05).

**Recommendation.** Replace the character-truncation title generator in messages/route.ts:115-131 with a real (lightweight) LLM title-generation call, and wire the existing but unused renameConversation() client function to it so titles can update after generation. [severity inferred by recovery pass]

### `agentic-modes-gap-12` — No 'promote task to recurring schedule' menu action

**P3** · MISSING · effort M · NEW (`AGENTIC-WORK-004`) · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Manus offers a direct menu action to promote an existing task into a recurring schedule.

**Ours.** No conversation/task menu anywhere (MessageBubble.tsx, ConversationListItem.tsx, WorkSessionPanel.tsx) offers a schedule-creation shortcut; apps/web/features/schedules has no conversationId/fromConversation/sourceConversation concept in any component — schedules are created from a standalone /chat/schedules flow only, with no path from an existing task back into it.

**Recommendation.** Add a 'Promote to schedule' menu action on WorkSessionPanel/ConversationListItem that pre-fills the standalone /chat/schedules flow with the source conversation's context; this is adjacent to but distinct from AGENTIC-WORK-004 (scheduling capability/cadence), and is purely an entry-point discoverability gap. [severity inferred by recovery pass]

### `ART-CANVAS-01` — Artifact gallery has no search, no filter-by, and no Shared-with-you tab

**P3** · PARTIAL · effort M · NEW · _Artifacts, canvas & generative UI objects_

**Benchmark.** Claude's /artifacts gallery has All/Yours/Shared-with-you tabs, a Filter-by dropdown, and a search icon (research files 11-artifacts-and-files/claude-artifacts-findings.md, 04-cross-product-comparison/09-generative-artifacts-canvas-and-media.md).

**Ours.** apps/web/app/gallery/GalleryClient.tsx: only two tabs exist, type TabId = 'yours' | 'inspiration' (line 970); grepped whole file for search/Search (0 hits) and filter/Filter (only an unrelated .filter(Boolean) call at line 630). Nav entry confirmed reachable: apps/web/features/chat/v3/WebSidebar.tsx:112 'Artifacts' -> WebShellV3.tsx:33 VIEW_ROUTES['artifacts']='/gallery'.

**Recommendation.** Add a search input and a type/date filter dropdown to GalleryClient's header row, scoped to sortedArtifacts; a 'Shared with you' tab requires the cross-account artifact-sharing model to exist first (see ARTIFACTS-001 in the prior audit, which found even single-user cross-device sync is push-missing), so sequence search/filter first as the cheap win.

### `CLR-09` — Composer '+' menu 'Connectors' entry is a settings-modal link-out, not an in-composer custom-MCP-registration flow

**P3** · DIFFERENT_BY_DESIGN · effort M · NEW · _Composer, chat lifecycle & message rendering_

**Benchmark.** Claude's composer '+' menu -> 'Add connector' submenu includes 'Add custom connector' directly, without leaving the chat (02-claude/composer-and-chat-lifecycle.md)

**Ours.** apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2735-2775 — the 'Connectors' menu item calls openSettings('connectors') (:2750), navigating to the Settings modal; the in-code comment explains this is deliberate ('An inline connect toggle here would imply a mid-chat capability that does not exist'). Custom MCP registration genuinely exists at apps/web/features/connectors/pages/ConnectorsPage.tsx and ToolPermissionsPanel.tsx, just one navigation hop outside the composer.

**Recommendation.** Low priority — the capability exists and the current design has an honest rationale (avoiding a fake per-conversation-scoped toggle). If composer-adjacency is desired, open the existing ConnectorsPage flow in a modal/sheet anchored to the composer rather than a full settings navigation, preserving the honesty rationale.

### `CPS-14` — No first-party productivity-suite bundle toggle (no equivalent of Gemini's Google Workspace master switch)

**P3** · MISSING · effort M · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Gemini groups Gmail/Docs/Drive/Keep under one 'Google Workspace' master toggle with independently toggleable sub-items (03-gemini/connected-apps-and-settings.md)

**Ours.** Grepped for 'Google Workspace', 'workspace bundle', masterToggle, bundleToggle across apps/web: no matches. Each first-party integration in the catalog is an independent connector with no bundle-level parent toggle.

**Recommendation.** Only worth building if/when this product ships multiple related first-party connectors from one provider (e.g. multiple Google or Microsoft integrations) that would benefit from one grouped toggle.

### `CPS-16` — No category-tab browsing on the public plugin storefront, and the storefront's own catalog is not yet installable

**P3** · PARTIAL · effort M · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** ChatGPT's GPT Store has category tabs (Top Picks, Research & Analysis, etc.) and named third-party listings (04-cross-product-comparison/05-connectors-plugins-skills.md)

**Ours.** apps/web/app/plugins/page.tsx is a public, unauthenticated marketing-layout page (Header + MarketingFooter), satisfying 'reachable without first creating one' — but category is rendered as plain text per row (page.tsx:159), not a filterable tab nav, and the page's own doc comment confirms every row is status='preview' (nothing installable), overlapping with CPS-07.

**Recommendation.** Add category-tab filtering to the existing public /plugins page once CPS-07 (at least one real installable plugin) is addressed — building the browsing chrome before there's anything to install is low value on its own.

### `CPS-17` — No context-load control (lazy vs. always-loaded) for installed tools

**P3** · MISSING · effort M · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Claude's Capabilities tab exposes a 'Tool access mode' dropdown ('Load tools when needed') (02-claude/settings.md)

**Ours.** Grepped for 'Tool access mode', 'Load tools when needed', toolAccessMode across apps/web and apps/desktop: no shipped control found, only a forward-looking comment at apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:30 describing a future 'app-verified pass' that has not landed.

**Recommendation.** Single-product Claude differentiator; low priority unless context-window pressure from always-loaded tool definitions becomes a measured problem.

### `MEDIA-MENU-06` — No explicit template/freeform/iterative-refine on-ramp menu for image generation

**P3** · MISSING · effort M · NEW · _Image, video & voice generation_

**Benchmark.** Gemini's Images modal presents three named entry paths — Try a template, Visualize anything, Refine with Gemini (03-gemini/media-generation.md, media-11)

**Ours.** apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2426-2511 — 'Create image' is a single mode toggle into one freeform composer; no sub-choice menu exists.

**Recommendation.** Low priority, single-product Gemini pattern. If pursued, the aspect-ratio/model pickers already in the composer are a natural place to add a lightweight 'start from template' option.

### `MEDIA-NAV-07` — No dedicated top-level Images/Videos nav destinations

**P3** · PARTIAL · effort M · NEW · _Image, video & voice generation_

**Benchmark.** Gemini has separate top-level sidebar entries for Images and Videos, each opening its own dedicated generation surface (03-gemini/media-generation.md, media-12)

**Ours.** apps/web/features/chat/v3/WebSidebar.tsx nav items are Projects/Live artifacts/Dispatch/Schedules/Customize — no Images/Videos entries. Generation is reachable only inside the composer's '+' menu (ChatComposerNew.tsx:2426,2515). A related but different surface, /chat/library (apps/web/app/chat/library/page.tsx, reachable via apps/web/shared/components/layout/WebAppShell.tsx:274-275), browses already-generated media after the fact rather than offering a dedicated generation composer per media type.

**Recommendation.** Low priority, single-product Gemini pattern; our composer-mode-toggle approach is a legitimate different design, not a broken one. If pursued, /chat/library is the natural place to add 'start a new generation' entry points per media type rather than building an entirely separate nav destination.

### `legal-trust-05` — No privacy-notice coverage for non-account-holder third parties whose data appears via a user's connectors or conversation

**P3** · MISSING · effort M · NEW · _Legal, policy, trust & data-control surfaces_

**Benchmark.** Anthropic references a separate Non-User Privacy Policy covering people who are not Claude account holders but whose personal data appears in the product. Source: 02-claude/legal-and-policies.md.

**Ours.** apps/web/app/privacy/page.tsx — grepped full file for 'non-user', 'third part(y|ies)', 'someone else', 'another person'; only hit is an organizational-data-retention note at line 709 that addresses retention scoping, not third-party personal-data disclosure.

**Recommendation.** Add a short dedicated paragraph to /privacy covering third-party personal data that enters the product via a user's connectors (e.g. a colleague's contact info pulled in via Gmail/calendar connectors) — this scenario is real for AGI's connector surface today, more so than it may have been in the original Claude research pass.

### `memory-03-gap` — No conversational chat-style editing of memory (only discrete add/edit/delete rows)

**P3** · MISSING · effort M · NEW · _Memory & personalization_

**Benchmark.** ChatGPT's Memory summary modal has an 'Ask or update' free-text input for conversational edits to the memory summary (01-chatgpt/memory.md).

**Ours.** packages/ui/unified-chat/src/components/MemoryEditor.tsx:166-249 — only a per-fact add textarea and per-row inline edit textarea; no natural-language instruction box exists on any surface (grepped for conversational-edit patterns, zero hits).

**Recommendation.** Add a free-text instruction input above the fact list that sends a single-turn request to add/merge/remove facts via natural language, distinct from the existing row-level controls.

### `memory-18-gap` — No independent per-capability auto-invoke toggles (web search, canvas, voice, library, connector search)

**P3** · MISSING · effort M · NEW · _Memory & personalization_

**Benchmark.** ChatGPT's Personalization Advanced section has five independent auto-invoke toggles (Web search, Canvas, Voice, Library search, Connector search) (01-chatgpt/memory.md).

**Ours.** apps/web/features/settings/sections/CapabilitiesSection.tsx (full file) has exactly three toggles, all under 'Memory' — no auto-invoke section exists. Grepped 'auto.*invoke', 'autoInvoke', 'auto.*web.*search' across settings — zero hits.

**Recommendation.** Add an 'Advanced' subsection to CapabilitiesSection with independent per-tool auto-invoke switches, mirroring the pattern already used for the memory sub-toggles.

### `memory-17-gap` — No visible memory-retrieval narration step in the reasoning/thinking trace

**P3** · MISSING · effort M · NEW · _Memory & personalization_

**Benchmark.** Claude visibly narrates 'Thinking about retrieving context from previous conversation history' before answering a memory-dependent question (04-cross-product-comparison/02-memory-and-personalization.md).

**Ours.** No memory-retrieval-labeled reasoning step found in apps/web/features/chat/components/ThinkingBlock.tsx or around enrichManagedMemoryContext in request-processor.ts:972. Not verified via a live conversation against the running dev server, so this is a static-analysis finding about UI/backend scaffolding, not a claim about the underlying model's live reasoning output.

**Recommendation.** If reasoning-trace labeling is added generally, ensure memory-context injection is named explicitly as a step rather than folded silently into the system prompt.

### `G3` — Usage buckets are model-class-scoped, not per-named-model like Claude's Fable bar

**P3** · PARTIAL · effort M · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** Claude's Usage settings show a dedicated 'Fable' progress bar tied to one specific named premium model, separate from the aggregate.

**Ours.** apps/web/features/settings/sections/UsageSection.tsx:137-139,243-252 buckets by model CLASS (flagship_weekly_usage_percentage), not by individual model id. useManagedUsageSummary.ts's contract has no per-model-id field (grepped for perModel/byModel, none found).

**Recommendation.** If a specific model becomes a differentiated cost/quota driver the way Fable is for Claude, add a model-scoped usage row to the accounting service and a fifth UsageBar keyed to that model id.

### `G8` — No published per-model API pricing, cache-tier rates, named service tiers, or batch discount

**P3** · MISSING · effort M · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** Claude publishes per-model token pricing with separate 5-min/1-hr cache-write and cache-hit rates (mqp-21), a service_tier parameter with a disclosed SLA (mqp-22), wall-clock session-hour billing for managed agents (mqp-23), and a 50%-off async batch mode (mqp-28); its 'Learn more' links route to full developer docs (mqp-20).

**Ours.** apps/web/app/api-docs/page.tsx (74 lines, read in full) is the entire developer API doc surface: a curl quick-start and a link to /openapi.json. Zero pricing info of any kind, despite apps/web/lib/prompt-cache-helper.ts and apps/web/lib/cost-tracker.ts already computing cache economics server-side for internal billing. No service_tier concept, no batch-submission mode, no session-hour billing disclosure for the agi_work capability, and no outbound 'Learn more' links at all (below even ChatGPT's consumer-help-article bar).

**Recommendation.** Publish a real pricing-reference page surfacing what's already metered internally (cache savings, per-request cost); a literal Claude-style service_tier/cache-rate table doesn't map 1:1 since our managed API is a multi-provider routing gateway, not a single first-party model.

### `PROJ-WS-04` — Project capabilities require dialog navigation instead of a single persistent rail; Memory and Scheduled are not represented as first-class cards

**P3** · PARTIAL · effort M · NEW · _Projects, workspaces, notebooks & file knowledge_

**Benchmark.** Claude's project workspace shows a persistent right-hand rail with four independently-managed cards (Instructions, Memory with an 'Only you' badge, Context, Scheduled) all visible at once with no separate settings navigation. SINGLE_PRODUCT (Claude), tableStakes=false. Source: 02-claude/projects.md.

**Ours.** apps/web/app/chat/projects/[id]/page.tsx: Instructions and the memory disclaimer only live inside ProjectSettingsDialog, reached via a '...' overflow menu -> 'Project settings' (page.tsx:409-442), not visible on the main workspace view. Sources has its own dedicated tab (page.tsx:587-611, satisfying the Context card). There is no Scheduled card/tab at all (see PROJ-WS-02). Memory has no card-level presence beyond the static sentence noted in PROJ-WS-01.

**Recommendation.** Once project-scoped memory (PROJ-WS-01) and project-scoped scheduling (PROJ-WS-02) exist, consider surfacing Instructions/Memory/Context/Scheduled as visible cards on the project workspace itself rather than requiring a settings-dialog detour -- this is lower priority than building the two missing capabilities themselves, since a rail around empty/non-functional cards would not close the gap.

### `sched-gap-05` — No project/workspace scoping control at schedule-creation time

**P3** · MISSING · effort M · NEW · _Scheduled tasks & automation_

**Benchmark.** Claude's manual task form has a 'Work in a project or folder' dropdown binding execution context (02-claude/scheduled-tasks.md)

**Ours.** grep -n "project|workspace|folder" apps/web/features/schedules/components/ScheduleForm.tsx returns zero hits; SchedulesPage.tsx:381-382 and ScheduleForm.tsx:176-179 explicitly state scheduled runs 'do not inherit chat context or memory'.

**Recommendation.** Low priority single-product claim; would require scheduled runs to gain context/file access first, which they currently lack entirely.

### `sched-gap-07` — Schedule list rows have no way to show a run is currently in progress

**P3** · FIXED · effort M · NEW · _Scheduled tasks & automation_

**Benchmark.** Claude and Gemini (MAJORITY) show a colored dot on an active task's row that clears the instant it completes (04-cross-product-comparison/03-scheduled-tasks-and-automation.md; 03-gemini/spark-task-lifecycle.md)

**Ours.** Present and correct on /tasks: task-display.ts:79-84 defines a literally-blue badge for queued/running states that flips to green on completion, refreshed via 4s polling (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx TASK_JOURNAL_POLL_INTERVAL_MS). Absent on /chat/schedules: packages/contracts/cloud-contracts/src/schedules.ts:56 defines ManagedCloudScheduleTask.status as z.enum(['active','paused','completed','failed','expired']) — there is no 'running' value at all, so ScheduleCard.tsx:106-108's collapsed row can structurally never indicate an in-flight run; the running indicator only exists inside expanded run history (ScheduleRunHistory.tsx:38-44).

**Recommendation.** Add a transient 'running now' visual state to ScheduleCard driven by whether any run for that schedule is currently in the 'running' run-status, without needing a new schedule-level enum value.

### `sched-gap-08` — No auto-generated semantic task title on either scheduling surface

**P3** · MISSING · effort M · NEW · _Scheduled tasks & automation_

**Benchmark.** Gemini auto-generates a genuine semantic title from the prompt (e.g. 'Eiffel Tower Historical Research'), not a truncation (03-gemini/spark-task-lifecycle.md)

**Ours.** apps/web/features/schedules/lib/schedule-form.ts:253 — 'name' is a required, user-typed field, never auto-generated. apps/web/features/tasks and packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:443-444 — /tasks row labels are the static workModeLabel() string ('AGI Work'/'Research'/'Chat'), not a per-run semantic title; task-display.ts:18-28 confirms this is a fixed switch statement, not content-derived.

**Recommendation.** Single-product Gemini differentiator; low priority, but a semantic /tasks row title (vs. the generic work-mode label) would be a genuine UX improvement independent of matching Gemini.

### `sched-gap-09` — No tool-use icon differentiation in the live task log, only status-colored dots

**P3** · FIXED · effort M · NEW · _Scheduled tasks & automation_

**Benchmark.** Gemini's live log shows each tool invocation with a distinguishing icon and spelled-out tool name (03-gemini/spark-task-lifecycle.md)

**Ours.** packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:94-118 (ProgressRow) — tool entries do carry a real name/summary (entry.name/entry.summary), so the 'named' half is present, but every entry (progress or tool) gets the identical small dot keyed only to entry.status, never to tool identity; no icon distinguishes a web-search step from a code-execution step.

**Recommendation.** Map a small icon set (search, code, browser, file, etc.) onto AgentActivityToolEntry.name/kind in ProgressRow, reusing whatever icon set the interactive chat tool-call renderer already has.

### `settings-28-gap` — Scheduled task creation has no approval-mode picker, and scheduled runs have nothing yet to gate

**P3** · MISSING · effort M · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude's Scheduled Task creation flow reuses Cowork's approval-mode picker; single-product Claude behavior.

**Ours.** apps/desktop/src/features/scheduler/CreateTaskModal.tsx fields are Name/Description/Instructions/Model only (lines 190,209,227,236-243), zero approval/mode/ask/plan content. The backend ApprovalMode type (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:223) is only 2-tier ('auto'|'manual') and has zero .tsx call sites anywhere in apps/web.

**Recommendation.** Sequence behind fixing AGENTIC-WORK-007 (scheduled runs currently execute with zero tool access per the prior audit's agentic-work domain) before adding a picker with nothing real to gate; then reuse AgentControl's mode chip at task-creation time.

### `settings-06-gap` — Extension site allowlist has no default-permission policy, only a static list

**P3** · FIXED · effort M · CONFIRMS_PRIOR (`domain-settings.md:118-123 already characterizes this as a static allowlist, left untracked under any GAP id ('left to the extension domain's own tracking').`) · _Settings taxonomy & permission/approval architecture_

**Benchmark.** ChatGPT's Cloud browser settings pair a 'Default permissions' dropdown with a per-domain override list; single-product.

**Ours.** apps/extension/src/options.ts:1056-1087 renders an 'Approved sites' allowlist with an 'Add' control (comment at :1163: '"Add" - the page's only site-permission control'). No default-policy dropdown governs behavior for a site not on the list.

**Recommendation.** Add an explicit default-permission setting (Always ask / Always allow for this session) so the allowlist becomes an override on top of a stated default, without weakening the existing per-action approval model.

### `settings-16-gap` — Notification categories are grouped by channel, not offered as per-category channel selection

**P3** · DIFFERENT_BY_DESIGN · effort M · CONFIRMS_PRIOR (`SETTINGS-012/GAP-119 (domain-settings.md) - already tracked as a deliberately-narrow breadth gap.`) · _Settings taxonomy & permission/approval architecture_

**Benchmark.** ChatGPT lets a user pick Push/Email/both independently per notification category; single-product.

**Ours.** NotificationsSection.tsx's CHANNEL_GROUPS group by channel first ('Browser notifications' containing only browserReplyReady; 'Email' containing only emailScheduleDone; mobilePushScheduleDone separate) rather than one event-row with channel checkboxes. Code comments (:20-38) document 5 toggles deliberately removed for having no backend sender, and 2 re-added only once real senders (push-notification-service.ts, notification-email-service.ts) shipped.

**Recommendation.** When adding more notification events, adopt a per-category-with-channel-checkboxes layout, but do not add a channel toggle ahead of a real sender existing - the current discipline is correct and should be preserved.

### `settings-20-gap` — No global default-approval policy for installed plugin/tool actions

**P3** · MISSING · effort M · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** ChatGPT's Plugins settings expose a global 'Allow low-risk actions' default; single-product.

**Ours.** Grepped apps/web/features/settings for 'low-risk'/'Allow low-risk'/plugin-permission language: zero hits in any settings section.

**Recommendation.** If per-plugin approval friction becomes a user complaint, add one account-wide default-approval setting rather than requiring per-tool configuration.

### `settings-22-gap` — No unified named settings destination for cloud + local compute access

**P3** · MISSING · effort M · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Manus's 'My Computer' page has co-equal Cloud computer / Local computer tabs; single-product.

**Ours.** Desktop's Computer Use capability settings and the Connections tab's local-machine pairing (MobileCompanionPanel) exist as separate, differently-named settings destinations; no single page frames them as peer tabs of one 'computer' concept.

**Recommendation.** Consider co-locating Computer Use (cloud/sandbox execution) and local-machine pairing under one named settings destination for discoverability, without merging their genuinely different trust models.

### `settings-29-gap` — No configurable safety fallback (switch model vs. pause) when a message is flagged

**P3** · MISSING · effort M · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude's 'Switch models when a message is flagged' toggle lets users choose auto-switch vs. pause; single-product.

**Ours.** SafetySection.tsx (157 ln total) has exactly one toggle ('Reduce sensitive content') with a closing disclaimer that it 'does not monitor conversations, notify another person, or replace emergency services.' No model-switch-on-flag or pause-on-flag control exists in Safety or Capabilities settings.

**Recommendation.** If Managed Cloud ever implements per-message safety flagging with a fallback-model mechanism, expose the auto-switch-vs-pause choice as a setting at that point; not urgent ahead of the underlying flagging mechanism existing.

### `shell-nav-ia-gap-05` — Chat titling is single-stage (raw truncated prompt, permanent) rather than ChatGPT's two-stage placeholder-then-LLM-cleanup pattern

**P3** · MISSING · effort M · NEW · _Shell, global nav, IA & design system_

**Benchmark.** ChatGPT shows an instant placeholder title (truncated first prompt) that is silently replaced moments later by a shorter, LLM-generated title -- design-system.md.

**Ours.** apps/web/features/chat/pages/WebChatPage.tsx:3132-3145 -- the only auto-title logic fires once when the second message arrives and sets title = firstUser.content.trim().slice(0, 60), permanently. No title-generation API route exists: apps/web/app/api/chat/conversations/route.ts only persists whatever body.title a caller supplies, never derives one via LLM.

**Recommendation.** Add a background job/endpoint that generates a short title from the first exchange and PATCHes the conversation title after the fact, matching the existing pattern used for other async post-processing in the codebase.

### `G7` — No opt-in 'notify me when done' control during an active run

**P3** · FIXED · effort M · NEW · _Web Search & Deep Research_

**Benchmark.** Claude shows a 'Want to be notified when Claude responds? [Notify]' bar while Research is processing

**Ours.** Grepped apps/web/features/chat for 'notify'/'Notify' in any research-adjacent component -- zero hits.

**Recommendation.** Low priority, single-product. If a notification system already exists for other long-running tasks (e.g. video generation), extend it to research runs rather than building a parallel mechanism.

### `G11` — No source-scoping or file-attachment controls specific to the Deep Research composer

**P3** · FIXED · effort M · CONFIRMS_PRIOR (`SEARCH-RESEARCH-003 (supporting evidence only, not the same claim)`) · _Web Search & Deep Research_

**Benchmark.** Gemini's Deep-Research-active composer shows 'Sources' (scope restriction) and 'Files' (attach local files as research input) buttons -- though Gemini's own behavior here is itself UNVERIFIED in the source benchmark

**Ours.** No domain-allowlist/scoping mechanism found in research-loop.ts or web-search-tool.ts; prior audit's SEARCH-RESEARCH-003 (research-loop.ts:953-966) independently confirms every client tool except url_fetch is stripped before gathering rounds, so even ordinary attachment/connector tools are unavailable once a run's gathering phase starts; no Sources/Files buttons specific to an active Deep Research composer state were found in ChatComposerNew.tsx.

**Recommendation.** Low confidence on both sides (benchmark itself flags this unverified). If pursued, extend research-loop.ts's tool filter to accept a user-supplied domain allowlist and read-only connector tools together (same change recommended for SEARCH-RESEARCH-003).

### `agentic-modes-gap-15` — Usage ledger is bucket-based/aggregate, not an itemized per-task debit ledger

**P3** · PARTIAL · effort L · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Manus provides a credit-based, itemized per-task debit ledger with sub-category breakdowns (Tasks/Websites/Computers).

**Ours.** Real usage/billing infrastructure exists (managed-usage-accounting-service.ts, /api/billing/overage, /api/billing/top-up, and per the git history a recently finished overage/headroom/opt-in-toggle feature set), but it is bucket-based (session/weekly/weeklyFlagship/period — same buckets as agentic-02/03) and aggregate, not an itemized per-task debit ledger; /api/usage/history's own doc comment states 'Managed subscription ledger rows are private; exact Stripe invoice and top-up history use their billing routes' (':14-15'); /settings/usage renders 'credit bars, analytics' (apps/web/app/settings/usage/page.tsx:4-5) — summary-level, not itemized-by-task with sub-category breakdowns.

**Recommendation.** If pursued, build itemized per-task debit rows on top of the existing bucket-based accounting service rather than replacing it, since the bucket model itself may be a deliberate design choice (see agentic-02); this is a SINGLE_PRODUCT Manus differentiator, not an urgent gap. [severity inferred by recovery pass]

### `ART-CANVAS-03` — No product-level 'frontend design' skill is wired into artifact generation, so named-skill narration cannot occur even though the display mechanism exists

**P3** · BUILT_NOT_WIRED · effort L · NEW · _Artifacts, canvas & generative UI objects_

**Benchmark.** Claude's transcript names the specific internal skill auto-invoked before building UI (e.g. '📋 Loaded frontend-design skill') (claude-artifacts-findings.md).

**Ours.** Display link exists and is generic: apps/web/features/chat/components/messages/ToolTimeline.tsx humanizeToolName (lines 145-196) falls through to a tool's real name for anything unmapped, and getToolIcon (lines 61-104) has a dedicated BookOpen glyph for any tool name containing 'skill'/'learn' explicitly citing the Claude reference. Missing link: no product-shipped SKILL.md for design/UI work was found anywhere under the repo outside dev-tooling (.agents/skills/*, which are Claude Code environment skills, not product skills) or IDE-extension test fixtures (apps/extension-vscode/.vscode-test/**) — grep for SKILL.md excluding those turned up none for a design/frontend skill. The real product skill runtime exists (packages/tools/skills, apps/web/lib/services/skill-catalog-service.ts) but nothing evidences the artifact-generation code path auto-selecting a named UI-design skill to feed that display.

**Recommendation.** If a bundled 'frontend design' (or similar) skill is wanted to match this Claude behavior, author it under the product skill catalog (not .agents/skills, which is Claude Code tooling) and have the system prompt/tool-selection logic for HTML/React artifact generation prefer it when available; the transcript display path already renders whatever name comes through, so this is purely a generation-flow + skill-catalog wiring task, not a UI task.

### `ART-CANVAS-05` — No one-click transform of a completed research report into derivative formats (web page/infographic/quiz/flashcards/audio)

**P3** · MISSING · effort L · NEW · _Artifacts, canvas & generative UI objects_

**Benchmark.** Gemini's Deep Research completed-report panel offers a 'Create' menu producing Web page/Infographic/Quiz/Flashcards/Audio Overview or a custom app.

**Ours.** Grepped apps/web/features/chat/components/research/ResearchReportView.tsx, ResearchPanel.tsx, ResearchActivity.tsx for infographic/flashcard/quiz/'audio overview'/a Create-transform menu: zero hits in any file.

**Recommendation.** Single-product Gemini differentiator; not worth building ahead of table-stakes gaps elsewhere. If prioritized later, the cheapest slice is a 'Turn into artifact' action on ResearchReportView that re-prompts the model to restructure the existing report content as an HTML artifact (reusing the existing artifact-generation path), before investing in audio/quiz-specific pipelines.

### `ART-CANVAS-06` — Image editing is inline-in-chat only; no full-page editor and no pinned-annotation edit targeting

**P3** · PARTIAL · effort L · NEW · _Artifacts, canvas & generative UI objects_

**Benchmark.** ChatGPT's image editor is a full-page dedicated surface with a pin-an-annotation-on-the-image edit-location feature, 5 aspect-ratio presets, and a natural-language 'Describe edits' composer.

**Ours.** apps/web/features/chat/components/ImageGenerationCard.tsx already has a real natural-language edit composer (editText state, lines 367-424, wired to onRegenerate) and a per-model aspect-ratio dropdown (getImageAspectOptionsForModel/normalizeImageAspectRatioForModel, lines 478-488) — but it renders inline in the chat message, not as a full-page surface, and grepping the file for pin/annotation/comment (image-location-targeting) returns no hits.

**Recommendation.** The natural-language edit loop already exists and is the harder half of this; a full-page surface is a layout change reusing the same editText/regenerate logic. Pinned-annotation targeting (click a point on the image to scope an edit) is the genuinely new work and should be scoped separately, lower priority given SINGLE_PRODUCT convergence.

### `CLR-06` — No user-clickable 'Run' affordance on a plain Python (or any language) code block in chat — only Copy exists in the shared code-block header

**P3** · MISSING · effort L · NEW · _Composer, chat lifecycle & message rendering_

**Benchmark.** ChatGPT: clicking '> Run' on a Python code block in plain chat opens a two-pane editor+console side panel with its own Run/copy-console/clear controls (01-chatgpt/chat-lifecycle.md)

**Ours.** packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:24-70 (CodeBlock) renders only a Copy button in the header bar for any language — no Run affordance, no language-specific branch. CodeExecutionBlock.tsx (apps/web/features/chat/components/messages/CodeExecutionBlock.tsx) is a different mechanism: it renders the OUTPUT of a code-execution tool call the model already initiated as part of an agentic 'Run code' turn, not a user-triggered Run button on an arbitrary markdown code fence.

**Recommendation.** Low priority — single-product ChatGPT differentiator, and building a real sandboxed two-pane execution panel is a substantial infra investment (see composer-21's sandbox-provisioning question, unverified here). Track separately from the existing agentic 'Run code' toggle, which already covers the model-initiated case.

### `CLR-08` — No end-of-answer horizontal source-card carousel with OpenGraph-style hero images; the closest equivalent is a toggle-triggered side panel with small favicons

**P3** · PARTIAL · effort L · CONFIRMS_PRIOR (`audit/parity-2026-08-15/gaps/domain-rendering.json RENDERING-008`) · _Composer, chat lifecycle & message rendering_

**Benchmark.** ChatGPT renders a horizontal row of rich source cards with full-bleed hero images, publisher favicon/name, headline, and timestamp at the end of a web-search answer; clicking opens a new tab (01-chatgpt/composer.md)

**Ours.** apps/web/features/chat/components/research/ResearchPanel.tsx:27-98 (SourceRow) — favicon (16px) + title + hostname + snippet in a vertical list inside a toggle-triggered right-side panel, not an inline end-of-answer horizontal carousel, and no hero/OpenGraph imagery anywhere in the file. It does match the 'opens in a new tab' behavior (source.url target="_blank", :52-55).

**Recommendation.** Single-product ChatGPT differentiator; low priority relative to CLR-07/RENDERING-008's richer-popover fix, which would deliver more value for the same investment. If pursued, add hero-image cards as a distinct end-of-message row rather than reworking ResearchPanel.

### `CPS-09` — No self-serve non-MCP 'Custom API' connector authoring path

**P3** · MISSING · effort L · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Manus's 'Create' dropdown offers 'Custom API' as a distinct non-MCP connector-creation mechanism (07-manus/02-plugins-connectors-skills.md)

**Ours.** Grepped apps/web for 'Custom API', customApi, custom_api, 'REST API connector': one unrelated comment hit in request-processor.ts, no feature. Every self-serve connector-authoring path (ConnectorsPage.tsx InspectMcpServerDialog) requires the target to speak MCP.

**Recommendation.** Lowest priority in this domain (single-product Manus differentiator) — would require a new request-templating/auth-storage/execution subsystem independent of the existing MCP path; only worth pursuing if user demand for non-MCP API integration is demonstrated.

### `CPS-12` — No dedicated top-level 'data source' category distinct from action-taking connectors

**P3** · MISSING · effort L · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Manus has a peer 'Data sources' category alongside Connectors and Skills (07-manus/02-plugins-connectors-skills.md)

**Ours.** apps/web/features/connectors/data/connectors.ts categories (grep -o "category: '[^']*'" | sort -u): AI, Cloud, Communication, CRM, Data, Design, Developer, Exclusive, Finance, Healthcare, Marketing, Productivity, Social, Storage — all sub-filters within one flat 'Connectors' bucket in DirectoryBrowse's category select, not a peer top-level taxonomy entry.

**Recommendation.** Single-product Manus differentiator; only worth pursuing as part of a broader connector-taxonomy rework, not in isolation.

### `CPS-15` — No star-rating display and no underlying custom-assistant/GPT-equivalent object

**P3** · MISSING · effort L · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** ChatGPT's GPT Store shows a star rating per listing (04-cross-product-comparison/05-connectors-plugins-skills.md)

**Ours.** No custom-assistant-object route or feature found anywhere in apps/web (grepped for custom-assistant, CustomGPT; browsed apps/web/app for an assistant-builder route). The gap is one level below the rating widget itself — there is no object in the product for a rating to attach to.

**Recommendation.** Not actionable in isolation; would only become relevant if/when this product builds a custom-assistant-object primitive (its own multi-claim decision, out of scope for this domain's fixes).

### `CPS-18` — No user-configurable network-egress domain allowlist for sandboxed skill/code execution

**P3** · MISSING · effort L · NEW · _Connectors, plugins, skills, MCP & custom assistants_

**Benchmark.** Claude's Capabilities tab exposes an 'Allow network egress' toggle with a domain allowlist defaulting to 'Package managers only' plus a free-text escape hatch (02-claude/settings.md)

**Ours.** apps/desktop/src/lib/egressGuard.ts is a real control but enforces a different boundary (whether Local-mode may talk to AGI's own cloud at all), not a per-sandbox outbound-domain allowlist. Grepped apps/web/lib/e2b (the sandboxed code-execution path) for any domain-allowlist concept: none found.

**Recommendation.** Single-product Claude differentiator; would require a real sandbox network-policy engine plus UI, not a small fix — only worth prioritizing if a concrete egress-abuse incident in the E2B sandbox path motivates it.

### `MEDIA-IMG-04` — No object/background-removal tool in the image editor

**P3** · MISSING · effort L · CONFIRMS_PRIOR (`VOICE-MEDIA-008`) · _Image, video & voice generation_

**Benchmark.** ChatGPT's image editor toolbar has an icon-only Remove tool, inferred (Low-Medium confidence, not tested) to remove an object or background (01-chatgpt/images-media.md, media-09)

**Ours.** apps/web/features/chat/components/ImageGenerationCard.tsx EditPanel toolbar (462-538) contains only Aspect ratio / Share / Download controls. Root cause matches prior VOICE-MEDIA-008: the server accepts operation/source_image/mask_image (packages/contracts/cloud-contracts/src/managed-media.ts:81-121) but ImageGenerationCard.tsx's own comment (18-20) states no web client sends those fields.

**Recommendation.** Deferred behind the same region/mask-editing slice VOICE-MEDIA-008 already recommends; a removal tool would be a client of that same source_image/mask_image path once built.

### `MEDIA-COMMENT-05` — No pinned-comment-to-edit annotation entry point in the image editor

**P3** · MISSING · effort L · NEW · _Image, video & voice generation_

**Benchmark.** ChatGPT's editor has a 'Comment' tool (NEW badge) letting a user click a point on the image to anchor a subsequent edit (01-chatgpt/images-media.md, media-06)

**Ours.** Grepped comment|annotat|pin across apps/web/features/chat/components/ImageGenerationCard.tsx — zero relevant hits.

**Recommendation.** Not urgent; single-product ChatGPT differentiator whose own downstream edit-scoping behavior was not even confirmed by the benchmark researchers. Revisit alongside real region/mask editing (VOICE-MEDIA-008) since a pinned comment would naturally anchor a mask.

### `MEDIA-TMPL-08` — No template-gallery landing page for video (or image) generation

**P3** · MISSING · effort L · NEW · _Image, video & voice generation_

**Benchmark.** Gemini's 'Create videos' landing page shows a gallery of 9+ clickable starter-template thumbnails ahead of the freeform composer (03-gemini/media-generation.md, media-15)

**Ours.** Grepped 'template' across apps/web/features/chat/components/Composer/ChatComposerNew.tsx, ImageGenerationCard.tsx, and VideoGenerationPlaceholder.tsx — only unrelated hits (custom slash-command templates, ChatComposerNew.tsx:421,1333-1348). No landing page or gallery exists; the only on-ramp is the composer mode toggle.

**Recommendation.** Low priority, single-product Gemini pattern requiring real curated-content work (template prompts + preview thumbnails), not a quick UI addition.

### `memory-08-gap` — No unified personalization hub — memory, capabilities, reflect, and instructions are five separate flat settings nav entries

**P3** · MISSING · effort L · NEW · _Memory & personalization_

**Benchmark.** Gemini consolidates Memory, Daily Brief, Connected Apps, and Instructions into one 'Personal Intelligence' hub reached from a single gear menu entry (03-gemini/memory-and-personalization.md).

**Ours.** packages/ui/ui/src/settings-nav.ts:143-145 (capabilities), :161 (connectors), :175 (memory), :297 (reflect) are flat sibling entries in SETTINGS_NAV_GROUPS_WEB (lines 279-303) with no parent grouping — our fragmentation is measurably wider than even ChatGPT/Claude's two-section split.

**Recommendation.** Group Memory, Capabilities' memory toggles, and Reflect under a single 'Personalization' nav parent with sub-items, without merging their distinct data models.

### `memory-09-gap` — No forward-looking 'Daily Brief' (Reflect is a retrospective usage recap, not a day-ahead schedule/tasks brief)

**P3** · DIFFERENT_BY_DESIGN · effort L · NEW · _Memory & personalization_

**Benchmark.** Gemini's sidebar 'Daily Brief' is powered by a Personal Intelligence card with its own toggle, showing 'your schedule, tasks, and more' for the day ahead (03-gemini/memory-and-personalization.md).

**Ours.** apps/web/features/settings/sections/ReflectSection.tsx:100-255 is memory-gated (409 memory_required renders a prompt to enable Memory, lines 147-161) but shows backward-looking stats (past 30/90/180/365 days of conversation counts, peak hours) — a different capability that happens to share the memory-gating pattern, not a competing implementation of the same feature.

**Recommendation.** If a forward-looking brief is wanted, build it as a distinct feature (schedule/tasks/upcoming) rather than repurposing Reflect, which serves a genuinely different retrospective use case well.

### `memory-11-gap` — No 'Connected Apps' personalization layer distinct from chat memory

**P3** · MISSING · effort L · NEW · _Memory & personalization_

**Benchmark.** Gemini's Personal Intelligence hub has a 'Connected Apps' card letting users opt connector insights into personalization, separate from the Memory toggle (03-gemini/memory-and-personalization.md).

**Ours.** Grepped 'personaliz' across every apps/web/features/settings/sections/*.tsx file — zero hits outside an unrelated theme-search keyword comment. The 'connectors' settings section (settings-nav.ts:161) handles connection/auth only.

**Recommendation.** Add an opt-in toggle on the Connectors settings page letting connector data feed personalization/memory, separate from the chat-memory toggle.

### `G5` — No named higher-usage seat SKU within the Team plan

**P3** · MISSING · effort L · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** Claude Team offers a named 'Premium seat' ($100/seat/mo, 5x usage) mixable with Standard seats in the same org.

**Ours.** packages/contracts/types/src/billing-catalog.ts:227-249 (Team entry) and isPerSeatBillingPlan/normalizePurchasableSeats (lines 142,167) model exactly one uniform $25/seat SKU; no second seat type exists anywhere in the checkout/member-management path.

**Recommendation.** If pursued, add a seat-type dimension to Team checkout and member management (a new SKU alongside Standard), not a retrofit of the existing single-SKU seat count.

### `G6` — No self-serve Enterprise checkout path

**P3** · MISSING · effort L · NEW · _Models, reasoning controls, quotas, pricing &amp; entitlements_

**Benchmark.** Claude offers 'Enterprise (self-serve)' with a Create plan button alongside sales-assisted Enterprise; ChatGPT is sales-only like us.

**Ours.** apps/web/app/pricing/page.tsx:856-887 — the Enterprise card's only CTA is contactSalesCta -> /contact-sales; no self-serve alternative exists anywhere in the pricing flow.

**Recommendation.** Single-product Claude differentiator (not majority convergence); low priority unless self-serve enterprise volume becomes a stated goal.

### `sched-gap-03` — No dual conversational-vs-manual creation path anywhere

**P3** · MISSING · effort L · NEW · _Scheduled tasks & automation_

**Benchmark.** Claude offers an explicit 'Create with Claude' (conversational) vs. 'Set up manually' (form) choice at creation time (02-claude/scheduled-tasks.md)

**Ours.** apps/web/features/schedules/components/SchedulesPage.tsx only opens ScheduleForm.tsx (a raw form); mobile's QuickSchedule.tsx is a rule-based NL parser, not a conversational AI flow, and is a separate control rather than an explicit mode picker.

**Recommendation.** Low priority given single-product source; if pursued, expose 'Describe it' vs 'Fill out the form' as an explicit choice rather than two disconnected controls.

### `sched-gap-10` — Citations render as a block of pills below the message, not inline hyperlinks woven into prose

**P3** · PRESENT_WORSE · effort L · NEW · _Scheduled tasks & automation_

**Benchmark.** Gemini embeds citations as underlined clickable source names directly inside sentences (03-gemini/spark-task-lifecycle.md; 04-cross-product-comparison/03-scheduled-tasks-and-automation.md)

**Ours.** packages/ui/unified-chat/src/components/MessageBubble.tsx:793-797 renders message.citations as a separate row of CitationPill buttons (packages/ui/unified-chat/src/components/CitationPill.tsx) below the markdown-rendered message body — a favicon+domain pill list, not inline hyperlinks inside sentences. Scheduled /chat/schedules runs cannot produce citations at all since they have no tool access (see AGENTIC-WORK-007), so this only applies to /tasks / interactive chat runs that call web search.

**Recommendation.** This is a broader chat-rendering decision, not schedules-specific; if pursued, it belongs with the rendering/citations domain rather than as a scheduling fix.

### `settings-04-gap` — No scoped, per-session authorization-token table; only dev API keys are scoped

**P3** · PARTIAL · effort L · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Claude Code's Authorization Tokens table lists each active sign-in with named, individually revocable scopes; single-product.

**Ours.** AccountSection.tsx:564 active-sessions table columns are Device/Location/Created/Last active - no Scopes column. Scoped access exists only for developer API keys via ApiKeysManager (apps/web/features/settings/components/Settings/ApiKeys.tsx:145-147,229, API_KEY_SCOPE_OPTIONS), a different authorization surface from signed-in client/session scopes.

**Recommendation.** If session-level scope differentiation becomes meaningful (distinct scopes for mobile-companion vs web vs CLI sign-ins), extend the existing sessions table with a Scopes column rather than building a parallel mechanism.

### `settings-23-gap` — Dev console inside the consumer modal covers API keys but not user-facing webhooks

**P3** · PARTIAL · effort L · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Manus's Developers tab, inside the consumer settings modal, has both API keys and Webhooks sub-tabs; single-product.

**Ours.** ApiKeysManager renders directly inside AccountSection.tsx (:20,340), the same modal used for General/Appearance - matching Manus's placement. Grepped every settings component/section for 'Webhook'/'webhook': zero hits for a user-facing webhook-management UI. Existing webhook code (app/api/github/webhook, app/api/stripe-webhook, db/neon/0106_github_webhook_deliveries.sql) is inbound backend integration plumbing, not a user-creatable webhook console.

**Recommendation.** If user-facing webhooks (e.g. automation triggers) become a roadmap item, add a Webhooks sub-tab next to the existing in-modal API Keys manager rather than a separate developer portal.

### `settings-24-gap` — No centralized Deployments/Domains surface; closest analog lacks custom-domain mapping

**P3** · PARTIAL · effort L · NEW · _Settings taxonomy & permission/approval architecture_

**Benchmark.** Manus's Deployments settings has Websites/Apps/Domains sub-tabs with custom-domain mapping; single-product.

**Ours.** PublishedArtifactsSection.tsx (280 ln) gives a real centralized 'what's public' list with revoke/unpublish (own header comment: 'no expiry... so Unpublish here is the only way a page ever comes down'), but has no custom-domain mapping and no Websites/Apps/Domains sub-tab structure.

**Recommendation.** PublishedArtifactsSection is the right foundation to extend with custom-domain mapping if that capability ships, rather than building a separate Deployments page from scratch.

### `G6` — No dedicated live narration panel with titled prose sub-sections ('Show thinking' style)

**P3** · DIFFERENT_BY_DESIGN · effort L · NEW · _Web Search & Deep Research_

**Benchmark.** Gemini opens a separate side panel with a 'Show thinking' toggle showing titled, italicized, first-person prose sub-sections filling in in real time

**Ours.** ResearchActivity.tsx gives phase labels + a plan-step queue (real narration, see strengths) but nothing structurally equivalent to Gemini's titled multi-paragraph prose panel; ResearchPanel.tsx's Sources/Report tabs are data display, not a running narrative log.

**Recommendation.** Low priority, single-product differentiator. If pursued, the planning/gathering turns already produce natural-language reasoning that could be streamed into a titled side panel rather than only distilled into the compact ResearchActivity header.

### `G9` — No direct export to a connected productivity suite (e.g. Google Docs)

**P3** · MISSING · effort L · NEW · _Web Search & Deep Research_

**Benchmark.** Gemini's 'Share & Export' menu includes a direct 'Export to Docs' push, distinct from raw file download

**Ours.** ResearchReportView.tsx EXPORT_FORMATS is limited to Markdown/PDF/Word local download via documentExportService; a Google Drive connector entry exists in the catalog (apps/web/lib/connectors/catalog.ts, apps/web/features/connectors/data/connectors.ts) but no write-scoped Docs/Drive export path was found.

**Recommendation.** Low priority -- see notWorthCopying. If pursued, build a generic 'export to connected storage' path using the existing connector catalog rather than a Docs-specific integration.

### `agentic-modes-gap-09` — No execution-environment picker (local vs. cloud vs. remote-paired)

**P3** · DIFFERENT_BY_DESIGN · effort XL · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Claude unifies local machine, cloud sandbox, and remotely-paired local machine into one composer-level execution-environment picker.

**Ours.** No composer anywhere in the repo lets a user choose, within one session, between a local machine, a cloud sandbox, and a remotely-paired local machine; consistent with, and mostly explained by, the repo's explicit trust-boundary separation (Local/BYOK/Managed Cloud as different apps: CLI/Desktop vs. Web, per CLAUDE.md).

**Recommendation.** Do not literally merge Local/BYOK/Managed Cloud into one composer dropdown — that would cut against CLAUDE.md's trust-boundary rule. If closed at all, frame it as 'let a user explicitly pair/select a remote-controlled local machine from within a Managed Cloud session, with the same consent flow CLAUDE.md already requires for Local→BYOK forks' rather than a unified picker. [severity inferred by recovery pass]

### `agentic-modes-gap-13` — No agent deployment to external messaging platforms as a first-class tier

**P3** · MISSING · effort XL · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Manus offers a dedicated 'Agent' landing page/tier to deploy a branded, persistent agent identity onto external messaging platforms.

**Ours.** Grepping the whole web app for Telegram/Slack/WhatsApp 'deploy an agent' surfaces only finds Telegram/Slack as inbound connector catalog entries (data sources the agent can read from — apps/web/features/connectors/data/connectors.ts), never an outbound 'deploy a branded, persistent agent identity onto this platform' flow; no dedicated nav item, page, or service resembling Manus's 'Agent' landing page exists.

**Recommendation.** Treat as a roadmap idea rather than an urgent gap (per the doc's own severity framing) — a genuine new product surface (outbound agent deployment to messaging platforms), distinct from the existing inbound connector catalog. [severity inferred by recovery pass]

### `agentic-modes-gap-16` — No named settings destination for a cloud + local 'agent computer'

**P3** · DIFFERENT_BY_DESIGN · effort XL · NEW · _Agentic modes: Work / Cowork / Codex / Spark / Manus Agent_

**Benchmark.** Manus provides a single 'My Computer'-style settings page unifying local and cloud computer settings.

**Ours.** No 'My Computer'-style settings page exists anywhere (web, desktop, or mobile); substantially explained by the repo's trust-boundary separation — 'local computer' and 'cloud computer' are not two tabs of one setting here, they are two different apps (Desktop vs. Web) by explicit architectural rule.

**Recommendation.** Do not clone Manus's single-settings-page model, which would collapse the Local/Managed Cloud trust boundary CLAUDE.md requires; if a unified view is wanted, it should surface both sides without merging the underlying trust boundaries or consent flows. [severity inferred by recovery pass]

### `ART-CANVAS-07` — No dedicated top-level video-generation surface (nav item, specialized composer, template gallery); video generation is chat-prompt-triggered only

**P3** · PARTIAL · effort XL · NEW · _Artifacts, canvas & generative UI objects_

**Benchmark.** Gemini has a dedicated top-level 'Videos' nav item with its own composer (aspect ratio, image-attach, model picker) and a template gallery of 9+ example videos.

**Ours.** Video generation is real and functionally complete end-to-end: apps/web/app/api/media/video/{generate,status,cancel,openrouter-webhook}/route.ts, apps/web/lib/workflows/video-generation-workflow.ts, in-chat lifecycle UI (apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx elapsed-time counter; completion state 'Your video is ready!' with Download control at apps/web/features/chat/components/messages/MessageBubble.tsx:1586,1604). Missing: grepped apps/web/features/chat/v3/WebSidebar.tsx for 'Videos' — no nav entry; there is no dedicated composer or template gallery outside the main chat composer.

**Recommendation.** The underlying generation capability, job lifecycle, and completion UI already exist and work — this is a chrome/surface gap, not a capability gap. If prioritized, add a /videos route reusing the existing generation API and completion-state components rather than rebuilding the pipeline; treat as lower priority than table-stakes gaps given SINGLE_PRODUCT convergence and XL effort to build a full template gallery.

### `legal-trust-07` — Consumer Terms/Privacy are a single worldwide document with no EEA/UK/Switzerland variant

**P3** · MISSING · effort XL · NEW · _Legal, policy, trust & data-control surfaces_

**Benchmark.** OpenAI's Terms of Use is explicitly labeled 'Rest of World' with confirmed separate EEA/UK/Switzerland versions. Source: 01-chatgpt/legal-and-policies.md.

**Ours.** apps/web/lib/legal-constants.ts:40 fixes GOVERNING_LAW to Texas with no regional branch; apps/web/app/terms/page.tsx and privacy/page.tsx read as single global documents (full read, no conditional-by-region rendering found). Honestly disclosed rather than hidden: terms/page.tsx:585-591 states plainly no EU/UK/India data residency is offered. The DPA (apps/web/app/dpa/page.tsx:400-430) does carry GDPR/UK-Addendum/Swiss-SCC transfer mechanics for enterprise customers.

**Recommendation.** Low priority — single-product ChatGPT differentiator, not table stakes per the claim itself, and a regional ToS variant with no matching regional data-residency infrastructure would overstate a commitment AGI doesn't yet meet. Revisit only if/when EU/UK data residency becomes a real product commitment.

### `memory-06-gap` — No recording/transcript memory corpus independent of chat memory

**P3** · MISSING · effort XL · NEW · _Memory & personalization_

**Benchmark.** ChatGPT has a distinct 'Record mode' section with a 'Reference record history' toggle gating a separate transcript-based memory corpus (01-chatgpt/memory.md, itself flagged UNVERIFIED by the source research for its capture entry point).

**Ours.** Grepped 'record mode', 'recording transcript', 'audio.*memory' across apps/web and apps/mobile — no hits beyond dictation (speech-to-text composer input) and TTS (read-aloud) code, neither of which stores or recalls transcripts as memory.

**Recommendation.** Not recommended as a near-term priority — see notWorthCopying; the competitor feature itself is unverified in the source research.

### `PROJ-WS-06` — Connector-backed project sources (Google Drive, Slack) are not actually bindable to a project -- buttons route to a generic account-level settings page

**P3** · MISSING · effort XL · NEW · _Projects, workspaces, notebooks & file knowledge_

**Benchmark.** ChatGPT's project Sources tab empty state previews Slack/Drive/file-upload icons alongside 'Add sources', implying connector-backed sources bind to the project as ongoing knowledge (STRONGLY_INFERRED, not exercised end-to-end even by the benchmark researchers). SINGLE_PRODUCT (ChatGPT), tableStakes=false. Source: 01-chatgpt/projects.md.

**Ours.** apps/web/features/projects/components/AddSourcesModal.tsx:1-20 (header comment) and :152-155,307-323: Google Drive and Slack buttons call handleConnectorRoute('/connectors'), which closes the modal and navigates to the fully generic, account-level /connectors page. Grepped apps/web/app/connectors and apps/web/features/connectors for 'project' -- no hits outside unrelated words, confirming zero project-scoping code exists on that surface. The component's own comment states: 'We do NOT have a Drive import pipeline; this is an explicit "Connect in Settings" affordance.'

**Recommendation.** Low priority given the benchmark evidence itself is only strongly-inferred (not confirmed working even in ChatGPT) and this is a single-product, non-table-stakes claim. If pursued, build a real Drive/Slack source-binding pipeline that ties a live connector to a specific project.id as an ongoing (re-fetchable) knowledge source, rather than a one-time import -- substantial new surface, hence XL effort.

### `settings-10-gap` — No trusted-contact crisis-notification feature - correctly declined by design

**P3** · DIFFERENT_BY_DESIGN · effort XL · CONFIRMS_PRIOR (`GAP-044 (mobile domain, cited in domain-settings.md) - already correctly declined.`) · _Settings taxonomy & permission/approval architecture_

**Benchmark.** ChatGPT can automatically notify a user-designated trusted contact on detected self-harm risk; single-product.

**Ours.** SafetySection.tsx's own UI copy states the product 'does not monitor conversations, notify another person, or replace emergency services.'

**Recommendation.** Do not build this without the clinical-risk-classification, contact-verification, and legal infrastructure the real feature requires; current explicit-decline UI copy is correct and should be preserved, not treated as a backlog item to eventually close.

### `G3` — No mid-flight steering of an active research run (no plan edit-in-place, no quick-answer redirect)

**P3** · MISSING · effort XL · NEW · _Web Search & Deep Research_

**Benchmark.** ChatGPT accepts a scope-modifying instruction mid-run and updates the plan in place with a narrated acknowledgment; Claude shows a 'Quick answer' pill that redirects a running Research task to an immediate non-researched answer

**Ours.** WebChatPage.tsx:4238 passes isGenerating={isStreaming} to the composer (Send becomes Stop while streaming); multiple send-path handlers early-return on isStreaming (WebChatPage.tsx:2617,3403,3437,3519,3584); the only interrupt during a research run is handleStopGeneration, a full cancel (useChatStream.ts:1826-1832), not a redirect.

**Recommendation.** Architectural change to the send path (out of scope for a quick fix): would require accepting a scoped follow-up while a turn streams and routing it into the active loop rather than blocking on isStreaming. Lower-cost partial win: add a 'Quick answer' style interrupt that reuses the existing Stop plumbing but asks for an immediate synthesis instead of a hard cancel.

### `G8` — No one-click derivative-format ('Create') menu on a completed report

**P3** · MISSING · effort XL · NEW · _Web Search & Deep Research_

**Benchmark.** Gemini offers a 'Create ▾' menu converting a report into Web page/Infographic/Quiz/Flashcards/Audio Overview or a custom app

**Ours.** Grepped repo-wide for 'Audio Overview'/'Flashcards' -- no hits outside unrelated keyboard-shortcut naming; no Create menu in ResearchReportView.tsx.

**Recommendation.** Not recommended near-term -- see notWorthCopying. If pursued later, scope to the cheapest single format (e.g. a slide/web-page export) rather than all five at once.

---

## Where we match or beat all four benchmarked products

### Agentic modes: Work / Cowork / Codex / Spark / Manus Agent

- Proactive, named, threshold-based usage warning that beats ChatGPT's own documented quota-cliff failure mode: persistent sidebar usage widget (WebChatPage.tsx:1050-1062, showUsageWidget/budgetPercent on Sidebar, driven by getWorstUsagePercent(managedUsageSummary)) plus a proactive warning banner via selectUsageWarning() (packages/contracts/types/src/usage-vocabulary.ts:139-207, :177-207) that fires at USAGE_WARNING_REMAINING_PERCENT = 25 (75% used) and escalates to severity: 'critical' at USAGE_CRITICAL_REMAINING_PERCENT = 10 (90% used) (usage-vocabulary.ts:143,146,194,199); code comments at WebChatPage.tsx:1063-1069 state this exists specifically to prevent the 'first signal was a refused message mid-task' failure mode documented for ChatGPT Work. See agentic-03.
- Catalog-driven, per-model reasoning/effort control that avoids ChatGPT's own internal inconsistency across surfaces: ComposerFooter.tsx:74-129 (reasoningFor(model) reads each model's reasoning block; effortChipsFor(reasoning) renders only supported effort marks) coexisting with a model picker (ChatComposerNew.tsx:3135-3136); independently confirmed by prior audit's domain-composer.md:73,93,115-124. See agentic-15.
- Icon-differentiated live step-by-step activity narration ahead of Gemini's binary clock-vs-G-icon scheme: AgentActivityTimeline.tsx renders a Clock3 icon (:348) alongside a BrainCircuit icon (:458) and per-tool icons parsed from the qualified MCP tool name (per prior audit's domain-extensibility.md:81); the dynamically-updating heading text was not independently verified live and is recorded as unverified, not asserted. A richer desktop-ported StatusTrail.tsx (thinking/searching/coding/running/completed/error vocabulary, StatusTrail.tsx:24-58) exists but has zero import sites under apps/web/features/chat — dead code, superseded by AgentActivityTimeline, not filed as a gap. See agentic-06.
- Self-serve custom remote MCP by URL, live-validated at save time, wired across Web/Desktop/Mobile — ahead of both ChatGPT and Claude, which per the benchmark research only offer vendor-curated integrations: apps/web/app/api/connectors/custom/route.ts (connectMcpServer called at save time so 'a saved row is known-good at save time', :9-13; HTTPS-only with DNS-resolved-public-hostname validation via validateHttpsMcpUrl; encrypted-at-rest bearer tokens), wired to apps/web/features/connectors/pages/ConnectorsPage.tsx (POST /api/connectors/custom at :220); confirmed live on Desktop (apps/desktop/src/api/cloudConnectors.ts) and Mobile (AddCustomConnectorModal.tsx) per prior audit's domain-extensibility.md:79,84. See agentic-20 (the JSON-import variant specifically is filed as a gap).
- Real, working archive/delete separation on conversations: ConversationListItem.tsx:296-309 — a separate Archive/Unarchive DropdownMenuItem alongside Delete, backed by isArchived and a distinct onArchive handler, matching the claim's bar exactly. See agentic-10.
- A real, idempotent branch/fork-from-any-message backend, more sophisticated than a UI-only 'new task' button: apps/web/lib/services/conversation-branch-service.ts implements ForkConversationInput{sourceConversationId, messageId, requestId} with idempotent branch lookups (findIdempotentBranch) and caps (MAX_BRANCHES_PER_FORK = 50, MAX_FORK_POINTS_PER_CONVERSATION = 100); currently under-exposed in the UI (see agentic-17 gap).
- Live-polling /tasks surface that self-clears without a page refresh: TasksPage.tsx:80-81,342-348 self-reschedules its poll ('each successful poll schedules the next') — a real, working version of the benchmark's 'status disappears at completion' requirement, just not yet mirrored into the main chat sidebar (see agentic-04 gap).

### Artifacts, canvas & generative UI objects

- Publish is genuinely shipped end-to-end (not just UI-present): apps/web/app/api/artifacts/publish/route.ts (CSRF + rate limit + Zod + RLS) plus published_artifacts migration 0095 (forced RLS, owner-only) and a public render policy enforced in both app code and a DB CHECK constraint — confirmed shipped in docs/agent-context/known-flaws.md:396-411. The benchmark itself notes Claude's publish action was 'not exercised' in their research; ours is verified working.
- Cross-origin/null-origin sandboxed iframe rendering read directly from source: apps/web/features/chat/components/SandboxedIframe.tsx:16-24 (allow-scripts without allow-same-origin, window-identity auth) plus connect-src 'none' on published pages — more rigorously confirmed than the benchmark could get for any competitor.
- One unified artifact object model across 12 content types (html/react/svg/mermaid/code/document/spreadsheet/table/csv/presentation/email/image) through a single ArtifactPreview.tsx component (lines 96-119), avoiding ChatGPT's documented Run-panel/inline-app fragmentation (artifacts-15).
- Dedicated artifact-typed gallery with its own left-nav entry (WebSidebar.tsx:112, WebShellV3.tsx:33 -> /gallery), ahead of ChatGPT/Gemini's generic multi-type Library pattern described in artifacts-10.
- Version history with prev/next navigation and Restore directly in the panel header, ArtifactPreview.tsx:1177-1237 — not documented for ChatGPT at all in this benchmark pass.
- Accessible mobile artifact overlay: real role=dialog/aria-modal/focus-trap/Escape handling, ArtifactsPanel.tsx:308-362.

### Composer, chat lifecycle & message rendering

- State-differentiated composer placeholder text matching Claude's exact empty-state copy ('How can I help you today?') plus 3 additional internal states (turn-active/image-mode/video-mode) in one reused component — packages/ui/i18n/locales/en/chat.json:2,60, apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2258-2266
- Real, wired 3(+1)-state send/stop/queue button that actually aborts the stream on click, not a decorative icon swap — apps/web/features/chat/components/Composer/SendButton.tsx:1-114, ChatComposerNew.tsx:1950,1498-1499
- 7 named, catalog-driven reasoning-effort levels (None/Minimal/Low/Medium/High/xHigh/Max) vs ChatGPT's 3 (Instant/Medium/High) — packages/contracts/types/src/design-system/effort.ts:6-14
- Both thumbs-up and thumbs-down always visible by default in the response action row, matching Claude/Gemini's symmetric pattern rather than ChatGPT's asymmetric thumbs-down-only default — apps/web/features/chat/components/messages/MessageBubble.tsx:1838-1916
- A visible per-response branch/fork action via the '...' more menu — something Claude's own product lacks entirely per an open Anthropic GitHub issue cited in the prior audit's RENDERING-009 — MessageBubble.tsx:1977-1981
- A real right-hand research/sources panel with favicon+domain+snippet source cards and a live server-anchored elapsed timer, functionally close to ChatGPT's Activity panel despite a different trigger/file structure — apps/web/features/chat/components/research/ResearchPanel.tsx, ResearchActivity.tsx
- Combined Model+Effort single-chip picker reaches model change in 2 clicks (open+pick), beating ChatGPT's 4-click nested submenu and matching Claude's click economy while showing both values at a glance — apps/web/features/chat/components/Composer/ComposerFooter.tsx:779-816
- Composer '+' menu uses real section dividers grouping file-actions / Skills+Connectors / Research+web-search+Run-code, matching Claude's grouped pattern rather than ChatGPT's flat list — ChatComposerNew.tsx:2711-2712,2802-2803

### Connectors, plugins, skills, MCP & custom assistants

- Unified Directory-browse modal (packages/ui/ui/src/settings-modal/SettingsModal.tsx:444-826, DirectoryBrowse) reached from Skills/Connectors/Plugins panes — matches Claude's own referenced Directory design, with search/sort/filter, and an explicit code comment refusing to fabricate download counts or partner cards.
- Composer supports BOTH slash-command (ChatComposerNew.tsx:1264-1324, SlashCommandMenu.tsx:104-134) and @-mention (ChatComposerNew.tsx:2191-2229) skill invocation simultaneously, with live filtering — no single benchmarked competitor is documented having both.
- Real, live, self-serve MCP connector authoring: paste a URL + optional token, 'Inspect tools' really connects and lists advertised tools, then 'Add connector' persists it (apps/web/features/connectors/pages/ConnectorsPage.tsx:101-354, backed by apps/web/app/api/mcp/route.ts and apps/web/app/api/connectors/custom/route.ts) — matches or exceeds Manus's beta 'Add MCP by URL'.
- Plugin architecture genuinely decomposes into declared skills + required connectors at both the catalog-list level (inline skill chips, apps/web/app/plugins/page.tsx:163-171) and the detail level (apps/web/app/plugins/[id]/page.tsx:199-245), backed by real DB columns (apps/web/db/neon/0096_plugin_registry.sql) — more visible at the list level than Claude's count-column approach.
- Per-tool granular approval model (Always allow / Ask / Block) persisted in apps/web/features/connectors/stores/tool-permissions-store.ts and enforced server-side in apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2751-2813, with a dedicated public disclosure page at apps/web/app/agent-permissions/page.tsx — more granular than ChatGPT's or Claude's single toggle.
- Connectors auto-invoke without per-message selection: every connected connector's tools load into every chat turn automatically (apps/web/app/api/llm/v1/chat/completions/route.ts:419-466, loadUserConnectorToolCatalog), gated only by the per-tool permission verdict.
- Repeated, deliberate product-honesty discipline: refusing fabricated install/download counts (0096_plugin_registry.sql:12-14), refusing to show a Connect button known to fail (SettingsConnector.canConnect/statusLabel in packages/ui/ui/src/settings-modal/types.ts), refusing a fake per-conversation connector toggle (ChatComposerNew.tsx:2740-2745).

### Image, video & voice generation

- Real, catalog-sourced model pickers for both image and video generation (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3143-3207 image, :3211-3276 video) let users see and choose the actual backing model — stronger than Gemini's passive one-line model-name disclosure (media-10/media-16).
- Up to 12 named, per-provider-filtered aspect-ratio presets for image regeneration (apps/web/features/chat/lib/imageGenerationOptions.ts:52-64) versus ChatGPT's 5 (media-05).
- On-image hover controls (New version pill + Share button painted on the image, apps/web/features/chat/components/ImageGenerationCard.tsx:663-709) match the claimed ChatGPT pattern (media-03).
- Repeated, deliberate honest-capability-labeling pattern across this file family (ImageGenerationCard.tsx:11-21,565-568; ChatComposerNew.tsx:3115-3130) — regenerate-not-edit is disclosed in-UI rather than mislabeled 'Edit', and a prior stale-model-label bug is documented and fixed in code comments.
- Non-generic, honest in-progress copy for both image and video (with a code comment on VideoGenerationPlaceholder.tsx documenting a real prior accessibility-only-label bug that was caught and fixed).
- Video generation is fully wired end-to-end on Web (model/aspect/resolution/duration flow from UI state to the real request, ChatComposerNew.tsx:1659-1666, WebChatPage.tsx:2298-2632), unlike the prior audit's Desktop finding (VOICE-MEDIA-001) of video generation being entirely unreachable there.

### Legal, policy, trust & data-control surfaces

- Centralized legal-constants.ts (apps/web/lib/legal-constants.ts) is the single source of truth for entity name, address, governing law, arbitration forum, and every document's revision date — architecturally forecloses the exact 'stale affiliate claim in one document' bug the benchmark documents at Manus (legal-22). Verified no conflicting hardcoded entity-name literals exist outside the constant.
- legal-01: apps/web/app/terms/page.tsx:384-387 states a 12-months-of-fees-or-$100-floor liability cap, whichever is greater — structurally matches ChatGPT's own cap pattern.
- legal-02/legal-03: apps/web/app/terms/page.tsx:409-440 names a real arbitration forum (AAA Commercial Arbitration Rules, Travis County TX venue) plus a dated 30-day opt-out window from first acceptance — a capability the benchmark flags as a ChatGPT-only differentiator that AGI Workforce has independently matched.
- legal-11: DPA is genuinely incorporated by reference and reachable, not orphaned — apps/web/app/terms/page.tsx:452, linked from apps/web/app/trust/page.tsx:481, apps/web/app/security/page.tsx:507-508/785, apps/web/app/enterprise/page.tsx:146.
- legal-12: in-app Settings has direct legal links — apps/web/features/settings/sections/HelpSection.tsx:70-75 ('Legal' -> /legal) and PrivacySection.tsx:355-359 (-> /privacy) — exactly the discoverability gap the benchmark dings Manus for.
- legal-13: apps/web/app/legal/page.tsx indexes 19 documents with per-document revision dates sourced from the same constant each document itself prints — a larger, more current footprint than the benchmark describes for Claude (~7 docs, no index) or Manus (4 docs, no index).
- legal-17: apps/web/app/privacy/page.tsx:373-379 and features/settings/sections/PrivacySection.tsx:369-374 explicitly disclose AGI trains no models of its own and routes Managed Cloud prompts to third-party providers (naming OpenRouter as routed-model failover) — matches and is more specific than Manus's 'Third-Party AI Providers' disclosure.
- legal-05: the settings training toggle (improveModelTraining) was deliberately removed rather than left as a dead control once it was found to gate nothing — apps/web/features/settings/sections/PrivacySection.tsx:390-394 and its training.test.tsx document this directly. This is the corrected form of the exact half-wired-control failure this repo's CLAUDE.md warns against.
- legal-08: unconditional CSAM prohibition (acceptable-use/page.tsx:230-236) plus a real minors age-gating clause with jurisdiction-specific ages for EU/UK/India (terms/page.tsx:125-134) — a substantive parallel to ChatGPT's separate minors-safety category, stronger than Claude's bare CSAM line alone.
- legal-16: confirmed no advertising business model anywhere in privacy/page.tsx — correctly matches Claude/Manus rather than needing ChatGPT's ad-terms stack.

### Memory & personalization

- memory-01 fully wired end to end: toggle in apps/web/features/settings/sections/CapabilitiesSection.tsx:127-138, manage/delete UI in packages/ui/unified-chat/src/components/MemoryEditor.tsx:215-300, backed by real routes apps/web/app/api/memory/route.ts and .../[id]/route.ts, reachable via a real nav entry (packages/ui/ui/src/settings-nav.ts:175, WebSettingsModal.tsx:809) — not a dead control.
- memory-20 present: apps/web/features/settings/sections/GeneralSection.tsx:368-391 ('Instructions for AGI' textarea) is structurally and physically separate from MemorySection.tsx's auto-generated facts, matching all three benchmarked products.
- Sync-status transparency exceeds the benchmark: MemoryEditor.tsx:306-336 gives explicit per-state copy ('Saved on this device only' / 'Synced to your account' / sync error) that none of the researched competitor screenshots show as explicitly.
- Server-enforced 'Never remember' exclusions (apps/web/features/settings/components/MemoryExclusions.tsx + managed-memory-context-service.ts) filter candidates before write, not just hide them client-side after write — a stronger guarantee than a UI-only filter.
- The team has a track record of removing decorative/misleading controls instead of shipping them fake (the project-memory-scope <select> and the Import-memory row were both deliberately pulled with a code comment explaining why), which is good practice even though the underlying capabilities they gated remain gaps.

### Models, reasoning controls, quotas, pricing &amp; entitlements

- Consistent usage-reset vocabulary across web/mobile/extension via shared formatUsageResetIn/managedUsageBucketLabel (packages/contracts/types/src/usage-vocabulary.ts:78-120), fixing the exact two-precision inconsistency the benchmark flags in ChatGPT (mqp-10). Consumed at apps/web/features/settings/sections/UsageSection.tsx:106-111,231-258, apps/web/features/chat/components/messages/ChatMessageList.tsx, apps/mobile/src/features/settings/cloud-usage/index.tsx, apps/extension/src/side_panel.ts.
- Four-bucket usage breakdown (session/weekly/weekly-flagship/period, UsageSection.tsx:130-139,231-258) beats Gemini's flat two-meter disclosure (mqp-11) and partially answers Claude's per-model quota bar (mqp-09) via the flagship-class bucket.
- Overage/top-up credits usable by any individual paid plan (not gated to Business/Enterprise like ChatGPT's mqp-02 mechanism) — apps/web/app/api/billing/overage/route.ts:37-53, shipped in commits f063962c7/e15df56e3 immediately preceding this audit.
- Real, granular in-app tier gating for models — tierAllowedModels in packages/contracts/types/src/models.json plus modelLock() in apps/web/features/chat/components/Composer/ComposerFooter.tsx:180-208,245-300 — even though this data never reaches the marketing pricing page (see G1).
- Full per-model reasoning-effort control driven by the catalog (ComposerFooter.tsx:82-129), meeting the table-stakes, all-four-products claim mqp-03 cleanly.
- Team seat price is an exact match to both ChatGPT Business and Claude Team's entry seat: $25/seat/mo, $240/seat/yr ($20/mo equiv) — packages/contracts/types/src/billing-catalog.ts:227-249 (mqp-16).
- Real intermediate paid tier under the flagship price already shipped: Free/$0 -> Basic/$7 -> Pro/$20 -> Max/$100-$200 (billing-catalog.ts:193-224), structurally matching ChatGPT's Free/Go/Plus/Pro shape (mqp-13).
- We do not replicate either dark pattern the benchmark corpus itself calls out: no ad-supported paid tier (mqp-14), and Max 5x/Max 15x are two separately, fully priced cards rather than one price band hiding the higher multiplier's cost (mqp-15) — apps/web/app/pricing/page.tsx:1037-1115.
- Actual training-data policy ('AGI does not use customer conversation content to train AGI-owned models', apps/web/app/privacy/page.tsx:109,371-373) is unconditional, stronger than either benchmarked product's opt-out-based individual tier — just not merchandised on the pricing table (G7).

### Orchestrator live verification (browser-observed)

- Markdown rendering passes the same element-by-element torture test the researchers ran against all three products, with zero failures: H1/H2/H3, bold/italic, a 3-level nested list (measured maxListDepth=3), 4 real <input type=checkbox> GFM task items with no raw '[x]' text leaking, blockquote, inline code, Python + JavaScript fenced blocks with a 'Copy code' control, a 3-column table with 3 <th> and 3 body rows wrapped in an overflow-x container, a correct https://example.com link, 6 KaTeX nodes covering inline and block LaTeX, and a real <hr>. Gemini fails two of these (GFM checklists render as raw bracket text; the horizontal rule does not render) per 04-cross-product-comparison/06-markdown-rendering-and-citations.md. We match ChatGPT and Claude and beat Gemini. Verified live on 2026-08-15 via DOM query, not by reading the renderer.
- The response action row is at parity with Claude's, the richest of the three benchmarked products: Copy message, Read message aloud, Rate as good response, Regenerate response, More message actions, Share conversation, plus a relative timestamp. Per 06-markdown-rendering-and-citations.md Claude is the ONLY one of the three products with a dedicated per-message text-to-speech control in the action row (ChatGPT and Gemini both push voice into a separate mode) — we have it. Verified live by enumerating button aria-labels in the rendered transcript.
- The composer discloses the send destination per message ('Sent to AGI managed cloud. Show send details' with a visible 'Managed cloud' label). No benchmarked product shows the user where the bytes are going before send; this is a trust-boundary affordance the benchmark has no equivalent for.

### Projects, workspaces, notebooks & file knowledge

- 'Move to project' is fully wired end-to-end (ConversationTitleMenu.tsx -> WebChatPage.tsx:2979 handleMoveToProjectSession -> useConversations.ts:464-519 updateConversation PUT -> apps/web/app/api/chat/conversations/[id]/route.ts:135-199 persists project_id) -- verified working where the benchmark's own research explicitly flagged the ChatGPT equivalent as UNVERIFIED/untested.
- Project deletion (apps/web/app/api/projects/[id]/route.ts:283-337) soft-deletes the project and moves conversations out (project_id = null) instead of destroying them -- safer than ChatGPT's destroy-everything-by-default pattern, and the confirmation copy in ProjectSettingsDialog.tsx:329-334 truthfully reflects this.
- A persistent, always-reachable 'Library' nav item (apps/web/features/chat/pages/WebChatPage.tsx:3787-3796) aggregates generated files across every conversation by kind (image/video/file) and origin, unlike the Projects section which only appears once a project exists -- functionally matches and in reachability slightly exceeds Gemini's Library claim.
- A single Project object genuinely spans both chat and agentic ('AGI Work') modes via a workMode field independent of project_id, with the same Chat|AGI-Work composer toggle (ChatComposerNew.tsx:110, 2902-2925) reused inside project conversations, not a parallel per-mode project system.
- Project instructions (ProjectSettingsDialog.tsx:209-227) are genuinely injected into the system prompt server-side (project-context-service.ts:305-309) as a distinct labeled block from account-level 'Instructions for AGI' (GeneralSection.test.tsx:130), and project knowledge files are auto-available to every new chat in the project without re-attachment (project-context-service.ts loadProjectContext).
- The training-data disclosure (PrivacySection.tsx:370-372) is an unconditional blanket guarantee ('no training opt-in, because that data path does not exist'), stronger than Gemini's disclosure which is conditional on the separate Keep Activity/retention setting.

### Scheduled tasks & automation

- Dedicated, nav-reachable /chat/schedules page listing real tasks with a proper empty state (apps/web/features/chat/pages/WebChatPage.tsx:285-289; apps/web/features/schedules/components/SchedulesPage.tsx:432-443) — meets the ALL_PRODUCTS table-stakes bar for sched-02.
- Fully wired, end-to-end model picker at schedule-creation time sourced from the canonical model registry, with per-run cost/token receipts shown in run history — a capability none of the four benchmarked products are documented as having on their scheduling surfaces (apps/web/features/schedules/components/ScheduleForm.tsx:183-202; apps/web/lib/services/scheduled-agent-executor.ts:73-127; apps/web/features/schedules/components/ScheduleRunHistory.tsx:73-100).
- Nine-state named lifecycle model on /tasks (Queued/Running/Awaiting input/Ready for review/Completed/Failed/Cancelled/Paused/Archived) that exceeds Gemini's own inferred three-phase status pill in both breadth and confidence (packages/ui/unified-chat/src/components/tasks/task-display.ts:30-53).
- DST-safe IANA timezone scheduling that explicitly rejects ambiguous or nonexistent local clock times rather than silently guessing (apps/web/features/schedules/lib/schedule-form.ts:132-178).
- Explicit 'Why this task failed' section in the task detail panel, surfacing failure reason and retryability up front rather than a bare red badge (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:363-398).
- Honest, client- and server-enforced cadence floor: assertDeliverableCadence rejects any schedule the sweep genuinely cannot deliver with a specific error, and the form pre-validates the same rule so users never hit a surprise 400 (apps/web/lib/schedules/schedule-time.ts; apps/web/features/schedules/lib/schedule-form.ts:342-347).

### Settings taxonomy & permission/approval architecture

- settings-01/02: Modal + left rail + working "Search settings" field already matches the majority-benchmark pattern and beats Gemini's flat dropdown (packages/ui/ui/src/settings-modal/SettingsModal.tsx:2162; settings-nav.ts:279-306, 16 real keys).
- settings-03: AgentControl.tsx's 4-tier Ask/Auto/Plan/Bypass mode chip (AGENT_MODES, AgentControl.tsx:64) is more granular than Claude's 3-tier picker and gates its riskiest tier behind an explicit confirm dialog (AgentControl.tsx:229); live-wired into ChatInput.tsx, not orphaned. Under-deployed elsewhere, but well-built where it exists.
- settings-13: Model-class-specific quota segmentation (flagship-tier weekly bucket, distinct from the all-models aggregate) is fully wired end-to-end: UsageSection.tsx:137-139,243-252 -> managed-usage-balance.ts:55 -> a real /api/usage endpoint (useManagedUsageSummary.ts:73), not a stub.
- settings-14: Pay-as-you-go top-up is fully wired (BillingSection.tsx:795-960) with preset/custom amounts, real Stripe checkout, and an opt-in overage toggle with a documented safety rationale in its own code comment; purchased balance carries across renewals for up to 12 months, a concrete commitment not documented for any of the three converging benchmark products.
- settings-19: DirectoryBrowse (SettingsModal.tsx:453-499) unifies Connectors/Skills/Plugins behind one shared tab rail called from three entry points, matching Claude's Directory pattern, and deliberately omits fabricated install-count numbers rather than fake them (SettingsModal.tsx:1527 comment).
- settings-09: Trusted-device pairing is genuinely shared infrastructure, not reimplemented per surface - CoworkTab and the Connections tab's MobileCompanionPanel both read the same useConnectionStore (connectionStore.ts:321).
- Systemic dead-control hygiene, independently re-confirmed beyond the prior audit's own examples: PrivacySection.tsx:23-32, voice/page.tsx:55-60, and SafetySection.tsx all explain in their own UI copy why a control does not exist rather than shipping a decorative one.

### Shell, global nav, IA & design system

- Real, content-aware agentic progress copy instead of a generic spinner — apps/web/features/chat/components/messages/ToolTimeline.tsx:774-845 builds phrases like 'Running: {tool}' with named tool labels, plus 'Thought for Xs' duration disclosure at ThinkingBlock.tsx:195.
- A genuine persistent artifact side panel with a real Preview/Code toggle, matching Claude's signature feature and adding versioning/sharing/download — apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx and ArtifactPreview.tsx:202,1130-1152.
- Composer-level model + reasoning-effort picker combined in one control, matching Gemini's shape — packages/ui/unified-chat/src/components/ModelSelector.tsx:271-297,448-450.
- Persistent account chip (avatar, name, plan tier) visible with zero clicks from the primary chat shell — apps/web/features/chat/pages/WebChatPage.tsx:3841-3875.
- Seven structurally distinct overlay primitives (Dialog/AlertDialog/ConfirmDialog/PromptDialog/Sheet/Drawer/AccessibleDialog) plus a real persistent side panel, not one generic modal reused everywhere — packages/ui/ui/src/primitives/*.
- A real, pinnable Projects sidebar section with its own create action, dedicated search entry point, and 'New chat' as the most prominent sidebar control — packages/ui/ui/src/sidebar/Sidebar.tsx:539-548,629-633,807-808 — independently re-confirmed on top of the prior same-day audit's own verification.
- Wide markdown tables are wrapped in overflow-x-auto, so the one real bug the benchmark warns about (no truncate control AND no scroll container) does not occur here — packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:197.

### Web Search & Deep Research

- Deep Research entry point is a distinct, separately-named composer toggle ("Deep Research", Telescope icon) gated on its own catalog capability field, with a visible active-state badge once selected -- ChatComposerNew.tsx:2805-2822, 1964-1965.
- Live process narration exceeds the ALL_PRODUCTS/tableStakes baseline: phase label, live elapsed clock, round/search/source counts, AND a real server-driven per-step plan queue with status icons -- ResearchActivity.tsx (whole file).
- A visible, working stop/cancel control halts an active research run mid-flight and still persists the partial report/sources honestly as 'interrupted' -- WebChatPage.tsx:4236 -> useChatStream.ts:1826-1832, backed by research-loop.ts:926-930's signal check before every side effect.
- Per-round live source disclosure (favicon + title + host cards) appears as each search round completes inside the streaming message, something the benchmark explicitly noted ChatGPT itself lacks -- ToolTimeline.tsx InlineSourceCards/InlineSourceRow, lines 201-260.
- Durable report persistence with real multi-format export (Markdown/PDF/DOCX) reusing the existing document-export-service, plus an incomplete-run warning banner -- ResearchReportView.tsx.
- A working, RLS-scoped 'list all my reports' backend mode already exists and only needs a UI caller -- apps/web/app/api/research/reports/route.ts:15-20,63-68.

---

## Deliberately not copying

The brief for this work said *"Do not blindly clone either product."* These are benchmark behaviors we should decline on purpose, with the reason recorded so the decision does not get silently re-litigated as a gap later.

### Agentic modes: Work / Cowork / Codex / Spark / Manus Agent

- Claude's apparently-mandatory Project-scoping for Cowork (agentic-12): forcing every agent task into a project/workspace context removes the 'quick, unscoped task' use case that ChatGPT Work and our own optional projectPicker (gated via canUseAgiWork, ChatComposerNew.tsx:455-456) both support. If AGI Work's project requirement is ever tightened, it should be an opt-in default, not a forced gate.
- Literally merging Local and Cloud execution into one composer-level picker (agentic-14) or one settings page (agentic-22, Manus's 'My Computer'): CLAUDE.md is explicit that Local, BYOK, and Managed Cloud are separate trust boundaries that must never be silently routed into one another. Manus's unified picker is fine UX for a product without that boundary; cloning the UI pattern without first deciding to collapse the boundary would be a security regression dressed up as a parity fix. If closed at all, it should be framed as an explicit pair/select-a-remote-controlled-local-machine flow from within a Managed Cloud session, using the same consent flow CLAUDE.md already requires for Local→BYOK forks — not a single dropdown or settings page.
- ChatGPT's zero-warning quota cliff (the negative case referenced in agentic-03): obviously not something to copy; recorded only to make explicit that the current proactive-warning behavior (selectUsageWarning()) should be kept as the standard, not regressed toward ChatGPT's silent-cliff behavior.

### Artifacts, canvas & generative UI objects

- Claude's naive 'AI-powered artifacts' (artifact calls the model directly on the viewer's own quota) — the prior audit's GAP-P0-009 red-team already found an anonymous-wallet DoS, an opaque-origin auth contradiction, and a fail-open concurrency limiter in this design; correctly un-shipped, do not clone as-is.
- ChatGPT's silent, undiscoverable export-to-Library with no on-object publish control (artifacts-06/07) — we already do better with a visible, working Publish button; don't regress toward this pattern.
- ChatGPT's two-surface fragmentation (a separate Run panel vs. an inline-app-generation surface with no unified object model, artifacts-15) — keep our single ArtifactPreview component as the pattern for new artifact types rather than spinning up type-specific chrome.

### Composer, chat lifecycle & message rendering

- ChatGPT's asymmetric thumbs-down-only default action row (hides thumbs-up until some other state) — our symmetric always-visible up+down (matching Claude/Gemini) is more honest UI; do not regress toward ChatGPT's pattern.
- Gemini's long-table truncation-behind-a-manual-expand-control — hiding table rows by default trades completeness for a shorter view; our full-render-with-horizontal-scroll behavior is defensible and shouldn't be replaced just because a competitor truncates.
- ChatGPT's 3-level-deep model picker (effort pill -> Advanced -> Model submenu row) — our single combined chip already beats this in click economy; do not regress toward deeper nesting when extending the picker.
- Silently hiding a model the instant its deprecation_date arrives with zero advance warning is the actual bug to fix (composer-03) — the fix is adding an advance-warning state to the picker we already have, not importing ChatGPT's whole picker UI.

### Connectors, plugins, skills, MCP & custom assistants

- Claude's precise-looking download/install counts (1.2M-2.2M etc.) with no stated audit methodology — this codebase has already reasoned against this exact pattern in apps/web/db/neon/0096_plugin_registry.sql's own comment ('a column invites a fabricated number'); cloning it without real telemetry would be a regression against our own honesty rule.
- Gemini's two simultaneously-live, differently-branded custom-assistant systems ('My Gems' vs 'Gems from Labs') on one page — the benchmark's own evidence frames this as confusing, and this repo has already independently found and is remediating the identical anti-pattern twice (DEAD-CODE-003's superseded parallel MCP UI, SHELL-NAV-IA-002's Connections/Connectors naming collision). Don't introduce a third instance by cloning Gems' structure.
- ChatGPT's single blanket 'Allow low-risk actions' toggle as an aspirational target — it is strictly less granular than the per-tool verdict system (Always allow/Ask/Block) already shipped here; if anything this is a case where the benchmark should converge toward us.
- Rushing to open an unmoderated, star-rated public storefront (GPT Store style) before this repo's own signing/review policy exists — 0096_plugin_registry.sql already encodes why not to (plugin_registry_entries_unsigned_until_policy: 'there is no signing key, no verifier, and no review process'), and a dedicated supply-chain vetting tool (tools/skill-vetting/) exists specifically to gate this before launch.

### Image, video & voice generation

- ChatGPT's overflow menu restricted to only Like/Dislike with no copy/open-in-new-tab (media-08) — a limitation, not a feature; we already expose Download and Share directly and should not narrow to match this.
- A passive, prose-only model-name mention like Gemini's 'Create with Omni' subhead (media-16) — strictly weaker than a real, actionable picker, which we already have; do not regress to text-only disclosure.
- Gemini's broken 0:00/0:00 duration readout (media-18) is a bug to avoid, not a pattern to replicate; we are likely already immune to it by using a native <video> element instead of custom player chrome.

### Legal, policy, trust & data-control surfaces

- legal-19 (dedicated MCP marketplace listing policy): AGI Workforce deliberately does not curate, vet, sign, or list third-party MCP servers (apps/web/app/connectors/mcp-directory/page.tsx:120-125: 'We do not mirror, curate, or sign any of them'). Building a curated marketplace just to justify writing a listing policy would be scope creep in the wrong direction — Claude's Directory Policy exists because Claude actually operates a curated directory; AGI's bring-your-own-endpoint model already has equivalent disclaimers in the AUP (acceptable-use/page.tsx:214-224).
- legal-20 (ChatGPT's positive-value-statement AUP framing vs a flat prohibited-use list): the claim's own howToVerify calls this presentation, not substance, and says to treat divergence as non-blocking. AGI's flat lettered-subsection AUP (matching Claude/Manus's style) should not be rewritten around ChatGPT's four-value-statement wrapper for its own sake.

### Memory & personalization

- memory-04's 'Legacy' labeling: this is ChatGPT/Claude's migration debt from running two overlapping memory generations, not a feature to emulate. Our single clean memory system is better UX than manufacturing a second deprecated one just to label it.
- memory-07's no-re-auth-gate-before-showing-sensitive-memory pattern: we already match this (no gap to close), but it is not something to hold up as a target either — it's a shared weak point worth an independent security review, not competitive parity work.
- memory-06's ambient recording-transcript memory corpus is a large new consent/capture/storage surface built against a single-product ChatGPT feature the source research itself flags UNVERIFIED (no located capture entry point) — not solid enough evidence to build against.

### Models, reasoning controls, quotas, pricing &amp; entitlements

- ChatGPT's ad-supported $8/month tier (mqp-14) — disclosing ads on a paid subscription erodes trust; we already don't do this on Basic and shouldn't start.
- Hiding the top usage-multiplier's exact price behind a 'From $100/month' headline (mqp-15, both ChatGPT Pro and Claude Max) — we already publish Max 5x ($100) and Max 15x ($200) as fully separate, fully priced cards; don't regress to an undisclosed ceiling.
- ChatGPT's silent 'Higher intelligence' auto-escalation toggle (mqp-07) that overrides a user's manual model/effort choice with no after-the-fact disclosure of whether it fired. If we ever build auto-escalation, it should ship with the disclosure this pattern lacks — the same principle behind our own already-filed fallback-transparency gap (prior audit MODELS-004).
- Two different reset-time precisions for the same quota shown on two different surfaces (mqp-10's ChatGPT bug) — we've already structurally avoided this via a shared vocabulary function; any new surface must keep using it rather than hand-rolling reset copy.

### Orchestrator live verification (browser-observed)

- Making transcript task-list checkboxes interactive. Ours render disabled (verified: all 4 had disabled=true). ChatGPT and Claude both render 'real styled checkboxes' but the corpus never establishes that either is clickable, and an assistant message is an immutable record — letting a click mutate rendered markdown that is not persisted anywhere would be a state-loss bug of the exact kind logged as QA-002 against StepsCard. The interactive-checklist need is already served by the dedicated StepsCard component, which persists. Keep transcript checkboxes read-only.

### Projects, workspaces, notebooks & file knowledge

- ChatGPT's destroy-everything-by-default project deletion (chats, tasks, files all permanently deleted unless manually moved out first) -- our move-conversations-out-by-default behavior is a better user outcome and should not be regressed toward ChatGPT's pattern.
- Gemini's 'Upload up to 300 sources' headline number as a thing to copy verbatim -- our own project-context-service.ts MAX_TOTAL_FILE_CONTENT_CHARS=48,000 (~12k tokens combined) means most files beyond a handful are already silently truncated out of context (per prior audit PROJECTS-FILES-002); advertising a large file-count ceiling before fixing/disclosing the real effective content budget would be actively misleading.
- Claude's decorative 'Only you' lock badge on its memory card as a UI pattern to clone ahead of a real mechanism -- we already tore out a functionally-identical dead dropdown from ProjectSettingsDialog.tsx for exactly this reason (one option, no persistence); any future memory-scoping badge should ship only once the underlying per-project isolation is real.

### Scheduled tasks & automation

- Gemini's first-person self-narrated task-complexity assessment ('My initial assessment classified the task as simple...') reads as exposing an internal planning trace as permanent UI copy without giving the user anything actionable; our fixed-vocabulary progress labels are more honest about what they represent.
- Gemini's 'BETA' badge as a stand-in for real reliability disclosure — a maturity badge doesn't fix the underlying gaps (no tool access in scheduled runs, daily-only cadence); if we add a status disclosure it should point at real capability documentation, not just decorate a header.
- Gemini's thread-attached schedule model (and its resulting need for a cascade-delete warning dialog) is a symptom of coupling schedules to chat threads in the first place. Our schedule-is-its-own-object design avoids that orphaning failure mode entirely — adopting the thread-attachment architecture just to also need Gemini's warning would be a regression, not parity.

### Settings taxonomy & permission/approval architecture

- ChatGPT's 'Trusted contact' crisis-escalation feature (settings-10): implies a clinical-risk classifier over live conversation content plus a contact-verification/consent pipeline - a serious safety and legal undertaking. SafetySection.tsx already declines this correctly in its own UI copy ('does not monitor conversations, notify another person, or replace emergency services'); do not build a lighter shadow version without the same infrastructure the real feature requires.
- Manus's three-way resource-type credit ledger (Tasks/Websites/Computers) as a literal template for closing the settings-12 gap: if credit_transactions is ever surfaced as a 'Credits history' view, it should reflect resource types AGI Workforce actually meters today, not import Manus's category split wholesale.
- Shipping a decorative approval-mode dropdown on Scheduled Tasks (settings-28) ahead of scheduled-run tool access: prior audit (AGENTIC-WORK-007/GAP-168) already found scheduled runs currently execute with zero tools, so a picker there today would have nothing real to gate - exactly the dead-control anti-pattern this codebase otherwise goes out of its way to avoid.

### Shell, global nav, IA & design system

- ChatGPT's split marketing-nav interaction model (some items open in-place dropdowns, others hard-navigate) is flagged by the benchmark's own source material as ChatGPT's own undocumented inconsistency, not a pattern to aspire to — this repo currently replicates it (apps/web/shared/components/layout/Header.tsx) and should move toward Claude's all-consistent baseline instead, not stay as-is.
- A bolted-on, ChatGPT-shaped global top-bar Chat/Work segmented control purely for parity — the prior same-day audit already documents ChatGPT's own rebuilt macOS app reportedly shipping a 'Chat mode went missing entirely on desktop' regression from this exact pattern; better to correctly wire the composer-embedded axis we already chose (Claude's shape) than add a second, differently-shaped axis on top.
- Chasing every single-product code-block/table micro-affordance (ChatGPT's per-block Run button, Gemini's download icon + table truncate control) in isolation — each is real but single-product; the current hybrid (persistent language label + hover-reveal copy, boxed tables with safe overflow) is a reasonable middle ground already, not obviously worse than committing fully to any one competitor's choice.

### Web Search & Deep Research

- ChatGPT's countdown-auto-start on the plan card (dr-04): an unattended timer that spends the user's research budget by default is a dark pattern, not a UX target -- any pre-flight gate we build should require an explicit affirmative click.
- Gemini's 'Create ▾' derivative-format menu (Infographic/Quiz/Flashcards/Audio Overview, dr-23): justified for Gemini by NotebookLM's existing infrastructure; building it here from scratch is a multi-week investment for a single-product, non-table-stakes differentiator.
- Gemini's direct 'Export to Docs' (dr-24): a structural advantage of owning Google Workspace, not a portable UI pattern. The honest analog if pursued is 'export to the user's connected storage' via the existing connector catalog, not chasing Docs specifically.
- Claude's adaptive-effort research mode that can complete with zero citations and no sources panel (dr-17): our loop always performs a real planning turn and real search rounds by default (MIN_ITERATIONS_FOR_PLANNING_TURN=3, default maxIterations=6), so a user who enables Deep Research always gets genuine multi-round work rather than a possibly-parametric-only answer dressed up as research -- a deliberate, defensible difference, not a bug to fix.
- ChatGPT's superscript footnote citation style (dr-15): our existing Claude-style block citation chips (InlineSourceTags.tsx) are an intentional, previously-audited choice; both patterns are live across the benchmark and neither is objectively superior.

