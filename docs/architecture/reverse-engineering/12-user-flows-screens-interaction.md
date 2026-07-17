# 12. User Flows, Screens, Layouts & Interaction Patterns

Status: Current
Owner: Founder + platform lead
Last updated: 2026-07-10

This file completes the master-plan-required sections that areas 1–11 only touch tangentially: **user flows · screens · layouts · interaction patterns**. It is reverse-engineered from the current claude.ai / ChatGPT apps (via `/Users/siddhartha/Desktop/reference/claude_reference/`, 127 screenshots, and `docs/research/claudeai-component-spec-2026-07-10.md`) and mapped onto real routes/components in this repo. Where a screen or flow is not yet built, it is marked Gap.

Contamination warning (carried from area 9 / the component spec): some `claude_reference` screenshots show Perplexity Comet browser chrome overlaid on claude.ai — do not treat "Open in Comet"/"Ask Gemini" affordances as parity requirements.

## 12.1 Primary screens (reverse-engineered → our route/component)

Grounding: **code** = route/component confirmed by inspection; **flagged** = matrix/master plan marks it Partial/Gap.

| Screen                                                                                          | Reference                                                                              | Our implementation                                                                          | Status                                                 |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Sign-in / sign-up                                                                               | `044_web-free__login-page.png`                                                         | `apps/web/app/sign-in`, `apps/web/app/sign-up` (Clerk)                                      | Done (code)                                            |
| Empty chat / new chat                                                                           | claude.ai/ChatGPT centered composer                                                    | `apps/web/app/chat`, `apps/web/features/chat/components/Composer`, `.../GreetingBanner`     | Partial — composer parity in flight (master plan)      |
| Active conversation (streaming)                                                                 | claude.ai thread                                                                       | `.../features/chat/components/messages`, `.../Main`, `ChatStream` (unified-chat)            | Partial (flagged)                                      |
| Artifact split-pane viewer                                                                      | `094_web-max__artifact-viewer-split-pane.png`, `095_..._artifact-copy-export-menu.png` | `.../features/chat/components/artifacts`, `unified-chat` `ArtifactPanel`/`ArtifactRenderer` | Partial — artifact-viewer parity IN PROGRESS this wave |
| Artifacts grid page                                                                             | `038_web-free__artifacts-grid-page.png`                                                | `unified-chat` artifact store gallery                                                       | Partial (flagged)                                      |
| Web search result                                                                               | `035_web-free__web-search-result.png`                                                  | `.../features/chat/components/search/SearchResults.tsx`                                     | Partial — live search non-functional (audit)           |
| Deep research panel + sources trace                                                             | `096_web-max__research-panel-sources-trace.png`, `120_..._research-sources-panel.png`  | `.../features/chat/components/research/ResearchPanel.tsx`                                   | Partial → Gap — backend wiring unverified              |
| Reasoning / thinking expanded                                                                   | `108_web-max__project-chat-reasoning-expanded.png`                                     | `unified-chat` `ThinkingBlock.tsx`                                                          | Partial                                                |
| Projects                                                                                        | claude.ai/ChatGPT projects                                                             | `apps/web/app/projects`, `unified-chat` `ProjectGallery`/`ProjectCard`                      | Partial                                                |
| Settings IA (general/privacy/memory/security/usage/byok/voice/connections/capabilities/profile) | `049_web-free__settings-language-selector.png`                                         | `apps/web/app/settings/*` (subroutes confirmed)                                             | Partial — IA incomplete (matrix)                       |
| Connector permissions / detail                                                                  | `138_..._connectors-gmail-permissions.png`, `164/167/168_..._connector-*`              | desktop `features/connectors`, `packages/tools/mcp`                                         | Partial                                                |
| Skills customize                                                                                | `139_web-max__customize-skills-humanizer.png`                                          | `.../features/chat/SkillsMenu`, `packages/tools/skills`                                     | Partial                                                |
| Upgrade / plans                                                                                 | `024_web-free__upgrade-plans.png`, `085_web-max__upgrade-plans-team-enterprise.png`    | `.../InlinePaywallCard.tsx`, billing routes                                                 | Partial                                                |
| Incognito / temporary chat                                                                      | `043_web-free__incognito-chat-mode.png`                                                | temporary-chat state in chat store                                                          | Partial                                                |

## 12.2 Core user flows

Each flow is described as reverse-engineered from the competitor, then mapped to the repo path that owns it, with the honest end-to-end status.

### Flow A — New chat → streamed answer

1. User lands on `apps/web/app/chat` empty state (centered composer + greeting).
2. Types prompt; composer builds a typed request carrying mode/provider label (`features/chat/components/Composer`).
3. Request hits the byte-stable v1 contract `apps/web/app/api/llm/v1/chat/completions/route.ts` (area 3).
4. SSE stream frames tokens → `unified-chat` `ChatStream` renders incrementally (area 4).
5. Message actions (copy/retry/regenerate) via `ActionBar`.

Status: **Partial** — path is live and documented; composer parity + persisted lifecycle (retry/continue/cancel) still in flight (master plan §5).

### Flow B — Tool call → result

1. Model requests a tool → inline tool card (`InlineToolCall.tsx`) shows running state.
2. Tool loop executes (`crates/agiworkforce-*` for CLI/desktop; v1 route for web).
3. MCP tools gate on approve→resume (area 3).
4. Result collapses into the audit trail (`StatusTrail.tsx`).

Status: **Partial** — shared UI + loop live; cross-surface stop semantics open.

### Flow C — Artifact creation → view/edit

1. Model emits artifact → live content streams into `artifactStore` (area 4).
2. Small artifacts inline; larger open the split-pane panel (`ArtifactPanel`) — inline-vs-panel switch is the parity target (`094_...split-pane.png`).
3. Copy/export menu (`095_...copy-export-menu.png`); version chip.

Status: **Partial** — live-streaming done; viewer parity IN PROGRESS.

### Flow D — Local → BYOK explicit handoff (AGI-owned, not a competitor pattern)

1. User forks a Local chat to BYOK → `LocalByokHandoffDialog.tsx` (unified-chat).
2. Context selection + secret scan + payload preview + consent + provider label (locked trust-boundary rule).

Status: **Partial (shared)** — dialog exists; this is an AGI differentiator, not reverse-engineered.

### Flow E — Web search / deep research

1. User toggles web search (persistent composer toggle) → `web-search-handler.ts` → `app/api/search/route.ts`.
2. Results render as cards with citations (`SearchResults.tsx`, `CitationPill.tsx`).
3. Deep research escalates to multi-step panel (`ResearchPanel.tsx`) with a sources trace.

Status: **Partial → Gap** — live web search currently non-functional (audit); deep-research backend unverified. Do not demo as working.

## 12.3 Layout system

Reverse-engineered layout invariants (from the component spec + reference), mapped to where they are enforced:

- **Single-column thread with optional right sidecar** (artifact/research panel) — not multi-tab. Enforced by `unified-chat` `ChatInterface` + the locked "single chat" rule (area 9). Desktop follows the same single-window model ([[feedback-desktop-single-tab-architecture]] in memory; area 7).
- **Composer is one row, no overflow**, tools in a `+` plus-menu — the claude.ai composer parity target (master plan §UX; `docs/research/claudeai-component-spec-2026-07-10.md`).
- **Left sidebar**: recents / projects / search (`.../features/chat/components/Sidebar`).
- **Settings**: left-nav sub-route shell (`apps/web/app/settings/*` — one route per section).
- Design tokens + primitives owned by `@agiworkforce/ui` (area 8); per-surface adaptation rules in area 7.

## 12.4 Interaction patterns

| Pattern            | Reverse-engineered behavior                             | Our owner                                           | Status                             |
| ------------------ | ------------------------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| Message actions    | Assistant actions always-visible; user actions on hover | `ActionBar.tsx`, `MessageBubble.tsx`                | Partial (composer-parity wave)     |
| Model switch       | Latest + Effort/More-models flyouts                     | `unified-chat` `ModelSelector.tsx`, `modelStore.ts` | Partial                            |
| Plus-menu          | Files / tools / connectors / skills                     | composer plus-menu                                  | Partial (flagged)                  |
| Stop / cancel      | Stop button → interrupted state                         | `ChatInterface.tsx` cancel                          | Partial — persisted interrupt = §5 |
| Retry / continue   | Regenerate; continue generation                         | `ActionBar`, `ChatInterface`                        | Partial — persisted = §5           |
| Keyboard shortcuts | Command palette / shortcuts                             | `KeyboardShortcutsDialog.tsx`                       | Partial                            |
| Rewind / branch    | Conversation branch/rewind                              | `RewindTimeline.tsx`, `BranchNavigator.tsx`         | Partial                            |
| Citation hover     | Source pill → span mapping                              | `CitationPill.tsx`                                  | Partial                            |

## 12.5 Platform-specific screen adaptations

Cross-reference area 7 (platform adapters). Same flows, different shells:

- **Desktop** (`apps/desktop` Tauri) — single window + folder selection + Local/Cloud modes; consumes `unified-chat` `ChatInterface`. Desktop shell adoption for the _web_ routes is DEFERRED (master plan remaining-duplication §1); desktop Cloud mode is "coming soon" (DCL-1…4, area 9).
- **Mobile** (`apps/mobile` Expo/RN) — Local + Cloud only (no BYOK); RN parity onto shared chat core is UNVERIFIED (master plan §6).
- **CLI** (`apps/cli` Rust/Ratatui) — REPL/TUI, slash commands, hooks; shares the Rust engine crates.
- **VS Code / Chrome** — side-panel adaptations; capability verification is a later wave (§6).

## 12.6 What's grounded vs flagged

- Screen inventory, flows A–E, layout invariants, interaction patterns: **grounded in real routes/components** (paths confirmed by inspection) — status honestly downgraded where the master plan / live audit flags Partial/Gap.
- Deep research working end-to-end, live web search, artifact-viewer parity, desktop/mobile parity: **flagged** — code scaffolding exists but not verified end-to-end. See area 11 for the per-capability status-of-record.

## 12.7 Verification note

Screens/flows/patterns were read at branch `chore/repo-restructure-2026-07` (HEAD `751877973`). Route paths (`apps/web/app/*`) and components (`apps/web/features/chat/components/*`, `packages/ui/unified-chat/src/components/*`) were confirmed by directory listing/grep; reference screenshots are cited by filename from `/Users/siddhartha/Desktop/reference/claude_reference/`. Status labels reconcile the 2026-07-10 master plan against the 2026-06-27 matrix (newer wins). Re-verify before treating any status as current.
