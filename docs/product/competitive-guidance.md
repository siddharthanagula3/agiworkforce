# AGI Workforce competitive product-development guidance

Status: Current standing guidance and dated research seed
Owner: Founder + product/architecture leads
Last updated: 2026-09-22

**Repository location:** `docs/product/competitive-guidance.md`
**Research baseline:** announcements dated on or before **September 21, 2026**.
**Research performed / live documentation accessed:** **September 22, 2026**.
**Scope:** seven application implementations mapped to six public product
surfaces; the two Desktop implementations have different current roles.
**Purpose:** persistent product, design, engineering, and verification guidance, not authorization to rebuild or deploy everything at once.

The source attachment supplied this research seed and official-source registry.
Repository research already verifies the September 21 ChatGPT/Claude continuity
conclusions in `docs/research/chatgpt-claude-ecosystem-delta-2026-09-21.md` and
`docs/research/cross-surface-continuity-2026-09-21.md`. Every other material
claim below remains a dated lead until the relevant official page is reopened
for the decision being made. This document never overrides code, current
official documentation, founder decisions, or the trust-boundary contract.

## 1. Mission and authority

You are developing AGI Workforce as one connected AI ecosystem. Treat current ChatGPT and Claude as the primary references for familiar, polished user experiences. Use Perplexity, Gemini, Manus, and xAI/Grok as additional references for research, multimodal interaction, agentic work, local/cloud execution, coding, extensibility, and related workflows.

The desired result is close functional and interaction parity: a person accustomed to the relevant competitor should understand how to accomplish the equivalent task in AGI Workforce without learning an unnecessarily different product. Study the actual journey, information hierarchy, layout, affordances, state transitions, output quality, and failure recovery, not merely screenshots of the home page.

Use AGI Workforce’s own brand, assets, implementation, and product language. A familiar workflow is desirable; presenting ourselves as another company, copying private code, or claiming unsupported functionality is not.

Apply this priority order:

1. Platform/system restrictions, security boundaries, explicit current founder instructions, and authorized scope.
2. Existing repository instructions, established product contracts, privacy commitments, and validated customer requirements.
3. Fresh, relevant competitor evidence and official implementation documentation.
4. A documented engineering judgment where evidence is missing or competitors differ.

Competitor behavior is evidence, not permission to override user intent, weaken security, import every experimental feature, or rewrite working architecture. Do not change explicit founder model exclusions, spending limits, or provider policies merely because a competitor uses something else.

**Never justify a product decision with “ChatGPT/Claude usually works this way” from training memory. Verify the current relevant behavior first.** Training knowledge is a starting hypothesis, not evidence of what is shipped today.

## 2. Verified seven-implementation inventory

The repository has seven application implementations but six public product
surfaces. Electron and Tauri share `apps/desktop` and the Desktop product name,
yet they are separate hosts with separate release paths. The current founder
decision makes Electron the public Desktop and retains Tauri for internal value;
inventorying Tauri does not reauthorize it as a second public offering.

Verified from manifests, entry points, packaging configuration, release
workflows, GitHub releases/runs, and the live Web health route on 2026-09-22:

| Implementation         | Path and runtime                                                                                                   | Current role and trust                                                                                                         | Supported/distribution target                                                     | Verified deployment state                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Web                    | `apps/web`; Next.js 16.3.5, React 19, TypeScript                                                                   | Public Account Cloud client plus API/control plane; Managed Cloud only                                                         | Browsers; Vercel production workflow                                              | `https://agiworkforce.com` and `/api/health` returned healthy; deployment run `35608313037` succeeded for `e353673c` on 2026-09-21 |
| Mobile                 | `apps/mobile`; Expo 57, React Native 0.86, Expo Router                                                             | Consumer client with isolated on-device Local and Account Cloud; no Mobile BYOK in v1                                          | iOS and Android through EAS/App Store/Google Play workflows                       | Release workflow exists; GitHub showed no runs and no matching release, so store publication is not proven                         |
| Electron Desktop       | `apps/desktop/electron` plus the `apps/desktop` package; Electron/Node host, remote hosted Web renderer by default | The public Desktop: Account Cloud plus permissioned device, voice, file, computer-use, and developer-session host capabilities | macOS arm64/x64 signed DMG through `release-desktop-cloud.yml`                    | Workflow exists but had no GitHub runs or `v-cloud-desktop-*` release; no current public installer is proven                       |
| Retained Tauri Desktop | `apps/desktop/src` + `apps/desktop/src-tauri`; React/Vite renderer, Tauri 2.11/Rust host                           | Internal Local/BYOK/Managed implementation inventory; not a second public Desktop under the current founder decision           | Workflow can build macOS and Linux x64; manual workflow adds Windows x64          | Historical `v-desktop-1.2.0` release was published 2026-05-04; current public-product status remains internal/retained             |
| CLI                    | `apps/cli`; Rust 2021 binary `agi`                                                                                 | Host Developer domain; Local, BYOK, and admitted Managed modes                                                                 | macOS arm64/x64, Linux arm64/x64, Windows arm64/x64; GitHub Release + npm wrapper | `v-cli-1.0.0` was published 2026-05-03; source is 1.7.1, so the current implementation is not the published binary                 |
| Chrome extension       | `apps/extension`; Manifest V3 TypeScript/Vite service worker and side panel                                        | Eligible Account Cloud chat plus browser-scoped page/task state and an authenticated native bridge                             | Chrome Web Store workflow                                                         | Workflow exists but had no GitHub runs or matching release; store publication was not independently proven                         |
| VS Code extension      | `apps/extension-vscode`; TypeScript/Node extension and webviews, VS Code `^1.100.0`                                | Host Developer domain through the shared CLI/app-server runtime, with editor-native adapters                                   | VS Code Marketplace workflow                                                      | Workflow exists but had no GitHub runs or matching release; marketplace publication was not independently proven                   |

Inventory verification anchors, checked 2026-09-22: the five JavaScript app
manifests, `apps/cli/Cargo.toml`, `apps/desktop/src-tauri/Cargo.toml`,
`apps/extension/manifest.json`, `apps/mobile/app.config.js`,
`ARCHITECTURE.md`, `apps/desktop/README.md`, and the six matching release
workflows define paths, runtimes, dependency edges, targets, and intended
distribution. The [production deployment run](https://github.com/siddharthanagula3/agiworkforce/actions/runs/35608313037)
completed successfully for `e353673c` on September 21, and the live Web health
route returned HTTP 200 on September 22. The published
[CLI v1.0.0](https://github.com/siddharthanagula3/agiworkforce/releases/tag/v-cli-1.0.0)
and [Tauri Desktop v1.2.0](https://github.com/siddharthanagula3/agiworkforce/releases/tag/v-desktop-1.2.0)
releases are historical binaries, not evidence that current source is
distributed. The GitHub Actions API returned no runs for the Mobile, Electron
Desktop, Chrome, or VS Code release workflows at this check; app-store and
marketplace availability remains unverified.

Primary TypeScript owners reused across these implementations are
`@agiworkforce/types`, `cloud-contracts`, `client-runtime`, `routing`,
`provider-runtime`, `sync`, `artifacts`, `design-tokens`, `ui`,
`unified-chat`, `local-runtime-contract`, and `utils`, with each manifest
declaring only its needed subset. The Tauri and CLI hosts reuse
`agiworkforce-protocol`, `agent-core`, `llm`, `mcp`, `model-registry`,
`app-server`, `command-registry`, `execpolicy`, `sandbox-policy`, and licensing
crates. Exact dependency edges remain manifest-owned; this summary is not a
second dependency registry.

Recheck paths, runtimes, supported platforms, distribution channels, backend
dependencies, shared packages, trust modes, and production status when a
material decision depends on them. Do not assume the Desktop pair means two
operating systems, merge their hosts, or turn retained code into a public claim.

Define what should be identical across implementations: canonical objects,
permissions, projects, eligible sessions, account state, entitlements, and run
lifecycle, and what should be platform-native. CLI parity means equivalent
outcomes and controls, not a graphical sidebar in a terminal. A native host must
not lose deliberate local capabilities merely to resemble the website, but an
internal host also must not be marketed as public.

Preserve provider neutrality, local/BYOK/managed distinctions, reusable domain contracts, and migration flexibility where those are established product requirements. Verify the existing implementation before declaring a gap or replacing a subsystem.

## 3. Research discipline for every material decision

### 3.1 What counts as evidence

Use official feature documentation, release notes, dated announcements, developer references, migration guides, public engineering articles, official source repositories, and authorized observations of the actual product. Official claims about quality or speed remain vendor claims unless independently reproduced.

Use search, community discussions, and reviews to discover leads or user problems, not as sole proof of current behavior. Inspect the linked official source. For UI details, use the actual authorized interface or identifiable dated official demonstrations; text documentation alone does not establish pixel measurements or every interaction.

Cross-check announcements and feature docs: a release-note index can lag a newer announcement. Conversely, a launch post does not prove a feature is enabled for every account. A script-rendered empty page, missing access, or an unavailable beta is not proof that the feature does not exist.

Separate five layers: **consumer product, developer API, agent harness, execution runtime, and underlying model**. A product subscription does not establish API availability, identical tools, or permission to automate its consumer UI as a backend.

### 3.2 Evidence and availability labels

For each consequential claim, record:

- Vendor, product, feature, source URL/title, publication date, event date, and verification timestamp.
- Evidence class: **documented**, **directly observed**, **inferred**, or **unknown**.
- Release state: **generally available**, **rolling out**, **limited beta/preview**, **announced**, **deprecated**, or **retired**.
- Applicable plan, account type, region, operating system, app version, model/API version, and organization policy where known.
- Observation conditions, relevant quote or short paraphrase, contradictions, user need, affected AGI Workforce apps, and proposed decision.

A feature can be documented but not personally observed, generally available only within a particular paid plan, or retired in a product while still available through its API. Preserve these distinctions.

### 3.3 Freshness policy

Before a material product or engineering choice, recheck the relevant current sources during that working session. During active development, do a lightweight daily announcement scan and a broader weekly inventory review when an actual session or authorized scheduled job runs. Reverify model IDs, endpoint contracts, prices, limits, deprecations, permissions, and platform availability before integrating or releasing them.

These cadences are our proposed operating policy, not claims about competitor practices. Do not pretend a Markdown instruction creates a background monitor. A real scheduled task or CI job requires explicit setup and authorization.

Cache dated findings, follow changes, and read the relevant documents deeply. Do not repeatedly reread every vendor’s entire website for a minor CSS fix. If research is blocked, label the uncertainty, avoid irreversible guesses, and continue independent authorized work.

The September 21 baseline below is not a permanent cutoff. Refresh it against the real date of future work. Undated live documentation read on September 22 is current guidance, not proof of an archived September 21 interface.

## 4. Dated research seed: changes that must not be replaced with old assumptions

This is a selected, verified starting inventory of relevant changes, not an exhaustive record of every announcement. Reopen the sources before relying on availability, API contracts, or deprecation deadlines. The implementation implications below are recommendations for AGI Workforce, not claims that every competitor has equivalent features.

### 4.1 OpenAI / ChatGPT / Codex

- **September 21:** Privacy Center consolidates explanations and links to existing privacy-related settings; access remains dependent on account and workspace conditions. Investigate one understandable privacy entry point rather than scattered unexplained toggles. [O06]
- **September 17:** Word joins the Microsoft add-in; multiple connected accounts expand across plugins. **September 10:** connected storage expands in Library. **September 9:** voice reasoning controls change. **September 8:** Images 2.5 adds generation/editing workflows. These are separate surface-specific changes, not automatic API capabilities. [O01]
- **September 11:** OpenAI announces a planned custom-GPT retirement and plugin migration. This is a migration notice, not evidence all GPTs are already unavailable. Investigate reusable instructions, tools, sharing, and migration rather than freezing an old GPT-builder architecture. [O03][O02]
- **August 31:** supported websites can expose WebMCP site tools in the built-in desktop browser; this is not the same capability as the browser extension. Preserve the distinction between structured site tools, browser automation, and connected APIs. [O05]
- **August 25 release entry:** Work adds supported event-triggered tasks and independently configured shared tasks. Research actual scheduler, event delivery, approval, and ownership behavior. [O04][O01]
- **September developer changes:** `codex mcp-server` was removed; connecting Codex to external MCP servers remains supported. The suggested app-server migration is experimental. Separate this change from MCP client support. September notices also distinguish Codex-model retirement from API availability. [O07]
- **Current API documentation:** inspect Responses, agent/session execution, streaming, background work, tools, webhooks, and applicable SDKs rather than assuming a basic Chat Completions loop covers the product. These docs are discovery sources; verify each chosen interface and stability level. [O09]
- **Current GPT-Live documentation:** voice can listen/speak while delegating reasoning and tools to a backend. Migration changes event and playback semantics; do not treat it as a model-name replacement or remove existing permission enforcement. [O10][O11]

### 4.2 Anthropic / Claude

- **September 16:** chat and Cowork are being unified, with rollout across eligible plans and surfaces. Claude Docs and Slides are introduced as beta experiences, with Design available in conversations. Research continuity between conversation and producing/editing work, not an obsolete permanently separate mode split. [A03][A07]
- **September 17:** redesigned Projects introduce a coordinator, delegated threads, shared context, and goal-oriented work. The initial beta is restricted to selected Pro/Max Claude Code cloud users without existing web/desktop projects; it is not universal availability. Existing projects and migration states matter. [A04]
- **August 26:** Claude in Chrome becomes generally available for paid plans. A separate built-in browser is also announced. Study both the existing browser session and isolated delegated browser, including account access, approvals, and user takeover. [A05][A06]
- **July 7 and August 25 release entries:** cloud Cowork availability and memory spanning chat/cloud work change cross-device and persistence assumptions. The same release log lists September 1 model launches and later enterprise features; verify exact entitlements separately. [A01][A08]
- **Current Claude Code documentation:** investigate terminal, IDE, desktop, web, remote continuation, project instructions, skills, hooks, memory, SDKs, and cloud routines. Do not assume a local terminal session and a cloud job have the same lifetime. [A09]
- **Engineering evidence:** Anthropic’s May 25 containment article is a public reference for execution security. Read it for its actual documented scope; it is not proof of every framework or private backend component used by Claude. [A11]

### 4.3 Perplexity

- **September 21:** Effort Mode, a skills marketplace, read-only Side Chat, Portable Computer, and hybrid compute are documented. Effort Mode initially targets web; portable local compute has hardware/platform requirements; hybrid compute combines cloud orchestration with local work. Model access also has eligibility restrictions. Research these as distinct capabilities, not universal availability. [P02]
- **August 24:** Computer in email, tool-approval controls, and Search as Code are documented. Inspect sender verification, inherited account permissions, tool scopes, recurrence, and retrieval interfaces before implementing equivalents. [P03]
- **August 4:** Spaces move toward Projects with durable shared work; Windows Personal Computer and a multi-model Council are announced. Assess persistent workspace objects, Windows execution, and a comparison/synthesis experience, without assuming consensus proves truth. [P04]
- **Ongoing:** include answer citations, search UX, deep research, Computer, Projects, browser/Comet behavior, and developer search capabilities in the research inventory. The dated entries above are the evidence seed; unexamined subfeatures remain research targets. [P01]

### 4.4 Google / Gemini

- **September 10:** a Windows app is listed in consumer release notes. Earlier entries cover macOS dictation and Spark. Check actual operating-system support and whether remote continuation is shipped or merely promised in a particular announcement. [G01][G03]
- **September 2 and 15:** the API changelog lists new Flash and Live variants as generally available. The consumer product’s release history is not a complete model/API catalog. [G02]
- **September 17:** the Antigravity preview update changes local tool schemas, including parameter naming and file-edit behavior; the older May preview is scheduled to shut down October 5. A model-ID-only migration is not sufficient for every integration. [G02]
- **Late August / September API entries:** video generation/editing, transcription, music, and agentic video understanding also change. Investigate actual supported modalities, events, pricing, and lifecycle instead of assuming all media use one text-generation contract. [G02]
- **Current product guides:** Personal Intelligence makes connected personal context and privacy controls relevant; Canvas and Spark are separate references for creation and delegated work. Record eligibility and scope rather than attributing all functionality to every Gemini account. [G04][G05][G03]

### 4.5 Manus

- **July 22:** Plan Mode provides a planning and approval stage. Inspect how a user reviews and changes proposed work before execution. [M03]
- **July 14:** native PowerPoint output emphasizes actual editable presentation objects, not just a rendered web presentation or screenshot export. [M04]
- **July 9:** Branch provides a context-preserving divergence point for work. Distinguish a branch from an edit, continuation, regeneration, or read-only side conversation. [M05]
- **Earlier 2026 announcements:** Schedules, self-updating Projects, and My Computer desktop expand the reference set for recurring work, accumulated context, and local execution. Recheck their current behavior, limits, and availability. [M06][M07][M08]
- **July/August announcement index:** Supabase and ElevenLabs integrations, auto-publishing, and other connectors broaden the ecosystem. Treat each as a separately authorized integration or publication workflow, not generic permission to write externally. [M01]
- **Historical engineering source:** the context-engineering article is dated July 18, 2025. It can inform investigation of agent harness design but must not be mislabeled a new 2026 announcement or a complete current-stack disclosure. [M09]

### 4.6 xAI / Grok

- **September 21:** a new xAI frontier model is announced. Recheck model access, endpoint names, capabilities, and retirement implications rather than freezing an earlier catalog. Benchmark assertions remain vendor claims. [X03]
- **September 18:** Voice Transcribe 2 is announced. Separate transcription from conversational voice and verify live/batch integration contracts. [X04]
- **September 16:** Build Memory documents project/global persistent memory, topic files, and review/consolidation commands. The documentation says current conversation instructions take precedence. Study scoped, inspectable durable guidance, not indiscriminate storage of every tool result. [X05]
- **August 11:** Grok Bot adds a persistent-agent product reference. Use the current documentation to establish task lifetime, permissions, and supported interfaces rather than assuming parity from the name. [X06]
- **July 15:** Grok Build publishes its coding harness. The linked official source is an actual engineering reference for the code it exposes, not evidence that the entire consumer service is open source. [X07]
- **Further announcement inventory:** Build web/mobile, workflows, automations, skills, plugins, connected productivity tools, and Imagine media should be reviewed when the corresponding AGI Workforce feature is touched. Confirm each through its specific announcement and docs. [X01][X02]

## 5. Complete 192-point research and parity checklist

**These are product requirements and investigation targets, not an assertion that all six competitors ship every item.** Do not implement all items indiscriminately. For each relevant item, identify its current competitor reference, user need, affected apps, existing implementation, gaps, risk, effort, and next action.

For each feature, evaluate: **entry point → normal interaction → loading/running state → output → persistence → permission boundary → failure recovery → cross-device behavior → verification**. Use real workflows, not checkmarks based only on file existence.

### 5.1. Public website, acquisition, and onboarding

1. **Positioning:** Explain the connected ecosystem, supported tasks, six public product surfaces, seven application implementations, and real differentiators without claiming unimplemented parity.
2. **Marketing navigation:** Benchmark header, product navigation, mobile menu, pricing links, documentation, download paths, and account entry points.
3. **Demonstrations:** Show authentic working workflows and outputs; use labeled examples rather than fake live activity or unsupported performance claims.
4. **Signup and sign-in:** Test identity providers, verification, passkeys where supported, account linking, recovery, invitation acceptance, and expired authentication.
5. **First-run activation:** Guide the user to a useful first result; make optional setup skippable and preserve the intent that brought them in.
6. **App downloads:** Present real platform support, versions, update channels, installation instructions, signing status, and system requirements.
7. **Pricing presentation:** Make plan comparisons, limitations, local/BYOK/managed distinctions, trial terms, and upgrade expectations understandable.
8. **Trust and support:** Keep documentation, release notes, status, support routes, privacy explanations, and accessibility information consistent with shipped behavior.

### 5.2. Information architecture and global interface

9. **One ecosystem:** Use coherent names and navigation for conversations, work, code, projects, files, tools, and settings across applicable apps.
10. **Home and recents:** Inspect empty and returning-user states, recent work, suggestions, pinned items, and safe recovery of drafts.
11. **Navigation shell:** Benchmark sidebar density, collapse behavior, active item, scrolling, history grouping, workspace switcher, and narrow-window behavior.
12. **Search and commands:** Support discoverable global search, keyboard shortcuts, command palette, and context-sensitive actions without conflicting shortcuts.
13. **Work surfaces:** Design split panes, side previews, artifact editors, browser views, inspectors, and resizable boundaries as one coherent system.
14. **Visual tokens:** Define typography, spacing, widths, radii, borders, contrast, elevation, icons, focus states, and motion from measured references.
15. **Account settings:** Make profile, language, appearance, notifications, privacy, connected accounts, permissions, subscription, and organization controls findable.
16. **Complete states:** Specify loading, empty, offline, denied, unavailable, limited-rollout, error, success, and recovery states for every primary screen.

### 5.3. Composer and input

17. **Text entry:** Handle multiline input, growing height, composition events, non-Latin keyboards, Enter preferences, and long prompts without accidental sends.
18. **Mixed attachments:** Support multiple eligible file types, drag-and-drop, paste, mobile pickers, attachment removal, and per-file validation.
19. **Upload lifecycle:** Show upload and processing progress, retry, cancel, failures, size limits, duplicate handling, and readiness before submitting.
20. **Context mentions:** Inspect mentions for files, folders, projects, tools, accounts, tabs, repositories, and agents with clear resolution and permissions.
21. **Capability controls:** Expose applicable model, effort, research, tool, runtime, temporary-chat, and media settings without overwhelming the default composer.
22. **Dictation and voice entry:** Keep dictation separate from live conversation; preserve typed text and attachments when switching between input modes.
23. **Draft preservation:** Preserve unsent text and eligible attachments through navigation, authentication refresh, model changes, and app interruption.
24. **Submission safety:** Prevent duplicate sends; explain incompatible attachments or unavailable capabilities and offer a deliberate compatible alternative.

### 5.4. Conversation lifecycle and streaming

25. **Create and resume:** Create, load, rename, pin, archive, delete, and restore conversations according to the actual product contract.
26. **Editing and regeneration:** Implement message editing, regeneration, branch selection, and revisions without corrupting downstream conversation history.
27. **Streaming events:** Render ordered text, tool, reasoning-summary, citation, artifact, and completion events without duplicate or disappearing content.
28. **Control a running task:** Distinguish stop, pause, resume, steer now, queue a follow-up, branch, and read-only side discussion.
29. **Navigation during work:** Keep work state understandable when users change conversations, open another window, or return from a backgrounded app.
30. **Long histories:** Use scalable history loading and stable scroll anchors; avoid replaying already completed messages as new generation.
31. **Failure recovery:** Recover from disconnects, provider timeout, truncation, interrupted tool calls, empty output, and reload without inventing success.
32. **Conversation sharing:** Explain snapshot versus live sharing, recipient access, exposed artifacts, revocation, and sensitive-content review.

### 5.5. Rendering, citations, and message actions

33. **Rich text:** Test headings, paragraphs, lists, nested lists, blockquotes, tables, links, inline code, and mixed-language content.
34. **Code and mathematics:** Render fenced code, language labels, copy actions, syntax highlighting, equations, overflow, and malformed partial streams.
35. **Diagrams and charts:** Handle Mermaid, diagrams, charts, datasets, interactive widgets, fallback rendering, export, and accessible alternatives.
36. **Citation integrity:** Connect each citation to the correct source passage, file page or line, title, timestamp, and accessible destination.
37. **Tool presentation:** Use understandable tool cards with status, target, progress, result summary, details, approvals, and safe error messages.
38. **Artifacts in chat:** Show real file cards, previews, thumbnails, generated media, downloads, and source links that remain valid after refresh.
39. **Message actions:** Verify copy, edit, retry, regenerate, share, read aloud, feedback, and any usage/statistics action that the product exposes.
40. **Untrusted rendering:** Sandbox generated content and sanitize markup; prevent scripts, links, or remote resources from escaping authorization boundaries.

### 5.6. Models, reasoning, and routing

41. **Current catalog:** Maintain dated model identities, endpoint versions, modalities, context limits, tool support, availability, and deprecation status.
42. **Selection experience:** Make automatic and explicit selection clear; preserve user choices and communicate any deliberate fallback or substitution.
43. **Reasoning controls:** Map effort settings to real provider capabilities rather than assuming every model supports the same names or values.
44. **Routing policy:** Balance task fitness, latency, quality, cost, privacy, reliability, and user preferences using measurable policies.
45. **Provider-specific features:** Retain optional provider extensions without baking provider names or unsupported capability assumptions into shared UI components.
46. **Usage and limits:** Expose meaningful context, rate-limit, quota, and cost information; distinguish subscription, API, local, and BYOK consumption.
47. **Migration behavior:** Test version changes, output-schema changes, retired endpoints, interrupted sessions, and reversible default-model updates.
48. **Quality evaluation:** Evaluate representative tasks, tools, formats, and languages; do not treat a vendor benchmark or multi-model agreement as proof.

### 5.7. Projects and collaborative workspaces

49. **Project lifecycle:** Create, rename, organize, archive, delete, and restore projects with stable links and clear ownership.
50. **Persistent context:** Manage project instructions, files, sources, repositories, environments, connectors, and retained decisions as explicit resources.
51. **Conversation membership:** Start chats within projects, move eligible chats, preserve references, and prevent project context leaking into unrelated work.
52. **Project memory modes:** Define personal, project-only, shared, and organization memory boundaries and explain their practical effects.
53. **Coordinated work:** Evaluate project goals, coordinator conversations, worker threads, dependencies, status, and aggregate results before adding complexity.
54. **Collaboration:** Specify member roles, invites, shared files, comments, ownership transfer, access removal, and concurrent editing behavior.
55. **Resources and budgets:** Show relevant run history, project usage, budgets, model settings, environments, and operational limitations.
56. **Project portability:** Plan export, import, schema upgrades, cross-device access, and recoverable migrations without silently replacing existing projects.

### 5.8. Memory and personalization

57. **Memory types:** Separate current context, conversation history, saved preferences, project knowledge, summaries, and long-term inferred memories.
58. **Inspectable memories:** Provide useful read, edit, delete, search, disable, and source-provenance controls instead of an opaque personalization switch.
59. **Consent and exclusions:** Require appropriate consent for sensitive information and honor temporary-chat, account, workspace, and category exclusions.
60. **Instruction precedence:** Ensure explicit current instructions override stale memories; record conflicts rather than silently preserving obsolete preferences.
61. **Retrieval policy:** Retrieve relevant memories with scope, freshness, confidence, and access checks; do not inject every stored fact into every prompt.
62. **Correction and deletion:** Propagate user corrections, removals, account disconnects, and retention changes through retrieval indexes and future sessions.
63. **Learning from work:** Evaluate explicit lessons and confirmed decisions as memory inputs; do not save secrets, tentative guesses, or transient tool output.
64. **Portability and review:** Support understandable import/export and review of automatically proposed memory changes without exposing another tenant’s information.

### 5.9. Files and Library

65. **Library organization:** Support browsing, search, folders, sorting, filters, multiple selection, previews, and clear uploaded-versus-connected origins.
66. **Connected storage:** Model external file IDs, original locations, access controls, account selection, freshness, and unsupported source operations.
67. **Persistent reuse:** Reuse eligible files across conversations and projects without unnecessary reuploads or loss of provenance.
68. **Document understanding:** Handle born-digital and scanned documents, tables, page images, spreadsheets, slides, and mixed content with explicit extraction limits.
69. **Scope and citations:** Honor selected files or folders, retrieve enough relevant content, and cite exact accessible sources instead of invented paths.
70. **Editing and versions:** Distinguish source edits, copies, exported derivatives, new versions, conflicts, and rollback; never overwrite the wrong original.
71. **Sharing and ownership:** Enforce viewer/editor roles, inherited permissions, revoked access, ownership changes, and shared-folder consequences.
72. **Lifecycle and retention:** Cover deletion, trash, expiry, missing sources, invalid links, revoked accounts, export, cleanup, and storage quotas.

### 5.10. Documents, spreadsheets, presentations, and artifacts

73. **Native editable outputs:** Evaluate real DOCX, XLSX, PPTX, PDF, text, and code outputs rather than visual facsimiles with misleading extensions.
74. **Templates:** Preserve instructed document structure, presentation layouts, spreadsheet formulas, branding, and references from supplied templates.
75. **Direct manipulation:** Provide applicable inline editing, selection-based changes, comments, versions, undo, redo, and conversational refinement.
76. **Preview fidelity:** Test previews, rendered pages, charts, fonts, pagination, accessibility, downloads, and the actual exported file.
77. **Interactive artifacts:** Sandbox generated apps, dashboards, visualizations, forms, and simulations; manage dependencies and data access deliberately.
78. **Sharing and publication:** Separate private preview, named-user sharing, organization sharing, and public publication with explicit permissions.
79. **Durability:** Retain artifact identity and revision history across turns, projects, app restarts, and follow-up edits.
80. **Honest completion:** Verify the artifact opens and works; report unsupported formats or incomplete export instead of presenting a fake download.

### 5.11. Search and deep research

81. **Search choices:** Benchmark automatic search, explicit search, focused search, source restrictions, and research mode with understandable controls.
82. **Research planning:** Evaluate clarification, editable plans, research scope, time horizon, cost awareness, and user steering before expensive execution.
83. **Retrieval execution:** Handle parallel queries, source filtering, deduplication, ranking, full-page reading, relevant follow-up retrieval, and inaccessible sources.
84. **Evidence quality:** Check primary sources, publication versus event date, conflicting evidence, quotation accuracy, uncertainty, and source relevance.
85. **Progress and intervention:** Expose useful progress, findings, visited sources, stopping, resuming, and redirection without fabricated activity.
86. **Research outputs:** Produce cited reports, comparisons, structured data, tables, and editable artifacts with traceable conclusions.
87. **Source combination:** Combine authorized internal data and public sources while preserving permissions, privacy boundaries, and source attribution.
88. **Failure and budgets:** Handle paywalls, blocked pages, stale sources, insufficient evidence, exhaustion, and budget limits without false completeness.

### 5.12. Connectors, tools, and account permissions

89. **Discovery:** Provide searchable connectors, tool capabilities, installation requirements, account status, and a clear path to useful first use.
90. **Multiple accounts:** Support explicit personal/work account selection, account labels, ambiguity resolution, and separation of credentials and permissions.
91. **Authentication lifecycle:** Handle consent, scope upgrades, refresh, expiry, revocation, reconnect, tenant restrictions, and secure credential storage.
92. **Tool contracts:** Validate schemas, inputs, results, pagination, resource identifiers, file references, and errors against the current connector API.
93. **Approval policies:** Offer understandable low-friction rules for eligible low-risk actions while preserving sensitive-action and organization constraints.
94. **Action confirmation:** Show intended action, account, recipients, resource, material changes, and consequences before required confirmations.
95. **State synchronization:** Reconcile remote changes, duplicate events, retries, stale reads, version conflicts, and partial writes without claiming atomic success.
96. **MCP compatibility:** Audit current protocol versions, transports, discovery, authorization, tool/resource distinctions, limits, and server isolation.

### 5.13. Skills, plugins, marketplaces, and extensibility

97. **Concept boundaries:** Define tools, connectors, instructions, skills, plugins, agents, workflows, and templates without conflating them.
98. **Packaging:** Use explicit manifests, schemas, compatibility ranges, capabilities, entry points, dependencies, and trustworthy publishers.
99. **Install lifecycle:** Handle discovery, install, configuration, update, disable, removal, migration, rollback, and unavailable dependencies.
100.  **Instruction loading:** Load relevant instructions progressively within context budgets; separate durable guidance from task data and untrusted external text.
101.  **Security review:** Inspect permissions, executable code, outbound access, supply-chain risks, version changes, and organization approval requirements.
102.  **Sharing and governance:** Support appropriate private, project, organization, and public distribution with clear ownership and revocation.
103.  **Execution visibility:** Show which skill or plugin is active, why it was selected, what it can access, and how a user can intervene.
104.  **Migration strategy:** Track competitor renames and retirements as evidence; migrate our own extensions only with compatibility analysis and recoverable user data.

### 5.14. Agents, long-running work, and orchestration

105. **Plan and execute:** Separate proposed plan, authorized execution, editable scope, outcome requirements, and user approval where needed.
106. **Run state machine:** Persist planned, queued, running, waiting, paused, completed, failed, and canceled states with reasons and timestamps.
107. **Delegation:** Evaluate coordinator/worker patterns, bounded parallelism, task ownership, dependencies, result verification, and shared-resource conflicts.
108. **Runtime placement:** Support deliberate local, managed cloud, BYOK, and hybrid execution with visible data movement and policy-controlled escalation.
109. **Steering and branching:** Keep active-run instructions, queued requests, immutable side chat, and independent branches semantically distinct.
110. **Scheduling and events:** Model one-time, recurring, and event-triggered jobs with timezone handling, account authorization, independent ownership, and real workers.
111. **Durability and control:** Implement checkpoints, leases, idempotency, cancellation, crash recovery, retry limits, expiry, and meaningful notification delivery.
112. **Outcome verification:** Verify deliverables and external effects; show partial completion, evidence, unresolved items, and the next safe action.

### 5.15. Browser, extensions, and computer use

113. **Execution environments:** Distinguish built-in isolated browser, existing browser session, cloud browser, and native desktop automation.
114. **Browser tasks:** Test navigation, tabs, downloads, uploads, forms, dynamic pages, waits, login takeover, and resumption after manual intervention.
115. **Chrome extension:** Inspect side panel, active-tab context, tab selection, page mentions, permissions, connection status, and handoff to other apps.
116. **Native messaging:** Secure any extension-to-desktop bridge with origin checks, authenticated pairing, version compatibility, and restricted commands.
117. **Site-provided tools:** Evaluate available structured site tools separately from DOM automation and screenshots; preserve website and action authorization.
118. **Sensitive interactions:** Keep credentials and verification codes out of model-visible logs where possible; require policy-defined confirmation for consequential actions.
119. **Computer control:** Model screen, accessibility, input, filesystem, and clipboard permissions with clear indicators, limits, and an immediate stop control.
120. **Adversarial content:** Treat pages, emails, documents, downloads, and tool outputs as untrusted; enforce egress and action constraints outside prompts.

### 5.16. Voice and realtime interaction

121. **Voice modes:** Distinguish text dictation, read-aloud, push-to-talk, live conversation, transcription, and agent delegation.
122. **Conversation feel:** Test latency, turn-taking, interruptions, simultaneous listening/speaking, silence, echo, noise, and reconnection.
123. **Backend separation:** Audit current provider designs for voice-to-backend delegation, independent reasoning, asynchronous tools, and session state.
124. **Voice controls:** Provide microphone, mute, stop, captions, input/output device selection, voice choice, and understandable connection state.
125. **Rich context:** Evaluate eligible files, projects, screen context, images, and tool results in voice without assuming all backends accept audio.
126. **Transcript integrity:** Handle interim versus final text, corrections, speaker attribution where supported, ordering, and conversation persistence.
127. **Background behavior:** Respect platform permissions and background limits; expose recording indicators, interrupted sessions, lock-screen controls, and expiry.
128. **Voice costs and safety:** Meter actual usage, disclose limits, preserve existing tool permissions, and avoid recording or cloud escalation without required consent.

### 5.17. Image, video, and audio generation

129. **Capability discovery:** Expose supported generation and editing modes, model compatibility, media limits, and appropriate sample inputs.
130. **Image creation:** Handle references, dimensions, aspect ratios, batches, progressive results, retries, cancellation, and transparent error states.
131. **Image editing:** Evaluate selections, masks, inpainting, outpainting, sketches, reference identity, revision history, and precise follow-up changes.
132. **Video workflows:** Inspect input references, duration, continuation, interpolation, editing, audio behavior, progress, and failed-generation recovery.
133. **Audio workflows:** Evaluate speech, transcription, music, sound generation, supported languages, timing, file formats, and usage restrictions.
134. **Media management:** Preserve prompts where appropriate, provenance, thumbnails, version relationships, downloads, sharing, and usable file metadata.
135. **Mixed outputs:** Render text plus images, video, audio, charts, files, and citations coherently in one conversation and in artifacts.
136. **Safety and economics:** Enforce applicable content policies, consent, size limits, moderation, budget controls, and honest treatment of charged failed jobs.

### 5.18. Coding, CLI, and IDE workflows

137. **Repository context:** Understand selected repos, branches, worktrees, project instructions, environment setup, generated files, and relevant code context.
138. **Code execution loop:** Connect plan, edit, diff, command execution, tests, diagnostics, review, and final verification to the actual workspace.
139. **CLI ergonomics:** Cover terminal rendering, keyboard navigation, streaming, resume, history, noninteractive use, structured output, and exit codes.
140. **VS Code experience:** Inspect editor context, selections, mentions, diagnostics, inline changes, diffs, approvals, terminal integration, and session persistence.
141. **Parallel isolation:** Isolate concurrent coding work with appropriate branches/worktrees or ownership; resolve overlapping edits before merging.
142. **Developer extensibility:** Audit agent SDKs, hooks, skills, MCP clients, plugins, custom tools, local models, and automation entry points.
143. **Local/cloud handoff:** Preserve identity, revision, context, artifacts, pending approvals, and execution semantics when moving coding sessions across surfaces.
144. **Developer safety:** Keep secrets out of context, restrict shell and network access, preserve user work, and require authorization for destructive or external changes.

### 5.19. Both desktop implementations

145. **Separate inventory:** Identify each Desktop implementation’s actual role, public/internal status, framework, repository paths, supported operating systems, and distribution channel.
146. **Shared versus native:** Share contracts and behavior where appropriate; preserve deliberate native functionality rather than making both apps redundant wrappers.
147. **Window management:** Test multiple windows, restoration, resizing, keyboard shortcuts, menus, tray/menu-bar behavior, notifications, and deep links.
148. **OS integration:** Inspect file associations, drag-and-drop, clipboard, screen capture, accessibility permissions, microphone, camera, and default-app interactions.
149. **Local runtime:** Cover model discovery, downloads, integrity checks, loading, hardware limits, memory pressure, offline operation, and cleanup.
150. **Remote control:** Authenticate device pairing, expose device-online state, expire grants, and distinguish local execution from cloud continuation.
151. **Installation and updates:** Validate packaging, signing, notarization where applicable, update integrity, rollback, compatibility, and migration failures.
152. **Resource behavior:** Measure startup, idle CPU, memory, battery, background activity, sleep/wake recovery, and degraded behavior under resource pressure.

### 5.20. Mobile and cross-device continuity

153. **Mobile-first interface:** Test touch targets, navigation, safe areas, orientation, keyboard overlap, sheets, gestures, and small-screen previews.
154. **Mobile input:** Handle camera, photos, files, share sheet, pasted links, dictation, accessibility input, and permission denial or revocation.
155. **Network conditions:** Handle offline startup, intermittent connectivity, metered data, reconnect, upload retries, and background restrictions.
156. **Cross-device objects:** Synchronize eligible conversations, project membership, files, preferences, artifacts, and run state without duplicate entities.
157. **Continuation semantics:** Resume rather than replay work; distinguish viewing a cloud run from requiring an online local device.
158. **Notifications:** Provide useful completion and approval notifications, deep links, quiet settings, dismissal behavior, and revoked-device handling.
159. **Local mobile inference:** Expose supported hardware/model limits, download size, storage, battery costs, offline guarantees, and any network-dependent tools.
160. **Privacy and publishing:** Keep platform privacy declarations, permission explanations, consent, account deletion, and store metadata accurate for each released app.

### 5.21. Security, privacy, and enterprise controls

161. **Runtime trust:** Enforce local, BYOK, managed, and hybrid boundaries independently of what the model claims or the interface displays.
162. **Authorization:** Apply server/runtime-side user, organization, project, resource, tool, and action authorization; test cross-tenant isolation.
163. **Secrets and egress:** Protect credentials, tokens, files, and sensitive context through secure storage, scoped access, redaction, and network restrictions.
164. **Privacy controls:** Explain memory, history, training use where applicable, retention, deletion, exports, connected data, and temporary-session behavior.
165. **Enterprise identity:** Evaluate roles, groups, SSO, provisioning, admin policy, account deactivation, domain controls, and auditability.
166. **Enterprise data:** Assess residency, customer-managed keys, retention, legal hold, data-loss prevention, and audit export against actual customer needs.
167. **Security operations:** Cover abuse prevention, rate limits, vulnerability response, dependency risk, plugin review, incident response, and emergency controls.
168. **Claims discipline:** Do not claim certifications, regulatory suitability, privacy guarantees, or contractual commitments without supporting evidence and appropriate review.

### 5.22. Billing, entitlements, and economics

169. **Entitlements:** Keep plan, organization, model, feature, runtime, and surface entitlements consistent and enforce them in trusted code.
170. **Usage accounting:** Reconcile requests, tokens, media, voice, storage, compute, retries, and credits without double charging.
171. **Quota messaging:** Show genuine limits, applicable reset times, next steps, alternative models, and upgrade options without fabricated countdowns.
172. **Subscription lifecycle:** Handle purchase, renewal, cancellation, downgrade, upgrade, proration, past-due status, and retained data consistently.
173. **Seats and organizations:** Model invitations, seat quantities, role changes, shared budgets, invoices, and administrator controls independently of personal plans.
174. **Payment reliability:** Verify webhook authenticity, idempotent processing, reconciliation, partial failures, refunds, taxes, and supported payment paths.
175. **Local and BYOK economics:** Explain what remains free or metered, which provider bills the user, and when managed services incur additional cost.
176. **Budget guardrails:** Bound autonomous work by approved spend, concurrency, duration, and recurring-job policy; surface projected versus actual usage.

### 5.23. Architecture, performance, and operations

177. **Capability registry:** Represent model, provider, tool, runtime, policy, plan, and surface capabilities declaratively rather than scattering hardcoded checks.
178. **Shared contracts:** Use typed canonical objects and events for conversations, messages, files, projects, runs, approvals, usage, and artifacts.
179. **Provider adapters:** Respect provider-native semantics while maintaining stable internal contracts, compatibility tests, and measurable fallback behavior.
180. **Durable execution:** Design queues, workers, leases, event ordering, idempotency, cancellation, checkpoints, and transactional boundaries for real failures.
181. **Latency and scale:** Measure first useful response, tool latency, rendering, history load, memory, concurrency, and tail latency before optimizing.
182. **Observability:** Correlate UI, gateway, provider, tool, worker, and billing events with safe trace identifiers and useful user-facing incident context.
183. **Deployment safety:** Use environment validation, reversible migrations, health checks, feature flags, compatibility windows, and rollback procedures.
184. **Cost and neutrality:** Prefer measured reuse and replaceable interfaces; avoid speculative abstractions or costly rewrites justified only by competitor rumors.

### 5.24. Quality assurance and release governance

185. **Evidence-based acceptance:** Define user-visible acceptance criteria, relevant competitor reference, actual repo paths, and verification evidence for each slice.
186. **Human interaction testing:** Click, type, drag, scroll, tap, navigate, reload, interrupt, deny permissions, and recover through actual user interfaces.
187. **Visual and accessible QA:** Check light/dark modes, responsive layouts, focus, screen readers, reduced motion, zoom, overflow, and empty/error states.
188. **Real integrations:** Use authorized real end-to-end tests for release claims; label fixtures and mocks as tests, never as shipped functionality.
189. **Failure injection:** Test provider outages, malformed streams, revoked accounts, missing files, quota exhaustion, worker crashes, and duplicate events.
190. **Seven-implementation matrix:** Mark each feature per implementation and public surface as verified, partial, broken, missing, intentionally unsupported, blocked, or not yet verified; retained internal code is not public availability.
191. **Release truth:** Distinguish local code, merged code, preview deployment, production deployment, published binary, and actual user availability.
192. **Completion gate:** Close a slice only after behavior, safety, relevant tests, artifacts, documentation, and known limitations match the claim.

## 6. Visual benchmarking and product decisions

For any significant visible feature, write a small reference specification before changing the UI. Include:

- The user’s task and the selected primary competitor reference, with date, account/plan, surface, and observation method.
- The navigation path, component structure, layout measurements where observed, interaction steps, keyboard/touch behavior, loading and error states, and output behavior.
- What AGI Workforce should match closely, what is deliberately different, and why the difference improves the user’s task or preserves an explicit product constraint.
- Screenshots or recordings of authorized observations when available; never invent screenshots or claim to have tested an inaccessible interface.
- Acceptance criteria for our own UI at appropriate desktop and mobile widths, including accessibility and the real end-to-end action behind each control.

Use one coherent AGI Workforce design system. Do not assemble a mismatched product by copying one competitor’s sidebar, another’s composer, and a third’s artifact controls without reconciling the interaction model. Where ChatGPT and Claude disagree, select the better reference for the specific user task and document the tradeoff; do not silently alternate patterns between apps.

Close parity includes detailed behavior: where a task opens, whether navigation interrupts it, how a file remains available, how a user changes course, which account an action uses, and what happens after failure. A polished static screen with a broken or mocked workflow is not parity.

## 7. Technology-stack and architecture rules

### 7.1 Do not invent private implementation details

The request to understand competitor technology means researching public engineering evidence, not guessing. UI appearance, a JavaScript bundle, a job listing, or one public repository is not proof of the whole production stack.

For a stack claim, record the exact component, official engineering/source reference, version or commit if available, and scope of the evidence. Mark reasonable deductions as inferred and undisclosed details as unknown. Distinguish “this public coding harness uses X” from “the entire company uses X.” Distinguish an old engineering article from a current implementation guarantee.

Do not migrate our framework, database, hosting provider, desktop runtime, or cloud just to imitate an unverified competitor. Preserve the current production stack unless a measured constraint or validated requirement justifies change. Document alternatives, benefit, risk, migration cost, reversibility, and tests in an architecture decision record.

### 7.2 Stable shared foundations; explicit specialized capability

Prefer canonical typed objects for identity, organization, project, conversation, message, source, file, artifact, memory, tool, plugin, approval, task, run, event, usage, and billing. Keep storage and runtime implementations behind appropriate existing interfaces; do not build speculative abstraction layers for imaginary requirements.

Use a capability registry that evaluates provider/model version, modality, tool contract, runtime, plan, organization policy, user consent, device support, and application surface. Preserve optional provider-native features; neutrality must not mean flattening every model to a lowest-common-denominator text endpoint.

Keep tool calls and provider responses behind validated adapters. Support ordered structured events, durable run state, idempotent writes, cancellation propagation, retries with limits, resumption, and observable errors. Do not mark completion until deliverables and externally visible effects have been checked.

Separate model selection from the agent harness, voice transport, browser environment, authorization, file storage, and execution workers. A voice provider change must not silently replace the application’s existing permission model. Local inference does not mean every connected tool or search operation is local.

Show trust modes and cloud escalation clearly. Enforce data egress and access boundaries in trusted server/runtime code. Prompts and confirmation-looking UI elements are not security boundaries by themselves. A low-friction approval preference must not bypass mandatory sensitive-action, administrator, or platform restrictions.

## 8. Repository memory and evidence files

This repository already owns durable product guidance under `docs/product/`,
dated external evidence under `docs/research/`, decisions under
`docs/decisions/`, and current implementation state under `docs/work/`. Reuse
those owners; do not create a duplicate competitive-document hierarchy.

```text
AGENTS.md                                           # concise standing rule and link
docs/product/competitive-guidance.md                # this policy and 192-point inventory
docs/research/*-YYYY-MM-DD.md                       # dated sources, observations and deltas
docs/product/surface-feature-matrix.{json,md}       # generated reachability inventory
docs/work/implementation-status.md                  # current implementation evidence
docs/decisions/README.md                            # governing product decisions
```

Add a source/claim registry only when a real consumer or guard will keep it
current. Do not create empty bureaucracy.

Keep the root `AGENTS.md` compact and point to the detailed material. Codex’s documented instruction discovery is hierarchical, and its default combined project-instruction limit is 32 KiB. Do not assume an arbitrary `MEMORY.md` file is automatically loaded, or that every later session remembers this conversation. Refer to the current instruction-discovery guide for the actual environment. [O08]

Use stable feature IDs from the checklist. Each evidence record should carry at least:

```text
feature_id; vendor; product; claim; source_url; publication_date; event_date;
verified_at; evidence_type; release_state; availability_constraints;
observation_method; contradiction_or_uncertainty; affected_apps;
repo_paths; our_status; implementation_decision; verification_evidence;
last_changed; next_review_trigger
```

Use `null` or `unknown` for unavailable facts; do not fabricate timestamps, plan coverage, or observations. Keep vendor evidence separate from our proposed design. Store concise summaries and links rather than copying whole vendor sites or private session content into the repository. Exclude secrets and unrelated personal information.

Suggested parity statuses: **verified working**, **partial**, **broken**, **missing**, **intentionally unsupported**, **blocked**, and **not verified**. “Not applicable” requires a reason tied to the actual app’s role. A feature that exists in source code is not automatically shipped or verified.

## 9. Work loop for the ongoing Codex session

For every meaningful implementation slice:

1. **Understand:** read current instructions, relevant architecture, actual implementation, and outstanding work. Respect uncommitted user changes.
2. **Verify references:** refresh the narrow set of competitor and provider documents relevant to the decision; inspect authorized UI for visual claims.
3. **Compare:** record the user-visible difference, affected apps, evidence, availability caveats, and intended behavior.
4. **Choose:** preserve an existing working approach, close a validated gap, or document an intentional deviation. Avoid novelty-driven rewrites.
5. **Implement:** make a small coherent change through the correct shared layer and necessary app-specific adapters.
6. **Verify:** run relevant tests and exercise the real workflow, including errors, permissions, reload, and affected cross-device behavior.
7. **Persist:** update the evidence/decision/status records and existing changelog or known-issues documentation as appropriate.
8. **Report:** state what changed, why, where, what was actually tested, remaining limitations, and the next bounded step.

Use parallel research for independent evidence collection. Parallel code changes require isolated worktrees/branches or explicit non-overlapping ownership. Shared task context does not make simultaneous edits to the same files safe.

Prioritize **P0:** working core journeys, data integrity, authorization, honest user states, and release-blocking bugs. Then **P1:** high-value, validated parity gaps and quick wins across the relevant apps. Reserve **P2:** experimental or limited-beta ideas for documented experiments with feature flags and success criteria.

Do not stop an otherwise feasible authorized task merely because a few tool calls have completed, but do not create an unbounded autonomous loop. Respect budget, permissions, runtime limits, and the current task boundary. Record specific blockers and continue independent work where possible. Never claim continued background progress without an actual running authorized system.

This policy does not grant permission to push, publish, send messages, buy services, change production data, deploy, apply destructive migrations, or grant access. Follow the user’s explicit authorization and the repository’s release process for those actions.

## 10. Acceptance and completion contract

A feature is complete only when its actual user journey works on the intended surfaces, its success and failure states are correct, relevant permissions are enforced, data survives the promised lifecycle, and verification supports the completion claim.

The completion report for a slice should contain:

```text
Feature / task:
Current official reference(s) and verification date:
Target behavior and any intentional difference:
Affected apps and changed paths:
Implementation and migration notes:
Tests and actual UI workflows executed:
Security/privacy/usage implications:
Verified outcome and remaining limitations:
Documentation updated:
Next bounded task:
```

Do not substitute compilation for product QA, screenshot similarity for functional parity, or a provider’s capability claim for a working integration. Clearly distinguish local implementation, merged code, preview, production, and store-published availability.

## 11. Applying the guidance during current work

Apply this policy without discarding existing instructions or abandoning the
authorized task. Use the verified seven-implementation inventory above, locate
the relevant shared contracts and known gaps, refresh only the official sources
needed for the feature, and continue with the smallest valuable end-to-end
slice. Record only verified claims.

The goal is not to accumulate competitor notes indefinitely. The goal is **AGI Workforce that feels familiar, polished, current, and trustworthy across its ecosystem, with working capabilities and justified architectural choices, not an outdated imitation or a collection of disconnected demos.**

## 12. Official source registry

Research access date for this initial registry: **September 22, 2026**. Follow links from these official indexes to the current specific feature, platform, pricing, security, migration, and SDK pages. Repair redirected or moved URLs by following the official site, not by inventing documentation paths. Public release notices dated September 21 or earlier anchor the requested baseline; live help/API documents require their own future refresh.

- **[O01] ChatGPT release notes:** https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- **[O02] ChatGPT plugins:** https://help.openai.com/en/articles/20001256
- **[O03] Planned custom GPT retirement and migration:** https://help.openai.com/en/articles/20001519
- **[O04] ChatGPT scheduled tasks:** https://help.openai.com/en/articles/10291617
- **[O05] Desktop site tools / WebMCP:** https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app
- **[O06] ChatGPT Privacy Center:** https://help.openai.com/en/articles/20001488
- **[O07] ChatGPT and Codex developer changelog:** https://learn.chatgpt.com/docs/changelog
- **[O08] Codex AGENTS.md instruction discovery:** https://learn.chatgpt.com/docs/agent-configuration/agents-md
- **[O09] OpenAI API documentation:** https://developers.openai.com/api/docs
- **[O10] GPT-Live architecture and getting started:** https://developers.openai.com/api/docs/guides/live
- **[O11] Migration from Realtime to GPT-Live:** https://developers.openai.com/api/docs/guides/live-migration
- **[A01] Claude release notes:** https://support.claude.com/en/articles/12138966-release-notes
- **[A02] Claude product announcement index:** https://claude.com/blog
- **[A03] Cowork and chat become one Claude, September 16, 2026:** https://claude.com/blog/cowork-is-now-claude
- **[A04] Redesigned Projects beta, September 17, 2026:** https://claude.com/blog/projects-redesigned
- **[A05] Claude in Chrome general availability, August 26, 2026:** https://claude.com/blog/claude-in-chrome-generally-available
- **[A06] Cowork built-in browser, August 26, 2026:** https://claude.com/blog/cowork-built-in-browser
- **[A07] Claude Docs guide:** https://support.claude.com/en/articles/16923645-get-started-with-claude-docs
- **[A08] Cross-device Cowork guide:** https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile
- **[A09] Claude Code overview:** https://code.claude.com/docs/en/overview
- **[A10] Anthropic engineering index:** https://www.anthropic.com/engineering
- **[A11] How we contain Claude, May 25, 2026:** https://www.anthropic.com/engineering/how-we-contain-claude
- **[P01] Perplexity changelog:** https://www.perplexity.ai/changelog
- **[P02] Effort Mode, portable/hybrid compute, and marketplace, September 21, 2026:** https://www.perplexity.ai/changelog
- **[P03] Computer in email, permissions, and Search as Code, August 24, 2026:** https://www.perplexity.ai/changelog
- **[P04] Projects, Windows Personal Computer, and Model Council, August 4, 2026:** https://www.perplexity.ai/changelog/shared-workspaces-personal-computer-for-windows-and-model-council
- **[G01] Gemini consumer release notes:** https://gemini.google/release-notes/
- **[G02] Gemini API changelog:** https://ai.google.dev/gemini-api/docs/changelog
- **[G03] Gemini Spark overview:** https://gemini.google/overview/agent/spark/
- **[G04] Gemini Personal Intelligence overview:** https://gemini.google/overview/personal-intelligence/
- **[G05] Gemini Canvas overview:** https://gemini.google/overview/canvas/
- **[M01] Manus product announcement index:** https://manus.im/blog
- **[M02] Manus product documentation:** https://manus.im/docs/introduction/welcome
- **[M03] Manus Plan Mode, July 22, 2026:** https://manus.im/blog/manus-plan-mode
- **[M04] Manus native PowerPoint slides, July 14, 2026:** https://manus.im/blog/manus-ppt-slides
- **[M05] Manus Branch, July 9, 2026:** https://manus.im/blog/manus-branch
- **[M06] Manus Schedules, May 18, 2026:** https://manus.im/blog/manus-schedules
- **[M07] Self-updating Projects, May 6, 2026:** https://manus.im/blog/manus-projects-self-updating
- **[M08] My Computer desktop, March 16, 2026:** https://manus.im/blog/manus-my-computer-desktop
- **[M09] Historical Manus context-engineering lessons, July 18, 2025:** https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
- **[X01] xAI / Grok announcements:** https://x.ai/news
- **[X02] Grok API documentation:** https://docs.x.ai/overview
- **[X03] xAI frontier-model announcement, September 21, 2026:** https://x.ai/news
- **[X04] Grok Voice Transcribe 2, September 18, 2026:** https://x.ai/news/grok-voice-transcribe-2
- **[X05] Grok Build Memory, September 16, 2026:** https://x.ai/news/grok-build-memory
- **[X06] Grok Bot, August 11, 2026:** https://x.ai/news/introducing-grok-bot
- **[X07] Grok Build open source, July 15, 2026:** https://x.ai/news/grok-build-open-source
