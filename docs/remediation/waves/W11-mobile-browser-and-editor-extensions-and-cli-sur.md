# W11 — Mobile, browser and editor extensions, and CLI surfaces

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** The remaining client surfaces, batched together because each is a small independent codebase whose defects are internal to it and because they consume the contracts fixed in W7 and W8 — settings namespace, entitlement ladder, model registry, agent runtime — so doing them now avoids implementing against a moving target. Within the wave they subdivide cleanly: mobile settings/sync/parity (custom instructions writing a different namespace, no cloud knowledge client, fire-and-forget dispatch, drawer and composer gaps, i18n), the Chrome extension defect bundle around the 10,933-line side_panel.ts hotspot, VS Code composer/session/account parity, and CLI parity commands plus the lsp_diagnostics stub and the unreferenced subagent_v2. The extension and CLI publishing blockers were already cleared in W3, so EXT-18 and the composer trust boundaries can actually be enabled here.

**Size.** 85 items (1 critical, 15 high, 37 medium, 32 low); 80 open.

**Done when.** A custom instruction, nickname or occupation set on mobile appears on web without edits, proven on a device; mobile uses the shared managed-cloud client and the shared usage-summary schema rather than hand-rolled calls; adding sources to a cloud project works or the control is absent; dispatch acknowledges tasks and approvals with retry so none are silently dropped; streaming or status feedback appears within two seconds of send. Mobile drawer, composer, tasks, projects and settings expose every reachable destination with no dead rows, and non-English locales render beyond the two language-picker screens. Chrome side_panel.ts is decomposed under a size budget with a guard, the dishonest toggle, fake capture success, dead console panel, fake provider pill and clickable hidden FAB are gone, no scheduled output is dropped after burning a paid turn, and the vestigial cloud-unlock path is deleted. VS Code composer is enabled against a published protocol-7 CLI for each trust boundary, the effort picker shows selected state, queue and context budget are visible, and CodeLens fires on comment TODOs. CLI lsp_diagnostics returns real diagnostics or is removed, /task cancel works, /effort applies what it acknowledges, marketplace search returns results or reports its registry is undeployed, subagent_v2 is wired or deleted, and exec_policy has completed its move into the shared execpolicy crate.

| ID                | Sev      | Item                                                                                                                                                                                                                                                            | Effort |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [MOB-41](#mob-41) | CRITICAL | Every tap to open a completed generated video on mobile is a silent no-op in production                                                                                                                                                                         | S      |
| [CLI-01](#cli-01) | HIGH     | CLI lsp_diagnostics is a stub that always reports success with no diagnostics                                                                                                                                                                                   | M      |
| [CLI-21](#cli-21) | HIGH     | CLI MCP elicitation is implemented but never wired into the live TUI                                                                                                                                                                                            | M      |
| [EXT-22](#ext-22) | HIGH     | Shared @agiworkforce/ui component library does not reach the Chrome or VS Code extensions (113/54/0/0 import split)                                                                                                                                             | L      |
| [EXT-23](#ext-23) | HIGH     | Chrome extension markdown renderer has no tables, no images, no math and no code syntax highlighting                                                                                                                                                            | M      |
| [EXT-24](#ext-24) | HIGH     | Chrome extension side panel exposes no response actions beyond a whole-message Copy button                                                                                                                                                                      | M      |
| [EXT-33](#ext-33) | HIGH     | VS Code's static webview content is unmodularized and a second execution stack still needs removal or explicit isolation                                                                                                                                        | L      |
| [EXT-40](#ext-40) | HIGH     | VS Code static webview content is unmodularized and a second execution stack remains unreconciled                                                                                                                                                               | L      |
| [MOB-08](#mob-08) | HIGH     | Mobile shows no reasoning, status or streaming feedback for up to 60 seconds after send                                                                                                                                                                         | L      |
| [MOB-09](#mob-09) | HIGH     | Mobile custom instructions, nickname and occupation never sync because mobile writes a different settings namespace                                                                                                                                             | M      |
| [MOB-10](#mob-10) | HIGH     | Mobile 'Add sources' to a project is a silent no-op for cloud projects; mobile has no cloud knowledge client at all                                                                                                                                             | M      |
| [MOB-12](#mob-12) | HIGH     | Mobile remote-control dispatch is fire-and-forget: tasks and approvals can be silently dropped                                                                                                                                                                  | L      |
| [MOB-42](#mob-42) | HIGH     | Mobile Skills catalog screen lost its drawer nav entry to an unrelated commit and was restored                                                                                                                                                                  | S      |
| [MOB-58](#mob-58) | HIGH     | Mobile sync flags and naming are not reconciled with actual Cloud sync behavior                                                                                                                                                                                 | M      |
| [SEC-69](#sec-69) | HIGH     | VS Code Local/BYOK/Managed-Cloud trust-boundary regression suite is red (17 failing, 13 of them trust-boundary assertions) so nothing defends the boundary                                                                                                      | S      |
| [UI-39](#ui-39)   | HIGH     | Desktop pairing instructions name a mobile menu item ('Desktop Companion') that does not exist in the mobile app                                                                                                                                                | S      |
| [CLI-08](#cli-08) | MEDIUM   | 'agi marketplace search' silently returns an empty list because its registry is not deployed                                                                                                                                                                    | M      |
| [EXT-01](#ext-01) | MEDIUM   | Chrome side_panel.ts is a 10,933-line unbounded ownership hotspot and is still growing                                                                                                                                                                          | XL     |
| [EXT-02](#ext-02) | MEDIUM   | Chrome extension residual defect bundle: dishonest toggle, dropped scheduled output that burns a paid turn, fake capture success, dead Console panel, fake provider pill, clickable hidden FAB                                                                  | L      |
| [EXT-10](#ext-10) | MEDIUM   | VS Code composer control parity: effort picker leaves the webview with no selected state, no thinking/model-switch in the actions menu, no plugins/skills in the + menu, hardcoded Enter send, queue exists with no UI, context budget computed but never shown | L      |
| [EXT-11](#ext-11) | MEDIUM   | VS Code session and history UX: history lives in a separate TreeView, no session browser, Rewind is permanently stubbed, no persistent Goal                                                                                                                     | L      |
| [EXT-12](#ext-12) | MEDIUM   | VS Code account, usage and preference surfaces are thin: no credits balance, single aggregate usage bar, no memory controls, no language control, no shortcuts entry point                                                                                      | L      |
| [EXT-25](#ext-25) | MEDIUM   | Chrome extension composer hand-mirrors the shared ChatInput via a comment instead of importing it, and has already drifted                                                                                                                                      | L      |
| [EXT-27](#ext-27) | MEDIUM   | Chrome extension has no Skills, Plugins or Connectors management surface at all                                                                                                                                                                                 | L      |
| [EXT-28](#ext-28) | MEDIUM   | Chrome extension has no manual web-search toggle and no Deep Research entry point                                                                                                                                                                               | M      |
| [EXT-30](#ext-30) | MEDIUM   | Chrome extension's AGI Work surface is a workflow UI, not real Cloud Work                                                                                                                                                                                       | M      |
| [EXT-31](#ext-31) | MEDIUM   | VS Code developer-session checkpoint UI is not built and is contractually forbidden by the current command-parity contract                                                                                                                                      | L      |
| [EXT-34](#ext-34) | MEDIUM   | VS Code E2E: one spec fails with 'Language model unavailable' and may be a real regression                                                                                                                                                                      | S      |
| [MOB-11](#mob-11) | MEDIUM   | Mobile hand-rolls its cloud chat calls instead of using the shared managed-cloud client                                                                                                                                                                         | M      |
| [MOB-13](#mob-13) | MEDIUM   | Mobile Cloud auto-memory runs a client-side consolidation write before provider success, racing the server-owned fact                                                                                                                                           | S      |
| [MOB-19](#mob-19) | MEDIUM   | Mobile media generation gaps: no reference images, unverified video aspect/quality, unverified file rendering                                                                                                                                                   | M      |
| [MOB-20](#mob-20) | MEDIUM   | Mobile bottom sheets were dead until the library upgrade and their contents have never been audited                                                                                                                                                             | M      |
| [MOB-22](#mob-22) | MEDIUM   | Mobile Tasks screen has no timestamps and no way to dismiss a finished run                                                                                                                                                                                      | S      |
| [MOB-28](#mob-28) | MEDIUM   | Mobile i18n covers only the two language-picker settings screens; Cloud sign-in and most surfaces are literal English                                                                                                                                           | L      |
| [MOB-30](#mob-30) | MEDIUM   | Mobile chat-history, memory and data controls lack archive, delete-all, audio consent and web-search controls                                                                                                                                                   | M      |
| [MOB-31](#mob-31) | MEDIUM   | Mobile settings information architecture: unreachable screens, missing identity rows, buried destinations                                                                                                                                                       | M      |
| [MOB-32](#mob-32) | MEDIUM   | Mobile drawer omits Code and Dispatch, caps recents at 8 with no overflow, and hides Work mode in the + sheet                                                                                                                                                   | M      |
| [MOB-34](#mob-34) | MEDIUM   | Mobile composer and model controls: no empty-chat quick actions, effort slider instead of tiers, no dispatch/code model picker                                                                                                                                  | M      |
| [MOB-43](#mob-43) | MEDIUM   | Mobile artifact viewer lacks version history and publish-to-link, both of which web has                                                                                                                                                                         | M      |
| [MOB-44](#mob-44) | MEDIUM   | Mobile has no follow-up message queue; sending mid-response aborts the running turn instead of queuing                                                                                                                                                          | M      |
| [MOB-45](#mob-45) | MEDIUM   | Mobile regex markdown parser silently drops nested-list structure and inline formatting inside table cells                                                                                                                                                      | S      |
| [MOB-46](#mob-46) | MEDIUM   | Mobile's no-hardcoded-colour guard and its 640-entry baseline are not wired into CI despite explicit 'will fail CI' language                                                                                                                                    | S      |
| [MOB-47](#mob-47) | MEDIUM   | Mobile has no automated accessibility testing and roughly half of its touch targets lack an accessibility label                                                                                                                                                 | L      |
| [MOB-48](#mob-48) | MEDIUM   | Reduced-motion OS preference is respected in only 2 of 23 mobile animation-driving files                                                                                                                                                                        | M      |
| [MOB-49](#mob-49) | MEDIUM   | Mobile edge-case UX library (9 copy-locked, tested modals) has zero import sites and no sensor ever triggers it                                                                                                                                                 | M      |
| [MOB-52](#mob-52) | MEDIUM   | MS-20 trusted-contact flow is a dead announcement card with no real enrolment                                                                                                                                                                                   | L      |
| [MOB-54](#mob-54) | MEDIUM   | MS-13 background / lock-screen voice decided but not built (needs UIBackgroundModes audio and a surviving session)                                                                                                                                              | L      |
| [MOB-55](#mob-55) | MEDIUM   | MS-16 safety model fallback (retry path, then the toggle) decided but not built                                                                                                                                                                                 | M      |
| [MOB-56](#mob-56) | MEDIUM   | MS-4 live video / screen share in voice decided but not built; needs a streaming media contract with Local-Mode egress consent                                                                                                                                  | XL     |
| [MOB-57](#mob-57) | MEDIUM   | MS-2/MS-22 superseded: mobile may no longer treat Plugins and Skills as out of scope because Connectors exists, so real builds are now required                                                                                                                 | L      |
| [MOB-59](#mob-59) | MEDIUM   | Mobile edge-case UX library ships 9 modals that are copy-locked, render-tested, and imported by nothing, with no sensor able to trigger them                                                                                                                    | M      |
| [SEC-79](#sec-79) | MEDIUM   | Trusted-contact crisis notification is explicitly declined on web, but mobile ships a dead announcement card and a founder-approved enrolment flow that was never built                                                                                         | M      |
| [UI-52](#ui-52)   | MEDIUM   | Mobile has no follow-up queue while streaming — sending mid-response aborts the current turn instead of queuing                                                                                                                                                 |        |
| [CLI-06](#cli-06) | LOW      | apps/cli/src/subagent_v2.rs (862 lines) is declared but referenced by nothing outside itself                                                                                                                                                                    | S      |
| [CLI-07](#cli-07) | LOW      | CLI '/task cancel' is rejected even though subagent.cancel() exists and a 'cancelled' state is advertised                                                                                                                                                       | S      |
| [CLI-11](#cli-11) | LOW      | Several CLI parity commands overstate their verb; /effort silently acknowledges without applying                                                                                                                                                                | S      |
| [CLI-12](#cli-12) | LOW      | CLI browser-control documentation overclaims capability                                                                                                                                                                                                         | S      |
| [CLI-13](#cli-13) | LOW      | CLI skills tool is built and tested but unavailable in production without a non-empty SKILLS_LAYERS catalog                                                                                                                                                     | S      |
| [CLI-16](#cli-16) | LOW      | CLI exec_policy.rs rename to the shared execpolicy crate is unfinished restructure work                                                                                                                                                                         | L      |
| [CLI-26](#cli-26) | LOW      | CLI sandbox.rs uses a whole-file #![allow(dead_code, unused_imports)] instead of scoped allows                                                                                                                                                                  | S      |
| [EXT-03](#ext-03) | LOW      | Chrome extension retains a vestigial cloud-unlock mechanism with no consumer                                                                                                                                                                                    | S      |
| [EXT-05](#ext-05) | LOW      | Chrome composer and history UX gaps: no reasoning-effort control, history two clicks deep with no search, attach menu image-only                                                                                                                                | M      |
| [EXT-13](#ext-13) | LOW      | VS Code CodeLens skips comments, so a TODO/FIXME cannot be turned into a task                                                                                                                                                                                   | S      |
| [EXT-14](#ext-14) | LOW      | VS Code vscode.lm fallback setting was removed as dead and the underlying fallback remains unbuilt                                                                                                                                                              | M      |
| [EXT-15](#ext-15) | LOW      | VS Code agent.maxIterations setting was removed; the cross-lane wiring into the CLI agent loop is still unbuilt                                                                                                                                                 | M      |
| [EXT-16](#ext-16) | LOW      | VS Code re-declares a lenient subset of the shared usage-summary schema                                                                                                                                                                                         | S      |
| [EXT-19](#ext-19) | LOW      | No web settings page manages the Chrome extension's enable state or site permissions                                                                                                                                                                            | M      |
| [EXT-29](#ext-29) | LOW      | Chrome extension notification control is a single flat toggle with no per-category granularity                                                                                                                                                                  | S      |
| [EXT-32](#ext-32) | LOW      | VS Code extension has no voice capability                                                                                                                                                                                                                       | L      |
| [EXT-39](#ext-39) | LOW      | Chrome extension scheduled-task origin check fails open for legacy unstamped tasks                                                                                                                                                                              | S      |
| [MOB-24](#mob-24) | LOW      | Mobile model chip may briefly show the wrong model immediately after selection                                                                                                                                                                                  | S      |
| [MOB-25](#mob-25) | LOW      | Mobile legacy invite/waitlist UI is dead after public alpha and the waitlist store is misused as an entitlement mirror                                                                                                                                          | S      |
| [MOB-26](#mob-26) | LOW      | Mobile legacy voice screen diverges visually and lacks text fallback, mode preference and thinking label                                                                                                                                                        | M      |
| [MOB-33](#mob-33) | LOW      | Mobile pairing and dispatch onboarding: no stepped wizard, no troubleshooting checklist, no email-link path                                                                                                                                                     | M      |
| [MOB-35](#mob-35) | LOW      | Mobile projects, library and schedules lack search, filters, templates and identity affordances                                                                                                                                                                 | M      |
| [MOB-36](#mob-36) | LOW      | Mobile settings gaps for approval policy, tool loading, cloud browser, connector discovery, voice and notifications                                                                                                                                             | M      |
| [MOB-37](#mob-37) | LOW      | Mobile has no in-app feature-announcement or education pattern for capability rollouts                                                                                                                                                                          | S      |
| [MOB-39](#mob-39) | LOW      | Mobile declined-capability decisions recorded to prevent re-raising                                                                                                                                                                                             | S      |
| [MOB-40](#mob-40) | LOW      | Mobile has no medical/health profile or HealthKit integration despite audit expectations                                                                                                                                                                        | S      |
| [MOB-50](#mob-50) | LOW      | Pre-drawer sidebar implementation (7 files) is fully superseded and dead on Mobile                                                                                                                                                                              | S      |
| [MOB-51](#mob-51) | LOW      | Mobile widget-setup screen has no navigation entry point anywhere                                                                                                                                                                                               | S      |
| [MOB-53](#mob-53) | LOW      | MS-6 location capability (expo-location, coarse-location preference, excluded from Local Mode) decided but not built                                                                                                                                            | M      |
| [SEC-74](#sec-74) | LOW      | Chrome extension scheduled-task origin check fails open for legacy pre-origin-stamp tasks — the only fail-open branch in an otherwise fail-closed provenance gate                                                                                               | S      |
| [SEC-86](#sec-86) | LOW      | Chrome extension site allowlist has no default-permission policy — only a static approved-sites list with no stated behavior for sites not on it                                                                                                                | S      |
| [UI-53](#ui-53)   | LOW      | Chrome extension send-button tooltip claims a Cmd+Enter shortcut that does not exist                                                                                                                                                                            | S      |

---

### MOB-41 — Every tap to open a completed generated video on mobile is a silent no-op in production

`CRITICAL` · mobile · effort S

**What.** VOICE-MEDIA-002: generateVideo() returns the server's relative /api/files/{assetId} path unmodified. GeneratedVideo.tsx passes it straight to openExternalUrl, whose isAllowedExternalUrl gate calls new URL(input), which throws on a relative string, is caught, and returns false with only a **DEV**-gated console.warn — no user-facing error. The onPress handler discards the returned boolean, so in production every tap does nothing. Mobile's sibling resolveGeneratedImageUri already implements the correct absolutization for images; video was never given the equivalent. Sharper and more actionable than MOB-19's 'unverified video aspect/quality, unverified file rendering'.

**Done when.** Add resolveGeneratedVideoUri(path) to videogen.ts mirroring resolveGeneratedImageUri exactly, call it before video_url reaches GeneratedVideo.tsx, and surface openExternalUrl's false return as a visible error toast.

**Where.** `apps/mobile/src/features/video/services/videogen.ts:123-152`, `apps/mobile/src/features/chat/components/GeneratedVideo.tsx:29-46`, `apps/mobile/lib/safeOpenURL.ts:49-79`, `apps/mobile/src/features/image/services/imagegen.ts:100-117`

**From.** audit/parity-2026-08-15 VOICE-MEDIA-002

### CLI-01 — CLI lsp_diagnostics is a stub that always reports success with no diagnostics

`HIGH` · cli · effort M

**What.** Verified verbatim in apps/cli/src/features/exec/tools/task*registry/mod.rs: execute_lsp_diagnostics ignores its args (`let * = args;`) and returns success:true with a note admitting the basic LSP client does not subscribe to publishDiagnostics yet. It is dispatched live and offered on every session, so the agent confidently reports a file 'clean' when it never checked.

**Done when.** Subscribe to textDocument/publishDiagnostics and return real diagnostics, or return success:false with an explicit unsupported result so the agent cannot infer cleanliness.

**Where.** `apps/cli/src/features/exec/tools/task_registry/mod.rs:498-508`

**From.** docs/agent-context/phase4-capability-audit.md (PP-14); AuditRemediationLedger.md (PP-14)

### CLI-21 — CLI MCP elicitation is implemented but never wired into the live TUI

`HIGH` · cli · effort M

**What.** frontend-experience-contract.md §14 P1 item 5: 'Wire CLI MCP elicitation into the live TUI.' The capability exists but the interactive surface never surfaces it, so an MCP server that elicits input cannot be answered from the CLI.

**Done when.** Wire the existing MCP elicitation handler into the live TUI's prompt loop and add a test that an elicitation request renders and can be answered.

**Where.** `apps/cli/src/tui/`, `crates/agiworkforce-mcp/`

**From.** docs/current/frontend-experience-contract.md §14 P1 item 5

**Folded in.** CLI MCP elicitation is implemented but not wired into the live TUI

### EXT-22 — Shared @agiworkforce/ui component library does not reach the Chrome or VS Code extensions (113/54/0/0 import split)

`HIGH` · extension · effort L

**What.** DESIGN-SYSTEM-002: @agiworkforce/ui's 56 primitives (with real a11y engineering) are imported in 113 web files and 54 desktop files and zero files under extension, extension-vscode, mobile or cli. The Chrome extension has no @agiworkforce/ui dependency and is hand-rolled vanilla DOM (0 .tsx files). The Spinner.tsx primitive's own doc comment records a real prior incident of exactly this drift failure mode (desktop silently dropped role='status'), so the risk is demonstrated, not hypothetical.

**Done when.** Extract a thin framework-agnostic control-contract doc (or a headless CSS layer keyed to the shared design-token custom properties) so hand-rolled DOM controls can be checked against the same focus/contrast/ARIA rules.

**Where.** `packages/ui/ui/src/primitives/`, `apps/extension/package.json`, `apps/extension-vscode/package.json`, `packages/ui/ui/src/primitives/Spinner.tsx:1-9`

**From.** audit/parity-2026-08-15 DESIGN-SYSTEM-002; audit/parity-2026-08-15 — DESIGN-SYSTEM-002

**Folded in.** Shared @agiworkforce/ui component library does not reach the Chrome or VS Code extensions (113/54/0/0 import split)

### EXT-23 — Chrome extension markdown renderer has no tables, no images, no math and no code syntax highlighting

`HIGH` · extension · effort M

**What.** RENDERING-002: renderMarkdown() has no table handling (pipes render literally), sanitizeHtml explicitly sets FORBID_TAGS 'img' / FORBID_ATTR 'src', there is no math/LaTeX handling at all, and code fences render as bare <pre><code> with no language class and no highlighting library wired anywhere in the extension.

**Done when.** Wire a lightweight syntax highlighter (highlight.js, already a dependency elsewhere), add a table renderer, relax the img restriction to an allowed tag scoped to http(s)/data sources with a DOMPurify hook, and add bundled KaTeX math rendering.

**Where.** `apps/extension/src/features/side-panel/markdown.ts:96-179`, `apps/extension/src/features/side-panel/bubbles.ts:231,677`

**From.** audit/parity-2026-08-15 RENDERING-002; audit/parity-2026-08-15 — RENDERING-002

**Folded in.** Chrome extension markdown renderer has no tables, no images, no math and no code syntax highlighting

### EXT-24 — Chrome extension side panel exposes no response actions beyond a whole-message Copy button

`HIGH` · extension · effort M

**What.** RENDERING-005: the only response action anywhere in the side panel is Copy, duplicated at two separate bubble-construction sites. A grep for regenerate/edit/share/readAloud/feedback/fork across the entire side-panel source tree returns zero hits. Distinct from EXT-02's residual defect bundle and EXT-05's composer/history gaps.

**Done when.** Add a Regenerate button that resends through the existing side-panel send path, and a thumbs up/down pair persisted through the same feedback endpoint web and mobile already call.

**Where.** `apps/extension/src/features/side-panel/bubbles.ts:241-262,705-724`

**From.** audit/parity-2026-08-15 RENDERING-005; audit/parity-2026-08-15 — RENDERING-005

**Folded in.** Chrome extension side panel exposes no response action beyond a whole-message Copy button

### EXT-33 — VS Code's static webview content is unmodularized and a second execution stack still needs removal or explicit isolation

`HIGH` · extension · effort L

**What.** frontend-experience-contract.md §14 P1 item 3 and §12.5: 'Modularize VS Code's static webview content and remove/reconcile the second execution stack' — specifically, remove the secondary provider-stream settings path or explicitly isolate it as a separate feature. Two execution stacks in one extension is the same class of ownership hazard as EXT-01's side_panel.ts monolith, but on the VS Code surface.

**Done when.** Split webviewContent.ts into domain modules, then either delete the secondary provider-stream settings path or isolate it behind an explicitly named feature boundary.

**Where.** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`

**From.** docs/current/frontend-experience-contract.md §14 P1 item 3, §12.5

### EXT-40 — VS Code static webview content is unmodularized and a second execution stack remains unreconciled

`HIGH` · extension · effort L

**What.** docs/current/frontend-experience-contract.md §14 P1 item 3 and §12.5: 'Modularize VS Code's static webview content and remove/reconcile the second execution stack; remove the secondary provider-stream settings path or explicitly isolate it as a separate feature.' A duplicate execution path inside one extension is a live drift surface, not just a code-organization concern.

**Done when.** Split webviewContent.ts by domain, then either delete the secondary provider-stream execution path or explicitly isolate and document it as a separate feature.

**Where.** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`

**From.** docs/current/frontend-experience-contract.md §14 P1 item 3, §12.5

### MOB-08 — Mobile shows no reasoning, status or streaming feedback for up to 60 seconds after send

`HIGH` · mobile · effort L

**What.** Founder-reported: after send, the transcript sits completely blank for up to 60s — no thinking block, no status steps, no streaming indicator — even though ThinkingChip, StatusStep, AgentActivityTimeline and StreamingIndicator all exist and none render. Root-cause-adjacent: managed-cloud SSE carries reasoning only as token counts and stream-transform.ts never emits a reasoning TEXT delta, so MessageBubble's reasoning!==undefined gate can never fire — proven on device and misdiagnosed twice as 'the model doesn't think'. Mobile also drops x_research_status and x_research_plan events entirely, showing nothing for research runs lasting up to 4 minutes.

**Done when.** Emit reasoning text deltas and research-phase events through stream-transform and the SSE parser, and mount the existing status/thinking/streaming components on the mobile message store.

**Where.** `apps/mobile/src/features/chat/components/MessageBubble.tsx:168`, `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts`, `apps/mobile/.../toolCallAccumulator.ts:99,143-178`

**From.** ExecutionPlan.md (Mobile test pass 2026-08-13, P1); docs/agent-context/known-flaws.md (VOICE-REASONING-TEXT-NOT-STREAMED); docs/agent-context/phase4-capability-audit.md (PP-04)

**Folded in.** VOICE-REASONING-TEXT-NOT-STREAMED: 'Thought for Ns' chip can never render on a managed-cloud turn; Mobile Deep Research drops research-phase/plan events

### MOB-09 — Mobile custom instructions, nickname and occupation never sync because mobile writes a different settings namespace

`HIGH` · mobile · effort M

**What.** Web and desktop-cloud write and read general.instructions; mobile writes and reads a separate namespace (personalization.customInstructions), and mobile's CloudSettings interface has no `general` member, so a pulled general namespace is never applied. The same divergence affects the nickname and occupation fields. Web meanwhile claims 'Synced to your account'.

**Done when.** Point mobile at the canonical general.\* namespace (with a one-time migration from the personalization keys) and add a cross-surface contract test for the instruction fields.

**Where.** `apps/mobile/services/cloudSettingsMapping.ts:125-137,188`

**From.** docs/agent-context/phase4-capability-audit.md (PP-08)

### MOB-10 — Mobile 'Add sources' to a project is a silent no-op for cloud projects; mobile has no cloud knowledge client at all

`HIGH` · mobile · effort M

**What.** DocumentPicker has no type filter and addSource() writes only into the local zustand store, so for a cloud project the id lives in cloudProjectStore and the .map() matches nothing — the upload silently disappears. grep for createManagedCloudProjectKnowledgeClient finds only web and desktop.

Also recorded by a later audit (Mobile 'Add sources' control closes doing nothing (PP-09)): Independently re-confirmed as a live dead control in the phase4 capability audit (PP-09), alongside PP-23/PP-32 desktop notification switches, and named in HANDOFF.md §4 as a real defect rather than an over-claim.

Also recorded by a later audit (Mobile 'Add sources' control closes doing nothing (PP-09)): phase4-capability-audit.md PP-09 confirms the dead control from live product testing rather than source reading, corroborating MOB-10's 'silent no-op for cloud projects'.

Also recorded by a later audit (PP-09: mobile 'Add sources' control closes doing nothing (HANDOFF.md §4)): Independent second confirmation of the register's finding, framed as a dead control rather than a cloud-project limitation: the control closes with no effect at all. Useful as a reproduction note — the failure is silent from the user's perspective, with no error surfaced.

**Done when.** Adopt createManagedCloudProjectKnowledgeClient on mobile for cloud projects, add a type filter to the picker, and surface an error instead of a silent no-op when the project id is not local.

**Where.** `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:126-128,155-172`, `apps/mobile/src/features/projects/store.ts:190-206`

**From.** docs/agent-context/phase4-capability-audit.md (PP-09); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### MOB-12 — Mobile remote-control dispatch is fire-and-forget: tasks and approvals can be silently dropped

`HIGH` · mobile · effort L

**What.** Mobile treats its signed control send as acceptance, so a lost task dispatch can stay 'sending' forever and an approval choice can disappear before Desktop accepts it. Needs a versioned signed control.receipt, a bounded pending map with timeout and retry, and idempotent Desktop replay. Explicitly recorded as an engineering ownership boundary that must land end to end.

**Done when.** Add a versioned signed control.receipt to the cross-device contract, a bounded pending map with timeout/retry on mobile, and idempotent replay handling on desktop.

**Where.** `packages/contracts/types/src/cross-device.ts`, `apps/mobile/stores/connectionStore.ts`

**From.** ExecutionPlan.md (Mobile parity audit TODO)

### MOB-42 — Mobile Skills catalog screen lost its drawer nav entry to an unrelated commit and was restored

`HIGH` · mobile · effort S · **resolved**

**What.** EXTENSIBILITY-001 / SHELL-NAV-IA-003 / CPS-08 (prior art GAP-001, verified REGRESSED): SkillsScreen.tsx (655 lines) is a complete, Cloud-mode-gated Skills catalog registered at /(app)/skills, but commit 1e858a7f1 removed the drawer row from DrawerContent.tsx's PRIMARY_ITEMS and changed drawer-content.test.tsx to assert the row's absence, while a settings comment still claimed a supported drawer entry. Sources disagree on current state: the parity audit records it open, while FIXES-APPLIED.md records it fixed ('Mobile Skills nav restored... it was collateral damage, not a decision'). DrawerContent.tsx is modified in the current working tree, consistent with the fix. Recorded rather than dropped because the two sources conflict.

**Done when.** Confirm the restored Skills row renders in a built app, remove the now-false settings comment, and keep the drawer test asserting presence rather than absence so the regression cannot recur.

**Where.** `apps/mobile/src/features/drawer/components/DrawerContent.tsx:43,62-100`, `apps/mobile/src/features/skills/SkillsScreen.tsx`, `apps/mobile/src/features/settings/index.tsx:636-638`

**From.** audit/parity-2026-08-15 EXTENSIBILITY-001; audit/parity-2026-08-15 SHELL-NAV-IA-003; audit/competitive-gap-2026-08-15 CPS-08 + FIXES-APPLIED.md; audit/ui-gaps GAP-001

### MOB-58 — Mobile sync flags and naming are not reconciled with actual Cloud sync behavior

`HIGH` · mobile · effort M

**What.** frontend-experience-contract.md §14 P1 item 6: 'Reconcile Mobile sync flags/naming with actual Cloud sync behavior.' Distinct from MOB-11 (mobile hand-rolls cloud chat calls instead of using the shared managed-cloud client) — this is about flag/name semantics diverging from what sync actually does, which makes the surface's own state claims untrustworthy.

**Done when.** Audit each mobile sync flag against observed Cloud sync behavior and rename or rewire so the flag names describe what actually happens.

**From.** docs/current/frontend-experience-contract.md §14 P1 item 6

### SEC-69 — VS Code Local/BYOK/Managed-Cloud trust-boundary regression suite is red (17 failing, 13 of them trust-boundary assertions) so nothing defends the boundary

`HIGH` · security/auth · effort S

**What.** CROSS-SURFACE-006 / red-test-suites.md §1 (audit/parity-2026-08-15). 17 failing / ~845-862 passing across 5 files in apps/extension-vscode. A real hardening commit (1e858a7f1) switched Config.model() to a globalValue-only read via .inspect() so a checked-out repo's .vscode/settings.json cannot silently move a user's trust boundary; chatParticipant.test.ts and usageMeterTrustBoundary.test.ts mock only .get(), not .inspect(), so Config.model() falls back to 'auto' under test. 13 of 17 failures are trust-boundary assertions: usageMeterTrustBoundary.test.ts (6) asserts a local model reports as Local with no account lookup and re-pushes on model change; chatParticipant.test.ts (6) asserts local-model authority (threads only start with CLI-discovered models, rejected on provider mismatch, memory stays in distinct context boundaries); usageMeter.test.ts (1) asserts local models are unbounded without fetching cloud usage. Remaining 4 (webviewContent snapshot x3, panelPaletteConsistency x1) are ordinary drift. Source-level review found the boundary handling itself sound — the defect is that no automated check currently guards it.

**Done when.** Update mockConfiguredModel()/configuredModel() in both test files to also stub .inspect() returning the intended globalValue; fix the 13 trust-boundary failures first, then the 4 snapshot/palette drift ones. Add this suite to PriorityExecutionPlan.md, which currently schedules only the Desktop fix.

**Where.** `apps/extension-vscode/src/platform/config.ts:191-196`, `apps/extension-vscode/src/__tests__/chatParticipant.test.ts:64-73`, `apps/extension-vscode/src/__tests__/usageMeterTrustBoundary.test.ts:96-105`

**From.** audit/parity-2026-08-15/gaps/domain-cross-surface (CROSS-SURFACE-006); audit/parity-2026-08-15/gaps/red-test-suites.md §1

**Folded in.** CROSS-SURFACE-006; red-test-suites.md §1

### UI-39 — Desktop pairing instructions name a mobile menu item ('Desktop Companion') that does not exist in the mobile app

`HIGH` · ui · effort S

**What.** SHELL-NAV-IA-004 / CROSS-SURFACE-007 (prior GAP-210, verified PARTIALLY_DONE): QRPairingCard.tsx:113-117 tells the user to open 'AGI Workforce → Desktop Companion'. The literal string does not appear as user-facing mobile text anywhere (only in a code comment); the real entry points are labelled 'Remote' (drawer/header) and 'Desktop control' (Settings > Capabilities). Independently re-confirmed by the done-claim verification pass, which found GAP-210 marked Done in ui-gaps.csv despite the copy drift surviving.

**Done when.** Change QRPairingCard.tsx's instruction text to name 'Remote', and add a co-located test asserting the string desktop prints matches a value mobile's own navigation exports.

**Where.** `apps/desktop/src/features/mobile-companion/QRPairingCard.tsx:113-117`, `apps/mobile/src/features/drawer/components/DrawerContent.tsx:94-99`, `apps/mobile/app/(app)/companion/index.tsx:210-212`

**From.** audit/parity-2026-08-15 — SHELL-NAV-IA-004 / CROSS-SURFACE-007 (GAP-210); audit/parity-2026-08-15 SHELL-NAV-IA-004; audit/parity-2026-08-15 CROSS-SURFACE-007; audit/ui-gaps GAP-210

**Folded in.** SHELL-NAV-IA-004; CROSS-SURFACE-007; Desktop pairing instructions tell the user to open a mobile menu item ('Desktop Companion') that does not exist in the Mobile app

### CLI-08 — 'agi marketplace search' silently returns an empty list because its registry is not deployed

`MEDIUM` · cli · effort M

**What.** registry.agiworkforce.com is marked PHASE2 'not deployed' in apps/cli/src/lib.rs:99-102 and the comment at lib.rs:101 confirms it. marketplace.rs degrades gracefully but the CLI help text does not disclose that the registry is not live, so search reads as 'no results' rather than 'not available'. Separately, `agi plugin install` accepts only git and local sources — there is no registry-backed install path — and CliConfig has no typed [plugins] field, so a hand-added registry_url loads but is dropped by any `config set` save.

**Done when.** State the registry's unavailability in the CLI output, add a typed [plugins] field to CliConfig, and add a registry-backed `agi plugin install <name>@<marketplace>` once the registry deploys.

**Where.** `apps/cli/src/lib.rs:99-102`, `apps/cli/src/marketplace.rs:3-5`, `apps/cli/src/features/plugins/registry.rs`

**From.** docs/agent-context/phase4-capability-audit.md (PP-17); audit/capability-gaps.csv (CAP-046); docs/agent-context/known-flaws.md (Hosted plugin registry v1)

**Folded in.** CAP-046 wiring gaps: CliConfig has no typed [plugins] field, no registry-backed install subcommand

### EXT-01 — Chrome side_panel.ts is a 10,933-line unbounded ownership hotspot and is still growing

`MEDIUM` · extension · effort XL

**What.** The parity matrix recorded it at roughly 9,359 lines and called for splitting by bounded domains (auth/session, chat stream, page context, browser actions, approvals, connectors, settings, persistence, rendering, native bridge) with behavior-preserving E2E tests before extraction. Verified during this merge: wc -l reports 10,933 lines, so the file has grown by ~1,570 lines since the audit rather than being split.

Also recorded by a later audit (Chrome side_panel.ts monolith — 9,359-line ownership hotspot): Refreshed line count of 9,359 (measured 2026-08-05) against EXT-01's 10,933, so the two passes disagree on size and the file may have shrunk. Records that the split remains open tracked debt after the 2026-08-05 Class-1 pass fixed only its 9 user-facing defects, and that frontend-experience-contract.md §12.6/§14 P1 item 2 independently requires splitting it by domain before major feature growth.

Also recorded by a later audit (Chrome side_panel.ts must be split into domain modules (frontend-experience-contract.md §14 P1 item 2, §12.6)): Second-document confirmation with a stated sequencing rule: 'the monolithic side panel must be split by domain BEFORE major feature growth'. Relevant now because EXT-20 (porting the missing composer controls) and CONN-18 (adding a skills surface) are both major feature growth into this same file. Line count cross-checks: 10,933 per the parity audit, 9,359 at the earlier parity-matrix count — it is still growing.

**Done when.** side_panel.ts is decomposed into bounded domain modules behind behaviour-preserving E2E tests, and a size ratchet prevents it regrowing.

**Where.** `apps/extension/src/side_panel.ts`

**From.** gap-audit-2026-08-08.md; ExecutionPlan.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** P2-005: Chrome extension side_panel.ts is an unbounded ownership hotspot; ExecutionPlan: Chrome extension side_panel.ts 10,933 lines

### EXT-02 — Chrome extension residual defect bundle: dishonest toggle, dropped scheduled output that burns a paid turn, fake capture success, dead Console panel, fake provider pill, clickable hidden FAB

`MEDIUM` · extension · effort L

**What.** Tracked as one MED/LOW bundle from the 2026-07-21 deep audit: the task-notification toggle only gates the pre-run notice while Completed/Failed notifications fire regardless; scheduled prompt-task Managed-Cloud output has no consumer, so it burns a paid turn for nothing; capture_page reports inflated success with no desktop present; the in-page Console panel is permanently empty with dead Refresh and Clear controls; the provider pill reads a storage key nothing ever writes, producing a fake label; and the scroll-hidden FAB stays clickable in one remaining spot.

**Done when.** Each control in the bundle either does what it says or is removed — no toggle that gates the wrong thing, no success report for work that did not happen, no label read from an unwritten key.

**Where.** `apps/extension/src`

**From.** known-flaws.md (Chrome extension deep audit, TRACKED MED/LOW bundle)

### EXT-10 — VS Code composer control parity: effort picker leaves the webview with no selected state, no thinking/model-switch in the actions menu, no plugins/skills in the + menu, hardcoded Enter send, queue exists with no UI, context budget computed but never shown

`MEDIUM` · extension · effort L

**What.** modeChip/effortChip post openModePicker/openEffortPicker out to native quick picks with no checkmark for the current value; agentThinking exists only as a raw setting with no menu exposure; the composer + menu shows three static items and no plugins or skills; keydown hardcodes Enter && !shiftKey to send with a static hint and no preference; sendQueue.ts maintains workspaceState-backed queue lanes with no corresponding queue-vs-steer UI; contextBudget.ts and tokenCounter.ts compute context-window usage that only reaches the status bar, never the composer, and cannot be toggled. No response personality/tone preset exists on any surface.

**Done when.** The VS Code composer exposes its supported model, effort, thinking, queue and context-budget state in the webview with correct selected states and a configurable send shortcut.

**Where.** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1288-1320,1796,1964-1970`, `apps/extension-vscode/src/data/sendQueue.ts:1-45`, `apps/extension-vscode/src/data/contextBudget.ts:1-30`, `apps/extension-vscode/src/platform/config.ts:28,78-79`

**From.** audit/ui-gaps.md

**Folded in.** GAP-292: Effort picker leaves the webview and shows no selected-state checkmark; GAP-285: 'Thinking' and 'Switch models when a message is flagged' not exposed in the actions menu; GAP-288: Composer + menu exposes no plugins/skills, only three static items; GAP-294: Send shortcut is hardcoded to Enter with no preference; GAP-293: No queue-vs-steer choice for messages sent while a turn is running; GAP-295: Context-window usage is computed but never shown in the composer; GAP-342: No response personality/tone preset on any surface

### EXT-11 — VS Code session and history UX: history lives in a separate TreeView, no session browser, Rewind is permanently stubbed, no persistent Goal

`MEDIUM` · extension · effort L

**What.** historyBtn posts openHistory out to a native TreeDataProvider rather than showing history in the chat panel; conversationTreeProvider.ts is a different paradigm with no search or New-session UI; ChatStateManager.rewindLast() always returns the 'unavailable' message, so the Rewind action is a permanent stub; and searching the extension source for 'goal' finds only documentation comments — there is no persistent goal the agent pursues across turns.

Also recorded by a later audit (VS Code extension's rewindLast methods have zero callers (GAP-284)): Names the exact dead symbols behind EXT-11's 'Rewind is permanently stubbed': SidebarProvider.rewindLast() (sidebarProvider.ts:183-185) and ChatStateManager.rewindLast() (ChatStateManager.ts:1451-1456) have zero callers anywhere in the webview protocol and no command invokes either. Classified inert-but-honest — if reachable they would surface an accurate 'Rewind is unavailable until the local runtime exposes turn rollback' error rather than pretend to work. Blocked on local-runtime turn-rollback capability; if that is never built, delete both methods to reduce surface area.

Also recorded by a later audit (VS Code extension's rewindLast methods have zero callers, pending a backend capability (GAP-284; also wire-or-cut 'VS Code developer-session checkpoint UI not built')): Two independent sources converge. GAP-284: SidebarProvider.rewindLast() (sidebarProvider.ts:183-185) and ChatStateManager.rewindLast() (ChatStateManager.ts:1451-1456) have zero callers anywhere in the webview protocol and no command invokes either; if reachable they would correctly surface an honest 'Rewind is unavailable until the local runtime exposes turn rollback' error rather than pretend to work. wire-or-cut adds the upstream reason: the authoritative app-server host advertises checkpoints as unavailable and exposes no checkpoint/restore RPC, and the extension's command-parity contract forbids checkpoint/worktree/rewind controls. Blocked on local-runtime turn-rollback; if that capability is never built, delete the two dead methods.

**Done when.** Session history is browsable and searchable from the chat panel, and Rewind either works or is removed rather than shipping as a permanently disabled action.

**Where.** `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:719-722`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1814-1818`, `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts`

**From.** audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-284: 'Rewind' action exists but is permanently disabled/stubbed; GAP-286: Session history lives in a separate TreeView, not in the chat panel; GAP-287: No dedicated session-browser sidebar; GAP-289: No persistent 'Goal' the agent keeps pursuing across turns

### EXT-12 — VS Code account, usage and preference surfaces are thin: no credits balance, single aggregate usage bar, no memory controls, no language control, no shortcuts entry point

`MEDIUM` · extension · effort L

**What.** Credits are spent in the IDE but the balance and top-up path exist only on web; usageMeter.ts exposes a single usagePercentage and one resetsAt with no per-model limits, reset schedule or empty state; memoryStore.ts is a globalState store with no enable/disable, tool-assisted toggle or in-settings reset; there is no UI language control (web has LanguageSelector, the extension has no equivalent); there is no keyboard-shortcuts entry point from the extension UI; there is no 'Use Terminal' setting; and there is no in-product new-model announcement card.

**Done when.** The IDE surface shows the account state it depends on — credits, per-model usage and resets, memory controls — and exposes language and shortcut entry points.

**Where.** `apps/extension-vscode/src/data/usageMeter.ts:55-120`, `apps/extension-vscode/src/memory/memoryStore.ts:1-40`, `apps/extension-vscode/src/platform/config.ts`

**From.** audit/ui-gaps.md

**Folded in.** GAP-297: Credits balance and top-up are absent from the IDE where credits are spent; GAP-298: Usage is a single aggregate bar — no per-model limits, reset schedule or empty state; GAP-296: Memory has no enable/disable, tool-assisted toggle, or in-settings reset; GAP-341: No UI language control in the IDE surface; GAP-339: No keyboard-shortcuts entry point from the extension UI; GAP-290: No 'Use Terminal' setting to launch the extension in the integrated terminal; GAP-291: No in-product new-model announcement / try-it card; GAP-340: No inline hint to switch to a terminal-based experience

### EXT-25 — Chrome extension composer hand-mirrors the shared ChatInput via a comment instead of importing it, and has already drifted

`MEDIUM` · extension · effort L

**What.** CROSS-SURFACE-002: side_panel.ts (10,933 lines, zero React imports) contains a comment stating its paste-image handler 'Mirrors packages/ui/unified-chat/ChatInput.tsx' but imports nothing from @agiworkforce/unified-chat. Missing versus the shared composer: the Ask/Auto/Plan/Bypass mode row, the Skill @mention picker, the explicit Research toggle, the one-shot web-search toggle, the code-execution toggle and the writing-style picker; the attachment menu offers 2 items against the shared menu's ~7.

**Done when.** Port the missing composer controls into side_panel.ts, and add a CI allowlist-diff check that fails when unified-chat's exported composer-feature list grows without a corresponding side_panel.ts acknowledgment.

**Where.** `apps/extension/src/side_panel.ts:9352-9354,9412-9477`, `packages/ui/unified-chat/src/components/ChatInput.tsx`, `packages/ui/unified-chat/src/components/ChatInputToolbar.tsx`

**From.** audit/parity-2026-08-15 CROSS-SURFACE-002; audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-002

**Folded in.** Chrome extension composer hand-mirrors the shared ChatInput via a comment instead of importing it, and has already drifted

### EXT-27 — Chrome extension has no Skills, Plugins or Connectors management surface at all

`MEDIUM` · extension · effort L

**What.** EXTENSIBILITY-007 (prior GAP-122): apps/extension/src/options.ts contains zero occurrences of 'connector', 'plugin' or 'skill'. The side panel's attach menu offers 2 items where the shared desktop AttachmentMenu offers 7 (including Record skill, Research, Run code). No SkillMentionPicker component and no '@skill' string exists anywhere in the extension's source.

**Done when.** Add a Skill @mention/slash affordance to the side panel composer, reusing the existing skill catalog service the shared chat components already consume, before adding broader plugin/connector management.

**Where.** `apps/extension/src/options.ts`, `apps/extension/src/side_panel.ts:9412-9477`

**From.** audit/parity-2026-08-15 EXTENSIBILITY-007; audit/ui-gaps GAP-122; audit/parity-2026-08-15/gaps/domain-extensibility.json EXTENSIBILITY-007

**Folded in.** EXTENSIBILITY-007; GAP-122; Chrome extension has no Skills/Plugins/Connectors management surface at all

### EXT-28 — Chrome extension has no manual web-search toggle and no Deep Research entry point

`MEDIUM` · extension · effort M

**What.** SEARCH-RESEARCH-005: grepping the entire 10,933-line side_panel.ts for search / web-search / Deep Research UI strings returns zero hits, and managedChatHandler.ts's outbound request builder never sets a research or explicit web-search field — so search only fires when the model itself decides to call it. Distinct from EXT-05, which covers the reasoning-effort control, history depth and attach menu.

**Done when.** Add an explicit 'Search the web' toggle to the side panel composer, wired to set web_search:true on the outbound managed-chat request the same way the web composer's toggle does.

**Where.** `apps/extension/src/side_panel.ts`, `apps/extension/src/features/cloud-bridge/managedChatHandler.ts:20-46`

**From.** audit/parity-2026-08-15 SEARCH-RESEARCH-005; audit/parity-2026-08-15/gaps/domain-search-research.json SEARCH-RESEARCH-005

**Folded in.** Chrome extension has no manual web-search toggle and no Deep Research entry point

### EXT-30 — Chrome extension's AGI Work surface is a workflow UI, not real Cloud Work

`MEDIUM` · extension · effort M

**What.** frontend-experience-contract.md §13, 'AGI Work run (composer mode)' row, Chrome column: 'Workflow UI is not Cloud Work.' The extension presents an AGI Work-shaped surface that does not reach the managed Cloud Work runtime, which is a capability-honesty mismatch rather than a missing feature.

**Done when.** Either wire the extension's AGI Work surface to the real Cloud Work runtime, or relabel it as the local workflow feature it actually is.

**From.** docs/current/frontend-experience-contract.md §13 AGI Work run row, Chrome column

### EXT-31 — VS Code developer-session checkpoint UI is not built and is contractually forbidden by the current command-parity contract

`MEDIUM` · extension · effort L

**What.** wire-or-cut.md 2026-07-30 VS Code Checkpoint Boundary: the authoritative app-server host advertises checkpoints as unavailable and exposes no checkpoint/restore RPC, and the extension's command-parity contract forbids checkpoint/worktree/rewind controls; recorded as Missing. The orphaned patch-batch snapshot undo (apply, snapshot storage, batch undo) was cut in the same pass as unreferenced. Related to but distinct from EXT-11's Rewind stub.

**Done when.** Do not add checkpoint UI until the app-server host exposes a checkpoint/restore RPC; when it does, revisit the command-parity contract in the same change.

**Blocked by.** app-server host exposes no checkpoint/restore RPC

**From.** docs/adr/wire-or-cut.md 2026-07-30 VS Code Checkpoint Boundary

### EXT-34 — VS Code E2E: one spec fails with 'Language model unavailable' and may be a real regression

`MEDIUM` · extension · effort S

**What.** HANDOFF.md §6 open threads: '8 pass / 1 fails: native @agi turn returned an error: "Language model unavailable". Only remaining E2E failure that may be a real regression.' Distinct from EXT-20's 17 unit-test failures.

**Done when.** Reproduce the failing E2E case and determine whether the error is a genuine regression in the CLI/VS Code protocol handshake; fix it or record why it is expected.

**Where.** `apps/extension-vscode`

**From.** docs/agent-context/HANDOFF.md §6 open threads; docs/agent-context/HANDOFF.md §6

**Folded in.** VS Code E2E: one spec fails with 'Language model unavailable' and may be a real regression

### MOB-11 — Mobile hand-rolls its cloud chat calls instead of using the shared managed-cloud client

`MEDIUM` · mobile · effort M

**What.** Mobile hits the same /api/chat/conversations base path with the same schemas so conversations do sync, but retry/backoff, error mapping and save idempotency are duplicated or absent and will drift from Web and Desktop. Related: mobile shadows TOOL_APPROVAL_RESUME_PATH with a local copy instead of importing the exported route contract, and streaming.ts previously shadowed an imported path constant.

**Done when.** Adopt createManagedCloudChatClient on mobile and import the shared route contracts, with a compile-time or contract test forbidding local path copies.

**Where.** `packages/contracts/cloud-contracts/src/managed-cloud-chat-client.ts`, `apps/mobile/services/streaming.ts:233-234`

**From.** ExecutionPlan.md (Mobile parity audit TODO); AuditRemediationLedger.md (MATCH-006, MATCH-004)

**Folded in.** MATCH-006: Mobile shadows TOOL_APPROVAL_RESUME_PATH with a local copy

### MOB-13 — Mobile Cloud auto-memory runs a client-side consolidation write before provider success, racing the server-owned fact

`MEDIUM` · mobile · effort S

**What.** Server auto-capture is intentionally Website-only for now; Mobile Cloud still performs a client consolidation write before provider success, which can race the server-owned fact. Removal was scheduled for a follow-up mobile slice and is not yet done.

**Done when.** Remove the mobile client-side consolidation write and rely on the server-owned auto-capture once it covers mobile.

**Where.** `apps/mobile/src/features/memory`

**From.** docs/agent-context/known-flaws.md (CLOUD-MEMORY-AUTO-01)

### MOB-19 — Mobile media generation gaps: no reference images, unverified video aspect/quality, unverified file rendering

`MEDIUM` · mobile · effort M

**What.** Reference images for image-to-image and image-to-video are not built on mobile — the composer must accept a source image, and the wire contract already models this in managed-media.ts, so it is a client plus route-adapter task, not a contract change. Video aspect and quality lists are implemented and catalog-driven (all 4 video models publish outputSizes) but only the image path was driven through a real generation. File rendering after generation was never rechecked following the bottom-sheet upgrade.

**Done when.** Wire source-image selection into the mobile composer against the existing managed-media contract, then run one real video generation per aspect/quality combination and recheck generated-file rendering.

**Where.** `packages/contracts/cloud-contracts/src/managed-media.ts`, `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`

**From.** ExecutionPlan.md (Mobile media generation TODO)

**Folded in.** Mobile video aspect+quality not yet verified on device; File rendering after generation not re-verified post bottom-sheet upgrade

### MOB-20 — Mobile bottom sheets were dead until the library upgrade and their contents have never been audited

`MEDIUM` · mobile · effort M

**What.** @gorhom/bottom-sheet@5.2.8 painted nothing under RN 0.86.2 / Fabric — proven with a minimal repro — so every bottom sheet in the app (Add-to-Chat, model picker, style, voice, paywall, compare, export, schedules) was dead. The library was upgraded to 5.2.14, but none of those sheets' contents have ever been exercised.

**Done when.** Run a device pass over every newly reachable bottom sheet and file the defects each surfaces.

**Where.** `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`

**From.** ExecutionPlan.md (Mobile media generation 2026-08-13)

### MOB-22 — Mobile Tasks screen has no timestamps and no way to dismiss a finished run

`MEDIUM` · mobile · effort S

**What.** Four identical rows are indistinguishable without the timestamps the Chats list already has, and there is no dismiss action for completed runs. Related mobile agent-run gaps: no date grouping, no floating 'New task' action, and no filter/sort control on the scheduled-tasks list.

**Done when.** Add timestamps, date grouping and a dismiss action to the Tasks list, plus a filter control on schedules.

**Where.** `apps/mobile/app/(app)/agents/index.tsx`, `apps/mobile/app/(app)/schedules/index.tsx`

**From.** ExecutionPlan.md (Mobile second sweep); audit/ui-gaps.md (GAP-167, GAP-303)

**Folded in.** GAP-303: Mobile agent-run list lacks date grouping and a floating 'New task' action; GAP-167: No filter/sort control on the scheduled tasks list

### MOB-28 — Mobile i18n covers only the two language-picker settings screens; Cloud sign-in and most surfaces are literal English

`MEDIUM` · mobile · effort L

**What.** The i18next/MMKV/RTL plumbing works but only the two language-picker settings screens use it; login.tsx and most other surfaces contain literal strings. An attempted fix was blocked because it could not be completed inside the declared change scope. This compounds the shared-UI i18n gap: packages/ui is consumed by both web and desktop, so every surface inherits hardcoded English regardless of locale.

Also recorded by a later audit (Mobile and Desktop i18n coverage unaudited): Extends MOB-28 beyond mobile: 'Mobile and desktop carry i18n dependencies with unaudited coverage — same requirement applies per surface.' Context from the same source: on web only 5 of 490 TSX component files use i18n at all, making the settings LanguageSelector 'a false control under the completion standard', and pnpm check:i18n-parity is currently red on the hi locale (missing 4 of 7 bundles). Desktop has never been measured against that standard.

**Done when.** Wire useTranslation through the mobile screens starting with the Cloud sign-in path, and add key-parity coverage for the mobile bundles.

**Where.** `apps/mobile/app/(auth)/login.tsx:83,111,114`, `packages/ui/i18n/locales`

**From.** ExecutionPlan.md (Wave 7 item #75); docs/agent-context/known-flaws.md (i18n translation debt); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### MOB-30 — Mobile chat-history, memory and data controls lack archive, delete-all, audio consent and web-search controls

`MEDIUM` · mobile · effort M

**What.** ConversationItem exposes no Archive entry and there is no archive-all or delete-all-chats control. ChatInput.tsx:174 states in code that web search 'has no user toggle -- it is on for every capable signed-in user', so users cannot control automatic web search. data-controls has no audio/voice-specific consent control — only the generic 'model training is always off' text — and cloud-privacy's PRIVACY_ITEMS is static text with no Switch, deliberately avoiding cosmetic toggles because no training pipeline exists. There is also no global default intelligence level (effort is per-conversation only).

**Done when.** Add archive and delete-all chat controls, an automatic-web-search preference, an account-level effort default, and either a real audio-consent control or a clear statement that voice data follows the same no-training policy.

**Where.** `apps/mobile/src/features/chat/components/ChatInput.tsx:174`, `apps/mobile/src/features/settings/data-controls/index.tsx`, `apps/mobile/src/features/sidebar/components/ConversationItem.tsx:96-98`

**From.** audit/ui-gaps.md (GAP-160, GAP-176, GAP-177, GAP-178, GAP-179)

**Folded in.** GAP-160: No user-facing training opt-in/out toggle; GAP-176: No separate consent for voice/audio recordings; GAP-177: No chat-history archive or delete-all controls; GAP-178: No user control over automatic web search; GAP-179: No global default intelligence level

### MOB-31 — Mobile settings information architecture: unreachable screens, missing identity rows, buried destinations

`MEDIUM` · mobile · effort M

**What.** The 'Shared links' settings screen exists but has zero navigation call sites. Account rows carry no phone-number identity row and no avatar edit affordance (the profile Image has no Pressable). The root Billing row shows a generic 'Cloud'/'Sign in' tag rather than the actual plan. Remote control/companion, Trusted contact and Cloud browser are absent from the settings IA, Storage is reachable only from a deep sub-path, and Log Out is nested inside the Cloud group instead of a standalone destructive row. Export and account deletion live on two unrelated screens. Accent and appearance pickers push a screen rather than opening in place, and the theme picker uses plain rows instead of preview swatches.

**Done when.** Add the missing entry points and identity rows, surface the real plan on the Billing row, and restructure the settings root so Log Out, Storage and Remote control sit at the expected level.

**Where.** `apps/mobile/src/features/settings/index.tsx`, `apps/mobile/src/features/settings/cloud-account/index.tsx`

**From.** audit/ui-gaps.md (GAP-139, GAP-181, GAP-185, GAP-186, GAP-187, GAP-188, GAP-189, GAP-309, GAP-311, GAP-315, GAP-316, GAP-317)

**Folded in.** GAP-139: Account header avatar and display name not editable; GAP-181: Remote control/companion not in the Settings IA; GAP-185/188: No phone-number identity row; GAP-186: Billing row shows a generic tag, not the actual plan; GAP-187: 'Shared links' screen has no entry point; GAP-189: App settings missing Remote control, Trusted contact, Cloud browser; Storage buried; GAP-311: Export and account deletion live on two unrelated screens; GAP-315/317: Log Out buried inside the Cloud group; GAP-309/316: Accent/appearance/theme pickers push screens instead of in-place previews

### MOB-32 — Mobile drawer omits Code and Dispatch, caps recents at 8 with no overflow, and hides Work mode in the + sheet

`MEDIUM` · mobile · effort M

**What.** DrawerContent's PRIMARY_ITEMS array has no 'code' or 'dispatch' key although both screens exist. DRAWER_RECENT_LIMIT is 8 with no overflow affordance to reach full chat history. Work mode is toggled from inside the AddToChatSheet rather than a header surface switcher. There is also no dedicated search overlay, no pre-typing guidance state, and no organize control on the conversation list (it sorts by updatedAt only).

Also recorded by a later audit (Mobile primary nav lacks Code/Artifacts/Tasks entries present on the web/desktop rail (duplication settings-and-nav §1d)): Adds the specific missing destinations against the canonical rail: DrawerContent.tsx:57-110 defines Chats, Projects, Library, Skills, Schedules, Remote — no Code, Artifacts or Tasks. The audit classifies the separate nav array as DELIBERATE (different framework) but flags the missing destinations as a product-parity gap worth its own ticket.

Also recorded by a later audit (Mobile primary nav lacks Code/Artifacts/Tasks entries present on the web/desktop rail): Widens MOB-32's 'drawer omits Code and Dispatch': apps/mobile/src/features/drawer/components/DrawerContent.tsx:57-110 defines Chats, Projects, Library, Skills, Schedules and Remote, against the canonical 8-item web/desktop rail (app-nav-items.ts) — so Artifacts and Tasks are missing too. The duplication audit classifies the separate mobile nav array as legitimately deliberate (different platform/framework) while explicitly flagging the missing destinations as a possible product-parity ticket.

**Done when.** Add Code and Dispatch drawer entries, an overflow path from recents to full history, a header-level mode switcher, and a sort/group control on the conversation list.

**Where.** `apps/mobile/src/features/drawer/components/DrawerContent.tsx:57-90,92,195-232`, `apps/mobile/src/features/sidebar/components/ConversationList.tsx:37`

**From.** audit/ui-gaps.md (GAP-150, GAP-155, GAP-164, GAP-191, GAP-194); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-155: Drawer has no nav entry for Code or Dispatch; GAP-191: Recents capped at 8 with no path to full history; GAP-194: Work mode hidden inside the '+' sheet; GAP-150: No dedicated search overlay or pre-typing guidance; GAP-164: Conversation list has no organize control

### MOB-34 — Mobile composer and model controls: no empty-chat quick actions, effort slider instead of tiers, no dispatch/code model picker

`MEDIUM` · mobile · effort M

**What.** chat.tsx carries an in-code comment 'Still NO suggestion cards' — the empty chat offers no capability quick actions above the composer. Reasoning effort is a Slider with engineering labels and no explanation of the trade-off, rather than a tappable tier list with the current value checked. The full model and effort UI in ModelPickerSheet is not imported into the dispatch or code-session composers, so those have no model or effort selector at all. The Code screen also lacks a 'Devices' section showing recently connected devices, and the agent activity trace has no dedicated pull-up detail sheet (inline expand with a JSON.stringify fallback).

**Done when.** Add capability-aware quick-start chips to the empty chat, convert effort to a labelled tier list, reuse ModelPickerSheet in the dispatch and code-session composers, and add an activity detail sheet.

**Where.** `apps/mobile/app/(app)/(tabs)/chat.tsx:617-621`, `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:54-62,597-626`, `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:260-290`

**From.** audit/ui-gaps.md (GAP-141, GAP-142, GAP-143, GAP-146, GAP-154, GAP-300)

**Folded in.** GAP-141: Empty chat offers no capability quick actions; GAP-142: Reasoning effort is a slider, not a tier list; GAP-143: Code screen lacks a 'Devices' section; GAP-146: Agent activity trace has no dedicated detail sheet; GAP-154: Dispatch and code-session composers have no model or effort selector; GAP-300: Effort levels use engineering labels with no trade-off explanation

### MOB-43 — Mobile artifact viewer lacks version history and publish-to-link, both of which web has

`MEDIUM` · mobile · effort M

**What.** ARTIFACTS-004: ArtifactFullScreen.tsx has Preview/Code, Download, Share, Refresh and Copy but zero hits for versionHistory/getArtifactVersions/restoreArtifactVersion or publish inside the artifact viewer components; the only share path is the OS share sheet, which shares raw content rather than a hosted URL.

**Done when.** Add a version chip (prev/next/Restore) using the same shared-store version data web reads, and wire a Publish action calling the same /api/artifacts/publish endpoint web's CloudPublisher uses.

**Where.** `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1-613`, `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:1-70`

**From.** audit/parity-2026-08-15 ARTIFACTS-004; audit/parity-2026-08-15 — ARTIFACTS-004

**Folded in.** Mobile artifact viewer has no version history and no publish-to-link

### MOB-44 — Mobile has no follow-up message queue; sending mid-response aborts the running turn instead of queuing

`MEDIUM` · mobile · effort M

**What.** COMPOSER-006: ChatInput.tsx's send/stop button unconditionally routes to onStop() while isStreaming is true, with no queuing path, and chatExecutionStore.ts's sendMessage immediately abort()s any in-flight stream rather than deferring the new send — unlike web's genuine post-stream flush.

**Done when.** Add a queued-follow-up state mirroring web's pendingQueueRef: when sendMessage is invoked for a conversation with an active abortController, store the draft instead of aborting, surface it as a dismissible chip, and flush on stream completion.

**Where.** `apps/mobile/src/features/chat/components/ChatInput.tsx:663-675`, `apps/mobile/stores/chat/chatExecutionStore.ts:803-839`

**From.** audit/parity-2026-08-15 COMPOSER-006

### MOB-45 — Mobile regex markdown parser silently drops nested-list structure and inline formatting inside table cells

`MEDIUM` · mobile · effort S

**What.** RENDERING-003: list-detection regexes are anchored with no leading-whitespace tolerance, so an indented sub-item falls through to the plain-paragraph branch and loses its bullet and indentation. Table-cell rendering emits row[colIdx] as a bare string without calling renderInlineMarkdown — unlike every other branch in the file — so **bold**, `code` and links render as literal syntax inside table cells. Distinct from MOB-21's visual table-clipping patch.

**Done when.** Extend the list-detection regex to tolerate leading whitespace and track indent depth; change table-cell rendering to call renderInlineMarkdown(row[colIdx] || '', ...) matching every other text-bearing branch.

**Where.** `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:262-263,307,356-371,449-461`

**From.** audit/parity-2026-08-15 RENDERING-003; audit/parity-2026-08-15 — RENDERING-003

**Folded in.** Mobile regex markdown parser silently drops nested-list structure and inline formatting inside table cells

### MOB-46 — Mobile's no-hardcoded-colour guard and its 640-entry baseline are not wired into CI despite explicit 'will fail CI' language

`MEDIUM` · mobile · effort S

**What.** DESIGN-SYSTEM-005: check:no-hex-mobile is a ratchet-style guard whose baseline file's own \_description field states 'New violations will fail CI,' but grep across .github finds zero matches in any workflow. Running the script directly currently passes, so a regression tomorrow would ship undetected.

**Done when.** Add pnpm check:no-hex-mobile as a step in whichever CI job already runs mobile lint/tests, gated on mobile-changed paths.

**Where.** `scripts/check-no-hex-colors-mobile.mjs`, `apps/mobile/scripts/.no-hex-baseline.json`, `package.json:116`

**From.** audit/parity-2026-08-15 DESIGN-SYSTEM-005; audit/parity-2026-08-15 — DESIGN-SYSTEM-005

**Folded in.** Mobile's no-hardcoded-colour guard and its 640-entry baseline are not wired into CI despite explicit 'will fail CI' language

### MOB-47 — Mobile has no automated accessibility testing and roughly half of its touch targets lack an accessibility label

`MEDIUM` · mobile · effort L

**What.** DESIGN-SYSTEM-010: apps/mobile/package.json has no axe-core equivalent, jest-axe, or react-native a11y eslint plugin, unlike web/desktop which run @axe-core/playwright in CI. 1,234 TouchableOpacity/Pressable occurrences were found against only 610 accessibilityLabel= occurrences — about 49% of interactive touch elements have no explicit accessible name. Concrete and mobile-specific where TEST-10/UI-14 record only the absence of coverage.

**Done when.** Add eslint-plugin-react-native-a11y (or a custom rule) failing CI on new icon-only Pressable/TouchableOpacity without accessibilityLabel, then triage the highest-traffic existing unlabeled instances (tab bar, composer, message actions first).

**Where.** `apps/mobile/package.json`

**From.** audit/parity-2026-08-15 DESIGN-SYSTEM-010; audit/parity-2026-08-15 — DESIGN-SYSTEM-010

**Folded in.** Mobile has no automated accessibility testing and roughly half its touch targets lack an accessible name

### MOB-48 — Reduced-motion OS preference is respected in only 2 of 23 mobile animation-driving files

`MEDIUM` · mobile · effort M

**What.** DESIGN-SYSTEM-011: 23 files drive Reanimated/Animated animations; only OfflineBanner.tsx and ModelLoadingFirstRunModal.tsx check AccessibilityInfo.isReduceMotionEnabled() before animating. The remaining 21 always play the full animation regardless of the OS setting, despite a comparable, well-built hook (useSystemHighContrast) already existing in the same codebase for a different OS accessibility setting.

**Done when.** Extract a useReduceMotion() hook next to useSystemHighContrast following the identical AccessibilityInfo-subscription pattern, and apply it first to the agent activity/thinking indicator and voice-mode animations.

**Where.** `apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx:33-51`, `apps/mobile/src/features/edge-cases/components/ModelLoadingFirstRunModal.tsx:52-65`, `apps/mobile/src/ui/theme/useSystemHighContrast.ts:1-70`

**From.** audit/parity-2026-08-15 DESIGN-SYSTEM-011; audit/parity-2026-08-15 — DESIGN-SYSTEM-011

**Folded in.** Reduced-motion OS preference is respected in only 2 of 23 mobile animation-driving files

### MOB-49 — Mobile edge-case UX library (9 copy-locked, tested modals) has zero import sites and no sensor ever triggers it

`MEDIUM` · mobile · effort M

**What.** DEAD-CODE-016 (+ PROJECTS-FILES-008): BatteryLowModal, ThermalThrottleModal, StorageFullModal, ModelLoadingFirstRunModal, FileTooLargeModal, ImageTooLargeModal, FileUnreadableModal, MessageErrorScreen and CloudTeaseModal are all copy-locked and render-tested but have zero import sites outside their own directory and tests; only OfflineBanner.tsx is actually mounted. The real file-too-large path uses inline composer text (attachmentValidation.ts) instead, confirming these are orphaned rather than in-flight, and no battery/thermal sensor listener exists anywhere to fire the first two. Distinct from MOB-20 (bottom sheets dead until the library upgrade).

**Done when.** WIRE StorageFullModal (a real failure mode with no current handling), ModelLoadingFirstRunModal (local-model download UX) and FileUnreadableModal (the one file case inline text does not cover); DELETE the remaining modals plus their tests and copy, since inline error text already covers them and no sensor exists.

**Where.** `apps/mobile/src/features/edge-cases/components/`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-016; audit/parity-2026-08-15 PROJECTS-FILES-008

**Folded in.** DEAD-CODE-016; PROJECTS-FILES-008

### MOB-52 — MS-20 trusted-contact flow is a dead announcement card with no real enrolment

`MEDIUM` · mobile · effort L

**What.** parity-implementation-matrix.md 2026-08-01 Founder Scope Decisions, MS-20: founder-approved Build item whose description states 'Real enrolment replaces the dead announcement card' — implying the currently shipped UI is a non-functional placeholder. Note the web-side equivalent (settings-10-gap) was deliberately declined on safety grounds, so the mobile decision needs to be reconciled with that stance.

**Done when.** Either build real trusted-contact enrolment as MS-20 specifies, or remove the dead announcement card and align with the web surface's explicit decline copy.

**From.** docs/current/parity-implementation-matrix.md MS-20

### MOB-54 — MS-13 background / lock-screen voice decided but not built (needs UIBackgroundModes audio and a surviving session)

`MEDIUM` · mobile · effort L

**What.** parity-implementation-matrix.md 2026-08-01 Founder Scope Decisions, MS-13; the 2026-08-05 Class-1 status separately lists the background-voice entitlement among mobile's remaining external-gated items.

**Done when.** Add the UIBackgroundModes audio entitlement and a session that survives backgrounding, or record the decision to defer with the entitlement gate named.

**Blocked by.** iOS background-audio entitlement (external gate)

**From.** docs/current/parity-implementation-matrix.md MS-13; docs/current/parity-implementation-matrix.md 2026-08-05 Class-1 Closure Status

### MOB-55 — MS-16 safety model fallback (retry path, then the toggle) decided but not built

`MEDIUM` · mobile · effort M

**What.** parity-implementation-matrix.md 2026-08-01 Founder Scope Decisions, MS-16: founder-approved Build item specifying the retry path first and then the toggle; no implementation recorded.

**Done when.** Implement the retry path first as MS-16 specifies, and only then expose a user-facing fallback toggle.

**From.** docs/current/parity-implementation-matrix.md MS-16

### MOB-56 — MS-4 live video / screen share in voice decided but not built; needs a streaming media contract with Local-Mode egress consent

`MEDIUM` · mobile · effort XL

**What.** parity-implementation-matrix.md 2026-08-01 Founder Scope Decisions, MS-4: needs a streaming media contract, and screen capture must never be available in Local Mode without explicit egress consent.

**Done when.** Define the streaming media contract before any UI, with screen capture hard-gated behind explicit Local-Mode egress consent.

**From.** docs/current/parity-implementation-matrix.md MS-4

### MOB-57 — MS-2/MS-22 superseded: mobile may no longer treat Plugins and Skills as out of scope because Connectors exists, so real builds are now required

`MEDIUM` · mobile · effort L

**What.** parity-implementation-matrix.md 2026-08-01 Founder Scope Decisions, Superseded 2026-08-09: the founder overturned the earlier Plugins-as-Connectors scoping — mobile 'may no longer treat Plugins or Skills as out of scope merely because Connectors is present' — which reopens a build requirement that was previously closed as scoped-out.

**Done when.** Scope and build real mobile Plugins and Skills surfaces (the Skills catalog screen already exists — see MOB-42) rather than relying on the Connectors surface to stand in for them.

**From.** docs/current/parity-implementation-matrix.md MS-2/MS-22 (superseded 2026-08-09)

### MOB-59 — Mobile edge-case UX library ships 9 modals that are copy-locked, render-tested, and imported by nothing, with no sensor able to trigger them

`MEDIUM` · mobile · effort M

**What.** DEAD-CODE-016 (corroborated by PROJECTS-FILES-008 for the three file-error modals). BatteryLowModal, ThermalThrottleModal, StorageFullModal, ModelLoadingFirstRunModal, FileTooLargeModal, ImageTooLargeModal, FileUnreadableModal, MessageErrorScreen and CloudTeaseModal all have zero import sites outside their own directory and tests. Only OfflineBanner.tsx (the 10th component) is actually mounted. The real file-too-large path uses inline composer text (attachmentValidation.ts) instead, and no battery or thermal sensor listener exists anywhere to fire the others.

**Done when.** WIRE StorageFullModal (a real failure mode with no current handling) and ModelLoadingFirstRunModal (relevant to local-model download UX), plus FileUnreadableModal (the one file case inline text does not cover); DELETE the remaining modals and their tests/copy.

**Where.** `apps/mobile/src/features/edge-cases/components/`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-016; audit/parity-2026-08-15/gaps/domain-projects-files.json PROJECTS-FILES-008

**Folded in.** DEAD-CODE-016; PROJECTS-FILES-008

### SEC-79 — Trusted-contact crisis notification is explicitly declined on web, but mobile ships a dead announcement card and a founder-approved enrolment flow that was never built

`MEDIUM` · security · effort M

**What.** settings-10-gap (competitive-gap-2026-08-15) records the web position as a correct, explicit decline: SafetySection.tsx's own copy states the product 'does not monitor conversations, notify another person, or replace emergency services' — appropriate given the clinical-risk-classification and legal infrastructure a real feature would need. But MS-20 (parity-implementation-matrix.md, 2026-08-01 founder scope decisions) approves a mobile trusted-contact flow where 'real enrolment replaces the dead announcement card' — i.e. mobile currently ships a non-functional announcement card for a capability that does not exist, which is a false-availability claim rather than an honest decline.

**Done when.** Either remove mobile's dead trusted-contact announcement card so mobile matches web's honest decline, or build the approved enrolment flow; do not leave a card advertising a capability that cannot fire.

**Where.** `apps/web/features/settings/sections/SafetySection.tsx`

**From.** audit/competitive-gap-2026-08-15/domains/settings (settings-10-gap); docs/current/parity-implementation-matrix.md#2026-08-01 Founder Scope Decisions (MS-20)

**Folded in.** settings-10-gap; MS-20

### UI-52 — Mobile has no follow-up queue while streaming — sending mid-response aborts the current turn instead of queuing

`MEDIUM` · ui · effort ?

**What.** COMPOSER-006: ChatInput.tsx's send/stop button unconditionally routes to onStop() while isStreaming is true with no queuing path, and chatExecutionStore.ts's sendMessage immediately abort()s any in-flight stream rather than deferring, unlike web's genuine post-stream flush.

**Done when.** Add a queued-follow-up state mirroring web's pendingQueueRef: store the draft instead of aborting when an abortController is active, surface it as a dismissible chip, and flush on stream completion.

**Where.** `apps/mobile/src/features/chat/components/ChatInput.tsx:663-675`, `apps/mobile/stores/chat/chatExecutionStore.ts:803-839`

**From.** audit/parity-2026-08-15 — COMPOSER-006

### CLI-06 — apps/cli/src/subagent_v2.rs (862 lines) is declared but referenced by nothing outside itself

`LOW` · cli · effort S

**What.** grep for subagent_v2 outside its own file returns only the lib.rs module declaration and a doc comment — 862 lines of dead code compiled into every CLI build.

**Done when.** Delete subagent_v2.rs and its module declaration, or wire it and remove the duplicate subagent path.

**Where.** `apps/cli/src/subagent_v2.rs`, `apps/cli/src/lib.rs:56`

**From.** docs/agent-context/phase4-capability-audit.md (PP-14)

### CLI-07 — CLI '/task cancel' is rejected even though subagent.cancel() exists and a 'cancelled' state is advertised

`LOW` · cli · effort S

**What.** subagent.rs implements cancel() at lines 82 and 220, but slash_commands.rs:222-227 rejects the /task cancel command, so the advertised cancelled state is unreachable from the CLI.

**Done when.** Route /task cancel to subagent.cancel().

**Where.** `apps/cli/src/subagent.rs:82,220`, `apps/cli/src/repl/slash_commands.rs:222-227`

**From.** docs/agent-context/phase4-capability-audit.md (PP-14)

### CLI-11 — Several CLI parity commands overstate their verb; /effort silently acknowledges without applying

`LOW` · cli · effort S

**What.** /focus, /color, /heapdump, voice-in-TUI, /stickers, /thinkback-play, /effort-in-REPL, /vim and /replay-v0.2 mostly print honest 'not available' messages, but some — notably /effort in the REPL — silently acknowledge the command without applying it. Tracked as non-blocking low-priority parity debt. Separately, apps/cli/src/voice.rs:41 pins a literal model id behind a comment falsely claiming it is absent from models.json, contradicted by the catalog and the guard test at model_catalog.rs:1893-1918.

**Done when.** Make every unsupported command fail loudly rather than acknowledge, and correct the false voice.rs comment (or route the id through the catalog).

**Where.** `apps/cli/src/voice.rs:41`, `apps/cli/src/repl`

**From.** docs/agent-context/known-flaws.md (2026-07-21 CLI app audit); docs/agent-context/phase4-capability-audit.md (PP-20)

**Folded in.** CLI voice.rs doc comment falsely claims a hardcoded transcription model id is absent from the catalog

### CLI-12 — CLI browser-control documentation overclaims capability

`LOW` · cli · effort S

**What.** CLI browser-control docs describe capability the CLI does not have; correction not confirmed.

**Done when.** Rewrite the CLI browser-control docs to match the shipped commands, and cover the claim with whatever guard governs present-tense capability copy.

**Where.** `docs`

**From.** AuditRemediationLedger.md (DOC-014)

### CLI-13 — CLI skills tool is built and tested but unavailable in production without a non-empty SKILLS_LAYERS catalog

`LOW` · cli · effort S · **in-progress**

**What.** The read-only progressive-disclosure Skill tool is built and tested across CLI, app-server and Managed Cloud, but the deployment must expose a non-empty authorized SKILLS_LAYERS catalog before selection is actually available in production.

**Done when.** Configure a non-empty SKILLS_LAYERS catalog in the deployment and verify skill selection from the CLI.

**Where.** `packages/tools/skills`

**Blocked by.** deployment must configure a non-empty SKILLS_LAYERS catalog

**From.** docs/agent-context/known-flaws.md (CLI-SKILLS-TOOL-01)

### CLI-16 — CLI exec_policy.rs rename to the shared execpolicy crate is unfinished restructure work

`LOW` · cli · effort L

**What.** The duplicate in-app exec-policy engine was deleted and CLI command evaluation now uses the agiworkforce-execpolicy crate, but the plan's resume queue still lists 'CLI exec_policy.rs → agiworkforce-execpolicy' as in-flight W7 tail work alongside the c2c request-parity oracle, c3/c4 dialect swaps and a ~201 twin-file deletion behind a host-owned-file manifest.

**Done when.** Finish the W7 tail: complete the rename, land the request-parity oracle and dialect swaps, and execute the twin-file deletion behind the manifest review.

**Where.** `apps/cli/src/exec_policy.rs`, `crates/agiworkforce-execpolicy`

**From.** PLAN.md (Exact Resume Point item 1); docs/agent-context/known-flaws.md (EXEC-POLICY-DUP-01)

### CLI-26 — CLI sandbox.rs uses a whole-file #![allow(dead_code, unused_imports)] instead of scoped allows

`LOW` · cli · effort S

**What.** DeadAndDisconnectedCode.md §10. The blanket allow at apps/cli/src/sandbox.rs:1 is broader than the individually-scoped #[allow(dead_code)] markers used elsewhere in the Rust workspace; the module's core types (SandboxManager, SandboxType) are demonstrably live, so it masks real unused-code signal for the rest of the file — a security-relevant file per CLI-17/CLI-18.

**Done when.** Narrow the allow to the specific unused items rather than the whole file.

**Where.** `apps/cli/src/sandbox.rs:1`

**From.** audit/parity-2026-08-15/DeadAndDisconnectedCode.md §10; audit/parity-2026-08-15 DeadAndDisconnectedCode.md §10

**Folded in.** CLI sandbox.rs uses a whole-file #![allow(dead_code, unused_imports)] instead of scoped allows

### EXT-03 — Chrome extension retains a vestigial cloud-unlock mechanism with no consumer

`LOW` · extension · effort S

**What.** Invite/waitlist copy was corrected to public-alpha framing, but the dead desktopBridge.getCloudUnlockState / setCloudUnlocked mechanism remains — retained rather than removed.

**Done when.** The unused cloud-unlock bridge functions are deleted along with any remaining callers.

**Where.** `apps/extension/src/features/cloud-bridge/desktopBridge.ts`

**From.** known-flaws.md (EXT-CLOUD-INVITE-RESIDUAL-01)

### EXT-05 — Chrome composer and history UX gaps: no reasoning-effort control, history two clicks deep with no search, attach menu image-only

`LOW` · extension · effort M

**What.** No reasoning-effort or speed control is exposed in the extension composer (grep for effort/reasoning/Advanced in side_panel.ts matches only unrelated comments). Conversation history sits behind a drawer toggle with no search input element, versus a one-click searchable dropdown in the reference. The attach menu is deliberately image-only (screenshot + image, eight-image cap) until file and agent-mode contracts exist.

Also recorded by a later audit (Chrome extension composer hand-mirrors the shared ChatInput via a comment instead of importing it, and has already drifted (CROSS-SURFACE-002)): Expands the composer-gap list well beyond 'no reasoning-effort control, attach menu image-only': side_panel.ts (10,933 lines, zero React imports) is missing the Ask/Auto/Plan/Bypass mode row, Skill @mention picker, explicit Research toggle, one-shot web-search toggle, code-execution toggle and writing-style picker; its attachment menu offers 2 items against the shared composer's ~7. A comment at lines 9352-9354 claims it 'Mirrors packages/ui/unified-chat/ChatInput.tsx' while importing nothing from it. Proposed guard: a CI allowlist-diff that fails when unified-chat's exported composer-feature list grows without a corresponding side_panel.ts acknowledgment.

**Done when.** The extension composer exposes the reasoning control it supports, and conversation history is reachable in one action with search.

**Where.** `apps/extension/src/side_panel.ts:4337,4990-5075`

**From.** audit/ui-gaps.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-281: No reasoning-effort/speed slider exposed in the extension composer; GAP-283: Conversation history is two clicks deep with no search; GAP-122: Chrome keeps the attach menu image-only until file and agent-mode contracts exist

### EXT-13 — VS Code CodeLens skips comments, so a TODO/FIXME cannot be turned into a task

`LOW` · extension · effort S

**What.** codeLensProvider.ts provides a declaration-only lens and explicitly skips comment lines, so the most common entry point for turning an in-code note into agent work is unavailable.

**Done when.** CodeLens offers an action on TODO/FIXME comments as well as declarations.

**Where.** `apps/extension-vscode/src/features/code-lens/codeLensProvider.ts:53-104,112-120`

**From.** audit/ui-gaps.md (GAP-299)

### EXT-14 — VS Code vscode.lm fallback setting was removed as dead and the underlying fallback remains unbuilt

`LOW` · extension · effort M

**What.** The dead agiWorkForce.fallbackToVscodeLm toggle was removed rather than left as a no-op, which was correct; the underlying vscode.lm fallback capability itself remains unbuilt and founder-gated, and should be re-added only alongside its implementation.

**Done when.** The vscode.lm fallback either ships with its setting restored, or stays absent — never a setting without an implementation.

**Where.** `apps/extension-vscode/package.json`

**From.** known-flaws.md (VSCODE-VSCODE-LM-FALLBACK-MISSING)

### EXT-15 — VS Code agent.maxIterations setting was removed; the cross-lane wiring into the CLI agent loop is still unbuilt

`LOW` · extension · effort M

**What.** Threading a max-iterations cap from the VS Code setting into the CLI Rust agent loop is real cross-lane work (extension TypeScript + the shared startTurn contract + the CLI Rust agent-loop cap) and is tracked for future re-addition alongside the wiring. The CLI half overlaps the cli slice.

**Done when.** A max-iterations cap set in VS Code reaches and bounds the agent loop that actually runs, or the setting stays absent.

**Where.** `apps/extension-vscode/package.json`

**From.** known-flaws.md (VSCODE-AGENT-MAXITERATIONS-UNAPPLIED)

### EXT-16 — VS Code re-declares a lenient subset of the shared usage-summary schema

`LOW` · extension · effort S

**What.** apps/extension-vscode's TierInfoSchema duplicates a lenient subset of ManagedUsageSummaryResponse; it is only safe to swap to the shared strict parser once /api/usage is guaranteed to always return the full shape.

**Done when.** VS Code parses usage through the shared strict schema rather than a local lenient copy, once the endpoint's response shape is guaranteed.

**Where.** `apps/extension-vscode/src/protocol/apiResponses.ts`

**From.** known-flaws.md (DEDUP-VSCODE-USAGE-SCHEMA-01)

### EXT-19 — No web settings page manages the Chrome extension's enable state or site permissions

`LOW` · extension · effort M

**What.** Searching apps/web for enable-in-Chrome, site-permission or default-policy copy returns no matches; there is likewise no view of extensions installed on the paired desktop app. Extension enablement and per-site policy are managed only inside the extension itself.

**Done when.** Either the web settings surface manages extension enablement and site permissions, or the product does not imply that it does.

**From.** audit/ui-gaps.md

**Folded in.** GAP-268: No web Settings page to manage the Chrome extension's enable state and site permissions; GAP-270: Web settings has no view of extensions installed on the paired desktop app

### EXT-29 — Chrome extension notification control is a single flat toggle with no per-category granularity

`LOW` · extension · effort S

**What.** SETTINGS-009: the options page's Permissions section has one 'Task notifications' checkbox with no per-category granularity. Low severity given the extension currently fires only one notification type.

**Done when.** Expand granularity only if and when more notification types are added; do not add categories ahead of real senders.

**Where.** `apps/extension/src/options.ts`

**From.** audit/parity-2026-08-15 SETTINGS-009; audit/parity-2026-08-15 — SETTINGS-009

**Folded in.** Chrome extension notification control is a single flat toggle with no per-category granularity

### EXT-32 — VS Code extension has no voice capability

`LOW` · extension · effort L

**What.** frontend-experience-contract.md §13, Voice row, VS Code column = 'Absent'. Every other surface has at least dictation; VS Code has nothing. Note the same document's 2026-08-09 correction confirmed the CLI voice row was mismarked and CLI voice does exist, so the VS Code 'Absent' is the remaining genuine gap in that row.

**Done when.** Decide explicitly whether VS Code should get dictation (reusing the CLI's voice path via the app-server host) or record it as a permanent non-goal for that surface.

**From.** docs/current/frontend-experience-contract.md §13 Voice row

### EXT-39 — Chrome extension scheduled-task origin check fails open for legacy unstamped tasks

`LOW` · extension · effort S

**What.** DEAD-CODE-021. shouldExecuteScheduledTask() (policy.ts:727-732) returns true unconditionally when task.createdByOrigin is falsy, commented 'legacy task pre-stamp; permit' — the only fail-open branch in an otherwise fail-closed provenance-gating codebase.

**Done when.** Add a one-time migration stamping createdByOrigin on any existing task missing it, then flip the fallback to fail-closed (return false) so an unstamped task is auto-deleted rather than silently permitted.

**Where.** `apps/extension/src/background/policy.ts:727-732`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-021; audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-021

**Folded in.** Chrome extension scheduled-task origin check fails open for legacy (pre-origin-stamp) tasks

### MOB-24 — Mobile model chip may briefly show the wrong model immediately after selection

`LOW` · mobile · effort S · **unclear**

**What.** Observed showing the prior Google model immediately after tapping another catalog model, then correcting later. Needs confirmation; may be a synthetic scroll artifact rather than a real state bug.

**Done when.** Reproduce deliberately on device; if real, make the chip read the committed selection rather than an in-flight value.

**Where.** `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx`

**From.** ExecutionPlan.md (Mobile test pass 2026-08-13, P3)

### MOB-25 — Mobile legacy invite/waitlist UI is dead after public alpha and the waitlist store is misused as an entitlement mirror

`LOW` · mobile · effort S

**What.** The legacy invite/waitlist modal, sheet and signup service have no production consumer post public-alpha; only the waitlist store remains live as an entitlement mirror and needs replacing with the real entitlement source.

**Done when.** Delete the invite/waitlist modal, sheet and signup service, and replace the waitlist store's entitlement-mirror role with the canonical entitlement read.

**Where.** `apps/mobile/src/features/cloud-bridge/InviteCodeModal.tsx`, `apps/mobile/src/features/waitlist/`

**From.** docs/agent-context/known-flaws.md (MOB-CLOUD-INVITE-RESIDUAL-01)

### MOB-26 — Mobile legacy voice screen diverges visually and lacks text fallback, mode preference and thinking label

`LOW` · mobile · effort M

**What.** The new voice surfaces use a linear orb matching the reference; the legacy VoiceConversationScreen still uses radial. A blanket conversion was attempted and reverted because it broke the backdrop gradient — the orb gradient must be separated from the backdrop gradient first. The voice screen also dismisses the keyboard with no text-input fallback, has only an in-call hands-free/push-to-talk toggle with no persisted preference, hides the chat transcript instead of overlaying it, and shows no 'Thought for Ns' label during the thinking phase.

**Done when.** Separate the orb gradient from the backdrop gradient, then convert the legacy screen; add the text fallback, a persisted voice-mode preference and the thinking-duration label.

**Where.** `apps/mobile/src/features/voice/components/VoiceConversationScreen.tsx`

**From.** docs/agent-context/known-flaws.md (VOICE-OVERLAY-ORB-STILL-RADIAL); audit/ui-gaps.md (GAP-153, GAP-192, GAP-193, GAP-320)

**Folded in.** GAP-192: Voice conversation screen has no text-input fallback; GAP-193: No persistent Hands-free vs Push-to-talk preference; GAP-153: Voice mode hides the chat transcript instead of overlaying it; GAP-320: No 'Thought for Ns' reasoning-status label during voice thinking

### MOB-33 — Mobile pairing and dispatch onboarding: no stepped wizard, no troubleshooting checklist, no email-link path

`LOW` · mobile · effort M

**What.** companion/index.tsx renders a single static DisconnectedView-or-QRScanner screen rather than a back-navigable stepped wizard. The pairing failure screen shows one generic error line with no troubleshooting checklist. There is no 'email me a download link' path when the desktop app is not installed, and no Dispatch intro screen offering QR versus email-link pairing. The manual-code submit button has no disabled state for empty input and no paste affordance.

**Done when.** Convert pairing to a stepped wizard with a troubleshooting checklist, add an email-download-link path, and add disabled-state plus paste handling to the manual code entry.

**Where.** `apps/mobile/app/(app)/companion/index.tsx`, `apps/mobile/src/features/companion/components/QRScanner.tsx:66-71,173-179`, `apps/mobile/src/features/companion/components/ConnectionStateViews.tsx`

**From.** audit/ui-gaps.md (GAP-144, GAP-159, GAP-165, GAP-166, GAP-307)

**Folded in.** GAP-144: No Dispatch intro screen offering QR vs email-link pairing; GAP-159: Pairing failure shows one generic error line; GAP-165: No 'email me a download link' path; GAP-166: Pairing setup is a single static screen; GAP-307: Manual pairing submit has no disabled state or paste affordance

### MOB-35 — Mobile projects, library and schedules lack search, filters, templates and identity affordances

`LOW` · mobile · effort M

**What.** The Projects tab has no search field and no ownership filters (All / Created by you / Shared with you). The New Project modal has no icon/emoji picker, no starter category pills and never explains what a project is for. The Library header has no overflow menu (select, sort, delete). Scheduled tasks cannot be bound to plugins or connectors and schedule creation has no persistent composer with voice dictation. The companion feature cannot browse the paired desktop's project folders. Connectors has no multi-step onboarding wizard or +row add affordance.

**Done when.** Add search and ownership filters to Projects, an explainer and identity picker to the create modal, a Library overflow menu, and connector binding to schedules.

**Where.** `apps/mobile/app/(app)/(tabs)/projects.tsx`, `apps/mobile/src/features/library/index.tsx`, `apps/mobile/src/features/schedules/components/QuickSchedule.tsx`

**From.** audit/ui-gaps.md (GAP-151, GAP-156, GAP-157, GAP-161, GAP-162, GAP-163, GAP-168, GAP-169, GAP-301, GAP-306)

**Folded in.** GAP-161: Projects tab has no search field; GAP-162: No ownership filters on projects; GAP-156/157/306: New Project has no icon picker, starter categories or explainer; GAP-151: Library header has no overflow menu; GAP-168: Scheduled tasks cannot be bound to plugins/connectors; GAP-169: Schedule creation has no persistent composer with voice dictation; GAP-163: Companion cannot browse the paired desktop's project folders; GAP-301: Connectors screen has no onboarding wizard or +row add affordance

### MOB-36 — Mobile settings gaps for approval policy, tool loading, cloud browser, connector discovery, voice and notifications

`LOW` · mobile · effort M

**What.** The approval-mode switch is reachable only via a deep Settings screen with no inline modal, and approval policy is not surfaced where plugins and connectors are managed. There is no flagged-message model-switch fallback, no Auto/On-demand/Always-available tool-loading strategy setting, no cloud/agent browser settings (site approval default, cookie clearing), and no 'Connector discovery' auto-suggest toggle. Voice settings lack a Language row (speech language is editable only mid-session), a voice model/intelligence tier, a 'Start app with Voice' launch preference, a persona carousel and a dictation dictionary. Notifications settings has no 'Product updates' opt-in. Connector OAuth uses openBrowserAsync so there is no domain-consent dialog or callback, and there is no Acceptable Use Policy link or version-anchored legal popover. Location has no status row in Data controls, and there are no composer text-behaviour or context-window preferences.

Also recorded by a later audit (MS-17 Per-site browser permissions — decided, not yet built): MS-17 is a founder-approved Build item scoped specifically to the real in-app browser path, which sharpens MOB-36's generic 'cloud browser' settings-gap line into a concrete deliverable.

**Done when.** Surface approval policy at the point of use, add the missing voice, notification and legal rows, switch connector OAuth to openAuthSessionAsync, and either build the tool-loading/cloud-browser/connector-discovery settings or drop them from the roadmap.

**Where.** `apps/mobile/app/(app)/settings/auto-approve.tsx`, `apps/mobile/src/features/settings/voice/index.tsx`, `apps/mobile/src/features/settings/notifications/index.tsx:57-88`, `apps/mobile/src/features/settings/cloud-connectors/index.tsx:790-801`

**From.** audit/ui-gaps.md (GAP-158, GAP-170, GAP-172, GAP-173, GAP-174, GAP-175, GAP-180, GAP-182, GAP-183, GAP-184, GAP-310, GAP-312, GAP-313, GAP-314, GAP-318, GAP-319); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-170/180: Approval-mode switch buried; not surfaced with plugins/connectors; GAP-172: No flagged-message model-switch fallback; GAP-173: No tool-loading strategy setting; GAP-174: No cloud/agent browser settings; GAP-175: No 'Connector discovery' auto-suggest toggle; GAP-158: No 'Product updates' notification opt-in; GAP-182/183/184/314: Voice settings lack launch preference, language row, model tier, persona carousel; GAP-318: Connector OAuth uses openBrowserAsync with no domain-consent dialog; GAP-319: No Acceptable Use Policy link or version-anchored legal popover; GAP-310: Location has no status row in Data controls; GAP-312/313: No composer text-behaviour or context-window preferences

### MOB-37 — Mobile has no in-app feature-announcement or education pattern for capability rollouts

`LOW` · mobile · effort S

**What.** Greps for whats-new / announcement / release-notes / promo / introducing across apps/mobile return no matches, so there is no reusable full-screen or dismissible sheet to introduce a new capability, and no Cowork-specific announcement screen. The onboarding hero also uses a bare brand glyph rather than layered device art showing the payoff, there is no top-level 'Remote' entry point in primary navigation, and remaining usage is surfaced only on a dedicated screen rather than any nav or menu.

**Done when.** Build one dismissible announcement component keyed by capability id and reuse it for capability rollouts; surface remaining usage in the drawer.

**Where.** `apps/mobile/app/(public)/onboarding.tsx:52-67`, `apps/mobile/src/features/drawer/components/DrawerContent.tsx`

**From.** audit/ui-gaps.md (GAP-148, GAP-149, GAP-152, GAP-302, GAP-304, GAP-305, GAP-308)

**Folded in.** GAP-148/149/152: No feature-announcement sheet or education pattern; GAP-304: No Cowork-specific mobile announcement screen; GAP-302: Onboarding hero uses a bare brand glyph; GAP-305: No top-level 'Remote' entry point in primary navigation; GAP-308: Remaining usage not surfaced in any nav or menu

### MOB-39 — Mobile declined-capability decisions recorded to prevent re-raising

`LOW` · mobile · effort S · **wontfix**

**What.** Explicit product decisions with stated rationale: inline approval-policy picker declined because Mobile is not the policy authority; interactive plugin installation and a Plugins drawer destination declined while the marketplace is preview-only with no account-bound lifecycle; the code-session diffstat card declined because the cited surface was removed; scheduled tasks explicitly disclose prompt-only context and take no attachments; trusted-contact enrolment and automatic escalation declined without a verified consent and safety service; account storage quota totals declined until the Cloud publishes an enforceable byte policy; background voice declined with foreground-only capture now enforced and explained; background connector scanning for suggested tasks declined under the request-scoped source policy; model-training opt-in declined because customer-content training is always off; paired Desktop folders remain Desktop-controlled; and unsupported project/usage/marketing notification categories declined until delivery producers exist.

**Done when.** No action; re-open only if the underlying authority, lifecycle or service is built.

**Where.** `apps/mobile/lib/v1FeatureFlags.ts`

**From.** audit/ui-gaps.md (GAP-019, GAP-024, GAP-025, GAP-027, GAP-029, GAP-032, GAP-036, GAP-043, GAP-044, GAP-045, GAP-047, GAP-048)

**Folded in.** GAP-019; GAP-024; GAP-025; GAP-027; GAP-029; GAP-032; GAP-036; GAP-043; GAP-044; GAP-045; GAP-047; GAP-048

### MOB-40 — Mobile has no medical/health profile or HealthKit integration despite audit expectations

`LOW` · mobile · effort S · **wontfix**

**What.** Greps for condition, medication, family history, medical record, HealthKit, Apple Health, AFib and blood glucose across apps/mobile find no feature files — the only matches are removal comments. A previous audit also confirmed the store listing falsely declared HealthKit collection for a feature that was removed, and that has been corrected.

Also recorded by a later audit (MS-1 Apple Health vertical — decided, not yet built): Direct contradiction of MOB-40's 'wontfix' status: MS-1 is recorded as a founder-approved Build item in the 2026-08-01 scope decisions, requiring a HealthKit plugin plus entitlements (an external gate), and the 2026-08-05 Class-1 status lists HealthKit among mobile's remaining external-gated items. The wontfix classification should be re-examined against that decision.

**Done when.** No action; the capability is deliberately absent. Keep the store declaration free of HealthKit claims.

**Where.** `apps/mobile/__tests__/ios-store-submission-config.test.ts:60-63`

**From.** audit/ui-gaps.md (GAP-140, GAP-145); DPDP_PROGRESS.md (third-pass verified-and-fixed); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-140: No medical conditions / health profile feature; GAP-145: No Apple Health / HealthKit integration

### MOB-50 — Pre-drawer sidebar implementation (7 files) is fully superseded and dead on Mobile

`LOW` · mobile · effort S

**What.** DEAD-CODE-017: repo-wide grep for imports from @/src/features/sidebar returns zero hits outside the directory itself; live navigation is entirely DrawerContent.tsx. Already flagged in known-flaws.md as a safe-to-action cleanup item.

**Done when.** Delete apps/mobile/src/features/sidebar/.

**Where.** `apps/mobile/src/features/sidebar/`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-017; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-017

**Folded in.** Mobile pre-drawer sidebar implementation (7 files) is fully superseded and dead

### MOB-51 — Mobile widget-setup screen has no navigation entry point anywhere

`LOW` · mobile · effort S

**What.** DEAD-CODE-018: the screen is a correctly-honest Siri-Shortcuts how-to (it makes no false widget-availability claim), and the route is registered but hidden (options={HIDDEN}). No router.push/href to /widget-setup exists anywhere in the drawer, settings or onboarding flows. Narrower and route-specific compared with MOB-31's settings-IA sweep.

**Done when.** Add a single Settings row ('Siri Shortcuts setup') linking to /widget-setup, or delete the route and component if v1.1 widget work isn't imminent.

**Where.** `apps/mobile/app/(app)/widget-setup.tsx`, `apps/mobile/src/features/widget-setup/index.tsx`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-018; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-018

**Folded in.** Mobile widget-setup screen has no navigation entry point

### MOB-53 — MS-6 location capability (expo-location, coarse-location preference, excluded from Local Mode) decided but not built

`LOW` · mobile · effort M

**What.** parity-implementation-matrix.md 2026-08-01 Founder Scope Decisions, MS-6: founder-approved Build item — expo-location plus a coarse-location preference, strictly excluded from Local Mode — with no implementation recorded.

**Done when.** Implement per MS-6 with the Local-Mode exclusion enforced at the capability gate, or record the decision to drop it.

**From.** docs/current/parity-implementation-matrix.md MS-6

### SEC-74 — Chrome extension scheduled-task origin check fails open for legacy pre-origin-stamp tasks — the only fail-open branch in an otherwise fail-closed provenance gate

`LOW` · security · effort S

**What.** DEAD-CODE-021 (audit/parity-2026-08-15). shouldExecuteScheduledTask() returns true unconditionally when task.createdByOrigin is falsy, commented 'legacy task pre-stamp; permit', in a codebase where every other provenance gate fails closed.

**Done when.** Add a one-time migration stamping createdByOrigin on any existing task missing it, then flip the fallback to fail-closed (return false) so an unstamped task is auto-deleted rather than silently permitted.

**Where.** `apps/extension/src/background/policy.ts:727-732`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code (DEAD-CODE-021)

### SEC-86 — Chrome extension site allowlist has no default-permission policy — only a static approved-sites list with no stated behavior for sites not on it

`LOW` · security · effort S

**What.** settings-06-gap (competitive-gap-2026-08-15). apps/extension/src/options.ts:1056-1087,1163 renders an 'Approved sites' allowlist with an Add control, but no default-policy control (Always ask / Always allow / Never) governs what happens on a site that is not listed. Distinct from SEC-63 (extension requests all-URLs/debugger/cookies permissions with no in-product disclosure).

**Done when.** Add an explicit default-permission setting so the allowlist reads as an override on a stated, fail-closed default.

**Where.** `apps/extension/src/options.ts:1056-1087,1163`

**From.** audit/competitive-gap-2026-08-15/domains/settings (settings-06-gap)

### UI-53 — Chrome extension send-button tooltip claims a Cmd+Enter shortcut that does not exist

`LOW` · ui · effort S

**What.** COMPOSER-007: the send button title is 'Send (Cmd+Enter)' but the only keyboard handler sends on plain Enter with no modifier; a grep for Cmd+Enter/metaKey/ctrlKey+Enter in side_panel.ts returns exactly one hit — the tooltip string itself.

**Done when.** Either implement Cmd/Ctrl+Enter as an additional send trigger (matching web) or correct the tooltip to describe the real Enter-to-send binding.

**Where.** `apps/extension/src/side_panel.ts:9340-9349,9374-9391`

**From.** audit/parity-2026-08-15 — COMPOSER-007; audit/parity-2026-08-15 COMPOSER-007

**Folded in.** Chrome extension send-button tooltip advertises a Cmd+Enter shortcut that does not exist
