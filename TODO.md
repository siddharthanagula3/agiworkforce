# Anthropic Applications Parity TODO

Status: Current
Owner: Platform lead
Last updated: 2026-06-21 (post R27-PARITY Phase D complete — 5 stages shipped).

This is the active checklist for the transition described in `PLAN.md`. Keep it short enough to operate from daily; move evidence and long analysis to `audit/anthropic-apps-parity/`.

## 2026-07-08 Monorepo Restructure — active queue (P0 done; see docs/plans/monorepo-restructure-2026-07-08.md)

- [ ] **P1 dead code:** dead TS provider packages (`providers-{deepseek,lmstudio,perplexity,xai}`, zero importers — deferred from P0 only because pruning touches `pnpm-lock.yaml` carrying in-flight work), dormant `packages/stores` chat store, orphaned `apps/web/src/` tree, stale `next.config.ts` chat-SPA comment + `VITE_BUILD_TARGET` build line + `build-with-chat.sh` path, visual-verification round archiving (coordinated with the round-17/18 e2e specs).
- [ ] **P2 one TS ai-client:** collapse gateway `llm.ts`+`cloudChat.ts` onto `packages/providers`; move web's three LLM endpoints onto the v1 pattern and retire `apps/web/lib/llm-providers/`; publish one browser-safe SSE client for mobile/extensions.
- [ ] **P3 UI layering:** web adopts `@agiworkforce/ui` (delete its 39 private primitives); `unified-chat` consumes `ui`+`design-tokens` (drop the `--chat-*` fork and no-op Tooltip); promote one markdown/code/tool-call renderer set; collapse web's 4 message lists.
- [ ] **P4 Rust engine:** desktop adopts `agiworkforce-execpolicy`; extract `agiworkforce-llm`/`agent-core`/`mcp` crates from desktop+CLI; desktop links `protocol`; wire dormant ts-rs codegen into `packages/types`; rename `crates/sandbox-policy` dir.
- [ ] **P5 data:** derive web row types from cloud-contracts; gateway onto a real RLS client (`SVC-GATEWAY-RLS-NOOP-01`); shared sync-apply engine + contract fixtures.
- [ ] **P6 mobile multimodal + native path:** ship Qwen3-VL-2B-Instruct (primary, Apache 2.0, llama.rn mmproj) and/or LFM2-VL-1.6B (RN-executorch tier 2); resolve root `ios/` vs prebuild divergence (`MOBILE-IOS-PREBUILD-DRIFT-01`); decide dormant health-context client (HealthKit re-implementation is a tracked product gap).
- [ ] **P7 enterprise Local/self-hosted (founder, 2026-07-08):** offline licensing package (signed license files, seats), signed org policy schema in suite-contracts enforced by trust-kernel guards, SSO/SCIM identity binding without cloud chat routing, local audit export, self-hosted gateway profile. Design doc first; sequence after P2. See plan §7 P7.

## 2026-06-21 Deferred — tackle AFTER the P2 sync engine ships

- [ ] **BILL-01 — Agentic credit reconciliation.** Reconcile metered agent/compute usage against the credit ledger so managed-cloud agentic runs can't under-bill or double-spend credits (a revenue-leak risk at scale). **Sequencing decision (founder, 2026-06-21):** intentionally deferred until after the P2 cross-device sync engine is built — it does NOT gate the current P2 objective, but must land before managed-cloud agentic billing is exposed at scale. Scope when picked up: per-run usage→ledger reconciliation, idempotent debit on retries/partial runs, and a drift audit between `usage_events`/metering and `token_credits`/`credit_transactions`.

## 2026-06-03 Demo-Readiness Audit Wave 1 - Read-Only Findings

Scope: verified by reading implementation, not by accepting keyword counts as evidence. This wave covers the demo-critical website chat and marketing paths, CLI, desktop direct/chat tool paths, mobile v1 gates, Chrome extension bridge, and VS Code extension public setup. Code implementation is intentionally paused until the implementation plan is approved.

### Blocker and high-priority findings

- [x] **F01 - packages/types/src/models.json:39** - RESOLVED 2026-06-24 (not a bug). `gpt-5.5` is a REAL, current OpenAI model — verified against OpenAI's official API docs (model ID `gpt-5.5-2026-04-23`, "OpenAI's newest frontier model", with a `gpt-5.5-pro` variant; docs page developers.openai.com/api/docs/models/gpt-5.5). GPT-5.5 shipped ~2026-04-23, so the 2026-06-03 docs-check that flagged it as hallucinated was itself out of date. `models.json` is canonical and correct per CLAUDE.md; no change needed. Entry retired so two governed sources no longer disagree on a live default model ID.
- [ ] **F02 - apps/web/features/chat/components/dialogs/CloudUpgradeWaitlistDialog.tsx:155** - Incomplete wiring / overconfidence. The modal says the waitlist request is tied to the signed-in AGI account email, but `apps/web/app/api/waitlist/cloud-managed/route.ts:15` explicitly documents an unauthenticated signup and `apps/web/app/api/waitlist/cloud-managed/route.ts:76` stores only email/source timestamps. Require Clerk auth when account-bound signup is intended, store `user_id`, and keep anonymous signup copy separate if it remains supported.
- [ ] **F03 - apps/web/features/chat/components/messages/MessageBubble.tsx:656** - Schema mismatch / faulty reasoning. The renderer treats `metadata.searchResults` as an object with `query`, `results`, and `sources`, but `apps/web/stores/chatStore.ts:44` types it as a flat array and `apps/web/lib/hooks/useChatStream.ts:604`-`615` stores a flat array. Search citations can disappear even when the backend sends results. Normalize one metadata shape and update both writer and renderer.
- [ ] **F04 - apps/web/components/agi/AgiChatDemo.tsx:17** - Implementation theater / product drift. The marketing hero script claims source reading, Rust implementation, and "Compiling clean"; the header labels the scripted animation as `live` at `apps/web/components/agi/AgiChatDemo.tsx:100`. Either make the panel run a real demo call or label it as illustrative and remove compile/source claims.
- [ ] **F05 - apps/web/app/mobile/page.tsx:44** - Product drift / unsupported mobile claims. The marketing page claims broad on-device AI coverage, Image Q&A, OCR, 60+ language translation, HealthKit, Hindi validation, and skills at `apps/web/app/mobile/page.tsx:63`-`80`, while the mobile runtime gates cloud/BYOK/agents/dispatch/search/computer-use/image-gen/sync off in `apps/mobile/lib/v1FeatureFlags.ts:23`-`71`. Align the public page to the actual v1 local-only demo, or implement and verify each claim.
- [ ] **F06 - apps/mobile/lib/pinning.ts:56** - Security / launch blocker. Mobile TLS pins are placeholder strings, and `apps/mobile/lib/pinning.ts:188`-`192` warns that pinned-host requests fail closed while placeholders remain. Provision real SPKI pins before any public mobile demo that touches cloud hosts, or disable cloud-host claims for mobile v1.
- [ ] **F07 - apps/mobile/lib/dispatchHmac.ts:61** - Agent/security failure. Transitional dispatch mode accepts unsigned messages until the 2026-06-05 cutoff documented at `apps/mobile/lib/dispatchHmac.ts:67`. Close this before demonstrating dispatch or hide dispatch on mobile; the current v1 flags already set `dispatch: false`.
- [ ] **F08 - apps/desktop/src-tauri/src/sys/commands/llm.rs:152** - Desktop runtime wiring risk. `llm_send_message` requires `RateLimitState`, and `apps/desktop/src-tauri/src/sys/commands/mcp.rs:888` requires the same state for `mcp_call_tool`, but the Tauri setup scan of `apps/desktop/src-tauri/src/lib.rs:226`-`1110` shows many `app.manage(...)` registrations and no `RateLimitState` registration. Register the state before relying on those IPC commands.
- [ ] **F09 - apps/web/app/security/page.tsx:95** - Security / compliance overclaim. The page claims row-level security on every table and no service-role keys on user-data paths; `apps/web/app/security/page.tsx:104` claims TLS 1.3 and HSTS preload; `apps/web/app/security/page.tsx:115` claims signed/notarized macOS DMG. `apps/web/app/trust/page.tsx:20`-`24` also marks GDPR/CCPA "Compliant." These are acquisition/diligence-sensitive claims and must either be backed by current evidence artifacts or softened.

### Medium and low findings

- [ ] **F10 - apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:422** - Dead button. The collapsed sidebar search button has no `onClick`, while the expanded button opens the dialog at `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:699`-`703`. Wire the collapsed button to the same state.
- [ ] **F11 - apps/web/features/chat/components/Composer/ChatComposerNew.tsx:217** - Incomplete feature. Incognito state only toggles an existing active conversation; the button title at `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1197` promises starting an unsaved incognito conversation, but `apps/web/features/chat/pages/WebChatPage.tsx:330`-`340` creates a persisted conversation on first send. Either support pre-send temporary conversations or hide/disable the control until a conversation exists.
- [ ] **F12 - apps/web/features/chat/pages/WebChatPage.tsx:345** - Partial file handling. Non-image attachments are reduced to metadata with no file content, while `apps/web/features/chat/pages/WebChatPage.tsx:390` keeps local-to-BYOK handoff disabled. Do not present browser file/tool chat as complete until text/PDF/code file ingestion is wired or clearly scoped.
- [ ] **F13 - apps/web/features/chat/pages/WebChatPage.tsx:653** - Incomplete retry/regenerate. Regenerate resends only `content`, `model`, and `conversationId`, dropping original attachments, search/thinking/style/skill metadata, and tool intent. Preserve turn metadata or disable regenerate for turns with unsupported metadata.
- [ ] **F14 - apps/web/features/chat/stores/autoEconomyTrialStore.ts:6** - Config drift. The website trial limit and input cap are duplicated client-side, while `apps/web/lib/services/auto-economy-trial-service.ts:7`-`10` defines server-side model/limit/output/input caps. Centralize these values or expose them through server headers/config to prevent mismatched limits.
- [ ] **F15 - apps/web/components/layout/Header.tsx:38** - Branding drift. Public header renders `agi.workforce`, and `apps/web/components/marketing/MarketingFooter.tsx:56` plus `apps/web/components/marketing/MarketingFooter.tsx:104` still use the longer brand. The locked naming plan says public brand is `AGI`; make the prominent product mark AGI while keeping domain/internal names where needed.
- [ ] **F16 - apps/cli/src/lib.rs:1206** - CLI incomplete feature. `--include-partial-messages` is accepted but bails as not implemented, and `apps/cli/src/lib.rs:1213`-`1219` does the same for `--input-format stream-json`. Either implement these SDK-style modes or remove/label the flags from public help.
- [ ] **F17 - apps/cli/src/cli_options.rs:86** - CLI incomplete wiring. Headless permission mode is documented as "Wired in the next session" and unused. Implement SDK control-channel permission decisions or remove the dead helper/comment.
- [ ] **F18 - apps/cli/src/cloud.rs:104** - Cloud feature not wired. `cloud_exec` validates the model and then bails at `apps/cli/src/cloud.rs:123`-`127` because cloud execution is private beta. Keep CLI cloud copy as waitlist-only until the backend contract exists.
- [ ] **F19 - apps/desktop/src-tauri/src/sys/commands/llm.rs:232** - Desktop tool-path confusion. Direct `llm_send_message` builds `LLMRequest` with `tools: None` at `apps/desktop/src-tauri/src/sys/commands/llm.rs:240`, while the real chat tool path builds tools in `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs:289`-`305` and executes streamed tool calls in `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs:632`-`655`. Make the UI/demo use `chat_send_message` for tools, or explicitly label direct LLM calls as non-tool chat.
- [ ] **F20 - apps/extension-vscode/package.json:691** - Config/docs drift. Inline completions default to `true`, while `apps/extension-vscode/README.md:45`-`50` says the default is `false`. Align docs and package defaults.
- [ ] **F21 - apps/extension-vscode/README.md:36** - Public flow drift. README claims cloud sign-in in the sidebar header, but `apps/extension-vscode/package.json:771`-`774` says provider-stream requires AGI account web auth that is not wired, and `apps/extension-vscode/src/extension.ts:252`-`255` still points users to API key setup. Update copy or wire sign-in.
- [ ] **F22 - apps/extension/manifest.json:3** - Branding and permission review. The Chrome extension still says "AGI Workforce" and declares broad permissions at `apps/extension/manifest.json:8`-`20` plus all http/https content scripts at `apps/extension/manifest.json:31`-`39`. Document a least-privilege demo story before presenting it as public-ready.
- [ ] **F23 - apps/extension/src/background.ts:1297** - Agent action review needed. Browser action messages like click, scroll, hover, drag/drop, and form operations forward to the content script at `apps/extension/src/background.ts:1314`. Confirm sender validation, pairing, and human approval gates before demoing autonomous browser actions.
- [ ] **F24 - apps/extension/src/pairing.ts:93** - Incomplete bridge dependency. Extension pairing requires a desktop `/pair` endpoint and enters error if unavailable at `apps/extension/src/pairing.ts:101`-`102`. Confirm desktop bridge availability before making Chrome part of the main pitch flow.

### Verified clean in this wave

- No high-confidence BOLA/IDOR issue found in inspected web chat conversation routes: `apps/web/app/api/chat/conversations/route.ts:21`-`55`, `apps/web/app/api/chat/conversations/[id]/route.ts:27`-`54`, `apps/web/app/api/chat/conversations/[id]/messages/route.ts:23`-`62` all require current user and filter by `user_id`.
- No wildcard production CORS issue found in inspected CORS helper: `apps/web/lib/cors.ts:60`-`103` uses exact allowlists plus pinned Tauri/local-dev handling.
- No CSRF secret fail-open found in inspected CSRF helper: `apps/web/lib/csrf.ts:25`-`35` requires `CSRF_SECRET`, and `apps/web/lib/csrf.ts:151`-`164` uses fixed-length timing-safe comparison.
- CLI core file/tool execution is real in inspected paths: dispatcher supports read/write/list/search/edit/run/apply-patch at `apps/cli/src/features/exec/tools/mod.rs:100`-`169`; file writes validate paths and require read-before-write freshness at `apps/cli/src/features/exec/tools/file_ops.rs:383`-`403`, then use approval at `apps/cli/src/features/exec/tools/file_ops.rs:405`-`446`.
- CLI local model discovery is real in inspected paths: Ollama and LM Studio are probed in parallel at `apps/cli/src/local_models.rs:63`-`75`, and configured local base URLs are restricted to safe HTTP local URLs at `apps/cli/src/local_models.rs:321`-`324`.

## 2026-05-22 R25 — Failure-Mode Verification Sweep (close-out)

7-lane parallel verification of R18-R24 commits against failure modes
11-17. Full synthesis archived at `docs/archive/2026-06-05-doc-reset/docs/audit/2026-05-22-r25-summary.md`.

- [x] V1 cli orphan-tree salvage — ~118 files removed, tui module ownership rule locked (`c8f5f95b9` + `e3a316d39` + `5c4e623c1` + `1960799ad`)
- [x] V2 model-ID drift — 4 corrections + 8 regression tests (`20bdd9cba`)
- [x] V3 cost-tracker E2E test — 7/7 pass both OpenAI shapes (`a48158798`)
- [x] V3 toOtelAttributes wire-up — gen_ai.\* attributes now emit in production (`36d39ae9e`)
- [x] V4 BYOK env-key-status + waitlist NEGATIVE tests — 38 tests, no leaks (`91068d33a`)
- [x] V5 desktop sync silence + privacy migration coercion (`8d225f81a`)
- [x] V6 random-sample failure-mode audit — severity histogram + 8-item R26 list (`a1f79472a`)
- [x] V7 desktop ToolCallCard dedup — 4 consumers migrated (`12f00467f`)
- [x] R25 synthesis (`9b80e801f`)

## 2026-05-23 R27-PARITY — Phase D close-out

R27 Phase D landed all 5 stages on origin/main (42 commits, 137 files, +14267/-808):

- [x] Stage 0 — Cloud-bridge foundation (Neon migration + RPC + canonical `InviteCodeModal` + 4 surface ports)
- [x] Stage 1 — 6 P0 release blockers (boot hang, mobile billing → InviteCodeModal, CLI hooks 33 events, 49 Color literals tokenized, web stale IDs)
- [x] Stage 1.5 — Cleanup (BYOK 3-way gate, i18n on 4 components/61 keys, scrim token + 6 sites)
- [x] Stage 2 — Desktop sidebar UpdatePill + Help menu for in-app updater
- [x] Stage 3 — 7 CI gate scripts (AP-02 through AP-10)
- [x] Stage 4 — P1 parity batch across all 6 surfaces (~25 items)

CI gates added (all on origin/main):

- [x] `check:marketing-models` — AP-03 model-ID drift (web)
- [x] `check:hook-fire-sites` — AP-07 (cli, 32 variants verified)
- [x] `check:no-hex-mobile` — AP-02 (627 grandfathered)
- [x] `check:no-hex-web` — AP-02 (70 violations, continue-on-error)
- [x] `apps/extension check:no-hex` — AP-02 (0 violations)
- [x] `apps/extension check:no-cloud-ipc` — AP-10 (0 violations)
- [x] `apps/extension-vscode check:vscode-theme-tokens` — AP-02 (37 grandfathered)
- [x] `check:hardcoded-arrays` — AP-08 (1 finding flagged)
- [x] `check:lock-drift` — AP-09 (9 advisory, non-blocking)

## R28 Deferred backlog (next round candidates)

Multi-day features explicitly deferred from Stage 4:

- [ ] **W2a-03 — Cowork mode UI** (major new desktop surface)
- [ ] **W2a-04 — Code mode UI** (major new desktop surface)
- [ ] **W2b-04 — Artifact creation wizard** (7-category picker + guided question flow)
- [ ] **W2c-06 — PDF artifact renderer** (9th renderer type)
- [ ] **W2b-03 — Notify-when-done banner** during long-running generation
- [ ] **W2b-10 — Connectors directory** (expose 49 coming-soon connectors)
- [ ] **W3-PUSH-BACKEND** — Mobile push notification backend endpoint
- [ ] **W1-WEB-00C i18n follow-up** — verify Spanish runtime rendering end-to-end

R27 cleanup carryovers (incremental future PRs):

- [ ] Mobile `scripts/.no-hex-baseline.json` — 627 grandfathered (10 scrim-shaped annotated)
- [ ] Web 70 pre-existing color literals (continue-on-error CI; cleanup pass needed)
- [ ] VS Code 37 grandfathered hex literals in webview HTML

## 2026-05-22 R26 — Remediation Backlog

From V6's 8-item list + cross-lane patterns. Priority-ordered.

- [ ] **R26-1** Module-graph reachability CI check (Rust + TS). Asserts every `.rs` file under `apps/*/src/` has a `mod`/`pub mod` declaration reachable from `lib.rs`/`main.rs`, and every `.ts`/`.tsx` file under `apps/*/src/` resolves from the production entry point. Closes failure mode #11 across all 6 surfaces.
- [ ] **R26-2** Consolidate `apps/web/lib/llm-providers/openai.ts` (fetch-based, used by `/api/llm/v1`) + `packages/providers/openai/` (SDK-based, used by CLI/desktop via `@agiworkforce/llm-normalize`) into one canonical adapter. R22 audit identified; V3 confirmed still drifting.
- [x] **R26-3** Hash `cloud_managed_waitlist.email` and ensure the public signup path uses a strict non-default rate-limit bucket. Closed by `20260528000000_hash_cloud_managed_waitlist_email.sql`, `0026_hash_cloud_managed_waitlist_email.sql`, shared waitlist hashing, active waitlist client endpoint wiring, and dedicated `waitlist` rate-limit verification.
- [ ] **R26-4** Pre-commit subject-vs-payload classifier hook — warn when `docs(...)` or `chore(...)` ships >100 LOC of non-doc files. Catches commit-classifier drift (V6 saw `docs(visual-verification):` shipping 2,360 LOC of mobile feature code).
- [ ] **R26-5** Verify every model ID in `packages/types/src/models.json` against provider catalogs (extends V2 to all 8 providers). Add `source_doc_date` field to track verification staleness.
- [x] **R26-6** Audit every iframe-rendering chat component for `sandbox` attribute. Start with `ArtifactThumbnailCard` (V6 finding). Closed by sandboxing the remaining dynamic eval-viewer PDF iframes and adding the dynamic iframe regression scan.
- [ ] **R26-7** Clarify or fix `toOtelAttributes`' `codex.usage.total_tokens` semantic — does it intentionally exclude `cacheReadInputTokens`, or is that a bug? V6 documentation gap.
- [ ] **R26-8** Re-audit all R18-R22 commits touching CLI surface for orphan-tree pattern. V6 extrapolation: ~20 of 54 commits may carry similar issues.
- [ ] **R26-9** Rename contradictory test case in `apps/web/lib/llm-providers/__tests__/openai-cache.test.ts` (V6 minor).
- [ ] **R26-10** Push the 65-commit window to `origin/main` so cloud CI handles heavy verification. Per new operating rule: local CLI reserved for `~/Desktop/reference/`-touching work; verification + builds go to cloud.

## 2026-05-21 Suite Transformation Session — Round 10 (in progress)

Closes the PLAN.md section 5 task "Define project schema." Types-first cross-surface contract slice for the Projects feature — same pattern as SendPreviewPresentation / GeneratedFilePresentation: shared TYPES, hosts adopt in later slices.

- [x] Extend `ProjectRecord` with instructions, defaultModelId, knowledgeFileCount, memberCount, lastUsedAt, iconEmoji, accentColor, importedFrom (all optional, non-breaking)
- [x] Add companion types: ProjectMember, ProjectMemberRole, ProjectKnowledgeFile, ProjectInstructions, ProjectAccentColor, ProjectImportSource
- [x] Add `summarizeProjectHeader()` + `normalizeProjectAccentColor()` + `projectMemberRoleLabel()` helpers
- [x] Shared `ProjectHeader` component in `@agiworkforce/unified-chat` consuming `ProjectHeaderPresentation` — `98749e432`
- [x] Desktop `ProjectsView.tsx` adopts `<ProjectHeader />` (first host adoption) — `dbc87d8cc`
- [x] Mobile RN-native `ProjectHeader` mirror — `bd0f487bf`
- [x] Rust mirror of project schema in `crates/agiworkforce-protocol` — `14942c481`
- [x] VS Code + Chrome SOURCE_SURFACE anchors with sync-rule assertion — `ebc9b2672`
- [x] Visual-verification debt discharged for Web (playwright spec + 6 PNGs + 2 findings JSON + docs/visual-verification/README.md) — `5a70bd734`
- [x] 4 DOM-snapshot tests for shared primitives in @agiworkforce/unified-chat — `5a70bd734`
- [x] 59 new tests across types (15) + unified-chat (15) + mobile (8) + protocol (13) + extensions (8)

### Visual-verification findings — 2026-05-21

These need follow-up but were surfaced BY the visual-verification slice, which proves the workflow works:

- [x] /projects: dark-mode text nearly invisible (`var(--text-1)` heading + `var(--text-3)` description against black background). High severity — accessibility. Fixed in `651b4e016`.
- [x] / home: CSP violations blocking inline scripts and open-dyslexic CDN font. Resolved in `1cab133f1` by removing the broken @font-face rules (the font never actually loaded — CSP blocked it). Self-hosting the OFL-licensed binary under `apps/web/public/fonts/` remains a follow-up for whoever prioritizes the dyslexia-friendly feature; the inline comment in `globals.css` documents the path.

All six surfaces now have visual-verification coverage:

- Web: PNG capture + DOM snapshots (`5a70bd734`, `651b4e016`)
- Desktop: PNG capture via cloud-web bundle (`b7c0f56ff`)
- Mobile: RN tree snapshots (`bd0f487bf` + `9528e57ec`)
- VS Code: webview HTML snapshots (`46fb492cf`)
- Chrome: static HTML snapshots (`46fb492cf`)
- CLI: no UI (covered by Rust unit tests)

### Backend round-10 — landed `bf499e57d`

- [x] Neon migration completes the cross-language project schema (TS + Rust + Postgres now match).
- [x] `project_members` + `project_knowledge_files` tables with RLS + denormalized count triggers.

Applied through the canonical Neon migration path before promoting to shared environments.

## 2026-05-21 Suite Transformation Session — Round 9 (in progress)

Closes the PLAN.md section 6 task: "Add Chrome and VS Code bridge status to connector hub." Developer-surface transport health (Chrome native messaging + VS Code websocket bridge) is now first-class inside the consumer connector hub.

- [x] Promote `ExtensionStatusDiagnostics` to `@agiworkforce/api` canonical type
- [x] Build Desktop `BridgeStatusCard` (Chrome + VS Code rows derived from `extension_status`)
- [x] Wire `BridgeStatusCard` into `ConnectorGallery` above the status filter pills

8 new vitest tests pin every state path (connected / connecting / error / disconnected / token-invalid / fetch-failure / refetch).

## 2026-05-21 Suite Transformation Session — Round 8 (~58h, 12 commits)

Closes the PLAN.md section 5 task: "Add visible 'what will be sent' previews for cloud/BYOK turns." A privacy-critical UX gap that matches Claude/OpenAI parity AND reinforces AGI's local-first stance. HEAD `3625a68af`.

- [x] `summarizeSendPreview` helper + `SendPreviewInput`/`SendPreviewPresentation` types — `dd419e5b4`
- [x] Shared `SendPreview` web component (`@agiworkforce/unified-chat`) — `dd419e5b4`
- [x] Web `WebChatPage` adopts SendPreview above composer — `885523e87`
- [x] Mobile RN-native `SendPreview` mirror + chat tab adoption — `c103d72a9`
- [x] Desktop chat shell adopts SendPreview above `ChatInputArea` — `3625a68af`
- [x] Web composer attachments stamp per-file privacy chip — `44ab9d0c4`
- [x] Desktop OAuth token expiry + refresh UX (PLAN section 6 closed) — `e98fcda68`
- [x] Desktop + Mobile per-file privacy chip on attachments — `8d5b3b6cb`

All three Local-mode surfaces (Web/Mobile/Desktop) now share the same `SendPreviewPresentation` contract. 28 new tests (11 types + 10 unified-chat + 7 mobile). Per-file privacy chip threaded from `SendPreviewPresentation` into Web's `ChatComposerNew` via new `attachmentPrivacyShortLabel` prop. Desktop `OAuthConnectorCard` shows token expiry with color-coded badge + optional explicit refresh button.

## 2026-05-21 Suite Transformation Session — Round 7 (~50h, 13 commits)

After the round-6 handoff at `b1c2bb428`, an additional autonomous loop closed two top-10 P0 gaps end-to-end and shipped three host-adoption slices for a new shared primitive. HEAD `9409e954e`.

- [x] ArtifactPanel live preview (HTML sandboxed iframe + React delegation + run/stop) — `fe22c59cb`
- [x] VS Code extension composer drag-drop + paste-image wire — `b0578ce9f`
- [x] Chrome extension side-panel composer drag-drop + paste-image — `8fec8a0b5`
- [x] ArtifactPanel edit-in-place via onSaveEdit callback — `d1d8bbc2f`
- [x] Shared GeneratedFileCard component for compute-session outputs — `faa457419`
- [x] Web ArtifactPreview adopts shared GeneratedFileCard — `d8c65c795`
- [x] Mobile RN-native GeneratedFileCard + ArtifactFullScreen adoption — `01caaf77d`
- [x] Desktop InlineDocumentGeneration adopts shared GeneratedFileCard — `9409e954e`

EXEC-SUMMARY-r2 P0 #3 (composer drag-drop, 39h) and P0 #9 (Artifacts: versioning + publish + live preview + edit-in-place, 186h) are now fully shipped at the shared-package level. ArtifactPanel and ArtifactPanel edit-in-place have zero host consumers yet; GeneratedFileCard now has three (Web ArtifactPreview header + Mobile ArtifactFullScreen + Desktop InlineDocumentGeneration). All three Local-mode surfaces (Web/Mobile/Desktop) now share the same generated-file provenance contract.

## 2026-05-21 Suite Transformation Session — Shipped (~165h, 25 commits)

Branch `fix/extension-typecheck-and-c02-sync-2026-05-20`, HEAD `5ff6b26d4`. Historical per-commit trace + remaining ~3,613h inventory moved to `docs/archive/2026-06-05-doc-reset/docs/plans/2026-05-21-suite-transformation-handoff.md`.

- [x] Mobile v1 local-only blank-screen launch fix (auth-guard + login redirect + handleUnrecoverableAuth) — `f6d6eeac8`
- [x] `packages/unified-chat` shadcn token aliases for 6 consumers — `a84fae8a3`
- [x] `packages/unified-chat` composer drag-drop + paste-image + thumbnail strip — `669f342e5`
- [x] Chrome ext site allowlist popup section (P0 #5) — `aa3edc0e2`
- [x] `packages/types` attachment validation + SignedUploadRequest/Response contract (P0 #4) — `84a7cb417`
- [x] `packages/unified-chat` SettingsShell + MemoryEditor + useMemoryStore (P0 #6 + #8) — `385623d6b`
- [x] Web `/settings/memory` page mounting shared MemoryEditor — `9ca923385`
- [x] Desktop settings dialog Memory tab — `a6d4fe04d`
- [x] VS Code `agi-workforce.memory` QuickPick — `58938d12d`
- [x] Web `/settings/profile` + `/connections` + `/privacy` + `/notifications` + 2 docs/decisions — `b81cc377d`
- [x] `packages/unified-chat` ProjectCard + ProjectGallery + strict-mode fixes — `51b20c865`
- [x] Chrome ext pendingAttachments wire fix (P0 #3 chrome-side) — `38034fedb`
- [x] `packages/unified-chat` ArtifactPanel version-stepper toolbar (P0 #9 first slice) — `7d0f9ecd2`
- [x] Web theme persistence via next-themes — `eb375f84b`
- [x] Web profile sync to managed user metadata — `5630924d7`
- [x] Web `/projects` route mounting shared ProjectGallery — `34f33169e`
- [x] `packages/types` `assertSurfaceCanSyncChats` runtime guard + test — `3c9f57d48` + `1b8617b13`
- [x] `packages/unified-chat` ArtifactPanel handlePublish portable snapshot — `b1c2bb428`

## Active Now

- [x] Create root `PLAN.md` as the current transition control plane.
- [x] Create root `TODO.md` as the active transition checklist.
- [x] Lock AGI Workforce as an OpenAI/Anthropic-style application suite, not just a chat app or CLI.
- [x] Record local-first, explicit BYOK, multi-provider, privacy-controlled managed compute as the core differentiation.
- [x] Add official OpenAI/Anthropic suite research evidence for the locked thesis.
- [x] Add pre-release repo organization plan for folder/file naming, ownership, docs, root cleanup, and team onboarding.
- [x] Add LLM-operability layer so coding agents can find repo maps, risk areas, known flaws, and canonical commands.
- [x] Start parallel exploration tracks for AGI surfaces, local references, and docs organization.
- [x] Add CLI Local/BYOK/Managed privacy mode foundation.
- [x] Add `/privacy-mode` and `/continue-with-byok`.
- [x] Expand CLI slash palette to 83 commands.
- [x] Create `audit/anthropic-apps-parity/` evidence folder.
- [x] Add Anthropic official feature ledger.
- [x] Add AGI surface file inventory.
- [x] Add local reference architecture/license notes.
- [x] Add cross-surface parity matrix with owner paths.
- [x] Update `docs/README.md` to point to `PLAN.md` as the active transition plan.
- [x] Complete full `reference/src` read pass and record coverage in `audit/anthropic-apps-parity/reference-notes.md`.
- [x] Lock chat sync to Web/Mobile/Desktop only.
- [x] Add Anthropic/OpenAI application baseline ledger.
- [x] Add OpenAI/Anthropic/Vercel SDK strategy ledger.
- [x] Add Claude/ChatGPT compute, computer-use, and generated-file architecture ledger.
- [x] Consolidate current docs into compact `docs/current/` source-of-truth layer.
- [x] Archive former top-level PRD, roadmap, pricing, architecture, scaling, handoff, and strategy docs under `docs/archive/2026-05-21-docs-consolidation/`.
- [x] Replace the oversized root `AGI_WORKFORCE.md` with an LLM-readable current entry point and archive the legacy long version.
- [x] Lock naming conventions for product names, CLI command names, root control docs, file/folder names, package/crate names, branches, commits, versions, and release artifacts.
- [x] Make `agi` the primary CLI command while keeping `agiworkforce` as the compatibility alias.
- [x] Add Husky hook policy and `pnpm check:hooks` so commit, pre-commit, and pre-push gates stay wired.
- [x] Move the living audit fire log from root `AUDIT_LOG.md` to `audit/audit-log.md`.
- [x] Remove stale root/mobile Expo `app.json` files and enforce `apps/mobile/app.config.js` as canonical.
- [x] Begin per-file AGI audit ledger by surface, starting with CLI and shared engine files.
- [x] Lock the long-term agent-native development thesis for AGI Workforce.
- [x] Implement first enterprise control-plane wave: shared contracts, canonical migrations, API gateway routes, Web admin readiness page, docs, and provisional CODEOWNERS.
- [x] Promote Desktop chat artifact cards into the persistent artifact workbench, with legacy preview fallback only when a panel-backed artifact cannot be resolved.
- [x] Add Desktop multi-artifact `Download all` handling for Claude-style batch artifact responses.
- [x] Tighten the Desktop artifact workbench toolbar around Claude-style preview/source switching, artifact title/type context, refresh, and primary actions.
- [x] Convert Desktop tool activity from bulky tool cards to the Claude-style compact event rail with action-specific icons and completed-run summaries.
- [x] Convert Desktop inline web search output to compact Claude-style favicon/title/domain result rows while preserving citations.
- [x] Add shared `ChatExecutionMode`, `ChatIntent`, connector status, permission decision, and suite tool-event contracts.
- [x] Fix the VS Code sidebar model picker so the pill opens a real inline model popover backed by extension-host model data.
- [x] Add Mobile v1 remote-chat guard so Local Mode + Local LLMs cannot silently upload attachments or stream through remote BYOK/managed APIs.
- [x] Implement Mobile v1 local-first Claude-style shell: composer-first chat, Local Mode toggle, locked Cloud Managed waitlist affordances, and drawer navigation for Chat, Artifacts, Code, Projects, Skills, and local utilities.
- [x] Convert Mobile model selection to the local LLM catalog with local auto modes, locked Cloud Managed rows, and persisted cloud-selection cleanup.
- [x] Add Mobile local model preparation/readiness state, selected-model local runtime resolution, ExecuTorch preset install records, and local token streaming in chat.
- [x] Add Mobile Artifacts gallery for received artifacts with loading skeleton, preview modal, copy, and native share.
- [x] Add Mobile Code Sessions list/detail/archive surfaces that hand off execution to AGI Desktop or future Cloud Managed instead of running code locally.
- [x] Add Mobile feature READMEs and regression coverage for local mode, model selection, drawer/settings IA, add-to-chat gating, Artifacts, Code Sessions, and waitlist behavior.

## Exploration Tasks

- [ ] CLI: audit `apps/cli/src` end to end for Claude Code parity and engine contracts.
- [ ] Desktop: audit `apps/desktop/src` and `apps/desktop/src-tauri` for Claude Desktop/artifacts/connectors parity.
- [ ] Mobile: audit `apps/mobile` for local-first/BYOK onboarding and Claude Mobile parity.
- [ ] Web: audit `apps/web` for Claude Web/projects/artifacts/account/waitlist parity.
- [ ] VS Code: audit `apps/extension-vscode` for IDE-native Claude Code parity.
- [ ] Chrome: audit `apps/extension` for browser connector/research parity.
- [ ] Shared packages: audit `packages/*` for common contracts that should become source of truth.
- [ ] Rust crates: audit `crates/*` for engine/runtime/protocol contracts.
- [ ] Services: audit `services/*` and `apps/web/db/neon/` for future managed cloud readiness.
- [x] References: audit `reference/src`, `codex-cli`, `claw-code`, `openclaw`, `opencode`, and `gemini-cli` for reusable patterns.
- [x] References: read all 1902 scoped files in `/Users/siddhartha/Desktop/reference/src`.
- [ ] References: verify root/license status for `claw-code` and `reference/src` before any reuse beyond architecture.
- [ ] Evidence: convert targeted AGI surface findings into per-file audit rows.

## Pre-Release Repo Organization Tasks

- [x] Create root file classification ledger.
- [x] Create hidden AI/tool folder ledger for `.claude`, `.codex`, `.cursor`, `.opencode`, `.agents`, `.agent`, `.minimax`, `.superpowers`, `.remember`, and `.playwright-mcp`.
- [x] Create docs status ledger: current, superseded, archive, scratch, or generated.
- [x] Create package/service/crate README coverage ledger.
- [x] Create generated artifact policy.
- [x] Create full package/service/crate ownership ledger and CODEOWNERS map.
- [x] Decide root `ios/` belongs at root for tracked Xcode-consumed output, with `apps/mobile/native/ios` for custom native modules.
- [x] Move raw `reference-index/` under `docs/archive/2026-06-05-doc-reset/audit/repo-organization/reference-index/` as historical evidence.
- [x] Move root scratch markdown files to a dated archive/report folder.
- [x] Move root scratch image files to a dated report folder.
- [x] Move root `downloads/` scratch artifact to the dated archive/report folder.
- [x] Move root reference catalog markdown files to `docs/reference/`.
- [x] Move historical root master plan and implementation log to `docs/archive/`.
- [x] Untrack local-only generated files while leaving them on disk for the current machine.
- [x] Add root clutter allowlist check.
- [x] Add docs status header check for active plans.
- [x] Add import-boundary lint so apps cannot import apps, services cannot import UI packages, and packages cannot import apps.
- [x] Add locked naming convention doc and enforce the primary `agi` CLI command in structure checks.
- [x] Add hook wiring guardrail to `pnpm check:llm-operability`.
- [x] Add canonical `docs/agent-context/` with repo map, risk map, command map, doc-status map, bug-finding guide, and known-flaws ledger.
- [x] Make root `AGENTS.md` the canonical tool-neutral coding-agent entry point.
- [x] Convert `CLAUDE.md` into a Claude-specific mirror of `AGENTS.md`.
- [x] Align Claude, Codex, and opencode tool-specific agent entrypoints around root `AGENTS.md` and `docs/agent-context/`.
- [x] Retire stale root `opencode.json` and validate `.opencode/opencode.json` instruction and command file references.
- [x] Add `pnpm check:agent-context`, `pnpm check:repo-organization`, `pnpm check:boundaries`, and `pnpm check:llm-operability`.
- [x] Add `pnpm check:workspace-scripts` so root/package scripts cannot reference missing concrete workspace filters.
- [x] Add contract READMEs for tracked hidden tool folders and require tracked `.agents/skills/*` directories to include `SKILL.md`.
- [x] Document the nested `apps/web/pnpm-workspace.yaml` adapter and guard the documentation.
- [x] Grade current monorepo developer-friendliness and record path to A+.
- [x] Commit repo-organization script fix and monorepo grade report.
- [x] Add or update README files for each shared package.
- [x] Add P0/P1 README ownership files for Web, Desktop, Chrome extension, API gateway, signaling server, types, runtime, providers, and unified-chat.
- [x] Add provisional `.github/CODEOWNERS` routed to founder/platform ownership.
- [ ] Replace provisional `.github/CODEOWNERS` owner with real GitHub teams/handles after org ownership names are available.
- [x] Make `apps/web/features` the canonical Web product-domain root and remove the remaining `apps/web/src/features` split.
- [x] Add `pnpm check:structure-conventions` for Web feature-root, retired docs folder, and backslash-path naming drift.
- [x] Expand `CONTRIBUTING.md` into a real engineering workflow guide.
- [x] Add PR templates by change type.
- [x] Normalize `docs/plans` vs `docs/planning` and archive superseded plans.
- [x] Create `docs/marketing/`.
- [x] Create `docs/support/`.
- [x] Create `docs/legal/`.
- [x] Execute the Web `src/features` -> `features` consolidation from `docs/plans/domain-first-reorg.md`.
- [x] Complete the Mobile waitlist pilot cleanup by migrating callers to `apps/mobile/src/features/waitlist` and removing old waitlist barrels.
- [x] Start the Mobile projects domain by moving `ProjectCard` into `apps/mobile/src/features/projects`.
- [x] Start the Mobile billing domain by moving `UpsellCard` into `apps/mobile/src/features/billing`.
- [x] Move the Mobile schedules domain into `apps/mobile/src/features/schedules` and remove old schedule component/service/store paths.
- [x] Require ownership READMEs for every top-level Web, Mobile, and Desktop feature folder.
- [x] Remove the duplicate CLI release workflow and enforce the canonical `release-cli.yml` / stable `v-cli-*` artifact contract.
- [x] Retire legacy database migration roots with `pnpm check:neon-migrations` so new migrations can only land in `apps/web/db/neon/`.
- [x] Add report-retention READMEs and `pnpm check:report-retention` for `reports/` and `audit/reports/`.
- [x] Add `pnpm check:ci-guardrails` for the CI baseline and explicit Semgrep advisory debt.
- [x] Add `pnpm check:codeowners` for provisional CODEOWNERS coverage before real GitHub teams exist.
- [x] Move the Mobile billing service into `apps/mobile/src/features/billing`.
- [x] Move the first Desktop small-domain wave into `apps/desktop/src/features`: quick query, voice, simple mode, subscription, pricing, planning, reminders, messaging, mobile companion, teams, terminal, tools, vision, and workflows.
- [x] Move Mobile component-heavy domains into `apps/mobile/src/features`: agents, auth, chat, companion, connectors, drawer, edge cases, image, integrations, messaging, model picker, onboarding, paywall, settings, sidebar, and voice.
- [x] Move Mobile voice and messaging services/state into their feature domains and guard the old service/store paths.
- [x] Move Mobile model-picker state, model catalog service, and provider-switch guard into `apps/mobile/src/features/model-picker`.
- [x] Move Mobile project state into `apps/mobile/src/features/projects`.
- [x] Move Mobile integration state and device/HealthKit integration services into `apps/mobile/src/features/integrations`.
- [x] Move Mobile image generation, OCR, and vision services into `apps/mobile/src/features/image`.
- [x] Move Mobile auth state, age gate, and biometric gate into `apps/mobile/src/features/auth`.
- [x] Move Mobile subscription tier state into `apps/mobile/src/features/billing`.
- [x] Move Mobile memory state, import, context budgeting, compaction, and RAG services into `apps/mobile/src/features/memory`.
- [x] Move Mobile skills catalog service and installed-skill state into `apps/mobile/src/features/skills`.
- [x] Move Desktop Settings and MCP domains into `apps/desktop/src/features/settings` and `apps/desktop/src/features/mcp`.
- [x] Move Desktop Unified Agentic Chat into `apps/desktop/src/features/chat`.
- [x] Move Desktop execution, execution sidecar, memory, memory panel, and tool-calling domains into `apps/desktop/src/features`.
- [x] Move Desktop artifacts, browser, canvas, computer-use, connectors, marketplace, research, and skill-marketplace domains into `apps/desktop/src/features`.
- [x] Complete the Desktop component-domain migration: `apps/desktop/src/components` now contains only shared UI primitives.
- [ ] Continue Mobile domain ownership by moving remaining feature-specific hooks/services/stores out of layer-first roots when a domain has a clear owner.
- [x] Execute Desktop component-domain moves into `apps/desktop/src/features` from `docs/plans/domain-first-reorg.md`.

## Agent-Native Development Tasks

- [x] Add external and local-reference evidence for agentic development as the expected future workflow.
- [x] Add `PLAN.md` rules for agent-native repo design.
- [x] Add path-scoped agent rules for high-risk surfaces after root cleanup.
- [x] Add agent task templates for exploration, implementation, review, and verification.
- [x] Add worktree/session isolation guidance for parallel AGI development.
- [x] Add CI enforcement for docs and LLM-operability checks on docs-only changes.
- [x] Add debt-aware README ownership coverage enforcement for apps, packages, crates, and services.
- [x] Add debt-aware generated artifact drift check.
- [x] Tighten README ownership check after README coverage is created.
- [x] Tighten generated artifact check after root scratch and `.playwright-mcp` debt are moved.
- [x] Tighten current-doc metadata check after adding required status headers.
- [x] Add machine-readable parallel-agent lane map for 15+ writer agents.
- [x] Add shared-file collision policy for manifests, locks, root docs, CI, schemas, migrations, and native projects.
- [x] Add `pnpm check:lane-ownership` and include it in `pnpm check:llm-operability`.
- [x] Enforce lane `blockedPaths` and wildcard lane patterns in `pnpm check:lane-ownership`.
- [x] Add parallel-agent PR template and playbook.
- [x] Add autonomous feedback-to-patch software-company roadmap.
- [x] Add Claude Code at-scale harness rollout rules for context, hooks, skills, plugins, LSP/MCP, and subagents.
- [x] Add service-layer architecture rules for action/route orchestration vs reusable operational mechanics.
- [x] Add `pnpm check:service-layer` and include it in `pnpm check:llm-operability`.
- [x] Add opencode command templates and adapter instructions so opencode agents load the canonical repo rules without duplicating durable context.
- [x] Add `pnpm check:mobile-hygiene` for Mobile feature ownership, frozen root hooks/lib imports, and UI direct-I/O drift.
- [x] Add lane-contract sections to scoped `AGENTS.md` files and enforce them through `pnpm check:agent-context`.
- [x] Add CLI subagent v2 runtime snapshots so future visual agent managers and orchestration surfaces can inspect model, status, prompt, and execution metadata.
- [x] Extract repeated API gateway UUID validation into `services/api-gateway/src/validations/ids.ts`.
- [x] Add 100 delegated research prompts for the agentic company operating model.

## Autonomous Company Tasks

- [x] Document the long-term feedback -> triage -> issue -> agent patch -> PR -> release -> customer update loop.
- [x] Define canonical customer feedback schema and persistence tables.
- [ ] Add support intake API shared by Web/Desktop/Mobile.
- [ ] Add message-level feedback persistence for app chat surfaces.
- [ ] Build feedback-to-GitHub issue bridge with dedupe, severity, owner lane, and privacy scrub.
- [ ] Add agent patch queue with lane selection, worktree isolation, evidence bundles, and human approval gates.
- [ ] Add verification artifact store for screenshots, logs, test output, and reproduction metadata.
- [x] Add release-fix links so customer feedback can be closed by release notes and in-app notifications.
- [ ] Evaluate Fin/Zendesk-style support agents, Vapi-style voice intake, and internal runbooks before managed support launch.

## CLI Engine Tasks

- [x] Claude-style tool alias canonicalization.
- [x] `/add-dir` workspace-root handling.
- [x] `/files` context attachment.
- [x] Claude migration import for prompts/skills/agents/hooks/settings/MCP.
- [x] Shared TUI/REPL Claude-parity dispatcher.
- [x] Local privacy guard before cloud/BYOK sends.
- [x] Custom slash commands from `.agiworkforce/commands` and imported `.claude/commands`.
- [x] MCP prompts as dynamic slash commands.
- [x] Full `/agents` management UI in TUI/REPL.
- [x] Hook matcher compatibility with Claude tool names.
- [x] Honor `PreToolUse` block/stop/`updated_input` decisions for task subagents, parallel tool batches, and sequential tools.
- [x] Make CLI command permission rules manageable from `/permissions`, match full commands before program fallbacks, and retain session approvals for the running process.
- [x] Persist output style and privacy mode in project-local settings.
- [x] Define typed CLI event stream for future Desktop/Web/Mobile clients.
- [x] Define durable session/fork/replay contract for parent and child sessions.
- [x] Split CLI tool declarations from executors with schema, diagnostics, permissions, and owner metadata.
- [x] Apply CLI allowed/disallowed tool filters consistently across one-shot, REPL, and TUI sessions.
- [x] Route CLI plan-mode mutation gates through the central tool catalog and restore mutable tools after plan approval.
- [x] Move CLI tool-filter policy aliases into the central tool catalog.
- [x] De-duplicate provider tool schema serialization and test that local metadata stays client-side.
- [x] De-duplicate the CLI slash-command built-in catalog so the shared registry crate is the single source of truth.
- [x] Render REPL and TUI slash-command help from the shared command registry.
- [x] Wire `--mcp-config` and `--strict-mcp-config` into TUI, REPL, one-shot, and `exec` MCP loading.
- [x] Add CLI tool catalog to runtime dispatcher contract tests.
- [x] Add `agi doctor --json` covering runtime deps, auth, sandbox, MCP, plugins, model access, writable state dirs, stale branches, and transport health.
- [x] Make `/doctor` reuse the same diagnostic report core as `agi doctor`.
- [x] Test that every registered slash command has runtime behavior in both TUI and REPL.

## Cross-Surface Product Tasks

- [x] Define suite-level product requirements for Web, Desktop, Mobile, CLI, VS Code, and Chrome using the locked application-suite thesis.
- [x] Define shared `PrivacyMode` contract for Desktop/Mobile/Web/VS Code/Chrome.
- [x] Add visible Local/BYOK/Managed labels to every surface.
  - [x] Add canonical shared display-copy helpers for Local/BYOK/Managed and provider execution labels.
  - [x] Consume the shared display-copy helpers in primary Web, Desktop, Mobile, VS Code, and Chrome tier/provider/onboarding/meter surfaces.
  - [x] Replace remaining narrative hardcoded mode copy where it represents an active UI label, not marketing prose.
- [x] Define `ProviderMode`: `Local`, `DirectByok`, `ManagedGateway`, `ManagedNative`.
- [x] Define `ChatExecutionMode`: `local_only`, `byok`, `cloud_managed`.
- [x] Define shared `ChatIntent`, connector status, permission decision, and suite tool-event contracts.
- [x] Add provider capability matrix for Responses, Chat Completions, reasoning, tools, native tools, vision, files, structured output, server state, and ZDR compatibility.
- [x] Lock latest Claude desktop modal references as the UI baseline and apply the first Desktop settings modal pass with search and grouped navigation.
- [x] Convert Desktop file preview to the shared focused modal shell matching the verified Claude project-file preview pattern.
- [x] Add focused Desktop project edit-details modal for the verified Claude project edit pattern.
- [x] Define synced app conversation schema for Web/Mobile/Desktop.
- [x] Define separate developer session schema for CLI/VS Code/Chrome.
- [x] Define Desktop/local-host remote-control schema for Mobile approvals, notifications, generated-file preview, and task steering.
- [x] Define explicit developer-session handoff schema into synced app chats.
- [x] Add Local -> BYOK fork flow on Desktop.
- [x] Add Local -> BYOK fork flow on Mobile.
  - [x] Replace placeholder Mobile mode-switch modal with shared secret-scan and payload-preview gate.
  - [x] Persist the confirmed Mobile handoff as a new forked conversation instead of only changing the active model.
  - [x] Prevent Mobile Local -> BYOK forks from cloning original Local messages; the fork stores only the accepted redacted preview payload with hash evidence.
- [x] Add Local -> BYOK fork flow on Web.
- [x] Add payload preview and secret scan UI before BYOK handoff.
  - [x] Add shared Local -> BYOK draft builder with redacted payload preview, findings, checksums, and preview hash evidence.
  - [x] Wire the shared preview/finding result into Desktop, Mobile, and Web handoff UI.
    - [x] Desktop conversation action.
    - [x] Mobile mode-switch modal.
    - [x] Web conversation/model handoff.
- [x] Define shared project schema.
- [x] Define shared artifact schema.
- [x] Define shared `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` schemas.
- [x] Define shared `ComputerAction` protocol for screenshot/action computer use.
- [x] Define connector/MCP registry schema.
- [x] Define agent/subagent schema.
- [x] Define cross-surface data ownership for projects, artifacts, memory, teams, and billing.
- [x] Migrate allowed legacy duplicate local contracts to canonical `packages/types/src/suite-contracts.ts` imports.
  - [x] Move Web/Mobile `web_conversations` / `web_messages` compatibility sync types into `@agiworkforce/types`.
  - [x] Move or rename duplicate MCP config contracts.
  - [x] Move or rename duplicate computer-use session/action contracts.
- [x] Mount API gateway `agents` and `mcp` routes.
- [x] Replace desktop hook stats placeholder with real stats or visible unsupported state.
- [x] Replace VS Code managed-plan usage stub with real usage-source reporting.
- [x] Fix VS Code sidebar inline model picker crash and add webview regression coverage.
- [x] Fail Mobile remote chat closed while v1 Local Mode + Local LLM flags are active.
- [x] Finish Chrome native host installer automation, including Windows.
- [x] Fix docs drift found by surface audit: CLI MCP transports, desktop onboarding paths, outdated HMAC comments.

## Compute And Generated Artifact Tasks

- [x] Research public Claude and ChatGPT/OpenAI behavior for computer use, code execution, generated files, downloads, and artifact previews.
- [x] Record AGI implementation implications in `audit/anthropic-apps-parity/compute-artifacts-2026-05-20.md`.
- [x] Extend shared artifact contracts so artifacts can reference native generated files and preview derivatives.
- [x] Convert Desktop document creation tools into generated-file manifest producers.
- [x] Wrap `packages/browser-tool` behind the shared `ComputerAction` protocol.
- [x] Add local compute-session work directories with manifest, TTL metadata, checksum, and audit events.
- [x] Add shared generated-file presentation helpers and first-pass Desktop/Web/Mobile status, preview, download, share, source, checksum, and privacy labels.
- [x] Mount the Web chat artifact workbench in the active chat route and sync detected/generated artifacts into its sidecar store.
- [x] Render Web chat server-tool activity in the active assistant message path through the compact tool timeline and persist completed tool metadata.
- [x] Add Desktop focused custom remote MCP connector modal and single-source the connector gallery owner component.
- [ ] Add Web/Mobile/Desktop generated-file request, status, preview, download, share, source session, and privacy-label UI.
- [ ] Add Mobile generated-file delegation path to Desktop/local host or future Managed compute instead of requiring local on-device heavy generation.
- [x] Add provider-container adapter for OpenAI Code Interpreter-style generated file annotations.
- [x] Add Local-mode tests proving generated files are not uploaded.
- [x] Add BYOK-mode tests proving file transfer requires explicit preview and approval.
- [x] Add Managed-mode tests for TTL, quota, owner, checksum, retention, and deletion metadata.

## Provider SDK Tasks

- [x] Research current OpenAI official SDK, OpenAI Responses, OpenAI Agents SDK, Vercel AI SDK, and Vercel AI Gateway guidance.
- [x] Record decision that SDKs are adapter/UI-edge dependencies, not AGI runtime architecture.
- [x] Make `packages/providers/openai` prefer Responses for native OpenAI endpoints when capability metadata supports it.
- [x] Keep Chat Completions fallback for OpenAI-compatible providers and legacy proxy surfaces.
- [x] Add tests proving OpenAI `store: false` remains default for Local/BYOK turns.
- [x] Add tests proving Vercel AI Gateway is unreachable unless provider mode is explicitly Managed.
- [x] Add Web AI SDK event-to-AGI-event adapter.
- [x] Consolidate `openai`, `@anthropic-ai/sdk`, `ai`, and `@ai-sdk/*` versions after adapter tests exist.

## Cloud Later

- [x] Keep managed cloud waitlisted/private beta.
- [x] Design usage ledger and provider-price table.
- [ ] Design quota reservation/settlement.
- [ ] Design chargeback/refund/dispute handling.
- [x] Prefer invoice/ACH for enterprise managed credits.
- [ ] Revisit Stripe/card top-ups only after fraud and margin model is finished.

## Documentation Rules

- [x] `PLAN.md` is the current strategy.
- [x] `TODO.md` is the current work queue.
- [x] `CHANGELOG.md` records each completed implementation/exploration slice.
- [x] `docs/` stores durable specs and surface guides.
- [x] `tasks/` stores execution logs and historical working notes.
- [x] `audit/` stores evidence ledgers and generated inventories.
- [x] Archive superseded top-level docs instead of adding new competing docs.
- [ ] Continue moving any newly discovered stale historical docs to archive or updating them to point at `docs/current/`.
